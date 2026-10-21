// ฉากตอนจบ: งานวัดตอนกลางคืน — วัด เจดีย์ทอง ชิงช้าสวรรค์ บ้านผีสิง ซุ้มขายของ ไฟประดับ ดอกไม้ไฟ
import * as THREE from 'three';
import { toon, shared } from '../toon.js';
import { rng, makeSky, makeLights, makeTerrain, makeMotes, scatterGrass, shadowAll } from '../kit.js';

const groundH = () => 0;
const T = shared.uTime;

// ป้ายตัวหนังสือจากผืนผ้าใบ (canvas)
function sign(text, { w = 2.2, h = 0.6, bg = '#c0392b', fg = '#fff6d8', glow = false } = {}) {
  const c = document.createElement('canvas');
  c.width = 512; c.height = Math.round(512 * h / w);
  const g = c.getContext('2d');
  g.fillStyle = bg; g.fillRect(0, 0, c.width, c.height);
  g.strokeStyle = '#ffd34d'; g.lineWidth = 10; g.strokeRect(8, 8, c.width - 16, c.height - 16);
  g.fillStyle = fg; g.textAlign = 'center'; g.textBaseline = 'middle';
  g.font = `700 ${Math.round(c.height * 0.55)}px Mali, 'Leelawadee UI', sans-serif`;
  g.fillText(text, c.width / 2, c.height / 2 + 4);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  const m = glow ? new THREE.MeshBasicMaterial({ map: t }) : toon(0xffffff, { map: t });
  return new THREE.Mesh(new THREE.PlaneGeometry(w, h), m);
}

