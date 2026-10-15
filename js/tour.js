// กล้องเล่าเรื่อง: ปล่อยไว้เฉย ๆ แล้วกล้องจะค่อย ๆ พาไปดูแต่ละจุดและติดตามคนในบ้าน พร้อมคำบรรยาย
// ช็อตคำนวณตำแหน่งกล้องใหม่ทุกเฟรมตามตัวละครจริง แล้วค่อย ๆ เลื่อนไปหา → การเปลี่ยนช็อตจึงเป็นการแพนนุ่ม ๆ ไม่ใช่ตัดภาพ
import * as THREE from 'three';
import { bus, store } from './bus.js';

const V = (x, y, z) => new THREE.Vector3(x, y, z);
const IDLE_SECONDS = 30;

export class Tour {
  constructor(farm) {
    this.f = farm;
    this.active = false;
    this.auto = store.get('autoTour', true);
    this.idle = 0;
    this.i = -1;
    this.t = 0;
    this.seen = new Set();
    this.view = document.getElementById('view-farm');
    this.capEl = document.getElementById('tourCap');
    this.titleEl = this.capEl.querySelector('.tc-title');
    this.subEl = this.capEl.querySelector('.tc-sub');
    this.barEl = this.capEl.querySelector('.tc-bar i');
    this.shots = this.buildShots();
    this.capTimer = 0;
    // ผู้ใช้แตะ/ลาก/ซูมฉาก → หยุดเล่าเรื่องและคืนการควบคุม
    const canvas = farm.renderer.domElement;
    for (const ev of ['pointerdown', 'wheel', 'touchstart']) canvas.addEventListener(ev, () => this.interact(), { passive: true });
    window.addEventListener('keydown', () => this.interact());
  }

  // ---------------------------------------------------------------- shot helpers
  orbit(center, radius, height, speed) {
    let a0;
    return {
      init: () => { const c = this.f.camera.position; a0 = Math.atan2(c.z - center.z, c.x - center.x); },
      cam: (t) => {
        const a = a0 + t * speed;
        return { pos: V(center.x + Math.cos(a) * radius, height, center.z + Math.sin(a) * radius), target: center.clone() };
      },
    };
  }

  // ตามตัวละคร: angle = มุมกล้องเทียบกับทิศที่ตัวละครหัน (0 = ตรงหน้า, π = ด้านหลัง)
  follow(getObj, dist, height, angle, lookUp = 1) {
    let heading = 0, drift = 0;
    return {
      init: () => { const o = getObj(); heading = o ? o.rotation.y : 0; drift = 0; },
      cam: (t, dt) => {
        const o = getObj(); if (!o) return null;
        let diff = o.rotation.y - heading; diff = Math.atan2(Math.sin(diff), Math.cos(diff));
        heading += diff * Math.min(1, dt * 0.8); // หันตามช้า ๆ ไม่ให้กล้องสะบัด
        drift += dt * 0.06;
        const a = heading + angle + Math.sin(drift) * 0.5;
        const p = o.position;
        return { pos: V(p.x + Math.sin(a) * dist, p.y + height, p.z + Math.cos(a) * dist), target: V(p.x, p.y + lookUp, p.z) };
      },
    };
  }

  dolly(from, to, tFrom, tTo, dur) {
    return {
      cam: (t) => {
        const k = Math.min(1, t / dur), e = k * k * (3 - 2 * k);
        return { pos: from.clone().lerp(to, e), target: tFrom.clone().lerp(tTo, e) };
      },
    };
  }

