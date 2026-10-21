// ด่าน 2: ลำธารกลางป่าลึก — ต้นไม้ยักษ์ เฟิร์น ลำแสงลอดเรือนยอด หิ่งห้อย ขอนไม้พาดลำธาร
import * as THREE from 'three';
import { toon, swaying, shared } from '../toon.js';
import { sstep, lerp, rng, makeSky, makeLights, makeTerrain, makeWater, placer, scatterGrass, scatterFlowers, makeGodRays, makeMotes, makeFlyers, shadowAll, mergeGeos, makeFishShadows } from '../kit.js';

const WATER_Y = -0.35;
const POOL = { x: 3, z: -2.5, r: 3.4 };
const zc = x => 1.4 * Math.sin(x * 0.2) - 2.2;
const halfW = x => 1.7 + 0.5 * Math.sin(x * 0.4 + 1);

function groundH(x, z) {
  const sd = z - zc(x), dz = Math.abs(sd);
  let h = 0.18 * Math.sin(x * 0.3 + 2) * Math.cos(z * 0.25) + 0.1 * Math.sin(x * 0.8 + z * 0.5) + 0.12;
  h += Math.pow(Math.max(0, -sd - 6.5), 1.4) * 0.28 + Math.pow(Math.max(0, sd - 9), 1.2) * 0.05;   // ไหล่เขาฝั่งหลัง สูงชัน · ฝั่งหน้าลาดเบา
  const e = Math.max(halfW(x) - dz, POOL.r - Math.hypot(x - POOL.x, z - POOL.z));
  const deep = Math.hypot(x - POOL.x, z - POOL.z) < POOL.r + 1 ? 1.9 : 1.2;
  h = lerp(h, 0.12, sstep(-2.5, 0, e));
  h -= deep * sstep(-0.3, 1.6, e);
  return h;
}

