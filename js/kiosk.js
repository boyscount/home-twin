// โหมดทีวี / Kiosk: เต็มจอ ซ่อนเมนู กล้องเล่าเรื่องวนตลอด จอไม่ดับ และขึ้นป้ายใหญ่พร้อมรูปเมื่อมีคนมาที่บ้าน
// เปิดจากปุ่ม 📺 หรือเข้าลิงก์ ?kiosk=1 (เบราว์เซอร์ต้องให้แตะ 1 ครั้งก่อนจึงเต็มจอได้)
// สลับ 2 ช่วงวนไปเรื่อย ๆ: กล้องเล่าเรื่อง ~2 นาที → หมุนรอบบ้านช้า ๆ 45 วินาที (มีคนมา → ตัดไปเล่าเรื่องทันที)
const TOUR_SEC = 120, ORBIT_SEC = 45;
import { bus } from './bus.js';

export class Kiosk {
  constructor({ farm, tour, showTab }) {
    this.farm = farm; this.tour = tour; this.showTab = showTab;
    this.on = false;
    this.el = document.getElementById('kioskHud');
    this.clockEl = this.el.querySelector('.k-clock');
    this.dateEl = this.el.querySelector('.k-date');
    this.wxEl = this.el.querySelector('.k-wx');
    this.famEl = this.el.querySelector('.k-family');
    this.banner = document.getElementById('kioskBanner');
    document.getElementById('btnKiosk').addEventListener('click', () => this.toggle());
    this.el.querySelector('.k-exit').addEventListener('click', () => this.exit());
    document.addEventListener('fullscreenchange', () => { if (!document.fullscreenElement && this.on && this.wasFull) this.exit(); });
    document.addEventListener('keydown', e => { if (e.key === 'Escape' && this.on) this.exit(); });
    document.addEventListener('visibilitychange', () => { if (this.on && document.visibilityState === 'visible') this.keepAwake(); });
    // ขยับเมาส์ → โชว์ปุ่มออกชั่วคราว, นิ่ง 3 วิ → ซ่อนเคอร์เซอร์
    let idleT;
    document.addEventListener('pointermove', () => {
      if (!this.on) return;
      document.body.classList.remove('kiosk-idle');
      clearTimeout(idleT); idleT = setTimeout(() => document.body.classList.add('kiosk-idle'), 3000);
    });
    bus.on('alert-photo', a => { this.alertId = a.id; this.showBanner('⚠ มีคนมาที่หน้าบ้าน', (a.desc ? a.desc + ' · ' : '') + 'แตะเพื่อดูเรดาร์', a.img, 'warn'); });
    this.banner.addEventListener('click', () => { if (!this.banner.classList.contains('warn')) return; this.exit(); bus.emit('open-radar', { id: this.alertId }); });
    bus.on('alert', () => { if (this.on && this.phase === 'orbit') this.tourPhase(); });
    bus.on('known-arrival', a => this.showBanner(`✅ ${a.name} มาถึงบ้านแล้ว`, 'ระบบจดจำใบหน้าได้', a.img, 'ok'));
    bus.on('bbq', on => { if (on) this.showBanner('🍖 ได้เวลาหมูกะทะ', 'ครอบครัวตั้งวงกินข้าวเย็นหน้าบ้าน', null, 'info'); });
    setInterval(() => this.renderHud(), 1000);
    if (new URLSearchParams(location.search).get('kiosk') === '1') {
      this.enter(false);
      const once = () => { this.goFull(); document.removeEventListener('pointerdown', once); };
      document.addEventListener('pointerdown', once);
    }
  }

  toggle() { this.on ? this.exit() : this.enter(true); }

  async goFull() {
    try { if (!document.fullscreenElement) { await document.documentElement.requestFullscreen(); this.wasFull = true; } } catch { /* ไม่รองรับก็ใช้แบบไม่เต็มจอ */ }
  }

  async keepAwake() {
    try { this.lock = await navigator.wakeLock?.request('screen'); } catch { /* บางเบราว์เซอร์ไม่รองรับ */ }
  }

  enter(full) {
    this.on = true;
    this.showTab('farm');
    document.body.classList.add('kiosk');
    this.el.hidden = false;
    this.prevIdle = this.tour.idleSeconds; this.tour.idleSeconds = 8; // แตะแล้วกลับมาเล่าเรื่องเองเร็วขึ้น
    this.userRot = this.farm.controls.autoRotate;
    this.tourPhase();
    clearInterval(this.phaseTimer); this.phaseTimer = setInterval(() => this.phaseTick(), 1000);
    if (full) this.goFull();
    this.keepAwake();
    setTimeout(() => this.farm.resize(), 100);
    this.renderHud();
  }

  exit() {
    this.on = false; this.wasFull = false;
    document.body.classList.remove('kiosk', 'kiosk-idle');
    this.el.hidden = true; this.banner.hidden = true;
    this.tour.idleSeconds = this.prevIdle || 30;
    clearInterval(this.phaseTimer); this.phase = null;
    this.tour.stop();
    this.farm.controls.autoRotate = this.userRot ?? this.farm.controls.autoRotate;
    if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
    this.lock?.release?.().catch(() => {}); this.lock = null;
    setTimeout(() => this.farm.resize(), 100);
  }

  tourPhase() {
    this.phase = 'tour'; this.left = TOUR_SEC;
    this.tour.start();
  }

  orbitPhase() {
    this.phase = 'orbit'; this.left = ORBIT_SEC;
    this.farm.flyTo('overview'); // flyTo หยุดกล้องเล่าเรื่องให้ด้วย
    this.farm.controls.autoRotate = true;
  }

  phaseTick() {
    if (!this.on) return;
    if (this.phase === 'orbit') { this.tour.idle = 0; this.farm.controls.autoRotate = true; } // กันกล้องเล่าเรื่องเริ่มเองระหว่างหมุน
    if (--this.left > 0) return;
    if (this.phase === 'tour') this.orbitPhase(); else this.tourPhase();
  }

  renderHud() {
    if (!this.on) return;
    const now = new Date();
    this.clockEl.textContent = now.toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' });
    this.dateEl.textContent = now.toLocaleDateString('th-TH', { weekday: 'long', day: 'numeric', month: 'long' });
    const wx = document.querySelector('#wxStatus b')?.textContent;
    const temp = document.querySelector('[data-m="weather/temp"]')?.textContent;
    this.wxEl.textContent = [wx, temp && temp !== '-' ? `${temp}°C` : ''].filter(Boolean).join(' · ');
    const f = this.farm;
    this.famEl.innerHTML = [['พ่อ', f.fatherState], ['พี่สาว', f.sis.task], ['น้องสาว', f.kid.task]]
      .map(([n, t]) => `<div><b>${n}</b> ${t}</div>`).join('');
  }

  showBanner(title, sub, img, kind) {
    if (!this.on) return;
    const b = this.banner;
    b.className = 'kiosk-banner ' + kind;
    b.innerHTML = `${img ? `<img src="${img}" alt="">` : ''}<div><div class="kb-title"></div><div class="kb-sub"></div></div>`;
    b.querySelector('.kb-title').textContent = title;
    b.querySelector('.kb-sub').textContent = sub;
    b.hidden = false;
    clearTimeout(this.bannerT); this.bannerT = setTimeout(() => (b.hidden = true), 15000);
  }
}
