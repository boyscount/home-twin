// เรดาร์จิ๋วมุมขวาบนของแท็บ 3D — วาดวงเรดาร์ชุดเดียวกับแท็บเรดาร์ (radar.drawScope)
// แตะ = เปิดแท็บเรดาร์ (ล็อกเป้าให้) · เจอคนแปลกหน้า = ขยายใหญ่กลางจอ ~10 วิ แล้วหดกลับมุม (ขอบแดงจนกว่าจะตอบ)
import { bus } from './bus.js';

const BIG_MS = 10000; // เด้งใหญ่ค้างไว้กี่มิลลิวินาทีก่อนหดกลับมุมจอ

export class MiniRadar {
  constructor({ radar, farm, open }) {
    this.radar = radar; this.farm = farm;
    this.el = document.getElementById('miniRadar');
    this.cv = this.el.querySelector('canvas'); this.ctx = this.cv.getContext('2d');
    this.tag = this.el.querySelector('.mr-tag');
    this.el.addEventListener('click', e => { e.stopPropagation(); open(this.lockId && radar.blips.has(this.lockId) ? this.lockId : this.threatId()); });
    bus.on('alert', e => this.alert(e?.id));
    bus.on('radar-known', () => this.check());
    bus.on('radar-threat', () => this.check());
    let n = 0;
    // วงเล็กไม่ต้องลื่นเท่าภาพ 3D: ปกติวาด ~20 fps · ตอนขยายใหญ่ ~30 fps · แท็บซ่อนอยู่ไม่วาด
    const loop = now => { requestAnimationFrame(loop); if (!this.farm.visible || document.hidden) return; if (++n % (this.el.classList.contains('big') ? 2 : 3) === 0) this.draw(now); };
    requestAnimationFrame(loop);
  }

  threatId() {
    for (const t of this.radar.tracked.values()) if (t.status === 'pending' || t.status === 'threat') return t.id;
    return null;
  }

  // คนแปลกหน้าเข้าเขตรั้ว → ขยายใหญ่กลางจอ ล็อกเป้า แล้วหดกลับ
  alert(id) {
    if (!id || id === 'dog') return;
    this.lockId = id; this.radar.selected = id;
    this.el.classList.add('big');
    clearTimeout(this.bigT); this.bigT = setTimeout(() => this.el.classList.remove('big'), BIG_MS);
  }

  // มีคนตอบแล้ว (ในเว็บ / Telegram / แจ้งเตือนมือถือ) → ไม่ต้องค้างวงใหญ่ต่อ
  check() {
    const t = !!this.threatId();
    this.el.classList.toggle('threat', t);
    if (!t) { clearTimeout(this.bigT); this.el.classList.remove('big'); }
  }

  draw(now) {
    const el = this.el, size = el.clientWidth; if (!size) return;
    const dpr = Math.min(devicePixelRatio, 2), px = Math.round(size * dpr);
    if (this.cv.width !== px) { this.cv.width = this.cv.height = px; }
    const c = this.ctx; c.setTransform(dpr, 0, 0, dpr, 0, 0); c.clearRect(0, 0, size, size);
    // แผนที่ใต้เรดาร์: ในแท็บ 3D ถ่ายใหม่ทุก 2 นาทีพอ (การถ่ายแต่ละครั้งต้องวาดฉากเพิ่ม 1 รอบ)
    if (!this.radar.mapImg || now - (this.mapAt || 0) > 120000) { this.mapAt = now; this.radar.refreshMap(true); }
    const big = el.classList.contains('big'), R = size / 2;
    this.radar.drawScope(c, R, R, R - 1, now, { mini: true, labels: big && size > 260 });
    // จุดติดตั้งเรดาร์ตรงกลาง
    c.fillStyle = '#39ff6a'; c.beginPath(); c.arc(R, R, big ? 3.5 : 2.2, 0, Math.PI * 2); c.fill();
    const threats = [...this.radar.tracked.values()].filter(t => t.status === 'pending' || t.status === 'threat').length;
    el.classList.toggle('threat', threats > 0);
    const txt = threats ? `⚠ ${threats} · ${this.radar.range}m` : `RADAR ${this.radar.range}m`;
    if (this.tag.textContent !== txt) this.tag.textContent = txt;
  }
}
