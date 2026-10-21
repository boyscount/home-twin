// ชุดเครื่องมือสร้างฉากที่ทุกด่านใช้ร่วมกัน: ฟ้า แสง พื้น น้ำ หญ้า ดอกไม้ ลำแสง ละออง
import * as THREE from 'three';
import { toon, swaying, shared } from './toon.js';

export const sstep = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
export const lerp = (a, b, t) => a + (b - a) * t;
export function rng(seed) {
  let s = seed;
  const r = () => ((s = (s * 16807) % 2147483647) / 2147483647);
  r.range = (a, b) => a + (b - a) * r();
  return r;
}
const T = shared.uTime;

// ---------- ฟ้า + หมอก ----------
export function makeSky(scene, world, { top = 0x7cc4f0, bot = 0xe6f4f2, fogNear = 38, fogFar = 95 } = {}) {
  scene.fog = new THREE.Fog(bot, fogNear, fogFar);
  const mat = new THREE.ShaderMaterial({
    side: THREE.BackSide, depthWrite: false, fog: false,
    uniforms: { top: { value: new THREE.Color(top) }, bot: { value: new THREE.Color(bot) }, uSun: { value: new THREE.Vector3(-0.4, 0.7, 0.4).normalize() }, uSunCol: { value: new THREE.Color(0xfff1d6) } },
    vertexShader: 'varying vec3 vP; void main(){ vP = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
    fragmentShader: `uniform vec3 top; uniform vec3 bot; uniform vec3 uSun; uniform vec3 uSunCol; varying vec3 vP;
void main(){
  vec3 d = normalize(vP);
  vec3 c = mix(bot, top, smoothstep(-0.05, 0.5, d.y));
  c = mix(c, mix(bot, vec3(1.0), 0.35), smoothstep(0.12, 0.0, abs(d.y - 0.02)) * 0.5);   // แถบขอบฟ้าสว่าง
  float s = max(dot(d, normalize(uSun)), 0.0);
  c += uSunCol * (pow(s, 12.0) * 0.18 + pow(s, 90.0) * 0.35);
  c = mix(c, vec3(1.0, 0.98, 0.9), smoothstep(0.9975, 0.9985, s));
  gl_FragColor = vec4(c, 1.0); }`,
  });
  const sky = new THREE.Mesh(new THREE.SphereGeometry(300, 24, 12), mat);
  sky.renderOrder = -1;
  scene.add(sky);
  world.sky = sky;
  world.skyBase = { top: new THREE.Color(top), bot: new THREE.Color(bot) };
  world.update.push((dt, cam) => sky.position.copy(cam.position));
}

// ---------- แสง ----------
export function makeLights(scene, world, { mobile, sun = [-14, 24, 12], target = [0, 0, -3], intensity = 2.1, hemi = 0.85, span = 26 } = {}) {
  const h = new THREE.HemisphereLight(0xdff3ff, 0x6b8a4a, hemi);
  scene.add(h);
  const s = new THREE.DirectionalLight(0xfff1d6, intensity);
  s.position.set(...sun);
  s.castShadow = true;
  const sm = mobile ? 1024 : 2048;
  s.shadow.mapSize.set(sm, sm);
  Object.assign(s.shadow.camera, { left: -span, right: span, top: span, bottom: -span, near: 1, far: 90 });
  s.shadow.bias = -0.0008;
  s.shadow.normalBias = 0.04;
  s.target.position.set(...target);
  scene.add(s, s.target);
  world.sun = s; world.hemi = h;
  world.sunBase = { intensity, hemi };
  world.sunDir = s.position.clone().sub(s.target.position).normalize();
  if (world.sky) world.sky.material.uniforms.uSun.value.copy(world.sunDir);
  world.update.push(() => { if (world.sky) { const u = world.sky.material.uniforms; u.uSun.value.copy(s.position).sub(s.target.position).normalize(); u.uSunCol.value.copy(s.color); } });
}