  // ---------------------------------------------------------------- the story
  buildShots() {
    const f = this.f;
    const hh = () => { const h = f.hour; return `${String(Math.floor(h)).padStart(2, '0')}:${String(Math.floor((h % 1) * 60)).padStart(2, '0')} น.`; };
    const wx = () => document.querySelector('#wxStatus b')?.textContent || (f.wxState?.rain > 0.3 ? 'ฝนตก' : 'อากาศดี');
    const awakeCat = () => { const cs = f.cats.filter(c => !(c.sleep > 0)); return (cs.length ? cs : f.cats)[Math.floor(Math.random() * (cs.length || f.cats.length))]; };
    let cat = null;
    return [
      { id: 'intro', dur: 11, title: () => 'บ้านสวนของเรา', sub: () => `${hh()} · ${wx()} · ครอบครัว 4 คน กับสัตว์เลี้ยงอีกเต็มบ้าน`,
        ...this.orbit(V(2, 0, 2), 78, 40, 0.05) },
      { id: 'bbq', dur: 13, when: () => f.bbq.active, title: () => '🍖 หมูกะทะหน้าบ้าน',
        sub: () => { const n = f.cats.filter(c => c.group.position.distanceTo(f.bbq.center) < 3).length; return `พ่อ แม่ พี่สาว น้องสาว ล้อมวงกินหมูกะทะ${n ? ` · แมว ${n} ตัวมานั่งรอขอกิน` : ''}`; },
        ...this.orbit(V(2, 0.9, 15.5), 4.4, 2.5, 0.1) },
      { id: 'class', dur: 13, when: () => f.school.active, title: () => '📚 พี่สาวสอนภาษาอังกฤษ',
        sub: () => { const sc = f.school, n = sc.kids.filter(k => k.sitting).length; return n < sc.kids.length ? `นักเรียนกำลังเดินมา (${n}/${sc.kids.length} คนนั่งแล้ว)` : `English Class: ${sc.lesson.topic} · นักเรียน ${n} คน${sc.kids.some(k => k.h.handUp > 0) ? ' · มีคนยกมือถาม' : ''}`; },
        ...this.orbit(V(-25, 1.2, 25.6), 7, 3.6, 0.08) },
      { id: 'road', dur: 9, lerp: 5, when: () => !!this.pickCar(), // รถวิ่งเร็ว → กล้องต้องตามไวกว่าช็อตอื่น
        init: () => { this.car = this.pickCar(); },
        title: () => 'ถนนหน้าบ้าน', sub: () => `${this.car?.label || 'รถ'} กำลังขับผ่าน · วันนี้มีรถผ่านหน้าบ้านแล้ว ${f.carsToday} คัน`,
        ...this.wrapFollow(() => (this.car && !this.car.dead ? this.car.g : null), 9, 3.2, 1.1, 1) },
      { id: 'house', dur: 11, title: () => 'บ้าน', sub: () => 'แม่อยู่ในบ้าน · ระเบียงไม้หน้าบ้านมีแมวชอบมานอน',
        ...this.dolly(V(-16, 3.2, 21), V(9, 3.6, 19), V(-6, 1.6, 4), V(-1, 1.6, 2), 11) },
      { id: 'dad', dur: 13, title: () => 'พ่อ', sub: () => f.fatherState, ...this.follow(() => f.dad.h.group, 6.5, 2.6, 0.9, 1.3) },
      { id: 'pigs', dur: 10, title: () => 'คอกหมู', sub: () => `หมู ${f.pigs.length} ตัว · ${f.feedLeft > 0 ? 'กำลังกินอาหารที่พ่อเทให้' : 'เดินเล่นในคอก รอเวลาอาหาร'}`,
        ...this.orbit(V(30, 0.5, -2), 13, 6.5, 0.12) },
      { id: 'sis', dur: 13, title: () => 'พี่สาว', sub: () => f.sis.task, ...this.follow(() => f.sis.h.group, 5.5, 2.4, 2.2, 1.2) },
      { id: 'kid', dur: 12, title: () => 'น้องสาว', sub: () => f.kid.task + (f.fishFeed > 0 ? ' — ปลาว่ายมารอเต็มขอบบ่อ' : ''), ...this.follow(() => f.kid.h.group, 4.2, 1.9, 0.7, 0.8) },
      { id: 'cats', dur: 10, init: () => { cat = awakeCat(); },
        title: () => `แมว 6 ตัว — เจ้า${cat?.name || ''}`,
        sub: () => { const s = f.cats.filter(c => c.sleep > 0).map(c => c.name); return s.length ? `ตอนนี้ ${s.join(', ')} กำลังนอนขด` : 'ตื่นกันครบทุกตัว เดินเล่นรอบบ้าน'; },
        ...this.wrapFollow(() => cat?.group, 2.6, 1.7, 0.8, 0.3) },
      { id: 'pond', dur: 10, title: () => 'บ่อปลา', sub: () => (f.fishFeed > 0 ? 'ปลากำลังรอกินอาหารจากน้องสาว' : `ปลา ${f.fish.length} ตัวว่ายวน`) + (f.devices.aerator ? ' · เครื่องเติมอากาศทำงาน' : ''),
        ...this.orbit(V(14, 0, 22), 9, 5, 0.14) },
      { id: 'chicken', dur: 10, title: () => 'เล้าไก่', sub: () => `ไก่ ${f.chickens.length} ตัว · ประตูเล้า${f.devices.chickenDoor ? 'เปิด ไก่ออกมาคุ้ยดิน' : 'ปิด'}`,
        ...this.orbit(V(30, 0.4, 18), 10, 4.5, -0.12) },
      { id: 'hydro', dur: 11, title: () => 'โรงเรือนผักไฮโดรโปนิกส์', sub: () => `ผักสลัด 600 ต้น · ปั๊มน้ำวน NFT ${f.devices.pump ? 'ทำงาน' : 'หยุด'}`,
        ...this.dolly(V(-24.9, 2.4, 19), V(-24.9, 2.0, 1), V(-25.5, 1, 9), V(-25.5, 1, -8), 11) },
      { id: 'rubber', dur: 14, title: () => 'สวนยางพารา 400 ต้น', sub: () => '20 แถว · ระยะปลูก 3 × 7 เมตร · กรีดยางช่วงตี 2 – 6',
        ...this.dolly(V(0, 5, -8), V(0, 7, -110), V(0, 4, -30), V(0, 4, -140), 14) },
    ];
  }

