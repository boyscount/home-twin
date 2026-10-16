// สัตว์ในฉาก: หมู ไก่ ปลา แมว หมา — ปั้นใหม่ให้รูปร่างเหมือนจริงขึ้น (ขามีกีบ/อุ้งเท้า หูพับ หางงอ ตา จมูก)
// ใช้วิธีเดียวกับคน: แต่ละท่อนรวมเป็น mesh เดียวระบายสีด้วย vertex color · โครงสร้างที่โค้ดใช้ (head/legs/tail/body) เหมือนเดิม
import * as THREE from 'three';
import { bake, SKIN_MAT, S, C, shade } from './human.js';

const cache = new Map();
const cached = (key, fn) => cache.get(key) || cache.set(key, fn()).get(key);
const mesh = (geo, parent, x = 0, y = 0, z = 0) => { const m = new THREE.Mesh(geo, SKIN_MAT); m.position.set(x, y, z); m.castShadow = true; parent.add(m); return m; };
const pivot = (parent, x, y, z) => { const p = new THREE.Group(); p.position.set(x, y, z); parent.add(p); return p; };
const cone = (r, h, s = 8) => new THREE.ConeGeometry(r, h, s);
const cap = (r, l, s = 12) => new THREE.CapsuleGeometry(r, l, 5, s);
const H = Math.PI / 2;

// ---------------------------------------------------------------- หมู
export function makePig(scale = 1) {
  const pink = '#e6b4a8', dark = '#cc8e82', hoof = '#4a3a33';
  const P = cached('pig', () => ({
    body: bake([
      [cap(0.34, 0.5, 16), pink, 0, 0.56, -0.02, H, 0, 0, 0.92, 1, 0.88],
      [S(0.3, 14, 10), shade(pink, 0.96), 0, 0.54, -0.36, 0, 0, 0, 0.95, 0.92, 0.8], // สะโพก
      [S(0.27, 14, 10), shade(pink, 1.03), 0, 0.5, 0.32, 0, 0, 0, 0.95, 0.9, 0.8], // ไหล่/คอ
      [S(0.2, 10, 8), shade(pink, 0.9), 0, 0.36, 0.0, 0, 0, 0, 1.2, 0.5, 1.9], // ท้องหย่อน
    ]),
    head: bake([
      [S(0.21, 14, 12), pink, 0, 0, 0, 0, 0, 0, 1, 0.92, 1.05],
      [S(0.15, 12, 8), shade(pink, 0.97), 0, -0.07, 0.07, 0, 0, 0, 1.15, 0.8, 1], // แก้ม/เหนียง
      [C(0.095, 0.11, 0.12, 14), dark, 0, -0.04, 0.22, H],
      [C(0.096, 0.096, 0.01, 14), shade(dark, 0.92), 0, -0.04, 0.281, H],
      [S(0.018, 6, 5), '#3a2522', -0.035, -0.04, 0.285], [S(0.018, 6, 5), '#3a2522', 0.035, -0.04, 0.285],
      [S(0.022, 6, 5), '#1b1414', -0.1, 0.06, 0.16], [S(0.022, 6, 5), '#1b1414', 0.1, 0.06, 0.16],
      [cone(0.1, 0.17, 8), dark, -0.12, 0.15, 0.08, -0.9, 0, 0.35, 1, 1, 0.4], // หูพับไปข้างหน้า
      [cone(0.1, 0.17, 8), dark, 0.12, 0.15, 0.08, -0.9, 0, -0.35, 1, 1, 0.4],
    ]),
    leg: bake([[C(0.068, 0.05, 0.3, 8), pink, 0, -0.15, 0], [C(0.052, 0.056, 0.07, 8), hoof, 0, -0.33, 0.005]]),
  }));
  const g = new THREE.Group();
  mesh(P.body, g);
  const head = pivot(g, 0, 0.6, 0.58); mesh(P.head, head);
  const legs = [[-0.2, 0.32], [0.2, 0.32], [-0.2, -0.36], [0.2, -0.36]].map(([x, z]) => { const p = pivot(g, x, 0.37, z); mesh(P.leg, p); return p; });
  const tail = new THREE.Mesh(new THREE.TorusGeometry(0.055, 0.016, 6, 12, Math.PI * 1.7), new THREE.MeshStandardMaterial({ color: '#cf8676', roughness: 0.8 }));
  tail.position.set(0, 0.68, -0.66); g.add(tail);
  g.scale.setScalar(scale);
  return { group: g, head, legs, tail, phase: Math.random() * 10 };
}

