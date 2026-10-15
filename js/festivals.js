// เทศกาลตามวันที่จริง: ปีใหม่ (พลุ), สงกรานต์ (สาดน้ำ), ลอยกระทง (กระทงในบ่อ + โคมลอย), วันแม่, วันพ่อ, วันเด็ก
// เลือก "ดูตัวอย่าง" จากแผงควบคุมได้ ถ้าวันนี้ไม่ตรงกับเทศกาลไหน
import * as THREE from 'three';
import { bus, store } from './bus.js';

const rand = (a, b) => a + Math.random() * (b - a);

// วันลอยกระทง (ขึ้น 15 ค่ำ เดือน 12) เปลี่ยนทุกปี — ค่าประมาณ ควรตรวจกับปฏิทินจริงทุกปี
const LOY_KRATHONG = ['2025-11-05', '2026-11-24', '2027-11-13', '2028-11-02', '2029-11-20', '2030-11-09'];

export const FESTIVALS = {
  newyear: { name: 'สวัสดีปีใหม่', emoji: '🎆', colors: ['#ff4d4d', '#ffd43b', '#4dabf7', '#69db7c', '#f783ac'], desc: 'พลุเต็มฟ้าเหนือบ้านสวน' },
  songkran: { name: 'สุขสันต์วันสงกรานต์', emoji: '💦', colors: ['#ff922b', '#fcc419', '#4dabf7', '#f06595', '#51cf66'], desc: 'น้องสาวกับพี่สาวเล่นสาดน้ำหน้าบ้าน' },
  loykrathong: { name: 'ลอยกระทง', emoji: '🪷', colors: ['#ffd43b', '#ff922b', '#fff3bf'], desc: 'กระทงลอยในบ่อปลา โคมลอยขึ้นฟ้า' },
  mothersday: { name: 'วันแม่แห่งชาติ', emoji: '💙', colors: ['#1c7ed6', '#74c0fc', '#ffffff'], desc: 'ธงสีฟ้าและพวงมาลัยดอกมะลิให้แม่' },
  fathersday: { name: 'วันพ่อแห่งชาติ', emoji: '💛', colors: ['#fcc419', '#ffe066', '#ffffff'], desc: 'ธงสีเหลืองประดับรั้วบ้าน' },
  childrensday: { name: 'สุขสันต์วันเด็ก', emoji: '🎈', colors: ['#ff6b6b', '#ffd43b', '#4dabf7', '#69db7c', '#da77f2'], desc: 'ลูกโป่งที่ศาลาเรียนและหน้าประตู' },
};