  wrapFollow(getObj, dist, height, angle, lookUp) {
    const fo = this.follow(getObj, dist, height, angle, lookUp);
    return { cam: fo.cam, init2: fo.init };
  }

  // เลือกคันที่กำลังวิ่งเข้าหาหน้าบ้าน (ยังไม่ผ่าน และอยู่ไม่ไกลเกิน)
  pickCar() { return this.f.vehicles.find(v => !v.dead && v.dir * v.g.position.x < -30 && v.dir * v.g.position.x > -120); }

  visitorShot(v) {
    return {
      id: 'visitor', dur: 13, title: () => '⚠ มีคนมาที่หน้าบ้าน', sub: () => (v.persona?.desc ? v.persona.desc + ' · ' : '') + 'เรดาร์ตรวจจับและกำลังส่งรูปเข้ามือถือ',
      ...this.follow(() => v.h.group, 5, 2.2, 0.35, 1.5),
    };
  }

  // ---------------------------------------------------------------- control
  start() {
    if (this.active) return;
    this.active = true; this.f.flying = null;
    this.i = -1; this.next();
    this.view.classList.add('tour-on');
    this.f.setLabels(false); // ป้ายโซนรกภาพตอนเล่าเรื่อง
    this.capEl.hidden = false;
    bus.emit('tour', true);
  }

  stop() {
    if (!this.active) return;
    this.active = false; this.idle = 0;
    this.view.classList.remove('tour-on');
    this.f.setLabels(document.getElementById('labelToggle')?.checked ?? true);
    this.capEl.hidden = true;
    bus.emit('tour', false);
  }

  toggle() { this.active ? this.stop() : this.start(); }
  setAuto(on) { this.auto = on; this.idle = 0; store.set('autoTour', on); }
  interact() { this.idle = 0; if (this.active) this.stop(); }

  next(shot) {
    if (shot) this.shot = shot;
    else {
      for (let n = 0; n < this.shots.length; n++) { // ข้ามช็อตที่ยังไม่มีเหตุการณ์ (เช่น ยังไม่มีรถผ่าน)
        this.i = (this.i + 1) % this.shots.length; this.shot = this.shots[this.i];
        if (!this.shot.when || this.shot.when()) break;
      }
    }
    this.t = 0;
    this.shot.init?.(); this.shot.init2?.();
    this.titleEl.textContent = this.shot.title();
    this.subEl.textContent = this.shot.sub();
    this.capEl.classList.remove('show'); void this.capEl.offsetWidth; this.capEl.classList.add('show');
  }

  update(dt) {
    if (!this.active) {
      if (this.auto && this.f.visible && !document.querySelector('dialog[open]')) { this.idle += dt; if (this.idle > IDLE_SECONDS) this.start(); }
      return;
    }
    // คนแปลกหน้าเข้ามา → ตัดไปดูทันที (ครั้งเดียวต่อคน)
    const v = this.f.visitors.find(v => v.h.group.position.z < 40 && !this.seen.has(v));
    if (v && this.shot?.id !== 'visitor') { this.seen.add(v); this.i = Math.max(-1, this.i - 1); this.next(this.visitorShot(v)); }
    // เริ่มตั้งวงหมูกะทะ → ไปดูก่อนเลย
    if (this.f.bbq.active && !this.bbqShown && this.shot?.id !== 'visitor') { this.bbqShown = true; const k = this.shots.findIndex(x => x.id === 'bbq'); this.i = k - 1; this.next(); }
    if (!this.f.bbq.active) this.bbqShown = false;
    if (this.f.school.active && !this.classShown && this.shot?.id !== 'visitor') { this.classShown = true; const k = this.shots.findIndex(x => x.id === 'class'); this.i = k - 1; this.next(); }
    if (!this.f.school.active) this.classShown = false;

    this.t += dt;
    if (this.t > this.shot.dur) this.next();
    const d = this.shot.cam(this.t, dt);
    if (!d) { this.next(); return; }
    const k = 1 - Math.exp(-dt * (this.shot.lerp || 1.1));
    this.f.camera.position.lerp(d.pos, k);
    this.f.controls.target.lerp(d.target, k);

    this.barEl.style.width = Math.min(100, (this.t / this.shot.dur) * 100) + '%';
    this.capTimer -= dt;
    if (this.capTimer < 0) { this.capTimer = 0.5; this.subEl.textContent = this.shot.sub(); this.titleEl.textContent = this.shot.title(); }
  }
}
