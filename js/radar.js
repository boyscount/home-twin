// แท็บเรดาร์: ดึงตำแหน่งสิ่งมีชีวิตจากฉาก 3D (ในอนาคตคือ mmWave / PIR / กล้อง AI)
// เมื่อมี "คน" ที่ไม่ใช่คนในบ้านเข้าเขตรั้ว → ถ่ายหน้า → แจ้งเตือนมือถือ → กด รู้จัก / ไม่รู้จัก
import { bus, toast, store, nowStr } from './bus.js';
import { Telegram } from './telegram.js';

const CENTER = { x: 0, z: 5 };          // จุดติดตั้งเรดาร์ (หน้าบ้าน)
const PERIMETER = { x0: -46, x1: 48, z0: -24, z1: 36 }; // เขตรั้ว
const ZONES = [
  { name: 'บ้าน', x0: -10, x1: 4, z0: -5, z1: 9 },
  { name: 'โรงรถ', x0: 10, x1: 18, z0: 2, z1: 9 },
  { name: 'คอกหมู', x0: 24, x1: 36, z0: -6, z1: 2 },
  { name: 'เล้าไก่', x0: 26, x1: 34, z0: 14.5, z1: 21.5 },
  { name: 'ไฮโดร', x0: -32, x1: -20, z0: -4, z1: 16 },
  { name: 'สวนยาง', x0: -30, x1: 30, z0: -155, z1: -17 },
  { name: 'บ่อปลา', cx: 14, cz: 22, r: 4.6 },
];

export class Radar {
  constructor(canvas, farm) {
    this.cv = canvas; this.ctx = canvas.getContext('2d'); this.farm = farm;
    this.visible = false;
    this.sweep = 0;
    this.range = 60;
    this.blips = new Map();   // id → {x,z,seen,type,...}
    this.tracked = new Map(); // id → สถานะการแจ้งเตือนของคนแต่ละคน
    this.alerts = new Map();  // tag → การแจ้งเตือน (อยู่ต่อแม้คนเดินออกไปแล้ว เผื่อครอบครัวตอบทีหลัง)
    this.tg = new Telegram();
    this.known = store.get('knownFaces', []);
    this.stats = { alerts: 0 };
    this.notifCount = 0;
    this.logEl = document.getElementById('eventLog');
    this.listEl = document.getElementById('targetList');
    this.phoneEl = document.getElementById('phoneNotifs');
    this.renderKnown();
    this.setupCamera();
    this.setupNotifications();
    this.setupTelegram();
    setTimeout(() => this.renderFamily(), 6000);
    this.trails = new Map();   // id → ตำแหน่งย้อนหลัง (ใช้วาดร่องรอย/ทิศทาง/ความเร็ว)
    this.setupRadarInput();
    bus.on('farm-event', msg => this.log(msg));
    bus.on('class', c => { if (c.on && this.tg.ready) this.tg.sendText(`📚 นักเรียน ${c.kids} คนกำลังมาเรียน${c.lesson}กับพี่สาวที่ศาลา`).catch(() => {}); });
    this.strikes = [];
    bus.on('lightning', e => {
      this.strikes.push({ ...e, t: performance.now() });
      this.log(`⚡ ฟ้าผ่าห่างจากบ้าน ${e.distance < 1000 ? e.distance.toFixed(0) + ' ม.' : (e.distance / 1000).toFixed(1) + ' กม.'} ${bearingName(bearing(e))}`);
    });
    this.log('ระบบเรดาร์เริ่มทำงาน · รัศมีตรวจจับ ' + this.range + ' ม.');
    this.last = performance.now();
    this.listTimer = 0;
    const loop = (now) => { this.update(now); requestAnimationFrame(loop); };
    requestAnimationFrame(loop);
  }

  setVisible(v) { this.visible = v; }

  // ---------------------------------------------------------------- camera
  setupCamera() {
    this.camSrc = 'sim';
    const stateEl = document.getElementById('faceApiState');
    const hasFD = 'FaceDetector' in window;
    stateEl.textContent = hasFD ? 'เบราว์เซอร์รองรับ FaceDetector — ครอปหน้าอัตโนมัติ' : 'ภาพจำลองจากกล้องหน้าบ้านในฉาก 3D';
    document.querySelectorAll('input[name=camsrc]').forEach(r => r.addEventListener('change', async () => {
      this.camSrc = r.value;
      const v = document.getElementById('webcam');
      if (r.value === 'webcam') {
        try {
          const stream = await navigator.mediaDevices.getUserMedia({ video: { width: 640, height: 480 } });
          v.srcObject = stream; v.hidden = false; v.style.width = '100%'; v.style.marginTop = '8px'; v.style.borderRadius = '4px';
          stateEl.textContent = 'ใช้เว็บแคมแทนกล้องจำลอง — เมื่อมีคนเข้าเขต ระบบจะถ่ายจากเว็บแคม';
        } catch (e) {
          stateEl.textContent = 'เปิดกล้องไม่ได้: ' + e.message;
          document.querySelector('input[name=camsrc][value=sim]').checked = true; this.camSrc = 'sim';
        }
      } else {
        v.srcObject?.getTracks().forEach(t => t.stop()); v.hidden = true;
        stateEl.textContent = 'ภาพจำลองจากกล้องหน้าบ้านในฉาก 3D';
      }
    }));
  }

  async capture(ent) {
    let src = null;
    if (this.camSrc === 'webcam') {
      const v = document.getElementById('webcam');
      if (v.videoWidth) {
        src = document.createElement('canvas'); src.width = 320; src.height = 240;
        const c = src.getContext('2d');
        let sx = 0, sy = 0, sw = v.videoWidth, sh = v.videoHeight;
        if ('FaceDetector' in window) {
          try {
            const faces = await new window.FaceDetector({ fastMode: true }).detect(v);
            if (faces[0]) { const b = faces[0].boundingBox; const pad = b.width * 0.8; sx = Math.max(0, b.x - pad); sy = Math.max(0, b.y - pad * 0.8); sw = Math.min(v.videoWidth - sx, b.width + pad * 2); sh = sw * 0.75; }
          } catch { /* ใช้ทั้งเฟรม */ }
        }
        c.drawImage(v, sx, sy, sw, sh, 0, 0, 320, 240);
      }
    }
    if (!src) src = this.farm.captureFace(ent.id);
    if (!src) return null;
    // ใส่กรอบ CCTV
    const c = src.getContext('2d'), W = src.width, H = src.height;
    c.strokeStyle = '#39ff6a'; c.lineWidth = 2;
    const br = (x, y, dx, dy) => { c.beginPath(); c.moveTo(x, y + dy * 18); c.lineTo(x, y); c.lineTo(x + dx * 18, y); c.stroke(); };
    br(8, 8, 1, 1); br(W - 8, 8, -1, 1); br(8, H - 8, 1, -1); br(W - 8, H - 8, -1, -1);
    c.strokeStyle = '#ff4040'; c.lineWidth = 2; c.strokeRect(W / 2 - 46, H / 2 - 62, 92, 104);
    c.fillStyle = 'rgba(0,0,0,.55)'; c.fillRect(0, H - 22, W, 22);
    c.fillStyle = '#39ff6a'; c.font = '12px "Share Tech Mono", monospace';
    c.fillText(`CAM-FACE-01  ${new Date().toLocaleString('th-TH', { hour12: false })}`, 8, H - 7);
    c.fillStyle = '#ff4040'; c.fillText('● REC', W - 50, 22);
    return src.toDataURL('image/jpeg', 0.85);
  }

