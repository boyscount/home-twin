// เมนู "จำลองเหตุการณ์": รวมทุกอย่างที่สั่งได้ไว้ที่เดียว ปุ่มใหญ่ กดง่ายทั้งมือถือ แท็บเล็ต คอม
// กดแล้วจะสลับมาที่แท็บ 3D และบินกล้องไปจุดที่เกิดเหตุการณ์ให้เห็นผลทันที
import { bus, toast } from './bus.js';

export class Simulator {
  constructor({ farm, hub, radar, tour, festivals, setWx, setHour, showTab }) {
    Object.assign(this, { farm, hub, radar, tour, festivals, setWx, setHour, showTab });
    this.sheet = document.getElementById('simSheet');
    this.body = this.sheet.querySelector('.sim-body');
    this.keepOpen = false;
    document.getElementById('simFab').addEventListener('click', () => this.open());
    this.sheet.querySelector('.sim-close').addEventListener('click', () => this.close());
    this.sheet.addEventListener('click', e => { if (e.target === this.sheet) this.close(); });
    document.addEventListener('keydown', e => { if (e.key === 'Escape') this.close(); });
    this.sheet.querySelector('#simKeep').addEventListener('change', e => (this.keepOpen = e.target.checked));
    this.build();
    bus.on('cmd', () => this.refreshStates());
  }

  groups() {
    const f = this.farm, dev = f.devices;
    const cmd = (device, value) => bus.emit('cmd', { device, value, source: 'เมนูจำลอง' });
    const force = fx => this.hub.force(fx);
    return [
      { title: '👥 คน', items: [
        { icon: '🚶', label: 'คนแปลกหน้ามาที่ประตู', cam: 'gate', run: () => f.spawnVisitor(null, true) },
        { icon: '👋', label: 'คนที่รู้จักมาเยี่ยม', cam: 'gate', run: () => {
          const ok = f.spawnKnownVisitor(this.radar.known.map(k => k.id));
          if (!ok) return 'ยังไม่มีคนที่รู้จัก — กด “รู้จัก” ที่การแจ้งเตือนในแท็บเรดาร์ก่อน';
        } },
        { icon: '📚', label: 'นักเรียนมาเรียนภาษาอังกฤษ', cam: 'school', run: () => { if (f.school.active) f.endClass(); else f.startClass(); } },
        { icon: '🎣', label: 'ชาวบ้านมาปักเบ็ด', cam: 'field', run: () => f.fishers.startNow() },
        { icon: '🍖', label: 'ครอบครัวกินหมูกะทะ', cam: 'bbq', run: () => (f.bbq.active ? f.endBBQ() : f.startBBQ()) },
      ] },
      { title: '🐾 สัตว์', items: [
        { icon: '🐖', label: 'พ่อให้อาหารหมู', cam: 'pig', run: () => cmd('pig-feeder') },
        { icon: '🐟', label: 'น้องสาวให้อาหารปลา', cam: 'pond', run: () => f.kidFeedFish() },
        { icon: '🥚', label: 'พี่สาวไปเก็บไข่ไก่', cam: 'chicken', run: () => f.sisCollectEggs() },
        { icon: '🐕', label: 'หมาเห่า / วิ่งหาคน', cam: 'gate', run: () => { f.spawnVisitor(null, true); bus.emit('alert', { id: 'dog' }); } },
      ] },
      { title: '🌦️ อากาศ', items: [
        { icon: '☀️', label: 'แจ่มใส', run: () => this.setWx('clear') },
        { icon: '☁️', label: 'เมฆครึ้ม', run: () => this.setWx('cloudy') },
        { icon: '🌧️', label: 'ฝนตก', run: () => this.setWx('rain') },
        { icon: '⛈️', label: 'พายุฝนฟ้าคะนอง', cam: 'overview', run: () => this.setWx('storm') },
        { icon: '⚡', label: 'ฟ้าผ่าตอนนี้', cam: 'overview', run: () => f.wx.strike() },
        { icon: '🌐', label: 'อากาศจริงตอนนี้', run: () => this.setWx('real') },
      ] },
      { title: '🕒 เวลา', items: [
        { icon: '🌫️', label: 'เช้ามืดมีหมอก 06:15', cam: 'overview', run: () => this.setHour(6.25) },
        { icon: '☀️', label: 'เที่ยง 12:00', run: () => this.setHour(12) },
        { icon: '🌇', label: 'ตะวันตกดิน 17:45', cam: 'overview', run: () => this.setHour(17.75) },
        { icon: '🌙', label: 'ค่ำ 20:30', cam: 'house', run: () => this.setHour(20.5) },
        { icon: '💤', label: 'ดึก ทุกคนหลับ 23:00', cam: 'house', run: () => this.setHour(23) },
        { icon: '🔦', label: 'ตีสอง พ่อไปกรีดยาง', cam: 'rubber', run: () => this.setHour(2.4) },
      ] },
      { title: '⚠️ เซนเซอร์ผิดปกติ', items: [
        { icon: '🥬', label: 'pH ผักสูงเกิน', cam: 'hydro', run: () => force({ 'hydro/ph': 7.4 }) },
        { icon: '💧', label: 'น้ำในถังผักต่ำ', cam: 'hydro', run: () => force({ 'hydro/level': 18 }) },
        { icon: '🐟', label: 'ออกซิเจนบ่อต่ำ', cam: 'pond', run: () => force({ 'pond/do': 2.6 }) },
        { icon: '🌾', label: 'อาหารหมูใกล้หมด', cam: 'pig', run: () => force({ 'pig/feed': 9 }) },
        { icon: '🌡️', label: 'คอกหมูร้อนเกิน', cam: 'pig', run: () => force({ 'pig/temp': 35.5 }) },
      ] },
      { title: '🛰️ อุปกรณ์', items: [
        { icon: '💡', label: 'ไฟสปอตไลท์รอบบ้าน', cam: 'house', state: () => dev.lights, run: () => cmd('lights', !dev.lights) },
        { icon: '🚪', label: 'ประตูรั้วหน้าบ้าน', cam: 'gate', state: () => !dev.gateClosed, run: () => cmd('gate', !!dev.gateClosed) },
        { icon: '🐔', label: 'ประตูเล้าไก่', cam: 'chicken', state: () => dev.chickenDoor, run: () => cmd('chicken-door', !dev.chickenDoor) },
        { icon: '🌀', label: 'ปั๊มน้ำวน NFT', cam: 'hydro', state: () => dev.pump, run: () => cmd('hydro-pump', !dev.pump) },
        { icon: '🫧', label: 'เครื่องเติมอากาศบ่อปลา', cam: 'pond', state: () => dev.aerator, run: () => cmd('aerator', !dev.aerator) },
        { icon: '🔦', label: 'ไฟฉายติดกล้อง', state: () => f.camLightManual, run: () => { f.camLightManual = !f.camLightManual; f.setCamLight(f.camLightManual); } },
      ] },
      { title: '🎬 โชว์', items: [
        { icon: '🎬', label: 'กล้องเล่าเรื่อง', run: () => this.tour.start(), noCam: true },
        { icon: '🚗', label: 'มีรถขับผ่าน', cam: 'gate', run: () => { f.spawnVehicle(); const v = f.vehicles.at(-1); v.g.position.x = -v.dir * 70; } },
        { icon: '🎆', label: 'เทศกาลปีใหม่ (พลุ)', cam: 'overview', run: () => { this.festivals.setMode('newyear'); if ((f.nightFactor || 0) < 0.5) this.setHour(20.5); } },
        { icon: '🪷', label: 'ลอยกระทง', cam: 'pond', run: () => { this.festivals.setMode('loykrathong'); if ((f.nightFactor || 0) < 0.5) this.setHour(20.5); } },
        { icon: '💦', label: 'สงกรานต์', cam: 'house', run: () => { this.festivals.setMode('songkran'); this.setHour(11); } },
        { icon: '↩️', label: 'กลับเป็นปกติ', cam: 'overview', run: () => { this.festivals.setMode('auto'); this.setWx('clear'); } },
      ] },
    ];
  }

