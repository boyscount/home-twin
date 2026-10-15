// บ้านสวน 3D — สร้างทุกอย่างแบบ procedural ด้วย Three.js (ไม่ต้องโหลดโมเดลภายนอก)
// พิกัด: x = ตะวันออก, z = ทิศใต้ (ถนนอยู่ด้านหน้า z+), บ้านอยู่ราว ๆ จุด (0,0,0) ซึ่งเป็นศูนย์กลางเรดาร์
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { Sky } from 'three/addons/objects/Sky.js';
import { CSS2DRenderer, CSS2DObject } from 'three/addons/renderers/CSS2DRenderer.js';
import { bus } from './bus.js';
import { WeatherFX } from './weatherfx.js';

const rand = (a, b) => a + Math.random() * (b - a);
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const lerp = (a, b, t) => a + (b - a) * t;

// ---------------------------------------------------------------- textures
function canvasTex(w, h, draw, repeat) {
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  if (repeat) t.repeat.set(repeat[0], repeat[1]);
  t.anisotropy = 8;
  return t;
}
function noise(ctx, w, h, base, amp, n = 6000, size = 2) {
  ctx.fillStyle = base; ctx.fillRect(0, 0, w, h);
  for (let i = 0; i < n; i++) {
    const v = Math.random() * amp - amp / 2;
    ctx.fillStyle = v > 0 ? `rgba(255,255,255,${v})` : `rgba(0,0,0,${-v})`;
    ctx.fillRect(Math.random() * w, Math.random() * h, size, size);
  }
}
const TEX = {};
function makeTextures() {
  TEX.grass = canvasTex(256, 256, (c, w, h) => {
    noise(c, w, h, '#4f8a35', 0.25, 9000, 2);
    for (let i = 0; i < 900; i++) {
      c.strokeStyle = `rgba(${rand(40, 110)},${rand(120, 170)},${rand(30, 60)},0.6)`;
      const x = rand(0, w), y = rand(0, h); c.beginPath(); c.moveTo(x, y); c.lineTo(x + rand(-2, 2), y - rand(3, 7)); c.stroke();
    }
  }, [40, 40]);
  TEX.rice = canvasTex(256, 256, (c, w, h) => {
    noise(c, w, h, '#86b84c', 0.18, 7000, 2);
    for (let y = 0; y < h; y += 8) { c.fillStyle = 'rgba(40,80,20,0.18)'; c.fillRect(0, y, w, 2); }
    for (let i = 0; i < 1500; i++) { c.fillStyle = `rgba(190,220,110,${rand(0.1, 0.4)})`; c.fillRect(rand(0, w), rand(0, h), 1, 3); }
  }, [60, 60]);
  TEX.litter = canvasTex(256, 256, (c, w, h) => {
    noise(c, w, h, '#4a4a2a', 0.3, 9000, 3);
    for (let i = 0; i < 500; i++) { c.fillStyle = `rgba(${rand(110, 160)},${rand(70, 100)},30,0.5)`; c.beginPath(); c.ellipse(rand(0, w), rand(0, h), 3, 1.5, rand(0, 3), 0, 7); c.fill(); }
  }, [30, 60]);
  TEX.concrete = canvasTex(256, 256, (c, w, h) => noise(c, w, h, '#bdbab2', 0.12, 12000, 2), [6, 6]);
  TEX.asphalt = canvasTex(256, 256, (c, w, h) => noise(c, w, h, '#3d3f42', 0.2, 14000, 2), [60, 2]);
  TEX.wood = canvasTex(256, 256, (c, w, h) => {
    c.fillStyle = '#7a3f22'; c.fillRect(0, 0, w, h);
    for (let x = 0; x < w; x += 16) {
      c.fillStyle = `hsl(${rand(14, 24)},${rand(45, 60)}%,${rand(24, 34)}%)`; c.fillRect(x, 0, 15, h);
      for (let k = 0; k < 6; k++) { c.strokeStyle = 'rgba(0,0,0,0.15)'; c.beginPath(); const gx = x + rand(1, 14); c.moveTo(gx, 0); c.bezierCurveTo(gx + 2, h / 3, gx - 2, h / 2, gx + 1, h); c.stroke(); }
      c.fillStyle = 'rgba(0,0,0,0.5)'; c.fillRect(x + 15, 0, 1, h);
    }
  });
  TEX.deck = canvasTex(256, 256, (c, w, h) => {
    for (let y = 0; y < h; y += 16) {
      c.fillStyle = `hsl(${rand(18, 26)},${rand(45, 55)}%,${rand(36, 44)}%)`; c.fillRect(0, y, w, 15);
      c.fillStyle = 'rgba(0,0,0,0.45)'; c.fillRect(0, y + 15, w, 1);
    }
  }, [3, 2]);
  TEX.roof = canvasTex(128, 128, (c, w, h) => {
    c.fillStyle = '#4b2e24'; c.fillRect(0, 0, w, h);
    for (let x = 0; x < w; x += 16) { c.fillStyle = 'rgba(255,255,255,0.08)'; c.fillRect(x, 0, 3, h); c.fillStyle = 'rgba(0,0,0,0.25)'; c.fillRect(x + 3, 0, 2, h); }
  }, [8, 1]);
  TEX.brick = canvasTex(128, 64, (c, w, h) => {
    c.fillStyle = '#9c9c94'; c.fillRect(0, 0, w, h);
    for (let y = 0; y < h; y += 16) for (let x = (y / 16) % 2 ? -16 : 0; x < w; x += 32) {
      c.fillStyle = `hsl(20,${rand(10, 25)}%,${rand(55, 65)}%)`; c.fillRect(x + 1, y + 1, 30, 14);
    }
  }, [4, 1]);
  TEX.bark = canvasTex(64, 256, (c, w, h) => {
    noise(c, w, h, '#7d7568', 0.25, 3000, 2);
    for (let i = 0; i < 40; i++) { c.fillStyle = 'rgba(40,30,20,0.25)'; c.fillRect(0, rand(0, h), w, 1); }
  }, [1, 2]);
  // water normal map
  const N = 128, hgt = new Float32Array(N * N);
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
    hgt[y * N + x] = Math.sin(x / N * Math.PI * 6) * 0.5 + Math.sin((x + y) / N * Math.PI * 10) * 0.3 + Math.sin(y / N * Math.PI * 8 + x / N * 4) * 0.4;
  }
  TEX.waterN = canvasTex(N, N, (c) => {
    const img = c.createImageData(N, N);
    for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
      const dx = hgt[y * N + (x + 1) % N] - hgt[y * N + (x - 1 + N) % N];
      const dy = hgt[((y + 1) % N) * N + x] - hgt[((y - 1 + N) % N) * N + x];
      const i = (y * N + x) * 4;
      img.data[i] = 128 + dx * 60; img.data[i + 1] = 128 + dy * 60; img.data[i + 2] = 255; img.data[i + 3] = 255;
    }
    c.putImageData(img, 0, 0);
  }, [3, 3]);
  TEX.waterN.colorSpace = THREE.NoColorSpace;
}

// ---------------------------------------------------------------- materials
const M = {};
function makeMaterials() {
  const std = (o) => new THREE.MeshStandardMaterial(o);
  M.grass = std({ map: TEX.grass, roughness: 1 });
  M.rice = std({ map: TEX.rice, roughness: 1 });
  M.litter = std({ map: TEX.litter, roughness: 1 });
  M.concrete = std({ map: TEX.concrete, roughness: 0.9 });
  M.asphalt = std({ map: TEX.asphalt, roughness: 0.95 });
  M.wood = std({ map: TEX.wood, roughness: 0.7 });
  M.deck = std({ map: TEX.deck, roughness: 0.6 });
  M.roof = std({ map: TEX.roof, roughness: 0.5, metalness: 0.4, side: THREE.DoubleSide });
  M.wall = std({ color: '#9fa19e', map: TEX.concrete, roughness: 0.85 });
  M.wallDark = std({ color: '#5d3a2a', roughness: 0.8 });
  M.frame = std({ color: '#1c1c1c', roughness: 0.5, metalness: 0.6 });
  M.glass = new THREE.MeshPhysicalMaterial({ color: '#2b3a36', roughness: 0.05, metalness: 0.2, transparent: true, opacity: 0.32, envMapIntensity: 1.5 });
  M.warm = std({ color: '#ffd9a0', emissive: '#ffb45c', emissiveIntensity: 1.5 });
  M.white = std({ color: '#f2f2ee', roughness: 0.6 });
  M.pipe = std({ color: '#f4f4f0', roughness: 0.35 });
  M.leaf = std({ color: '#2f6b2a', roughness: 0.9 });
  M.leafDark = std({ color: '#244f22', roughness: 0.9 });
  M.leafLight = std({ color: '#5c9a3a', roughness: 0.9, side: THREE.DoubleSide });
  M.trunk = std({ color: '#5a4636', roughness: 1 });
  M.bark = std({ map: TEX.bark, roughness: 1 });
  M.brick = std({ map: TEX.brick, roughness: 0.95 });
  M.metal = std({ color: '#9aa3a7', roughness: 0.4, metalness: 0.8 });
  M.water = new THREE.MeshPhysicalMaterial({ color: '#2e5f58', roughness: 0.08, metalness: 0.1, transparent: true, opacity: 0.78, normalMap: TEX.waterN, normalScale: new THREE.Vector2(0.4, 0.4) });
  M.mud = std({ color: '#3b3324', roughness: 1 });
  M.pig = std({ color: '#efb6a6', roughness: 0.8 });
  M.pigDark = std({ color: '#d4877a', roughness: 0.8 });
  M.black = std({ color: '#111', roughness: 0.4 });
  M.feed = std({ color: '#a3773d', roughness: 1 });
  M.net = std({ color: '#d8e0dc', transparent: true, opacity: 0.18, side: THREE.DoubleSide, roughness: 1, depthWrite: false });
  M.tank = std({ color: '#2f6fb0', roughness: 0.5 });
  M.ledOff = std({ color: '#333', emissive: '#000' });
  M.ledOn = std({ color: '#3f3', emissive: '#3f3', emissiveIntensity: 2 });
}

function box(w, h, d, mat, x = 0, y = 0, z = 0, parent) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
  m.position.set(x, y, z); m.castShadow = true; m.receiveShadow = true;
  if (parent) parent.add(m);
  return m;
}
function cyl(rt, rb, h, mat, x = 0, y = 0, z = 0, parent, seg = 12) {
  const m = new THREE.Mesh(new THREE.CylinderGeometry(rt, rb, h, seg), mat);
  m.position.set(x, y, z); m.castShadow = true; m.receiveShadow = true;
  if (parent) parent.add(m);
  return m;
}
function sph(r, mat, x = 0, y = 0, z = 0, parent, seg = 12) {
  const m = new THREE.Mesh(new THREE.SphereGeometry(r, seg, Math.max(6, seg * 0.7 | 0)), mat);
  m.position.set(x, y, z); m.castShadow = true;
  if (parent) parent.add(m);
  return m;
}

// ---------------------------------------------------------------- characters
function makeHuman(o = {}) {
  const skin = new THREE.MeshStandardMaterial({ color: o.skin || '#c68e62', roughness: 0.7 });
  const shirt = new THREE.MeshStandardMaterial({ color: o.shirt || '#3b6ea8', roughness: 0.9 });
  const pants = new THREE.MeshStandardMaterial({ color: o.pants || '#2b2b33', roughness: 0.9 });
  const hairM = new THREE.MeshStandardMaterial({ color: o.hair || '#151210', roughness: 0.8 });
  const g = new THREE.Group();
  const torso = new THREE.Mesh(new THREE.CapsuleGeometry(0.19, 0.42, 4, 10), shirt);
  torso.scale.set(1.15, 1, 0.75); torso.position.y = 1.27; torso.castShadow = true; g.add(torso);
  cyl(0.06, 0.07, 0.12, skin, 0, 1.56, 0, g, 8);
  const head = new THREE.Group(); head.position.y = 1.7; g.add(head);
  const skull = sph(0.135, skin, 0, 0, 0, head, 16); skull.scale.set(0.95, 1.1, 1);
  sph(0.018, M.black, -0.045, 0.02, 0.122, head, 6);
  sph(0.018, M.black, 0.045, 0.02, 0.122, head, 6);
  const nose = sph(0.022, skin, 0, -0.02, 0.135, head, 6); nose.scale.z = 1.4;
  const mouth = box(0.06, 0.01, 0.01, new THREE.MeshStandardMaterial({ color: '#6b2f2a' }), 0, -0.07, 0.125, head);
  mouth.castShadow = false;
  if (o.hat === 'straw') {
    const hat = cyl(0.04, 0.34, 0.16, new THREE.MeshStandardMaterial({ color: '#d9c27a', roughness: 1 }), 0, 0.14, 0, head, 16);
    hat.rotation.x = -0.05;
  } else if (o.hat === 'cap') {
    const cap = sph(0.145, new THREE.MeshStandardMaterial({ color: o.hatColor || '#c0392b' }), 0, 0.04, 0, head, 12);
    cap.scale.set(1, 0.7, 1);
    box(0.2, 0.02, 0.14, cap.material, 0, 0.04, 0.17, head);
  } else if (o.hat === 'helmet') {
    const hm = sph(0.16, new THREE.MeshStandardMaterial({ color: o.hatColor || '#222', metalness: 0.3, roughness: 0.3 }), 0, 0.04, -0.01, head, 14);
    hm.scale.set(1, 0.95, 1.05);
  } else {
    const hair = sph(0.142, hairM, 0, 0.035, -0.012, head, 14); hair.scale.set(1, 0.9, 1);
    if (o.longHair) { const back = box(0.26, 0.3, 0.08, hairM, 0, -0.12, -0.1, head); back.castShadow = true; }
  }
  if (o.glasses) { box(0.17, 0.035, 0.01, M.black, 0, 0.02, 0.135, head); }
  const limb = (x, y, len, r, mat, handMat) => {
    const pivot = new THREE.Group(); pivot.position.set(x, y, 0); g.add(pivot);
    const m = cyl(r, r * 0.85, len, mat, 0, -len / 2, 0, pivot, 8);
    if (handMat) sph(r * 1.1, handMat, 0, -len, 0, pivot, 8);
    pivot.userData.mesh = m;
    return pivot;
  };
  const legL = limb(-0.1, 0.98, 0.92, 0.075, pants, pants);
  const legR = limb(0.1, 0.98, 0.92, 0.075, pants, pants);
  const armL = limb(-0.29, 1.5, 0.62, 0.055, shirt, skin);
  const armR = limb(0.29, 1.5, 0.62, 0.055, shirt, skin);
  g.traverse(m => { if (m.isMesh) m.castShadow = true; });
  return { group: g, legL, legR, armL, armR, head, phase: 0 };
}
function animateWalk(h, dt, speed) {
  h.phase += dt * speed * 5.2;
  const s = Math.sin(h.phase) * 0.6 * Math.min(1, speed);
  h.legL.rotation.x = s; h.legR.rotation.x = -s;
  if (!h.holding) { h.armL.rotation.x = -s * 0.8; h.armR.rotation.x = s * 0.8; }
  h.group.position.y = (h.baseY || 0) + Math.abs(Math.cos(h.phase)) * 0.03;
}
function animateIdle(h, dt) {
  h.phase += dt;
  if (h.sitting) { // นั่งเก้าอี้ (ตอนกินหมูกะทะ)
    h.legL.rotation.x = h.legR.rotation.x = -1.45;
    h.group.position.y = (h.baseY || 0) - 0.47 * h.group.scale.y;
    if (h.eating) {
      const k = Math.sin(h.phase * 1.6 + (h.eatOffset || 0));
      h.armR.rotation.x = -1.0 + k * 0.45; h.armL.rotation.x = -0.5;
      h.head.rotation.x = 0.15 + Math.max(0, k) * 0.15;
    }
    h.head.rotation.y = Math.sin(h.phase * 0.35 + (h.eatOffset || 0)) * 0.6;
    return;
  }
  h.head.rotation.x *= 0.9;
  h.legL.rotation.x *= 0.85; h.legR.rotation.x *= 0.85;
  if (!h.holding) { h.armL.rotation.x *= 0.85; h.armR.rotation.x *= 0.85; }
  h.group.position.y = h.baseY || 0;
  h.head.rotation.y = Math.sin(h.phase * 0.5) * 0.35;
}

