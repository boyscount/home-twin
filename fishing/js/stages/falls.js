// ด่าน 1: น้ำตกสายหมอก — ลานหญ้าริมหน้าผา น้ำตกลงแอ่งน้ำใส
import * as THREE from 'three';
import { toon, swaying, shared } from '../toon.js';
import { sstep, lerp, rng, makeSky, makeLights, makeTerrain, makeWater, placer, scatterGrass, scatterFlowers, makeGodRays, makeMotes, makeFlyers, shadowAll, makeClouds, makeFishShadows } from '../kit.js';

const POND = { x: 0, z: -5 };
const WATER_Y = -0.3;
const CLIFF_R = 7.6;
const ARC = 2.007;

function pondR(th) { return 6.0 + 0.6 * Math.sin(2 * th + 1) + 0.4 * Math.sin(3 * th + 2); }
function cliffTop(a) { return 8 * (1 - 0.35 * Math.max(0, Math.abs(a) - 1.2) / 0.8); }
const arcA = (dx, dz, d) => Math.acos(Math.max(-1, Math.min(1, -dz / (d || 1))));

function groundH(x, z) {
  const dx = x - POND.x, dz = z - POND.z, d = Math.hypot(dx, dz);
  const th = Math.atan2(dz, dx);
  let h = 0.22 * Math.sin(x * 0.23 + 1) * Math.cos(z * 0.29) + 0.12 * Math.sin(x * 0.61 + z * 0.43) + 0.1;
  const e = pondR(th) - d;
  h = lerp(h, 0.1, sstep(-3, 0, e));
  h -= 2.1 * sstep(-0.2, 3.2, e);
  const a = arcA(dx, dz, d);
  const w = (1 - sstep(1.85, 2.08, a)) * sstep(8.0, 10.0, d);
  if (w > 0) h = lerp(h, cliffTop(a) - 0.75 + 0.2 * Math.sin(x * 0.4) * Math.cos(z * 0.5), w);
  return h;
}