  // ---------------------------------------------------------------- notifications
  setupNotifications() {
    const btn = document.getElementById('btnNotifPerm');
    const st = document.getElementById('notifState');
    const show = () => {
      if (!('Notification' in window)) { st.textContent = 'เบราว์เซอร์นี้ไม่รองรับการแจ้งเตือน'; btn.hidden = true; return; }
      st.textContent = { granted: 'อนุญาตแล้ว ✓ แจ้งเตือนพร้อมรูปจะเด้งบนเครื่องนี้', denied: 'ถูกบล็อก — เปิดได้ในการตั้งค่าเว็บไซต์ของเบราว์เซอร์', default: 'ยังไม่ได้อนุญาต' }[Notification.permission];
      btn.hidden = Notification.permission !== 'default';
    };
    show();
    btn.addEventListener('click', async () => { await Notification.requestPermission(); show(); });
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('sw.js').then(reg => (this.swReg = reg)).catch(() => {});
      navigator.serviceWorker.addEventListener('message', e => {
        if (e.data?.type === 'notif-action') this.respond(e.data.tag, e.data.action === 'allow');
      });
    }
  }

  pushSystemNotification(title, body, img, tag, actions) {
    if (!('Notification' in window) || Notification.permission !== 'granted') return;
    const opts = { body, icon: img, image: img, tag, requireInteraction: !!actions, data: { tag } };
    if (actions) opts.actions = [{ action: 'allow', title: '✅ รู้จัก' }, { action: 'deny', title: '🚨 ไม่รู้จัก' }];
    if (this.swReg) this.swReg.showNotification(title, opts).catch(() => new Notification(title, opts));
    else new Notification(title, { body, icon: img });
  }

  phoneNotify({ tag, title, body, img, ask }) {
    this.phoneEl.querySelector('.phone-empty')?.remove();
    const el = document.createElement('div');
    el.className = 'notif'; el.dataset.tag = tag;
    el.innerHTML = `
      <div class="notif-h"><span>🏡 บ้านสวน Monitor</span><span>${nowStr().slice(0, 5)}</span></div>
      <div class="notif-title"></div><div class="notif-body"></div>
      ${img ? `<img src="${img}" alt="ภาพใบหน้าที่ถ่ายได้">` : ''}
      ${ask ? `<div class="notif-actions"><button class="btn-allow">✅ รู้จัก (Allow)</button><button class="btn-deny">🚨 ไม่รู้จัก</button></div>` : ''}
      <div class="notif-result"></div>`;
    el.querySelector('.notif-title').textContent = title;
    el.querySelector('.notif-body').textContent = body;
    if (ask) {
      el.querySelector('.btn-allow').onclick = () => this.respond(tag, true);
      el.querySelector('.btn-deny').onclick = () => this.respond(tag, false);
    }
    this.phoneEl.prepend(el);
    while (this.phoneEl.children.length > 8) this.phoneEl.lastChild.remove();
  }

  // ตอบการแจ้งเตือน — มาจากปุ่มบนมือถือจำลอง, แจ้งเตือนของระบบ หรือ Telegram (ext.by = ชื่อคนกด)
  respond(tag, allow, ext = {}) {
    const t = this.alerts.get(tag);
    if (!t || t.answered) return;
    const by = ext.by;
    if (t.test) {
      t.answered = true;
      this.log(`ทดสอบ Telegram สำเร็จ: ${by || 'คุณ'} กด “${allow ? 'รู้จัก' : 'ไม่รู้จัก'}”`);
      this.tg.resolve(tag, `✅ ทดสอบสำเร็จ — ${by || 'คุณ'} กด “${allow ? 'รู้จัก' : 'ไม่รู้จัก'}” ระบบได้รับแล้ว`);
      toast(`📲 Telegram ใช้งานได้ — ${by || 'คุณ'} กดตอบแล้ว`);
      return;
    }
    if (!allow) return this.markThreat(t, by);
    if (ext.name) return this.markKnown(t, ext.name, by);
    const el = this.phoneEl.querySelector(`[data-tag="${tag}"]`);
    const res = el?.querySelector('.notif-result');
    if (by) { // กดรู้จักใน Telegram → ให้คนในกลุ่มพิมพ์ชื่อตอบกลับ
      if (t.askedName) return;
      t.askedName = true; el?.classList.add('done');
      if (res) res.textContent = `⏳ ${by} กดรู้จักใน Telegram — รอพิมพ์ชื่อ`;
      this.log(`${by} กด “รู้จัก” ใน Telegram — รอชื่อ`);
      this.tg.askName(tag, by).catch(e => this.log('ส่งคำถามชื่อไม่สำเร็จ: ' + e.message));
      return;
    }
    const dlg = document.getElementById('nameDialog');
    document.getElementById('nameDialogImg').src = t.img;
    const input = document.getElementById('nameInput'); input.value = '';
    dlg.returnValue = '';
    dlg.showModal(); input.focus();
    dlg.onclose = () => {
      if (dlg.returnValue === 'ok' && input.value.trim()) this.markKnown(t, input.value.trim(), 'เจ้าของ (หน้าเว็บ)');
    };
  }

  markKnown(t, name, by = 'เจ้าของ') {
    t.answered = true;
    const el = this.phoneEl.querySelector(`[data-tag="${t.tag}"]`);
    el?.classList.add('done');
    const res = el?.querySelector('.notif-result');
    this.known = this.known.filter(k => k.id !== t.personaId);
    this.known.push({ id: t.personaId, name, img: t.img, since: new Date().toISOString(), by });
    store.set('knownFaces', this.known);
    this.renderKnown();
    t.status = 'known'; t.name = name;
    if (res) res.innerHTML = `<span style="color:#1f9d55">✓ ${escapeHtml(by)} บันทึกเป็น “${escapeHtml(name)}” — ครั้งหน้าไม่ต้องถามอีก</span>`;
    this.log(`${by} ยืนยันว่ารู้จัก: ${name}`);
    bus.emit('radar-known', { name });
    this.tg.resolve(t.tag, `✅ ${by} ยืนยัน: รู้จัก — “${name}” (ครั้งหน้าระบบจะจำได้)`);
  }

  markThreat(t, by = 'เจ้าของ') {
    t.answered = true; t.status = 'threat';
    const el = this.phoneEl.querySelector(`[data-tag="${t.tag}"]`);
    el?.classList.add('done');
    const res = el?.querySelector('.notif-result');
    if (res) res.innerHTML = `<span style="color:#e03131">🚨 ${escapeHtml(by)} แจ้งว่าไม่รู้จัก — เปิดไฟสปอตไลท์ + ไซเรน (จำลอง)</span>`;
    this.log(`⚠ ${by} แจ้งว่าไม่รู้จัก — เปิดไฟและไซเรน`);
    bus.emit('cmd', { device: 'lights', value: true, source: 'เรดาร์' });
    bus.emit('radar-threat', { id: t.id });
    toast('🚨 บุคคลไม่รู้จัก — เปิดไฟสปอตไลท์แล้ว');
    this.tg.resolve(t.tag, `🚨 ${by} แจ้งว่าไม่รู้จัก — เปิดไฟสปอตไลท์และไซเรนแล้ว`);
  }

  // ---------------------------------------------------------------- Telegram
  setupTelegram() {
    const $ = id => document.getElementById(id);
    const state = $('tgState');
    const setState = (txt, ok) => { state.textContent = txt; state.style.color = ok === false ? '#ff6b6b' : ''; };
    $('tgChat').value = this.tg.chatId;
    if (this.tg.token) $('tgToken').placeholder = '•••••• (บันทึกไว้แล้ว — ใส่ใหม่ถ้าต้องการเปลี่ยน)';
    const token = () => $('tgToken').value.trim() || this.tg.token;
    this.tg.on('answer', a => this.respond(a.tag, a.allow, { by: a.by }));
    this.tg.on('name', a => { const t = this.alerts.get(a.tag); if (t && !t.answered) this.markKnown(t, a.name, a.by); });
    this.tg.on('status', (s, msg) => setState(s === 'online' ? '🟢 เชื่อมต่อ Telegram แล้ว — แจ้งเตือนจะเข้ากลุ่มครอบครัว' : '⚠ ' + msg, s === 'online'));
    $('tgFind').onclick = async () => {
      this.tg.stop();
      this.tg.token = token();
      setState('กำลังค้นหาแชท… (ต้องพิมพ์อะไรก็ได้ในกลุ่มที่มีบอทก่อน)');
      try {
        const chats = await this.tg.findChats();
        const box = $('tgChats'); box.innerHTML = '';
        if (!chats.length) setState('ไม่พบแชท — เพิ่มบอทเข้ากลุ่ม แล้วพิมพ์ข้อความในกลุ่มก่อน', false);
        else setState('เลือกแชทที่จะรับแจ้งเตือน:');
        for (const c of chats) {
          const b = document.createElement('button'); b.type = 'button'; b.className = 'hud-btn sm';
          b.textContent = `${c.type === 'private' ? '👤' : '👨‍👩‍👧‍👧'} ${c.name}`;
          b.onclick = () => { $('tgChat').value = c.id; box.innerHTML = ''; setState('เลือกแล้ว — กด “บันทึก & เชื่อมต่อ”'); };
          box.appendChild(b);
        }
      } catch (e) { setState('ค้นหาไม่สำเร็จ: ' + e.message, false); }
    };
    $('tgSave').onclick = async () => {
      if (!token() || !$('tgChat').value.trim()) return setState('ใส่ Bot token และ Chat ID ก่อน', false);
      this.tg.stop();
      this.tg.save(token(), $('tgChat').value);
      $('tgToken').value = ''; $('tgToken').placeholder = '•••••• (บันทึกไว้แล้ว)';
      try {
        const me = await this.tg.me();
        setState(`🟢 บอท @${me.username} พร้อมแล้ว`, true);
        this.tg.start();
      } catch (e) { setState('เชื่อมต่อไม่สำเร็จ: ' + e.message, false); }
    };
    $('tgTest').onclick = async () => {
      if (!this.tg.ready) return setState('บันทึก token และ Chat ID ก่อน', false);
      const dad = this.farm.getEntities().find(e => e.id === 'H-DAD');
      const tag = 'test' + Date.now().toString(36);
      const img = await this.capture(dad);
      this.alerts.set(tag, { tag, test: true, img });
      try {
        await this.tg.sendAlert({ tag, img, caption: '🧪 ทดสอบระบบแจ้งเตือนบ้านสวน\nลองกดปุ่มด้านล่าง ระบบจะตอบกลับว่าได้รับแล้ว' });
        setState('ส่งแล้ว — เปิด Telegram แล้วลองกดปุ่ม', true);
        this.tg.start();
      } catch (e) { setState('ส่งไม่สำเร็จ: ' + e.message, false); }
    };
    $('tgClear').onclick = () => { this.tg.clear(); $('tgChat').value = ''; $('tgToken').placeholder = 'Bot token จาก @BotFather'; setState('ลบการตั้งค่าออกจากเครื่องนี้แล้ว'); };
    $('btnStranger').onclick = () => { this.farm.spawnVisitor(null, true); this.log('ทดสอบ: มีคนแปลกหน้ามาที่ประตูหน้าบ้าน'); };
    if (this.tg.ready) { setState('กำลังเชื่อมต่อ Telegram…'); this.tg.start(); }
    else setState('ยังไม่ได้ตั้งค่า — ดูวิธีเตรียมใน README');
  }

  // สมาชิกครอบครัว — ถ่ายหน้าจากฉาก 3D มาเป็นรายชื่อที่ระบบรู้จักอยู่แล้ว
  renderFamily() {
    const el = document.getElementById('familyList');
    el.innerHTML = '';
    for (const e of this.farm.getEntities().filter(e => e.resident)) {
      const c = this.farm.captureFace(e.id);
      const d = document.createElement('div'); d.className = 'known';
      d.innerHTML = `<img alt=""><span></span>`;
      if (c) d.querySelector('img').src = c.toDataURL('image/jpeg', 0.8);
      d.querySelector('span').textContent = e.label;
      el.appendChild(d);
    }
  }

  renderKnown() {
    const el = document.getElementById('knownList');
    el.innerHTML = this.known.length ? '' : '<div class="phone-empty" style="padding:6px 0">ยังไม่มี — กด “รู้จัก” เพื่อเพิ่ม</div>';
    for (const k of this.known) {
      const d = document.createElement('div'); d.className = 'known'; d.title = 'คลิกเพื่อลบ';
      d.innerHTML = `<img src="${k.img}" alt=""><span></span>`;
      d.querySelector('span').textContent = k.name;
      d.onclick = () => {
        if (!confirm(`ลบ “${k.name}” ออกจากรายชื่อที่รู้จัก?`)) return;
        this.known = this.known.filter(x => x !== k); store.set('knownFaces', this.known); this.renderKnown();
      };
      el.appendChild(d);
    }
  }

  log(msg) {
    const d = document.createElement('div');
    d.innerHTML = `<span class="t">${nowStr()}</span>`;
    d.appendChild(document.createTextNode(msg));
    this.logEl.prepend(d);
    while (this.logEl.children.length > 80) this.logEl.lastChild.remove();
  }

  // ---------------------------------------------------------------- detection
  inside(e) { return e.x > PERIMETER.x0 && e.x < PERIMETER.x1 && e.z > PERIMETER.z0 && e.z < PERIMETER.z1; }

  async handleHumans(ents) {
    const present = new Set();
    for (const e of ents) {
      if (e.type !== 'human') continue;
      present.add(e.id);
      let t = this.tracked.get(e.id);
      if (!t) { t = { id: e.id, status: e.resident ? 'resident' : e.student ? 'student' : e.villager ? 'villager' : 'outside', personaId: e.persona?.id }; this.tracked.set(e.id, t); }
      if (t.status === 'outside' && this.inside(e)) {
        const k = this.known.find(k => k.id === t.personaId);
        const tag = 'n' + Date.now() + Math.random().toString(16).slice(2, 6);
        t.tag = tag;
        this.alerts.set(tag, t);
        if (k) {
          t.status = 'known'; t.name = k.name;
          this.log(`จดจำใบหน้าได้: ${k.name} เข้าเขตบ้าน`);
          bus.emit('known-arrival', { name: k.name, img: k.img });
          this.phoneNotify({ tag, title: `${k.name} มาถึงบ้านแล้ว`, body: 'ระบบจดจำใบหน้าได้ — ไม่ต้องดำเนินการ', img: k.img });
          this.pushSystemNotification(`${k.name} มาถึงบ้านแล้ว`, 'ระบบจดจำใบหน้าได้', k.img, tag);
          if (this.tg.ready) this.tg.sendPhoto(k.img, `✅ ${k.name} มาถึงบ้านแล้ว (ระบบจดจำใบหน้าได้)`).catch(err => this.log('Telegram: ' + err.message));
          continue;
        }
        t.status = 'pending';
        this.stats.alerts++;
        this.log(`ตรวจพบบุคคลเข้าเขตรั้ว (${e.persona?.desc || 'ไม่ทราบ'}) — กำลังถ่ายภาพใบหน้า…`);
        bus.emit('alert', { id: e.id });
        const img = await this.capture(e);
        t.img = img;
        bus.emit('alert-photo', { img, desc: e.persona?.desc });
        this.log('ส่งภาพใบหน้าไปที่มือถือแล้ว · รอเจ้าของยืนยัน');
        this.phoneNotify({ tag, title: '⚠ ตรวจพบบุคคลที่หน้าบ้าน', body: `ระยะ ${dist(e).toFixed(1)} ม. · ${bearingName(bearing(e))} · คุณรู้จักคนนี้ไหม?`, img, ask: true });
        this.pushSystemNotification('⚠ ตรวจพบบุคคลที่หน้าบ้าน', 'คุณรู้จักคนนี้ไหม? แตะเพื่อตอบ', img, tag, true);
        if (this.tg.ready) {
          const when = new Date().toLocaleString('th-TH', { hour12: false });
          this.tg.sendAlert({ tag, img, caption: `⚠ ตรวจพบบุคคลที่หน้าบ้าน\n📍 ระยะ ${dist(e).toFixed(1)} ม. · ${bearingName(bearing(e))}\n🕒 ${when}\n\nมีใครในบ้านรู้จักคนนี้ไหม?` })
            .then(() => this.log('📲 ส่งรูปเข้า Telegram กลุ่มครอบครัวแล้ว'))
            .catch(err => this.log('ส่ง Telegram ไม่สำเร็จ: ' + err.message));
        }
      }
    }
    for (const [id, t] of this.tracked) if (!present.has(id)) {
      if (t.status === 'threat' || t.status === 'pending') this.log(`บุคคล ${t.name || id} ออกนอกระยะตรวจจับแล้ว`);
      this.tracked.delete(id);
    }
  }

  // ---------------------------------------------------------------- draw
  update(now) {
    const dt = Math.min(0.1, (now - this.last) / 1000); this.last = now;
    const prev = this.sweep;
    this.sweep = (this.sweep + dt * 90) % 360; // 4 วินาที/รอบ
    const ents = this.farm.getEntities();
    this.handleHumans(ents);
    // อัปเดต blip เมื่อเส้นกวาดผ่าน
    for (const e of ents) {
      const b = bearing(e), d = dist(e);
      const crossed = prev <= this.sweep ? (b >= prev && b < this.sweep) : (b >= prev || b < this.sweep);
      const bl = this.blips.get(e.id);
      if (crossed || !bl) {
        this.blips.set(e.id, { ...e, b, d, seen: now });
        if (e.type !== 'animal') { const tr = this.trails.get(e.id) || []; tr.push({ x: e.x, z: e.z, t: now }); if (tr.length > 10) tr.shift(); this.trails.set(e.id, tr); }
      }
    }
    for (const [id, bl] of this.blips) if (now - bl.seen > 6000) { this.blips.delete(id); this.trails.delete(id); if (this.selected === id) this.selected = null; }

    this.listTimer -= dt;
    if (this.listTimer < 0) { this.listTimer = 0.4; this.renderList(ents); }
    if (this.visible) this.draw(now);
  }

  renderList(ents) {
    const rows = ents.filter(e => dist(e) <= this.range)
      .sort((a, b) => (a.type === 'human' ? -1 : 1) - (b.type === 'human' ? -1 : 1) || dist(a) - dist(b))
      .slice(0, 24)
      .map(e => {
        const t = this.tracked.get(e.id);
        const st = e.type !== 'human' ? '' : t?.status === 'resident' ? `คนในบ้าน(${e.label}${this.farm.sleepers?.size && this.farm.isInside?.({ position: { x: e.x, y: 1, z: e.z } }) && this.farm.entities.find(x => x.id === e.id)?.h?.sleeping ? ' 💤' : ''})` : t?.status === 'student' ? 'นักเรียน' : t?.status === 'villager' ? 'ชาวบ้านปักเบ็ด' : t?.status === 'known' ? t.name : t?.status === 'threat' ? 'ไม่รู้จัก!' : t?.status === 'pending' ? 'รอยืนยัน' : 'นอกรั้ว';
        const cls = e.type === 'human' ? (t?.status === 'threat' || t?.status === 'pending' ? 'target alert' : 'target human') : 'target';
        return `<div class="${cls}"><span>${e.id}</span><span>${e.type === 'human' ? '🧍 ' + st : e.type === 'vehicle' ? '🚗 ' + e.label : e.label}</span><span>${dist(e).toFixed(0)}m ${bearing(e).toFixed(0).padStart(3, '0')}°</span></div>`;
      });
    this.listEl.innerHTML = rows.join('') || '<div class="hud-dim">ไม่มีเป้าหมายในระยะ</div>';
  }

  // ---------------------------------------------------------------- แผนที่จริงจากฉาก 3D (มุมมองจากด้านบน) ใต้จอเรดาร์
  refreshMap(force = false) {
    const now = performance.now();
    if (!force && this.mapAt && now - this.mapAt < 20000 && this.mapRange === this.range) return;
    const img = this.farm.captureTopView?.(CENTER, this.range);
    if (img) { this.mapImg = img; this.mapAt = now; this.mapRange = this.range; }
  }

  setRange(r) {
    this.range = Math.round(Math.min(150, Math.max(20, r)));
    document.getElementById('rangeLbl').textContent = `${this.range} m`;
    clearTimeout(this.mapT); this.mapT = setTimeout(() => this.refreshMap(true), 250);
  }

  setupRadarInput() {
    const cv = this.cv;
    document.getElementById('radarCtl').addEventListener('click', e => {
      const b = e.target.closest('[data-r]'); if (!b) return;
      this.setRange(this.range * (b.dataset.r === '+' ? 0.75 : 1.33));
    });
    cv.addEventListener('wheel', e => { e.preventDefault(); this.setRange(this.range * (e.deltaY > 0 ? 1.12 : 0.89)); }, { passive: false });
    // บีบสองนิ้วซูม + แตะเลือกเป้าหมาย
    const pts = new Map(); let pinch0 = 0, range0 = 0, downAt = 0, downXY = null;
    cv.addEventListener('pointerdown', e => {
      cv.setPointerCapture(e.pointerId); pts.set(e.pointerId, [e.clientX, e.clientY]);
      if (pts.size === 2) { const [a, b] = [...pts.values()]; pinch0 = Math.hypot(a[0] - b[0], a[1] - b[1]); range0 = this.range; }
      downAt = performance.now(); downXY = [e.clientX, e.clientY];
    });
    cv.addEventListener('pointermove', e => {
      if (!pts.has(e.pointerId)) return; pts.set(e.pointerId, [e.clientX, e.clientY]);
      if (pts.size === 2 && pinch0) { const [a, b] = [...pts.values()]; this.setRange(range0 * pinch0 / Math.max(10, Math.hypot(a[0] - b[0], a[1] - b[1]))); }
    });
    const up = e => {
      const wasPinch = pts.size > 1; pts.delete(e.pointerId); if (pts.size < 2) pinch0 = 0;
      if (wasPinch || !downXY || performance.now() - downAt > 400 || Math.hypot(e.clientX - downXY[0], e.clientY - downXY[1]) > 10) return;
      const r = cv.getBoundingClientRect(), x = e.clientX - r.left, y = e.clientY - r.top;
      let best = null, bd = 22;
      for (const p of this.hit || []) { const d = Math.hypot(p.x - x, p.y - y); if (d < bd) { bd = d; best = p.id; } }
      this.selected = best;
    };
    cv.addEventListener('pointerup', up); cv.addEventListener('pointercancel', e => pts.delete(e.pointerId));
    this.setRange(this.range);
  }

  faceImg(src) {
    if (!src) return null;
    this.imgCache ||= new Map();
    if (!this.imgCache.has(src)) { const im = new Image(); im.src = src; this.imgCache.set(src, im); }
    const im = this.imgCache.get(src); return im.complete ? im : null;
  }

  draw(now) {
    const cv = this.cv, dpr = Math.min(devicePixelRatio, 2);
    const W = cv.clientWidth, H = cv.clientHeight;
    if (!W) return;
    if (cv.width !== W * dpr || cv.height !== H * dpr) { cv.width = W * dpr; cv.height = H * dpr; }
    this.refreshMap();
    const c = this.ctx; c.setTransform(dpr, 0, 0, dpr, 0, 0);
    c.clearRect(0, 0, W, H);
    const G = '#39ff6a', GD = 'rgba(57,255,106,0.28)', GDD = 'rgba(57,255,106,0.1)';
    const narrow = W < 560;
    const cx = W / 2, cy = narrow ? H / 2 + 22 : H / 2 + 10;
    const R = narrow ? Math.min(W * 0.4, (H - 120) / 2) : Math.min(W * 0.34, H * 0.41);
    const k = R / this.range;
    const toXY = (x, z) => [cx + (x - CENTER.x) * k, cy + (z - CENTER.z) * k];
    const tracked = this.tracked;
    const threats = [...tracked.values()].filter(t => t.status === 'threat' || t.status === 'pending');
    c.textBaseline = 'middle';

    // ---- หัวจอ
    c.shadowColor = G; c.shadowBlur = 8;
    c.fillStyle = G; c.font = 'bold 24px "Share Tech Mono", monospace'; c.textAlign = 'left';
    c.fillText('HUD', 16, 26); c.font = '13px "Share Tech Mono", monospace'; c.fillText('RADAR · บ้านสวน', 70, 26);
    c.shadowBlur = 0;
    const humansIn = [...this.blips.values()].filter(b => b.type === 'human' && b.d <= this.range).length;
    c.fillStyle = threats.length ? '#ff5d5d' : 'rgba(57,255,106,.7)'; c.font = '11px "Share Tech Mono", monospace';
    c.fillText(`RNG ${this.range}m · SCAN 4.0s · TGT ${humansIn} · ${threats.length ? 'ALERT ' + threats.length : 'SECURE'}`, 16, 46);
    c.textAlign = 'right'; c.fillStyle = 'rgba(57,255,106,.7)';
    c.fillText(new Date().toLocaleTimeString('th-TH', { hour12: false }), W - 16, 26);
    c.fillText(this.farm.nightFactor > 0.5 ? 'IR NIGHT MODE' : 'DAY MODE', W - 16, 44);
    c.textAlign = 'left';

    // ---- ไม้บรรทัดซ้าย
    if (!narrow) {
      const x0 = 18, y0 = 70, y1 = H - 20;
      c.strokeStyle = GD; c.beginPath(); c.moveTo(x0 + 40, y0); c.lineTo(x0 + 40, y1); c.stroke();
      for (let i = 0; i <= 26; i++) {
        const y = y1 - (y1 - y0) * i / 26;
        c.strokeStyle = GD; c.beginPath(); c.moveTo(x0 + 40, y); c.lineTo(x0 + (i % 2 ? 48 : 60), y); c.stroke();
        if (i % 2 === 0) { c.fillStyle = 'rgba(57,255,106,.5)'; c.fillText(String(i * 20).padStart(3, '0'), x0, y); }
      }
    }

    // ---- ภายในวงเรดาร์
    c.save(); c.beginPath(); c.arc(cx, cy, R, 0, Math.PI * 2); c.clip();
    const bg = c.createRadialGradient(cx, cy, 0, cx, cy, R);
    bg.addColorStop(0, 'rgba(6,40,16,.95)'); bg.addColorStop(1, 'rgba(1,10,4,.98)');
    c.fillStyle = bg; c.fillRect(cx - R, cy - R, R * 2, R * 2);
    // แผนที่จริง (ย้อมเขียว)
    if (this.mapImg) {
      const s = R * (this.mapRange / this.range);
      c.globalAlpha = 0.5; c.filter = 'grayscale(1) brightness(1.5) contrast(1.25) sepia(1) hue-rotate(65deg) saturate(2.6)';
      c.drawImage(this.mapImg, cx - s, cy - s, s * 2, s * 2);
      c.filter = 'none'; c.globalAlpha = 1;
    }
    // ตาราง
    c.strokeStyle = GDD; c.lineWidth = 1;
    for (let a = 0; a < 360; a += 30) { const t = rad(a); c.beginPath(); c.moveTo(cx, cy); c.lineTo(cx + Math.sin(t) * R, cy - Math.cos(t) * R); c.stroke(); }
    c.strokeStyle = GD;
    for (let i = 1; i <= 4; i++) { c.beginPath(); c.arc(cx, cy, R * i / 4, 0, Math.PI * 2); c.stroke(); }
    c.fillStyle = 'rgba(57,255,106,.55)'; c.font = '10px "Share Tech Mono", monospace';
    for (let i = 1; i <= 4; i++) c.fillText(`${Math.round(this.range * i / 4)}m`, cx + 4, cy - R * i / 4 + 9);
    // เขตรั้ว (กะพริบแดงเมื่อมีภัย)
    let [a1, b1] = toXY(PERIMETER.x0, PERIMETER.z0), [a2, b2] = toXY(PERIMETER.x1, PERIMETER.z1);
    c.setLineDash([6, 5]); c.lineWidth = 1.5;
    c.strokeStyle = threats.length ? `rgba(255,80,80,${0.5 + 0.5 * Math.sin(now / 150)})` : 'rgba(255,224,102,.55)';
    c.strokeRect(a1, b1, a2 - a1, b2 - b1); c.setLineDash([]); c.lineWidth = 1;
    c.fillStyle = 'rgba(160,255,190,.55)'; c.font = '10px "IBM Plex Sans Thai"';
    for (const z of ZONES) {
      if (z.r) { const [x, y] = toXY(z.cx, z.cz); c.fillText(z.name, x - 12, y); }
      else { [a1, b1] = toXY(z.x0, z.z0); [a2, b2] = toXY(z.x1, z.z1); c.fillText(z.name, Math.max(a1 + 3, cx - R + 8), Math.max(b1 + 10, cy - R + 20)); }
    }
    // ทิศทางที่มีภัย: ไฮไลต์เป็นเสี้ยว
    for (const t of threats) {
      const b = this.blips.get(t.id); if (!b) continue;
      const a = rad(b.b) - Math.PI / 2;
      c.fillStyle = 'rgba(255,60,60,0.12)'; c.beginPath(); c.moveTo(cx, cy); c.arc(cx, cy, R, a - 0.18, a + 0.18); c.closePath(); c.fill();
    }
    // เส้นกวาด + หางเรืองแสง
    const sw = rad(this.sweep) - Math.PI / 2;
    if (c.createConicGradient) {
      const grad = c.createConicGradient(sw - 1.2, cx, cy);
      grad.addColorStop(0, 'rgba(57,255,106,0)'); grad.addColorStop(0.19, 'rgba(57,255,106,0.42)'); grad.addColorStop(0.1901, 'rgba(57,255,106,0)'); grad.addColorStop(1, 'rgba(57,255,106,0)');
      c.fillStyle = grad; c.beginPath(); c.moveTo(cx, cy); c.arc(cx, cy, R, sw - 1.2, sw); c.closePath(); c.fill();
    }
    c.shadowColor = G; c.shadowBlur = 12; c.strokeStyle = '#b6ffc9'; c.lineWidth = 2;
    c.beginPath(); c.moveTo(cx, cy); c.lineTo(cx + Math.cos(sw) * R, cy + Math.sin(sw) * R); c.stroke();
    c.shadowBlur = 0; c.lineWidth = 1;

    // ---- เป้าหมาย
    this.hit = [];
    const tags = [];
    for (const bl of this.blips.values()) {
      if (bl.d > this.range * 1.05) continue;
      const age = (now - bl.seen) / 4000, alpha = Math.max(0.15, 1 - age);
      const [x, y] = toXY(bl.x, bl.z);
      const t = tracked.get(bl.id);
      const trail = this.trails.get(bl.id) || [];
      if (bl.type === 'human' || bl.type === 'vehicle') {
        const bad = t?.status === 'threat' || t?.status === 'pending';
        const rgb = bl.type === 'vehicle' ? '255,170,60' : bad ? '255,70,70' : t?.status === 'outside' ? '255,224,102' : '120,200,255';
        // ร่องรอยการเคลื่อนที่
        trail.forEach((p, i) => { const [tx, ty] = toXY(p.x, p.z); c.fillStyle = `rgba(${rgb},${(i + 1) / trail.length * 0.35 * alpha})`; c.beginPath(); c.arc(tx, ty, 2, 0, Math.PI * 2); c.fill(); });
        // เวกเตอร์ทิศทาง
        if (trail.length > 1) {
          const p0 = trail[Math.max(0, trail.length - 3)];
          const [px, py] = toXY(p0.x, p0.z), dx = x - px, dy = y - py, m = Math.hypot(dx, dy);
          if (m > 1.5) { c.strokeStyle = `rgba(${rgb},${alpha})`; c.beginPath(); c.moveTo(x, y); c.lineTo(x + dx / m * 16, y + dy / m * 16); c.stroke(); }
        }
        c.shadowColor = `rgb(${rgb})`; c.shadowBlur = 10; c.fillStyle = `rgba(${rgb},${alpha})`;
        if (bl.type === 'vehicle') { c.fillRect(x - 5, y - 3.5, 10, 7); }
        else { c.beginPath(); c.moveTo(x, y - 6); c.lineTo(x + 6, y); c.lineTo(x, y + 6); c.lineTo(x - 6, y); c.closePath(); c.fill(); }
        c.shadowBlur = 0;
        if (bad) { const pr = 9 + ((now / 55) % 18); c.strokeStyle = `rgba(255,70,70,${1 - (pr - 9) / 18})`; c.beginPath(); c.arc(x, y, pr, 0, Math.PI * 2); c.stroke(); }
        const name = bl.type === 'vehicle' ? bl.label : t?.status === 'resident' || t?.status === 'student' || t?.status === 'villager' ? bl.label : t?.status === 'known' ? t.name : bad ? 'UNKNOWN' : 'บุคคล';
        tags.push({ x, y, rgb, alpha, name, sub: `${bl.d.toFixed(0)}m ${bl.b.toFixed(0).padStart(3, '0')}°`, bad });
      } else {
        c.fillStyle = `rgba(57,255,106,${alpha * 0.8})`; c.beginPath(); c.arc(x, y, 2.6, 0, Math.PI * 2); c.fill();
      }
      this.hit.push({ id: bl.id, x, y });
      if (this.selected === bl.id) {
        c.strokeStyle = '#ffffff'; c.lineWidth = 1.5; const s = 13;
        for (const [sx, sy] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) { c.beginPath(); c.moveTo(x + sx * s, y + sy * (s - 6)); c.lineTo(x + sx * s, y + sy * s); c.lineTo(x + sx * (s - 6), y + sy * s); c.stroke(); }
        c.setLineDash([3, 4]); c.strokeStyle = 'rgba(255,255,255,.5)'; c.beginPath(); c.moveTo(cx, cy); c.lineTo(x, y); c.stroke(); c.setLineDash([]); c.lineWidth = 1;
      }
    }
    // ป้ายชื่อแบบหอบังคับการบิน (มีเส้นโยง)
    c.font = '11px "IBM Plex Sans Thai"';
    for (const tg of tags) {
      const lx = tg.x + 14, ly = tg.y - 16;
      c.strokeStyle = `rgba(${tg.rgb},${tg.alpha * 0.7})`; c.beginPath(); c.moveTo(tg.x + 5, tg.y - 5); c.lineTo(lx, ly + 6); c.stroke();
      const w = Math.max(c.measureText(tg.name).width, c.measureText(tg.sub).width) + 10;
      c.fillStyle = tg.bad ? 'rgba(60,0,0,.75)' : 'rgba(0,25,10,.7)'; c.fillRect(lx, ly - 10, w, 26);
      c.strokeRect(lx, ly - 10, w, 26);
      c.fillStyle = `rgba(${tg.rgb},${Math.max(0.6, tg.alpha)})`; c.fillText(tg.name, lx + 5, ly - 2);
      c.font = '10px "Share Tech Mono"'; c.fillText(tg.sub, lx + 5, ly + 10); c.font = '11px "IBM Plex Sans Thai"';
    }
    // ฟ้าผ่า
    this.strikes = this.strikes.filter(s => now - s.t < 5000);
    for (const s of this.strikes) {
      if (s.distance > this.range * 1.05) continue;
      const [x, y] = toXY(s.x, s.z), a = 1 - (now - s.t) / 5000;
      c.shadowColor = '#9fb6ff'; c.shadowBlur = 12; c.strokeStyle = `rgba(200,215,255,${a})`; c.lineWidth = 2; c.beginPath();
      c.moveTo(x - 4, y - 12); c.lineTo(x + 3, y - 2); c.lineTo(x - 3, y + 1); c.lineTo(x + 4, y + 12); c.stroke(); c.lineWidth = 1; c.shadowBlur = 0;
    }
    // ขอบในมืด (ให้ดูเป็นจอโค้ง)
    const vg = c.createRadialGradient(cx, cy, R * 0.65, cx, cy, R);
    vg.addColorStop(0, 'rgba(0,0,0,0)'); vg.addColorStop(1, 'rgba(0,0,0,.55)');
    c.fillStyle = vg; c.fillRect(cx - R, cy - R, R * 2, R * 2);
    c.restore();

    // ---- ขอบวง + องศา + ทิศ
    c.shadowColor = G; c.shadowBlur = 6;
    c.strokeStyle = G; c.lineWidth = 1.6; c.beginPath(); c.arc(cx, cy, R, 0, Math.PI * 2); c.stroke(); c.lineWidth = 1;
    c.shadowBlur = 0;
    c.font = '11px "Share Tech Mono", monospace'; c.textAlign = 'center';
    for (let a = 0; a < 360; a += 5) {
      const r0 = a % 30 === 0 ? R + 4 : R + 2, r1 = a % 30 === 0 ? R + 13 : a % 10 === 0 ? R + 8 : R + 5;
      const s = Math.sin(rad(a)), co = -Math.cos(rad(a));
      c.strokeStyle = a % 30 === 0 ? G : GD;
      c.beginPath(); c.moveTo(cx + s * r0, cy + co * r0); c.lineTo(cx + s * r1, cy + co * r1); c.stroke();
      if (a % 30 === 0 && a % 90 !== 0) { c.fillStyle = 'rgba(57,255,106,.7)'; c.fillText(String(a).padStart(3, '0'), cx + s * (R + 26), cy + co * (R + 26)); }
    }
    c.font = 'bold 14px "Share Tech Mono", monospace'; c.fillStyle = G;
    [['N', 0], ['E', 90], ['S', 180], ['W', 270]].forEach(([l, a]) => c.fillText(l, cx + Math.sin(rad(a)) * (R + 26), cy - Math.cos(rad(a)) * (R + 26)));
    c.textAlign = 'left';
    // จุดติดตั้งเรดาร์
    c.fillStyle = G; c.beginPath(); c.arc(cx, cy, 3.5, 0, Math.PI * 2); c.fill();
    c.strokeStyle = GD; c.beginPath(); c.arc(cx, cy, 12 + Math.sin(now / 400) * 2, 0, Math.PI * 2); c.stroke();

    // ---- ข้อมูลเป้าหมายที่เลือก / ใกล้สุด
    const sel = this.selected && this.blips.get(this.selected);
    const near = [...this.blips.values()].filter(e => e.type === 'human').sort((a, b) => a.d - b.d)[0];
    const info = sel || near;
    if (!narrow) {
      const x0 = W - 190, y0 = 70;
      c.fillStyle = 'rgba(0,30,12,.6)'; c.fillRect(x0 - 8, y0 - 12, 182, sel ? 214 : 132);
      c.strokeStyle = GD; c.strokeRect(x0 - 8, y0 - 12, 182, sel ? 214 : 132);
      c.fillStyle = G; c.font = '12px "Share Tech Mono"';
      c.fillText(sel ? 'TARGET LOCK' : 'NEAREST TARGET', x0, y0);
      if (info) {
        const t = tracked.get(info.id);
        const status = info.type !== 'human' ? info.label : t?.status === 'resident' ? `คนในบ้าน · ${info.label}` : t?.status === 'student' ? 'นักเรียน' : t?.status === 'villager' ? 'ชาวบ้านปักเบ็ด' : t?.status === 'known' ? `รู้จัก · ${t.name}` : t?.status === 'threat' ? 'ไม่รู้จัก !' : t?.status === 'pending' ? 'รอยืนยัน' : 'นอกรั้ว';
        const trail = this.trails.get(info.id) || [];
        let speed = 0; if (trail.length > 1) { const a = trail[trail.length - 2], b = trail[trail.length - 1]; speed = Math.hypot(b.x - a.x, b.z - a.z) / Math.max(0.5, (b.t - a.t) / 1000); }
        const lines = [info.id, `X ${info.x.toFixed(1)}  Z ${info.z.toFixed(1)}`, `BRG ${info.b.toFixed(0).padStart(3, '0')}°  RNG ${info.d.toFixed(1)}m`, `SPD ${speed.toFixed(1)} m/s`];
        lines.forEach((l, i) => c.fillText(l, x0, y0 + 20 + i * 17));
        c.font = '12px "IBM Plex Sans Thai"'; c.fillStyle = t?.status === 'threat' || t?.status === 'pending' ? '#ff6b6b' : '#a6ffbc';
        c.fillText(status, x0, y0 + 20 + lines.length * 17);
        const face = this.faceImg(t?.img || (t?.status === 'known' ? this.known.find(k => k.id === t.personaId)?.img : null));
        if (sel && face) { c.drawImage(face, x0, y0 + 112, 112, 84); c.strokeStyle = G; c.strokeRect(x0, y0 + 112, 112, 84); }
        else if (sel) { c.fillStyle = 'rgba(57,255,106,.5)'; c.font = '11px "IBM Plex Sans Thai"'; c.fillText('แตะที่ว่างเพื่อยกเลิก', x0, y0 + 120); }
      } else { c.fillStyle = 'rgba(57,255,106,.5)'; c.fillText('---', x0, y0 + 20); }
      c.font = '10px "IBM Plex Sans Thai"'; c.fillStyle = 'rgba(57,255,106,.5)';
      if (!sel) c.fillText('แตะเป้าหมายบนจอเพื่อล็อก', x0, y0 + 108);
    }

    // ---- มาตรวัดมุมขวาล่าง
    if (!narrow) {
      const ents = [...this.blips.values()].filter(b => b.d <= this.range);
      const humans = ents.filter(e => e.type === 'human').length, cars = ents.filter(e => e.type === 'vehicle').length, animals = ents.length - humans - cars;
      const gauges = [['HUMAN', humans, 12], ['ANIMAL', animals, 24], ['VEHICLE', cars, 4], ['ALERT', threats.length, 3]];
      const gx = W - 150, gy = H - 150;
      gauges.forEach(([name, v, max], i) => {
        const x = gx + (i % 2) * 74, y = gy + Math.floor(i / 2) * 76, r = 26;
        c.strokeStyle = GDD; c.lineWidth = 6; c.beginPath(); c.arc(x, y, r, 0, Math.PI * 2); c.stroke();
        c.strokeStyle = name === 'ALERT' && v ? '#ff4646' : G; c.shadowColor = c.strokeStyle; c.shadowBlur = 8;
        c.beginPath(); c.arc(x, y, r, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * Math.min(1, v / max)); c.stroke(); c.shadowBlur = 0; c.lineWidth = 1;
        c.fillStyle = 'rgba(57,255,106,.9)'; c.textAlign = 'center'; c.font = 'bold 14px "Share Tech Mono"'; c.fillText(v, x, y);
        c.font = '10px "Share Tech Mono"'; c.fillStyle = 'rgba(57,255,106,.7)'; c.fillText(name, x, y + r + 12);
      });
      c.textAlign = 'left';
    }
  }
}

const rad = d => d * Math.PI / 180;
function bearing(e) { return (Math.atan2(e.x - CENTER.x, -(e.z - CENTER.z)) * 180 / Math.PI + 360) % 360; }
function dist(e) { return Math.hypot(e.x - CENTER.x, e.z - CENTER.z); }
function bearingName(b) { return ['ทิศเหนือ', 'ตะวันออกเฉียงเหนือ', 'ทิศตะวันออก', 'ตะวันออกเฉียงใต้', 'ทิศใต้ (หน้าบ้าน)', 'ตะวันตกเฉียงใต้', 'ทิศตะวันตก', 'ตะวันตกเฉียงเหนือ'][Math.round(b / 45) % 8]; }
function escapeHtml(s) { return s.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); }