export function festivalFor(d = new Date()) {
  const m = d.getMonth() + 1, day = d.getDate();
  const iso = `${d.getFullYear()}-${String(m).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
  if ((m === 12 && day === 31) || (m === 1 && day === 1)) return 'newyear';
  if (m === 4 && day >= 13 && day <= 15) return 'songkran';
  if (LOY_KRATHONG.includes(iso)) return 'loykrathong';
  if (m === 8 && day === 12) return 'mothersday';
  if (m === 12 && day === 5) return 'fathersday';
  if (m === 1 && d.getDay() === 6 && day >= 8 && day <= 14) return 'childrensday'; // เสาร์ที่ 2 ของมกราคม
  return null;
}

export class Festivals {
  constructor(farm) {
    this.farm = farm; this.scene = farm.scene;
    this.mode = store.get('festivalMode', 'auto');
    this.root = new THREE.Group(); this.scene.add(this.root);
    this.active = null;
    this.timer = 0;
    this.apply();
    setInterval(() => { if (this.mode === 'auto') this.apply(); }, 60000);
  }

  setMode(m) { this.mode = m; store.set('festivalMode', m); this.apply(); }

  apply() {
    const id = this.mode === 'auto' ? festivalFor() : this.mode === 'off' ? null : this.mode;
    if (id === this.active?.id) return;
    this.clear();
    if (!id) { this.farm.festival = null; bus.emit('festival', null); return; }
    const f = { id, ...FESTIVALS[id] };
    this.active = f; this.farm.festival = f;
    this.buildBanner(f); this.buildBunting(f);
    if (id === 'newyear') this.buildFireworks(f);
    if (id === 'songkran') this.buildSplash();
    if (id === 'loykrathong') this.buildKrathong();
    if (id === 'childrensday') this.buildBalloons(f);
    if (id === 'mothersday') this.buildGarland();
    bus.emit('festival', f);
    bus.emit('farm-event', `${f.emoji} วันนี้${f.name} — ${f.desc}`);
  }

  clear() {
    this.root.traverse(o => { o.geometry?.dispose(); if (o.material?.map) o.material.map.dispose(); });
    this.scene.remove(this.root); this.root = new THREE.Group(); this.scene.add(this.root);
    this.active = null; this.fw = null; this.splash = null; this.krathongs = null; this.lanterns = null;
  }

  // ป้ายผ้าเหนือประตูรั้ว
  buildBanner(f) {
    const c = document.createElement('canvas'); c.width = 1024; c.height = 200;
    const ctx = c.getContext('2d');
    const g = ctx.createLinearGradient(0, 0, 1024, 0); f.colors.forEach((col, i) => g.addColorStop(i / Math.max(1, f.colors.length - 1), col));
    ctx.fillStyle = g; ctx.fillRect(0, 0, 1024, 200);
    ctx.fillStyle = 'rgba(0,0,0,.25)'; ctx.fillRect(0, 150, 1024, 50);
    ctx.fillStyle = '#fff'; ctx.strokeStyle = 'rgba(0,0,0,.45)'; ctx.lineWidth = 8; ctx.textAlign = 'center';
    ctx.font = 'bold 92px "IBM Plex Sans Thai", sans-serif';
    let title = f.name;
    if (f.id === 'newyear') { const d = new Date(), y = (d.getMonth() === 11 ? d.getFullYear() + 1 : d.getFullYear()) + 543; title = `${f.name} ${y}`; }
    ctx.strokeText(title, 512, 120); ctx.fillText(title, 512, 120);
    ctx.font = '30px "IBM Plex Sans Thai", sans-serif'; ctx.fillText('ครอบครัวบ้านสวน', 512, 186);
    const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace;
    const banner = new THREE.Mesh(new THREE.PlaneGeometry(6.4, 1.25), new THREE.MeshStandardMaterial({ map: tex, side: THREE.DoubleSide, roughness: 0.8 }));
    banner.position.set(0, 3.5, 36.05); this.root.add(banner);
    for (const x of [-3.4, 3.4]) { const p = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.08, 4.2, 8), new THREE.MeshStandardMaterial({ color: '#555' })); p.position.set(x, 2.1, 36.05); p.castShadow = true; this.root.add(p); }
  }

  // ธงราวสามเหลี่ยมตามแนวรั้วหน้าบ้าน
  buildBunting(f) {
    const tri = new THREE.BufferGeometry(); tri.setAttribute('position', new THREE.Float32BufferAttribute([-0.18, 0, 0, 0.18, 0, 0, 0, -0.4, 0], 3)); tri.computeVertexNormals();
    for (let x = -24; x <= 24; x += 0.55) {
      if (Math.abs(x) < 3.6) continue;
      const k = (((x + 24) % 3.2) / 3.2), y = 2.2 - Math.sin(k * Math.PI) * 0.35;
      const m = new THREE.Mesh(tri, new THREE.MeshStandardMaterial({ color: f.colors[Math.floor(Math.abs(x * 1.8)) % f.colors.length], side: THREE.DoubleSide }));
      m.position.set(x, y, 36); this.root.add(m);
    }
  }

  buildFireworks(f) {
    const N = 900, pos = new Float32Array(N * 3), col = new Float32Array(N * 3);
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3)); g.setAttribute('color', new THREE.BufferAttribute(col, 3));
    // ประกายไฟทรงกลมฟุ้ง ๆ (ไม่ใช่สี่เหลี่ยม)
    const dot = document.createElement('canvas'); dot.width = dot.height = 64;
    const dc = dot.getContext('2d'), rg = dc.createRadialGradient(32, 32, 0, 32, 32, 32);
    rg.addColorStop(0, 'rgba(255,255,255,1)'); rg.addColorStop(0.25, 'rgba(255,255,255,.85)'); rg.addColorStop(1, 'rgba(255,255,255,0)');
    dc.fillStyle = rg; dc.fillRect(0, 0, 64, 64);
    const pts = new THREE.Points(g, new THREE.PointsMaterial({ size: 3.4, map: new THREE.CanvasTexture(dot), vertexColors: true, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false }));
    pts.frustumCulled = false; this.root.add(pts);
    this.fw = { pts, p: Array.from({ length: N }, () => ({ life: 0, x: 0, y: -100, z: 0, vx: 0, vy: 0, vz: 0, c: new THREE.Color() })), next: 0, colors: f.colors.map(c => new THREE.Color(c)) };
  }

  burst() {
    const fw = this.fw, c = fw.colors[Math.floor(Math.random() * fw.colors.length)];
    const cx = rand(-45, 45), cy = rand(38, 70), cz = rand(-50, 10);
    let n = 0;
    for (const p of fw.p) {
      if (p.life > 0) continue;
      const th = rand(0, Math.PI * 2), ph = Math.acos(rand(-1, 1)), sp = rand(9, 14);
      Object.assign(p, { life: rand(1.4, 2.2), x: cx, y: cy, z: cz, vx: Math.sin(ph) * Math.cos(th) * sp, vy: Math.cos(ph) * sp, vz: Math.sin(ph) * Math.sin(th) * sp });
      p.c.copy(c);
      if (++n >= 150) break;
    }
    bus.emit('firework', { x: cx, z: cz });
  }

  buildSplash() {
    const N = 500, pos = new Float32Array(N * 3), g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    const pts = new THREE.Points(g, new THREE.PointsMaterial({ color: '#cfefff', size: 0.07, transparent: true, opacity: 0.85, depthWrite: false }));
    pts.frustumCulled = false; this.root.add(pts);
    this.splash = { pts, p: Array.from({ length: N }, () => ({ life: 0, x: 0, y: -10, z: 0, vx: 0, vy: 0, vz: 0 })) };
  }

  buildKrathong() {
    const pond = this.farm.pond.position;
    this.krathongs = [];
    const leaf = new THREE.MeshStandardMaterial({ color: '#4c8f3a', roughness: 0.8 });
    const petal = new THREE.MeshStandardMaterial({ color: '#f7a8c8', roughness: 0.7 });
    const flame = new THREE.MeshStandardMaterial({ color: '#ffd27a', emissive: '#ffb030', emissiveIntensity: 3 });
    for (let i = 0; i < 7; i++) {
      const k = new THREE.Group();
      const base = new THREE.Mesh(new THREE.CylinderGeometry(0.26, 0.22, 0.1, 14), leaf); k.add(base);
      for (let j = 0; j < 8; j++) { const a = j / 8 * Math.PI * 2; const pt = new THREE.Mesh(new THREE.ConeGeometry(0.06, 0.18, 6), petal); pt.position.set(Math.cos(a) * 0.15, 0.12, Math.sin(a) * 0.15); pt.rotation.set(Math.sin(a) * 0.35, 0, -Math.cos(a) * 0.35); k.add(pt); }
      const candle = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.16, 6), new THREE.MeshStandardMaterial({ color: '#fff8e0' })); candle.position.y = 0.2; k.add(candle);
      const fl = new THREE.Mesh(new THREE.SphereGeometry(0.03, 6, 6), flame); fl.position.y = 0.3; fl.scale.y = 1.6; k.add(fl);
      k.position.set(pond.x, -0.06, pond.z); this.root.add(k);
      this.krathongs.push({ k, fl, a: rand(0, Math.PI * 2), r: rand(1, 3.6), sp: rand(0.05, 0.12) * (Math.random() > 0.5 ? 1 : -1) });
    }
    // โคมลอย
    const lanternM = new THREE.MeshStandardMaterial({ color: '#ffb35c', emissive: '#ff8a1f', emissiveIntensity: 2.5, transparent: true, opacity: 0.95 });
    this.lanterns = [];
    for (let i = 0; i < 10; i++) {
      const l = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.22, 0.55, 10, 1, true), lanternM); l.material.side = THREE.DoubleSide;
      this.root.add(l); this.lanterns.push({ l, t: rand(0, 1), x: rand(-6, 8), z: rand(12, 22), drift: rand(-0.6, 0.6) });
    }
  }

  buildBalloons(f) {
    const spots = [[-28.3, 3.1, 23.2], [-21.7, 3.1, 23.2], [-28.3, 3.1, 28.8], [-21.7, 3.1, 28.8], [-3.4, 4.1, 36], [3.4, 4.1, 36]];
    this.balloons = [];
    spots.forEach(([x, y, z], i) => {
      for (let j = 0; j < 3; j++) {
        const b = new THREE.Mesh(new THREE.SphereGeometry(0.22, 12, 10), new THREE.MeshStandardMaterial({ color: f.colors[(i + j) % f.colors.length], roughness: 0.3 }));
        b.scale.y = 1.2; b.position.set(x + rand(-0.35, 0.35), y + 0.6 + j * 0.15, z + rand(-0.35, 0.35)); b.castShadow = true; this.root.add(b);
        this.balloons.push({ b, y0: b.position.y, ph: rand(0, 6) });
      }
    });
  }

  buildGarland() { // พวงมาลัยดอกมะลิที่ระเบียง
    const m = new THREE.MeshStandardMaterial({ color: '#fffdf2', roughness: 0.6 });
    for (let i = 0; i < 40; i++) { const k = i / 39, s = new THREE.Mesh(new THREE.SphereGeometry(0.05, 6, 5), m); s.position.set(-11 + k * 13, 3.3 - Math.sin(k * Math.PI * 4) * 0.25, 8.85); this.root.add(s); }
  }

  update(dt, t) {
    const f = this.active; if (!f) return;
    const night = (this.farm.nightFactor || 0) > 0.4;
    if (this.fw) {
      this.fw.next -= dt;
      if ((night || this.mode !== 'auto') && this.fw.next < 0) { this.burst(); this.fw.next = rand(0.7, 1.6); }
      const pos = this.fw.pts.geometry.attributes.position, col = this.fw.pts.geometry.attributes.color;
      this.fw.p.forEach((p, i) => {
        if (p.life > 0) { p.life -= dt; p.vy -= 6 * dt; p.vx *= 0.985; p.vz *= 0.985; p.x += p.vx * dt; p.y += p.vy * dt; p.z += p.vz * dt; }
        const a = Math.max(0, Math.min(1, p.life));
        pos.setXYZ(i, p.x, p.life > 0 ? p.y : -500, p.z); col.setXYZ(i, p.c.r * a, p.c.g * a, p.c.b * a);
      });
      pos.needsUpdate = true; col.needsUpdate = true;
    }
    if (this.splash) {
      const throwers = [this.farm.kid?.h.group, this.farm.sis?.h.group].filter(o => o && o.visible);
      const pos = this.splash.pts.geometry.attributes.position;
      this.splash.p.forEach((p, i) => {
        if (p.life <= 0 && throwers.length && Math.random() < 0.25) {
          const o = throwers[i % throwers.length], ry = o.rotation.y + rand(-0.5, 0.5), sp = rand(3, 5);
          Object.assign(p, { life: rand(0.6, 1.0), x: o.position.x, y: o.position.y + 1.0 * o.scale.y, z: o.position.z, vx: Math.sin(ry) * sp, vy: rand(2, 3.5), vz: Math.cos(ry) * sp });
        }
        if (p.life > 0) { p.life -= dt; p.vy -= 9.8 * dt; p.x += p.vx * dt; p.y += p.vy * dt; p.z += p.vz * dt; if (p.y < 0.02) p.life = 0; }
        pos.setXYZ(i, p.x, p.life > 0 ? p.y : -50, p.z);
      });
      pos.needsUpdate = true;
    }
    if (this.krathongs) {
      const pond = this.farm.pond.position;
      for (const k of this.krathongs) {
        k.a += k.sp * dt;
        k.k.position.set(pond.x + Math.cos(k.a) * k.r, -0.06 + Math.sin(t * 1.3 + k.r) * 0.015, pond.z + Math.sin(k.a) * k.r);
        k.k.rotation.y += dt * 0.1;
        k.fl.scale.set(1, 1.4 + Math.sin(t * 17 + k.r * 5) * 0.3, 1);
        k.fl.visible = night;
      }
      for (const L of this.lanterns) {
        L.t += dt * 0.025; if (L.t > 1) { L.t = 0; L.x = rand(-6, 8); L.z = rand(12, 22); }
        L.l.position.set(L.x + L.t * 30 * L.drift, 1 + L.t * 90, L.z - L.t * 40);
        L.l.visible = night;
      }
    }
    if (this.balloons) for (const b of this.balloons) b.b.position.y = b.y0 + Math.sin(t * 1.4 + b.ph) * 0.08;
  }
}
