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
    canvas.addEventListener('click', () => { this.range = this.range === 60 ? 120 : this.range === 120 ? 30 : 60; });
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
      if (!t) { t = { id: e.id, status: e.resident ? 'resident' : e.student ? 'student' : 'outside', personaId: e.persona?.id }; this.tracked.set(e.id, t); }
      if (t.status === 'outside' && this.inside(e)) {
        const k = this.known.find(k => k.id === t.personaId);
        const tag = 'n' + Date.now() + Math.random().toString(16).slice(2, 6);
        t.tag = tag;
        this.alerts.set(tag, t);
        if (k) {
          t.status = 'known'; t.name = k.name;
          this.log(`จดจำใบหน้าได้: ${k.name} เข้าเขตบ้าน`);
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
      if (crossed || !bl) this.blips.set(e.id, { ...e, b, d, seen: now });
    }
    for (const [id, bl] of this.blips) if (now - bl.seen > 6000) this.blips.delete(id);

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
        const st = e.type !== 'human' ? '' : t?.status === 'resident' ? `คนในบ้าน(${e.label}${this.farm.sleepers?.size && this.farm.isInside?.({ position: { x: e.x, y: 1, z: e.z } }) && !this.farm.entities.find(x => x.id === e.id)?.obj.visible ? ' 💤' : ''})` : t?.status === 'student' ? 'นักเรียน' : t?.status === 'known' ? t.name : t?.status === 'threat' ? 'ไม่รู้จัก!' : t?.status === 'pending' ? 'รอยืนยัน' : 'นอกรั้ว';
        const cls = e.type === 'human' ? (t?.status === 'threat' || t?.status === 'pending' ? 'target alert' : 'target human') : 'target';
        return `<div class="${cls}"><span>${e.id}</span><span>${e.type === 'human' ? '🧍 ' + st : e.type === 'vehicle' ? '🚗 ' + e.label : e.label}</span><span>${dist(e).toFixed(0)}m ${bearing(e).toFixed(0).padStart(3, '0')}°</span></div>`;
      });
    this.listEl.innerHTML = rows.join('') || '<div class="hud-dim">ไม่มีเป้าหมายในระยะ</div>';
  }

  draw(now) {
    const cv = this.cv, dpr = Math.min(devicePixelRatio, 2);
    const W = cv.clientWidth, H = cv.clientHeight;
    if (!W) return;
    if (cv.width !== W * dpr || cv.height !== H * dpr) { cv.width = W * dpr; cv.height = H * dpr; }
    const c = this.ctx; c.setTransform(dpr, 0, 0, dpr, 0, 0);
    c.clearRect(0, 0, W, H);
    const G = '#39ff6a', GD = 'rgba(57,255,106,0.25)', GDD = 'rgba(57,255,106,0.1)';
    const narrow = W < 560;
    const cx = W / 2, cy = narrow ? H / 2 + 22 : H / 2 + 10;
    const R = narrow ? Math.min(W * 0.36, (H - 120) / 2) : Math.min(W * 0.36, H * 0.42);
    c.font = '12px "Share Tech Mono", monospace'; c.textAlign = 'left'; c.textBaseline = 'middle';

    // หัวข้อ
    c.fillStyle = G; c.font = 'bold 24px "Share Tech Mono", monospace';
    c.fillText('HUD', 16, 26); c.font = '13px "Share Tech Mono", monospace'; c.fillText('RADAR · บ้านสวน', 70, 26);
    c.fillStyle = 'rgba(57,255,106,.6)'; c.font = '11px "Share Tech Mono", monospace';
    c.fillText(`RANGE ${this.range}m · คลิกเพื่อเปลี่ยน`, 16, 46);

    // ไม้บรรทัดด้านซ้าย
    if (!narrow) {
      const x0 = 18, y0 = 70, y1 = H - 20;
      c.strokeStyle = GD; c.beginPath(); c.moveTo(x0 + 40, y0); c.lineTo(x0 + 40, y1); c.stroke();
      for (let i = 0; i <= 26; i++) {
        const y = y1 - (y1 - y0) * i / 26;
        c.beginPath(); c.moveTo(x0 + 40, y); c.lineTo(x0 + (i % 2 ? 48 : 60), y); c.stroke();
        if (i % 2 === 0) { c.fillStyle = 'rgba(57,255,106,.55)'; c.fillText(String(i * 20).padStart(3, '0'), x0, y); }
        c.strokeStyle = GDD; c.beginPath(); c.moveTo(x0 + 60, y); c.lineTo(cx - R - 20, y); c.stroke(); c.strokeStyle = GD;
      }
    }

    // วงแหวน + องศา
    c.strokeStyle = GD; c.lineWidth = 1;
    for (let i = 1; i <= 4; i++) { c.beginPath(); c.arc(cx, cy, R * i / 4, 0, Math.PI * 2); c.stroke(); }
    c.strokeStyle = G; c.lineWidth = 1.5; c.beginPath(); c.arc(cx, cy, R, 0, Math.PI * 2); c.stroke();
    c.lineWidth = 1;
    for (let a = 0; a < 360; a += 5) {
      const r0 = a % 20 === 0 ? R + 4 : R + 2, r1 = a % 20 === 0 ? R + 12 : R + 6;
      const s = Math.sin(rad(a)), co = -Math.cos(rad(a));
      c.strokeStyle = a % 20 === 0 ? G : GD;
      c.beginPath(); c.moveTo(cx + s * r0, cy + co * r0); c.lineTo(cx + s * r1, cy + co * r1); c.stroke();
      if (a % 20 === 0) { c.fillStyle = 'rgba(57,255,106,.75)'; c.textAlign = 'center'; c.fillText(String(a).padStart(2, '0'), cx + s * (R + 24), cy + co * (R + 24)); }
    }
    c.textAlign = 'left';
    c.strokeStyle = GDD; c.beginPath(); c.moveTo(cx - R, cy); c.lineTo(cx + R, cy); c.moveTo(cx, cy - R); c.lineTo(cx, cy + R); c.stroke();
    for (let i = 1; i <= 4; i++) { c.fillStyle = 'rgba(57,255,106,.45)'; c.fillText(`${(this.range * i / 4).toFixed(0)}m`, cx + 4, cy - R * i / 4 + 8); }
    c.fillStyle = G; c.textAlign = 'center'; c.fillText('N', cx, cy - R - 38); c.textAlign = 'left';

    const toXY = (x, z) => {
      const dx = x - CENTER.x, dz = z - CENTER.z;
      const k = R / this.range; return [cx + dx * k, cy + dz * k];
    };
    // ผังบ้านสวนจาง ๆ
    c.save(); c.beginPath(); c.arc(cx, cy, R, 0, Math.PI * 2); c.clip();
    c.setLineDash([4, 4]); c.strokeStyle = 'rgba(255,224,102,.45)';
    let [a1, b1] = toXY(PERIMETER.x0, PERIMETER.z0), [a2, b2] = toXY(PERIMETER.x1, PERIMETER.z1);
    c.strokeRect(a1, b1, a2 - a1, b2 - b1); c.setLineDash([]);
    c.strokeStyle = 'rgba(57,255,106,.3)'; c.fillStyle = 'rgba(57,255,106,.4)'; c.font = '10px "IBM Plex Sans Thai"';
    for (const z of ZONES) {
      if (z.r) { const [x, y] = toXY(z.cx, z.cz); c.beginPath(); c.arc(x, y, z.r * R / this.range, 0, Math.PI * 2); c.stroke(); c.fillText(z.name, x - 10, y); }
      else { [a1, b1] = toXY(z.x0, z.z0); [a2, b2] = toXY(z.x1, z.z1); c.strokeRect(a1, b1, a2 - a1, b2 - b1); c.fillText(z.name, a1 + 3, Math.max(b1 + 10, cy - R + 20)); }
    }
    const [, ry] = toXY(0, 46); c.strokeStyle = 'rgba(57,255,106,.18)'; c.lineWidth = R / this.range * 9; c.beginPath(); c.moveTo(cx - R, ry); c.lineTo(cx + R, ry); c.stroke(); c.lineWidth = 1;
    c.fillText('ถนน', cx - R * 0.6, ry);

    // เส้นกวาด
    const sw = rad(this.sweep) - Math.PI / 2;
    const grad = c.createConicGradient ? c.createConicGradient(sw - 0.9, cx, cy) : null;
    if (grad) {
      grad.addColorStop(0, 'rgba(57,255,106,0)'); grad.addColorStop(0.143, 'rgba(57,255,106,0.35)'); grad.addColorStop(0.1431, 'rgba(57,255,106,0)'); grad.addColorStop(1, 'rgba(57,255,106,0)');
      c.fillStyle = grad; c.beginPath(); c.moveTo(cx, cy); c.arc(cx, cy, R, sw - 0.9, sw); c.closePath(); c.fill();
    }
    c.strokeStyle = G; c.lineWidth = 2; c.beginPath(); c.moveTo(cx, cy); c.lineTo(cx + Math.cos(sw) * R, cy + Math.sin(sw) * R); c.stroke(); c.lineWidth = 1;

    // blips
    c.font = '11px "IBM Plex Sans Thai"';
    for (const bl of this.blips.values()) {
      if (bl.d > this.range * 1.05) continue;
      const age = (now - bl.seen) / 4000, alpha = Math.max(0.12, 1 - age);
      const [x, y] = toXY(bl.x, bl.z);
      const t = this.tracked.get(bl.id);
      if (bl.type === 'human') {
        const bad = t?.status === 'threat' || t?.status === 'pending';
        const col = bad ? `rgba(255,70,70,${alpha})` : t?.status === 'outside' ? `rgba(255,224,102,${alpha})` : `rgba(120,200,255,${alpha})`;
        c.fillStyle = col; c.beginPath(); c.arc(x, y, 6, 0, Math.PI * 2); c.fill();
        if (bad) { const pr = 8 + ((now / 60) % 16); c.strokeStyle = `rgba(255,70,70,${1 - (pr - 8) / 16})`; c.beginPath(); c.arc(x, y, pr, 0, Math.PI * 2); c.stroke(); }
        c.fillStyle = col;
        const lbl = t?.status === 'resident' || t?.status === 'student' ? bl.label : t?.status === 'known' ? t.name : bad ? 'UNKNOWN' : 'บุคคล';
        c.fillText(lbl, x + 9, y - 8);
      } else if (bl.type === 'vehicle') {
        c.fillStyle = `rgba(255,170,60,${alpha})`; c.fillRect(x - 5, y - 3, 10, 6);
        c.fillText(bl.label, x + 8, y - 6);
      } else {
        c.fillStyle = `rgba(57,255,106,${alpha * 0.85})`; c.beginPath(); c.arc(x, y, 3, 0, Math.PI * 2); c.fill();
      }
    }
    // จุดฟ้าผ่า (แสดง 5 วินาที)
    this.strikes = this.strikes.filter(s => now - s.t < 5000);
    for (const s of this.strikes) {
      if (s.distance > this.range * 1.05) continue;
      const [x, y] = toXY(s.x, s.z), a = 1 - (now - s.t) / 5000;
      c.strokeStyle = `rgba(190,210,255,${a})`; c.lineWidth = 2; c.beginPath();
      c.moveTo(x - 4, y - 12); c.lineTo(x + 3, y - 2); c.lineTo(x - 3, y + 1); c.lineTo(x + 4, y + 12); c.stroke(); c.lineWidth = 1;
    }
    c.restore();
    // จุดกลาง
    c.fillStyle = G; c.beginPath(); c.arc(cx, cy, 4, 0, Math.PI * 2); c.fill();
    c.strokeStyle = G; c.beginPath(); c.arc(cx, cy, 14, 0, Math.PI * 2); c.stroke();

    // มาตรวัดมุมขวาล่าง
    if (!narrow) {
      const ents = [...this.blips.values()];
      const humans = ents.filter(e => e.type === 'human').length, animals = ents.length - humans;
      const threats = [...this.tracked.values()].filter(t => t.status === 'threat' || t.status === 'pending').length;
      const gauges = [['HUMAN', humans, 6], ['ANIMAL', animals, 20], ['KNOWN', this.known.length, 10], ['ALERT', threats, 3]];
      const gx = W - 150, gy = H - 150;
      gauges.forEach(([name, v, max], i) => {
        const x = gx + (i % 2) * 74, y = gy + Math.floor(i / 2) * 76, r = 26;
        c.fillStyle = 'rgba(57,255,106,.12)'; c.beginPath(); c.arc(x, y, r, 0, Math.PI * 2); c.fill();
        c.fillStyle = name === 'ALERT' && v ? '#ff4646' : G;
        c.beginPath(); c.moveTo(x, y); c.arc(x, y, r, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * Math.min(1, v / max)); c.closePath(); c.fill();
        c.fillStyle = 'rgba(57,255,106,.8)'; c.textAlign = 'center'; c.font = '10px "Share Tech Mono"';
        c.fillText(`${name} ${v}`, x, y + r + 10);
      });
      c.textAlign = 'left';
      // พิกัดเป้าหมายล่าสุด
      const h = ents.filter(e => e.type === 'human').sort((a, b) => a.d - b.d)[0];
      c.fillStyle = G; c.font = '12px "Share Tech Mono"';
      const lines = ['POSITION', h ? `${h.id}` : '---', h ? `X ${h.x.toFixed(1)}  Z ${h.z.toFixed(1)}` : '', h ? `BRG ${h.b.toFixed(0)}°  R ${h.d.toFixed(1)}m` : '', '', `SWEEP ${this.sweep.toFixed(0).padStart(3, '0')}°`, `ALERTS ${this.stats.alerts}`];
      lines.forEach((l, i) => c.fillText(l, W - 170, 80 + i * 18));
    }
  }
}

const rad = d => d * Math.PI / 180;
function bearing(e) { return (Math.atan2(e.x - CENTER.x, -(e.z - CENTER.z)) * 180 / Math.PI + 360) % 360; }
function dist(e) { return Math.hypot(e.x - CENTER.x, e.z - CENTER.z); }
function bearingName(b) { return ['ทิศเหนือ', 'ตะวันออกเฉียงเหนือ', 'ทิศตะวันออก', 'ตะวันออกเฉียงใต้', 'ทิศใต้ (หน้าบ้าน)', 'ตะวันตกเฉียงใต้', 'ทิศตะวันตก', 'ตะวันตกเฉียงเหนือ'][Math.round(b / 45) % 8]; }
function escapeHtml(s) { return s.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); }
