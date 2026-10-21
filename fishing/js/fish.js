// ชนิดปลา + สมุดสะสม (บันทึกใน localStorage)
import * as THREE from 'three';
import { toon } from './toon.js';

// pull = แรงดึงพื้นฐาน, dash = แรงพุ่งหนี, prog = ความเร็วกรอเข้า, win = เวลากดดึงทัน (วินาที)
export const SPECIES = [
  { id: 'nil', name: 'ปลานิล', en: 'Nile tilapia', stars: 1, chance: 34, kg: [0.3, 1.6], cm: [16, 38],
    shape: [0.85, 1.35, 1.15], top: 0x55697c, belly: 0xdde3e4, fin: 0x8c6f80, pattern: 'stripes',
    pull: 0.22, dash: 0.45, prog: 0.38, win: 1.1, desc: 'ปลาน้ำจืดคู่บ้าน เลี้ยงง่าย เนื้อขาวนุ่ม มีลายพาดขวางจาง ๆ ตามลำตัว' },
  { id: 'taphian', name: 'ปลาตะเพียน', en: 'Silver barb', stars: 1, chance: 30, kg: [0.2, 1.1], cm: [14, 32],
    shape: [0.9, 1.4, 0.9], top: 0x8e9473, belly: 0xf3ecd2, fin: 0xe8963a, pattern: 'scales',
    pull: 0.2, dash: 0.5, prog: 0.4, win: 1.0, desc: 'เกล็ดเงินแวววาว ครีบสีส้ม ชอบว่ายเป็นฝูงใกล้ผิวน้ำ ต้นแบบของปลาตะเพียนสานใบลาน' },
  { id: 'chon', name: 'ปลาช่อน', en: 'Striped snakehead', stars: 2, chance: 15, kg: [0.5, 3.2], cm: [28, 70],
    shape: [1.55, 0.75, 0.95], top: 0x3c4232, belly: 0xa5a98a, fin: 0x4a4a3a, pattern: 'blotch',
    pull: 0.42, dash: 0.9, prog: 0.32, win: 0.95, desc: 'นักล่าแห่งหนองน้ำ หัวคล้ายงู ดึงแรงและชอบพุ่งหนีเข้าหาพืชน้ำ' },
  { id: 'duk', name: 'ปลาดุก', en: 'Walking catfish', stars: 2, chance: 12, kg: [0.3, 2.6], cm: [25, 55],
    shape: [1.4, 0.72, 1.05], top: 0x3b3936, belly: 0x948b7c, fin: 0x2f2d2b, pattern: 'none', whiskers: true,
    pull: 0.38, dash: 0.75, prog: 0.33, win: 1.0, desc: 'มีหนวดยาวไว้คลำหาอาหารตามพื้นโคลน ตัวลื่น ชอบกินเหยื่อตอนน้ำขุ่น' },
  { id: 'krai', name: 'ปลากราย', en: 'Clown featherback', stars: 3, chance: 7, kg: [1, 5.5], cm: [40, 90],
    shape: [1.6, 1.15, 0.55], top: 0x8d9093, belly: 0xe2ded6, fin: 0x9a9690, pattern: 'dots',
    pull: 0.55, dash: 1.15, prog: 0.28, win: 0.85, desc: 'ลำตัวแบนเหมือนใบมีด มีจุดดำเรียงเป็นแถวที่ท้อง ว่ายด้วยครีบท้องที่พลิ้วยาว' },
  { id: 'tapad', name: 'ปลาตะพัดทอง', en: 'Golden arowana', stars: 4, chance: 2, kg: [2, 6.5], cm: [55, 95], rare: true,
    shape: [1.75, 0.85, 0.7], top: 0xd19a2a, belly: 0xffe7a0, fin: 0xe07b28, pattern: 'scales', glow: true,
    pull: 0.7, dash: 1.4, prog: 0.26, win: 0.75, desc: 'ปลาในตำนานแห่งน้ำตก เกล็ดทองระยิบระยับ ว่ากันว่าใครได้เห็นจะโชคดีไปทั้งปี (มักซ่อนตัวใกล้สายน้ำตก)' },
];
export const byId = Object.fromEntries(SPECIES.map(s => [s.id, s]));