// เดินตามจุด waypoint
class Walker {
  constructor(h, speed = 1.3) { this.h = h; this.speed = speed; this.path = []; this.cb = null; this.wait = 0; }
  // locked = ช่วงกิจกรรมพิเศษ (เช่น กินหมูกะทะ) — คำสั่งจากกิจวัตรปกติจะถูกเมิน ยกเว้น force
  go(points, cb, force = false) {
    if (this.locked && !force) return;
    this.path = points.map(p => new THREE.Vector3(p[0], p[1] || 0, p[2])); this.cb = cb;
  }
  get moving() { return this.path.length > 0; }
  update(dt) {
    const g = this.h.group;
    if (this.wait > 0) { this.wait -= dt; animateIdle(this.h, dt); return; }
    if (!this.path.length) { animateIdle(this.h, dt); return; }
    const t = this.path[0];
    const dx = t.x - g.position.x, dz = t.z - g.position.z;
    const d = Math.hypot(dx, dz);
    this.h.baseY = lerp(this.h.baseY || 0, t.y, 0.1);
    if (d < 0.08) {
      this.path.shift();
      if (!this.path.length && this.cb) { const cb = this.cb; this.cb = null; cb(); }
      return;
    }
    const step = Math.min(d, this.speed * dt);
    g.position.x += dx / d * step; g.position.z += dz / d * step;
    const target = Math.atan2(dx, dz);
    let diff = target - g.rotation.y; diff = Math.atan2(Math.sin(diff), Math.cos(diff));
    g.rotation.y += diff * Math.min(1, dt * 8);
    this.h.head.rotation.y *= 0.9;
    animateWalk(this.h, dt, this.speed);
  }
}

function makePig(scale = 1) {
  const g = new THREE.Group();
  const body = sph(0.5, M.pig, 0, 0.55, 0, g, 16); body.scale.set(0.8, 0.75, 1.35);
  const head = new THREE.Group(); head.position.set(0, 0.62, 0.62); g.add(head);
  sph(0.3, M.pig, 0, 0, 0, head, 14);
  const snout = cyl(0.12, 0.13, 0.12, M.pigDark, 0, -0.04, 0.27, head, 12); snout.rotation.x = Math.PI / 2;
  sph(0.02, M.black, -0.04, -0.03, 0.34, head, 5); sph(0.02, M.black, 0.04, -0.03, 0.34, head, 5);
  sph(0.03, M.black, -0.12, 0.09, 0.22, head, 6); sph(0.03, M.black, 0.12, 0.09, 0.22, head, 6);
  const earL = new THREE.Mesh(new THREE.ConeGeometry(0.09, 0.18, 6), M.pigDark); earL.position.set(-0.16, 0.24, 0.05); earL.rotation.z = 0.5; head.add(earL);
  const earR = earL.clone(); earR.position.x = 0.16; earR.rotation.z = -0.5; head.add(earR);
  const legs = [];
  for (const [x, z] of [[-0.22, 0.38], [0.22, 0.38], [-0.22, -0.38], [0.22, -0.38]]) {
    const p = new THREE.Group(); p.position.set(x, 0.38, z); g.add(p);
    cyl(0.07, 0.06, 0.38, M.pig, 0, -0.19, 0, p, 8); legs.push(p);
  }
  const tail = new THREE.Mesh(new THREE.TorusGeometry(0.06, 0.015, 6, 12, Math.PI * 1.6), M.pigDark);
  tail.position.set(0, 0.7, -0.68); g.add(tail);
  g.scale.setScalar(scale);
  g.traverse(m => { if (m.isMesh) m.castShadow = true; });
  return { group: g, head, legs, tail, phase: Math.random() * 10 };
}

function makeChicken(color) {
  const g = new THREE.Group();
  const mat = new THREE.MeshStandardMaterial({ color, roughness: 0.9 });
  const body = sph(0.16, mat, 0, 0.26, 0, g, 12); body.scale.set(0.85, 0.85, 1.2);
  const tail = new THREE.Mesh(new THREE.ConeGeometry(0.08, 0.2, 6), mat); tail.position.set(0, 0.36, -0.2); tail.rotation.x = -0.8; g.add(tail);
  const head = new THREE.Group(); head.position.set(0, 0.42, 0.14); g.add(head);
  sph(0.075, mat, 0, 0, 0, head, 10);
  const comb = box(0.02, 0.06, 0.08, new THREE.MeshStandardMaterial({ color: '#d62828' }), 0, 0.07, 0, head);
  const beak = new THREE.Mesh(new THREE.ConeGeometry(0.025, 0.07, 5), new THREE.MeshStandardMaterial({ color: '#e9a23b' })); beak.rotation.x = Math.PI / 2; beak.position.set(0, -0.01, 0.09); head.add(beak);
  sph(0.012, M.black, -0.045, 0.02, 0.05, head, 4); sph(0.012, M.black, 0.045, 0.02, 0.05, head, 4);
  const legM = new THREE.MeshStandardMaterial({ color: '#e0a030' });
  cyl(0.012, 0.012, 0.16, legM, -0.05, 0.08, 0, g, 4); cyl(0.012, 0.012, 0.16, legM, 0.05, 0.08, 0, g, 4);
  g.traverse(m => { if (m.isMesh) m.castShadow = true; });
  void comb;
  return { group: g, head };
}

function makeFish(color) {
  const g = new THREE.Group();
  const mat = new THREE.MeshStandardMaterial({ color, roughness: 0.4, metalness: 0.2 });
  const b = sph(0.12, mat, 0, 0, 0, g, 10); b.scale.set(0.45, 0.7, 1.4);
  const tail = new THREE.Mesh(new THREE.ConeGeometry(0.08, 0.14, 4), mat); tail.rotation.x = -Math.PI / 2; tail.position.z = -0.22; tail.scale.x = 0.25; g.add(tail);
  return { group: g, tail };
}

// แมว: สีลำตัว, สีจุด/ลาย (ถ้ามี), สีปลายหู-หาง (วิเชียรมาศ)
function makeCat(o) {
  const g = new THREE.Group();
  const mat = new THREE.MeshStandardMaterial({ color: o.color, roughness: 0.9 });
  const point = o.point ? new THREE.MeshStandardMaterial({ color: o.point, roughness: 0.9 }) : mat;
  const eyeM = new THREE.MeshStandardMaterial({ color: o.eye || '#c8d64a', emissive: o.eye || '#c8d64a', emissiveIntensity: 0.25 });
  const body = new THREE.Group(); g.add(body);
  const torso = sph(0.13, mat, 0, 0.24, 0, body, 12); torso.scale.set(0.8, 0.8, 1.7);
  if (o.patch) { const p = sph(0.1, new THREE.MeshStandardMaterial({ color: o.patch }), 0.05, 0.3, -0.06, body, 8); p.scale.set(0.9, 0.5, 1.2); }
  const head = new THREE.Group(); head.position.set(0, 0.33, 0.22); body.add(head);
  sph(0.095, mat, 0, 0, 0, head, 12);
  const muzzle = sph(0.045, point, 0, -0.025, 0.08, head, 8); muzzle.scale.set(1.2, 0.8, 0.8);
  sph(0.016, eyeM, -0.035, 0.02, 0.083, head, 6);
  sph(0.016, eyeM, 0.035, 0.02, 0.083, head, 6);
  sph(0.012, new THREE.MeshStandardMaterial({ color: '#d98a8a' }), 0, -0.01, 0.12, head, 5);
  for (const sx of [-1, 1]) { const ear = new THREE.Mesh(new THREE.ConeGeometry(0.035, 0.07, 4), point); ear.position.set(sx * 0.055, 0.085, 0); ear.rotation.z = -sx * 0.25; head.add(ear); }
  const legs = [];
  for (const [x, z] of [[-0.05, 0.12], [0.05, 0.12], [-0.05, -0.12], [0.05, -0.12]]) {
    const p = new THREE.Group(); p.position.set(x, 0.18, z); body.add(p); cyl(0.022, 0.02, 0.18, point, 0, -0.09, 0, p, 6); legs.push(p);
  }
  const tail = new THREE.Group(); tail.position.set(0, 0.28, -0.2); body.add(tail);
  const tcurve = new THREE.CatmullRomCurve3([new THREE.Vector3(0, 0, 0), new THREE.Vector3(0, 0.12, -0.1), new THREE.Vector3(0, 0.26, -0.08)]);
  tail.add(new THREE.Mesh(new THREE.TubeGeometry(tcurve, 8, 0.018, 5), point));
  g.traverse(m => { if (m.isMesh) m.castShadow = true; });
  return { group: g, body, head, legs, tail, phase: Math.random() * 10 };
}

const CATS = [
  { name: 'ส้ม', color: '#e08a3c', eye: '#e8c547' },
  { name: 'ดำ', color: '#1d1d1f', eye: '#e8d34a' },
  { name: 'ขาว', color: '#f2f0ea', eye: '#6fb7e8' },
  { name: 'สามสี', color: '#f2efe6', patch: '#d4823a', point: '#2b2522' },
  { name: 'สลิ่ม', color: '#8a8580', patch: '#55504b' },
  { name: 'วิเชียรมาศ', color: '#efe3cf', point: '#4a3428', eye: '#5aa7e6' },
];

function makeDog() {
  const g = new THREE.Group();
  const mat = new THREE.MeshStandardMaterial({ color: '#b07a3e', roughness: 0.9 });
  const body = sph(0.25, mat, 0, 0.45, 0, g, 12); body.scale.set(0.75, 0.75, 1.5);
  const head = new THREE.Group(); head.position.set(0, 0.65, 0.4); g.add(head);
  sph(0.15, mat, 0, 0, 0, head, 10);
  const snout = box(0.1, 0.08, 0.14, mat, 0, -0.04, 0.14, head);
  sph(0.025, M.black, 0, -0.02, 0.22, head, 5);
  const ear = new THREE.Mesh(new THREE.ConeGeometry(0.05, 0.12, 4), mat); ear.position.set(-0.08, 0.15, 0); head.add(ear);
  const ear2 = ear.clone(); ear2.position.x = 0.08; head.add(ear2);
  const legs = [];
  for (const [x, z] of [[-0.1, 0.22], [0.1, 0.22], [-0.1, -0.22], [0.1, -0.22]]) {
    const p = new THREE.Group(); p.position.set(x, 0.33, z); g.add(p); cyl(0.04, 0.035, 0.33, mat, 0, -0.165, 0, p, 6); legs.push(p);
  }
  const tail = cyl(0.025, 0.015, 0.3, mat, 0, 0.6, -0.4, g, 5); tail.rotation.x = -0.9;
  g.traverse(m => { if (m.isMesh) m.castShadow = true; });
  void snout;
  return { group: g, head, legs, tail, phase: 0 };
}

// ผู้มาเยือน — ใบหน้า/การแต่งตัวต่างกัน ให้เรดาร์ "จำ" ได้ว่าเป็นใคร (ในระบบจริงคือ face embedding)
const PERSONAS = [
  { id: 'P-07', shirt: '#e67e22', pants: '#333', hat: 'cap', hatColor: '#e67e22', skin: '#b97a50', desc: 'เสื้อส้ม หมวกแก๊ป' },
  { id: 'P-12', shirt: '#2c7a4b', pants: '#4a3b2a', hat: 'straw', skin: '#a8714a', desc: 'เสื้อเขียว หมวกสาน' },
  { id: 'P-21', shirt: '#222', pants: '#111', hat: 'helmet', hatColor: '#111', skin: '#c99a72', desc: 'ชุดดำ หมวกกันน็อก' },
  { id: 'P-33', shirt: '#d8d8d8', pants: '#2d4a7a', skin: '#e0b48c', glasses: true, desc: 'เสื้อขาว ใส่แว่น' },
  { id: 'P-48', shirt: '#9b2d5a', pants: '#333', skin: '#d4a07a', longHair: true, desc: 'เสื้อชมพูเข้ม ผมยาว' },
];

// ---------------------------------------------------------------- main class
const CAMS = {
  overview: { pos: [38, 36, 72], target: [2, 0, 0] },
  house: { pos: [6, 4.5, 26], target: [-2, 2, 2] },
  pig: { pos: [36, 7, 13], target: [30, 0.5, -2] },
  pond: { pos: [13, 8, 32.5], target: [14, 0, 21] },
  chicken: { pos: [38, 5, 27], target: [30, 0.5, 18] },
  hydro: { pos: [-15, 7, 22], target: [-26, 0.5, 6] },
  rubber: { pos: [45, 30, -10], target: [0, 2, -80] },
};

export class Farm3D {
  constructor(host) {
    this.host = host;
    this.visible = true;
    this.autoTime = false;
    this.hour = 6.5;
    this.entities = [];
    this.visitors = [];
    this.labels = [];
    this.devices = { aerator: false, pump: true, chickenDoor: true, lights: false };
    this.fatherState = 'พักผ่อนหน้าบ้าน';
    this.feedLeft = 0;
    this.nextVisitor = 25;
    this.personaIdx = 0;
    this.init();
  }

  size() {
    const w = this.host.clientWidth || window.innerWidth;
    const h = this.host.clientHeight || window.innerHeight - 60;
    return [w, h];
  }

  init() {
    makeTextures(); makeMaterials();
    const [w, h] = this.size();
    const r = this.renderer = new THREE.WebGLRenderer({ antialias: true });
    r.setPixelRatio(Math.min(devicePixelRatio, 2));
    r.setSize(w, h);
    r.shadowMap.enabled = true; r.shadowMap.type = THREE.PCFSoftShadowMap;
    r.toneMapping = THREE.ACESFilmicToneMapping; r.toneMappingExposure = 0.55;
    this.host.appendChild(r.domElement);

    this.labelRenderer = new CSS2DRenderer();
    this.labelRenderer.setSize(w, h);
    Object.assign(this.labelRenderer.domElement.style, { position: 'absolute', inset: '0', pointerEvents: 'none' });
    this.host.appendChild(this.labelRenderer.domElement);

    const s = this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(45, w / h, 0.3, 2000);
    this.camera.position.set(...CAMS.overview.pos);
    this.controls = new OrbitControls(this.camera, r.domElement);
    this.controls.target.set(...CAMS.overview.target);
    this.controls.enableDamping = true;
    this.controls.maxPolarAngle = Math.PI * 0.46;
    this.controls.minDistance = 4; this.controls.maxDistance = 260;
    // เลื่อนกล้อง (pan) ไปตามพื้นราบ ไม่ใช่ขึ้น-ลงตามจอ — ลากสองนิ้วบนมือถือจะได้ไม่จมลงดิน
    this.controls.screenSpacePanning = false;
    this.controls.zoomToCursor = false;
    this.snapCam = new THREE.PerspectiveCamera(32, 4 / 3, 0.1, 200);

    // แสง & ท้องฟ้า
    this.sky = new Sky(); this.sky.scale.setScalar(4000); s.add(this.sky);
    const su = this.sky.material.uniforms;
    su.turbidity.value = 6; su.rayleigh.value = 2.2; su.mieCoefficient.value = 0.006; su.mieDirectionalG.value = 0.82;
    this.sun = new THREE.DirectionalLight('#fff1d8', 3);
    this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(2048, 2048);
    Object.assign(this.sun.shadow.camera, { left: -70, right: 70, top: 70, bottom: -70, near: 1, far: 400 });
    this.sun.shadow.bias = -0.0004; this.sun.shadow.normalBias = 0.03;
    this.sun.target.position.set(5, 0, 5);
    s.add(this.sun, this.sun.target);
    this.hemi = new THREE.HemisphereLight('#cfe3ff', '#4a5a30', 0.8); s.add(this.hemi);
    s.fog = new THREE.FogExp2('#cfd6d0', 0.0065);
    this.pmrem = new THREE.PMREMGenerator(r);
    this.envScene = new THREE.Scene();
    this.envSky = new Sky(); this.envSky.scale.setScalar(1000); this.envScene.add(this.envSky);
    this.nightLights = [];

    this.buildGround();
    this.buildHouse();
    this.buildCarport();
    this.buildFenceAndGarden();
    this.buildPond();
    this.buildPigPen();
    this.buildChickenCoop();
    this.buildHydro();
    this.buildRubber();
    this.buildBackdrop();
    this.buildCharacters();
    this.buildLabels();
    this.gen = 0;
    this.buildBBQ();
    this.vehicles = []; this.nextCar = 2; this.carsToday = 0; this.carSeq = 0;
    this.wxState = { clouds: 0, rain: 0, fog: 0 };
    this.fogBase = 0.0065;
    this.wx = new WeatherFX(this);

    this.setTime(this.hour);

    bus.on('cmd', c => this.onCommand(c));

    new ResizeObserver(() => this.resize()).observe(this.host);
    this.clock = new THREE.Clock();
    this.statusEl = document.getElementById('farmStatus');
    this.statusTimer = 0;
    r.setAnimationLoop(() => this.tick());
    setTimeout(() => { const l = document.getElementById('farmLoading'); l.style.opacity = 0; setTimeout(() => l.remove(), 700); }, 300);
  }

