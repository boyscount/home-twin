// ด่าน 1: บ่อปลาทุ่งนา — บ่อใหญ่กลางทุ่งข้าว คันนา ห้างนา ควาย นกยาง หุ่นไล่กา กอบัว ภูเขาไกล ๆ
import * as THREE from 'three';
import { toon, swaying, shared } from '../toon.js';
import { sstep, lerp, rng, makeSky, makeLights, makeTerrain, makeWater, placer, scatterGrass, scatterFlowers, makeMotes, makeFlyers, makeClouds, shadowAll } from '../kit.js';

const POND = { x: 0, z: -6 };
const WATER_Y = -0.3;
const pondR = th => 10.5 + 1.3 * Math.sin(2 * th + 0.5) + 0.8 * Math.sin(3 * th + 1.7) + 0.4 * Math.sin(5 * th);
const PADDY_Y = -0.12;          // ระดับน้ำในแปลงนา
const DIKE = 2.6;               // ระยะห่างคันนา

// แปลงนา = ทุกที่ที่อยู่ห่างจากขอบบ่อเกิน 3.5 ม. และไม่ใช่ลานดินรอบบ่อ
function paddyW(x, z) {
  const d = Math.hypot(x - POND.x, z - POND.z), e = d - pondR(Math.atan2(z - POND.z, x - POND.x));
  return sstep(3.2, 4.4, e);
}
function dikeW(x, z) {          // คันนาเป็นตาราง
  const fx = Math.abs(((x + 100) % DIKE) - DIKE / 2), fz = Math.abs(((z + 100) % (DIKE * 1.3)) - DIKE * 0.65);
  return Math.max(sstep(DIKE / 2 - 0.22, DIKE / 2 - 0.08, fx), sstep(DIKE * 0.65 - 0.22, DIKE * 0.65 - 0.08, fz));
}
function groundH(x, z) {
  const dx = x - POND.x, dz = z - POND.z, d = Math.hypot(dx, dz);
  const e = pondR(Math.atan2(dz, dx)) - d;                 // >0 = ในบ่อ
  let h = 0.12 + 0.06 * Math.sin(x * 0.3) * Math.cos(z * 0.27);
  h -= 2.3 * sstep(-0.3, 4.0, e);                          // บ่อลึก ~2 ม.
  const pw = paddyW(x, z);
  if (pw > 0) h = lerp(h, PADDY_Y - 0.08 + dikeW(x, z) * 0.32, pw);
  // ภูเขาไกล ๆ ด้านหลัง
  h += Math.min(5, Math.max(0, -z - 40) * 0.45) * (0.6 + 0.4 * Math.sin(x * 0.11 + 1));
  return h;
}

