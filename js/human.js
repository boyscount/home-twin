// คนในฉาก: ร่างกายสัดส่วนจริง มีเข่า ศอก มือ รองเท้า ใบหน้า (ตา คิ้ว จมูก หู ปาก) และทรงผม
// แต่ละท่อน (ลำตัว หัว ต้นแขน ปลายแขน ต้นขา หน้าแข้ง) รวมเป็น mesh เดียว ระบายสีด้วย vertex color
// → ทุกคนใช้วัสดุร่วมกัน 1 ชิ้น ท่อนละ 1 draw call · โครงสร้าง (group/legL/armR/head…) เหมือนของเดิมทุกอย่าง
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

export const SKIN_MAT = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.78 });
const cache = new Map();
const tmpC = new THREE.Color();

// รวมชิ้นส่วน [geometry, สี, x, y, z, rx, ry, rz, sx, sy, sz] เป็น geometry เดียวที่มีสีในตัว
export function bake(parts) {
  const geos = parts.map(([g0, col, x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0, sx = 1, sy = 1, sz = 1]) => {
    const g = (g0.index ? g0 : g0).clone();
    g.applyMatrix4(new THREE.Matrix4().compose(new THREE.Vector3(x, y, z), new THREE.Quaternion().setFromEuler(new THREE.Euler(rx, ry, rz)), new THREE.Vector3(sx, sy, sz)));
    tmpC.set(col).convertSRGBToLinear();
    const n = g.attributes.position.count, c = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) { c[i * 3] = tmpC.r; c[i * 3 + 1] = tmpC.g; c[i * 3 + 2] = tmpC.b; }
    g.setAttribute('color', new THREE.BufferAttribute(c, 3));
    for (const k of Object.keys(g.attributes)) if (!['position', 'normal', 'uv', 'color'].includes(k)) g.deleteAttribute(k);
    return g;
  });
  const m = mergeGeometries(geos); geos.forEach(g => g.dispose());
  m.computeBoundingSphere();
  return m;
}
export const S = (r, ws = 14, hs = 10, ts = 0, tl = Math.PI) => new THREE.SphereGeometry(r, ws, hs, 0, Math.PI * 2, ts, tl);
export const C = (rt, rb, h, seg = 10) => new THREE.CylinderGeometry(rt, rb, h, seg);
const lathe = (pts, seg = 16) => new THREE.LatheGeometry(pts.map(([r, y]) => new THREE.Vector2(r, y)), seg);
export const shade = (hex, k) => '#' + tmpC.set(hex).multiplyScalar(k).getHexString();