  resize() {
    if (!this.host.clientWidth) return;
    const [w, h] = this.size();
    this.renderer.setSize(w, h); this.labelRenderer.setSize(w, h);
    this.camera.aspect = w / h;
    this.camera.fov = w / h < 1 ? 62 : 45; // จอแนวตั้ง (มือถือ) ขยายมุมมองให้เห็นทั้งสวน
    this.camera.updateProjectionMatrix();
  }

  setVisible(v) { this.visible = v; if (v) requestAnimationFrame(() => this.resize()); }

  // ---------------------------------------------------------------- world
  buildGround() {
    const s = this.scene;
    // พื้นมีรูตรงบ่อปลา (x=14, z=22) เพื่อให้มองเห็นน้ำ/ปลาด้านล่าง
    const holed = (x0, z0, x1, z1) => {
      const sh = new THREE.Shape([new THREE.Vector2(x0, -z0), new THREE.Vector2(x1, -z0), new THREE.Vector2(x1, -z1), new THREE.Vector2(x0, -z1)]);
      const hole = new THREE.Path(); hole.absarc(14, -22, 4.6, 0, Math.PI * 2, true); sh.holes.push(hole);
      const geo = new THREE.ShapeGeometry(sh, 48); geo.rotateX(-Math.PI / 2); return geo;
    };
    const rice = new THREE.Mesh(holed(-800, -800, 800, 800), M.rice);
    rice.receiveShadow = true; s.add(rice);
    M.rice.map.repeat.set(1 / 26, 1 / 26);
    // ที่ดินบ้าน (หญ้า)
    const yard = new THREE.Mesh(holed(-46, -24, 50, 38), M.grass);
    yard.position.y = 0.02; yard.receiveShadow = true; s.add(yard);
    M.grass.map.repeat.set(1 / 4, 1 / 4);
    // คันนา
    for (let i = -6; i <= 6; i++) {
      const d = box(0.6, 0.18, 400, M.mud, i * 60 + 3, 0.05, -200, s); d.castShadow = false;
      const d2 = box(400, 0.18, 0.6, M.mud, 0, 0.05, -40 - i * 50 - 300, s); d2.castShadow = false;
    }
    // ถนน + ไหล่ทาง
    const road = new THREE.Mesh(new THREE.PlaneGeometry(1600, 9), M.asphalt);
    road.rotation.x = -Math.PI / 2; road.position.set(0, 0.04, 46); road.receiveShadow = true; s.add(road);
    for (const z of [42, 50]) { const l = box(1600, 0.01, 0.15, M.white, 0, 0.05, z, s); l.castShadow = false; }
    for (let x = -300; x < 300; x += 6) { const l = box(3, 0.01, 0.15, M.white, x, 0.05, 46, s); l.castShadow = false; }
    const apron = box(90, 0.06, 4, M.concrete, 0, 0.03, 39.5, s); apron.castShadow = false;
    // หญ้าต้นข้าว (instanced) รอบ ๆ ให้ดูมีมิติ
    const blade = new THREE.ConeGeometry(0.08, 0.7, 4); blade.translate(0, 0.35, 0);
    const count = 9000;
    const im = new THREE.InstancedMesh(blade, new THREE.MeshStandardMaterial({ color: '#8fc256', roughness: 1 }), count);
    const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), col = new THREE.Color();
    let n = 0;
    while (n < count) {
      const x = rand(-150, 150), z = rand(-180, 38);
      if (x > -48 && x < 52 && z > -24 && z < 38) continue; // ที่ดินบ้าน
      if (x > -32 && x < 32 && z < -16) continue; // สวนยาง
      e.set(rand(-0.25, 0.25), rand(0, 6), rand(-0.25, 0.25)); q.setFromEuler(e);
      const sc = rand(0.7, 1.4);
      m4.compose(new THREE.Vector3(x, 0, z), q, new THREE.Vector3(sc, sc, sc));
      im.setMatrixAt(n, m4); im.setColorAt(n, col.setHSL(rand(0.22, 0.27), 0.5, rand(0.35, 0.5))); n++;
    }
    im.receiveShadow = true; s.add(im);
  }

  buildHouse() {
    const g = new THREE.Group(); g.position.set(-2, 0, 0); this.scene.add(g); this.house = g;
    // ฐานยกพื้น
    box(16.4, 0.6, 10.4, M.concrete, 0, 0.3, 0, g);
    // ระเบียงไม้ด้านหน้า
    const deck = box(12.5, 0.12, 4, M.deck, -1.8, 0.62, 7, g);
    deck.material = M.deck;
    for (let x = -7.6; x <= 4; x += 1.5) cyl(0.12, 0.12, 0.6, M.wood, x, 0.3, 8.8, g, 6);
    box(12.5, 0.45, 0.25, M.wood, -1.8, 0.45, 8.95, g); // ขอบระเบียง
    // ม้านั่งไม้ริมระเบียง
    box(6, 0.08, 0.45, M.wood, -4.5, 1.05, 8.7, g);
    for (let x = -7.2; x <= -1.8; x += 1.8) box(0.08, 0.4, 0.4, M.frame, x, 0.85, 8.7, g);
    // บันได
    for (let i = 0; i < 3; i++) box(1.8, 0.2, 0.4, M.wood, 5.2, 0.1 + i * 0.2, 8.6 - i * 0.4, g);

    // ห้องซ้าย: ผนังไม้
    const H = 3.2, y0 = 0.6;
    box(7, H, 0.25, M.wood, -4.5, y0 + H / 2, -5, g); // หลัง
    box(0.25, H, 10, M.wood, -8, y0 + H / 2, 0, g); // ข้างซ้าย
    // ด้านหน้าห้องซ้าย: ผนังไม้ + หน้าต่างกระจกใหญ่
    box(1.2, H, 0.25, M.wood, -7.4, y0 + H / 2, 5, g);
    box(5.8, 0.6, 0.25, M.wood, -3.9, y0 + H - 0.3, 5, g);
    this.glassPane(g, -3.9, y0 + 1.3, 5, 5.8, 2.6);
    // กลาง: ประตูกระจกบานเลื่อนสูง
    box(0.25, H, 0.25, M.frame, -1, y0 + H / 2, 5, g);
    this.glassPane(g, 1.25, y0 + H / 2, 5, 4.5, H);
    box(4.6, 0.12, 0.3, M.frame, 1.25, y0 + H, 5, g);
    // ขวา: ปูนเปลือย + ช่องแสงแนวตั้ง
    box(2.6, H, 0.25, M.wall, 4.9, y0 + H / 2, 5, g);
    box(0.25, H, 10, M.wall, 6.1, y0 + H / 2, 0, g);
    box(9, H, 0.25, M.wall, 1.6, y0 + H / 2, -5, g);
    for (const z of [-3, 1.5]) this.glassPane(g, 6.24, y0 + 1.6, z, 0.6, 2.2, true);
    this.glassPane(g, 4.5, y0 + 1.7, 5.14, 0.5, 2.2);
    // แอร์
    box(0.3, 0.55, 0.85, M.white, 6.45, 1.0, -1, g);
    // พื้นในบ้าน
    const floor = box(13.8, 0.05, 9.6, M.deck, -1, 0.63, 0, g); floor.castShadow = false;
    // หลังคา 2 ชั้น (เลียนแบบบ้านในรูป)
    const r1 = box(17.6, 0.15, 8, M.roof, -1, 5.0, -2.2, g); r1.rotation.x = 0.12;
    const fascia1 = box(17.6, 0.4, 0.12, M.wallDark, -1, 4.55, 1.8, g);
    void fascia1;
    // ช่องแสงระหว่างหลังคา
    box(14.2, 0.9, 0.2, M.wood, -1, y0 + H + 0.45, 1.6, g);
    this.glassPane(g, -1, y0 + H + 0.45, 1.75, 13, 0.6);
    const r2 = box(17.6, 0.15, 7.4, M.roof, -1, 3.95, 5.2, g); r2.rotation.x = 0.08;
    box(17.6, 0.35, 0.12, M.wallDark, -1, 3.62, 8.9, g);
    box(0.2, 3.3, 0.2, M.frame, -9.4, 1.95, 8.6, g); box(0.2, 3.3, 0.2, M.frame, 7.5, 1.95, 8.6, g);
    // ฝ้าชายคา + ไฟดาวน์ไลท์
    const soffit = box(17.4, 0.05, 3.6, M.wood, -1, 3.75, 7, g); soffit.castShadow = false;
    // โคมไฟผนังด้านหน้า (แบบในรูป)
    this.sconces = [];
    for (const x of [-7.7, -1.1, 3.6, 6.25]) {
      const sc = box(0.12, 0.35, 0.1, M.warm, x, 2.6, 5.2, g); sc.castShadow = false; this.sconces.push(sc);
    }
    const porch = new THREE.PointLight('#ffb766', 0, 14, 1.6); porch.position.set(-1, 3.3, 7); g.add(porch); this.nightLights.push({ l: porch, max: 6 });

    // ภายในบ้าน
    const sofa = new THREE.MeshStandardMaterial({ color: '#d9cfc0', roughness: 0.9 });
    box(2.6, 0.45, 0.9, sofa, -1.5, 0.9, -2.8, g); box(2.6, 0.6, 0.25, sofa, -1.5, 1.3, -3.25, g);
    box(1.2, 0.35, 0.7, M.wood, -1.5, 0.82, -1.4, g);
    const tv = box(1.8, 1.0, 0.06, new THREE.MeshStandardMaterial({ color: '#111', emissive: '#4a7cff', emissiveIntensity: 0.6 }), 3, 1.9, -4.8, g); this.tv = tv;
    box(2.2, 0.5, 0.45, M.wood, 3, 0.9, -4.6, g);
    box(1.8, 0.06, 1, M.wood, -5.5, 1.4, -1, g);
    for (const x of [-6.2, -4.8]) for (const z of [-1.8, -0.2]) box(0.4, 0.5, 0.4, M.wood, x, 0.9, z, g);
    box(0.1, 0.75, 0.1, M.frame, -5.5, 1.0, -1, g);
    // ครัว
    box(3, 0.9, 0.6, M.white, -5.5, 1.08, -4.5, g);
    // ไฟห้อย
    for (const [x, z] of [[-5.5, -1], [-1.5, -2], [3, -2]]) {
      cyl(0.01, 0.01, 0.8, M.frame, x, 3.4, z, g, 4);
      const b = sph(0.13, M.warm, x, 2.95, z, g, 10); b.castShadow = false;
    }
    const inner = new THREE.PointLight('#ffc27a', 4, 16, 1.4); inner.position.set(-1, 2.8, -0.5); g.add(inner); this.innerLight = inner;
    // พัดลมเพดาน
    const fan = new THREE.Group(); fan.position.set(-1.5, 3.55, 0.8); g.add(fan);
    cyl(0.08, 0.08, 0.12, M.frame, 0, 0, 0, fan, 8);
    for (let i = 0; i < 3; i++) { const bl = box(1.1, 0.02, 0.16, M.wood, 0.6, 0, 0); const p = new THREE.Group(); p.rotation.y = i * Math.PI * 2 / 3; p.add(bl); fan.add(p); }
    this.fan = fan;
    // กระถางต้นไม้บนระเบียง
    for (const [x, z] of [[-8.6, 6], [-0.6, 8.3], [3.4, 8.3], [4.4, 6]]) {
      cyl(0.25, 0.18, 0.45, M.white, x, 0.9, z, g, 10);
      const p = sph(0.4, M.leafLight, x, 1.45, z, g, 8); p.scale.y = 1.3;
    }
  }

  glassPane(parent, x, y, z, w, h, side = false) {
    const geo = new THREE.PlaneGeometry(w, h);
    const m = new THREE.Mesh(geo, M.glass);
    m.position.set(x, y, z); if (side) m.rotation.y = Math.PI / 2;
    parent.add(m);
    // กรอบ
    const fw = side ? [0.06, h, 0.06] : [0.06, h, 0.06];
    for (let i = 0; i <= Math.max(1, Math.round(w / 1.5)); i++) {
      const t = -w / 2 + (w / Math.max(1, Math.round(w / 1.5))) * i;
      const f = box(...fw, M.frame, side ? x : x + t, y, side ? z + t : z, parent); f.castShadow = false;
    }
    const top = box(side ? 0.06 : w, 0.06, side ? w : 0.06, M.frame, x, y + h / 2, z, parent); top.castShadow = false;
    const bot = box(side ? 0.06 : w, 0.06, side ? w : 0.06, M.frame, x, y - h / 2, z, parent); bot.castShadow = false;
  }

  buildCarport() {
    const g = new THREE.Group(); g.position.set(14, 0, 5.5); this.scene.add(g);
    const slab = box(8.4, 0.08, 7.4, M.concrete, 0, 0.04, 0, g); slab.castShadow = false;
    for (const [x, z] of [[-4, -3.5], [4, -3.5], [-4, 3.5], [4, 3.5]]) box(0.2, 3, 0.2, M.wallDark, x, 1.5, z, g);
    const roof = box(9, 0.15, 8, M.roof, 0, 3.1, 0, g); roof.rotation.x = 0.06;
    box(9, 0.45, 0.12, M.wood, 0, 2.85, 3.9, g);
    // ผนังระแนงไม้ด้านหลัง
    for (let x = -3.9; x <= 3.9; x += 0.3) box(0.15, 2.8, 0.06, M.wood, x, 1.45, -3.6, g);
    for (let z = -3.4; z <= 3.4; z += 0.3) box(0.06, 2.8, 0.15, M.wood, 4, 1.45, z, g);
    this.makeCar(g, -1.8, 0.2, '#b9bec4', false);
    this.makeCar(g, 1.9, 0.4, '#c4c4c0', true);
  }

  makeCar(parent, x, z, color, pickup) {
    const g = new THREE.Group(); g.position.set(x, 0, z); parent.add(g);
    const paint = new THREE.MeshPhysicalMaterial({ color, metalness: 0.7, roughness: 0.3, clearcoat: 1 });
    const glass = new THREE.MeshStandardMaterial({ color: '#1a222a', roughness: 0.1, metalness: 0.6 });
    box(1.8, 0.6, 4.6, paint, 0, 0.65, 0, g);
    if (pickup) {
      box(1.75, 0.6, 2.2, paint, 0, 1.25, 0.9, g); box(1.6, 0.5, 2.0, glass, 0, 1.3, 0.9, g).scale.set(1.05, 0.8, 1.02);
      box(1.8, 0.35, 0.08, paint, 0, 1.12, -2.25, g);
    } else {
      const cab = box(1.65, 0.55, 2.4, paint, 0, 1.22, -0.1, g); cab.scale.set(1, 1, 1);
      box(1.68, 0.4, 2.3, glass, 0, 1.25, -0.1, g);
    }
    for (const [wx, wz] of [[-0.85, 1.4], [0.85, 1.4], [-0.85, -1.4], [0.85, -1.4]]) {
      const w = cyl(0.36, 0.36, 0.28, M.black, wx, 0.36, wz, g, 16); w.rotation.z = Math.PI / 2;
    }
    const hl = new THREE.MeshStandardMaterial({ color: '#fff', emissive: '#fff', emissiveIntensity: 0.3 });
    box(0.35, 0.12, 0.05, hl, -0.6, 0.8, 2.31, g); box(0.35, 0.12, 0.05, hl, 0.6, 0.8, 2.31, g);
    const tl = new THREE.MeshStandardMaterial({ color: '#a11', emissive: '#f22', emissiveIntensity: 0.4 });
    box(0.3, 0.1, 0.05, tl, -0.65, 0.85, -2.31, g); box(0.3, 0.1, 0.05, tl, 0.65, 0.85, -2.31, g);
    g.userData = { hl, tl };
    return g;
  }

  buildFenceAndGarden() {
    const s = this.scene;
    // ทางรถคอนกรีต
    const shape = new THREE.Shape();
    const pts = [[-3, 40], [3, 40], [3, 25], [16.5, 11], [16.5, 9], [10, 9], [10, 11], [-3, 23]];
    pts.forEach(([x, z], i) => i ? shape.lineTo(x, -z) : shape.moveTo(x, -z));
    const drive = new THREE.Mesh(new THREE.ShapeGeometry(shape), M.concrete);
    drive.rotation.x = -Math.PI / 2; drive.position.y = 0.05; drive.receiveShadow = true; s.add(drive);
    M.concrete.map.repeat.set(0.2, 0.2);
    // ทางเดินหินสี่เหลี่ยม
    for (let i = 0; i < 9; i++) { const st = box(0.7, 0.05, 0.7, M.concrete, -4 + i * 0.25, 0.05, 22 - i * 1.3, s); st.castShadow = false; }
    for (let i = 0; i < 6; i++) { const st = box(0.7, 0.05, 0.7, M.concrete, 6 + i * 0.9, 0.05, 11 + i * 0.2, s); st.castShadow = false; }
    // รั้วหน้าบ้าน
    const fz = 36;
    for (let x = -46; x <= 48; x += 3.2) {
      if (Math.abs(x) < 3.4) continue;
      box(0.3, 1.5, 0.3, M.wall, x, 0.75, fz, s);
      if (x + 3.2 <= 48 && Math.abs(x + 1.6) > 3.4) for (let k = 0; k < 4; k++) box(2.9, 0.08, 0.06, M.wallDark, x + 1.6, 0.4 + k * 0.3, fz, s);
    }
    // ประตูรั้วเหล็ก (เปิดอยู่)
    const gateM = M.frame;
    this.gates = [];
    for (const side of [-1, 1]) {
      const pivot = new THREE.Group(); pivot.position.set(side * 3.2, 0, fz); s.add(pivot);
      const leaf = new THREE.Group(); pivot.add(leaf);
      box(3, 0.06, 0.06, gateM, -side * 1.5, 1.5, 0, leaf); box(3, 0.06, 0.06, gateM, -side * 1.5, 0.15, 0, leaf);
      for (let i = 0; i <= 12; i++) box(0.03, 1.4, 0.03, gateM, -side * (0.1 + i * 0.24), 0.82, 0, leaf);
      pivot.rotation.y = side * 1.3; this.gates.push({ pivot, side });
    }
    // แนวรั้วต้นไม้
    const hedgeM = new THREE.MeshStandardMaterial({ color: '#3e7a2c', roughness: 1 });
    const hedge = new THREE.InstancedMesh(new THREE.SphereGeometry(0.7, 8, 6), hedgeM, 120);
    const m4 = new THREE.Matrix4(); let n = 0;
    for (let x = -45; x <= 47 && n < 120; x += 1.1) {
      if (Math.abs(x) < 4) continue;
      m4.makeScale(1, rand(0.8, 1.3), 0.8); m4.setPosition(x, 0.6, fz + 1.2); hedge.setMatrixAt(n++, m4);
    }
    hedge.count = n; hedge.castShadow = true; s.add(hedge);
    // ต้นไม้ใหญ่ + ไม้พุ่ม + มะพร้าว + กล้วย
    for (const [x, z, sc] of [[-14, 18, 1.2], [-18, 30, 1.0], [-38, 24, 1.4], [-40, -6, 1.3], [44, 8, 1.2], [42, 30, 1.1], [-12, -12, 1.1], [24, 30, 0.9], [8, 30, 0.8]]) this.makeTree(x, z, sc);
    for (const [x, z, h] of [[9, -8, 9], [12, -6, 11], [20, 14, 8], [-12, 4, 10], [-8, 12, 7], [36, 26, 9]]) this.makePalm(x, z, h);
    for (const [x, z] of [[-6, 16], [-9, 20], [-3, 28], [20, 26], [22, 20], [-16, 10], [-10, 26]]) this.makeBanana(x, z);
    for (let i = 0; i < 40; i++) {
      const x = rand(-12, 2), z = rand(12, 33);
      if (x > -4.5 && x < 3.5) continue;
      const b = sph(rand(0.3, 0.7), Math.random() > 0.5 ? M.leaf : M.leafLight, x, 0.3, z, s, 8); b.scale.y = 0.8;
    }
    // เสาไฟ
    for (const [x, z] of [[-4.5, 37.5], [4.5, 37.5], [-2, 26]]) {
      cyl(0.08, 0.1, 3, M.frame, x, 1.5, z, s, 6);
      const lamp = sph(0.18, M.warm, x, 3.1, z, s, 8); lamp.castShadow = false;
      const pl = new THREE.PointLight('#ffcf8a', 0, 18, 1.5); pl.position.set(x, 3, z); s.add(pl); this.nightLights.push({ l: pl, max: 5 });
    }
  }

  makeTree(x, z, sc = 1) {
    const g = new THREE.Group(); g.position.set(x, 0, z); g.scale.setScalar(sc); this.scene.add(g);
    cyl(0.18, 0.3, 3.5, M.trunk, 0, 1.75, 0, g, 8);
    for (let i = 0; i < 6; i++) {
      const b = sph(rand(1.4, 2.2), i % 2 ? M.leaf : M.leafDark, rand(-1.6, 1.6), rand(3.6, 5.5), rand(-1.6, 1.6), g, 9);
      b.scale.y = 0.8;
    }
    return g;
  }

  makePalm(x, z, h) {
    const g = new THREE.Group(); g.position.set(x, 0, z); this.scene.add(g);
    const lean = rand(-0.6, 0.6), lean2 = rand(-0.6, 0.6);
    const curve = new THREE.CatmullRomCurve3([new THREE.Vector3(0, 0, 0), new THREE.Vector3(lean * 0.4, h * 0.5, lean2 * 0.4), new THREE.Vector3(lean, h, lean2)]);
    const trunk = new THREE.Mesh(new THREE.TubeGeometry(curve, 12, 0.2, 7), M.bark); trunk.castShadow = true; g.add(trunk);
    const top = new THREE.Group(); top.position.set(lean, h, lean2); g.add(top);
    const frondGeo = new THREE.PlaneGeometry(0.9, 4, 1, 8);
    const p = frondGeo.attributes.position;
    for (let i = 0; i < p.count; i++) {
      const y = p.getY(i) + 2; // 0..4
      p.setX(i, p.getX(i) * Math.sin((y / 4) * Math.PI) * 1.1);
      p.setZ(i, -Math.pow(y / 4, 2) * 1.8);
    }
    frondGeo.translate(0, 2, 0); frondGeo.computeVertexNormals();
    const frondM = new THREE.MeshStandardMaterial({ color: '#3f7d2e', side: THREE.DoubleSide, roughness: 0.8 });
    for (let i = 0; i < 11; i++) {
      const f = new THREE.Mesh(frondGeo, frondM); f.castShadow = true;
      const holder = new THREE.Group(); holder.rotation.y = (i / 11) * Math.PI * 2 + rand(-0.2, 0.2); top.add(holder);
      f.rotation.x = rand(0.9, 1.4); holder.add(f);
    }
    for (let i = 0; i < 5; i++) sph(0.16, new THREE.MeshStandardMaterial({ color: '#5b6b25' }), rand(-0.25, 0.25), -0.2, rand(-0.25, 0.25), top, 6);
    this.palms = this.palms || []; this.palms.push(top);
  }

  makeBanana(x, z) {
    const g = new THREE.Group(); g.position.set(x, 0, z); this.scene.add(g);
    cyl(0.12, 0.16, 2, new THREE.MeshStandardMaterial({ color: '#6d8a3a' }), 0, 1, 0, g, 7);
    const leafGeo = new THREE.PlaneGeometry(0.7, 2.2, 1, 4); leafGeo.translate(0, 1.1, 0);
    const lp = leafGeo.attributes.position;
    for (let i = 0; i < lp.count; i++) lp.setZ(i, -Math.pow(lp.getY(i) / 2.2, 2) * 0.9);
    leafGeo.computeVertexNormals();
    for (let i = 0; i < 6; i++) {
      const l = new THREE.Mesh(leafGeo, M.leafLight); l.castShadow = true;
      const h = new THREE.Group(); h.position.y = 2; h.rotation.y = i * 1.05; h.add(l); l.rotation.x = rand(0.5, 1.1); g.add(h);
    }
  }

  buildPond() {
    const g = new THREE.Group(); g.position.set(14, 0, 22); this.scene.add(g); this.pond = g;
    const bottom = new THREE.Mesh(new THREE.CircleGeometry(4.6, 40), new THREE.MeshStandardMaterial({ color: '#2a3a24', roughness: 1 }));
    bottom.rotation.x = -Math.PI / 2; bottom.position.y = -0.9; g.add(bottom);
    const wall = new THREE.Mesh(new THREE.CylinderGeometry(4.6, 4.4, 0.9, 40, 1, true), new THREE.MeshStandardMaterial({ color: '#3b3a2c', side: THREE.BackSide }));
    wall.position.y = -0.45; g.add(wall);
    const water = new THREE.Mesh(new THREE.CircleGeometry(4.6, 48), M.water);
    water.rotation.x = -Math.PI / 2; water.position.y = -0.12; water.receiveShadow = true; g.add(water);
    // หินขอบบ่อ
    const stone = new THREE.InstancedMesh(new THREE.DodecahedronGeometry(0.35, 0), new THREE.MeshStandardMaterial({ color: '#7d786c', roughness: 1 }), 64);
    const m4 = new THREE.Matrix4(), q = new THREE.Quaternion();
    for (let i = 0; i < 64; i++) {
      const a = (i / 64) * Math.PI * 2, r = 4.75 + rand(-0.1, 0.15);
      q.setFromEuler(new THREE.Euler(rand(0, 3), rand(0, 3), 0));
      m4.compose(new THREE.Vector3(Math.cos(a) * r, 0.05, Math.sin(a) * r), q, new THREE.Vector3(rand(0.8, 1.3), rand(0.5, 0.8), rand(0.8, 1.2)));
      stone.setMatrixAt(i, m4);
    }
    stone.castShadow = true; g.add(stone);
    // บัว
    for (let i = 0; i < 9; i++) {
      const a = rand(0, 6.28), r = rand(1, 3.8);
      const pad = new THREE.Mesh(new THREE.CircleGeometry(rand(0.25, 0.4), 12, 0.3, 5.9), new THREE.MeshStandardMaterial({ color: '#4f8a3a', side: THREE.DoubleSide }));
      pad.rotation.x = -Math.PI / 2; pad.position.set(Math.cos(a) * r, -0.1, Math.sin(a) * r); g.add(pad);
      if (i % 3 === 0) sph(0.1, new THREE.MeshStandardMaterial({ color: '#f5a3c7' }), pad.position.x, -0.02, pad.position.z, g, 6);
    }
    // ปลา
    this.fish = [];
    const colors = ['#ff8c2b', '#f5f5f5', '#e85d3a', '#c8a050', '#ff8c2b', '#808a8a', '#e85d3a', '#ffd166'];
    for (let i = 0; i < 8; i++) {
      const f = makeFish(colors[i]); g.add(f.group);
      this.fish.push({ ...f, a: rand(0, 6.28), r: rand(1.2, 3.6), sp: rand(0.25, 0.55) * (Math.random() > 0.5 ? 1 : -1), depth: rand(0.3, 0.6), jump: -1 });
    }
    // เครื่องเติมอากาศ (เปิดจาก Hub)
    const aer = new THREE.Group(); aer.position.set(-1.5, -0.08, 1); g.add(aer);
    cyl(0.35, 0.35, 0.15, M.white, 0, 0, 0, aer, 12);
    this.aeratorLed = sph(0.05, M.ledOff, 0, 0.12, 0, aer, 6);
    const N = 160, pos = new Float32Array(N * 3);
    this.bubbleData = [];
    for (let i = 0; i < N; i++) this.bubbleData.push({ v: new THREE.Vector3(), life: rand(0, 1) });
    const bg = new THREE.BufferGeometry(); bg.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    this.bubbles = new THREE.Points(bg, new THREE.PointsMaterial({ color: '#e8fbff', size: 0.07, transparent: true, opacity: 0.85 }));
    this.bubbles.position.copy(aer.position); this.bubbles.visible = false; g.add(this.bubbles);
    this.water = water;
  }

  buildPigPen() {
    const g = new THREE.Group(); g.position.set(30, 0, -2); this.scene.add(g);
    const fl = box(12.4, 0.15, 8.4, M.concrete, 0, 0.07, 0, g); fl.castShadow = false;
    // ผนังเตี้ย
    box(12.4, 1, 0.2, M.brick, 0, 0.6, -4.1, g);
    box(0.2, 1, 8.4, M.brick, -6.1, 0.6, 0, g);
    box(0.2, 1, 8.4, M.brick, 6.1, 0.6, 0, g);
    box(5, 1, 0.2, M.brick, -3.6, 0.6, 4.1, g); box(5, 1, 0.2, M.brick, 3.6, 0.6, 4.1, g);
    // ประตูคอก
    box(2.2, 0.06, 0.06, M.metal, 0, 1.05, 4.1, g); box(2.2, 0.06, 0.06, M.metal, 0, 0.5, 4.1, g);
    // รางอาหาร
    box(8.4, 0.35, 0.6, M.concrete, 0, 0.32, 3.5, g);
    this.feedMesh = box(8.0, 0.12, 0.4, M.feed, 0, 0.45, 3.5, g); this.feedMesh.visible = false;
    // หลังคาครึ่งคอก
    for (const [x, z] of [[-6, -4], [6, -4], [-6, 0.5], [6, 0.5]]) box(0.15, 2.6, 0.15, M.metal, x, 1.3, z, g);
    const roof = box(13, 0.08, 5.6, M.roof, 0, 2.7, -1.8, g); roof.rotation.x = -0.1;
    // ถังน้ำ
    cyl(0.4, 0.4, 0.9, M.tank, -5.3, 0.6, -3.3, g, 12);
    // โรงเก็บอาหาร
    const st = new THREE.Group(); st.position.set(40, 0, -7); this.scene.add(st);
    box(4, 2.6, 4, M.wood, 0, 1.3, 0, st);
    const sr = box(4.6, 0.1, 4.6, M.roof, 0, 2.75, 0, st); sr.rotation.z = 0.15;
    box(0.05, 2, 1.2, M.wallDark, -2.02, 1, 0, st);
    for (let i = 0; i < 4; i++) { const sack = box(0.6, 0.35, 0.4, new THREE.MeshStandardMaterial({ color: '#e5ddc5' }), -2.4, 0.18 + (i % 2) * 0.36, -1.3 + (i >> 1) * 0.5, st); sack.rotation.y = rand(-0.2, 0.2); }
    // หมู
    this.pigs = [];
    for (let i = 0; i < 6; i++) {
      const p = makePig(rand(0.85, 1.15)); p.group.position.set(rand(24.8, 35), 0.15, rand(-5.4, 0.8)); p.group.rotation.y = rand(0, 6.28);
      this.scene.add(p.group);
      this.pigs.push({ ...p, target: null, state: 'wander', wait: rand(0, 4), slot: i });
      this.entities.push({ id: 'PIG-' + (i + 1), type: 'animal', label: 'หมู', obj: p.group });
    }
  }

  buildChickenCoop() {
    const g = new THREE.Group(); g.position.set(30, 0, 18); this.scene.add(g);
    // รั้วตาข่าย
    const posts = [[-4, -3.5], [4, -3.5], [4, 3.5], [-4, 3.5]];
    posts.forEach(([x, z]) => box(0.1, 1.6, 0.1, M.wood, x, 0.8, z, g));
    const netGeo = (w) => new THREE.PlaneGeometry(w, 1.5);
    const sides = [[0, -3.5, 8, 0], [4, 0, 7, Math.PI / 2], [0, 3.5, 8, 0], [-4, 0, 7, Math.PI / 2]];
    sides.forEach(([x, z, w, r]) => { const n = new THREE.Mesh(netGeo(w), M.net); n.position.set(x, 0.75, z); n.rotation.y = r; g.add(n); });
    const ground = new THREE.Mesh(new THREE.PlaneGeometry(8, 7), M.mud); ground.rotation.x = -Math.PI / 2; ground.position.y = 0.03; ground.receiveShadow = true; g.add(ground);
    // เล้า
    const coop = new THREE.Group(); coop.position.set(2.2, 0, -2.2); g.add(coop);
    for (const [x, z] of [[-1.3, -1], [1.3, -1], [-1.3, 1], [1.3, 1]]) box(0.12, 0.8, 0.12, M.wood, x, 0.4, z, coop);
    box(2.8, 1.3, 2.2, M.wood, 0, 1.45, 0, coop);
    const cr = box(3.2, 0.08, 2.8, M.roof, 0, 2.2, 0, coop); cr.rotation.x = 0.2;
    const door = new THREE.Group(); door.position.set(-0.4, 0.82, 1.12); coop.add(door);
    box(0.6, 0.7, 0.05, M.wallDark, 0.3, 0.35, 0, door); this.coopDoor = door;
    const ramp = box(0.5, 0.04, 1.3, M.wood, -0.1, 0.42, 1.65, coop); ramp.rotation.x = 0.6;
    // ไก่
    this.chickens = [];
    const cols = ['#f4efe6', '#a0522d', '#f4efe6', '#3b2a20', '#c8823c', '#f4efe6', '#a0522d', '#ddd'];
    for (let i = 0; i < 8; i++) {
      const c = makeChicken(cols[i]);
      c.group.position.set(rand(26.5, 33.5), 0, rand(16.5, 21));
      if (i === 0) c.group.scale.setScalar(1.25);
      this.scene.add(c.group);
      this.chickens.push({ ...c, target: null, wait: rand(0, 3), peck: 0 });
      this.entities.push({ id: 'CHK-' + (i + 1), type: 'animal', label: i === 0 ? 'ไก่ (พ่อพันธุ์)' : 'ไก่', obj: c.group });
    }
  }

  buildHydro() {
    const g = new THREE.Group(); g.position.set(-26, 0, 6); this.scene.add(g);
    const slab = box(12.4, 0.08, 20.4, M.concrete, 0, 0.04, 0, g); slab.castShadow = false;
    // โครงโรงเรือน
    for (let z = -10; z <= 10; z += 2.5) {
      for (const x of [-6, 6]) box(0.1, 3, 0.1, M.metal, x, 1.5, z, g);
      const arch = new THREE.Mesh(new THREE.TorusGeometry(6, 0.05, 6, 24, Math.PI), M.metal);
      arch.position.set(0, 3, z); arch.scale.y = 0.35; g.add(arch);
    }
    const roofGeo = new THREE.CylinderGeometry(6, 6, 20, 24, 1, true, -Math.PI / 2, Math.PI);
    roofGeo.rotateX(-Math.PI / 2); // ครึ่งทรงกระบอกนอนตามแกน z โค้งขึ้นด้านบน
    const roof = new THREE.Mesh(roofGeo, new THREE.MeshStandardMaterial({ color: '#f4f8f4', transparent: true, opacity: 0.28, side: THREE.DoubleSide, roughness: 0.3, depthWrite: false }));
    roof.scale.set(1, 0.35, 1); roof.position.y = 3;
    g.add(roof);
    for (const x of [-6, 6]) { const n = new THREE.Mesh(new THREE.PlaneGeometry(20, 3), M.net); n.rotation.y = Math.PI / 2; n.position.set(x, 1.5, 0); g.add(n); }
    for (const z of [-10, 10]) { const n = new THREE.Mesh(new THREE.PlaneGeometry(12, 3), M.net); n.position.set(0, 1.5, z); g.add(n); }
    // โต๊ะ NFT + ผักสลัด
    const lettuceGeo = new THREE.SphereGeometry(0.11, 7, 5); lettuceGeo.scale(1, 0.65, 1);
    const tables = 5, pipes = 4, holes = 30;
    const lettuce = new THREE.InstancedMesh(lettuceGeo, new THREE.MeshStandardMaterial({ roughness: 0.9 }), tables * pipes * holes);
    const m4 = new THREE.Matrix4(), col = new THREE.Color(); let n = 0;
    for (let t = 0; t < tables; t++) {
      const x = -4.4 + t * 2.2;
      for (const z of [-7.5, 7.5]) for (const dx of [-0.5, 0.5]) box(0.05, 0.85, 0.05, M.metal, x + dx, 0.45, z, g);
      for (let p = 0; p < pipes; p++) {
        const px = x - 0.45 + p * 0.3;
        const pipe = cyl(0.06, 0.06, 15.4, M.pipe, px, 0.92, 0, g, 8); pipe.rotation.x = Math.PI / 2;
        for (let h = 0; h < holes; h++) {
          const z = -7.2 + h * 0.5; const sc = rand(0.7, 1.5);
          m4.makeScale(sc, sc, sc); m4.setPosition(px, 1.02, z);
          lettuce.setMatrixAt(n, m4); lettuce.setColorAt(n, col.setHSL(rand(0.23, 0.3), 0.6, rand(0.35, 0.55))); n++;
        }
      }
    }
    lettuce.castShadow = true; g.add(lettuce);
    // ถังสารละลาย + ปั๊ม
    cyl(0.6, 0.6, 1, M.tank, -5, 0.5, 9, g, 16);
    box(0.4, 0.3, 0.3, M.frame, -4.2, 0.2, 9, g);
    this.pumpLed = sph(0.05, M.ledOn, -4.2, 0.4, 9, g, 6);
    // ผักแปลงดินด้านนอก
    for (let r = 0; r < 4; r++) {
      const bx = -8 - r * 1.8;
      box(1.2, 0.25, 8, M.mud, bx, 0.12, 0, g);
      for (let k = 0; k < 14; k++) { const v = sph(rand(0.15, 0.25), M.leafLight, bx + rand(-0.4, 0.4), 0.32, -3.7 + k * 0.57, g, 6); v.scale.y = 0.7; }
    }
  }

  buildRubber() {
    // สวนยางพารา 20 แถว x 20 ต้น = 400 ต้น ระยะ 3 x 7 เมตร
    const s = this.scene;
    const ground = new THREE.Mesh(new THREE.PlaneGeometry(64, 142), M.litter);
    ground.rotation.x = -Math.PI / 2; ground.position.set(0, 0.03, -88); ground.receiveShadow = true; s.add(ground);
    const rows = 20, perRow = 20, total = rows * perRow;
    const trunkGeo = new THREE.CylinderGeometry(0.14, 0.2, 7, 7); trunkGeo.translate(0, 3.5, 0);
    const canopyGeo = new THREE.IcosahedronGeometry(1.6, 1);
    const cupGeo = new THREE.CylinderGeometry(0.08, 0.06, 0.12, 6); cupGeo.translate(0, 1.0, 0.2);
    const trunks = new THREE.InstancedMesh(trunkGeo, M.bark, total);
    const canopy = new THREE.InstancedMesh(canopyGeo, new THREE.MeshStandardMaterial({ roughness: 0.9, flatShading: true }), total * 3);
    const cups = new THREE.InstancedMesh(cupGeo, M.white, total);
    const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), col = new THREE.Color();
    let ci = 0, i = 0;
    for (let r = 0; r < rows; r++) for (let k = 0; k < perRow; k++) {
      const x = -28.5 + k * 3 + rand(-0.15, 0.15), z = -20 - r * 7 + rand(-0.2, 0.2);
      const sc = rand(0.85, 1.15);
      q.setFromEuler(new THREE.Euler(rand(-0.04, 0.04), rand(0, 6), rand(-0.04, 0.04)));
      m4.compose(new THREE.Vector3(x, 0, z), q, new THREE.Vector3(1, sc, 1)); trunks.setMatrixAt(i, m4); cups.setMatrixAt(i, m4);
      for (let c = 0; c < 3; c++) {
        const cs = rand(0.8, 1.25);
        m4.compose(new THREE.Vector3(x + rand(-0.9, 0.9), 7 * sc + rand(-0.6, 1.4), z + rand(-1.6, 1.6)), q, new THREE.Vector3(cs, cs * 0.8, cs * 1.3));
        canopy.setMatrixAt(ci, m4); canopy.setColorAt(ci, col.setHSL(rand(0.24, 0.3), 0.45, rand(0.2, 0.3))); ci++;
      }
      i++;
    }
    trunks.castShadow = canopy.castShadow = true; trunks.receiveShadow = canopy.receiveShadow = true;
    s.add(trunks, canopy, cups);
    this.rubberCount = total;
  }

  buildBackdrop() {
    // ทิวไม้ไกล ๆ ในหมอก
    const geo = new THREE.IcosahedronGeometry(1, 1);
    const im = new THREE.InstancedMesh(geo, new THREE.MeshStandardMaterial({ color: '#3e5a35', roughness: 1, flatShading: true }), 260);
    const tr = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.3, 0.4, 1, 5), M.trunk, 130);
    const m4 = new THREE.Matrix4();
    for (let i = 0; i < 130; i++) {
      const a = rand(0, Math.PI * 2), r = rand(170, 420);
      const x = Math.cos(a) * r, z = Math.sin(a) * r;
      if (z > 30 && Math.abs(x) < 400) { i--; continue; }
      const h = rand(5, 12), w = rand(3, 7);
      m4.makeScale(1, h, 1); m4.setPosition(x, h / 2, z); tr.setMatrixAt(i, m4);
      m4.makeScale(w, w * 0.8, w); m4.setPosition(x, h + w * 0.4, z); im.setMatrixAt(i * 2, m4);
      m4.makeScale(w * 0.7, w * 0.6, w * 0.7); m4.setPosition(x + rand(-2, 2), h + w, z + rand(-2, 2)); im.setMatrixAt(i * 2 + 1, m4);
    }
    this.scene.add(im, tr);
  }

  buildCharacters() {
    // พ่อ
    const dad = makeHuman({ shirt: '#4d6b8a', pants: '#3a3226', hat: 'straw', skin: '#a8714a' });
    dad.group.position.set(4, 0, 10.5); dad.group.rotation.y = 0.3;
    this.scene.add(dad.group);
    const bucket = new THREE.Group();
    cyl(0.17, 0.14, 0.32, new THREE.MeshStandardMaterial({ color: '#3a7bd5', roughness: 0.6 }), 0, -0.18, 0, bucket, 10);
    this.bucketFeed = cyl(0.15, 0.15, 0.04, M.feed, 0, -0.04, 0, bucket, 10);
    bucket.position.set(0, -0.68, 0.05); bucket.visible = false; dad.armR.add(bucket);
    this.dad = { h: dad, w: new Walker(dad, 1.25), bucket };
    this.entities.push({ id: 'H-DAD', type: 'human', label: 'พ่อ', resident: true, obj: dad.group, h: dad });
    // แม่ในบ้าน
    const mom = makeHuman({ shirt: '#c96f7a', pants: '#5b4a6b', longHair: true, skin: '#c4916a' });
    mom.baseY = 0.65; mom.group.position.set(-4, 0.65, -1);
    this.scene.add(mom.group);
    this.mom = { h: mom, w: new Walker(mom, 0.8) };
    this.entities.push({ id: 'H-MOM', type: 'human', label: 'แม่', resident: true, obj: mom.group, h: mom });
    this.momLoop();
    // หมาเฝ้าบ้าน
    const dog = makeDog(); dog.group.position.set(2, 0, 14); this.scene.add(dog.group);
    this.dog = { ...dog, target: new THREE.Vector3(2, 0, 14), wait: 2 };
    this.entities.push({ id: 'DOG-1', type: 'animal', label: 'หมา (เจ้าดำ)', obj: dog.group });
    // พี่สาว — ดูแลผักไฮโดรโปนิกส์และเก็บไข่ไก่
    const sis = makeHuman({ shirt: '#e9c46a', pants: '#264653', longHair: true, skin: '#c99a72', hair: '#2a1a12' });
    sis.group.scale.setScalar(0.95); sis.group.position.set(-3, 0, 11.5);
    this.scene.add(sis.group);
    this.sis = { h: sis, w: new Walker(sis, 1.1), task: 'พักหน้าบ้าน' };
    this.entities.push({ id: 'H-SIS', type: 'human', label: 'พี่สาว', resident: true, obj: sis.group, h: sis });
    // น้องสาว — เด็ก เล่นในสวน ให้อาหารปลา
    const kid = makeHuman({ shirt: '#ff7eb6', pants: '#7b5cd6', longHair: true, skin: '#d4a57c' });
    kid.group.scale.setScalar(0.68); kid.group.position.set(0, 0, 16);
    this.scene.add(kid.group);
    this.kid = { h: kid, w: new Walker(kid, 1.0), task: 'เล่นในสวน' };
    this.entities.push({ id: 'H-KID', type: 'human', label: 'น้องสาว', resident: true, obj: kid.group, h: kid });
    setTimeout(() => this.sisLoop(), 9000);
    setTimeout(() => this.kidLoop(), 2000);
    // แมว 6 ตัว
    this.cats = CATS.map((c, i) => {
      const cat = makeCat(c);
      const onDeck = i < 3;
      cat.group.position.set(onDeck ? -8 + i * 3.2 : rand(-8, 6), onDeck ? 0.68 : 0, onDeck ? 7.4 : rand(12, 28));
      cat.group.rotation.y = rand(0, 6.28);
      this.scene.add(cat.group);
      this.entities.push({ id: 'CAT-' + (i + 1), type: 'animal', label: 'แมว (' + c.name + ')', obj: cat.group });
      return { ...cat, name: c.name, target: null, wait: rand(1, 8), sleep: i === 0 || i === 4 ? rand(10, 30) : 0 };
    });
    this.fishFeed = 0;
    // พ่อเริ่มกิจวัตรหลังโหลดสักครู่
    setTimeout(() => this.feedPigs('auto'), 4000);
  }

  sisLoop(gen = this.gen) {
    if (gen !== this.gen) return;
    const s = this.sis, h = s.h;
    const tend = (cb) => {
      h.holding = true; h.armL.rotation.x = -0.9; h.armR.rotation.x = -0.9; h.head.rotation.x = 0.4; s.w.wait = 3;
      setTimeout(() => { h.holding = false; h.head.rotation.x = 0; cb(); }, 3000);
    };
    s.task = 'เดินไปโรงเรือนผัก';
    s.w.go([[-8, 0, 12.5], [-18, 0, 18.5], [-27.1, 0, 18], [-27.1, 0, 12]], () => {
      s.task = 'ตรวจผักไฮโดรโปนิกส์'; bus.emit('farm-event', 'พี่สาวกำลังตรวจผักในโรงเรือน');
      tend(() => s.w.go([[-27.1, 0, 4]], () => tend(() => s.w.go([[-27.1, 0, -2]], () => tend(() => {
        s.task = 'ไปเก็บไข่ไก่';
        s.w.go([[-27.1, 0, 18], [-18, 0, 18.5], [-6, 0, 13], [6, 0, 12.6], [24, 0, 12.6], [26.3, 0, 18], [31.8, 0, 17.8]], () => {
          h.group.rotation.y = Math.PI; s.task = 'เก็บไข่ไก่';
          tend(() => {
            const n = 2 + Math.floor(Math.random() * 4);
            bus.emit('farm-event', `พี่สาวเก็บไข่ไก่ได้ ${n} ฟอง`); bus.emit('eggs-collected', n);
            s.task = 'เดินกลับบ้าน';
            s.w.go([[26.3, 0, 18], [24, 0, 12.6], [6, 0, 12.6], [-3, 0, 11.5]], () => {
              s.task = 'พักหน้าบ้าน'; h.group.rotation.y = 0; s.w.wait = 1;
              setTimeout(() => this.sisLoop(gen), rand(40, 70) * 1000);
            });
          });
        });
      })))));
    });
  }

  kidLoop(gen = this.gen) {
    if (gen !== this.gen) return;
    const k = this.kid, h = k.h;
    const next = () => setTimeout(() => this.kidLoop(gen), rand(1, 4) * 1000);
    if (Math.random() < 0.35) {
      k.task = 'ไปให้อาหารปลา';
      k.w.go([[4, 0, 18], [8.7, 0, 22]], () => {
        h.group.rotation.y = Math.PI / 2; k.task = 'ให้อาหารปลา';
        bus.emit('farm-event', 'น้องสาวกำลังให้อาหารปลา — ปลาว่ายมารวมกัน');
        this.fishFeed = 9; h.holding = true;
        let n = 0;
        const toss = setInterval(() => {
          h.armR.rotation.x = n++ % 2 ? -1.6 : -0.6;
          if (n > 12) { clearInterval(toss); h.holding = false; k.task = 'เล่นในสวน'; next(); }
        }, 600);
      });
    } else {
      k.task = 'เล่นในสวน';
      let p;
      do { p = [rand(-9, 7), 0, rand(11, 31)]; } while (Math.hypot(p[0] - 14, p[2] - 22) < 6);
      k.w.go([p], () => { k.w.wait = rand(2, 6); next(); });
    }
  }

  momLoop() {
    const gen = this.gen;
    const spots = [[-5.5, 0.65, -3.6], [-1.5, 0.65, -0.6], [1.5, 0.65, 3.8], [-4.2, 0.65, 0.6], [3, 0.65, -3.6]];
    const go = () => {
      if (gen !== this.gen) return;
      const p = spots[Math.floor(Math.random() * spots.length)];
      this.mom.w.go([[p[0] - 2, p[1], p[2]]], () => { this.mom.w.wait = rand(3, 8); setTimeout(go, 100); });
    };
    go();
  }

  buildLabels() {
    const add = (text, x, y, z, cam) => {
      const el = document.createElement('div'); el.className = 'zone-label'; el.textContent = text;
      el.addEventListener('click', () => this.flyTo(cam));
      const o = new CSS2DObject(el); o.position.set(x, y, z); this.scene.add(o); this.labels.push(o);
      return el;
    };
    add('🏡 บ้าน', -2, 6.2, 0, 'house');
    add('🐖 คอกหมู', 30, 3.6, -2, 'pig');
    add('🐟 บ่อปลา', 14, 1.6, 22, 'pond');
    add('🐔 เล้าไก่', 30, 3, 18, 'chicken');
    add('🥬 ผักไฮโดรโปนิกส์', -26, 4.2, 6, 'hydro');
    add('🌳 สวนยาง 400 ต้น', 0, 11, -40, 'rubber');
    add('🚗 โรงรถ', 14, 4, 5.5, 'house');
    this.gateLabel = add('🚪 ประตูหน้า', 0, 2.6, 36, 'overview');
  }

  // ---------------------------------------------------------------- behaviours
  feedPigs(source = 'manual') {
    if (this.dad.busy) return false;
    const d = this.dad; d.busy = true;
    bus.emit('farm-event', `พ่อเริ่มเดินไปให้อาหารหมู (${source === 'auto' ? 'กิจวัตร' : 'สั่งจาก ' + source})`);
    this.fatherState = 'เดินไปโรงเก็บอาหาร';
    d.w.go([[12, 0, 11.5], [21, 0, 10.5], [37, 0, 4.5], [37, 0, -7]], () => {
      this.fatherState = 'ตักอาหารใส่ถัง';
      d.w.wait = 2;
      setTimeout(() => {
        d.bucket.visible = true; d.h.holding = true; d.h.armR.rotation.x = -0.15;
        this.fatherState = 'ถืออาหารไปที่รางหมู';
        d.w.go([[37, 0, 4.2], [30, 0, 2.9]], () => {
          d.h.group.rotation.y = Math.PI;
          this.fatherState = 'เทอาหารลงราง';
          let t = 0;
          const pour = setInterval(() => {
            t += 0.05;
            d.h.armR.rotation.x = -0.15 - Math.min(1, t) * 1.3;
            d.bucket.rotation.x = Math.min(1, t) * 1.7;
            if (t > 1) {
              clearInterval(pour);
              this.feedMesh.visible = true; this.feedMesh.scale.set(1, 1, 1); this.feedLeft = 1;
              this.pigs.forEach(p => { p.state = 'toTrough'; });
              bus.emit('farm-event', 'เทอาหารหมูแล้ว — หมู 6 ตัวกำลังกิน');
              setTimeout(() => {
                d.bucket.rotation.x = 0; d.h.armR.rotation.x = 0; d.bucket.visible = false; d.h.holding = false;
                this.fatherState = 'ดูหมูกินอาหาร';
                d.w.wait = 6;
                setTimeout(() => {
                  this.fatherState = 'เดินกลับบ้าน';
                  d.w.go([[24, 0, 6], [20, 0, 10.5], [12, 0, 11.5], [4, 0, 10.5]], () => {
                    this.fatherState = 'พักผ่อนหน้าบ้าน'; d.busy = false; d.h.group.rotation.y = 0.3;
                  });
                }, 6200);
              }, 900);
            }
          }, 40);
        });
      }, 2000);
    });
    return true;
  }

  spawnVisitor(persona, nearGate = false) {
    const p = persona || PERSONAS[this.personaIdx++ % PERSONAS.length];
    if (this.visitors.some(v => v.persona.id === p.id)) return;
    const h = makeHuman(p);
    const fromLeft = Math.random() > 0.5;
    h.group.position.set(fromLeft ? -70 : 70, 0, 45);
    this.scene.add(h.group);
    const w = new Walker(h, 1.15);
    const ent = { id: 'H-' + p.id, type: 'human', label: 'บุคคล', persona: p, obj: h.group, h, visitor: true };
    const v = { h, w, persona: p, ent };
    this.visitors.push(v); this.entities.push(ent);
    if (nearGate) h.group.position.set(0.5, 0, 42);
    w.go([...(nearGate ? [] : [[0, 0, 45]]), [0, 0, 37], [-0.5, 0, 26], [-1, 0, 12]], () => {
      h.group.rotation.y = Math.PI; w.wait = 8;
      setTimeout(() => {
        w.go([[0, 0, 26], [0, 0, 37], [0, 0, 45], [fromLeft ? 70 : -70, 0, 45]], () => {
          this.scene.remove(h.group);
          this.visitors = this.visitors.filter(x => x !== v);
          this.entities = this.entities.filter(x => x !== ent);
        });
      }, 8200);
    });
    bus.emit('farm-event', `มีคนเดินมาตามถนน (${p.desc})`);
  }

  onCommand(c) {
    switch (c.device) {
      case 'pig-feeder': if (!this.feedPigs(c.source || 'Hub')) bus.emit('farm-event', 'พ่อกำลังทำงานอยู่ — คิวคำสั่งให้อาหารรอบถัดไป'); break;
      case 'aerator': this.devices.aerator = c.value; this.bubbles.visible = c.value; this.aeratorLed.material = c.value ? M.ledOn : M.ledOff; break;
      case 'hydro-pump': this.devices.pump = c.value; this.pumpLed.material = c.value ? M.ledOn : M.ledOff; break;
      case 'chicken-door': this.devices.chickenDoor = c.value; break;
      case 'lights': this.devices.lights = c.value; this.setTime(this.hour); break;
      case 'gate': this.devices.gateClosed = !c.value; break;
    }
  }

  // ---------------------------------------------------------------- time of day
  setTime(h) {
    this.hour = h;
    const ang = ((h - 6) / 12) * Math.PI;
    const elev = Math.sin(ang) * 68; // องศา
    const azim = 90 - ((h - 6) / 12) * 180; // ตะวันออก → ตะวันตก
    const phi = THREE.MathUtils.degToRad(90 - elev), theta = THREE.MathUtils.degToRad(azim + 20);
    const sunDir = new THREE.Vector3().setFromSphericalCoords(1, phi, theta);
    this.sky.material.uniforms.sunPosition.value.copy(sunDir);
    const day = clamp((elev + 4) / 20, 0, 1);
    const night = 1 - clamp((elev + 6) / 12, 0, 1);
    this.nightFactor = night;
    this.sun.position.copy(sunDir).multiplyScalar(150).add(this.sun.target.position);
    const cl = this.wxState?.clouds || 0, rn = this.wxState?.rain || 0;
    const su = this.sky.material.uniforms;
    su.turbidity.value = lerp(6, 18, cl); su.rayleigh.value = lerp(2.2, 0.5, cl); su.mieCoefficient.value = lerp(0.006, 0.02, cl);
    this.sun.intensity = day * 3.2 * (1 - 0.85 * cl);
    const warm = clamp(1 - elev / 30, 0, 1);
    this.sun.color.setRGB(1, lerp(0.97, 0.72, warm), lerp(0.92, 0.5, warm));
    this.hemi.intensity = lerp(0.12, 0.85, day) * (1 - 0.3 * cl - 0.2 * rn);
    this.hemi.color.setHSL(0.6, 0.5 * (1 - cl), lerp(0.25, 0.85, day));
    this.hemiBase = this.hemi.intensity;
    this.renderer.toneMappingExposure = lerp(0.9, 0.5, day) * (1 - 0.2 * cl - 0.2 * rn);
    const fogC = new THREE.Color().setHSL(lerp(0.62, 0.1, warm * day), lerp(0.25, 0.15, day) * (1 - cl), lerp(0.06, 0.8, day) * (1 - 0.3 * cl - 0.45 * rn));
    this.scene.fog.color.copy(fogC);
    this.fogColor = fogC.clone();
    this.scene.fog.density = this.fogBase + rn * 0.009 + (this.wxState?.fog || 0) * 0.02;
    // ฟ้าครึ้มมาก: ใช้ท้องฟ้าสีเทาเรียบ (อ้างอิงสีหมอกตัวเดียวกัน ฟ้าแลบจึงสว่างวาบทั้งฟ้า)
    const overcast = cl > 0.6;
    this.sky.visible = !overcast;
    this.scene.background = overcast ? this.scene.fog.color : night > 0.7 ? new THREE.Color('#05080f') : null;
    const lightsOn = night > 0.25 || this.devices.lights || (cl > 0.85 && rn > 0.5 && night > 0.05);
    this.nightLights.forEach(n => (n.l.intensity = lightsOn ? n.max * Math.max(night, this.devices.lights ? 0.8 : 0) : 0));
    M.warm.emissiveIntensity = lightsOn ? 3 : 0.4;
    this.innerLight.intensity = lerp(2, 9, night);
    this.updateEnv(sunDir);
    bus.emit('time', h);
  }

  updateEnv(sunDir) {
    if (this.envHour !== undefined && Math.abs(this.envHour - this.hour) < 0.25) return;
    this.envHour = this.hour;
    clearTimeout(this.envTimer);
    this.envTimer = setTimeout(() => {
      this.envSky.material.uniforms.sunPosition.value.copy(sunDir);
      Object.keys(this.sky.material.uniforms).forEach(k => { if (k !== 'sunPosition') this.envSky.material.uniforms[k].value = this.sky.material.uniforms[k].value; });
      if (this.envRT) this.envRT.dispose();
      this.envRT = this.pmrem.fromScene(this.envScene, 0.04);
      this.scene.environment = this.envRT.texture;
    }, 120);
  }

  setFog(on) { this.fogBase = on ? 0.0065 : 0.0012; this.setTime(this.hour); }

  // เรียกจาก WeatherFX เมื่อสภาพอากาศเปลี่ยน
  applyWeather(w) {
    this.wxState = { clouds: w.clouds, rain: w.rain, fog: w.fog };
    // พื้นเปียก: ผิวลื่นสะท้อนแสงมากขึ้น
    M.concrete.roughness = 0.9 - w.rain * 0.55; M.asphalt.roughness = 0.95 - w.rain * 0.6;
    M.deck.roughness = 0.6 - w.rain * 0.35; M.roof.roughness = 0.5 - w.rain * 0.3;
    M.water.normalScale.setScalar(0.4 + w.rain * 1.4);
    if (Math.abs((this.envClouds ?? -1) - w.clouds) > 0.15) { this.envClouds = w.clouds; this.envHour = undefined; }
    this.setTime(this.hour);
  }

  flashSky(k) {
    if (!this.fogColor) return;
    this.scene.fog.color.copy(this.fogColor).lerp(new THREE.Color('#c9d4ff'), Math.min(1, k * 0.8));
    this.hemi.intensity = this.hemiBase + k * 2.5;
  }
  setLabels(on) { this.labels.forEach(l => (l.visible = on)); }

  flyTo(name) {
    const c = CAMS[name]; if (!c) return;
    this.tour?.stop();
    const p0 = this.camera.position.clone(), t0 = this.controls.target.clone();
    const p1 = new THREE.Vector3(...c.pos), t1 = new THREE.Vector3(...c.target);
    const start = performance.now(), dur = 1600;
    this.flying = (now) => {
      let k = Math.min(1, (now - start) / dur); k = k < 0.5 ? 4 * k * k * k : 1 - Math.pow(-2 * k + 2, 3) / 2;
      this.camera.position.lerpVectors(p0, p1, k); this.controls.target.lerpVectors(t0, t1, k);
      if (k >= 1) this.flying = null;
    };
  }

  // ---------------------------------------------------------------- API ให้เรดาร์
  getEntities() {
    return this.entities.map(e => ({
      id: e.id, type: e.type, label: e.label, resident: !!e.resident, persona: e.persona || null,
      x: e.obj.position.x, z: e.obj.position.z, heading: e.obj.rotation.y,
    }));
  }

  // ถ่ายภาพใบหน้าจาก "กล้องจับหน้า" ในฉาก — ใช้ renderer ตัวเดิม render ลงมุมจอแล้วคัดลอกออกมา
  captureFace(id) {
    const e = this.entities.find(x => x.id === id); if (!e || !e.h) return null;
    const W = 320, H = 240, pr = this.renderer.getPixelRatio();
    const head = new THREE.Vector3(); e.h.head.getWorldPosition(head);
    const ry = e.obj.rotation.y;
    const front = new THREE.Vector3(Math.sin(ry), 0, Math.cos(ry));
    this.snapCam.position.copy(head).addScaledVector(front, 1.7).add(new THREE.Vector3(0.25, 0.25, 0));
    this.snapCam.lookAt(head.x, head.y - 0.15, head.z);
    this.snapCam.updateProjectionMatrix();
    const r = this.renderer;
    r.setScissorTest(true);
    r.setViewport(0, 0, W / pr, H / pr); r.setScissor(0, 0, W / pr, H / pr);
    r.render(this.scene, this.snapCam);
    const c = document.createElement('canvas'); c.width = W; c.height = H;
    const ctx = c.getContext('2d');
    ctx.drawImage(r.domElement, 0, r.domElement.height - H, W, H, 0, 0, W, H);
    r.setScissorTest(false);
    const size = new THREE.Vector2(); r.getSize(size); r.setViewport(0, 0, size.x, size.y);
    // โหมด IR ตอนกลางคืน
    if (this.nightFactor > 0.5) {
      const img = ctx.getImageData(0, 0, W, H);
      for (let i = 0; i < img.data.length; i += 4) {
        const g = Math.min(255, (img.data[i] * 0.3 + img.data[i + 1] * 0.59 + img.data[i + 2] * 0.11) * 3.2 + 20);
        img.data[i] = img.data[i + 1] = img.data[i + 2] = g;
      }
      ctx.putImageData(img, 0, 0);
    }
    return c;
  }

  // ---------------------------------------------------------------- loop
  tick() {
    const dt = Math.min(0.05, this.clock.getDelta());
    const t = this.clock.elapsedTime;
    if (this.autoTime) { let h = this.hour + dt * 0.05; if (h >= 24) h = 0; this.setTimeThrottled(h); }
    this.wx.update(dt, t);

    this.dad.w.update(dt);
    this.mom.w.update(dt);
    this.visitors.forEach(v => v.w.update(dt));
    this.updatePigs(dt, t);
    this.updateChickens(dt, t);
    this.updateFish(dt, t);
    this.updateDog(dt, t);
    this.sis.w.update(dt); this.kid.w.update(dt);
    this.updateBBQ(dt, t);
    this.updateTraffic(dt);
    this.updateCats(dt, t);
    this.updateBubbles(dt);
    this.fan.rotation.y += dt * 6;
    const gust = 0.03 + (this.wx.cur.wind || 0) * 0.012;
    this.palms?.forEach((p, i) => { p.rotation.z = Math.sin(t * (0.8 + gust * 6) + i) * gust; p.rotation.x = Math.cos(t * 0.6 + i) * gust * 0.7; });
    M.water.normalMap.offset.set(t * 0.02, t * 0.013);
    this.tv.material.emissiveIntensity = 0.5 + Math.sin(t * 7) * 0.15 + Math.sin(t * 2.3) * 0.1;
    if (this.coopDoor) this.coopDoor.rotation.x = lerp(this.coopDoor.rotation.x, this.devices.chickenDoor ? 1.4 : 0, 0.05);
    this.gates.forEach(g => (g.pivot.rotation.y = lerp(g.pivot.rotation.y, this.devices.gateClosed ? 0 : g.side * 1.3, 0.04)));

    this.nextVisitor -= dt;
    if (this.nextVisitor < 0) { this.spawnVisitor(); this.nextVisitor = rand(70, 120); }

    this.statusTimer -= dt;
    if (this.statusTimer < 0) { this.statusTimer = 0.5; this.renderStatus(); }
    this.tour?.update(dt);

    if (!this.visible) return;
    if (this.flying) this.flying(performance.now());
    this.controls.update();
    this.clampCamera();
    this.renderer.render(this.scene, this.camera);
    this.labelRenderer.render(this.scene, this.camera);
  }

  // กันกล้องมุดดิน/หลุดออกนอกพื้นที่: จุดหมุนอยู่บนพื้นในขอบเขตฟาร์ม และกล้องสูงจากพื้นอย่างน้อย 1.6 ม. (ระดับสายตา)
  clampCamera() {
    const t = this.controls.target, c = this.camera.position;
    const tx = clamp(t.x, -150, 150), tz = clamp(t.z, -170, 70), ty = clamp(t.y, 0, 20);
    if (tx !== t.x || tz !== t.z || ty !== t.y) {
      c.x += tx - t.x; c.z += tz - t.z; c.y += ty - t.y;
      t.set(tx, ty, tz);
    }
    if (c.y < 1.6) c.y = 1.6;
  }

  setTimeThrottled(h) {
    this.hour = h;
    this._tt = (this._tt || 0) + 1;
    if (this._tt % 10 === 0) this.setTime(h);
  }

  updatePigs(dt, t) {
    const eating = this.feedLeft > 0;
    if (eating) {
      this.feedLeft -= dt * 0.025;
      this.feedMesh.scale.set(1, Math.max(0.05, this.feedLeft), 1);
      if (this.feedLeft <= 0) { this.feedMesh.visible = false; this.pigs.forEach(p => (p.state = 'wander')); bus.emit('farm-event', 'หมูกินอาหารหมดราง'); }
    }
    for (const p of this.pigs) {
      const g = p.group;
      if (p.state === 'toTrough' || p.state === 'eat') {
        p.target = new THREE.Vector3(26 + p.slot * 1.6, 0.15, 0.6);
      }
      if (p.state === 'wander') {
        p.wait -= dt;
        if (!p.target && p.wait <= 0) p.target = new THREE.Vector3(rand(25, 35), 0.15, rand(-5.2, 0.5));
      }
      let moving = false;
      if (p.target) {
        const dx = p.target.x - g.position.x, dz = p.target.z - g.position.z, d = Math.hypot(dx, dz);
        if (d > 0.15) {
          const sp = p.state === 'toTrough' ? 1.6 : 0.6;
          g.position.x += dx / d * sp * dt; g.position.z += dz / d * sp * dt;
          let diff = Math.atan2(dx, dz) - g.rotation.y; diff = Math.atan2(Math.sin(diff), Math.cos(diff));
          g.rotation.y += diff * Math.min(1, dt * 5); moving = true;
        } else if (p.state === 'toTrough') { p.state = 'eat'; } else if (p.state === 'wander') { p.target = null; p.wait = rand(2, 7); }
      }
      if (p.state === 'eat') {
        let diff = 0 - g.rotation.y; diff = Math.atan2(Math.sin(diff), Math.cos(diff)); g.rotation.y += diff * dt * 4;
        p.head.rotation.x = 0.5 + Math.sin(t * 8 + p.slot) * 0.15;
      } else p.head.rotation.x *= 0.9;
      p.phase += dt * (moving ? 10 : 0);
      p.legs.forEach((l, i) => (l.rotation.x = moving ? Math.sin(p.phase + (i % 2 ? Math.PI : 0) + (i > 1 ? Math.PI : 0)) * 0.5 : 0));
      p.tail.rotation.z = Math.sin(t * 6 + p.slot) * 0.4;
    }
  }

  updateChickens(dt, t) {
    for (const c of this.chickens) {
      const g = c.group;
      c.wait -= dt;
      if (!c.target && c.wait <= 0) c.target = new THREE.Vector3(rand(26.4, 33.6), 0, rand(14.8, 21.2));
      if (c.target) {
        const dx = c.target.x - g.position.x, dz = c.target.z - g.position.z, d = Math.hypot(dx, dz);
        if (d > 0.1) {
          g.position.x += dx / d * 0.7 * dt; g.position.z += dz / d * 0.7 * dt;
          g.rotation.y = Math.atan2(dx, dz);
          g.position.y = Math.abs(Math.sin(t * 14)) * 0.03;
          c.head.position.z = 0.14 + Math.sin(t * 14) * 0.03;
        } else { c.target = null; c.wait = rand(1, 5); c.peck = rand(1, 3); }
      } else if (c.peck > 0) {
        c.peck -= dt; c.head.rotation.x = Math.max(0, Math.sin(t * 12)) * 1.2; c.head.position.y = 0.42 - Math.max(0, Math.sin(t * 12)) * 0.15;
      } else { c.head.rotation.x *= 0.9; c.head.position.y = 0.42; c.head.rotation.y = Math.sin(t * 2 + g.position.x) * 0.6; }
    }
  }

  updateFish(dt, t) {
    if (this.fishFeed > 0) {
      this.fishFeed -= dt;
      this.fish.forEach((f, i) => {
        const tx = -3.5 + Math.cos(i * 0.8) * 0.7, tz = Math.sin(i * 0.8) * 0.9, p = f.group.position;
        const dx = tx - p.x, dz = tz - p.z, d = Math.hypot(dx, dz);
        if (d > 0.05) { p.x += dx / d * Math.min(d, dt * 1.4); p.z += dz / d * Math.min(d, dt * 1.4); }
        p.y = -0.2 + Math.sin(t * 6 + i) * 0.04;
        f.group.lookAt(this.pond.position.x + tx + Math.sin(t * 3 + i) * 0.3, this.pond.position.y + p.y, this.pond.position.z + tz + Math.cos(t * 3 + i) * 0.3);
        f.tail.rotation.y = Math.sin(t * 16 + i) * 0.6;
        if (this.fishFeed <= 0) { f.a = Math.atan2(p.z, p.x); f.r = clamp(Math.hypot(p.x, p.z), 1.2, 3.6); }
      });
      return;
    }
    for (const f of this.fish) {
      f.a += f.sp * dt * (this.devices.aerator ? 1.6 : 1);
      const x = Math.cos(f.a) * f.r, z = Math.sin(f.a) * f.r;
      let y = -0.12 - f.depth;
      if (f.jump < 0 && Math.random() < dt * 0.02) f.jump = 0;
      if (f.jump >= 0) { f.jump += dt * 1.6; y = -0.12 + Math.sin(f.jump * Math.PI) * 0.7 - (f.jump > 1 ? 1 : 0); if (f.jump > 1) f.jump = -1; }
      f.group.position.set(x, y, z);
      f.group.lookAt(this.pond.position.x + Math.cos(f.a + 0.1 * Math.sign(f.sp)) * f.r, this.pond.position.y + y, this.pond.position.z + Math.sin(f.a + 0.1 * Math.sign(f.sp)) * f.r);
      f.tail.rotation.y = Math.sin(t * 10 + f.r) * 0.5;
    }
  }

  updateDog(dt, t) {
    const d = this.dog, g = d.group;
    // ถ้ามีผู้มาเยือนเข้าเขตบ้าน หมาจะวิ่งไปหา
    const v = this.visitors.find(v => v.h.group.position.z < 36);
    if (!v && this.bbq.active && d.wait <= 0) { d.target = this.bbq.center.clone().add(new THREE.Vector3(rand(-1.6, 1.6), 0, rand(1.2, 1.8))); d.wait = rand(6, 12); }
    if (v) d.target = v.h.group.position.clone().add(new THREE.Vector3(1.2, 0, 1.2));
    d.wait -= dt;
    if (!v && d.wait <= 0 && (!d.target || g.position.distanceTo(d.target) < 0.3)) {
      d.target = Math.random() < 0.4 && this.kid ? this.kid.h.group.position.clone().add(new THREE.Vector3(rand(-1.5, 1.5), 0, rand(-1.5, 1.5))) : new THREE.Vector3(rand(-6, 8), 0, rand(10, 30));
      d.wait = rand(3, 9);
      if (Math.hypot(d.target.x - 14, d.target.z - 22) < 5.6) d.target.x = 2;
    }
    const dx = d.target.x - g.position.x, dz = d.target.z - g.position.z, dist = Math.hypot(dx, dz);
    const moving = dist > 0.3;
    if (moving) {
      const sp = v ? 3 : 1.4;
      g.position.x += dx / dist * sp * dt; g.position.z += dz / dist * sp * dt;
      let diff = Math.atan2(dx, dz) - g.rotation.y; diff = Math.atan2(Math.sin(diff), Math.cos(diff)); g.rotation.y += diff * Math.min(1, dt * 6);
    }
    d.phase += dt * (moving ? 14 : 0);
    d.legs.forEach((l, i) => (l.rotation.x = moving ? Math.sin(d.phase + (i === 0 || i === 3 ? 0 : Math.PI)) * 0.6 : 0));
    d.tail.rotation.z = Math.sin(t * (v ? 18 : 6)) * 0.5;
  }

  // ---------------------------------------------------------------- หมูกะทะหน้าบ้าน
  buildBBQ() {
    const center = new THREE.Vector3(2, 0, 15.5);
    const g = new THREE.Group(); g.position.copy(center); g.visible = false; this.scene.add(g);
    const steel = new THREE.MeshStandardMaterial({ color: '#c9ccd0', metalness: 0.8, roughness: 0.35 });
    box(1.7, 0.04, 1.0, steel, 0, 0.72, 0, g);
    for (const [x, z] of [[-0.8, -0.45], [0.8, -0.45], [-0.8, 0.45], [0.8, 0.45]]) cyl(0.025, 0.025, 0.7, steel, x, 0.35, z, g, 6);
    const seats = [[-1.05, 0], [1.05, 0], [0, -0.8], [0, 0.8]];
    const stoolCols = ['#d63b3b', '#2f6fd6', '#d63b3b', '#2f6fd6'];
    seats.forEach(([x, z], i) => cyl(0.17, 0.2, 0.45, new THREE.MeshStandardMaterial({ color: stoolCols[i], roughness: 0.6 }), x, 0.225, z, g, 12));
    // เตาถ่าน + กระทะหมูกะทะ (โดมย่างตรงกลาง ขอบรอบเป็นน้ำซุป)
    cyl(0.2, 0.15, 0.24, new THREE.MeshStandardMaterial({ color: '#9c5a3c', roughness: 1 }), 0, 0.86, 0, g, 16);
    const coal = new THREE.MeshStandardMaterial({ color: '#ff6a1a', emissive: '#ff4a0a', emissiveIntensity: 2 });
    cyl(0.17, 0.17, 0.02, coal, 0, 0.985, 0, g, 16);
    const pan = new THREE.MeshStandardMaterial({ color: '#2b2b2b', metalness: 0.6, roughness: 0.4 });
    const dome = new THREE.Mesh(new THREE.SphereGeometry(0.18, 20, 8, 0, Math.PI * 2, 0, Math.PI / 2.4), pan); dome.position.y = 0.98; g.add(dome);
    const rim = new THREE.Mesh(new THREE.TorusGeometry(0.24, 0.045, 8, 24), pan); rim.rotation.x = Math.PI / 2; rim.position.y = 1.0; g.add(rim);
    const soup = new THREE.Mesh(new THREE.RingGeometry(0.19, 0.28, 24), new THREE.MeshStandardMaterial({ color: '#c98b4a', roughness: 0.2 })); soup.rotation.x = -Math.PI / 2; soup.position.y = 1.02; g.add(soup);
    const meat = [];
    for (let i = 0; i < 9; i++) {
      const a = (i / 9) * Math.PI * 2, r = i % 3 === 0 ? 0.05 : 0.12;
      const m = box(0.08, 0.015, 0.05, new THREE.MeshStandardMaterial({ color: '#e89a9a', roughness: 0.7 }), Math.cos(a) * r, 1.13 - r * 0.6, Math.sin(a) * r, g);
      m.rotation.set(rand(-0.4, 0.4), a, rand(-0.4, 0.4)); m.castShadow = false;
      meat.push({ m, t: Math.random() });
    }
    // จานผัก จานหมู น้ำจิ้ม น้ำแข็ง
    const plate = new THREE.MeshStandardMaterial({ color: '#f4f4f0' });
    [[-0.55, 0.28, '#4caf50'], [0.55, -0.28, '#e8a0a0'], [0.55, 0.3, '#4caf50'], [-0.55, -0.3, '#e8a0a0']].forEach(([x, z, c]) => {
      cyl(0.13, 0.11, 0.02, plate, x, 0.75, z, g, 14);
      const pile = sph(0.08, new THREE.MeshStandardMaterial({ color: c, roughness: 0.9 }), x, 0.78, z, g, 8); pile.scale.y = 0.4;
    });
    cyl(0.12, 0.1, 0.22, new THREE.MeshStandardMaterial({ color: '#d0e8f5', transparent: true, opacity: 0.7 }), -0.7, 0.85, 0, g, 12);
    for (let i = 0; i < 4; i++) cyl(0.03, 0.03, 0.11, new THREE.MeshStandardMaterial({ color: ['#c0392b', '#27ae60', '#f1c40f', '#2980b9'][i] }), 0.3 - i * 0.2, 0.8, 0.38, g, 8);
    // ไฟระย้าเหนือโต๊ะ (ติดเองตอนค่ำ)
    for (const x of [-2.4, 2.4]) cyl(0.04, 0.05, 2.6, M.frame, x, 1.3, -1.2, g, 6);
    for (let i = 0; i <= 14; i++) {
      const k = i / 14, x = -2.4 + k * 4.8, y = 2.55 - Math.sin(k * Math.PI) * 0.45;
      const b = sph(0.045, M.warm, x, y, -1.2 + Math.sin(k * Math.PI) * 1.2, g, 6); b.castShadow = false;
    }
    // ควันจากเตา
    const N = 60, pos = new Float32Array(N * 3), smokeData = [];
    for (let i = 0; i < N; i++) smokeData.push({ life: Math.random(), x: 0, z: 0 });
    const sg = new THREE.BufferGeometry(); sg.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    const smoke = new THREE.Points(sg, new THREE.PointsMaterial({ color: '#d8d8d8', size: 0.22, transparent: true, opacity: 0.35, depthWrite: false }));
    g.add(smoke);
    // ไฟติดกับฉากตลอด (แค่ปรับความสว่าง) จะได้ไม่ต้องคอมไพล์ shader ใหม่ตอนเริ่มกิจกรรม
    const light = new THREE.PointLight('#ff8a3c', 0, 7, 1.6); light.position.set(center.x, 1.3, center.z); this.scene.add(light);
    this.bbq = { group: g, center, seats: seats.map(([x, z]) => center.clone().add(new THREE.Vector3(x, 0, z))), meat, smoke, smokeData, light, active: false, timeLeft: 0, lastDay: null };
  }

  startBBQ(source = 'manual') {
    const b = this.bbq; if (b.active) return;
    b.active = true; b.group.visible = true; b.timeLeft = source === 'auto' ? 300 : 180;
    b.light.intensity = 3;
    this.gen++; // หยุดกิจวัตรเดิมของทุกคน
    const d = this.dad; d.busy = false; d.bucket.visible = false; d.h.holding = false; d.bucket.rotation.x = 0;
    this.fatherState = 'ไปกินหมูกะทะ'; this.sis.task = 'ไปกินหมูกะทะ'; this.kid.task = 'ไปกินหมูกะทะ';
    const people = [[this.dad, 2], [this.mom, 0], [this.sis, 1], [this.kid, 3]];
    for (const [who, seat] of people) {
      const w = who.w, h = who.h, p = h.group.position, s = b.seats[seat];
      w.locked = true; h.holding = false; w.wait = 0;
      let path;
      if (who === this.mom) path = [[-0.75, 0.65, 3.5], [-0.75, 0.65, 7.2], [3.2, 0.65, 7.6], [3.2, 0, 10]];
      else if (p.x > 22) path = [[24, 0, 12.6], [8, 0, 12.6]];
      else if (p.x < -18) path = [[-18, 0, 18.5], [-6, 0, 13]];
      else path = [];
      w.go([...path, [s.x, 0, s.z]], () => {
        h.group.rotation.y = Math.atan2(b.center.x - s.x, b.center.z - s.z);
        h.baseY = 0; h.sitting = true; h.eating = true; h.eatOffset = seat * 1.7;
        if (who === this.dad) this.fatherState = 'กินหมูกะทะกับครอบครัว';
        if (who === this.sis) this.sis.task = 'กินหมูกะทะ';
        if (who === this.kid) this.kid.task = 'กินหมูกะทะ (แอบป้อนแมว)';
      }, true);
    }
    bus.emit('farm-event', '🍖 ครอบครัวกำลังตั้งวงกินหมูกะทะหน้าบ้าน');
    bus.emit('bbq', true);
  }

  endBBQ() {
    const b = this.bbq; if (!b.active) return;
    b.active = false; b.light.intensity = 0;
    setTimeout(() => { if (!b.active) b.group.visible = false; }, 8000); // เก็บโต๊ะทีหลัง
    this.gen++;
    for (const who of [this.dad, this.mom, this.sis, this.kid]) { who.h.sitting = false; who.h.eating = false; who.w.locked = false; }
    this.mom.w.go([[3.2, 0, 10], [3.2, 0.65, 7.6], [-0.75, 0.65, 7.2], [-0.75, 0.65, 3.5]], () => this.momLoop());
    this.dad.w.go([[4, 0, 10.5]], () => { this.fatherState = 'พักผ่อนหน้าบ้าน'; this.dad.h.group.rotation.y = 0.3; });
    this.fatherState = 'เก็บโต๊ะ เดินกลับหน้าบ้าน';
    this.sis.task = 'เก็บจานล้างจาน';
    const gen = this.gen;
    this.sis.w.go([[3.2, 0, 10], [-3, 0, 11.5]], () => { this.sis.task = 'พักหน้าบ้าน'; setTimeout(() => this.sisLoop(gen), 30000); });
    this.kidLoop();
    bus.emit('farm-event', 'กินหมูกะทะเสร็จแล้ว อิ่มกันทั้งบ้าน');
    bus.emit('bbq', false);
  }

  updateBBQ(dt, t) {
    const b = this.bbq;
    // ช่วงเย็น 18:00–20:30 ตั้งวงเองวันละครั้ง
    const day = new Date().toDateString();
    if (!b.active && this.hour >= 18 && this.hour < 20.5 && b.lastDay !== day) { b.lastDay = day; this.startBBQ('auto'); }
    if (!b.active) return;
    b.timeLeft -= dt;
    if (b.timeLeft <= 0 || this.hour >= 21.5) { this.endBBQ(); return; }
    b.light.intensity = 2.6 + Math.sin(t * 13) * 0.4 + Math.sin(t * 7.3) * 0.3;
    for (const m of b.meat) { // หมูสุกจากชมพู → น้ำตาล แล้วถูกคีบไปกิน ใส่ชิ้นใหม่
      m.t += dt * 0.06;
      if (m.t > 1) m.t = 0;
      m.m.material.color.setRGB(lerp(0.91, 0.45, m.t), lerp(0.6, 0.27, m.t), lerp(0.6, 0.15, m.t));
      m.m.visible = m.t < 0.92;
    }
    const pos = b.smoke.geometry.attributes.position;
    b.smokeData.forEach((s, i) => {
      s.life += dt * 0.35;
      if (s.life > 1) { s.life = 0; s.x = rand(-0.1, 0.1); s.z = rand(-0.1, 0.1); }
      pos.setXYZ(i, s.x + s.life * 0.6 * (this.wx?.cur.wind || 1) * 0.2, 1.1 + s.life * 2.2, s.z + Math.sin(s.life * 6 + i) * 0.15);
    });
    pos.needsUpdate = true;
  }

  // ---------------------------------------------------------------- รถวิ่งผ่านหน้าบ้าน
  spawnVehicle() {
    const r = Math.random();
    const type = r < 0.32 ? 'sedan' : r < 0.6 ? 'pickup' : r < 0.86 ? 'moto' : 'truck';
    const dir = Math.random() < 0.5 ? 1 : -1;
    const laneZ = dir > 0 ? 44.3 : 47.7; // ขับชิดซ้ายแบบไทย
    const colors = ['#c0392b', '#ecf0f1', '#2c3e50', '#7f8c8d', '#2980b9', '#d4ac0d', '#1e1e1e', '#8e44ad'];
    const color = colors[Math.floor(Math.random() * colors.length)];
    let g, label, speed;
    if (type === 'sedan' || type === 'pickup') {
      g = this.makeCar(this.scene, 0, 0, color, type === 'pickup');
      label = type === 'pickup' ? 'รถกระบะ' : 'รถเก๋ง'; speed = rand(10, 17);
    } else if (type === 'truck') {
      g = new THREE.Group(); this.scene.add(g);
      const cab = new THREE.MeshStandardMaterial({ color: '#2f6f9f', roughness: 0.5 });
      box(2.1, 1.7, 1.7, cab, 0, 1.45, 2.2, g);
      box(1.9, 0.6, 0.05, new THREE.MeshStandardMaterial({ color: '#1a222a', metalness: 0.6, roughness: 0.1 }), 0, 1.8, 3.06, g);
      box(2.2, 0.25, 4.4, M.wood, 0, 0.75, -0.9, g);
      for (const x of [-1.05, 1.05]) box(0.08, 0.7, 4.4, M.wood, x, 1.2, -0.9, g);
      for (let i = 0; i < 6; i++) cyl(0.28, 0.28, 0.8, new THREE.MeshStandardMaterial({ color: '#e6e6e6' }), -0.45 + (i % 2) * 0.9, 1.3, -2.4 + Math.floor(i / 2) * 1.2, g, 12);
      for (const [wx, wz] of [[-0.95, 2.2], [0.95, 2.2], [-0.95, -1.6], [0.95, -1.6], [-0.95, -2.6], [0.95, -2.6]]) { const w = cyl(0.45, 0.45, 0.3, M.black, wx, 0.45, wz, g, 14); w.rotation.z = Math.PI / 2; }
      const hl = new THREE.MeshStandardMaterial({ color: '#fff', emissive: '#fff', emissiveIntensity: 0.3 });
      box(0.3, 0.15, 0.05, hl, -0.75, 0.9, 3.06, g); box(0.3, 0.15, 0.05, hl, 0.75, 0.9, 3.06, g);
      const tl = new THREE.MeshStandardMaterial({ color: '#a11', emissive: '#f22', emissiveIntensity: 0.4 });
      box(0.25, 0.12, 0.05, tl, -0.9, 0.8, -3.12, g); box(0.25, 0.12, 0.05, tl, 0.9, 0.8, -3.12, g);
      g.userData = { hl, tl };
      label = 'รถบรรทุกน้ำยาง'; speed = rand(7, 11);
    } else {
      g = new THREE.Group(); this.scene.add(g);
      const frame = new THREE.MeshStandardMaterial({ color, metalness: 0.4, roughness: 0.4 });
      box(0.28, 0.35, 1.2, frame, 0, 0.6, 0, g);
      box(0.3, 0.12, 0.6, M.black, 0, 0.82, -0.2, g);
      for (const z of [0.62, -0.62]) { const w = new THREE.Mesh(new THREE.TorusGeometry(0.28, 0.08, 8, 16), M.black); w.rotation.y = Math.PI / 2; w.position.set(0, 0.32, z); w.castShadow = true; g.add(w); }
      const bar = box(0.7, 0.04, 0.04, M.frame, 0, 1.05, 0.5, g); void bar;
      const hl = new THREE.MeshStandardMaterial({ color: '#fff', emissive: '#fff', emissiveIntensity: 0.3 });
      box(0.14, 0.12, 0.05, hl, 0, 0.9, 0.62, g);
      const tl = new THREE.MeshStandardMaterial({ color: '#a11', emissive: '#f22', emissiveIntensity: 0.4 });
      box(0.12, 0.08, 0.05, tl, 0, 0.85, -0.62, g);
      const rider = makeHuman({ hat: 'helmet', hatColor: ['#111', '#c0392b', '#f1f1f1', '#2980b9'][Math.floor(Math.random() * 4)], shirt: colors[Math.floor(Math.random() * colors.length)] });
      rider.legL.rotation.x = rider.legR.rotation.x = -1.2; rider.armL.rotation.x = rider.armR.rotation.x = -1.15;
      rider.group.position.set(0, -0.12, -0.15); rider.group.rotation.x = 0.12; g.add(rider.group);
      g.userData = { hl, tl };
      label = 'มอเตอร์ไซค์'; speed = rand(10, 14);
    }
    g.rotation.y = dir > 0 ? Math.PI / 2 : -Math.PI / 2;
    g.position.set(-dir * 300, 0, laneZ);
    const id = 'CAR-' + (++this.carSeq);
    const ent = { id, type: 'vehicle', label, obj: g };
    this.vehicles.push({ g, dir, speed, label, ent, passed: false });
    this.entities.push(ent);
  }

  updateTraffic(dt) {
    this.nextCar -= dt;
    if (this.nextCar < 0) { this.spawnVehicle(); this.nextCar = this.nightFactor > 0.6 ? rand(14, 35) : rand(5, 16); }
    const night = this.nightFactor > 0.4 || (this.wxState?.rain || 0) > 0.5;
    for (const v of this.vehicles) {
      v.g.position.x += v.dir * v.speed * dt;
      v.g.userData.hl.emissiveIntensity = night ? 4 : 0.3;
      v.g.userData.tl.emissiveIntensity = night ? 2.5 : 0.4;
      if (!v.passed && v.dir * v.g.position.x > 0) { v.passed = true; this.carsToday++; bus.emit('vehicle-pass', { label: v.label, total: this.carsToday }); }
      if (Math.abs(v.g.position.x) > 310) {
        v.dead = true; this.scene.remove(v.g);
        v.g.traverse(o => { if (o.isMesh) { o.geometry.dispose(); } });
        this.entities = this.entities.filter(e => e !== v.ent);
      }
    }
    this.vehicles = this.vehicles.filter(v => !v.dead);
  }

  updateCats(dt, t) {
    const onDeck = (x, z) => x > -10 && x < 2.4 && z > 5 && z < 8.9;
    for (const c of this.cats) {
      const g = c.group;
      if (c.sleep > 0) { // นอนขด
        c.sleep -= dt;
        c.body.position.y = lerp(c.body.position.y, -0.12, 0.1);
        c.legs.forEach(l => (l.rotation.x = lerp(l.rotation.x, 1.4, 0.1)));
        c.head.rotation.x = lerp(c.head.rotation.x, 0.5, 0.05);
        c.body.scale.y = 1 + Math.sin(t * 2 + c.phase) * 0.03;
        continue;
      }
      c.body.position.y = lerp(c.body.position.y, 0, 0.15); c.head.rotation.x *= 0.9;
      c.wait -= dt;
      if (!c.target && c.wait <= 0) {
        const r = Math.random();
        if (this.bbq.active && r < 0.5) { const a = rand(0, Math.PI * 2); c.target = this.bbq.center.clone().add(new THREE.Vector3(Math.cos(a) * 1.7, 0, Math.sin(a) * 1.7)); c.begging = true; }
        else if (r < 0.15) { c.sleep = rand(15, 40); continue; }
        else if (r < 0.4) c.target = new THREE.Vector3(rand(-9, 1.5), 0, rand(5.6, 8.4)); // ระเบียง
        else if (r < 0.55) { const a = rand(Math.PI * 0.6, Math.PI * 1.4); c.target = new THREE.Vector3(14 + Math.cos(a) * 5.4, 0, 22 + Math.sin(a) * 5.4); c.watchPond = true; } // ขอบบ่อปลา
        else if (r < 0.7 && this.kid) c.target = this.kid.h.group.position.clone().add(new THREE.Vector3(rand(-1, 1), 0, rand(-1, 1)));
        else { do { c.target = new THREE.Vector3(rand(-10, 9), 0, rand(10, 32)); } while (Math.hypot(c.target.x - 14, c.target.z - 22) < 5.5); }
      }
      let moving = false;
      if (c.target) {
        const dx = c.target.x - g.position.x, dz = c.target.z - g.position.z, d = Math.hypot(dx, dz);
        if (d > 0.08) {
          const sp = d > 6 ? 1.6 : 0.7;
          g.position.x += dx / d * sp * dt; g.position.z += dz / d * sp * dt;
          let diff = Math.atan2(dx, dz) - g.rotation.y; diff = Math.atan2(Math.sin(diff), Math.cos(diff)); g.rotation.y += diff * Math.min(1, dt * 6);
          moving = true;
        } else {
          c.target = null; c.wait = rand(3, 12);
          if (c.watchPond) { g.rotation.y = Math.atan2(14 - g.position.x, 22 - g.position.z); c.watchPond = false; }
          if (c.begging) { g.rotation.y = Math.atan2(this.bbq.center.x - g.position.x, this.bbq.center.z - g.position.z); c.begging = false; c.wait = rand(8, 15); }
        }
      }
      g.position.y = lerp(g.position.y, onDeck(g.position.x, g.position.z) ? 0.68 : 0, 0.25);
      c.phase += dt * (moving ? 12 : 0);
      c.legs.forEach((l, i) => (l.rotation.x = moving ? Math.sin(c.phase + (i === 0 || i === 3 ? 0 : Math.PI)) * 0.55 : lerp(l.rotation.x, 0, 0.2)));
      c.tail.rotation.x = Math.sin(t * 1.5 + c.phase) * 0.25; c.tail.rotation.z = Math.sin(t * 2.2 + c.phase) * 0.4;
      if (!moving) c.head.rotation.y = Math.sin(t * 0.7 + c.phase) * 0.6;
    }
  }

  updateBubbles(dt) {
    if (!this.bubbles.visible) return;
    const pos = this.bubbles.geometry.attributes.position;
    this.bubbleData.forEach((b, i) => {
      b.life += dt * 0.9;
      if (b.life > 1) { b.life = 0; b.v.set(rand(-0.1, 0.1), rand(1.5, 2.4), rand(-0.1, 0.1)); }
      const tt = b.life;
      pos.setXYZ(i, b.v.x * tt * 6, b.v.y * tt - 4.9 * tt * tt * 0.9, b.v.z * tt * 6);
    });
    pos.needsUpdate = true;
  }

  renderStatus() {
    const people = this.entities.filter(e => e.type === 'human');
    const h = this.hour;
    const hh = `${String(Math.floor(h)).padStart(2, '0')}:${String(Math.floor((h % 1) * 60)).padStart(2, '0')}`;
    this.statusEl.innerHTML = `
      <div class="st"><span>เวลาในฉาก</span><b>${hh} ${this.nightFactor > 0.5 ? '🌙' : '☀️'}</b></div>
      <div class="st"><span>คนในพื้นที่</span><b>${people.length} คน</b></div>
      <div class="st"><span>พ่อ</span><b>${this.fatherState}</b></div>
      ${this.bbq.active ? '<div class="st"><span>🍖 หมูกะทะหน้าบ้าน</span><b>กำลังกิน</b></div>' : ''}
      <div class="st"><span>พี่สาว / น้องสาว</span><b>${this.sis.task} / ${this.kid.task}</b></div>
      <div class="st"><span>หมู / ไก่ / ปลา / แมว</span><b>${this.pigs.length} / ${this.chickens.length} / ${this.fish.length} / ${this.cats.length}</b></div>
      <div class="st"><span>สวนยางพารา</span><b>${this.rubberCount} ต้น</b></div>
      <div class="st"><span>ปั๊มไฮโดร / เติมอากาศบ่อ</span><b>${this.devices.pump ? '🟢' : '⚪'} / ${this.devices.aerator ? '🟢' : '⚪'}</b></div>`;
  }
}