// สุ่มชนิดปลา: ใกล้น้ำตก = โอกาสเจอตัวหายากมากขึ้น · น้ำลึก = ปลาใหญ่ขึ้น
export function rollFish(nearFall, depth) {
  const w = SPECIES.map(s => s.chance * (s.rare ? (nearFall ? 5 : 0.6) : 1) * (s.stars >= 3 ? 0.6 + depth * 0.5 : 1));
  let r = Math.random() * w.reduce((a, b) => a + b, 0);
  let sp = SPECIES[0];
  for (let i = 0; i < w.length; i++) { r -= w[i]; if (r <= 0) { sp = SPECIES[i]; break; } }
  const t = Math.min(1, Math.pow(Math.random(), 1.6) * (0.8 + depth * 0.25));
  return { sp, kg: +(sp.kg[0] + (sp.kg[1] - sp.kg[0]) * t).toFixed(2), cm: Math.round(sp.cm[0] + (sp.cm[1] - sp.cm[0]) * t) };
}

// ---------- สมุดสะสม ----------
const KEY = 'cozyfish.v1';
export function loadDex() {
  try { const d = JSON.parse(localStorage.getItem(KEY)); if (d && d.dex) return d; } catch (e) { /* ไม่มีหรือเสีย */ }
  return { dex: {}, total: 0 };
}
export function saveDex(d) { try { localStorage.setItem(KEY, JSON.stringify(d)); } catch (e) { /* โหมดส่วนตัว */ } }
export function record(d, catchInfo) {
  const e = d.dex[catchInfo.sp.id] || (d.dex[catchInfo.sp.id] = { n: 0, best: 0, cm: 0, first: Date.now() });
  const isNew = e.n === 0, isBest = catchInfo.kg > e.best;
  e.n++; d.total++;
  if (isBest) { e.best = catchInfo.kg; e.cm = catchInfo.cm; }
  saveDex(d);
  return { isNew, isBest: isBest && !isNew };
}

// ---------- โมเดลปลาแต่ละชนิด ----------
const mats = {};
function fishMat(sp) {
  if (mats[sp.id]) return mats[sp.id];
  const m = toon(0xffffff, sp.glow ? { emissive: 0x5a3a00 } : {});
  const pat = { none: 0, stripes: 1, scales: 2, blotch: 3, dots: 4 }[sp.pattern];
  m.onBeforeCompile = sh => {
    sh.uniforms.uTop = { value: new THREE.Color(sp.top) };
    sh.uniforms.uBelly = { value: new THREE.Color(sp.belly) };
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nvarying vec3 vLP;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvLP = position;');
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', `#include <common>
varying vec3 vLP; uniform vec3 uTop; uniform vec3 uBelly;`)
      .replace('#include <color_fragment>', `#include <color_fragment>
{ float up = smoothstep(-0.06, 0.08, vLP.y);
  vec3 c = mix(uBelly, uTop, up);
  ${pat === 1 ? 'c *= 1.0 - 0.22 * step(0.5, fract(vLP.x * 11.0)) * up;' : ''}
  ${pat === 2 ? 'float sc = fract(vLP.x * 28.0 + step(0.5, fract(vLP.y * 14.0)) * 0.5); c *= 0.9 + 0.2 * smoothstep(0.2, 0.0, abs(sc - 0.5) - 0.3);' : ''}
  ${pat === 3 ? 'c *= 1.0 - 0.35 * step(0.6, sin(vLP.x * 20.0) * sin(vLP.y * 26.0 + 1.0)) * up;' : ''}
  ${pat === 4 ? 'vec2 g = fract(vec2(vLP.x * 12.0, vLP.y * 12.0)) - 0.5; c = mix(c, vec3(0.05), step(length(g), 0.18) * step(vLP.y, 0.0) * step(-0.12, vLP.y) * step(vLP.x, 0.2));' : ''}
  diffuseColor.rgb = c; }`);
  };
  mats[sp.id] = m;
  return m;
}

export function makeFish(assets, sp) {
  const f = assets.clone('Fish');
  const fin = toon(sp.fin, { side: THREE.DoubleSide, ...(sp.glow ? { emissive: 0x4a2a00 } : {}) });
  f.traverse(o => {
    if (!o.isMesh) return;
    if (o.material.name === 'Fish') o.material = fishMat(sp);
    else if (o.material.name === 'FishFin') o.material = fin;
  });
  f.scale.set(sp.shape[0], sp.shape[1], sp.shape[2]);
  if (sp.whiskers) {
    const wm = new THREE.MeshBasicMaterial({ color: 0x222222 });
    for (const s of [-1, 1]) for (const k of [0, 1]) {
      const w = new THREE.Mesh(new THREE.CylinderGeometry(0.006, 0.004, 0.22, 3), wm);
      w.position.set(0.5, -0.03 - k * 0.04, s * 0.06);
      w.rotation.set(s * 0.6, 0, -1.1 - k * 0.4);
      f.add(w);
    }
  }
  return f;
}
