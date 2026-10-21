// ชนิดปลา + สมุดสะสม (บันทึกใน localStorage)
import * as THREE from 'three';
import { toon } from './toon.js';

// pull = แรงดึงพื้นฐาน, dash = แรงพุ่งหนี, prog = ความเร็วกรอเข้า, win = เวลากดดึงทัน (วินาที)
export const SPECIES = [
  { id: 'nil', stage: 'falls', price: 60, name: 'ปลานิล', en: 'Nile tilapia', stars: 1, chance: 34, kg: [0.3, 1.6], cm: [16, 38],
    shape: [0.85, 1.35, 1.15], top: 0x55697c, belly: 0xdde3e4, fin: 0x8c6f80, pattern: 'stripes',
    pull: 0.22, dash: 0.45, prog: 0.38, win: 1.1, desc: 'ปลาน้ำจืดคู่บ้าน เลี้ยงง่าย เนื้อขาวนุ่ม มีลายพาดขวางจาง ๆ ตามลำตัว' },
  { id: 'taphian', stage: 'falls', price: 50, name: 'ปลาตะเพียน', en: 'Silver barb', stars: 1, chance: 30, kg: [0.2, 1.1], cm: [14, 32],
    shape: [0.9, 1.4, 0.9], top: 0x8e9473, belly: 0xf3ecd2, fin: 0xe8963a, pattern: 'scales',
    pull: 0.2, dash: 0.5, prog: 0.4, win: 1.0, desc: 'เกล็ดเงินแวววาว ครีบสีส้ม ชอบว่ายเป็นฝูงใกล้ผิวน้ำ ต้นแบบของปลาตะเพียนสานใบลาน' },
  { id: 'chon', stage: 'falls', price: 150, name: 'ปลาช่อน', en: 'Striped snakehead', stars: 2, chance: 15, kg: [0.5, 3.2], cm: [28, 70],
    shape: [1.55, 0.75, 0.95], top: 0x3c4232, belly: 0xa5a98a, fin: 0x4a4a3a, pattern: 'blotch',
    pull: 0.42, dash: 0.9, prog: 0.32, win: 0.95, desc: 'นักล่าแห่งหนองน้ำ หัวคล้ายงู ดึงแรงและชอบพุ่งหนีเข้าหาพืชน้ำ' },
  { id: 'duk', stage: 'falls', price: 70, name: 'ปลาดุก', en: 'Walking catfish', stars: 2, chance: 12, kg: [0.3, 2.6], cm: [25, 55],
    shape: [1.4, 0.72, 1.05], top: 0x3b3936, belly: 0x948b7c, fin: 0x2f2d2b, pattern: 'none', whiskers: true,
    pull: 0.38, dash: 0.75, prog: 0.33, win: 1.0, desc: 'มีหนวดยาวไว้คลำหาอาหารตามพื้นโคลน ตัวลื่น ชอบกินเหยื่อตอนน้ำขุ่น' },
  { id: 'krai', stage: 'falls', price: 220, name: 'ปลากราย', en: 'Clown featherback', stars: 3, chance: 7, kg: [1, 5.5], cm: [40, 90],
    shape: [1.6, 1.15, 0.55], top: 0x8d9093, belly: 0xe2ded6, fin: 0x9a9690, pattern: 'dots',
    pull: 0.55, dash: 1.15, prog: 0.28, win: 0.85, desc: 'ลำตัวแบนเหมือนใบมีด มีจุดดำเรียงเป็นแถวที่ท้อง ว่ายด้วยครีบท้องที่พลิ้วยาว' },
  { id: 'tapad', stage: 'falls', price: 2500, name: 'ปลาตะพัดทอง', en: 'Golden arowana', stars: 4, chance: 2, kg: [2, 6.5], cm: [55, 95], rare: true,
    shape: [1.75, 0.85, 0.7], top: 0xd19a2a, belly: 0xffe7a0, fin: 0xe07b28, pattern: 'scales', glow: true,
    pull: 0.7, dash: 1.4, prog: 0.26, win: 0.75, desc: 'ปลาในตำนานแห่งน้ำตก เกล็ดทองระยิบระยับ ว่ากันว่าใครได้เห็นจะโชคดีไปทั้งปี (มักซ่อนตัวใกล้สายน้ำตก)' },
  // ---------- ลำธารป่าลึก ----------
  { id: 'kha', stage: 'forest', price: 90, name: 'ปลาค้อ', en: 'Stone loach', stars: 1, chance: 30, kg: [0.05, 0.3], cm: [8, 18],
    shape: [1.2, 0.6, 0.8], top: 0x9a8a5a, belly: 0xe8dcc0, fin: 0x8a7a50, pattern: 'blotch',
    pull: 0.15, dash: 0.4, prog: 0.45, win: 1.1, desc: 'ปลาตัวเล็กลายพราง หลบอยู่ตามซอกหินในน้ำไหล ตกง่ายแต่ตัวนิดเดียว' },
  { id: 'khaeyang', stage: 'forest', price: 140, name: 'ปลาแขยง', en: 'Mystus catfish', stars: 1, chance: 28, kg: [0.1, 0.6], cm: [12, 28],
    shape: [1.1, 0.75, 0.9], top: 0x8a7a5a, belly: 0xd8cfb8, fin: 0x6a5a40, pattern: 'none', whiskers: true,
    pull: 0.2, dash: 0.45, prog: 0.4, win: 1.0, desc: 'ปลาหนังตัวเล็ก มีหนวดยาว ทำแกงส้มหรือต้มยำอร่อยมาก ระวังเงี่ยงตำมือ' },
  { id: 'phluang', stage: 'forest', price: 300, name: 'ปลาพลวง', en: 'Soro brook carp', stars: 2, chance: 18, kg: [0.4, 3], cm: [25, 60],
    shape: [1.25, 1.05, 0.95], top: 0x4d5a63, belly: 0xd7d2c4, fin: 0x7a6a5a, pattern: 'scales',
    pull: 0.4, dash: 0.8, prog: 0.32, win: 1.0, desc: 'ปลาแห่งลำธารบนเขา อยู่ได้เฉพาะน้ำใสเย็นจัด ชาวบ้านเชื่อว่าเป็นปลาศักดิ์สิทธิ์ประจำถ้ำ' },
  { id: 'krathing', stage: 'forest', price: 200, name: 'ปลากระทิง', en: 'Tire-track eel', stars: 2, chance: 12, kg: [0.3, 1.8], cm: [30, 70],
    shape: [1.9, 0.55, 0.75], top: 0x5a4632, belly: 0xc9a77a, fin: 0x4a3a2a, pattern: 'dots',
    pull: 0.38, dash: 0.85, prog: 0.32, win: 0.95, desc: 'ปลาตัวยาวคล้ายปลาไหล มีจุดคล้ายดวงตาเรียงตามหลัง ชอบมุดใต้ก้อนหิน' },
  { id: 'wian', stage: 'forest', price: 280, name: 'ปลาเวียน', en: 'Thai mahseer', stars: 3, chance: 9, kg: [0.8, 5], cm: [35, 80],
    shape: [1.3, 1.0, 0.95], top: 0x6a6f55, belly: 0xe6dcc0, fin: 0xc7743a, pattern: 'scales',
    pull: 0.5, dash: 1.0, prog: 0.29, win: 0.9, desc: 'นักว่ายทวนน้ำตัวยง ครีบสีส้มอิฐ แรงดึงดีจนนักตกปลาติดใจ' },
  { id: 'phluangthong', stage: 'forest', price: 3000, name: 'ปลาพลวงทอง', en: 'Golden soro', stars: 4, chance: 2, kg: [2, 7], cm: [55, 95], rare: true,
    shape: [1.4, 1.05, 0.95], top: 0xc99a2a, belly: 0xffe39a, fin: 0xe07b28, pattern: 'scales', glow: true,
    pull: 0.7, dash: 1.35, prog: 0.26, win: 0.75, desc: 'ตำนานแห่งวังน้ำลึกกลางป่า เกล็ดสีทองเหมือนแสงลอดใบไม้ (ซ่อนตัวในวังน้ำลึกปลายลำธาร)' },
  // ---------- หาดหินปะการัง ----------
  { id: 'kerong', stage: 'beach', price: 90, name: 'ปลาข้างเหลือง', en: 'Yellowstripe scad', stars: 1, chance: 30, kg: [0.1, 0.4], cm: [12, 22],
    shape: [1.0, 1.0, 0.85], top: 0x5a7a9a, belly: 0xeaf0f2, fin: 0xf2c94c, pattern: 'stripes',
    pull: 0.2, dash: 0.5, prog: 0.42, win: 1.0, desc: 'ปลาฝูงตัวเล็กมีแถบเหลืองพาดข้างลำตัว ทอดกรอบ ๆ กินกับข้าวสวยร้อน ๆ' },
  { id: 'sai', stage: 'beach', price: 150, name: 'ปลาทราย', en: 'Sillago', stars: 1, chance: 28, kg: [0.1, 0.5], cm: [12, 30],
    shape: [1.3, 0.8, 0.8], top: 0xd8c9a0, belly: 0xfaf4e4, fin: 0xe8d8a0, pattern: 'none',
    pull: 0.2, dash: 0.5, prog: 0.4, win: 1.0, desc: 'ปลาตัวเรียวสีทราย หากินตามแนวคลื่นซัดชายหาด เนื้อหวานนุ่ม' },
  { id: 'kabok', stage: 'beach', price: 110, name: 'ปลากระบอก', en: 'Mullet', stars: 1, chance: 20, kg: [0.3, 1.5], cm: [20, 45],
    shape: [1.3, 0.95, 1.0], top: 0x6f7f88, belly: 0xe8ecec, fin: 0x8a96a0, pattern: 'stripes',
    pull: 0.26, dash: 0.55, prog: 0.38, win: 1.0, desc: 'ชอบกระโดดพ้นน้ำเป็นฝูง พบได้ตามปากแม่น้ำและชายฝั่ง ไข่ปลากระบอกเป็นของดีราคาแพง' },
  { id: 'takhong', stage: 'beach', price: 260, name: 'ปลาตะคองเหลือง', en: 'Yellowfin seabream', stars: 2, chance: 12, kg: [0.3, 2], cm: [20, 45],
    shape: [0.95, 1.3, 0.95], top: 0xa8a8a0, belly: 0xf2efe6, fin: 0xf2c632, pattern: 'scales',
    pull: 0.4, dash: 0.8, prog: 0.32, win: 0.95, desc: 'ปลาครีบเหลืองสดใสตามโขดหินชายฝั่ง ฉลาดและระวังตัว กินเหยื่อแล้วชอบพุ่งเข้าซอกหิน' },
  { id: 'kapongdaeng', stage: 'beach', price: 380, name: 'ปลากะพงแดง', en: 'Red snapper', stars: 3, chance: 8, kg: [1, 6], cm: [35, 75],
    shape: [1.15, 1.15, 1.0], top: 0xc8443a, belly: 0xf6b8a8, fin: 0xd85a4a, pattern: 'scales',
    pull: 0.55, dash: 1.1, prog: 0.28, win: 0.85, desc: 'ปลาสีแดงสดแห่งแนวหิน ราคาดีที่ตลาด นึ่งมะนาวหรือทอดราดน้ำปลาก็อร่อย' },
  { id: 'nokkaeo', stage: 'beach', price: 900, name: 'ปลานกแก้ว', en: 'Parrotfish', stars: 4, chance: 2, kg: [1.5, 5], cm: [40, 70], rare: true,
    shape: [1.1, 1.15, 1.0], top: 0x2fb59a, belly: 0x8fe0f0, fin: 0xff7ab0, pattern: 'scales', glow: true,
    pull: 0.65, dash: 1.3, prog: 0.27, win: 0.8, desc: 'ปลาสีรุ้งแห่งแนวปะการัง ฟันเหมือนจะงอยปากนกแก้ว แทะปะการังจนกลายเป็นทรายขาว (อยู่แถวแนวปะการังไกลฝั่ง)' },
  // ---------- ทะเล (บนเรือ) ----------
  { id: 'thu', stage: 'sea', price: 120, name: 'ปลาทู', en: 'Short mackerel', stars: 1, chance: 32, kg: [0.1, 0.35], cm: [14, 24],
    shape: [1.05, 0.95, 0.95], top: 0x4a6f8a, belly: 0xeef3f5, fin: 0xa8b8c0, pattern: 'stripes',
    pull: 0.25, dash: 0.6, prog: 0.42, win: 1.0, desc: 'ปลาคู่ครัวไทย หน้างอคอหัก กินกับน้ำพริกกะปิผักลวก อร่อยที่สุดในโลก' },
  { id: 'samli', stage: 'sea', price: 180, name: 'ปลาสำลี', en: 'Rainbow runner', stars: 1, chance: 24, kg: [0.5, 3], cm: [30, 70],
    shape: [1.3, 0.9, 0.9], top: 0x5a86b8, belly: 0xeef2f5, fin: 0xf2d24c, pattern: 'none',
    pull: 0.3, dash: 0.7, prog: 0.37, win: 1.0, desc: 'ปลาผิวน้ำว่ายเร็ว มีแถบสีฟ้าเหลืองจาง ๆ ตามลำตัว ทำปลาเค็มแดดเดียวขึ้นชื่อ' },
  { id: 'kapongkhao', stage: 'sea', price: 320, name: 'ปลากะพงขาว', en: 'Barramundi', stars: 2, chance: 18, kg: [1, 6], cm: [35, 80],
    shape: [1.25, 1.05, 0.95], top: 0x7a8a8a, belly: 0xf0f2f0, fin: 0x9aa0a0, pattern: 'scales',
    pull: 0.45, dash: 0.9, prog: 0.3, win: 0.95, desc: 'ปลาเนื้อขาวยอดนิยม ตาสีแดงเรืองในที่มืด นึ่งมะนาวคือที่สุด' },
  { id: 'insee', stage: 'sea', price: 400, name: 'ปลาอินทรี', en: 'Spanish mackerel', stars: 2, chance: 14, kg: [1, 8], cm: [45, 110],
    shape: [1.8, 0.8, 0.8], top: 0x3f6f9a, belly: 0xe6eef2, fin: 0x8aa0b0, pattern: 'dots',
    pull: 0.5, dash: 1.1, prog: 0.3, win: 0.9, desc: 'นักล่าความเร็วสูงแห่งทะเลเปิด ฟันคม ทอดขมิ้นหรือทำปลาอินทรีเค็มก็ขายดี' },
  { id: 'kao', stage: 'sea', price: 480, name: 'ปลาเก๋า', en: 'Grouper', stars: 3, chance: 9, kg: [1, 10], cm: [35, 90],
    shape: [1.15, 1.15, 1.15], top: 0x7a5a3a, belly: 0xd8c0a0, fin: 0x6a4a30, pattern: 'blotch',
    pull: 0.6, dash: 1.1, prog: 0.27, win: 0.85, desc: 'ปลาตัวอ้วนลายจุดน้ำตาล ดึงแรงแล้วมุดเข้ากองหิน ต้องอดทนสุด ๆ' },
  { id: 'krathong', stage: 'sea', price: 250, name: 'ปลากระโทงแทง', en: 'Sailfish', stars: 4, chance: 2, kg: [15, 40], cm: [150, 260], rare: true,
    shape: [2.0, 0.9, 0.7], top: 0x1f4f8a, belly: 0xdfe8f0, fin: 0x2a5fb0, pattern: 'stripes', glow: true,
    pull: 0.78, dash: 1.5, prog: 0.24, win: 0.7, desc: 'ราชาแห่งท้องทะเล ครีบหลังกางใหญ่เหมือนใบเรือ ว่ายเร็วที่สุดในมหาสมุทร (ตามฝูงปลาที่นกนางนวลบินวน)' },
];
export const byId = Object.fromEntries(SPECIES.map(s => [s.id, s]));