export function build(scene, assets, opts) {
  const { mobile } = opts;
  const r = rng(555);
  const world = { id: 'fair', update: [], waterY: -10, colliders: [] };
  Object.assign(world, {
    groundH, standY: groundH, canCast: () => false, walkable: () => true, depthAt: () => 0,
    spawn: { x: 0, z: 12, yaw: Math.PI }, camFocus: () => [0, 0], camBounds: [-30, 30, -30, 30], ambience: { night: true },
    cam: { pos: new THREE.Vector3(0, 12, 30), look: new THREE.Vector3(0, 2, 0) },
  });
  makeSky(scene, world, { top: 0x1a2768, bot: 0x5a4f8e, fogNear: 45, fogFar: 140 });
  makeLights(scene, world, { mobile, sun: [14, 22, -20], target: [0, 0, -4], intensity: 0.55, hemi: 0.45, span: 30 });
  world.sun.color.set(0xa8b8ff);
  world.hemi.color.set(0x8a80d0); world.hemi.groundColor.set(0x3a2a40);
  world.sky.material.uniforms.uNight.value = 1;

  const cDirt = new THREE.Color(0xa08a68), cGrass = new THREE.Color(0x5d7a3e);
  const terrain = makeTerrain(scene, world, {
    size: 120, segs: 60, groundH,
    colorAt(x, z, h, c) { const path = Math.abs(x) < 2.5 || (z > -12 && z < 6 && Math.abs(x) < 14); c.copy(path ? cDirt : cGrass).multiplyScalar(0.9 + 0.1 * Math.sin(x * 2 + z)); },
  });
  scatterGrass(scene, { ok: (x, z) => (Math.abs(x) < 3 || (z > -13 && z < 7 && Math.abs(x) < 15) ? null : 0), count: mobile ? 2500 : 5000, area: [-40, 40, -40, 30], r, root: 0x2f4a2a, tip: 0x6a8a4a });

  const lights = [];
  const addLight = (x, y, z, col = 0xffb45a, I = 6, d = 14) => { const l = new THREE.PointLight(col, I, d, 1.4); l.position.set(x, y, z); scene.add(l); lights.push(l); return l; };

  // ---------- วัด: ฐานยกสูง ผนังขาว หลังคาซ้อนชั้นสีแดงขอบทอง ช่อฟ้า ----------
  {
    const g = new THREE.Group();
    const white = toon(0xf4efe4), red = toon(0xb83a2e), gold = toon(0xf2c14e, { emissive: 0x4a3000 }), dark = toon(0x3a2a20);
    const base = new THREE.Mesh(new THREE.BoxGeometry(12, 1.2, 8), white); base.position.y = 0.6; g.add(base);
    const steps = new THREE.Mesh(new THREE.BoxGeometry(4, 0.6, 1.6), white); steps.position.set(0, 0.3, 4.6); g.add(steps);
    const hall = new THREE.Mesh(new THREE.BoxGeometry(10, 4, 6), white); hall.position.y = 3.2; g.add(hall);
    for (let i = -2; i <= 2; i++) { const d = new THREE.Mesh(new THREE.BoxGeometry(1, 2.2, 0.1), i === 0 ? gold : dark); d.position.set(i * 1.9, 2.4, 3.02); g.add(d); }
    for (let k = 0; k < 3; k++) {             // หลังคาซ้อน 3 ชั้น
      const w = 11.5 - k * 2.2, d = 7.5 - k * 1.3, y = 5.2 + k * 1.5, hgt = 2.4;
      const shape = new THREE.Shape(); shape.moveTo(-d / 2, 0); shape.lineTo(d / 2, 0); shape.lineTo(0, hgt); shape.closePath();
      const roof = new THREE.Mesh(new THREE.ExtrudeGeometry(shape, { depth: w, bevelEnabled: false }), red);
      roof.rotation.y = Math.PI / 2; roof.position.set(-w / 2, y, 0); g.add(roof);
      const trim = new THREE.Mesh(new THREE.BoxGeometry(w + 0.2, 0.12, d + 0.2), gold); trim.position.y = y; g.add(trim);
      for (const s of [-1, 1]) { const cf = new THREE.Mesh(new THREE.ConeGeometry(0.12, 1.2, 5), gold); cf.position.set(s * w / 2, y + hgt + 0.3, 0); cf.rotation.z = -s * 0.5; g.add(cf); }
    }
    g.position.set(0, 0, -20);
    scene.add(g);
    addLight(3, 5, -13, 0xffd9a0, 12, 24);
    // เจดีย์ทอง
    const ch = new THREE.Group();
    [[2.6, 1.2], [2.0, 1.0], [1.5, 1.6], [0.9, 0.5]].reduce((y, [rad, hh]) => { const m = new THREE.Mesh(new THREE.CylinderGeometry(rad * 0.85, rad, hh, 14), gold); m.position.y = y + hh / 2; ch.add(m); return y + hh; }, 0);
    const spire = new THREE.Mesh(new THREE.ConeGeometry(0.7, 5.5, 14), gold); spire.position.y = 7.0; ch.add(spire);
    ch.position.set(11, 0, -22);
    scene.add(ch);
  }

  // ---------- ชิงช้าสวรรค์ ----------
  const wheel = { center: new THREE.Vector3(10, 7.4, -6), R: 6, rot: 0, cabins: [] };
  {
    const frame = toon(0xe8e8f0), bulbCols = [0xff5a7a, 0xffd34d, 0x5ad1ff, 0x9dff6a, 0xc77dff];
    const g = new THREE.Group();
    for (const z of [-0.5, 0.5]) {
      const ring = new THREE.Mesh(new THREE.TorusGeometry(wheel.R, 0.08, 6, 48), frame); ring.position.z = z; g.add(ring);
      for (let i = 0; i < 16; i++) { const sp = new THREE.Mesh(new THREE.BoxGeometry(0.06, wheel.R, 0.06), frame); sp.position.set(0, 0, z); sp.rotation.z = i * Math.PI / 8; sp.geometry.translate(0, wheel.R / 2, 0); g.add(sp); }
    }
    const hub = new THREE.Mesh(new THREE.CylinderGeometry(0.45, 0.45, 1.3, 12), toon(0xff5a7a)); hub.rotation.x = Math.PI / 2; g.add(hub);
    // หลอดไฟรอบวง
    const NB = 48;
    const bulbs = new THREE.InstancedMesh(new THREE.SphereGeometry(0.11, 6, 4), new THREE.MeshBasicMaterial({ color: 0xffffff }), NB * 2);
    const m4 = new THREE.Matrix4(), c = new THREE.Color();
    for (let i = 0; i < NB * 2; i++) { const a = (i % NB) / NB * Math.PI * 2; m4.makeTranslation(Math.cos(a) * wheel.R, Math.sin(a) * wheel.R, i < NB ? -0.55 : 0.55); bulbs.setMatrixAt(i, m4); bulbs.setColorAt(i, c.set(bulbCols[i % bulbCols.length])); }
    g.add(bulbs);
    g.position.copy(wheel.center);
    scene.add(g);
    wheel.g = g; wheel.bulbs = bulbs;
    for (const s of [-1, 1]) for (const z of [-1.2, 1.2]) {   // ขาตั้งรูปตัว A
      const leg = new THREE.Mesh(new THREE.BoxGeometry(0.22, 8.6, 0.22), frame);
      leg.position.set(wheel.center.x + s * 1.9, 3.9, wheel.center.z + z); leg.rotation.z = s * 0.26; scene.add(leg);
    }
    const cabCols = [0xff8a5a, 0x5ab4ff, 0xffd34d, 0x9dde6a, 0xc77dff, 0xff6aa8, 0x5ad1c8, 0xf2994a];
    for (let i = 0; i < 8; i++) {
      const cab = new THREE.Group();
      const body = new THREE.Mesh(new THREE.CylinderGeometry(0.72, 0.62, 0.45, 10, 1, true), toon(cabCols[i], { side: THREE.DoubleSide })); body.position.y = -1.12;
      const floor = new THREE.Mesh(new THREE.CircleGeometry(0.6, 10).rotateX(-Math.PI / 2), toon(0x5a4030)); floor.position.y = -1.34;
      const roof = new THREE.Mesh(new THREE.ConeGeometry(0.8, 0.45, 10), toon(cabCols[i])); roof.position.y = -0.1;
      const rod = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.5, 4), frame); rod.position.y = 0.2;
      cab.add(body, floor, roof, rod);
      scene.add(cab);
      wheel.cabins.push({ g: cab, a: i / 8 * Math.PI * 2 });
    }
    addLight(10, 3, -2, 0xff8ad0, 6, 14);
  }
  world.wheel = wheel;
  world.wheelSpeed = 0.18;
  world.update.push(dt => {
    wheel.rot += dt * world.wheelSpeed;
    wheel.g.rotation.z = wheel.rot;
    for (const cb of wheel.cabins) {
      const a = cb.a + wheel.rot;
      cb.g.position.set(wheel.center.x + Math.cos(a) * wheel.R, wheel.center.y + Math.sin(a) * wheel.R, wheel.center.z);
      cb.g.rotation.z = Math.sin(T.value * 1.3 + cb.a) * 0.05;
    }
    // ไฟวิ่งรอบวง
    const k = Math.floor(T.value * 6);
    for (let i = 0; i < 96; i++) wheel.bulbs.setColorAt(i, new THREE.Color([0xff5a7a, 0xffd34d, 0x5ad1ff, 0x9dff6a, 0xc77dff][(i + k) % 5]));
    wheel.bulbs.instanceColor.needsUpdate = true;
  });

  // ---------- บ้านผีสิง ----------
  {
    const g = new THREE.Group();
    const wall = toon(0x4a3a5a), roofM = toon(0x2a1f30), win = new THREE.MeshBasicMaterial({ color: 0x9dff6a });
    const body = new THREE.Mesh(new THREE.BoxGeometry(6, 4, 5), wall); body.position.y = 2; g.add(body);
    const shape = new THREE.Shape(); shape.moveTo(-3.3, 0); shape.lineTo(3.3, 0); shape.lineTo(0.4, 2.8); shape.closePath();
    const roof = new THREE.Mesh(new THREE.ExtrudeGeometry(shape, { depth: 5.6, bevelEnabled: false }), roofM); roof.position.set(0, 4, -2.8); roof.rotation.z = 0.06; g.add(roof);
    for (const [x, y] of [[-1.8, 2.8], [1.8, 2.8]]) { const w = new THREE.Mesh(new THREE.PlaneGeometry(0.9, 0.9), win); w.position.set(x, y, 2.51); g.add(w); }
    const door = new THREE.Mesh(new THREE.PlaneGeometry(1.4, 2.2), new THREE.MeshBasicMaterial({ color: 0x120a18 })); door.position.set(0, 1.1, 2.51); g.add(door);
    const sg = sign('บ้านผีสิง 👻', { w: 3.6, h: 0.9, bg: '#2a1a3a', fg: '#b6ff7a', glow: true }); sg.position.set(0, 4.5, 2.6); g.add(sg);
    // ผีผ้าขาว (ซ่อนไว้ โผล่ตอนเข้าไป)
    const ghost = new THREE.Group();
    const sheet = new THREE.MeshBasicMaterial({ color: 0xf4f4ff, transparent: true, opacity: 0.92 });
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.55, 12, 10), sheet); head.position.y = 1.5;
    const robe = new THREE.Mesh(new THREE.ConeGeometry(0.75, 1.6, 12, 1, true), sheet); robe.position.y = 0.75;
    const eyeM = new THREE.MeshBasicMaterial({ color: 0x111111 });
    for (const s of [-0.18, 0.18]) { const e = new THREE.Mesh(new THREE.SphereGeometry(0.08, 6, 5), eyeM); e.position.set(s, 1.58, 0.48); ghost.add(e); }
    const mouth = new THREE.Mesh(new THREE.SphereGeometry(0.12, 6, 5), eyeM); mouth.scale.set(1, 1.4, 0.5); mouth.position.set(0, 1.32, 0.5); ghost.add(mouth);
    ghost.add(head, robe);
    ghost.position.set(0, 0.3, 2.9);
    ghost.scale.setScalar(0.001);
    g.add(ghost);
    g.position.set(-9, 0, -7);
    g.rotation.y = 0.35;
    scene.add(g);
    world.haunted = g; world.ghost = ghost;
  }

  // ---------- ซุ้มขายของ ----------
  const stalls = [['สายไหม', '#e85a9a', 0xff8ac0], ['ลูกชิ้นปิ้ง', '#d9822b', 0xffb45a], ['ปาเป้า', '#2b7bd9', 0x7ac0ff], ['ตักไข่ปลา', '#2a9a6a', 0x8affc0]];
  world.stalls = [];
  stalls.forEach(([name, bg, col], i) => {
    const g = new THREE.Group();
    const top = new THREE.Mesh(new THREE.ConeGeometry(2.0, 1.1, 4), toon(col)); top.position.y = 3.0; top.rotation.y = Math.PI / 4; g.add(top);
    for (const [x, z] of [[-1.3, -1.1], [1.3, -1.1], [-1.3, 1.1], [1.3, 1.1]]) { const p = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 2.5, 5), toon(0xe8e0d0)); p.position.set(x, 1.25, z); g.add(p); }
    const counter = new THREE.Mesh(new THREE.BoxGeometry(2.6, 0.9, 0.8), toon(0x8a5a3a)); counter.position.set(0, 0.45, 1.0); g.add(counter);
    const sg = sign(name, { w: 2.4, h: 0.6, bg, glow: true }); sg.position.set(0, 2.25, 1.15); g.add(sg);
    if (i === 0) for (let k = 0; k < 5; k++) { const cc = new THREE.Mesh(new THREE.SphereGeometry(0.22, 8, 6), toon(0xffa8d8)); cc.position.set(-0.9 + k * 0.45, 1.25, 1.0); g.add(cc); }
    if (i === 2) for (let k = 0; k < 9; k++) { const b = new THREE.Mesh(new THREE.SphereGeometry(0.16, 8, 6), new THREE.MeshBasicMaterial({ color: [0xff5a5a, 0xffd34d, 0x5ab4ff][k % 3] })); b.position.set(-0.8 + (k % 3) * 0.8, 1.2 + Math.floor(k / 3) * 0.4, -1.0); g.add(b); }
    g.position.set(-11 + i * 4.2, 0, 2.5);
    scene.add(g);
    world.stalls.push(g);
  });
  addLight(-4, 3.5, 5, 0xffb45a, 9, 20);

  // ---------- ซุ้มประตูทางเข้า ----------
  {
    const red = toon(0xc0392b);
    for (const s of [-1, 1]) { const p = new THREE.Mesh(new THREE.BoxGeometry(0.4, 4.5, 0.4), red); p.position.set(s * 3, 2.25, 9); scene.add(p); }
    const beam = sign('งานวัดประจำปี 🎡', { w: 6.8, h: 1.1, bg: '#c0392b', glow: true }); beam.position.set(0, 4.6, 9.05); scene.add(beam);
  }

  // ---------- ไฟระย้าสลับสี ----------
  {
    const spans = [[[-14, 4.5, 6], [6, 4.5, 6]], [[-14, 4.5, 0], [0, 5, -12]], [[3, 4.5, 9], [10, 6, -1]], [[-3, 4.5, 9], [-10, 5, -3]], [[-6, 5, -12], [6, 5, -12]]];
    const pts = [];
    for (const [a, b] of spans) for (let i = 0; i <= 26; i++) { const t = i / 26; pts.push([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t - Math.sin(t * Math.PI) * 0.9, a[2] + (b[2] - a[2]) * t]); }
    const im = new THREE.InstancedMesh(new THREE.SphereGeometry(0.09, 6, 4), new THREE.MeshBasicMaterial({ color: 0xffffff }), pts.length);
    const m4 = new THREE.Matrix4(), c = new THREE.Color(), cols = [0xff5a7a, 0xffd34d, 0x5ad1ff, 0x9dff6a, 0xffa04a];
    pts.forEach((p, i) => { im.setMatrixAt(i, m4.makeTranslation(...p)); im.setColorAt(i, c.set(cols[i % cols.length])); });
    scene.add(im);
    world.update.push(() => {
      const k = Math.floor(T.value * 2.5);
      for (let i = 0; i < pts.length; i++) im.setColorAt(i, c.set(cols[(i + k) % cols.length]).multiplyScalar((i + k) % 3 === 0 ? 0.45 : 1));
      im.instanceColor.needsUpdate = true;
    });
    for (const s of [[-14, 6], [6, 6], [-14, 0], [0, -12], [10, -1], [-10, -3], [-6, -12], [6, -12]]) { const p = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.08, 5, 5), toon(0x8a7a6a)); p.position.set(s[0], 2.5, s[1]); scene.add(p); }
  }

  // ---------- ผู้คนเดินเที่ยวงาน ----------
  {
    const shirts = [0xd9534f, 0x5bc0de, 0xf0ad4e, 0x5cb85c, 0x9b59b6, 0xe67e22, 0x34495e];
    const walkers = [];
    for (let i = 0; i < (mobile ? 6 : 10); i++) {
      const g = assets.clone('Fisher');
      const sm = toon(shirts[i % shirts.length]);
      g.traverse(o => { if (o.isMesh && o.material.name === 'Shirt') o.material = sm; });
      g.getObjectByName('Rod').visible = false;
      if (i % 2) g.getObjectByName('Hat').visible = false;
      g.scale.setScalar(r.range(0.6, 1.0));
      scene.add(g);
      walkers.push({ g, legL: g.getObjectByName('LegL'), legR: g.getObjectByName('LegR'), cx: r.range(-8, 6), cz: r.range(-6, 6), rad: r.range(2, 5), sp: r.range(0.15, 0.3) * (r() < 0.5 ? 1 : -1), ph: r() * 6 });
    }
    world.hideCrowd = () => walkers.forEach(w => { w.g.visible = false; });     // ฉากดูดอกไม้ไฟ: ไม่ให้คนเดินบังครอบครัว
    world.update.push(() => {
      const t = T.value;
      for (const w of walkers) {
        const a = t * w.sp + w.ph;
        w.g.position.set(w.cx + Math.cos(a) * w.rad, 0, w.cz + Math.sin(a) * w.rad);
        w.g.rotation.y = -a + (w.sp > 0 ? 0 : Math.PI);
        const sw = Math.sin(t * 7 + w.ph) * 0.5;
        w.legL.rotation.x = sw; w.legR.rotation.x = -sw;
      }
    });
  }

  // ---------- ดอกไม้ไฟ ----------
  {
    const N = 900;
    const g = new THREE.BufferGeometry();
    const P = new Float32Array(N * 3).fill(-999), C = new Float32Array(N * 3), V = new Float32Array(N * 3), L = new Float32Array(N);
    g.setAttribute('position', new THREE.BufferAttribute(P, 3));
    g.setAttribute('color', new THREE.BufferAttribute(C, 3));
    const dot = document.createElement('canvas'); dot.width = dot.height = 32;
    const dg = dot.getContext('2d'), grd = dg.createRadialGradient(16, 16, 0, 16, 16, 16);
    grd.addColorStop(0, 'rgba(255,255,255,1)'); grd.addColorStop(0.35, 'rgba(255,255,255,.8)'); grd.addColorStop(1, 'rgba(255,255,255,0)');
    dg.fillStyle = grd; dg.fillRect(0, 0, 32, 32);
    const fw = new THREE.Points(g, new THREE.PointsMaterial({ size: 0.9, map: new THREE.CanvasTexture(dot), vertexColors: true, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false }));
    fw.frustumCulled = false;
    scene.add(fw);
    let pi = 0;
    const col = new THREE.Color();
    world.firework = (x, y, z, hue = Math.random()) => {
      const n = 110;
      for (let k = 0; k < n; k++) {
        const u = Math.random() * 2 - 1, th = Math.random() * 6.28, s = 5 + Math.random() * 2.5, q = Math.sqrt(1 - u * u);
        P.set([x, y, z], pi * 3); V.set([Math.cos(th) * q * s, u * s, Math.sin(th) * q * s], pi * 3); L[pi] = 1;
        col.setHSL((hue + (k % 3) * 0.04) % 1, 1, 0.62); C.set([col.r, col.g, col.b], pi * 3);
        pi = (pi + 1) % N;
      }
      if (world.onBoom) world.onBoom();
    };
    world.fireworksOn = false;
    let nextFw = 0;
    world.update.push(dt => {
      if (world.fireworksOn && T.value > nextFw) { nextFw = T.value + 0.5 + Math.random() * 0.7; world.firework(-10 + Math.random() * 24, 14 + Math.random() * 7, -22 + Math.random() * 8); }
      for (let i = 0; i < N; i++) {
        if (L[i] <= 0) continue;
        L[i] -= dt * 0.55;
        V[i * 3 + 1] -= 3.2 * dt; V[i * 3] *= 0.985; V[i * 3 + 1] *= 0.985; V[i * 3 + 2] *= 0.985;
        P[i * 3] += V[i * 3] * dt; P[i * 3 + 1] += V[i * 3 + 1] * dt; P[i * 3 + 2] += V[i * 3 + 2] * dt;
        const f = Math.max(L[i], 0);
        C[i * 3] *= 0.995; C[i * 3 + 1] *= 0.995; C[i * 3 + 2] *= 0.995;
        if (f <= 0) P[i * 3 + 1] = -999;
      }
      g.attributes.position.needsUpdate = true; g.attributes.color.needsUpdate = true;
    });
  }

  // ---------- ครอบครัว (แม่ ลูกสองคน) ----------
  const fam = [];
  const mk = (shirt, scale, bun) => {
    const g = assets.clone('Fisher');
    const sm = toon(shirt);
    g.traverse(o => { if (o.isMesh) { if (o.material.name === 'Shirt') o.material = sm; o.castShadow = true; } });
    g.getObjectByName('Rod').visible = false;
    g.getObjectByName('Hat').visible = false;
    if (bun) { const b = new THREE.Mesh(new THREE.SphereGeometry(0.11, 8, 6), toon(0x2c231e)); b.position.set(0, 0.12, 0.14); g.getObjectByName('Head').add(b); }
    g.scale.setScalar(scale);
    scene.add(g);
    const f = { g, legL: g.getObjectByName('LegL'), legR: g.getObjectByName('LegR'), armL: g.getObjectByName('ArmL'), armR: g.getObjectByName('ArmR'), head: g.getObjectByName('Head'), base: scale, ph: Math.random() * 5 };
    fam.push(f);
    return f;
  };
  world.family = { mom: mk(0xc0567a, 0.95, true), kid: mk(0xf2b632, 0.62), kid2: mk(0x5fae6e, 0.55) };
  // สายไหมสีชมพูในมือเด็ก
  for (const k of [world.family.kid, world.family.kid2]) {
    const cc = new THREE.Group();
    const stick = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, 0.4, 4), toon(0xf4e8d0)); stick.position.y = -0.1;
    const fluff = new THREE.Mesh(new THREE.SphereGeometry(0.16, 8, 6), toon(0xffa8d8, { emissive: 0x401028 })); fluff.position.y = 0.15;
    cc.add(stick, fluff); cc.position.set(0, -0.42, 0.1); cc.visible = false;
    k.armR.add(cc); k.candy = cc;
  }
  world.walkAnim = (f, moving, t) => { const sw = moving ? Math.sin(t * 8 + f.ph) * 0.5 : 0; f.legL.rotation.x = sw; f.legR.rotation.x = -sw; };

  makeMotes(scene, world, { count: 60, area: [-14, 14, -14, 10], r, color: 0xffe08a, size: 0.1, glow: true, y: [0.5, 4] });
  shadowAll(scene, terrain);
  return world;
}
