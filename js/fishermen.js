// ชาวบ้านปักเบ็ดในทุ่งนารอบบ้าน (นอกรั้ว)
// เย็น: เดินมาจากถนนแล้วปักคันเบ็ดไม้ไผ่ตามคันนา · กลางคืน: คาดไฟฉายมาตรวจเบ็ด · เช้า: เก็บคันเบ็ดพร้อมปลาที่ติด
import * as THREE from 'three';
import { makeHuman, Walker, box, cyl, M } from './farm3d.js';
import { bus } from './bus.js';

const rand = (a, b) => a + Math.random() * (b - a);
const FISH = ['ปลาช่อน', 'ปลาดุก', 'ปลาหมอ', 'ปลาไหล'];

// แต่ละคน: คันนาที่ใช้ (จุดเริ่ม → จุดสิ้นสุด), ทางเดินจากถนน, เวลาปัก / ตรวจกลางคืน / เก็บ
const PEOPLE = [
  { name: 'ลุงแดง', look: { shirt: '#6b5b4a', pants: '#2f3a45', hat: 'straw', skin: '#9c6a45' },
    from: [58, 0, 47], a: [58, 0, 40], b: [58, 0, -12], side: [1, 0], plant: 17.0, check: [20.5, 22.0], collect: 5.5 },
  { name: 'ป้าศรี', look: { shirt: '#7a4a5a', pants: '#3a3030', hat: 'straw', skin: '#a8714a', longHair: true },
    from: [-58, 0, 47], a: [-58, 0, 40], b: [-58, 0, -14], side: [-1, 0], plant: 17.4, check: [21.0, 22.5], collect: 6.0 },
  { name: 'น้าเอก', look: { shirt: '#4a5a6a', pants: '#2a2a2a', hat: 'cap', hatColor: '#3a4a3a', skin: '#b07a50' },
    from: [-40, 0, 50.5], a: [-40, 0, 58], b: [30, 0, 58], side: [0, 1], plant: 17.8, check: null, collect: 6.4 },
];

export class Fishermen {
  constructor(farm) {
    this.farm = farm; this.scene = farm.scene;
    this.catch = 0;
    const bamboo = new THREE.MeshStandardMaterial({ color: '#c2a865', roughness: 0.8 });
    const lineM = new THREE.MeshBasicMaterial({ color: '#d8d8d8', transparent: true, opacity: 0.6 });
    const fishM = new THREE.MeshStandardMaterial({ color: '#3b3a33', roughness: 0.5, metalness: 0.2 });
    this.people = PEOPLE.map((p, idx) => {
      // คันนา
      const A = new THREE.Vector3(...p.a), B = new THREE.Vector3(...p.b), len = A.distanceTo(B), mid = A.clone().add(B).multiplyScalar(0.5);
      const dike = box(p.side[0] ? 0.9 : len + 1, 0.24, p.side[0] ? len + 1 : 0.9, M.mud, mid.x, 0.1, mid.z, this.scene); dike.castShadow = false;
      // คันเบ็ดไม้ไผ่ปักเฉียงลงน้ำ ข้างคันนา
      const n = Math.floor(len / 4), rods = [];
      for (let k = 0; k <= n; k++) {
        const t = k / n, pos = A.clone().lerp(B, t);
        const g = new THREE.Group(); g.position.set(pos.x + p.side[0] * 0.55, 0.05, pos.z + p.side[1] * 0.55);
        const pole = new THREE.Group(); g.add(pole);
        pole.rotation.set(p.side[1] * 0.45, 0, -p.side[0] * 0.45);
        cyl(0.012, 0.02, 1.3, bamboo, 0, 0.65, 0, pole, 5);
        const line = new THREE.Mesh(new THREE.CylinderGeometry(0.003, 0.003, 1.05, 3), lineM); line.position.set(0, 1.3 - 0.52, 0); pole.add(line);
        const fish = new THREE.Mesh(new THREE.SphereGeometry(0.06, 8, 6), fishM); fish.scale.set(0.5, 0.5, 1.6); fish.position.set(0, 0.25, 0); fish.visible = false; pole.add(fish);
        g.visible = false; this.scene.add(g);
        rods.push({ g, pole, fish, stand: [pos.x, 0.2, pos.z], hooked: false });
      }
      // คน
      const h = makeHuman(p.look);
      const basket = cyl(0.13, 0.1, 0.26, new THREE.MeshStandardMaterial({ color: '#8a6a3a', roughness: 1 }), 0.28, 0.95, -0.05, h.group, 10); // ข้องใส่ปลา
      const bundle = new THREE.Group(); bundle.position.set(-0.15, 1.5, -0.1); bundle.rotation.z = 0.9; h.group.add(bundle);
      for (let i = 0; i < 6; i++) cyl(0.012, 0.012, 1.3, bamboo, rand(-0.05, 0.05), 0, rand(-0.05, 0.05), bundle, 4);
      h.group.visible = false; this.scene.add(h.group);
      const lamp = new THREE.SpotLight('#fff1d0', 0, 20, 0.5, 0.6, 1.3); lamp.position.set(0, 0.06, 0.15);
      const lt = new THREE.Object3D(); lt.position.set(0, -0.9, 4); h.head.add(lamp, lt); lamp.target = lt;
      const w = new Walker(h, 1.0);
      const ent = { id: 'VIL-' + (idx + 1), type: 'human', label: `ชาวบ้านปักเบ็ด (${p.name})`, villager: true, obj: h.group, h };
      void basket;
      return { ...p, h, w, rods, bundle, lamp, ent, act: 'away', actId: 0, task: '', present: false, done: {} };
    });
    this.applyInitialRods();
    bus.on('time', () => this.schedule());
    this.schedule();
  }