// ---------- พื้นดินจากฟังก์ชันความสูง (มีลายแสงใต้น้ำ) ----------
export function makeTerrain(scene, world, { size = 84, segs = 160, cx = 0, cz = 0, groundH, colorAt, waterY = -100 }) {
  const g = new THREE.PlaneGeometry(size, size, segs, segs);
  g.rotateX(-Math.PI / 2);
  g.translate(cx, 0, cz);
  const pos = g.attributes.position;
  const cols = new Float32Array(pos.count * 3);
  const c = new THREE.Color();
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), z = pos.getZ(i), h = groundH(x, z);
    pos.setY(i, h);
    colorAt(x, z, h, c);
    cols.set([c.r, c.g, c.b], i * 3);
  }
  g.setAttribute('color', new THREE.BufferAttribute(cols, 3));
  g.computeVertexNormals();
  const m = toon(0xffffff, { vertexColors: true });
  const wy = waterY.toFixed(2), wy2 = (waterY - 0.4).toFixed(2);
  m.onBeforeCompile = sh => {
    sh.uniforms.uTime = T;
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nvarying vec3 vWP2;')
      .replace('#include <worldpos_vertex>', '#include <worldpos_vertex>\nvWP2 = (modelMatrix * vec4(transformed,1.0)).xyz;');
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', `#include <common>
varying vec3 vWP2; uniform float uTime;
float cau(vec2 p){ float t=uTime*0.6; vec2 q=p; float v=0.0;
  for(int i=0;i<3;i++){ q = vec2(q.x+sin(q.y*1.7+t), q.y+cos(q.x*1.5-t*0.8)); v += sin(q.x*2.1)*cos(q.y*2.3); }
  return v; }`)
      .replace('#include <color_fragment>', `#include <color_fragment>
if (vWP2.y < ${wy}) { float k = smoothstep(${wy}, ${wy2}, vWP2.y);
  float cc = smoothstep(1.2, 1.9, cau(vWP2.xz*0.9));
  diffuseColor.rgb = mix(diffuseColor.rgb, diffuseColor.rgb * vec3(0.8,0.95,0.95), k) + vec3(0.55,0.75,0.6) * cc * k * 0.35; }`);
  };
  const mesh = new THREE.Mesh(g, m);
  mesh.receiveShadow = true;
  scene.add(mesh);
  world.terrain = mesh;
  return mesh;
}

// ---------- ผิวน้ำ ----------
// opts: shallow/deep สี, flow = ทิศเส้นแสงไหล, fall = จุดฟองน้ำตก, surf = คลื่นซัดฝั่ง (ชายหาด), waves = ความสูงคลื่น, glint = แสงแดดสะท้อน
const WAVE_GLSL = `
float wv(vec2 p, float t){
  return sin(dot(p, vec2(0.21, 0.13)) + t * 0.9) * 0.5
       + sin(dot(p, vec2(-0.12, 0.27)) + t * 1.3) * 0.35
       + sin(dot(p, vec2(0.47, 0.39)) + t * 2.1) * 0.18
       + sin(dot(p, vec2(-0.71, 0.52)) + t * 2.9) * 0.09; }`;
export function makeWater(scene, world, o) {
  const { cx = 0, cz = 0, size = 18, segs = 90, groundH, waterY, shallow = 0x6bcab8, deep = 0x1a6b66, depthScale = 1.7,
    flow = [0.12, 0.05], fall = null, surf = 0, waves = 0.015, alphaMin = 0.28, alphaMax = 0.86, glint = 0.6, crest = 0 } = o;
  const g = new THREE.PlaneGeometry(size, size, segs, segs);
  g.rotateX(-Math.PI / 2);
  g.translate(cx, waterY, cz);
  const wp = g.attributes.position;
  const depth = new Float32Array(wp.count);
  for (let i = 0; i < wp.count; i++) depth[i] = waterY - groundH(wp.getX(i), wp.getZ(i));
  g.setAttribute('depth', new THREE.BufferAttribute(depth, 1));
  const ripples = [];
  for (let i = 0; i < 6; i++) ripples.push(new THREE.Vector4(0, 0, -100, 1));
  const mat = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, fog: true,
    uniforms: THREE.UniformsUtils.merge([THREE.UniformsLib.fog, {
      uFall: { value: new THREE.Vector3(fall ? fall.x : 0, fall ? fall.z : 0, fall ? 1 : 0) },
      uRip: { value: ripples }, uCam: { value: new THREE.Vector3() },
      uShallow: { value: new THREE.Color(shallow) }, uDeep: { value: new THREE.Color(deep) },
      uFlow: { value: new THREE.Vector2(...flow) }, uSurf: { value: surf }, uWaves: { value: waves },
      uDS: { value: depthScale }, uA: { value: new THREE.Vector2(alphaMin, alphaMax) }, uGlint: { value: glint }, uCrest: { value: crest },
      uSky: { value: new THREE.Color(0xcfe9f3) }, uSunDir: { value: new THREE.Vector3(0.4, 0.8, 0.4) }, uSunCol: { value: new THREE.Color(0xfff3dc) },
    }]),
    vertexShader: `attribute float depth; varying float vD; varying vec3 vW; varying float vH; uniform float uTime; uniform float uWaves;
${WAVE_GLSL}
#include <fog_pars_vertex>
void main(){ vD = depth; vec3 p = position;
  vec4 w0 = modelMatrix * vec4(p, 1.0);
  float h = wv(w0.xz, uTime);
  vH = h;
  p.y += h * uWaves * 2.0;
  vec4 w = modelMatrix * vec4(p, 1.0); vW = w.xyz; vec4 mvPosition = viewMatrix * w; gl_Position = projectionMatrix * mvPosition;
  #include <fog_vertex>
}`,
    fragmentShader: `uniform float uTime; uniform vec3 uFall; uniform vec4 uRip[6]; uniform vec3 uCam; uniform vec3 uShallow; uniform vec3 uDeep;
uniform vec2 uFlow; uniform float uSurf; uniform float uDS; uniform vec2 uA; uniform float uGlint; uniform vec3 uSky; uniform float uWaves; uniform float uCrest;
uniform vec3 uSunDir; uniform vec3 uSunCol;
varying float vD; varying vec3 vW; varying float vH;
#include <fog_pars_fragment>
${WAVE_GLSL}
float h(vec2 p){ return fract(sin(dot(p, vec2(127.1,311.7)))*43758.5453); }
float n(vec2 p){ vec2 i=floor(p), f=fract(p); f=f*f*(3.0-2.0*f); return mix(mix(h(i),h(i+vec2(1,0)),f.x),mix(h(i+vec2(0,1)),h(i+vec2(1,1)),f.x),f.y); }
void main(){
  if (vD < 0.0) discard;
  vec2 p = vW.xz;
  // ความชันคลื่น → normal (คลื่นใหญ่ + ระลอกเล็กจาก noise)
  float e = 0.35, A = uWaves * 2.0;
  float dx = (wv(p + vec2(e, 0.0), uTime) - wv(p - vec2(e, 0.0), uTime)) / (2.0 * e) * A;
  float dz = (wv(p + vec2(0.0, e), uTime) - wv(p - vec2(0.0, e), uTime)) / (2.0 * e) * A;
  float r1 = n(p * 1.7 + uTime * 0.35), r2 = n(p * 1.7 + vec2(0.37, 0.0) + uTime * 0.35), r3 = n(p * 1.7 + vec2(0.0, 0.37) + uTime * 0.35);
  vec3 N = normalize(vec3(-dx - (r2 - r1) * 0.35, 1.0, -dz - (r3 - r1) * 0.35));
  vec3 V = normalize(uCam - vW);
  float t = smoothstep(0.0, uDS, vD);
  vec3 col = mix(uShallow, uDeep, t);
  float a = mix(uA.x, uA.y, t);
  // แสงแบบการ์ตูน: ด้านคลื่นที่หันรับแดดสว่าง ด้านหลังคลื่นเข้มขึ้น
  float ndl = dot(N, normalize(uSunDir));
  col *= mix(0.86, 1.0, smoothstep(0.80, 0.86, ndl)) + 0.06 * smoothstep(0.95, 0.99, ndl);
  float nn = n(p * 0.9 + uFlow * uTime) * 0.6 + n(p * 1.9 - uTime * 0.09 + uFlow * uTime * 1.5) * 0.4;
  float line = 1.0 - smoothstep(0.0, 0.035, abs(nn - 0.5));
  col = mix(col, vec3(0.9, 1.0, 0.97), line * 0.45); a = max(a, line * 0.55);
  // ฟองริมฝั่ง (ชายหาด: แถบคลื่นซัดขึ้นลง)
  float fz = 0.09 + 0.05 * sin(p.x * 3.0 + p.y * 2.0 + uTime * 1.5) + n(p * 3.0 + uTime * 0.3) * 0.07;
  fz += uSurf * (0.5 + 0.5 * sin(uTime * 0.7)) * 0.35;
  float shore = smoothstep(fz, fz - 0.02, vD);
  float band = uSurf * smoothstep(0.06, 0.0, abs(vD - (0.25 + 0.6 * fract(uTime * 0.12)) - n(p * 2.0) * 0.12)) * (1.0 - smoothstep(0.6, 1.0, vD));
  // ฟองบนยอดคลื่น (ทะเล)
  float crest = uCrest * smoothstep(0.74, 0.8, vH + n(p * 1.3 + uTime * 0.2) * 0.3 - 0.1) * step(0.62, n(p * 4.3 - uTime * 0.3)) * (1.0 - line);
  float ff = 0.0, ring = 0.0;
  if (uFall.z > 0.5) {
    float df = length((p - uFall.xy) * vec2(0.8, 1.2));
    float fn = n(p * 2.5 + vec2(0.0, uTime * 1.2));
    ff = smoothstep(1.9, 1.7, df + fn * 0.9);
    ring = smoothstep(0.08, 0.0, abs(fract(df * 0.8 - uTime * 0.7) - 0.5) - 0.38) * smoothstep(5.0, 1.5, df);
  }
  float rip = 0.0;
  for (int i = 0; i < 6; i++) {
    float age = uTime - uRip[i].z;
    if (age > 0.0 && age < 2.2) {
      float r = age * 1.1 * uRip[i].w; float d = length(p - uRip[i].xy);
      rip += smoothstep(0.05, 0.0, abs(d - r)) * (1.0 - age / 2.2) * uRip[i].w;
      rip += smoothstep(0.04, 0.0, abs(d - r * 0.6)) * (1.0 - age / 2.2) * 0.6;
    }
  }
  float foam = max(max(shore, max(ff, band)), max(max(ring * 0.5, crest * 0.85), min(rip, 1.0)));
  col = mix(col, vec3(1.0), foam); a = max(a, foam * 0.95);
  // ท้องฟ้าสะท้อนตามมุมมอง + แสงแดดระยิบ (เส้นทางแสงอาทิตย์บนผิวน้ำ)
  float fr = pow(1.0 - max(dot(V, N), 0.0), 3.0);
  col = mix(col, uSky, fr * 0.55); a = mix(a, 1.0, fr * 0.45);
  vec3 R = reflect(-V, N);
  float sp = max(dot(R, normalize(uSunDir)), 0.0);
  float glint = step(0.985, sp) * uGlint + smoothstep(0.9, 1.0, sp) * 0.18 * uGlint;
  col = mix(col, uSunCol, min(glint, 1.0)); a = max(a, min(glint, 1.0));
  gl_FragColor = vec4(col, a);
  #include <fog_fragment>
}`,
  });
  mat.uniforms.uTime = T;
  mat.uniforms.uRip.value = ripples;
  const water = new THREE.Mesh(g, mat);
  water.renderOrder = 1;
  scene.add(water);
  world.water = water;
  let ri = 0;
  world.addRipple = (x, z, s = 1) => { ripples[ri].set(x, z, T.value, s); ri = (ri + 1) % ripples.length; };
  // ความสูงคลื่นที่จุดใด ๆ (ให้ทุ่น/เรือลอยตามคลื่นจริง)
  world.waveH = (x, z) => {
    const t = T.value;
    const w = Math.sin(x * 0.21 + z * 0.13 + t * 0.9) * 0.5 + Math.sin(-x * 0.12 + z * 0.27 + t * 1.3) * 0.35 + Math.sin(x * 0.47 + z * 0.39 + t * 2.1) * 0.18 + Math.sin(-x * 0.71 + z * 0.52 + t * 2.9) * 0.09;
    return w * waves * 2.0;
  };
  world.update.push((dt, cam) => {
    const u = mat.uniforms;
    u.uCam.value.copy(cam.position);
    if (scene.fog) u.uSky.value.copy(scene.fog.color).lerp(new THREE.Color(0xffffff), 0.2);
    if (world.sun) { u.uSunDir.value.copy(world.sun.position).sub(world.sun.target.position).normalize(); u.uSunCol.value.copy(world.sun.color).lerp(new THREE.Color(0xffffff), 0.5); }
  });
  return water;
}

// ---------- เมฆก้อนนุ่ม ๆ ลอยช้า ๆ ----------
export function makeClouds(scene, world, { count = 8, area = [-60, 60, -90, -20], height = [16, 26], r, scale = [3, 6], speed = 0.6 }) {
  const mat = toon(0xffffff, { emissive: 0x8a9aa8, fog: true });
  const clouds = [];
  for (let i = 0; i < count; i++) {
    const g = new THREE.Group();
    const n = 4 + Math.floor(r() * 3);
    for (let k = 0; k < n; k++) {
      const m = new THREE.Mesh(new THREE.IcosahedronGeometry(1, 1), mat);
      m.position.set((k - n / 2) * 0.9 + r.range(-0.3, 0.3), r.range(0, 0.5) * (k % 2 ? 1 : 0.4), r.range(-0.5, 0.5));
      m.scale.set(r.range(0.9, 1.4), r.range(0.6, 0.9), r.range(0.8, 1.1));
      g.add(m);
    }
    g.position.set(r.range(area[0], area[1]), r.range(height[0], height[1]), r.range(area[2], area[3]));
    g.scale.setScalar(r.range(scale[0], scale[1]));
    scene.add(g);
    clouds.push(g);
  }
  world.update.push(dt => {
    for (const c of clouds) {
      c.position.x += dt * speed;
      if (c.position.x > area[1] + 20) c.position.x = area[0] - 20;
    }
  });
}

// ---------- เงาปลาว่ายใต้น้ำ ----------
export function makeFishShadows(scene, world, { count = 30, area, r, size = 1, minDepth = 0.5, color = 0x1d4a55, opacity = 0.32, sink = 0.35 }) {
  const g = new THREE.ConeGeometry(0.06 * size, 0.28 * size, 5).rotateZ(-Math.PI / 2).scale(1, 0.3, 1);
  const m = new THREE.MeshBasicMaterial({ color, transparent: true, opacity, depthWrite: false, fog: true });
  const im = new THREE.InstancedMesh(g, m, count);
  im.renderOrder = 3;
  im.frustumCulled = false;
  const fd = Array.from({ length: count }, () => [r.range(area[0], area[1]), r.range(area[2], area[3]), r.range(0.8, 3), r() * 6.28, r.range(0.15, 0.45) * (r() < 0.5 ? -1 : 1), r.range(0.7, 1.4)]);
  const m4 = new THREE.Matrix4(), e = new THREE.Euler(), q = new THREE.Quaternion(), pv = new THREE.Vector3(), sv = new THREE.Vector3();
  scene.add(im);
  world.update.push(() => {
    const t = T.value;
    fd.forEach((f, i) => {
      const a = t * f[4] + f[3];
      const x = f[0] + Math.cos(a) * f[2], z = f[1] + Math.sin(a) * f[2];
      const d = world.depthAt ? world.depthAt(x, z) : 5;
      const k = Math.max(0, Math.min(1, (d - minDepth) / 0.4));
      sv.setScalar(f[5] * k + 0.0001);
      q.setFromEuler(e.set(0, -a - (f[4] > 0 ? Math.PI / 2 : -Math.PI / 2) + Math.sin(t * 6 + i) * 0.15, 0));
      im.setMatrixAt(i, m4.compose(pv.set(x, world.waterY - sink, z), q, sv));
    });
    im.instanceMatrix.needsUpdate = true;
  });
  return im;
}

// ---------- วางโมเดลจาก Blender ----------
export function placer(scene, assets, groundH, colliders, r) {
  return (name, x, z, s = 1, ry = r() * 6.28, y = null, collide = 0) => {
    const o = assets.clone(name);
    o.position.set(x, y ?? groundH(x, z) - 0.05, z);
    o.scale.setScalar(s);
    o.rotation.y = ry;
    scene.add(o);
    if (collide) colliders.push({ x, z, r: collide * s });
    return o;
  };
}

function plantMat(tipBend) {
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
}

function colorize(geo, col) {
  const n = geo.attributes.position.count, a = new Float32Array(n * 3), cc = new THREE.Color(col);
  for (let i = 0; i < n; i++) a.set([cc.r, cc.g, cc.b], i * 3);
  geo.setAttribute('color', new THREE.BufferAttribute(a, 3));
  return geo.index ? geo.toNonIndexed() : geo;
}

export function mergeGeos(geos, upNormals = true) {
  let n = 0;
  for (const g of geos) n += g.attributes.position.count;
  const P = new Float32Array(n * 3), C = new Float32Array(n * 3), N = new Float32Array(n * 3);
  let o = 0;
  for (const g of geos) {
    g.computeVertexNormals();
    P.set(g.attributes.position.array, o * 3); C.set(g.attributes.color.array, o * 3);
    const na = g.attributes.normal.array;
    for (let i = 0; i < na.length; i += 3) {
      if (upNormals) { N[o * 3 + i] = 0; N[o * 3 + i + 1] = 1; N[o * 3 + i + 2] = 0; }
      else { N[o * 3 + i] = na[i]; N[o * 3 + i + 1] = na[i + 1]; N[o * 3 + i + 2] = na[i + 2]; }
    }
    o += g.attributes.position.count;
  }
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.BufferAttribute(P, 3));
  out.setAttribute('color', new THREE.BufferAttribute(C, 3));
  out.setAttribute('normal', new THREE.BufferAttribute(N, 3));
  return out;
}

// ---------- กอหญ้า (InstancedMesh) ----------
export function scatterGrass(scene, { ok, count, area, r, root = 0x5e9a36, tip = 0xc5e27a, height = 1 }) {
  const blades = [];
  const cRoot = new THREE.Color(root), cTip = new THREE.Color(tip);
  for (let b = 0; b < 3; b++) {
    const ang = b * 2.1 + 0.3, ca = Math.cos(ang), sa = Math.sin(ang);
    const pts = [[-0.05, 0], [0.05, 0], [-0.03, 0.22], [0.03, 0.22], [0, 0.42]];
    for (const t of [[0, 1, 2], [1, 3, 2], [2, 3, 4]]) for (const vi of t) {
      const [px, py] = pts[vi];
      blades.push([px * ca + 0.12 * py * sa, py * height, -px * sa + 0.12 * py * ca, py / 0.42]);
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
  const im = new THREE.InstancedMesh(g, plantMat(0.9), count);
  const m4 = new THREE.Matrix4(), e = new THREE.Euler(), q = new THREE.Quaternion(), sv = new THREE.Vector3(), pv = new THREE.Vector3();
  let k = 0;
  for (let t = 0; t < count * 3 && k < count; t++) {
    const x = r.range(area[0], area[1]), z = r.range(area[2], area[3]);
    const h = ok(x, z);
    if (h === null) continue;
    const s = r.range(0.7, 1.35);
    pv.set(x, h - 0.02, z); q.setFromEuler(e.set(0, r.range(0, 6.28), 0)); sv.set(s, s * r.range(0.8, 1.3), s);
    im.setMatrixAt(k++, m4.compose(pv, q, sv));
  }
  im.count = k;
  im.receiveShadow = true;
  scene.add(im);
  return im;
}

// ---------- ดอกไม้เล็ก ๆ เป็นกลุ่ม ----------
export function scatterFlowers(scene, { ok, count, area, r, tints = [0xffffff, 0xffffff, 0xffffff, 0xfff4c2, 0xffd6e4, 0xd9e8ff], clusters = 40 }) {
  const stem = new THREE.CylinderGeometry(0.008, 0.01, 0.26, 3).translate(0, 0.13, 0);
  const head = new THREE.CylinderGeometry(0.055, 0.04, 0.02, 7).translate(0, 0.27, 0);
  const mid = new THREE.CylinderGeometry(0.02, 0.02, 0.03, 5).translate(0, 0.285, 0);
  const fg = mergeGeos([colorize(stem, 0x5f9a38), colorize(head, 0xffffff), colorize(mid, 0xf5c542)]);
  const fm = new THREE.InstancedMesh(fg, plantMat(1.5), count);
  const m4 = new THREE.Matrix4(), e = new THREE.Euler(), q = new THREE.Quaternion(), sv = new THREE.Vector3(), pv = new THREE.Vector3(), c = new THREE.Color();
  const cl = Array.from({ length: clusters }, () => [r.range(area[0], area[1]), r.range(area[2], area[3])]);
  let k = 0;
  for (let t = 0; t < count * 4 && k < count; t++) {
    const p = cl[t % cl.length];
    const x = p[0] + r.range(-2.6, 2.6) * r() * 1.6, z = p[1] + r.range(-2.6, 2.6) * r() * 1.6;
    const h = ok(x, z);
    if (h === null) continue;
    pv.set(x, h - 0.02, z); q.setFromEuler(e.set(r.range(-0.15, 0.15), r.range(0, 6.28), r.range(-0.15, 0.15))); sv.setScalar(r.range(0.8, 1.3));
    fm.setMatrixAt(k, m4.compose(pv, q, sv));
    fm.setColorAt(k, c.set(tints[Math.floor(r() * tints.length)]));
    k++;
  }
  fm.count = k;
  scene.add(fm);
  return fm;
}

// ---------- ลำแสงลอดใบไม้ ----------
export function makeGodRays(scene, world, bases, r, { strength = 0.26, length = 15, width = [0.6, 1.8] } = {}) {
  const geo = new THREE.PlaneGeometry(1, length).translate(0, -length / 2, 0);
  const dir = world.sunDir.clone().negate();
  const rays = [];
  const mk = () => new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, fog: false,
    uniforms: { uTime: T, uA: { value: 1 } },
    vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
    fragmentShader: `uniform float uTime; uniform float uA; varying vec2 vUv;
void main(){ float e = smoothstep(0.0, 0.5, vUv.x) * smoothstep(1.0, 0.5, vUv.x);
  float l = smoothstep(0.0, 0.25, vUv.y) * smoothstep(1.0, 0.55, vUv.y);
  float f = 0.75 + 0.25 * sin(uTime * 0.7 + vUv.y * 3.0);
  gl_FragColor = vec4(vec3(1.0, 0.93, 0.7) * e * l * ${strength.toFixed(2)} * f * uA, 1.0); }`,
  });
  for (const b of bases) for (let j = 0; j < 2; j++) {
    const m = new THREE.Mesh(geo, mk());
    m.scale.x = r.range(width[0], width[1]);
    m.position.copy(b).add(new THREE.Vector3(r.range(-1.2, 1.2), r.range(0.5, 2), r.range(-1.2, 1.2))).addScaledVector(dir, -2);
    m.userData.ph = r() * 6.28;
    scene.add(m);
    rays.push(m);
  }
  const toCam = new THREE.Vector3(), side = new THREE.Vector3(), nn = new THREE.Vector3(), mat = new THREE.Matrix4(), down = dir.clone().negate();
  world.rays = rays;
  world.update.push((dt, cam) => {
    const k = world.rayK ?? 1;
    for (const m of rays) {
      toCam.subVectors(cam.position, m.position);
      side.crossVectors(dir, toCam).normalize();
      nn.crossVectors(side, dir).normalize();
      m.quaternion.setFromRotationMatrix(mat.makeBasis(side, down, nn));
      m.material.uniforms.uA.value = (0.65 + 0.35 * Math.sin(T.value * 0.35 + m.userData.ph)) * k;
      m.visible = k > 0.02;
    }
  });
}

// ---------- ละอองลอย (เกสร / หิ่งห้อย) ----------
export function makeMotes(scene, world, { count, area, r, color = 0xfff3b0, size = 0.08, glow = false, y = [0.4, 4] }) {
  const g = new THREE.BufferGeometry();
  const p = new Float32Array(count * 3), base = [];
  for (let i = 0; i < count; i++) base.push([r.range(area[0], area[1]), r.range(y[0], y[1]), r.range(area[2], area[3]), r() * 6.28]);
  g.setAttribute('position', new THREE.BufferAttribute(p, 3));
  const mat = new THREE.PointsMaterial({ color, size, transparent: true, opacity: 0.85, depthWrite: false, blending: glow ? THREE.AdditiveBlending : THREE.NormalBlending });
  const pts = new THREE.Points(g, mat);
  pts.frustumCulled = false;
  scene.add(pts);
  world.update.push(() => {
    const t = T.value;
    for (let i = 0; i < count; i++) {
      const [x, yy, z, ph] = base[i];
      p[i * 3] = x + Math.sin(t * 0.2 + ph) * 1.5; p[i * 3 + 1] = yy + Math.sin(t * 0.5 + ph * 2) * 0.4; p[i * 3 + 2] = z + Math.cos(t * 0.17 + ph) * 1.5;
    }
    g.attributes.position.needsUpdate = true;
    if (glow) mat.opacity = 0.5 + 0.5 * Math.sin(t * 2.0);
  });
  return pts;
}

// ---------- ผีเสื้อ / นก ----------
export function makeFlyers(scene, world, { colors, r, groundH, area = [-10, 10, -2, 10], height = 0.8, radius = 3, speed = 0.35, wing = [0.16, 0.12], flap = 18 }) {
  const wingG = new THREE.PlaneGeometry(wing[0], wing[1]).translate(wing[0] / 2, 0, 0);
  wingG.rotateX(-Math.PI / 2);
  const flies = [];
  for (const col of colors) {
    const b = new THREE.Group();
    const wm = new THREE.MeshBasicMaterial({ color: col, side: THREE.DoubleSide, fog: true });
    const l = new THREE.Mesh(wingG, wm), rr = new THREE.Mesh(wingG, wm);
    rr.scale.x = -1;
    b.add(l, rr);
    scene.add(b);
    flies.push({ b, l, r: rr, c: [r.range(area[0], area[1]), r.range(area[2], area[3])], ph: r() * 10 });
  }
  const pos = (f, tt) => [f.c[0] + Math.sin(tt) * radius + Math.sin(tt * 2.3) * radius * 0.27, f.c[1] + Math.cos(tt * 0.8) * radius];
  world.update.push(() => {
    const t = T.value;
    for (const f of flies) {
      const tt = t * speed + f.ph;
      const [x, z] = pos(f, tt), [nx, nz] = pos(f, tt + 0.05);
      f.b.position.set(x, groundH(x, z) + height + Math.sin(tt * 3) * 0.3, z);
      f.b.rotation.y = Math.atan2(nx - x, nz - z) + Math.PI / 2;
      const fl = Math.sin(t * flap + f.ph) * 1.1;
      f.l.rotation.z = fl; f.r.rotation.z = -fl;
    }
  });
}

// ---------- ฝน (วันโชคไม่ดี) ----------
export function makeRain(scene, world, { count = 900, area = 30 } = {}) {
  const g = new THREE.BufferGeometry();
  const p = new Float32Array(count * 6), sp = [];
  for (let i = 0; i < count; i++) { const x = (Math.random() - 0.5) * area, y = Math.random() * 14, z = (Math.random() - 0.5) * area; sp.push([x, y, z]); }
  g.setAttribute('position', new THREE.BufferAttribute(p, 3));
  const lines = new THREE.LineSegments(g, new THREE.LineBasicMaterial({ color: 0xcfe3ee, transparent: true, opacity: 0.45 }));
  lines.frustumCulled = false;
  scene.add(lines);
  world.update.push((dt, cam) => {
    const c = world.camTarget || cam.position;
    for (let i = 0; i < count; i++) {
      const s = sp[i];
      s[1] -= dt * 16;
      if (s[1] < -1) s[1] += 15;
      const x = c.x + s[0], z = c.z + s[2];
      p.set([x, s[1], z, x - 0.05, s[1] + 0.5, z], i * 6);
    }
    g.attributes.position.needsUpdate = true;
  });
  return lines;
}

// ใส่เงาให้โมเดลทึบทั้งหมด
export function shadowAll(scene, skip) {
  scene.traverse(o => {
    if (o.isMesh && !o.material.transparent && !(o.material instanceof THREE.ShaderMaterial) && o !== skip && !o.isInstancedMesh) { o.castShadow = true; o.receiveShadow = true; }
  });
}

export { toon, swaying };

// ---------- ปลาตัวจริงว่ายใต้น้ำ + กระโดดพ้นน้ำ ----------
// species = รายชื่อชนิดปลา (จาก fish.js), makeFish = ฟังก์ชันสร้างโมเดลปลา
export function makeLiveFish(scene, world, { makeFish, species, count = 8, area, r, depth = [0.22, 0.45], scale = [0.55, 0.9], jumpEvery = [2.5, 6], minDepth = 0.45 }) {
  const ok = (x, z) => world.canCast(x, z) && world.depthAt(x, z) > minDepth;
  const pick = out => { for (let i = 0; i < 40; i++) { const x = r.range(area[0], area[1]), z = r.range(area[2], area[3]); if (ok(x, z)) { out.set(x, 0, z); return true; } } return false; };
  const fish = [];
  for (let i = 0; i < count; i++) {
    const p = new THREE.Vector3();
    if (!pick(p)) continue;
    const sp = species[Math.floor(r() * species.length)];
    const m = makeFish(sp);
    m.scale.multiplyScalar(r.range(scale[0], scale[1]));
    m.rotation.order = 'YXZ';               // เอียงตัวปลาให้เห็นด้านข้างจากกล้องที่มองลงมา
    scene.add(m);
    const f = { m, p, tgt: new THREE.Vector3(), h: r() * 6.28, v: r.range(0.5, 1.1), d: r.range(depth[0], depth[1]), ph: r() * 10, jump: null };
    pick(f.tgt);
    fish.push(f);
  }
  // ละอองน้ำกระเซ็น
  const DN = 80;
  const dg = new THREE.BufferGeometry();
  const dp = new Float32Array(DN * 3).fill(-999), dv = Array.from({ length: DN }, () => new THREE.Vector3()), dl = new Float32Array(DN);
  dg.setAttribute('position', new THREE.BufferAttribute(dp, 3));
  const drops = new THREE.Points(dg, new THREE.PointsMaterial({ color: 0xffffff, size: 0.09, transparent: true, opacity: 0.9, depthWrite: false }));
  drops.frustumCulled = false;
  drops.renderOrder = 4;
  scene.add(drops);
  let di = 0;
  const splash = (x, z, n = 10, power = 1) => {
    for (let k = 0; k < n; k++) {
      dp.set([x, world.waterY + 0.05, z], di * 3);
      const a = Math.random() * 6.28, s = (0.6 + Math.random() * 1.2) * power;
      dv[di].set(Math.cos(a) * s * 0.6, (1.6 + Math.random() * 1.6) * power, Math.sin(a) * s * 0.6);
      dl[di] = 1;
      di = (di + 1) % DN;
    }
    if (world.addRipple) world.addRipple(x, z, 0.9 * power);
    if (world.onSplash) world.onSplash(x, z);
  };
  world.splash = splash;
  let nextJump = r.range(jumpEvery[0], jumpEvery[1]);
  const T0 = shared.uTime, ahead = new THREE.Vector3();
  world.update.push(dt => {
    const t = T0.value;
    nextJump -= dt;
    if (nextJump <= 0 && fish.length) {
      nextJump = r.range(jumpEvery[0], jumpEvery[1]);
      const f = fish[Math.floor(Math.random() * fish.length)];
      if (!f.jump) {
        const L = 1.2 + Math.random() * 1.6;
        const ex = f.p.x + Math.cos(f.h) * L, ez = f.p.z + Math.sin(f.h) * L;
        if (ok(ex, ez)) { f.jump = { t: 0, dur: 0.75 + L * 0.12, x0: f.p.x, z0: f.p.z, x1: ex, z1: ez, hgt: 0.6 + Math.random() * 0.8, spin: Math.random() < 0.3 }; splash(f.p.x, f.p.z, 8, 0.8); }
      }
    }
    for (const f of fish) {
      const wave = world.waveH ? world.waveH(f.p.x, f.p.z) : 0;
      if (f.jump) {
        const J = f.jump;
        J.t += dt / J.dur;
        const k = Math.min(1, J.t);
        f.p.set(J.x0 + (J.x1 - J.x0) * k, 0, J.z0 + (J.z1 - J.z0) * k);
        f.m.position.set(f.p.x, world.waterY + wave - f.d + Math.sin(k * Math.PI) * (J.hgt + f.d), f.p.z);
        f.m.rotation.set(J.spin ? k * 6.28 : 0.5, -f.h, Math.cos(k * Math.PI) * 0.9);
        if (J.t >= 1) { f.jump = null; splash(f.p.x, f.p.z, 14, 1); pick(f.tgt); }
        continue;
      }
      // ว่ายไปหาเป้าหมาย หันหัวค่อย ๆ
      const want = Math.atan2(f.tgt.z - f.p.z, f.tgt.x - f.p.x);
      let dh = Math.atan2(Math.sin(want - f.h), Math.cos(want - f.h));
      f.h += Math.max(-1.6 * dt, Math.min(1.6 * dt, dh));
      const sp = f.v * (0.7 + 0.3 * Math.sin(t * 0.8 + f.ph));
      ahead.set(f.p.x + Math.cos(f.h) * sp * dt * 8, 0, f.p.z + Math.sin(f.h) * sp * dt * 8);
      if (!ok(ahead.x, ahead.z)) { pick(f.tgt); f.h += 0.9 * dt * 4; }
      else { f.p.x += Math.cos(f.h) * sp * dt; f.p.z += Math.sin(f.h) * sp * dt; }
      if (Math.hypot(f.tgt.x - f.p.x, f.tgt.z - f.p.z) < 0.6) pick(f.tgt);
      f.m.position.set(f.p.x, world.waterY + wave - f.d + Math.sin(t * 1.3 + f.ph) * 0.04, f.p.z);
      f.m.rotation.set(0.85, -f.h + Math.sin(t * 9 * sp + f.ph) * 0.18, 0);
    }
    for (let i = 0; i < DN; i++) {
      if (dl[i] <= 0) continue;
      dl[i] -= dt * 1.4;
      dv[i].y -= 9 * dt;
      dp[i * 3] += dv[i].x * dt; dp[i * 3 + 1] += dv[i].y * dt; dp[i * 3 + 2] += dv[i].z * dt;
      if (dl[i] <= 0 || dp[i * 3 + 1] < world.waterY - 0.1) { dl[i] = 0; dp[i * 3 + 1] = -999; }
    }
    dg.attributes.position.needsUpdate = true;
  });
  return fish;
}
