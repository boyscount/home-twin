// ฉาก: ลานหญ้าริมหน้าผา น้ำตก แอ่งน้ำใส ต้นไม้ หญ้า ดอกไม้ ลำแสง
import * as THREE from 'three';
import { toon, mossy, swaying, shared } from './toon.js';

export const POND = { x: 0, z: -5 };
export const WATER_Y = -0.3;
const CLIFF_R = 7.6;
const ARC = 2.007;                         // หน้าผาโค้ง ±115° จากแกน -Z

export function pondR(th) { return 6.0 + 0.6 * Math.sin(2 * th + 1) + 0.4 * Math.sin(3 * th + 2); }
const sstep = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
const lerp = (a, b, t) => a + (b - a) * t;

function cliffTop(a) { return 8 * (1 - 0.35 * Math.max(0, Math.abs(a) - 1.2) / 0.8); }

// ความสูงพื้นดิน (ไม่รวมหน้าผา/ท่าเรือ)
export function groundH(x, z) {
  const dx = x - POND.x, dz = z - POND.z, d = Math.hypot(dx, dz);
  const th = Math.atan2(dz, dx);
  let h = 0.22 * Math.sin(x * 0.23 + 1) * Math.cos(z * 0.29) + 0.12 * Math.sin(x * 0.61 + z * 0.43) + 0.1;
  const e = pondR(th) - d;                 // >0 = อยู่ในแอ่ง
  h = lerp(h, 0.1, sstep(-3, 0, e));
  h -= 2.1 * sstep(-0.2, 3.2, e);
  // ที่ราบบนหน้าผา (ซ่อนอยู่ในเนื้อหินจนพ้นขอบหลัง)
  const a = Math.acos(Math.max(-1, Math.min(1, -dz / (d || 1))));
  const w = (1 - sstep(1.85, 2.08, a)) * sstep(8.0, 10.0, d);
  if (w > 0) h = lerp(h, cliffTop(a) - 0.75 + 0.2 * Math.sin(x * 0.4) * Math.cos(z * 0.5), w);
  return h;
}

export function inWater(x, z) { return groundH(x, z) < WATER_Y - 0.02; }

// ---------------- พื้นที่เดินได้ ----------------
export const colliders = [];   // {x, z, r}
export const dock = { x: 2.6, z0: 0, z1: 0, w: 0.72, y: 0.27 };
export function onDock(x, z) { return Math.abs(x - dock.x) < dock.w && z < dock.z0 + 0.1 && z > dock.z1; }
export function standY(x, z) { return onDock(x, z) ? dock.y : Math.max(groundH(x, z), WATER_Y); }
export function walkable(x, z) {
  if (x < -17 || x > 17 || z < -13 || z > 15) return false;
  if (onDock(x, z)) return true;
  if (groundH(x, z) < WATER_Y + 0.08) return false;
  const dx = x - POND.x, dz = z - POND.z, d = Math.hypot(dx, dz);
  const a = Math.acos(Math.max(-1, Math.min(1, -dz / (d || 1))));
  if (a < ARC + 0.05 && d > CLIFF_R - 1.0) return false;
  for (const c of colliders) if ((x - c.x) ** 2 + (z - c.z) ** 2 < c.r * c.r) return false;
  return true;
}

// สุ่มแบบกำหนดเมล็ด (ฉากเหมือนเดิมทุกครั้ง)
let seed = 12345;
const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
const rr = (a, b) => a + (b - a) * rnd();

