// ด่าน 3: ชายหาดหินปะการัง — ทรายขาว คลื่นซัดฝั่ง ปะการังใต้น้ำใส ปูเดินเล่น มะพร้าว
import * as THREE from 'three';
import { toon, shared } from '../toon.js';
import { sstep, lerp, rng, makeSky, makeLights, makeTerrain, makeWater, placer, scatterGrass, makeMotes, makeFlyers, shadowAll } from '../kit.js';

const WATER_Y = 0;
const shoreZ = x => -2 + 1.3 * Math.sin(x * 0.17) + 0.6 * Math.sin(x * 0.5 + 1);

function groundH(x, z) {
  const s = shoreZ(x);
  const d = z - s;                                    // >0 = บนหาด
  let h = d > 0 ? 0.12 + d * 0.07 + Math.max(0, d - 9) * 0.12 : 0.12 + d * 0.2 - Math.max(0, -d - 6) * 0.05;
  h = Math.max(h, -3.6 + 0.4 * Math.sin(x * 0.3) * Math.cos(z * 0.4));
  // แนวหินปะการังนอกฝั่ง
  const reef = Math.exp(-((x - 6) ** 2 + (z + 11) ** 2) / 10) * 1.6 + Math.exp(-((x + 7) ** 2 + (z + 8) ** 2) / 6) * 1.2;
  return h + reef + 0.05 * Math.sin(x * 1.3 + z * 0.7);
}