  build() {
    this.body.innerHTML = '';
    this.items = [];
    for (const g of this.groups()) {
      const sec = document.createElement('section'); sec.className = 'sim-group';
      sec.innerHTML = `<h4>${g.title}</h4><div class="sim-grid"></div>`;
      const grid = sec.querySelector('.sim-grid');
      for (const it of g.items) {
        const b = document.createElement('button'); b.type = 'button'; b.className = 'sim-btn';
        b.innerHTML = `<span class="sim-ico">${it.icon}</span><span class="sim-label"></span>${it.state ? '<span class="sim-state"></span>' : ''}`;
        b.querySelector('.sim-label').textContent = it.label;
        b.addEventListener('click', () => this.run(it));
        grid.appendChild(b);
        this.items.push({ it, b });
      }
      this.body.appendChild(sec);
    }
    this.refreshStates();
  }

  refreshStates() {
    for (const { it, b } of this.items || []) {
      if (!it.state) continue;
      const on = !!it.state();
      b.classList.toggle('on', on);
      b.querySelector('.sim-state').textContent = on ? 'เปิด' : 'ปิด';
    }
  }

  run(it) {
    this.tour.stop();
    this.showTab('farm');
    let msg;
    try { msg = it.run(); } catch (e) { msg = 'ทำไม่ได้: ' + e.message; }
    if (!it.noCam && it.cam) this.farm.flyTo(it.cam);
    toast(typeof msg === 'string' ? msg : `${it.icon} ${it.label}`);
    this.refreshStates();
    if (!this.keepOpen) this.close();
  }

  open() { this.refreshStates(); this.sheet.hidden = false; setTimeout(() => this.sheet.classList.add('show'), 20); }
  close() { this.sheet.classList.remove('show'); setTimeout(() => (this.sheet.hidden = true), 220); }
}