function buildParts(o) {
  const skin = shade(o.skin || '#c68e62', 1.3), shirt = o.shirt || '#3b6ea8', pants = o.pants || '#2b2b33', hair = o.hair || '#151210';
  const shoe = o.shoe || '#2b2420', lips = shade(skin, 0.72), fem = !!o.longHair;
  const sh = fem ? 0.172 : 0.19, hip = fem ? 0.165 : 0.152;
  // ลำตัว: สะโพก (สีกางเกง) + เอว/อก/ไหล่ (สีเสื้อ) + คอ
  const torso = bake([
    [lathe([[0.001, 0.84], [hip * 0.9, 0.85], [hip, 0.92], [hip * 0.98, 1.0], [0.148, 1.03], [0.001, 1.04]]), pants, 0, 0, 0, 0, 0, 0, 1, 1, 0.7],
    [lathe([[0.001, 1.0], [0.15, 1.0], [fem ? 0.128 : 0.142, 1.12], [fem ? 0.158 : 0.162, 1.26], [sh * 0.95, 1.38], [sh, 1.44], [sh * 0.8, 1.49], [0.075, 1.51], [0.001, 1.515]]), shirt, 0, 0, 0, 0, 0, 0, 1, 1, 0.62],
    [S(0.07, 10, 8), shirt, -sh + 0.02, 1.43, 0], [S(0.07, 10, 8), shirt, sh - 0.02, 1.43, 0],
    [C(0.047, 0.052, 0.12, 10), skin, 0, 1.55, 0.005],
    // คอเสื้อ
    [new THREE.TorusGeometry(0.058, 0.012, 6, 14), shade(shirt, 0.85), 0, 1.505, 0.005, Math.PI / 2],
  ]);
  // หัว (จุดหมุนอยู่กลางกะโหลก)
  const hp = [
    [S(0.112, 18, 14), skin, 0, 0, 0, 0, 0, 0, 0.9, 1.08, 1.0],
    [S(0.082, 14, 10), skin, 0, -0.058, 0.018, 0, 0, 0, 0.98, 0.82, 0.95],
    [S(0.021, 8, 6), shade(skin, 0.93), 0, -0.018, 0.106, 0, 0, 0, 0.9, 1, 1.35],
    [S(0.028, 8, 6), shade(skin, 0.9), -0.101, -0.004, 0, 0, 0, 0, 0.45, 1, 0.75],
    [S(0.028, 8, 6), shade(skin, 0.9), 0.101, -0.004, 0, 0, 0, 0, 0.45, 1, 0.75],
    [S(0.017, 8, 6), '#f2eee6', -0.037, 0.014, 0.088], [S(0.017, 8, 6), '#f2eee6', 0.037, 0.014, 0.088],
    [S(0.0105, 8, 6), '#2a1c14', -0.037, 0.014, 0.102], [S(0.0105, 8, 6), '#2a1c14', 0.037, 0.014, 0.102],
    [new THREE.BoxGeometry(0.042, 0.009, 0.012), hair, -0.038, 0.043, 0.098, 0, 0, 0.12], [new THREE.BoxGeometry(0.042, 0.009, 0.012), hair, 0.038, 0.043, 0.098, 0, 0, -0.12],
    [new THREE.BoxGeometry(0.036, 0.009, 0.01), lips, 0, -0.062, 0.093],
  ];
  if (o.child) hp[1][8] = 0.9; // เด็กคางเล็ก
  // ทรงผม / หมวก
  if (o.hat !== 'helmet') {
    hp.push([S(0.118, 18, 10, 0, 1.3), hair, 0, 0.008, -0.004, 0, 0, 0, 0.94, 1.06, 1.04]); // ผมด้านบน
    hp.push([S(0.116, 18, 10, 0, 1.55), hair, 0, -0.006, -0.012, -1.45, 0, 0, 0.94, 1.02, 1.0]); // ผมท้ายทอย
    if (fem) {
      hp.push([new THREE.CapsuleGeometry(0.095, 0.16, 4, 12), hair, 0, -0.13, -0.05, 0, 0, 0, 1.12, 1, 0.5]); // ผมยาวประบ่า
      if (o.child) hp.push([S(0.05, 10, 8), hair, 0, 0.02, -0.13]); // จุกผมเด็ก
    }
  }
  if (o.hat === 'straw') {
    hp.push([new THREE.ConeGeometry(0.33, 0.17, 20, 1, true), '#d6bf7a', 0, 0.16, 0], [new THREE.TorusGeometry(0.33, 0.012, 5, 22), '#b89e5c', 0, 0.075, 0, Math.PI / 2]);
    hp.push([new THREE.ConeGeometry(0.33, 0.17, 20, 1, true), '#c4ac68', 0, 0.159, 0, Math.PI]); // ด้านในหมวก
  } else if (o.hat === 'cap') {
    const hc = o.hatColor || '#c0392b';
    hp.push([S(0.123, 16, 8, 0, 1.45), hc, 0, 0.012, -0.004, 0, 0, 0, 0.95, 1, 1.03], [new THREE.CylinderGeometry(0.1, 0.1, 0.012, 14, 1, false, -Math.PI / 2, Math.PI), shade(hc, 0.85), 0, 0.03, 0.09, 0.12, 0, 0, 1, 1, 1.15]);
  } else if (o.hat === 'helmet') {
    const hc = o.hatColor || '#222';
    hp.push([S(0.152, 18, 12, 0, 1.9), hc, 0, 0.02, -0.01, -0.15], [S(0.148, 16, 8, 1.15, 0.6), '#1d2a33', 0, 0.0, 0.01, -0.1, 0, 0, 0.98, 1, 1.02]);
  }
  if (o.glasses) hp.push([new THREE.TorusGeometry(0.022, 0.004, 4, 12), '#111', -0.037, 0.014, 0.106], [new THREE.TorusGeometry(0.022, 0.004, 4, 12), '#111', 0.037, 0.014, 0.106], [new THREE.BoxGeometry(0.03, 0.005, 0.005), '#111', 0, 0.016, 0.108]);
  const head = bake(hp);
  // แขน: ต้นแขน (แขนเสื้อสั้น + ผิว) / ปลายแขน + มือ
  const upper = bake([
    [S(0.058, 10, 8), shirt, 0, -0.01, 0],
    [C(0.058, 0.052, 0.15), shirt, 0, -0.075, 0],
    [C(0.044, 0.039, 0.16), skin, 0, -0.215, 0],
    [S(0.039, 8, 6), skin, 0, -0.29, 0],
  ]);
  const fore = bake([
    [C(0.039, 0.031, 0.25), skin, 0, -0.125, 0],
    [S(0.044, 10, 8), skin, 0, -0.29, 0.004, 0, 0, 0, 0.62, 1.12, 0.95],
    [S(0.017, 6, 5), skin, 0, -0.262, 0.032, 0, 0, 0, 1, 1.6, 1],
  ]);
  // ขา: ต้นขา / หน้าแข้ง + รองเท้า
  const thigh = bake([
    [S(0.085, 10, 8), pants, 0, -0.01, 0],
    [C(0.085, 0.066, 0.44), pants, 0, -0.22, 0],
    [S(0.066, 10, 8), pants, 0, -0.44, 0],
  ]);
  const shin = bake([
    [C(0.064, 0.046, 0.4), pants, 0, -0.2, 0],
    [C(0.044, 0.04, 0.05), shade(skin, 0.95), 0, -0.415, 0],
    [new THREE.CapsuleGeometry(0.046, 0.12, 4, 10), shoe, 0, -0.45, 0.045, Math.PI / 2, 0, 0, 1.05, 1, 0.62],
  ]);
  return { torso, head, upper, foreL: fore, foreR: fore.clone(), thigh, shin };
}