export function buildWorld(scene, assets, opts) {
  const { mobile } = opts;
  const world = { update: [], fallPos: new THREE.Vector3(), lipPos: new THREE.Vector3() };
  const T = shared.uTime;

  // ---------- ท้องฟ้า + หมอก ----------
  scene.fog = new THREE.Fog(0xcfe8f0, 38, 95);
  const sky = new THREE.Mesh(new THREE.SphereGeometry(300, 24, 12), new THREE.ShaderMaterial({
    side: THREE.BackSide, depthWrite: false, fog: false,
    uniforms: { top: { value: new THREE.Color(0x7cc4f0) }, bot: { value: new THREE.Color(0xe6f4f2) } },
    vertexShader: 'varying vec3 vP; void main(){ vP = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
    fragmentShader: 'uniform vec3 top; uniform vec3 bot; varying vec3 vP; void main(){ gl_FragColor = vec4(mix(bot, top, smoothstep(-0.05, 0.5, vP.y)), 1.0); }',
  }));
  scene.add(sky);
  world.update.push((dt, cam) => sky.position.copy(cam.position));

  // ---------- แสง ----------
  scene.add(new THREE.HemisphereLight(0xdff3ff, 0x6b8a4a, 0.85));
  const sun = new THREE.DirectionalLight(0xfff1d6, 2.1);
  sun.position.set(-14, 24, 12);
  sun.castShadow = true;
  const sm = mobile ? 1024 : 2048;
  sun.shadow.mapSize.set(sm, sm);
  Object.assign(sun.shadow.camera, { left: -26, right: 26, top: 26, bottom: -26, near: 1, far: 80 });
  sun.shadow.bias = -0.0008;
  sun.shadow.normalBias = 0.04;
  sun.target.position.set(0, 0, -3);
  scene.add(sun, sun.target);
  world.sunDir = sun.position.clone().sub(sun.target.position).normalize();

  // ---------- พื้นดิน ----------
  const segs = mobile ? 130 : 200;
  const tg = new THREE.PlaneGeometry(84, 84, segs, segs);
  tg.rotateX(-Math.PI / 2);
  const pos = tg.attributes.position;
  const cols = new Float32Array(pos.count * 3);
  const cGrass = new THREE.Color(0x86bd4c), cGrass2 = new THREE.Color(0x6aa53e), cDry = new THREE.Color(0xa9c25a);
  const cSand = new THREE.Color(0xc9b787), cBed = new THREE.Color(0x6f8a5a), cDeep = new THREE.Color(0x3f6a52);
  const c = new THREE.Color();
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), z = pos.getZ(i);
    const h = groundH(x, z);
    pos.setY(i, h);
    const n = Math.sin(x * 0.35 + Math.sin(z * 0.2) * 2) * 0.5 + 0.5, n2 = Math.sin(z * 0.5 + x * 0.13) * 0.5 + 0.5;
    c.copy(cGrass).lerp(cGrass2, n * 0.7).lerp(cDry, n2 * n * 0.45);
    if (h < WATER_Y + 0.25) {
      const t = sstep(WATER_Y + 0.25, WATER_Y - 0.15, h);
      c.lerp(cSand, t);
      c.lerp(cBed, sstep(WATER_Y - 0.15, WATER_Y - 0.9, h));
      c.lerp(cDeep, sstep(WATER_Y - 0.9, WATER_Y - 1.9, h));
    }
    cols.set([c.r, c.g, c.b], i * 3);
  }
  tg.setAttribute('color', new THREE.BufferAttribute(cols, 3));
  tg.computeVertexNormals();
  const tmat = toon(0xffffff, { vertexColors: true });
  tmat.onBeforeCompile = sh => {
    sh.uniforms.uTime = T;
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nvarying vec3 vWP2;')
      .replace('#include <worldpos_vertex>', '#include <worldpos_vertex>\nvWP2 = (modelMatrix * vec4(transformed,1.0)).xyz;');
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', `#include <common>
varying vec3 vWP2; uniform float uTime;
float cau(vec2 p){ float t=uTime*0.6; vec2 q=p; float v=0.0;
  for(int i=0;i<3;i++){ q = vec2(q.x+sin(q.y*1.7+t), q.y+cos(q.x*1.5-t*0.8)); v += sin(q.x*2.1)*cos(q.y*2.3); }
  return v; }`)
      .replace('#include <color_fragment>', `#include <color_fragment>
if (vWP2.y < ${WATER_Y.toFixed(2)}) { float k = smoothstep(${WATER_Y.toFixed(2)}, ${(WATER_Y - 0.4).toFixed(2)}, vWP2.y);
  float cc = smoothstep(1.2, 1.9, cau(vWP2.xz*0.9));
  diffuseColor.rgb = mix(diffuseColor.rgb, diffuseColor.rgb * vec3(0.8,0.95,0.95), k) + vec3(0.55,0.75,0.6) * cc * k * 0.35; }`);
  };
  const terrain = new THREE.Mesh(tg, tmat);
  terrain.receiveShadow = true;
  scene.add(terrain);
  world.terrain = terrain;

  // ---------- โมเดลจาก Blender ----------
  const place = (name, x, z, s = 1, ry = rnd() * 6.28, y = null, collide = 0) => {
    const o = assets.clone(name);
    o.position.set(x, y ?? groundH(x, z) - 0.05, z);
    o.scale.setScalar(s);
    o.rotation.y = ry;
    scene.add(o);
    if (collide) colliders.push({ x, z, r: collide * s });
    return o;
  };

  const cliff = place('Cliff', POND.x, POND.z, 1, Math.PI, 0);
  cliff.updateMatrixWorld(true);

  // หาแนวน้ำตก: ยิงเรย์หาผิวหน้าผา
  const ray = new THREE.Raycaster();
  const hitZ = (x, y) => {
    ray.set(new THREE.Vector3(x, y, POND.z), new THREE.Vector3(0, 0, -1));
    const h = ray.intersectObject(cliff, true)[0];
    return h ? h.point.z : POND.z - CLIFF_R;
  };
  ray.set(new THREE.Vector3(0, 30, POND.z - CLIFF_R - 3), new THREE.Vector3(0, -1, 0));
  const topHit = ray.intersectObject(cliff, true)[0];
  const lipY = topHit ? topHit.point.y : 7;
  world.lipPos.set(0, lipY, hitZ(0, lipY - 0.3));

  // ---------- น้ำตก (ไหลตามผิวหน้าผาแบบขั้นบันได) ----------
  {
    const NU = 10, NV = 44, W0 = 1.7;
    const g = new THREE.BufferGeometry();
    const p = [], uv = [], idx = [];
    for (let j = 0; j <= NV; j++) {
      const v = j / NV;
      const y = lerp(lipY + 0.05, WATER_Y - 0.05, v);
      for (let i = 0; i <= NU; i++) {
        const u = i / NU;
        const x = (u - 0.5) * W0 * (1 + v * 0.45);
        const z = Math.max(hitZ(x * 0.8, y), hitZ(x * 0.8, y - 0.35)) + 0.22 + Math.sin(u * Math.PI) * 0.12 + v * 0.25;
        p.push(x, y, z); uv.push(u, v);
      }
    }
    for (let j = 0; j < NV; j++) for (let i = 0; i < NU; i++) {
      const a = j * (NU + 1) + i, b = a + NU + 1;
      idx.push(a, b, a + 1, a + 1, b, b + 1);
    }
    g.setAttribute('position', new THREE.Float32BufferAttribute(p, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    g.setIndex(idx);
    const fall = new THREE.Mesh(g, new THREE.ShaderMaterial({
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
  float foamBot = smoothstep(0.86, 1.0, vUv.y);
  col = mix(col, vec3(1.0), foamBot * 0.8);
  float a = (0.78 + streak * 0.22) * edge * smoothstep(0.0, 0.03, vUv.y);
  gl_FragColor = vec4(col, a);
}`,
    }));
    fall.renderOrder = 2;
    scene.add(fall);
    world.fallPos.set(0, WATER_Y, p[p.length - 1 - (NU / 2) * 3] + 0.3);

    // ลำธารบนหน้าผาที่ไหลมาลงน้ำตก
    const sg = new THREE.BufferGeometry();
    const sp = [], su = [], si = [];
    const NS = 16;
    for (let j = 0; j <= NS; j++) {
      const z = world.lipPos.z - j * 0.9;
      for (let i = 0; i <= 2; i++) {
        const w = 1.0 + j * 0.05;
        const x = (i - 1) * w + Math.sin(j * 0.6) * 0.6 * (j / NS);
        ray.set(new THREE.Vector3(x, 30, z), new THREE.Vector3(0, -1, 0));
        const hh = ray.intersectObjects([cliff, terrain], true)[0];
        sp.push(x, (hh ? hh.point.y : lipY) + 0.08, z); su.push(i / 2, -j / 4);
      }
    }
    for (let j = 0; j < NS; j++) for (let i = 0; i < 2; i++) {
      const a = j * 3 + i, b = a + 3; si.push(a, a + 1, b, a + 1, b + 1, b);
    }
    sg.setAttribute('position', new THREE.Float32BufferAttribute(sp, 3));
    sg.setAttribute('uv', new THREE.Float32BufferAttribute(su, 2));
    sg.setIndex(si);
    const stream = new THREE.Mesh(sg, fall.material.clone());
    stream.material.uniforms = { uTime: T };
    stream.renderOrder = 2;
    scene.add(stream);
  }

  // ---------- ผิวน้ำ ----------
  {
    const S = 18, N = mobile ? 70 : 100;
    const g = new THREE.PlaneGeometry(S, S, N, N);
    g.rotateX(-Math.PI / 2);
    g.translate(POND.x, WATER_Y, POND.z - 0.5);
    const wp = g.attributes.position;
    const depth = new Float32Array(wp.count);
    for (let i = 0; i < wp.count; i++) depth[i] = WATER_Y - groundH(wp.getX(i), wp.getZ(i));
    g.setAttribute('depth', new THREE.BufferAttribute(depth, 1));
    const ripples = [];
    for (let i = 0; i < 6; i++) ripples.push(new THREE.Vector4(0, 0, -100, 1));
    const wmat = new THREE.ShaderMaterial({
      transparent: true, depthWrite: false,
      uniforms: { uTime: T, uFall: { value: new THREE.Vector2(world.fallPos.x, world.fallPos.z) }, uRip: { value: ripples }, uCam: { value: new THREE.Vector3() } },
      vertexShader: `attribute float depth; varying float vD; varying vec3 vW; uniform float uTime;
void main(){ vD = depth; vec3 p = position;
  p.y += sin(p.x * 1.3 + uTime * 1.4) * 0.015 + cos(p.z * 1.1 + uTime * 1.1) * 0.015;
  vec4 w = modelMatrix * vec4(p, 1.0); vW = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }`,
      fragmentShader: `uniform float uTime; uniform vec2 uFall; uniform vec4 uRip[6]; uniform vec3 uCam; varying float vD; varying vec3 vW;
float h(vec2 p){ return fract(sin(dot(p, vec2(127.1,311.7)))*43758.5453); }
float n(vec2 p){ vec2 i=floor(p), f=fract(p); f=f*f*(3.0-2.0*f); return mix(mix(h(i),h(i+vec2(1,0)),f.x),mix(h(i+vec2(0,1)),h(i+vec2(1,1)),f.x),f.y); }
void main(){
  if (vD < 0.0) discard;
  float t = smoothstep(0.0, 1.7, vD);
  vec3 col = mix(vec3(0.42, 0.80, 0.72), vec3(0.10, 0.42, 0.40), t);
  float a = mix(0.28, 0.86, t);
  // เส้นแสงสะท้อนแบบการ์ตูน
  vec2 p = vW.xz;
  float nn = n(p * 0.9 + vec2(uTime * 0.12, uTime * 0.05)) * 0.6 + n(p * 1.9 - uTime * 0.09) * 0.4;
  float line = 1.0 - smoothstep(0.0, 0.035, abs(nn - 0.5));
  col = mix(col, vec3(0.9, 1.0, 0.97), line * 0.55); a = max(a, line * 0.6);
  // ฟองริมฝั่ง
  float fz = 0.09 + 0.05 * sin(p.x * 3.0 + p.y * 2.0 + uTime * 1.5) + n(p * 3.0 + uTime * 0.3) * 0.07;
  float shore = smoothstep(fz, fz - 0.02, vD);
  // ฟองใต้น้ำตก + วงคลื่น
  float df = length((p - uFall) * vec2(0.8, 1.2));
  float fn = n(p * 2.5 + vec2(0.0, uTime * 1.2));
  float ff = smoothstep(1.9, 1.7, df + fn * 0.9);
  float ring = smoothstep(0.08, 0.0, abs(fract(df * 0.8 - uTime * 0.7) - 0.5) - 0.38) * smoothstep(5.0, 1.5, df);
  // วงคลื่นจากทุ่น/ปลา
  float rip = 0.0;
  for (int i = 0; i < 6; i++) {
    float age = uTime - uRip[i].z;
    if (age > 0.0 && age < 2.2) {
      float r = age * 1.1 * uRip[i].w; float d = length(p - uRip[i].xy);
      rip += smoothstep(0.05, 0.0, abs(d - r)) * (1.0 - age / 2.2) * uRip[i].w;
      rip += smoothstep(0.04, 0.0, abs(d - r * 0.6)) * (1.0 - age / 2.2) * 0.6;
    }
  }
  float foam = max(max(shore, ff), max(ring * 0.5, min(rip, 1.0)));
  col = mix(col, vec3(1.0), foam); a = max(a, foam * 0.95);
  // ขอบฟ้าสะท้อนเมื่อมองเฉียง
  vec3 V = normalize(uCam - vW);
  float fr = pow(1.0 - max(V.y, 0.0), 3.0);
  col = mix(col, vec3(0.80, 0.93, 0.98), fr * 0.5); a = mix(a, 1.0, fr * 0.4);
  gl_FragColor = vec4(col, a);
}`,
    });
    const water = new THREE.Mesh(g, wmat);
    water.renderOrder = 1;
    scene.add(water);
    world.water = water;
    let ri = 0;
    world.addRipple = (x, z, strength = 1) => { ripples[ri].set(x, z, T.value, strength); ri = (ri + 1) % ripples.length; };
    world.update.push((dt, cam) => wmat.uniforms.uCam.value.copy(cam.position));
  }

  // ---------- ฟองและละอองน้ำตก ----------
  {
    const N = 16;
    const foamMat = toon(0xffffff, { emissive: 0x9fb8bb, transparent: true, opacity: 0.92 });
    const fm = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(0.42, 1), foamMat, N);
    const life = Array.from({ length: N }, (_, i) => i / N);
    const off = Array.from({ length: N }, () => [rr(-1.1, 1.1), rr(-0.3, 0.9)]);
    const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), sv = new THREE.Vector3(), pv = new THREE.Vector3();
    scene.add(fm);
    const MN = mobile ? 90 : 180;
    const mg = new THREE.BufferGeometry();
    const mp = new Float32Array(MN * 3), ml = new Float32Array(MN), mv = [];
    for (let i = 0; i < MN; i++) { ml[i] = rnd(); mv.push([rr(-0.5, 0.5), rr(0.6, 1.4), rr(0.2, 1.0)]); }
    mg.setAttribute('position', new THREE.BufferAttribute(mp, 3));
    mg.setAttribute('life', new THREE.BufferAttribute(ml, 1));
    const mist = new THREE.Points(mg, new THREE.ShaderMaterial({
      transparent: true, depthWrite: false,
      uniforms: { uScale: { value: opts.pixelRatio * 260 } },
      vertexShader: `attribute float life; varying float vL; uniform float uScale;
void main(){ vL = life; vec4 mv = modelViewMatrix * vec4(position, 1.0); gl_PointSize = uScale * (0.25 + life * 0.6) / -mv.z; gl_Position = projectionMatrix * mv; }`,
      fragmentShader: `varying float vL; void main(){ float d = length(gl_PointCoord - 0.5); float a = smoothstep(0.5, 0.1, d) * (1.0 - vL) * 0.45; gl_FragColor = vec4(1.0, 1.0, 1.0, a); }`,
    }));
    mist.frustumCulled = false;
    scene.add(mist);
    world.update.push(dt => {
      const F = world.fallPos;
      for (let i = 0; i < N; i++) {
        life[i] += dt * 0.55;
        if (life[i] > 1) { life[i] -= 1; off[i] = [rr(-1.1, 1.1), rr(-0.3, 0.9)]; }
        const l = life[i], s = Math.sin(l * Math.PI) * (0.6 + 0.5 * (i % 3) / 2);
        pv.set(F.x + off[i][0] * (1 + l * 0.6), WATER_Y + 0.05 + l * 0.35, F.z + off[i][1] + l * 0.5);
        sv.setScalar(Math.max(s, 0.01));
        fm.setMatrixAt(i, m4.compose(pv, q, sv));
      }
      fm.instanceMatrix.needsUpdate = true;
      for (let i = 0; i < MN; i++) {
        ml[i] += dt * 0.35;
        const v = mv[i];
        if (ml[i] > 1) { ml[i] -= 1; v[0] = rr(-0.5, 0.5); v[1] = rr(0.6, 1.4); v[2] = rr(0.2, 1.0); }
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
  // ต้นสนบนหน้าผาและขอบลาน
  const onPlateau = (a, d) => { const x = POND.x - Math.sin(a) * d, z = POND.z - Math.cos(a) * d; return [x, z]; };
  for (let i = 0; i < 16; i++) {
    const a = rr(-1.75, 1.75), d = rr(10.5, 22);
    const [x, z] = onPlateau(a, d);
    place(rnd() < 0.5 ? 'Pine1' : 'Pine2', x, z, rr(0.8, 1.3), undefined, groundH(x, z) - 0.2);
  }
  const trees = [
    ['Tree1', -8.5, 1.5, 1.25], ['Tree2', -11.5, -3.5, 1.1], ['Pine2', -13, 4, 1.1], ['Pine1', -10, 8, 1.0],
    ['Tree1', 10, 2.5, 1.15], ['Pine2', 12.5, -2.5, 1.2], ['Tree2', 13, 7, 1.0], ['Pine1', 9.5, 10, 0.95],
    ['Pine1', -15, -8, 1.2], ['Pine2', 15.5, -8, 1.1], ['Tree2', -5, 12.5, 0.9], ['Pine1', 6, 14, 1.0],
    ['Tree1', -16, 12, 1.2], ['Pine2', 17, 13, 1.1], ['Pine1', -19, 1, 1.3], ['Pine2', 20, 3, 1.2],
  ];
  world.treeTops = [];
  for (const [n, x, z, s] of trees) {
    const o = place(n, x, z, s, undefined, null, 0.55);
    if (n.startsWith('Tree')) world.treeTops.push(new THREE.Vector3(x, groundH(x, z) + 4.5 * s, z));
  }
  const rocks = [
    // รอบแอ่ง
    [-5.6, -1.2, 0.75], [-6.4, -3.2, 0.55], [5.2, -1.6, 0.6], [6.4, -4.4, 0.9], [-4.1, 0.6, 0.4], [0.2, 1.4, 0.35],
    // โขดหินโผล่ในน้ำ
    [-2.2, -6.8, 0.55], [2.6, -8.6, 0.7], [-3.8, -9.2, 0.8], [1.0, -3.6, 0.35],
    // ลาน
    [-9, 5.5, 0.6], [7.8, 6.5, 0.5], [-3, 9, 0.45], [11.5, -5.5, 1.1], [-11, -7, 1.2], [4.5, 11, 0.55], [-14, 9, 0.7],
  ];
  for (const [x, z, s] of rocks) {
    const o = place('Rock' + (1 + Math.floor(rnd() * 4)), x, z, s * 1.4, undefined, groundH(x, z) - 0.15 * s, inWater(x, z) ? 0 : 0.9);
  }
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
    const padMat = toon(0x5c9e3c, { side: THREE.DoubleSide });
    const lotusMat = toon(0xf6b8c8);
    const spots = [[-3, -2.2], [-4.2, -3.5], [-3.6, -1.6], [3.4, -5.6], [4.3, -6.6], [-1, -2.2], [-5, -6], [4.8, -3.2]];
    world.pads = [];
    for (const [x, z] of spots) {
      if (!inWater(x, z)) continue;
      const m = new THREE.Mesh(pad, padMat);
      m.position.set(x, WATER_Y + 0.02, z);
      m.rotation.y = rnd() * 6.28;
      m.scale.setScalar(rr(0.7, 1.2));
      m.receiveShadow = true;
      scene.add(m);
      world.pads.push(m);
      if (rnd() < 0.45) {
        const f = new THREE.Mesh(new THREE.ConeGeometry(0.13, 0.2, 6, 1, true), lotusMat);
        f.position.set(x + 0.1, WATER_Y + 0.12, z);
        f.rotation.x = Math.PI;
        scene.add(f);
      }
    }
    // กกริมน้ำ
    const reed = new THREE.ConeGeometry(0.03, 1.1, 4);
    reed.translate(0, 0.55, 0);
    const rm = new THREE.InstancedMesh(reed, swaying(0x6f9a3e, 0.25), 90);
    const m4 = new THREE.Matrix4();
    let k = 0;
    for (let tries = 0; tries < 2000 && k < 90; tries++) {
      const th = rr(0, 6.28);
      if (Math.abs(th + Math.PI / 2) < 0.9) continue;   // ไม่ขึ้นหน้าผา
      const r = pondR(th) + rr(-0.9, 0.2);
      const x = POND.x + Math.cos(th) * r, z = POND.z + Math.sin(th) * r;
      const h = groundH(x, z);
      if (h > WATER_Y + 0.2 || h < WATER_Y - 0.3 || onDock(x, z)) continue;
      for (let j = 0; j < 5 && k < 90; j++, k++) {
        m4.makeRotationFromEuler(new THREE.Euler(rr(-0.15, 0.15), 0, rr(-0.15, 0.15)));
        m4.scale(new THREE.Vector3(1, rr(0.6, 1.3), 1));
        m4.setPosition(x + rr(-0.3, 0.3), h, z + rr(-0.3, 0.3));
        rm.setMatrixAt(k, m4);
      }
    }
    rm.count = k;
    scene.add(rm);
  }

  // ---------- หญ้า + ดอกไม้ (InstancedMesh) ----------
  const okForPlants = (x, z) => {
    const h = groundH(x, z);
    if (h < WATER_Y + 0.12 || onDock(x, z)) return null;
    const dx = x - POND.x, dz = z - POND.z, d = Math.hypot(dx, dz);
    const a = Math.acos(Math.max(-1, Math.min(1, -dz / (d || 1))));
    if (a < ARC + 0.1 && d > CLIFF_R - 1.2 && d < 17.5) return null;   // ในเนื้อหน้าผา
    return h;
  };
  const plantMat = (tipBend) => {
    const m = toon(0xffffff, { vertexColors: true, side: THREE.DoubleSide });
    m.onBeforeCompile = sh => {
      sh.uniforms.uTime = T; sh.uniforms.uWind = shared.uWind;
      sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nuniform float uTime; uniform float uWind;')
        .replace('#include <begin_vertex>', `#include <begin_vertex>
{ vec3 ip = vec3(instanceMatrix[3][0], 0.0, instanceMatrix[3][2]);
  float k = transformed.y * transformed.y * ${tipBend.toFixed(2)} * uWind;
  float w = sin(uTime * 1.8 + ip.x * 0.35 + ip.z * 0.25) + 0.4 * sin(uTime * 3.1 + ip.x * 1.3);
  transformed.x += w * k; transformed.z += w * k * 0.4; }`);
    };
    return m;
  };
  {
    // กอหญ้า 3 ใบ
    const blades = [];
    const cRoot = new THREE.Color(0x5e9a36), cTip = new THREE.Color(0xc5e27a);
    for (let b = 0; b < 3; b++) {
      const ang = b * 2.1 + 0.3, ca = Math.cos(ang), sa = Math.sin(ang);
      const lean = 0.12;
      const pts = [[-0.05, 0], [0.05, 0], [-0.03, 0.22], [0.03, 0.22], [0, 0.42]];
      const tri = [[0, 1, 2], [1, 3, 2], [2, 3, 4]];
      for (const t of tri) for (const vi of t) {
        const [px, py] = pts[vi];
        blades.push([px * ca + lean * py * sa, py, -px * sa + lean * py * ca, py / 0.42]);
      }
    }
    const g = new THREE.BufferGeometry();
    const P = new Float32Array(blades.length * 3), C = new Float32Array(blades.length * 3), Nn = new Float32Array(blades.length * 3);
    blades.forEach((b, i) => {
      P.set([b[0], b[1], b[2]], i * 3);
      const cc = cRoot.clone().lerp(cTip, b[3]);
      C.set([cc.r, cc.g, cc.b], i * 3);
      Nn.set([0, 1, 0], i * 3);
    });
    g.setAttribute('position', new THREE.BufferAttribute(P, 3));
    g.setAttribute('color', new THREE.BufferAttribute(C, 3));
    g.setAttribute('normal', new THREE.BufferAttribute(Nn, 3));
    const N = mobile ? 7000 : 15000;
    const im = new THREE.InstancedMesh(g, plantMat(0.9), N);
    const m4 = new THREE.Matrix4(), e = new THREE.Euler(), qq = new THREE.Quaternion(), sv = new THREE.Vector3(), pv = new THREE.Vector3();
    let k = 0;
    for (let t = 0; t < N * 3 && k < N; t++) {
      const x = rr(-26, 26), z = rr(-26, 18);
      const h = okForPlants(x, z);
      if (h === null) continue;
      const s = rr(0.7, 1.35);
      pv.set(x, h - 0.02, z); qq.setFromEuler(e.set(0, rr(0, 6.28), 0)); sv.set(s, s * rr(0.8, 1.3), s);
      im.setMatrixAt(k++, m4.compose(pv, qq, sv));
    }
    im.count = k;
    im.receiveShadow = true;
    scene.add(im);

    // ดอกไม้ขาวเล็ก ๆ
    const parts = [];
    const stem = new THREE.CylinderGeometry(0.008, 0.01, 0.26, 3).translate(0, 0.13, 0);
    const head = new THREE.CylinderGeometry(0.055, 0.04, 0.02, 7).translate(0, 0.27, 0);
    const mid = new THREE.CylinderGeometry(0.02, 0.02, 0.03, 5).translate(0, 0.285, 0);
    const colorize = (geo, col) => {
      const n = geo.attributes.position.count, a = new Float32Array(n * 3), cc = new THREE.Color(col);
      for (let i = 0; i < n; i++) a.set([cc.r, cc.g, cc.b], i * 3);
      geo.setAttribute('color', new THREE.BufferAttribute(a, 3));
      return geo.toNonIndexed();
    };
    parts.push(colorize(stem, 0x5f9a38), colorize(head, 0xffffff), colorize(mid, 0xf5c542));
    const fg = mergeGeos(parts);
    const FN = mobile ? 1400 : 2800;
    const fm = new THREE.InstancedMesh(fg, plantMat(1.5), FN);
    const tint = [0xffffff, 0xffffff, 0xffffff, 0xfff4c2, 0xffd6e4, 0xd9e8ff];
    k = 0;
    // ดอกไม้ขึ้นเป็นกลุ่ม ๆ
    const clusters = Array.from({ length: 40 }, () => [rr(-22, 22), rr(-20, 16)]);
    for (let t = 0; t < FN * 4 && k < FN; t++) {
      const cl = clusters[t % clusters.length];
      const x = cl[0] + rr(-2.6, 2.6) * rnd() * 1.6, z = cl[1] + rr(-2.6, 2.6) * rnd() * 1.6;
      const h = okForPlants(x, z);
      if (h === null) continue;
      const s = rr(0.8, 1.3);
      pv.set(x, h - 0.02, z); qq.setFromEuler(e.set(rr(-0.15, 0.15), rr(0, 6.28), rr(-0.15, 0.15))); sv.setScalar(s);
      fm.setMatrixAt(k, m4.compose(pv, qq, sv));
      fm.setColorAt(k, new THREE.Color(tint[Math.floor(rnd() * tint.length)]));
      k++;
    }
    fm.count = k;
    scene.add(fm);
  }

  // ---------- ลำแสงลอดใบไม้ (god rays) ----------
  {
    const rayMat = new THREE.ShaderMaterial({
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
      uniforms: { uTime: T, uA: { value: 1 } },
      vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
      fragmentShader: `uniform float uTime; uniform float uA; varying vec2 vUv;
void main(){ float e = smoothstep(0.0, 0.5, vUv.x) * smoothstep(1.0, 0.5, vUv.x);
  float l = smoothstep(0.0, 0.25, vUv.y) * smoothstep(1.0, 0.55, vUv.y);
  float f = 0.75 + 0.25 * sin(uTime * 0.7 + vUv.y * 3.0);
  gl_FragColor = vec4(vec3(1.0, 0.93, 0.7) * e * l * 0.26 * f * uA, 1.0); }`,
    });
    const L = 15;
    const geo = new THREE.PlaneGeometry(1, L).translate(0, -L / 2, 0);
    const dir = world.sunDir.clone().negate();
    const qd = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, -1, 0), dir);
    world.rays = [];
    const bases = [...world.treeTops, new THREE.Vector3(-3, 8, -8), new THREE.Vector3(4, 9, -10)];
    bases.forEach((b, i) => {
      for (let j = 0; j < 2; j++) {
        const m = new THREE.Mesh(geo, rayMat.clone());
        m.material.uniforms.uTime = T;
        m.material.uniforms.uA = { value: 1 };
        m.scale.x = rr(0.6, 1.8);
        m.position.copy(b).add(new THREE.Vector3(rr(-1.2, 1.2), rr(0.5, 2), rr(-1.2, 1.2))).addScaledVector(dir, -2);
        m.quaternion.copy(qd);
        m.userData.ph = rnd() * 6.28;
        scene.add(m);
        world.rays.push(m);
      }
    });
    const tmpQ = new THREE.Quaternion(), ax = dir.clone(), toCam = new THREE.Vector3(), side = new THREE.Vector3();
    world.update.push((dt, cam) => {
      for (const m of world.rays) {
        // หมุนรอบแกนลำแสงให้หันหน้าเข้ากล้อง
        toCam.subVectors(cam.position, m.position);
        side.crossVectors(ax, toCam).normalize();
        const n = new THREE.Vector3().crossVectors(side, ax).normalize();
        const mat = new THREE.Matrix4().makeBasis(side, ax.clone().negate(), n);
        m.quaternion.setFromRotationMatrix(mat);
        m.material.uniforms.uA.value = 0.65 + 0.35 * Math.sin(T.value * 0.35 + m.userData.ph);
      }
    });
  }

  // ---------- ละอองเกสรลอย + ผีเสื้อ ----------
  {
    const N = mobile ? 70 : 140;
    const g = new THREE.BufferGeometry();
    const p = new Float32Array(N * 3), base = [];
    for (let i = 0; i < N; i++) base.push([rr(-16, 16), rr(0.4, 4), rr(-10, 14), rnd() * 6.28]);
    g.setAttribute('position', new THREE.BufferAttribute(p, 3));
    const pts = new THREE.Points(g, new THREE.PointsMaterial({ color: 0xfff3b0, size: 0.08, transparent: true, opacity: 0.85, depthWrite: false }));
    pts.frustumCulled = false;
    scene.add(pts);
    const wingG = new THREE.PlaneGeometry(0.16, 0.12).translate(0.08, 0, 0);
    wingG.rotateX(-Math.PI / 2);
    const flies = [];
    for (const col of [0xffffff, 0xffd34d, 0x9fd6ff, 0xffffff]) {
      const b = new THREE.Group();
      const wm = new THREE.MeshBasicMaterial({ color: col, side: THREE.DoubleSide });
      const l = new THREE.Mesh(wingG, wm), r = new THREE.Mesh(wingG, wm);
      r.scale.x = -1;
      b.add(l, r);
      scene.add(b);
      flies.push({ b, l, r, c: [rr(-10, 10), rr(-2, 10)], ph: rnd() * 10 });
    }
    world.update.push(dt => {
      const t = T.value;
      for (let i = 0; i < N; i++) {
        const [x, y, z, ph] = base[i];
        p[i * 3] = x + Math.sin(t * 0.2 + ph) * 1.5; p[i * 3 + 1] = y + Math.sin(t * 0.5 + ph * 2) * 0.4; p[i * 3 + 2] = z + Math.cos(t * 0.17 + ph) * 1.5;
      }
      g.attributes.position.needsUpdate = true;
      for (const f of flies) {
        const tt = t * 0.35 + f.ph;
        const x = f.c[0] + Math.sin(tt) * 3 + Math.sin(tt * 2.3) * 0.8, z = f.c[1] + Math.cos(tt * 0.8) * 3;
        const y = groundH(x, z) + 0.8 + Math.sin(tt * 3) * 0.3;
        const nx = f.c[0] + Math.sin(tt + 0.05) * 3 + Math.sin((tt + 0.05) * 2.3) * 0.8, nz = f.c[1] + Math.cos((tt + 0.05) * 0.8) * 3;
        f.b.position.set(x, y, z);
        f.b.rotation.y = Math.atan2(nx - x, nz - z) + Math.PI / 2;
        const flap = Math.sin(t * 18 + f.ph) * 1.1;
        f.l.rotation.z = flap; f.r.rotation.z = -flap;
      }
    });
  }

  // เงาสำหรับโมเดลทั้งหมด
  scene.traverse(o => { if (o.isMesh && !o.material.transparent && !(o.material instanceof THREE.ShaderMaterial) && o !== terrain && !o.isInstancedMesh) { o.castShadow = true; o.receiveShadow = true; } });

  return world;
}

function mergeGeos(geos) {
  let n = 0;
  for (const g of geos) n += g.attributes.position.count;
  const P = new Float32Array(n * 3), C = new Float32Array(n * 3), N = new Float32Array(n * 3);
  let o = 0;
  for (const g of geos) {
    g.computeVertexNormals();
    P.set(g.attributes.position.array, o * 3); C.set(g.attributes.color.array, o * 3);
    const na = g.attributes.normal.array;
    for (let i = 0; i < na.length; i += 3) { N[o * 3 + i] = 0; N[o * 3 + i + 1] = 1; N[o * 3 + i + 2] = 0; }
    o += g.attributes.position.count;
  }
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.BufferAttribute(P, 3));
  out.setAttribute('color', new THREE.BufferAttribute(C, 3));
  out.setAttribute('normal', new THREE.BufferAttribute(N, 3));
  return out;
}