// ---------------------------------------------------------------- ไก่
export function makeChicken(color) {
  const P = cached('chk' + color, () => {
    const wing = shade(color, 0.82), tailC = color === '#f2eee4' ? '#d8d2c4' : shade(color, 0.55);
    return {
      body: bake([
        [S(0.15, 14, 10), color, 0, 0.27, 0, 0, 0, 0, 0.88, 0.9, 1.22],
        [S(0.11, 10, 8), shade(color, 1.05), 0, 0.3, 0.11, 0, 0, 0, 0.95, 1.05, 0.9], // อก
        [S(0.1, 10, 8), wing, -0.11, 0.29, -0.02, 0, 0, 0.2, 0.35, 0.8, 1.35], [S(0.1, 10, 8), wing, 0.11, 0.29, -0.02, 0, 0, -0.2, 0.35, 0.8, 1.35],
        [cone(0.07, 0.22, 6), tailC, 0, 0.4, -0.17, -0.7, 0, 0, 1, 1, 0.35], [cone(0.06, 0.2, 6), tailC, -0.04, 0.38, -0.18, -0.9, 0, 0.35, 1, 1, 0.35], [cone(0.06, 0.2, 6), tailC, 0.04, 0.38, -0.18, -0.9, 0, -0.35, 1, 1, 0.35],
        [C(0.011, 0.01, 0.16, 5), '#e0a030', -0.045, 0.09, 0.01], [C(0.011, 0.01, 0.16, 5), '#e0a030', 0.045, 0.09, 0.01],
        [new THREE.BoxGeometry(0.05, 0.008, 0.07), '#e0a030', -0.045, 0.006, 0.03], [new THREE.BoxGeometry(0.05, 0.008, 0.07), '#e0a030', 0.045, 0.006, 0.03],
      ]),
      head: bake([
        [S(0.062, 10, 8), color, 0, 0, 0],
        [S(0.022, 6, 5), '#d62828', 0, 0.06, 0.02], [S(0.025, 6, 5), '#d62828', 0, 0.065, -0.01], [S(0.02, 6, 5), '#d62828', 0, 0.058, -0.04],
        [S(0.02, 6, 5), '#c22020', 0, -0.05, 0.05, 0, 0, 0, 0.8, 1.3, 0.8], // เหนียง
        [cone(0.022, 0.06, 6), '#e9a23b', 0, -0.008, 0.075, H],
        [S(0.011, 5, 4), '#1a1a1a', -0.04, 0.015, 0.04], [S(0.011, 5, 4), '#1a1a1a', 0.04, 0.015, 0.04],
      ]),
    };
  });
  const g = new THREE.Group();
  mesh(P.body, g);
  const head = pivot(g, 0, 0.42, 0.14); mesh(P.head, head);
  return { group: g, head };
}

// ---------------------------------------------------------------- ปลา (ปลานิล/ปลาคาร์ป)
export function makeFish(color) {
  const P = cached('fish' + color, () => ({
    body: bake([
      [S(0.12, 12, 10), color, 0, 0, 0, 0, 0, 0, 0.42, 0.72, 1.35],
      [S(0.1, 10, 8), shade(color, 1.35), 0, -0.03, 0.01, 0, 0, 0, 0.36, 0.45, 1.15], // ท้องสีอ่อน
      [cone(0.07, 0.1, 4), shade(color, 0.8), 0, 0.09, -0.02, 0, 0, 0, 0.12, 1, 1.4], // ครีบหลัง
      [S(0.012, 5, 4), '#111', -0.045, 0.02, 0.1], [S(0.012, 5, 4), '#111', 0.045, 0.02, 0.1],
    ]),
    tail: bake([[cone(0.085, 0.13, 4), shade(color, 0.85), 0, 0, -0.06, -H, 0, 0, 0.22, 1, 1]]),
  }));
  const g = new THREE.Group();
  mesh(P.body, g);
  const tail = pivot(g, 0, 0, -0.15); mesh(P.tail, tail);
  return { group: g, tail };
}