export const JUNK = [
  { name: 'รองเท้าแตะเก่า', icon: '🩴' }, { name: 'กิ่งไม้ผุ', icon: '🪵' }, { name: 'ถุงพลาสติก', icon: '🛍️' },
  { name: 'กระป๋องเปล่า', icon: '🥫' }, { name: 'สาหร่ายพันเบ็ด', icon: '🌿' },
];

// สุ่มชนิดปลาในด่าน: ใกล้จุดพิเศษ = โอกาสเจอตัวหายาก · น้ำลึก = ปลาใหญ่ · junk = โอกาสได้ขยะแทนปลา
export function rollFish(stage, nearSpecial, depth, junk = 0.08) {
  if (Math.random() < junk) return { junk: JUNK[Math.floor(Math.random() * JUNK.length)] };
  const pool = SPECIES.filter(s => s.stage === stage);
  const w = pool.map(s => s.chance * (s.rare ? (nearSpecial ? 5 : 0.6) : 1) * (s.stars >= 3 ? 0.6 + Math.min(depth, 3) * 0.5 : 1) * (nearSpecial && s.stars >= 2 ? 1.4 : 1));
  let r = Math.random() * w.reduce((a, b) => a + b, 0);
  let sp = pool[0];
  for (let i = 0; i < w.length; i++) { r -= w[i]; if (r <= 0) { sp = pool[i]; break; } }
  const t = Math.min(1, Math.pow(Math.random(), 1.6) * (0.8 + Math.min(depth, 3) * 0.25));
  return { sp, kg: +(sp.kg[0] + (sp.kg[1] - sp.kg[0]) * t).toFixed(2), cm: Math.round(sp.cm[0] + (sp.cm[1] - sp.cm[0]) * t) };
}
export const fishValue = c => Math.round(c.kg * byId[c.id || c.sp.id].price);

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