// ---------------------------------------------------------------- ชิ้นส่วนแบบปั้นละเอียดจาก Blender (models/env/human_parts.glb)
// หน้ามีจมูก/ปาก/คาง ตามีตาขาว-ม่านตา มือมีนิ้ว เสื้อผ้ามีรอยพับ · จุดหมุนเหมือนเดิม → ท่าทางเดิมใช้ได้ทั้งหมด
// สีจุดยอดในไฟล์: R = รหัสส่วน, G = เงาซอกมุม (อบจาก Cycles) → ระบายสีตามแต่ละคนตรงนี้
let TPL = null;
const REG = { SKIN: 0, SHIRT: 1, SHIRT_D: 2, PANTS: 3, PANTS_D: 4, HAIR: 5, SHOE: 6, SOLE: 7, EYEW: 8, IRIS: 9, PUPIL: 10, LIPS: 11, NAIL: 12, BROW: 13 };
const lin = hex => new THREE.Color(hex).convertSRGBToLinear();
const mixHex = (a, b, t) => '#' + new THREE.Color(a).lerp(new THREE.Color(b), t).getHexString();
function recolor(src, pal) {
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', src.attributes.position.clone()); g.setAttribute('normal', src.attributes.normal.clone());
  if (src.index) g.setIndex(src.index.clone());
  const c = src.attributes.color, n = c.count, out = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) {
    const p = pal[Math.min(13, Math.floor(c.getX(i) * 16))], k = 0.4 + 0.6 * c.getY(i);
    out[i * 3] = p.r * k; out[i * 3 + 1] = p.g * k; out[i * 3 + 2] = p.b * k;
  }
  g.setAttribute('color', new THREE.BufferAttribute(out, 3));
  return g;
}
const noUV = g => { if (g.attributes.uv) g.deleteAttribute('uv'); return g; };
function buildPartsTpl(o) {
  // ผิว: ลดความอิ่มสีส้มลงให้เป็นผิวคนจริง (เงาซอกมุมจาก Blender ทำให้สีเข้มขึ้นอยู่แล้ว)
  const skin = mixHex(shade(o.skin || '#c68e62', 1.32), '#d9b9a0', 0.32), shirt = o.shirt || '#3b6ea8', pants = o.pants || '#2b2b33', hair = o.hair || '#151210', shoe = o.shoe || '#2b2420';
  const pal = [];
  pal[REG.SKIN] = lin(skin); pal[REG.SHIRT] = lin(shirt); pal[REG.SHIRT_D] = lin(shade(shirt, 0.78)); pal[REG.PANTS] = lin(pants); pal[REG.PANTS_D] = lin(shade(pants, 0.55));
  pal[REG.HAIR] = lin(hair); pal[REG.SHOE] = lin(shoe); pal[REG.SOLE] = lin(mixHex(shoe, '#d8d4cc', 0.55)); pal[REG.EYEW] = lin('#ebe5da'); pal[REG.IRIS] = lin('#3a2416');
  pal[REG.PUPIL] = lin('#0b0806'); pal[REG.LIPS] = lin(mixHex(shade(skin, 0.88), '#b8645a', 0.3)); pal[REG.NAIL] = lin(shade(skin, 1.12)); pal[REG.BROW] = lin(shade(hair, 0.9));
  const fem = !!o.longHair;
  const headParts = [recolor(TPL.head, pal)];
  if (o.hat !== 'helmet') headParts.push(recolor(TPL[fem ? (o.child ? 'hair_bun' : 'hair_long') : 'hair_short'], pal));
  // หมวก / แว่น ใช้ชิ้นเดิม (ขนาดหัวใกล้เคียงกัน)
  const acc = [];
  if (o.hat === 'straw') acc.push([new THREE.ConeGeometry(0.33, 0.15, 20, 1, true), '#d6bf7a', 0, 0.155, 0], [new THREE.TorusGeometry(0.33, 0.012, 5, 22), '#b89e5c', 0, 0.08, 0, Math.PI / 2], [new THREE.ConeGeometry(0.33, 0.15, 20, 1, true), '#c4ac68', 0, 0.154, 0, Math.PI]); // งอบวางบนผม
  else if (o.hat === 'cap') { const hc = o.hatColor || '#c0392b'; acc.push([S(0.124, 16, 8, 0, 1.45), hc, 0, 0.018, -0.006, 0, 0, 0, 0.96, 1.02, 1.05], [new THREE.CylinderGeometry(0.1, 0.1, 0.012, 14, 1, false, -Math.PI / 2, Math.PI), shade(hc, 0.85), 0, 0.036, 0.09, 0.12, 0, 0, 1, 1, 1.15]); }
  else if (o.hat === 'helmet') { const hc = o.hatColor || '#222'; acc.push([S(0.152, 18, 12, 0, 1.9), hc, 0, 0.02, -0.01, -0.15], [S(0.148, 16, 8, 1.15, 0.6), '#1d2a33', 0, 0.0, 0.01, -0.1, 0, 0, 0.98, 1, 1.02]); }
  if (o.glasses) acc.push([new THREE.TorusGeometry(0.021, 0.0035, 4, 14), '#111', -0.035, 0.012, 0.094], [new THREE.TorusGeometry(0.021, 0.0035, 4, 14), '#111', 0.035, 0.012, 0.094], [new THREE.BoxGeometry(0.028, 0.004, 0.004), '#111', 0, 0.014, 0.098]);
  if (acc.length) headParts.push(bake(acc));
  const head = mergeGeometries(headParts.map(noUV)); head.computeBoundingSphere();
  const P = { torso: recolor(TPL[fem ? 'torso_f' : 'torso_m'], pal), head, upper: recolor(TPL.upper, pal), foreL: recolor(TPL.fore_L, pal), foreR: recolor(TPL.fore_R, pal), thigh: recolor(TPL.thigh, pal), shin: recolor(TPL.shin, pal) };
  for (const g of Object.values(P)) g.computeBoundingSphere();
  return P;
}
// โหลดชิ้นส่วนแล้วเปลี่ยนร่างทุกคนที่สร้างไปแล้ว (แก้ geometry เดิมในที่ → mesh/ท่าทางเดิมไม่ต้องสร้างใหม่)
export async function loadHumanTemplates(url) {
  const { GLTFLoader } = await import('three/addons/loaders/GLTFLoader.js');
  const gltf = await new GLTFLoader().loadAsync(url);
  const t = {}; gltf.scene.traverse(o => { if (o.isMesh) t[o.name] = o.geometry; });
  for (const k of ['torso_m', 'torso_f', 'head', 'hair_short', 'hair_long', 'hair_bun', 'upper', 'fore_L', 'fore_R', 'thigh', 'shin']) if (!t[k] || !t[k].attributes.color) throw new Error('human part missing: ' + k);
  TPL = t;
  for (const [key, P] of cache) {
    const [skin, shirt, pants, hair, hat, hatColor, longHair, glasses, child, shoe] = JSON.parse(key);
    P.hi = buildPartsTpl({ skin, shirt, pants, hair, hat, hatColor, longHair, glasses, child, shoe });
  }
}
// ระดับรายละเอียดตามระยะ (LOD): คนใกล้กล้องใช้ร่างละเอียด คนไกลใช้ร่างเดิม (เบา ดูต่างกันไม่ออกเมื่ออยู่ไกล)
const HUMANS = new Set(), _wp = new THREE.Vector3();
export function updateHumanLOD(camera, near = 16) {
  if (!TPL) return;
  const cp = camera.getWorldPosition(new THREE.Vector3());
  for (const g of HUMANS) {
    if (!g.parent) { HUMANS.delete(g); continue; }
    const { P, parts } = g.userData, hi = P.hi && g.getWorldPosition(_wp).distanceTo(cp) < near;
    if (g.userData.hi === hi) continue; g.userData.hi = hi;
    for (const m of parts) m.geometry = hi ? P.hi[m.userData.part] : P[m.userData.part];
  }
}