  // โหลดหน้าเว็บกลางคืน → คันเบ็ดต้องปักอยู่แล้ว / กลางวัน → ไม่มี
  applyInitialRods() {
    const h = this.farm.hour;
    for (const p of this.people) {
      const overnight = h >= p.plant + 1.6 || h < p.collect;
      p.rods.forEach(r => { r.g.visible = overnight; r.hooked = overnight && Math.random() < 0.3; });
    }
  }

  planFor(p, h) {
    if (h >= p.plant && h < p.plant + 1.6) return 'plant';
    if (p.check && h >= p.check[0] && h < p.check[1]) return 'check';
    if (h >= p.collect && h < p.collect + 1.6) return 'collect';
    return 'away';
  }

  schedule() {
    const h = this.farm.hour, day = new Date().toDateString();
    for (const p of this.people) {
      if (p.manual) continue; // กำลังทำตามคำสั่งจากเมนูจำลอง
      const plan = this.planFor(p, h);
      // เวลากระโดดออกนอกช่วงงานกลางคัน (เช่น เลื่อนแถบเวลา) → ให้กลับบ้านไปเลย
      if (plan === 'away' && p.present && p.act !== 'away') { p.actId++; p.act = 'away'; this.setPresent(p, false); }
      // ไม่มีคนอยู่ในนา: คันเบ็ดต้องตรงกับช่วงเวลา (ค้างคืน = ปักอยู่ / กลางวัน = เก็บแล้ว)
      if (!p.present && plan === 'away') {
        const overnight = h >= p.plant + 1.6 || h < p.collect;
        p.rods.forEach(r => { if (r.g.visible !== overnight) { r.g.visible = overnight; r.hooked = overnight && Math.random() < 0.3; r.fish.visible = false; } });
      }
      if (plan === p.act) continue;
      const key = day + plan;
      if (plan !== 'away' && p.done[key]) continue; // ทำรอบนี้ไปแล้ว
      this.start(p, plan, key);
    }
  }

  setPresent(p, on) {
    if (p.present === on) return;
    p.present = on; p.h.group.visible = on;
    const ents = this.farm.entities;
    if (on) ents.push(p.ent); else this.farm.entities = ents.filter(e => e !== p.ent);
  }