export function build(scene, assets, opts) {
  const { mobile } = opts;
  const r = rng(808);
  const T = shared.uTime;
  const world = { id: 'paddy', update: [], waterY: WATER_Y, colliders: [] };
  const colliders = world.colliders;
  const dock = { x: -3.2, z0: 0, z1: 0, w: 0.72, y: 0.27 };
  const onDock = (x, z) => Math.abs(x - dock.x) < dock.w && z < dock.z0 + 0.1 && z > dock.z1;
  const inPond = (x, z) => groundH(x, z) < WATER_Y - 0.02 && paddyW(x, z) < 0.5;
  Object.assign(world, {
    groundH,
    standY: (x, z) => onDock(x, z) ? dock.y : Math.max(groundH(x, z), paddyW(x, z) > 0.5 ? PADDY_Y - 0.05 : WATER_Y),
    canCast: (x, z) => inPond(x, z) && !onDock(x, z),
    onSolid: onDock,
    depthAt: (x, z) => WATER_Y - groundH(x, z),
    walkable(x, z) {
      if (x < -22 || x > 22 || z < -22 || z > 15) return false;
      if (onDock(x, z)) return true;
      if (groundH(x, z) < WATER_Y + 0.05 && paddyW(x, z) < 0.5) return false;
      for (const c of colliders) if ((x - c.x) ** 2 + (z - c.z) ** 2 < c.r * c.r) return false;
      return true;
    },
    spawn: { x: 1.5, z: 7.6, yaw: Math.PI },
    camFocus: (px, pz) => [px * 0.75, pz * 0.6 + POND.z * 0.4],
    camBounds: [-12, 12, -12, 9],
    camK: 1.12,
    camp: { x: -1.2, z: 6.8, ry: 0.1 },
    ambience: { stream: true },
    special: new THREE.Vector3(5.5, WATER_Y, -10.5),     // กอบัวหนาแน่นมุมบ่อ
    specialR: 3.0,
    liveFish: { count: 16, area: [-11, 11, -17, 4], depth: [0.2, 0.4], scale: [0.6, 1.0], jumpEvery: [1.8, 4.5] },
  });

  makeSky(scene, world, { top: 0x6fbdf0, bot: 0xeaf6ee, fogNear: 40, fogFar: 120 });
  makeLights(scene, world, { mobile, sun: [-16, 24, 12], target: [0, 0, -4], intensity: 2.2, hemi: 0.9, span: 30 });

  const cGrass = new THREE.Color(0x8cc152), cDry = new THREE.Color(0xb7c25e), cMud = new THREE.Color(0x9a8560);
  const cBed = new THREE.Color(0x6c7a4c), cDeep = new THREE.Color(0x44583c), cPaddyMud = new THREE.Color(0x7d7650), cDike = new THREE.Color(0x9ab85a);
  const cMount = new THREE.Color(0x6f9a72);
  const terrain = makeTerrain(scene, world, {
    size: 110, segs: mobile ? 170 : 240, cz: -8, groundH, waterY: WATER_Y,
    colorAt(x, z, h, c) {
      const n = Math.sin(x * 0.4 + Math.sin(z * 0.3) * 2) * 0.5 + 0.5;
      c.copy(cGrass).lerp(cDry, n * 0.35);
      const pw = paddyW(x, z);
      if (pw > 0) c.lerp(cPaddyMud, pw * (1 - dikeW(x, z))).lerp(cDike, pw * dikeW(x, z));
      if (h < WATER_Y + 0.25 && pw < 0.5) {
        c.lerp(cMud, sstep(WATER_Y + 0.25, WATER_Y - 0.1, h));
        c.lerp(cBed, sstep(WATER_Y - 0.1, WATER_Y - 0.9, h));
        c.lerp(cDeep, sstep(WATER_Y - 0.9, WATER_Y - 2.1, h));
      }
      if (z < -34) c.lerp(cMount, sstep(-34, -40, z));
    },
  });
  makeWater(scene, world, { cx: POND.x, cz: POND.z, size: 28, segs: mobile ? 110 : 150, groundH, waterY: WATER_Y, shallow: 0x9ccf8a, deep: 0x3d7a5c, depthScale: 1.9, glint: 0.8, flow: [0.05, 0.04] });

  // ผิวน้ำในแปลงนา (สะท้อนฟ้า) — แผ่นเดียวใต้ต้นข้าว
  {
    const pos = [], S = 1.0;
    for (let x = -55; x < 55; x += S) for (let z = -34; z < 47; z += S) {
      const q = [[x, z], [x + S, z], [x + S, z + S], [x, z + S]];
      if (q.some(([a, b]) => paddyW(a, b) < 0.3)) continue;
      for (const i of [0, 3, 1, 1, 3, 2]) pos.push(q[i][0], PADDY_Y, q[i][1]);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    const pm = new THREE.MeshLambertMaterial({ color: 0x9cc9b0, emissive: 0x2a4a44, transparent: true, opacity: 0.5, depthWrite: false });
    const sheet = new THREE.Mesh(g, pm);
    sheet.renderOrder = 0;
    scene.add(sheet);
  }
  // ต้นข้าวเป็นกอเรียงแถวในแปลง
  {
    const parts = [];
    for (let b = 0; b < 4; b++) {
      const g = new THREE.ConeGeometry(0.06, 0.6, 3).translate(0, 0.3, 0);
      g.rotateZ((b - 1.5) * 0.18); g.rotateY(b * 1.3);
      parts.push(g.toNonIndexed());
    }
    const n = parts.reduce((a, g) => a + g.attributes.position.count, 0);
    const P = new Float32Array(n * 3), C = new Float32Array(n * 3), N = new Float32Array(n * 3);
    let o = 0;
    const c0 = new THREE.Color(0x4f9a3a), c1 = new THREE.Color(0xc8e070);
    for (const g of parts) {
      const pa = g.attributes.position;
      for (let i = 0; i < pa.count; i++) {
        P.set([pa.getX(i), pa.getY(i), pa.getZ(i)], o * 3);
        const cc = c0.clone().lerp(c1, pa.getY(i) / 0.55);
        C.set([cc.r, cc.g, cc.b], o * 3); N.set([0, 1, 0], o * 3); o++;
      }
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(P, 3));
    geo.setAttribute('color', new THREE.BufferAttribute(C, 3));
    geo.setAttribute('normal', new THREE.BufferAttribute(N, 3));
    const m = toon(0xffffff, { vertexColors: true, side: THREE.DoubleSide });
    m.onBeforeCompile = sh => {
      sh.uniforms.uTime = T; sh.uniforms.uWind = shared.uWind;
      sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nuniform float uTime; uniform float uWind;')
        .replace('#include <begin_vertex>', `#include <begin_vertex>
{ vec2 ip = vec2(instanceMatrix[3][0], instanceMatrix[3][2]);
  float w = sin(uTime * 1.6 + ip.x * 0.25 + ip.y * 0.15) * 0.5 + 0.5;       // คลื่นลมพัดผ่านทุ่งข้าว
  transformed.x += transformed.y * transformed.y * 0.9 * w * uWind; }`);
    };
    const MAX = mobile ? 9000 : 20000;
    const im = new THREE.InstancedMesh(geo, m, MAX);
    const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), sv = new THREE.Vector3(), pv = new THREE.Vector3();
    let k = 0;
    const step = mobile ? 0.6 : 0.42;
    for (let x = -30; x < 30 && k < MAX; x += step) for (let z = -32; z < 18 && k < MAX; z += step) {
      const px = x + r.range(-0.06, 0.06), pz = z + r.range(-0.06, 0.06);
      if (paddyW(px, pz) < 0.9 || dikeW(px, pz) > 0.3) continue;
      if (Math.abs(px - 1.5) < 2.2 && pz > 3) continue;        // ทางเดินเข้าบ่อ
      const s = r.range(1.2, 1.6);
      im.setMatrixAt(k++, m4.compose(pv.set(px, PADDY_Y - 0.06, pz), q.setFromEuler(e.set(0, r() * 6.28, 0)), sv.set(s, s * r.range(0.85, 1.2), s)));
    }
    im.count = k;
    im.receiveShadow = true;
    scene.add(im);
  }

  const place = placer(scene, assets, groundH, colliders, r);
  // ห้างนา (กระท่อมเล็กใต้ถุนสูง) + ต้นไม้ใหญ่ให้ร่มเงา
  place('Hut', -10.5, 7.5, 1.15, 0.5, groundH(-10.5, 7.5) - 0.05, 1.6);
  for (const [n, x, z, s] of [['Tree1', -7.5, 9.5, 1.3], ['Tree2', 11, 6.5, 1.2], ['Tree1', 14.5, -6, 1.1], ['Tree2', -15, -4, 1.2], ['Palm', 8.5, 9.5, 1.0], ['Palm', -13.5, 10.5, 0.9], ['Palm', 16, 3, 1.05]]) {
    place(n, x, z, s, undefined, null, 0.5);
  }
  for (const [x, z, s] of [[-5.5, 8.8, 0.8], [6, 8.5, 0.9], [12.5, -1, 0.8], [-12.5, 1, 0.9]]) place('Bush', x, z, s, undefined, null, 0.6);
  for (const [x, z, s] of [[-8.8, -1.5, 0.6], [9.5, -3.5, 0.7], [3.8, 4.4, 0.4], [-6, 3.6, 0.45]]) place('Rock' + (1 + Math.floor(r() * 4)), x, z, s * 1.3, undefined, groundH(x, z) - 0.1, 0.8);
  // ท่าไม้ยื่นลงบ่อ
  {
    let z = 8;
    while (z > -4 && !inPond(dock.x, z - 0.6)) z -= 0.1;
    dock.z0 = z + 0.9; dock.z1 = dock.z0 - 4.3;
    place('Dock', dock.x, dock.z0, 1, Math.PI, dock.y);
  }
  // ภูเขาไกล ๆ (กรวยสีฟ้าอมเขียวจางในหมอก)
  for (let i = 0; i < 9; i++) {
    const m = new THREE.Mesh(new THREE.ConeGeometry(r.range(12, 20), r.range(4, 8), 7), toon(i % 2 ? 0x7fa88a : 0x8fb4a0));
    m.position.set(-80 + i * 20 + r.range(-4, 4), r.range(0, 2), -85 - r.range(0, 15));
    m.rotation.y = r() * 6;
    scene.add(m);
  }

  // กอบัวเยอะ ๆ + ดอกบัวชมพู/ขาว
  {
    const pad = new THREE.CircleGeometry(0.48, 12, 0.35, Math.PI * 2 - 0.5).rotateX(-Math.PI / 2);
    const padMat = toon(0x5c9e3c, { side: THREE.DoubleSide });
    const N = 70;
    const pads = new THREE.InstancedMesh(pad, padMat, N);
    const flowers = [];
    const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), sv = new THREE.Vector3(), pv = new THREE.Vector3();
    let k = 0;
    const centers = [[5.5, -10.5, 2.6], [-6, -9, 2], [7, -2, 1.6], [-8, -4, 1.4], [0, -14, 1.8]];
    for (let t = 0; t < 600 && k < N; t++) {
      const c = centers[t % centers.length];
      const x = c[0] + r.range(-c[2], c[2]), z = c[1] + r.range(-c[2], c[2]);
      if (!inPond(x, z)) continue;
      const s = r.range(0.6, 1.3);
      pads.setMatrixAt(k++, m4.compose(pv.set(x, WATER_Y + 0.02, z), q.setFromEuler(e.set(0, r() * 6.28, 0)), sv.set(s, 1, s)));
      if (r() < 0.3) flowers.push([x + 0.15, z, r() < 0.7 ? 0xf6a8c0 : 0xffffff]);
    }
    pads.count = k;
    scene.add(pads);
    for (const [x, z, col] of flowers) {
      const f = new THREE.Group();
      for (let i = 0; i < 6; i++) {
        const p = new THREE.Mesh(new THREE.SphereGeometry(0.09, 6, 4), toon(col));
        p.scale.set(0.6, 1.4, 0.6);
        p.position.set(Math.cos(i * 1.05) * 0.07, 0.12, Math.sin(i * 1.05) * 0.07);
        p.rotation.set(Math.sin(i * 1.05) * 0.5, 0, -Math.cos(i * 1.05) * 0.5);
        f.add(p);
      }
      const ctr = new THREE.Mesh(new THREE.SphereGeometry(0.05, 6, 4), toon(0xf2d14a));
      ctr.position.y = 0.12; f.add(ctr);
      f.position.set(x, WATER_Y + 0.03, z);
      scene.add(f);
    }
    // ต้นกก/ผักตบริมบ่อ
    const reed = new THREE.ConeGeometry(0.03, 1.0, 4).translate(0, 0.5, 0);
    const rm = new THREE.InstancedMesh(reed, swaying(0x6f9a3e, 0.25), 160);
    k = 0;
    for (let t = 0; t < 3000 && k < 160; t++) {
      const th = r.range(0, 6.28), rr = pondR(th) + r.range(-1.2, 0.3);
      const x = POND.x + Math.cos(th) * rr, z = POND.z + Math.sin(th) * rr;
      const h = groundH(x, z);
      if (h > WATER_Y + 0.2 || h < WATER_Y - 0.35 || onDock(x, z) || (Math.abs(x - 1.5) < 2 && z > 2)) continue;
      for (let j = 0; j < 4 && k < 160; j++, k++) {
        m4.makeRotationFromEuler(e.set(r.range(-0.15, 0.15), 0, r.range(-0.15, 0.15)));
        m4.scale(sv.set(1, r.range(0.6, 1.3), 1));
        m4.setPosition(x + r.range(-0.3, 0.3), h, z + r.range(-0.3, 0.3));
        rm.setMatrixAt(k, m4);
      }
    }
    rm.count = k;
    scene.add(rm);
  }

  // ควายกินหญ้า
  const mkBuffalo = () => {
    const g = new THREE.Group();
    const dark = toon(0x4a4a50), horn = toon(0xd8d0bc);
    const body = new THREE.Mesh(new THREE.BoxGeometry(1.5, 0.8, 0.8), dark); body.position.y = 0.95;
    const head = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.45, 0.45), dark); head.position.set(0.95, 0.85, 0);
    const nose = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.3, 0.36), toon(0x5c5c62)); nose.position.set(1.25, 0.75, 0);
    g.add(body, head, nose);
    for (const s of [-1, 1]) {
      const h = new THREE.Mesh(new THREE.TorusGeometry(0.28, 0.05, 5, 10, Math.PI), horn);
      h.position.set(0.9, 1.1, s * 0.22); h.rotation.set(0, s * 0.4, Math.PI * 0.1);
      g.add(h);
    }
    const legs = [];
    for (const [x, z] of [[0.55, 0.28], [0.55, -0.28], [-0.55, 0.28], [-0.55, -0.28]]) {
      const l = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.6, 0.18), dark); l.position.set(x, 0.3, z); g.add(l); legs.push(l);
    }
    const tail = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.02, 0.6, 4), dark); tail.position.set(-0.78, 0.85, 0); tail.rotation.z = 0.3; g.add(tail);
    g.traverse(o => { if (o.isMesh) o.castShadow = true; });
    return { g, head, tail, legs };
  };
  const buffalo = [];
  for (const [x, z, ry] of [[12.5, 4.5, 2.4], [-14, 3.5, -0.6]]) {
    const b = mkBuffalo();
    b.g.position.set(x, groundH(x, z), z); b.g.rotation.y = ry;
    scene.add(b.g);
    colliders.push({ x, z, r: 1.1 });
    buffalo.push(b);
  }
  // หุ่นไล่กา
  {
    const g = new THREE.Group();
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 1.8, 5), toon(0x7a5a3a)); pole.position.y = 0.9;
    const arm = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 1.2, 5), toon(0x7a5a3a)); arm.position.y = 1.35; arm.rotation.z = Math.PI / 2;
    const shirt = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.6, 0.25), toon(0xc0453a)); shirt.position.y = 1.2;
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.18, 8, 6), toon(0xe8d8a8)); head.position.y = 1.7;
    const hat = new THREE.Mesh(new THREE.ConeGeometry(0.34, 0.18, 12), toon(0xebcd8e)); hat.position.y = 1.86;
    g.add(pole, arm, shirt, head, hat);
    g.position.set(-7, PADDY_Y, 14);
    g.traverse(o => { if (o.isMesh) o.castShadow = true; });
    scene.add(g);
    world.update.push(() => { g.rotation.z = Math.sin(T.value * 1.2) * 0.04; });
  }
  // นกยางขาวยืนในนา
  const egrets = [];
  for (let i = 0; i < 6; i++) {
    const g = new THREE.Group();
    const w = toon(0xffffff);
    const body = new THREE.Mesh(new THREE.SphereGeometry(0.16, 8, 6), w); body.scale.set(1.4, 0.9, 0.8); body.position.y = 0.55;
    const neck = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.04, 0.35, 5), w); neck.position.set(0.17, 0.75, 0); neck.rotation.z = -0.4;
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.06, 6, 5), w); head.position.set(0.25, 0.92, 0);
    const beak = new THREE.Mesh(new THREE.ConeGeometry(0.02, 0.16, 4), toon(0xf2c632)); beak.position.set(0.36, 0.91, 0); beak.rotation.z = -Math.PI / 2;
    const legs = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, 0.45, 3), toon(0x333333)); legs.position.y = 0.22;
    g.add(body, neck, head, beak, legs);
    let x, z;
    for (let t = 0; t < 50; t++) { x = r.range(-24, 24); z = r.range(-26, 15); if (paddyW(x, z) > 0.95 && Math.abs(x) > 4) break; }
    g.position.set(x, PADDY_Y - 0.05, z); g.rotation.y = r() * 6.28;
    scene.add(g);
    egrets.push({ g, head, ph: r() * 10 });
  }
  world.update.push(() => {
    const t = T.value;
    for (const b of buffalo) { const graze = Math.sin(t * 0.5 + b.g.position.x) > 0; b.head.position.y = graze ? 0.55 : 0.85; b.head.rotation.z = graze ? -0.5 : 0; b.tail.rotation.x = Math.sin(t * 2.5) * 0.4; }
    for (const e of egrets) { const peck = Math.sin(t * 0.7 + e.ph) > 0.85; e.g.rotation.z = peck ? -0.7 : 0; }
  });

  const ok = (x, z) => { const h = groundH(x, z); return h < WATER_Y + 0.12 || paddyW(x, z) > 0.3 || onDock(x, z) ? null : h; };
  scatterGrass(scene, { ok, count: mobile ? 4500 : 9000, area: [-24, 24, -26, 16], r });
  scatterFlowers(scene, { ok, count: mobile ? 600 : 1200, area: [-18, 18, -20, 12], r, tints: [0xffffff, 0xfff4c2, 0xffd6e4, 0xc9b6ff] });
  makeClouds(scene, world, { count: 10, area: [-90, 90, -110, -30], height: [22, 34], r, scale: [4, 8] });
  makeMotes(scene, world, { count: mobile ? 60 : 120, area: [-16, 16, -16, 12], r });
  makeFlyers(scene, world, { colors: [0xffffff, 0xffd34d, 0x9fd6ff, 0xffffff, 0xff9fc0], r, groundH: (x, z) => Math.max(groundH(x, z), 0), area: [-10, 10, 0, 10] });
  makeFlyers(scene, world, { colors: [0xffffff, 0xffffff, 0xffffff], r, groundH: () => 7, area: [-20, 20, -24, -6], height: 0, radius: 9, speed: 0.15, wing: [0.5, 0.2], flap: 5 });

  shadowAll(scene, terrain);
  return world;
}