export function build(scene, assets, opts) {
  const { mobile } = opts;
  const r = rng(12345);
  const world = { id: 'falls', update: [], waterY: WATER_Y, colliders: [], fallPos: new THREE.Vector3() };
  const T = shared.uTime;
  const colliders = world.colliders;
  const dock = { x: 2.6, z0: 0, z1: 0, w: 0.72, y: 0.27 };
  const onDock = (x, z) => Math.abs(x - dock.x) < dock.w && z < dock.z0 + 0.1 && z > dock.z1;
  const inWater = (x, z) => groundH(x, z) < WATER_Y - 0.02;
  const inCliff = (x, z) => { const dx = x - POND.x, dz = z - POND.z, d = Math.hypot(dx, dz); return dz < 0 && arcA(dx, dz, d) < ARC + 0.05 && d > 6.9; };

  Object.assign(world, {
    groundH,
    standY: (x, z) => onDock(x, z) ? dock.y : Math.max(groundH(x, z), WATER_Y),
    canCast: (x, z) => inWater(x, z) && !onDock(x, z) && !inCliff(x, z),
    onSolid: (x, z) => onDock(x, z),
    depthAt: (x, z) => WATER_Y - groundH(x, z),
    walkable(x, z) {
      if (x < -17 || x > 17 || z < -13 || z > 15) return false;
      if (onDock(x, z)) return true;
      if (groundH(x, z) < WATER_Y + 0.08) return false;
      const dx = x - POND.x, dz = z - POND.z, d = Math.hypot(dx, dz);
      if (arcA(dx, dz, d) < ARC + 0.05 && d > CLIFF_R - 1.0) return false;
      for (const c of colliders) if ((x - c.x) ** 2 + (z - c.z) ** 2 < c.r * c.r) return false;
      return true;
    },
    spawn: { x: 1.5, z: 4.5, yaw: Math.PI },
    camFocus: (px, pz) => [px * 0.8, pz * 0.55 + POND.z * 0.45],
    camBounds: [-9, 9, -7, 8],
    camp: { x: -0.6, z: 3.2, ry: 0.2 },
    ambience: { falls: true },
    specialR: 3.4,
    liveFish: { count: 9, area: [-5.5, 5.5, -10.5, 0.5] },
  });

  makeSky(scene, world, {});
  makeLights(scene, world, { mobile });

  const cGrass = new THREE.Color(0x86bd4c), cGrass2 = new THREE.Color(0x6aa53e), cDry = new THREE.Color(0xa9c25a);
  const cSand = new THREE.Color(0xc9b787), cBed = new THREE.Color(0x6f8a5a), cDeep = new THREE.Color(0x3f6a52);
  const terrain = makeTerrain(scene, world, {
    size: 84, segs: mobile ? 130 : 200, groundH, waterY: WATER_Y,
    colorAt(x, z, h, c) {
      const n = Math.sin(x * 0.35 + Math.sin(z * 0.2) * 2) * 0.5 + 0.5, n2 = Math.sin(z * 0.5 + x * 0.13) * 0.5 + 0.5;
      c.copy(cGrass).lerp(cGrass2, n * 0.7).lerp(cDry, n2 * n * 0.45);
      if (h < WATER_Y + 0.25) {
        c.lerp(cSand, sstep(WATER_Y + 0.25, WATER_Y - 0.15, h));
        c.lerp(cBed, sstep(WATER_Y - 0.15, WATER_Y - 0.9, h));
        c.lerp(cDeep, sstep(WATER_Y - 0.9, WATER_Y - 1.9, h));
      }
    },
  });

  const place = placer(scene, assets, groundH, colliders, r);
  const cliff = place('Cliff', POND.x, POND.z, 1, Math.PI, 0);
  cliff.updateMatrixWorld(true);
  const ray = new THREE.Raycaster();
  const hitZ = (x, y) => {
    ray.set(new THREE.Vector3(x, y, POND.z), new THREE.Vector3(0, 0, -1));
    const h = ray.intersectObject(cliff, true)[0];
    return h ? h.point.z : POND.z - CLIFF_R;
  };
  ray.set(new THREE.Vector3(0, 30, POND.z - CLIFF_R - 3), new THREE.Vector3(0, -1, 0));
  const topHit = ray.intersectObject(cliff, true)[0];
  const lipY = topHit ? topHit.point.y : 7;
  const lipZ = hitZ(0, lipY - 0.3);

  // ---------- น้ำตก ----------
  const fallMat = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, side: THREE.DoubleSide,
    uniforms: { uTime: T },
    vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
    fragmentShader: `uniform float uTime; varying vec2 vUv;
float h(vec2 p){ return fract(sin(dot(p, vec2(127.1,311.7)))*43758.5453); }
float n(vec2 p){ vec2 i=floor(p), f=fract(p); f=f*f*(3.0-2.0*f); return mix(mix(h(i),h(i+vec2(1,0)),f.x),mix(h(i+vec2(0,1)),h(i+vec2(1,1)),f.x),f.y); }
void main(){
  vec2 q = vec2(vUv.x * 7.0, vUv.y * 5.0 - uTime * 2.2);
  float s = n(q) * 0.65 + n(q * 2.3 + 4.0) * 0.35;
  float streak = smoothstep(0.56, 0.6, s);
  vec3 col = mix(vec3(0.55, 0.82, 0.86), vec3(0.78, 0.94, 0.95), smoothstep(0.35, 0.4, s));
  col = mix(col, vec3(1.0), streak);
  float edge = smoothstep(0.0, 0.14, vUv.x) * smoothstep(1.0, 0.86, vUv.x);
  col = mix(col, vec3(1.0), smoothstep(0.86, 1.0, vUv.y) * 0.8);
  gl_FragColor = vec4(col, (0.78 + streak * 0.22) * edge * smoothstep(0.0, 0.03, vUv.y));
}`,
  });
  {
    const NU = 10, NV = 44, W0 = 1.7;
    const g = new THREE.BufferGeometry();
    const p = [], uv = [], idx = [];
    for (let j = 0; j <= NV; j++) {
      const v = j / NV, y = lerp(lipY + 0.05, WATER_Y - 0.05, v);
      for (let i = 0; i <= NU; i++) {
        const u = i / NU, x = (u - 0.5) * W0 * (1 + v * 0.45);
        const z = Math.max(hitZ(x * 0.8, y), hitZ(x * 0.8, y - 0.35)) + 0.22 + Math.sin(u * Math.PI) * 0.12 + v * 0.25;
        p.push(x, y, z); uv.push(u, v);
      }
    }
    for (let j = 0; j < NV; j++) for (let i = 0; i < NU; i++) { const a = j * (NU + 1) + i, b = a + NU + 1; idx.push(a, b, a + 1, a + 1, b, b + 1); }
    g.setAttribute('position', new THREE.Float32BufferAttribute(p, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    g.setIndex(idx);
    const fall = new THREE.Mesh(g, fallMat);
    fall.renderOrder = 2;
    scene.add(fall);
    world.fallPos.set(0, WATER_Y, p[p.length - 1 - (NU / 2) * 3] + 0.3);

    const sg = new THREE.BufferGeometry();
    const sp = [], su = [], si = [], NS = 16;
    for (let j = 0; j <= NS; j++) {
      const z = lipZ - j * 0.9;
      for (let i = 0; i <= 2; i++) {
        const x = (i - 1) * (1.0 + j * 0.05) + Math.sin(j * 0.6) * 0.6 * (j / NS);
        ray.set(new THREE.Vector3(x, 30, z), new THREE.Vector3(0, -1, 0));
        const hh = ray.intersectObjects([cliff, terrain], true)[0];
        sp.push(x, (hh ? hh.point.y : lipY) + 0.08, z); su.push(i / 2, -j / 4);
      }
    }
    for (let j = 0; j < NS; j++) for (let i = 0; i < 2; i++) { const a = j * 3 + i, b = a + 3; si.push(a, a + 1, b, a + 1, b + 1, b); }
    sg.setAttribute('position', new THREE.Float32BufferAttribute(sp, 3));
    sg.setAttribute('uv', new THREE.Float32BufferAttribute(su, 2));
    sg.setIndex(si);
    const stream = new THREE.Mesh(sg, fallMat);
    stream.renderOrder = 2;
    scene.add(stream);
  }
  world.special = world.fallPos;

  makeWater(scene, world, { cx: POND.x, cz: POND.z - 0.5, size: 18, segs: mobile ? 70 : 100, groundH, waterY: WATER_Y, shallow: 0x6bcab8, deep: 0x1a6b66, fall: world.fallPos, glint: 0.7 });
  makeFishShadows(scene, world, { count: 10, area: [-4, 4, -9, -1], r, size: 1.3, minDepth: 0.6 });
  makeClouds(scene, world, { count: 7, area: [-60, 60, -80, -30], height: [20, 30], r, scale: [3, 6] });

  // ---------- ฟองและละอองน้ำตก ----------
  {
    const N = 16;
    const fm = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(0.42, 1), toon(0xffffff, { emissive: 0x9fb8bb, transparent: true, opacity: 0.92 }), N);
    const life = Array.from({ length: N }, (_, i) => i / N);
    const off = Array.from({ length: N }, () => [r.range(-1.1, 1.1), r.range(-0.3, 0.9)]);
    const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), sv = new THREE.Vector3(), pv = new THREE.Vector3();
    scene.add(fm);
    const MN = mobile ? 90 : 180;
    const mg = new THREE.BufferGeometry();
    const mp = new Float32Array(MN * 3), ml = new Float32Array(MN), mv = [];
    for (let i = 0; i < MN; i++) { ml[i] = r(); mv.push([r.range(-0.5, 0.5), r.range(0.6, 1.4), r.range(0.2, 1.0)]); }
    mg.setAttribute('position', new THREE.BufferAttribute(mp, 3));
    mg.setAttribute('life', new THREE.BufferAttribute(ml, 1));
    const mist = new THREE.Points(mg, new THREE.ShaderMaterial({
      transparent: true, depthWrite: false,
      uniforms: { uScale: { value: opts.pixelRatio * 260 } },
      vertexShader: `attribute float life; varying float vL; uniform float uScale;
void main(){ vL = life; vec4 mv = modelViewMatrix * vec4(position, 1.0); gl_PointSize = uScale * (0.25 + life * 0.6) / -mv.z; gl_Position = projectionMatrix * mv; }`,
      fragmentShader: `varying float vL; void main(){ float d = length(gl_PointCoord - 0.5); gl_FragColor = vec4(1.0, 1.0, 1.0, smoothstep(0.5, 0.1, d) * (1.0 - vL) * 0.45); }`,
    }));
    mist.frustumCulled = false;
    scene.add(mist);
    world.update.push(dt => {
      const F = world.fallPos;
      for (let i = 0; i < N; i++) {
        life[i] += dt * 0.55;
        if (life[i] > 1) { life[i] -= 1; off[i] = [r.range(-1.1, 1.1), r.range(-0.3, 0.9)]; }
        const l = life[i], s = Math.sin(l * Math.PI) * (0.6 + 0.5 * (i % 3) / 2);
        pv.set(F.x + off[i][0] * (1 + l * 0.6), WATER_Y + 0.05 + l * 0.35, F.z + off[i][1] + l * 0.5);
        sv.setScalar(Math.max(s, 0.01));
        fm.setMatrixAt(i, m4.compose(pv, q, sv));
      }
      fm.instanceMatrix.needsUpdate = true;
      for (let i = 0; i < MN; i++) {
        ml[i] += dt * 0.35;
        const v = mv[i];
        if (ml[i] > 1) { ml[i] -= 1; v[0] = r.range(-0.5, 0.5); v[1] = r.range(0.6, 1.4); v[2] = r.range(0.2, 1.0); }
        const l = ml[i];
        mp[i * 3] = F.x + v[0] * 3 * l + Math.sin(i + l * 3) * 0.3;
        mp[i * 3 + 1] = WATER_Y + 0.2 + v[1] * 2.2 * l;
        mp[i * 3 + 2] = F.z + 0.3 + v[2] * 2.5 * l;
      }
      mg.attributes.position.needsUpdate = true;
      mg.attributes.life.needsUpdate = true;
    });
  }

  // ---------- ต้นไม้ หิน พุ่มไม้ ----------
  for (let i = 0; i < 16; i++) {
    const a = r.range(-1.75, 1.75), d = r.range(10.5, 22);
    const x = POND.x - Math.sin(a) * d, z = POND.z - Math.cos(a) * d;
    place(r() < 0.5 ? 'Pine1' : 'Pine2', x, z, r.range(0.8, 1.3), undefined, groundH(x, z) - 0.2);
  }
  const trees = [
    ['Tree1', -8.5, 1.5, 1.25], ['Tree2', -11.5, -3.5, 1.1], ['Pine2', -13, 4, 1.1], ['Pine1', -10, 8, 1.0],
    ['Tree1', 10, 2.5, 1.15], ['Pine2', 12.5, -2.5, 1.2], ['Tree2', 13, 7, 1.0], ['Pine1', 9.5, 10, 0.95],
    ['Pine1', -15, -8, 1.2], ['Pine2', 15.5, -8, 1.1], ['Tree2', -5, 12.5, 0.9], ['Pine1', 6, 14, 1.0],
    ['Tree1', -16, 12, 1.2], ['Pine2', 17, 13, 1.1], ['Pine1', -19, 1, 1.3], ['Pine2', 20, 3, 1.2],
  ];
  const tops = [];
  for (const [n, x, z, s] of trees) {
    place(n, x, z, s, undefined, null, 0.55);
    if (n.startsWith('Tree')) tops.push(new THREE.Vector3(x, groundH(x, z) + 4.5 * s, z));
  }
  const rocks = [
    [-5.6, -1.2, 0.75], [-6.4, -3.2, 0.55], [5.2, -1.6, 0.6], [6.4, -4.4, 0.9], [-4.1, 0.6, 0.4], [0.2, 1.4, 0.35],
    [-2.2, -6.8, 0.55], [2.6, -8.6, 0.7], [-3.8, -9.2, 0.8], [1.0, -3.6, 0.35],
    [-9, 5.5, 0.6], [7.8, 6.5, 0.5], [-3, 9, 0.45], [11.5, -5.5, 1.1], [-11, -7, 1.2], [4.5, 11, 0.55], [-14, 9, 0.7],
  ];
  for (const [x, z, s] of rocks) place('Rock' + (1 + Math.floor(r() * 4)), x, z, s * 1.4, undefined, groundH(x, z) - 0.15 * s, inWater(x, z) ? 0 : 0.9);
  for (const [x, z, s] of [[-7.5, -5.5, 1.1], [7.6, -5.8, 1.0], [-10, 4, 0.9], [11, 4.8, 1.0], [-6.5, 8.5, 0.8], [8.5, 9, 0.85], [-13, -2, 1.0], [14, 0.5, 1.1], [3, 13, 0.8], [-1.5, 13.5, 0.9]]) {
    place('Bush', x, z, s, undefined, null, 0.7);
  }

  // ---------- ท่าเรือ ----------
  {
    let z = 4;
    while (z > -4 && !inWater(dock.x, z - 0.6)) z -= 0.1;
    dock.z0 = z + 0.9;
    dock.z1 = dock.z0 - 4.3;
    place('Dock', dock.x, dock.z0, 1, Math.PI, dock.y);
  }

  // ---------- บัว + กก ----------
  {
    const pad = new THREE.CircleGeometry(0.42, 12, 0.35, Math.PI * 2 - 0.5);
    pad.rotateX(-Math.PI / 2);
    const padMat = toon(0x5c9e3c, { side: THREE.DoubleSide }), lotusMat = toon(0xf6b8c8);
    for (const [x, z] of [[-3, -2.2], [-4.2, -3.5], [-3.6, -1.6], [3.4, -5.6], [4.3, -6.6], [-1, -2.2], [-5, -6], [4.8, -3.2]]) {
      if (!inWater(x, z)) continue;
      const m = new THREE.Mesh(pad, padMat);
      m.position.set(x, WATER_Y + 0.02, z);
      m.rotation.y = r() * 6.28;
      m.scale.setScalar(r.range(0.7, 1.2));
      scene.add(m);
      if (r() < 0.45) {
        const f = new THREE.Mesh(new THREE.ConeGeometry(0.13, 0.2, 6, 1, true), lotusMat);
        f.position.set(x + 0.1, WATER_Y + 0.12, z);
        f.rotation.x = Math.PI;
        scene.add(f);
      }
    }
    const reed = new THREE.ConeGeometry(0.03, 1.1, 4).translate(0, 0.55, 0);
    const rm = new THREE.InstancedMesh(reed, swaying(0x6f9a3e, 0.25), 90);
    const m4 = new THREE.Matrix4();
    let k = 0;
    for (let tries = 0; tries < 2000 && k < 90; tries++) {
      const th = r.range(0, 6.28);
      if (Math.abs(th + Math.PI / 2) < 0.9) continue;
      const rr = pondR(th) + r.range(-0.9, 0.2);
      const x = POND.x + Math.cos(th) * rr, z = POND.z + Math.sin(th) * rr;
      const h = groundH(x, z);
      if (h > WATER_Y + 0.2 || h < WATER_Y - 0.3 || onDock(x, z)) continue;
      for (let j = 0; j < 5 && k < 90; j++, k++) {
        m4.makeRotationFromEuler(new THREE.Euler(r.range(-0.15, 0.15), 0, r.range(-0.15, 0.15)));
        m4.scale(new THREE.Vector3(1, r.range(0.6, 1.3), 1));
        m4.setPosition(x + r.range(-0.3, 0.3), h, z + r.range(-0.3, 0.3));
        rm.setMatrixAt(k, m4);
      }
    }
    rm.count = k;
    scene.add(rm);
  }

  // ---------- หญ้า ดอกไม้ ----------
  const ok = (x, z) => {
    const h = groundH(x, z);
    if (h < WATER_Y + 0.12 || onDock(x, z)) return null;
    const dx = x - POND.x, dz = z - POND.z, d = Math.hypot(dx, dz);
    if (arcA(dx, dz, d) < ARC + 0.1 && d > CLIFF_R - 1.2 && d < 17.5) return null;
    return h;
  };
  scatterGrass(scene, { ok, count: mobile ? 7000 : 15000, area: [-26, 26, -26, 18], r });
  scatterFlowers(scene, { ok, count: mobile ? 1400 : 2800, area: [-22, 22, -20, 16], r });

  makeGodRays(scene, world, [...tops, new THREE.Vector3(-3, 8, -8), new THREE.Vector3(4, 9, -10)], r);
  makeMotes(scene, world, { count: mobile ? 70 : 140, area: [-16, 16, -10, 14], r });
  makeFlyers(scene, world, { colors: [0xffffff, 0xffd34d, 0x9fd6ff, 0xffffff], r, groundH });

  shadowAll(scene, terrain);
  return world;
}
