// สรุปประจำวัน: เก็บสถิติทั้งวันจากเหตุการณ์ในระบบ แสดงใน Hub และส่งเข้า Telegram อัตโนมัติตอน 20:00 (เวลาจริง)
import { bus, store, toast } from './bus.js';

const SEND_HOUR = 20;
const dayKey = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; }; // วันที่ตามเวลาเครื่อง (ไม่ใช่ UTC)
const blank = () => ({ alerts: 0, known: [], threats: 0, cars: 0, eggs: 0, latex: 0, tapped: 0, lightning: 0, tmin: null, tmax: null, weather: '', classes: [], bbq: false, fixes: 0, warnings: [] });

export class DailySummary {
  constructor({ radar, hub, farm }) {
    this.radar = radar; this.hub = hub; this.farm = farm;
    this.load();
    const S = () => this.s;
    bus.on('alert', () => { S().alerts++; this.save(); });
    bus.on('radar-known', k => { S().known.push(k.name); this.save(); });
    bus.on('radar-threat', () => { S().threats++; this.save(); });
    bus.on('vehicle-pass', () => { S().cars++; this.save(); });
    bus.on('eggs-collected', n => { S().eggs += n; this.save(); });
    bus.on('rubber-latex', kg => { S().latex += kg; this.save(); });
    bus.on('rubber-tapped', n => { S().tapped = Math.max(S().tapped, n); this.save(); });
    bus.on('lightning', () => { S().lightning++; this.save(); });
    bus.on('class', c => { if (c.on) { S().classes.push(c.lesson.replace('ภาษาอังกฤษ หัวข้อ ', '')); this.save(); } });
    bus.on('bbq', on => { if (on) { S().bbq = true; this.save(); } });
    bus.on('sensor-fix', () => { S().fixes++; this.save(); });
    bus.on('farm-event', msg => { if (msg.startsWith('⚠')) { S().warnings = [...S().warnings.slice(-4), msg.replace(/^⚠\s*/, '')]; this.save(); } });
    bus.on('real-weather', d => {
      const s = S(), t = d.temperature_2m;
      s.tmin = s.tmin === null ? t : Math.min(s.tmin, t); s.tmax = s.tmax === null ? t : Math.max(s.tmax, t);
      s.weather = d.label; this.save();
    });
    this.buildCard();
    setInterval(() => this.tick(), 30000);
    setInterval(() => this.renderCard(), 5000);
  }

  load() { this.key = dayKey(); this.s = { ...blank(), ...store.get('daily-' + this.key, {}) }; }
  save() { if (dayKey() !== this.key) this.load(); store.set('daily-' + this.key, this.s); }

  text() {
    const s = this.s, v = this.hub.vals;
    const date = new Date().toLocaleDateString('th-TH', { weekday: 'long', day: 'numeric', month: 'short', year: 'numeric' });
    const temp = s.tmin !== null ? ` · ${Math.round(s.tmin)}–${Math.round(s.tmax)}°C` : '';
    const known = [...new Set(s.known)];
    const lines = [
      `📋 สรุปบ้านสวนประจำวัน`,
      `${date}`,
      ``,
      `🌤 อากาศ: ${s.weather || 'ไม่มีข้อมูล'}${temp}${s.lightning ? ` · ⚡ ฟ้าผ่า ${s.lightning} ครั้ง` : ''}`,
      `🛡 ตรวจพบบุคคลเข้าเขตบ้าน ${s.alerts} ครั้ง${known.length ? ` · รู้จัก: ${known.join(', ')}` : ''}${s.threats ? ` · ไม่รู้จัก ${s.threats} ครั้ง` : ''}`,
      `🚗 รถผ่านหน้าบ้าน ${s.cars} คัน`,
      `🌳 สวนยาง: กรีด ${s.tapped} ต้น · น้ำยาง ${s.latex.toFixed(1)} กก.`,
      `🐔 เก็บไข่ไก่ได้ ${s.eggs} ฟอง`,
      `🥬 ผัก: pH ${v['hydro/ph'].toFixed(1)} · EC ${v['hydro/ec'].toFixed(2)}   🐟 ออกซิเจนบ่อ ${v['pond/do'].toFixed(1)} mg/L`,
      `🐖 อาหารหมูในไซโล ${Math.round(v['pig/feed'])}%`,
    ];
    if (s.classes.length) lines.push(`📚 พี่สาวสอนภาษาอังกฤษ ${s.classes.length} ครั้ง (${[...new Set(s.classes)].join(', ')})`);
    if (s.bbq) lines.push('🍖 ครอบครัวกินหมูกะทะหน้าบ้าน');
    if (s.fixes) lines.push(`🔧 แก้ปัญหาอัตโนมัติ ${s.fixes} ครั้ง`);
    if (s.warnings.length) lines.push('', '⚠ เรื่องที่ควรดู:', ...s.warnings.map(w => '• ' + w));
    return lines.join('\n');
  }

  async send(manual = false) {
    const tg = this.radar.tg;
    if (!tg.ready) { if (manual) toast('ยังไม่ได้ตั้งค่า Telegram — ไปที่แท็บเรดาร์ → 📲 Telegram'); return false; }
    try {
      await tg.sendText(this.text());
      store.set('summarySent', this.key);
      this.hub.log('📋 ส่งสรุปประจำวันเข้า Telegram แล้ว');
      if (manual) toast('📋 ส่งสรุปเข้า Telegram แล้ว');
      return true;
    } catch (e) { this.hub.log('ส่งสรุปไม่สำเร็จ: ' + e.message); return false; }
  }

  tick() {
    if (dayKey() !== this.key) this.load();
    const now = new Date();
    if (now.getHours() >= SEND_HOUR && store.get('summarySent', '') !== this.key) this.send();
  }

  buildCard() {
    const card = document.createElement('div'); card.className = 'card';
    card.innerHTML = `<div class="card-h"><span><span class="ico">📋</span> สรุปวันนี้</span><span class="pill sim">ส่งอัตโนมัติ ${SEND_HOUR}:00</span></div>
      <pre class="summary-text"></pre>
      <button class="act" data-send>📲 ส่งเข้า Telegram ตอนนี้</button>
      <button class="act" data-copy>คัดลอกข้อความ</button>`;
    this.hub.grid.prepend(card);
    this.pre = card.querySelector('pre');
    card.querySelector('[data-send]').onclick = () => this.send(true);
    card.querySelector('[data-copy]').onclick = async () => { try { await navigator.clipboard.writeText(this.text()); toast('คัดลอกสรุปแล้ว'); } catch { toast('คัดลอกไม่ได้ในเบราว์เซอร์นี้'); } };
    this.renderCard();
  }

  renderCard() { if (this.pre) this.pre.textContent = this.text(); }
}