export function build(scene, assets, opts) {
  const { mobile } = opts;
  const r = rng(777);
  const world = { id: 'forest', update: [], waterY: WATER_Y, colliders: [] };
  const colliders = world.colliders;
  const log = { x: -4.2, w: 0.45, z0: zc(-4.2) - 3.4, z1: zc(-4.2) + 3.4, y: 0.42 };
  const onLog = (x, z) => Math.abs(x - log.x) < log.w && z > log.z0 && z < log.z1;
  const inWater = (x, z) => groundH(x, z) < WATER_Y - 0.02;
  Object.assign(world, {
    groundH,
    standY: (x, z) => onLog(x, z) ? log.y : Math.max(groundH(x, z), WATER_Y),
    canCast: (x, z) => inWater(x, z) && !onLog(x, z),
    onSolid: onLog,
    depthAt: (x, z) => WATER_Y - groundH(x, z),
    walkable(x, z) {
      if (x < -18 || x > 18 || z < -11 || z > 11) return false;
      if (onLog(x, z)) return true;
      if (groundH(x, z) < WATER_Y + 0.08) return false;
      for (const c of colliders) if ((x - c.x) ** 2 + (z - c.z) ** 2 < c.r * c.r) return false;
      return true;
    },
    spawn: { x: -1.5, z: 3.2, yaw: Math.PI },
    camFocus: (px, pz) => [px * 0.85, pz * 0.6 - 1.2],
    camBounds: [-12, 12, -6, 6],
    camp: { x: -3.6, z: 3.4, ry: -0.3 },
    ambience: { stream: true },
    special: new THREE.Vector3(POOL.x, WATER_Y, POOL.z),
    specialR: 2.0,
    liveFish: { count: 10, area: [-14, 14, -6.5, 1.5], minDepth: 0.4, depth: [0.2, 0.35], scale: [0.45, 0.75] },
    rayK: 1,
  });

  makeSky(scene, world, { top: 0x8fbfa0, bot: 0xcfe6cc, fogNear: 20, fogFar: 72 });
  makeLights(scene, world, { mobile, sun: [-10, 26, 6], target: [0, 0, -1], intensity: 1.55, hemi: 0.62, span: 24 });
  world.hemi.color.set(0xd6f0d0); world.hemi.groundColor.set(0x3f5a32);

  const cMoss = new THREE.Color(0x4f8a3a), cMoss2 = new THREE.Color(0x3d7032), cLeaf = new THREE.Color(0x7a7a3e);
  const cMud = new THREE.Color(0x8a7a5a), cBed = new THREE.Color(0x5c6e4a), cDeep = new THREE.Color(0x34503e);
  const terrain = makeTerrain(scene, world, {
    size: 70, segs: mobile ? 120 : 180, groundH, waterY: WATER_Y,
    colorAt(x, z, h, c) {
      const n = Math.sin(x * 0.5 + Math.cos(z * 0.3) * 2) * 0.5 + 0.5, n2 = Math.sin(z * 0.7 - x * 0.2) * 0.5 + 0.5;
      c.copy(cMoss).lerp(cMoss2, n).lerp(cLeaf, n2 * n2 * 0.5);
      if (h < WATER_Y + 0.3) {
        c.lerp(cMud, sstep(WATER_Y + 0.3, WATER_Y - 0.1, h));
        c.lerp(cBed, sstep(WATER_Y - 0.1, WATER_Y - 0.7, h));
        c.lerp(cDeep, sstep(WATER_Y - 0.7, WATER_Y - 1.8, h));
      }
    },
  });
  makeWater(scene, world, { cx: 0, cz: -2, size: 44, segs: mobile ? 110 : 160, groundH, waterY: WATER_Y, shallow: 0x8fd4b0, deep: 0x2f7a62, flow: [0.38, 0.02], depthScale: 1.5, glint: 0.5 });
  makeFishShadows(scene, world, { count: 12, area: [-12, 12, -5, 0], r, size: 1.1, minDepth: 0.5, color: 0x24402e });

  const place = placer(scene, assets, groundH, colliders, r);
  // ต้นไม้ยักษ์หนาแน่น
  const tops = [];
  const clear = (x, z) => Math.abs(z - zc(x)) < halfW(x) + 2.2 || Math.hypot(x - POOL.x, z - POOL.z) < POOL.r + 2 || (Math.abs(x + 1.5) < 3 && z > 1 && z < 6) || Math.hypot(x + 3.6, z - 3.4) < 1.8;
  for (let i = 0, n = 0; i < 400 && n < 46; i++) {
    const x = r.range(-24, 24), z = r.range(-16, 16);
    if (clear(x, z) || (Math.abs(x) < 12.5 && z > -5.5)) continue;     // ไม่บังกล้องที่มองจากด้านหน้า
    if (colliders.some(c => (c.x - x) ** 2 + (c.z - z) ** 2 < 9)) continue;
    const big = r() < 0.6;
    const name = big ? (r() < 0.5 ? 'Tree1' : 'Tree2') : (r() < 0.5 ? 'Pine2' : 'Pine1');
    const s = big ? r.range(1.6, 2.4) : r.range(1.2, 1.7);
    place(name, x, z, s, undefined, null, 0.45);
    if (big && Math.abs(x) < 14 && Math.abs(z) < 10) tops.push(new THREE.Vector3(x, groundH(x, z) + 5 * s, z));
    n++;
  }
  // หินมอสในลำธาร
  for (let i = 0; i < 26; i++) {
    const x = r.range(-16, 16), z = zc(x) + r.range(-2.4, 2.4);
    if (Math.abs(x - log.x) < 1.2) continue;
    place('Rock' + (1 + Math.floor(r() * 4)), x, z, r.range(0.35, 0.9), undefined, groundH(x, z) - 0.1, inWater(x, z) ? 0 : 0.8);
  }
  for (let i = 0; i < 14; i++) {
    const x = r.range(-18, 18), z = r.range(-9, 9);
    if (clear(x, z)) continue;
    place('Bush', x, z, r.range(0.8, 1.3), undefined, null, 0.6);
  }

  // ขอนไม้พาดลำธาร
  {
    const L = log.z1 - log.z0;
    const lg = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.48, L + 1.2, 10), toon(0x6b4a33));
    lg.rotation.x = Math.PI / 2;
    lg.position.set(log.x, log.y - 0.38, (log.z0 + log.z1) / 2);
    scene.add(lg);
    const moss = new THREE.Mesh(new THREE.CylinderGeometry(0.44, 0.5, L * 0.5, 10, 1, true, -0.9, 1.8), toon(0x5f8f3a));
    moss.rotation.x = Math.PI / 2;
    moss.position.copy(lg.position).add(new THREE.Vector3(0, 0.02, 0.6));
    scene.add(moss);
  }

  // เฟิร์น
  {
    const parts = [];
    for (let k = 0; k < 7; k++) {
      const g = new THREE.PlaneGeometry(0.18, 0.9, 1, 3);
      const p = g.attributes.position;
      for (let i = 0; i < p.count; i++) { const y = p.getY(i) + 0.45; p.setY(i, y * 0.8); p.setZ(i, -y * y * 0.5); p.setX(i, p.getX(i) * (1 - y * 0.8)); }
      g.rotateX(-0.5);
      g.rotateY(k * Math.PI * 2 / 7);
      const n = g.attributes.position.count, c = new Float32Array(n * 3);
      const c0 = new THREE.Color(0x3f7a35), c1 = new THREE.Color(0x8cc15a);
      for (let i = 0; i < n; i++) { const t = Math.min(1, g.attributes.position.getY(i) / 0.6); const cc = c0.clone().lerp(c1, t); c.set([cc.r, cc.g, cc.b], i * 3); }
      g.setAttribute('color', new THREE.BufferAttribute(c, 3));
      parts.push(g.toNonIndexed());
    }
    const fg = mergeGeos(parts);
    const N = mobile ? 160 : 320;
    const fm = new THREE.InstancedMesh(fg, toon(0xffffff, { vertexColors: true, side: THREE.DoubleSide }), N);
    const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), sv = new THREE.Vector3(), pv = new THREE.Vector3();
    let k = 0;
    for (let t = 0; t < N * 5 && k < N; t++) {
      const x = r.range(-22, 22), z = r.range(-14, 14);
      const h = groundH(x, z);
      if (h < WATER_Y + 0.15 || onLog(x, z) || (Math.abs(x + 1.5) < 2 && z > 1.5 && z < 5.5)) continue;
      const s = r.range(0.7, 1.6);
      fm.setMatrixAt(k++, m4.compose(pv.set(x, h, z), q.setFromEuler(e.set(0, r() * 6.28, 0)), sv.set(s, s, s)));
    }
    fm.count = k;
    fm.receiveShadow = true;
    scene.add(fm);
  }
  // เห็ด
  {
    const cap = new THREE.Mesh(new THREE.SphereGeometry(0.1, 8, 5, 0, Math.PI * 2, 0, Math.PI / 2), toon(0xd8483a));
    const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.04, 0.12, 6), toon(0xf3ead2));
    for (let i = 0; i < 30; i++) {
      const x = r.range(-14, 14), z = r.range(-9, 9), h = groundH(x, z);
      if (h < WATER_Y + 0.2) continue;
      const g = new THREE.Group();
      const s = cap.clone(), st = stem.clone();
      st.position.y = 0.06; s.position.y = 0.11;
      g.add(st, s);
      g.position.set(x, h, z);
      g.scale.setScalar(r.range(0.6, 1.4));
      scene.add(g);
    }
  }

  const ok = (x, z) => { const h = groundH(x, z); return h < WATER_Y + 0.15 || onLog(x, z) ? null : h; };
  scatterGrass(scene, { ok, count: mobile ? 4000 : 9000, area: [-24, 24, -14, 14], r, root: 0x2f5e2a, tip: 0x88b45a, height: 1.2 });
  scatterFlowers(scene, { ok, count: mobile ? 300 : 600, area: [-18, 18, -10, 10], r, tints: [0xfff0a0, 0xc9b6ff, 0xffffff], clusters: 18 });
  makeGodRays(scene, world, tops.slice(0, 10), r, { strength: 0.42, length: 18, width: [0.8, 2.4] });
  makeMotes(scene, world, { count: mobile ? 60 : 120, area: [-14, 14, -8, 8], r, color: 0xd9ff8a, size: 0.12, glow: true, y: [0.3, 3] });
  makeMotes(scene, world, { count: mobile ? 40 : 80, area: [-14, 14, -8, 8], r, color: 0xfff3b0, size: 0.06 });
  makeFlyers(scene, world, { colors: [0x6fc3ff, 0x6fc3ff, 0xffffff], r, groundH, area: [-8, 8, -4, 6], wing: [0.2, 0.15] });

  shadowAll(scene, terrain);
  return world;
}