  start(p, act, key) {
    const id = ++p.actId, alive = () => id === p.actId;
    p.act = act; p.h.tapping = false; p.h.holding = false;
    const night = (this.farm.nightFactor || 0) > 0.3;
    p.lamp.intensity = act !== 'away' && night ? 7 : 0;
    p.bundle.visible = act === 'plant';
    if (act === 'away') {
      if (p.present) {
        p.task = 'เดินกลับบ้าน';
        p.w.go([[p.from[0], 0, p.from[2]], [p.from[0] + (p.side[1] ? -40 : 0), 0, p.from[2] + (p.side[1] ? 0 : 4)]], () => { if (alive()) this.setPresent(p, false); });
      }
      return;
    }
    if (act === 'plant') p.rods.forEach(r => { r.g.visible = false; r.hooked = false; r.fish.visible = false; });
    if (act !== 'plant') p.rods.forEach(r => (r.g.visible = true));
    if (!p.present) { p.h.group.position.set(p.from[0] + (p.side[1] ? -30 : 0), 0, p.from[2] + (p.side[1] ? 0 : 3)); this.setPresent(p, true); }
    p.task = { plant: 'เดินมาปักเบ็ด', check: 'ส่องไฟตรวจเบ็ด', collect: 'มาเก็บเบ็ด' }[act];
    if (act === 'plant') bus.emit('farm-event', `🎣 ${p.name} ถือคันเบ็ดไม้ไผ่มาปักในทุ่งนา`);
    const order = p.rods.slice();
    let i = 0;
    const step = () => {
      if (!alive()) return;
      if (i >= order.length) {
        p.done[key] = true; p.task = act === 'plant' ? 'ปักเบ็ดเสร็จแล้ว' : act === 'collect' ? 'เก็บเบ็ดเสร็จ' : 'ตรวจเบ็ดเสร็จ';
        p.act = 'away-pending'; this.start(p, 'away'); p.act = 'away'; p.manual = false;
        return;
      }
      const r = order[i++];
      p.w.go([r.stand], () => {
        if (!alive()) return;
        p.h.group.rotation.y = Math.atan2(r.g.position.x - p.h.group.position.x, r.g.position.z - p.h.group.position.z);
        p.h.tapping = true;
        setTimeout(() => {
          if (!alive()) return;
          p.h.tapping = false;
          if (act === 'plant') { r.g.visible = true; r.hooked = Math.random() < 0.35; p.task = `ปักเบ็ด ${i}/${order.length} คัน`; }
          else if (r.hooked) {
            r.fish.visible = true; this.catch++;
            const fish = FISH[Math.floor(Math.random() * FISH.length)];
            p.task = `ได้${fish}!`;
            if (Math.random() < 0.5) bus.emit('farm-event', `🐟 ${p.name} ได้${fish}จากเบ็ดในทุ่งนา`);
            setTimeout(() => { r.fish.visible = false; }, 1500);
            r.hooked = false;
            if (act === 'collect') setTimeout(() => (r.g.visible = false), 1500);
          } else {
            p.task = act === 'collect' ? `เก็บเบ็ด ${i}/${order.length}` : `ตรวจเบ็ด ${i}/${order.length}`;
            if (act === 'collect') r.g.visible = false;
          }
          step();
        }, act === 'plant' ? 1600 : 1100);
      }, true);
    };
    p.w.go([[p.from[0], 0, p.from[2]], p.a], step, true);
  }

  update(dt, t) {
    for (const p of this.people) {
      if (p.present) p.w.update(dt);
      p.lamp.intensity = p.present && (this.farm.nightFactor || 0) > 0.3 ? 7 : 0; // ไฟฉายคาดหัวตอนมืด
      // เบ็ดที่ปลาติด: ปลายคันกระตุก
      for (const r of p.rods) if (r.g.visible && r.hooked) r.pole.rotation.y = Math.sin(t * 9 + r.stand[2]) * 0.12;
    }
  }

  // เมนูจำลอง: ให้ชาวบ้านคนแรกที่ว่างออกมาปักเบ็ดเดี๋ยวนี้
  startNow() {
    const p = this.people.find(x => !x.present) || this.people[0];
    p.manual = true;
    this.start(p, 'plant', 'manual-' + Date.now());
    return p;
  }

  present() { return this.people.filter(p => p.present); }
  statusRow() {
    const n = this.present().length, rods = this.people.reduce((a, p) => a + p.rods.filter(r => r.g.visible).length, 0);
    if (!n && !rods) return '';
    return `<div class="st"><span>🎣 ชาวบ้านปักเบ็ด</span><b>${n} คน · เบ็ด ${rods} คัน · ปลา ${this.catch} ตัว</b></div>`;
  }
}