export function makeHuman(o = {}) {
  const key = JSON.stringify([o.skin, o.shirt, o.pants, o.hair, o.hat, o.hatColor, o.longHair, o.glasses, o.child, o.shoe]);
  let P = cache.get(key);
  if (!P) { P = buildParts(o); if (TPL) P.hi = buildPartsTpl(o); cache.set(key, P); }
  const parts = [];
  const mk = (part, parent, y = 0, x = 0) => { const m = new THREE.Mesh(P[part], SKIN_MAT); m.userData.part = part; m.position.set(x, y, 0); m.castShadow = true; parent.add(m); parts.push(m); return m; };
  const g = new THREE.Group(); g.userData.P = P; g.userData.parts = parts; g.userData.hi = false; HUMANS.add(g);
  mk('torso', g);
  const head = new THREE.Group(); head.position.y = 1.68; g.add(head); mk('head', head);
  if (o.child) head.scale.setScalar(1.22);
  const fem = !!o.longHair, sx = fem ? 0.172 : 0.19;
  const arm = x => {
    const pivot = new THREE.Group(); pivot.position.set(x, 1.43, 0); g.add(pivot); mk('upper', pivot);
    const elbow = new THREE.Group(); elbow.position.y = -0.29; pivot.add(elbow); mk(x < 0 ? 'foreL' : 'foreR', elbow); // มือซ้าย/ขวา (นิ้วโป้งอยู่ด้านหน้า)
    pivot.userData.joint = elbow; return pivot;
  };
  const leg = x => {
    const pivot = new THREE.Group(); pivot.position.set(x, 0.93, 0); g.add(pivot); mk('thigh', pivot);
    const knee = new THREE.Group(); knee.position.y = -0.45; pivot.add(knee); mk('shin', knee);
    pivot.userData.joint = knee; return pivot;
  };
  const armL = arm(-sx - 0.012), armR = arm(sx + 0.012);
  const legL = leg(fem ? -0.088 : -0.094), legR = leg(fem ? 0.088 : 0.094);
  armL.rotation.z = -0.06; armR.rotation.z = 0.06;
  return { group: g, legL, legR, armL, armR, head, phase: Math.random() * 6, kneeL: legL.userData.joint, kneeR: legR.userData.joint, elbowL: armL.userData.joint, elbowR: armR.userData.joint };
}