// ---------------------------------------------------------------- แมว
export function makeCat(o) {
  const col = o.color, point = o.point || o.color, eye = o.eye || '#c8d64a';
  const P = cached('cat' + JSON.stringify(o), () => ({
    body: bake([
      [cap(0.085, 0.2, 12), col, 0, 0.245, 0, H, 0, 0, 0.82, 1, 0.92],
      [S(0.085, 10, 8), shade(col, 1.04), 0, 0.25, 0.1, 0, 0, 0, 0.85, 0.95, 0.9], // อก
      ...(o.patch ? [[S(0.09, 10, 8), o.patch, 0.03, 0.29, -0.05, 0, 0, 0, 0.85, 0.45, 1.25]] : []),
    ]),
    head: bake([
      [S(0.072, 14, 10), col, 0, 0, 0, 0, 0, 0, 1.08, 0.95, 1],
      [S(0.028, 8, 6), point, -0.022, -0.028, 0.058], [S(0.028, 8, 6), point, 0.022, -0.028, 0.058], // แก้มหนวด
      [S(0.011, 5, 4), '#d98a8a', 0, -0.016, 0.078],
      [S(0.016, 8, 6), eye, -0.031, 0.014, 0.057], [S(0.016, 8, 6), eye, 0.031, 0.014, 0.057],
      [S(0.008, 5, 4), '#111', -0.031, 0.014, 0.071, 0, 0, 0, 0.5, 1.2, 0.5], [S(0.008, 5, 4), '#111', 0.031, 0.014, 0.071, 0, 0, 0, 0.5, 1.2, 0.5],
      [cone(0.034, 0.07, 4), point, -0.045, 0.07, -0.005, 0, 0, 0.3, 1, 1, 0.55], [cone(0.034, 0.07, 4), point, 0.045, 0.07, -0.005, 0, 0, -0.3, 1, 1, 0.55],
    ]),
    leg: bake([[C(0.022, 0.018, 0.17, 6), point === col ? col : shade(point, 1.1), 0, -0.085, 0], [S(0.022, 6, 5), point, 0, -0.17, 0.008, 0, 0, 0, 1, 0.6, 1.3]]),
    tail: bake([[new THREE.TubeGeometry(new THREE.CatmullRomCurve3([new THREE.Vector3(0, 0, 0), new THREE.Vector3(0, 0.08, -0.1), new THREE.Vector3(0, 0.2, -0.13), new THREE.Vector3(0, 0.28, -0.08)]), 10, 0.016, 6), point]]),
  }));
  const g = new THREE.Group();
  const body = new THREE.Group(); g.add(body); mesh(P.body, body);
  const head = pivot(body, 0, 0.33, 0.2); mesh(P.head, head);
  const legs = [[-0.045, 0.1], [0.045, 0.1], [-0.045, -0.11], [0.045, -0.11]].map(([x, z]) => { const p = pivot(body, x, 0.18, z); mesh(P.leg, p); return p; });
  const tail = pivot(body, 0, 0.27, -0.19); mesh(P.tail, tail);
  return { group: g, body, head, legs, tail, phase: Math.random() * 10 };
}

// ---------------------------------------------------------------- หมา (หมาไทยสีดำ คิ้ว/ปากสีน้ำตาล — "เจ้าดำ")
export function makeDog() {
  const black = '#2a2624', tan = '#a8743e';
  const P = cached('dog', () => ({
    body: bake([
      [cap(0.14, 0.36, 14), black, 0, 0.5, -0.02, H, 0, 0, 0.82, 1, 0.92],
      [S(0.15, 12, 10), black, 0, 0.53, 0.2, 0, 0, 0, 0.82, 0.98, 0.9], // อก
      [S(0.09, 10, 8), tan, 0, 0.47, 0.3, 0, 0, 0, 0.65, 0.9, 0.5], // อกสีน้ำตาล
      [C(0.075, 0.09, 0.2, 10), black, 0, 0.66, 0.29, 0.7], // คอ
    ]),
    head: bake([
      [S(0.1, 14, 10), black, 0, 0, 0, 0, 0, 0, 0.95, 0.92, 1.05],
      [C(0.042, 0.055, 0.14, 10), black, 0, -0.035, 0.12, H],
      [C(0.04, 0.05, 0.08, 10), tan, 0, -0.05, 0.14, H, 0, 0, 1, 1, 0.7],
      [S(0.022, 8, 6), '#0d0b0b', 0, -0.025, 0.195],
      [S(0.014, 6, 5), '#160f0c', -0.04, 0.025, 0.083], [S(0.014, 6, 5), '#160f0c', 0.04, 0.025, 0.083],
      [S(0.012, 5, 4), tan, -0.04, 0.05, 0.08], [S(0.012, 5, 4), tan, 0.04, 0.05, 0.08], // จุดคิ้ว
      [cone(0.045, 0.11, 4), black, -0.055, 0.1, -0.01, -0.1, 0, 0.25, 1, 1, 0.5], [cone(0.045, 0.11, 4), black, 0.055, 0.1, -0.01, -0.1, 0, -0.25, 1, 1, 0.5],
    ]),
    leg: bake([[C(0.036, 0.026, 0.33, 7), black, 0, -0.165, 0], [S(0.03, 7, 5), tan, 0, -0.335, 0.012, 0, 0, 0, 1, 0.6, 1.3]]),
    tail: bake([[new THREE.TubeGeometry(new THREE.CatmullRomCurve3([new THREE.Vector3(0, 0, 0), new THREE.Vector3(0, 0.1, -0.08), new THREE.Vector3(0, 0.22, -0.04), new THREE.Vector3(0, 0.26, 0.06)]), 10, 0.022, 6), black]]),
  }));
  const g = new THREE.Group();
  mesh(P.body, g);
  const head = pivot(g, 0, 0.74, 0.38); mesh(P.head, head);
  const legs = [[-0.08, 0.2], [0.08, 0.2], [-0.08, -0.22], [0.08, -0.22]].map(([x, z]) => { const p = pivot(g, x, 0.35, z); mesh(P.leg, p); return p; });
  const tail = pivot(g, 0, 0.55, -0.33); mesh(P.tail, tail);
  return { group: g, head, legs, tail, phase: 0 };
}