export function build(scene, assets, opts) {
  const { mobile } = opts;
  const r = rng(4242);
  const T = shared.uTime;
  const world = { id: 'beach', update: [], waterY: WATER_Y, colliders: [] };
  const colliders = world.colliders;
  const inWater = (x, z) => groundH(x, z) < WATER_Y - 0.03;
  Object.assign(world, {
    groundH,
    standY: (x, z) => Math.max(groundH(x, z), WATER_Y - 0.1),
    canCast: inWater,
    depthAt: (x, z) => WATER_Y - groundH(x, z),
    walkable(x, z) {
      if (x < -18 || x > 18 || z < -7 || z > 13) return false;
      if (groundH(x, z) < WATER_Y - 0.12) return false;      // ลุยน้ำตื้นได้นิดหน่อย
      for (const c of colliders) if ((x - c.x) ** 2 + (z - c.z) ** 2 < c.r * c.r) return false;
      return true;
    },
    spawn: { x: 0.5, z: 2.6, yaw: Math.PI },
    camFocus: (px, pz) => [px * 0.85, pz * 0.6 - 2.5],
    camBounds: [-12, 12, -7, 7],
    camp: { x: -2.4, z: 2.4, ry: 0.15 },
    ambience: { surf: true },
    special: new THREE.Vector3(6, WATER_Y, -10.5),
    specialR: 3.2,
  });

  makeSky(scene, world, { top: 0x5cb8f2, bot: 0xe8f7fa, fogNear: 45, fogFar: 130 });
  makeLights(scene, world, { mobile, sun: [-12, 26, 14], target: [0, 0, -2], intensity: 2.3, hemi: 0.95 });

  const cSand = new THREE.Color(0xf0dfb4), cSand2 = new THREE.Color(0xe2cd98), cWet = new THREE.Color(0xc9b386), cGrass = new THREE.Color(0x9cbf55);
  const cSea = new THREE.Color(0xd8cfa6), cReef = new THREE.Color(0x9a9a7e);
  const terrain = makeTerrain(scene, world, {
    size: 110, segs: mobile ? 130 : 190, cz: -10, groundH, waterY: WATER_Y,
    colorAt(x, z, h, c) {
      const n = Math.sin(x * 0.7 + z * 0.4) * 0.5 + 0.5;
      c.copy(cSand).lerp(cSand2, n * 0.6);
      if (h < 0.35) c.lerp(cWet, sstep(0.35, 0.05, h));
      if (h < WATER_Y) c.copy(cSea).lerp(cReef, sstep(-1.5, -0.5, h) * sstep(-3.5, -1.5, h + 1.5));
      const d = z - shoreZ(x);
      if (d > 8.5) c.lerp(cGrass, sstep(8.5, 10.5, d) * (0.6 + n * 0.4));
    },
  });
  makeWater(scene, world, { cx: 0, cz: -22, size: 120, segs: mobile ? 110 : 170, groundH, waterY: WATER_Y, shallow: 0x7fe3d4, deep: 0x1a8aa0, depthScale: 3.2, surf: 1, waves: 0.03, alphaMin: 0.22, alphaMax: 0.92, glint: 0.5, flow: [0.06, 0.1] });

  const place = placer(scene, assets, groundH, colliders, r);
  // มะพร้าวหลังหาด เอียงเข้าหาทะเล
  for (const [x, dz, s] of [[-9, 6.5, 1.1], [-6.5, 8, 0.95], [-12, 9.5, 1.2], [8.5, 7, 1.05], [11, 9, 1.2], [5, 10.5, 0.9], [-2, 11.5, 1.0], [14, 6.5, 1.0], [-15, 7, 1.1]]) {
    if (Math.abs(x) < 6) continue;                 // ไม่บังกล้อง
    const z = shoreZ(x) + dz;
    place('Palm', x, z, s, Math.PI / 2 + r.range(-0.5, 0.5), null, 0.4);
  }
  for (const [x, dz, s] of [[-4, 9.5, 0.9], [3, 9, 1.0], [10, 10.5, 1.1], [-11, 11, 1.0], [15, 9.5, 0.9]]) place('Bush', x, shoreZ(x) + dz, s, undefined, null, 0.6);
  // โขดหิน
  const rockMat = toon(0xb9b3a6);
  for (const [x, z, s] of [[7.5, 1.5, 1.4], [9.2, 0.2, 0.8], [-8.5, 0.5, 1.2], [-10, -1.5, 0.7], [3.5, -5.5, 0.9], [-4.5, -7, 1.1], [12, -4, 1.3], [-13, -3, 1.0], [6, -10, 0.8], [-7, -8, 0.9]]) {
    const o = place('Rock' + (1 + Math.floor(r() * 4)), x, z, s * 1.4, undefined, groundH(x, z) - 0.2 * s, inWater(x, z) ? 0 : 0.95);
    o.traverse(m => { if (m.isMesh) m.material = rockMat; });
  }

  // ปะการังหลากสี (InstancedMesh)
  {
    const geos = [new THREE.IcosahedronGeometry(0.22, 0), new THREE.ConeGeometry(0.08, 0.45, 5).translate(0, 0.22, 0), new THREE.SphereGeometry(0.16, 6, 4)];
    const cols = [0xff7aa8, 0xffb347, 0xb48cff, 0x5fd3c8, 0xffe066, 0xff6b6b];
    const sites = [[6, -10.5, 2.4], [-7, -8, 1.8], [2, -7.5, 1.2], [9, -6.5, 1.3], [-3, -10, 1.5], [12, -9, 1.6]];
    const c = new THREE.Color(), m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), sv = new THREE.Vector3(), pv = new THREE.Vector3();
    geos.forEach((g, gi) => {
      const N = 70;
      const im = new THREE.InstancedMesh(g, toon(0xffffff), N);
      let k = 0;
      for (let t = 0; t < N * 4 && k < N; t++) {
        const s = sites[Math.floor(r() * sites.length)];
        const x = s[0] + r.range(-s[2], s[2]), z = s[1] + r.range(-s[2], s[2]);
        const h = groundH(x, z);
        if (h > WATER_Y - 0.35) continue;
        const sc = r.range(0.6, 1.6);
        im.setMatrixAt(k, m4.compose(pv.set(x, h, z), q.setFromEuler(e.set(r.range(-0.3, 0.3), r() * 6.28, r.range(-0.3, 0.3))), sv.set(sc, sc * (gi === 1 ? r.range(0.8, 1.8) : 1), sc)));
        im.setColorAt(k, c.set(cols[Math.floor(r() * cols.length)]));
        k++;
      }
      im.count = k;
      scene.add(im);
    });
    // ปลาเล็ก ๆ ว่ายใต้น้ำ (เงาสีเข้ม)
    const fishG = new THREE.ConeGeometry(0.05, 0.22, 4).rotateZ(Math.PI / 2);
    const NF = 40;
    const fs = new THREE.InstancedMesh(fishG, new THREE.MeshBasicMaterial({ color: 0x2c5b6a, transparent: true, opacity: 0.55 }), NF);
    const fd = Array.from({ length: NF }, () => [r.range(-12, 12), r.range(-14, -4), r.range(1, 3), r() * 6.28, r.range(0.2, 0.5)]);
    scene.add(fs);
    world.update.push(() => {
      const t = T.value;
      fd.forEach((f, i) => {
        const a = t * f[4] + f[3];
        const x = f[0] + Math.cos(a) * f[2], z = f[1] + Math.sin(a) * f[2];
        const y = Math.max(groundH(x, z) + 0.2, WATER_Y - 0.5);
        if (y > WATER_Y - 0.15) { fs.setMatrixAt(i, m4.makeScale(0, 0, 0)); return; }
        m4.makeRotationY(-a - Math.PI / 2 * 0);
        m4.makeRotationFromEuler(e.set(0, -a, 0));
        m4.setPosition(x, y, z);
        fs.setMatrixAt(i, m4);
      });
      fs.instanceMatrix.needsUpdate = true;
    });
  }

  // ปูเดินข้าง ๆ บนหาด
  {
    const crabs = [];
    const body = new THREE.SphereGeometry(0.11, 8, 5);
    body.scale(1.3, 0.55, 1);
    const cm = toon(0xe0562e);
    for (let i = 0; i < 7; i++) {
      const g = new THREE.Group();
      const b = new THREE.Mesh(body, cm);
      g.add(b);
      for (const s of [-1, 1]) {
        const claw = new THREE.Mesh(new THREE.SphereGeometry(0.045, 6, 4), cm);
        claw.position.set(s * 0.13, 0.02, 0.1);
        g.add(claw);
        for (let l = 0; l < 3; l++) {
          const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.008, 0.008, 0.12, 3), cm);
          leg.position.set(s * 0.13, -0.02, -0.05 + l * 0.05); leg.rotation.z = s * 1.0;
          g.add(leg);
        }
      }
      for (const s of [-0.04, 0.04]) { const eye = new THREE.Mesh(new THREE.SphereGeometry(0.018, 5, 4), new THREE.MeshBasicMaterial({ color: 0x111111 })); eye.position.set(s, 0.07, 0.07); g.add(eye); }
      const x0 = r.range(-12, 12);
      scene.add(g);
      crabs.push({ g, x0, dz: r.range(0.6, 3.5), ph: r() * 10, sp: r.range(0.3, 0.7) });
    }
    world.update.push(() => {
      const t = T.value;
      for (const c of crabs) {
        const walk = Math.sin(t * c.sp + c.ph);
        const x = c.x0 + walk * 2.5;
        const z = shoreZ(x) + c.dz + Math.sin(t * 0.3 + c.ph) * 0.3;
        c.g.position.set(x, groundH(x, z) + 0.05, z);
        c.g.rotation.y = 0;
        c.g.rotation.z = Math.sin(t * 14 + c.ph) * 0.08 * Math.abs(Math.cos(t * c.sp + c.ph));
      }
    });
  }
  // เปลือกหอย ปลาดาว
  {
    const shell = new THREE.InstancedMesh(new THREE.ConeGeometry(0.06, 0.05, 6), toon(0xffffff), 50);
    const c = new THREE.Color(), m4 = new THREE.Matrix4();
    for (let i = 0; i < 50; i++) {
      const x = r.range(-15, 15), z = shoreZ(x) + r.range(0.2, 7);
      m4.makeRotationY(r() * 6.28); m4.setPosition(x, groundH(x, z) + 0.01, z);
      shell.setMatrixAt(i, m4);
      shell.setColorAt(i, c.set([0xfff3e6, 0xffd6c9, 0xf7b267, 0xffe8a3][i % 4]));
    }
    scene.add(shell);
  }

  const ok = (x, z) => { const d = z - shoreZ(x); return d < 9 ? null : groundH(x, z); };
  scatterGrass(scene, { ok, count: mobile ? 1600 : 3200, area: [-30, 30, 4, 18], r, root: 0x8aa848, tip: 0xe0d890, height: 1.4 });
  makeMotes(scene, world, { count: 40, area: [-14, 14, -4, 10], r, color: 0xffffff, size: 0.05 });
  makeFlyers(scene, world, { colors: [0xffffff, 0xffffff, 0xf0f0f0], r, groundH: () => 5, area: [-6, 6, -10, 2], height: 0, radius: 7, speed: 0.18, wing: [0.55, 0.22], flap: 5 });

  shadowAll(scene, terrain);
  return world;
}