const damp = (o, v, k) => { o.rotation.x += (v - o.rotation.x) * k; };

export function animateWalk(h, dt, speed) {
  h.phase += dt * speed * 5.2;
  const amp = 0.55 * Math.min(1, speed), s = Math.sin(h.phase) * amp;
  h.legL.rotation.x = s; h.legR.rotation.x = -s;
  // เข่างอตอนเหวี่ยงขาไปข้างหน้า, ศอกงอนิด ๆ ตามจังหวะแกว่งแขน
  h.kneeL.rotation.x = Math.max(0, Math.sin(h.phase + 1.9)) * 1.0 * amp + 0.05;
  h.kneeR.rotation.x = Math.max(0, Math.sin(h.phase + 1.9 + Math.PI)) * 1.0 * amp + 0.05;
  if (!h.holding) {
    h.armL.rotation.x = -s * 0.75; h.armR.rotation.x = s * 0.75;
    h.elbowL.rotation.x = -0.25 - Math.max(0, s) * 0.5; h.elbowR.rotation.x = -0.25 - Math.max(0, -s) * 0.5;
  } else h.elbowR.rotation.x = 0;
  h.group.position.y = (h.baseY || 0) + Math.abs(Math.cos(h.phase)) * 0.035 * Math.min(1, speed);
  h.head.rotation.x = 0.04;
}

export function animateIdle(h, dt) {
  h.phase += dt;
  const k = Math.min(1, dt * 10);
  if (h.sleeping) { // นอนหงาย หายใจช้า ๆ
    h.legL.rotation.x = h.legR.rotation.x = 0; h.kneeL.rotation.x = h.kneeR.rotation.x = 0.08;
    h.armL.rotation.x = h.armR.rotation.x = 0.1; h.elbowL.rotation.x = h.elbowR.rotation.x = -0.2;
    h.armL.rotation.z = -0.12; h.armR.rotation.z = 0.12;
    h.head.rotation.y = Math.sin(h.phase * 0.12) * 0.25; h.head.rotation.x = 0;
    h.group.position.y = h.baseY || 0;
    return;
  }
  if (h.sitting) { // นั่งเก้าอี้: ต้นขาขนานพื้น หน้าแข้งตั้งฉาก
    h.legL.rotation.x = h.legR.rotation.x = -1.45; h.kneeL.rotation.x = h.kneeR.rotation.x = 1.45;
    h.group.position.y = (h.baseY || 0) - 0.47 * h.group.scale.y;
    if (h.eating) {
      const e = Math.sin(h.phase * 1.6 + (h.eatOffset || 0));
      h.armR.rotation.x = -0.75 + e * 0.35; h.elbowR.rotation.x = -1.2 - Math.max(0, e) * 0.6;
      h.armL.rotation.x = -0.35; h.elbowL.rotation.x = -1.1;
      h.head.rotation.x = 0.15 + Math.max(0, e) * 0.12;
    }
    if (h.handUp > 0) { h.handUp -= dt; h.armR.rotation.x = -2.9; h.armR.rotation.z = 0.15; h.elbowR.rotation.x = -0.2; }
    else if (!h.eating) { h.armR.rotation.x = -0.35; h.armL.rotation.x = -0.35; h.armR.rotation.z = 0.06; h.elbowL.rotation.x = h.elbowR.rotation.x = -1.0; }
    h.head.rotation.y = Math.sin(h.phase * 0.35 + (h.eatOffset || 0)) * (h.eating ? 0.6 : 0.2);
    return;
  }
  damp(h.kneeL, 0.03, k); damp(h.kneeR, 0.03, k);
  if (h.teaching) { // ยืนสอน: เขียนกระดาน / ชี้ / หันมาคุยกับเด็ก
    h.legL.rotation.x *= 0.85; h.legR.rotation.x *= 0.85;
    h.group.position.y = h.baseY || 0;
    if (h.writing) { h.armR.rotation.x = -1.6 + Math.sin(h.phase * 6) * 0.12; h.elbowR.rotation.x = -0.5; h.armR.rotation.z = Math.sin(h.phase * 3) * 0.2; }
    else { h.armR.rotation.x = -0.7 + Math.sin(h.phase * 1.5) * 0.3; h.elbowR.rotation.x = -0.6; h.armR.rotation.z = 0.06; h.armL.rotation.x = -0.2; h.elbowL.rotation.x = -0.9; }
    h.head.rotation.y = h.writing ? 0 : Math.sin(h.phase * 0.6) * 0.5;
    return;
  }
  h.head.rotation.x *= 0.9;
  if (h.tapping) { // กรีดยาง: ย่อตัวเล็กน้อย มือขวาลากมีดเป็นเกลียว
    h.armR.rotation.x = -1.0 + Math.sin(h.phase * 7) * 0.22; h.elbowR.rotation.x = -0.7; h.armR.rotation.z = Math.sin(h.phase * 3.5) * 0.3;
    h.armL.rotation.x = -0.8; h.elbowL.rotation.x = -0.9; h.head.rotation.x = 0.25;
    h.legL.rotation.x = -0.25; h.legR.rotation.x = -0.25; h.kneeL.rotation.x = h.kneeR.rotation.x = 0.5;
    h.group.position.y = (h.baseY || 0) - 0.05;
    return;
  }
  h.legL.rotation.x *= 0.85; h.legR.rotation.x *= 0.85;
  if (!h.holding) {
    h.armL.rotation.x *= 0.85; h.armR.rotation.x *= 0.85;
    damp(h.elbowL, -0.12, k); damp(h.elbowR, -0.12, k);
  } else h.elbowR.rotation.x = 0;
  // ยืนเฉย ๆ หายใจ + ถ่ายน้ำหนักเล็กน้อย
  h.group.position.y = (h.baseY || 0) + Math.sin(h.phase * 1.4) * 0.004;
  h.head.rotation.y = Math.sin(h.phase * 0.5) * 0.35;
}
