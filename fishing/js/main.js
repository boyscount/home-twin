// ตกปลาสบายใจ — เกมตกปลาริมน้ำตก (Three.js r160, ไม่มี build step)
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { Line2 } from 'three/addons/lines/Line2.js';
import { LineMaterial } from 'three/addons/lines/LineMaterial.js';
import { LineGeometry } from 'three/addons/lines/LineGeometry.js';
import { toon, mossy, swaying, shared } from './toon.js';
import { buildWorld, groundH, inWater, walkable, standY, onDock, POND, WATER_Y } from './world.js';
import { SPECIES, byId, rollFish, loadDex, record, makeFish } from './fish.js';
import { initAudio, sfx, setMuted, isMuted, setFallDistance } from './audio.js';

const VER = new URL(import.meta.url).search;          // ?v=… ของไฟล์นี้ ใช้ต่อท้ายไฟล์โมเดลด้วย
const $ = id => document.getElementById(id);
const touch = matchMedia('(pointer: coarse)').matches || 'ontouchstart' in window;
const mobile = touch || Math.min(screen.width, screen.height) < 700;
if (touch) document.body.classList.add('touch');

// ---------- renderer / scene / camera ----------
const canvas = $('c');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: !mobile || devicePixelRatio < 2, powerPreference: 'high-performance' });
const pixelRatio = Math.min(devicePixelRatio, mobile ? 1.75 : 2);
renderer.setPixelRatio(pixelRatio);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.outputColorSpace = THREE.SRGBColorSpace;
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(40, 1, 0.3, 400);

function resize() {
  const w = innerWidth, h = innerHeight;
  renderer.setSize(w, h, false);
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
  if (lineMat) lineMat.resolution.set(w * pixelRatio, h * pixelRatio);
}
addEventListener('resize', resize);

// ---------- โหลดโมเดลจาก Blender ----------
const MAT = {
  Cliff: () => mossy(0x9a8b78, 0.7), Rock: () => mossy(0x958f84, 0.6), Bark: () => toon(0x6e4d35),
  Pine: () => swaying(0x3b7a4f, 0.05), Leaf: () => swaying(0x64a644, 0.07), Leaf2: () => toon(0x74b04a),
  Skin: () => toon(0xf3c6a0), Shirt: () => toon(0x3b5a96), Pants: () => toon(0x3d3843), Hat: () => toon(0xebcd8e),
  HatBand: () => toon(0xc0573e), Rod: () => toon(0xd9b56c), Eye: () => new THREE.MeshBasicMaterial({ color: 0x1a1a1a }),
  Hair: () => toon(0x2c231e), Wood: () => toon(0xb08257), WoodDark: () => toon(0x75553a),
  Fish: () => toon(0xffffff), FishFin: () => toon(0xdddddd),
};
const matCache = {};
function convert(root) {
  root.traverse(o => {
    if (!o.isMesh) return;
    const n = o.material.name;
    if (!matCache[n]) { matCache[n] = (MAT[n] || (() => toon(o.material.color)))(); matCache[n].name = n; }
    o.material = matCache[n];
  });
}

const assets = { clone: name => { const src = assets.root.getObjectByName(name); if (!src) throw new Error('ไม่พบโมเดล ' + name); const c = src.clone(true); c.position.set(0, 0, 0); c.rotation.set(0, 0, 0); return c; } };

let world, player, bobber, line, lineMat, aimRing, dex;
const loadBar = $('loadBar').firstElementChild;

new GLTFLoader().load('models/assets.glb' + VER, gltf => {
  loadBar.style.width = '70%';
  assets.root = gltf.scene;
  convert(assets.root);
  setTimeout(init, 30);
}, e => { if (e.total) loadBar.style.width = (5 + 60 * e.loaded / e.total) + '%'; }, err => {
  console.error(err);
  $('loadBar').outerHTML = '<p>โหลดโมเดลไม่สำเร็จ ลองรีเฟรชอีกครั้ง</p>';
});

// ---------- ตัวละคร ----------
function makePlayer() {
  const g = assets.clone('Fisher');
  const p = {
    root: g, pos: new THREE.Vector3(1.5, 0, 4.5), yaw: Math.PI, vel: 0, phase: 0,
    legL: g.getObjectByName('LegL'), legR: g.getObjectByName('LegR'), armL: g.getObjectByName('ArmL'), armR: g.getObjectByName('ArmR'),
    head: g.getObjectByName('Head'), body: g.getObjectByName('Body'), tip: g.getObjectByName('RodTip'), armRX: 0,
  };
  g.traverse(o => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
  p.pos.y = standY(p.pos.x, p.pos.z);
  scene.add(g);
  return p;
}
const buzz = p => { try { if (navigator.vibrate && navigator.userActivation?.hasBeenActive) navigator.vibrate(p); } catch (e) { /* ไม่รองรับ */ } };
const fwd = (yaw, out = new THREE.Vector3()) => out.set(Math.sin(yaw), 0, Math.cos(yaw));

function makeBobber() {
  const g = new THREE.Group();
  const top = new THREE.Mesh(new THREE.SphereGeometry(0.11, 12, 8, 0, Math.PI * 2, 0, Math.PI / 2), toon(0xe2493a));
  const bot = new THREE.Mesh(new THREE.SphereGeometry(0.11, 12, 8, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2), toon(0xffffff));
  const stick = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, 0.16, 5), toon(0xe2493a));
  stick.position.y = 0.17;
  g.add(top, bot, stick);
  g.traverse(o => { if (o.isMesh) o.castShadow = true; });
  scene.add(g);
  return g;
}

// ---------- สายเบ็ด ----------
const LINE_N = 24;
const linePts = new Float32Array(LINE_N * 3);
function makeLine() {
  const geo = new LineGeometry();
  geo.setPositions(linePts);
  lineMat = new LineMaterial({ color: 0xf8f8f0, linewidth: 1.6, transparent: true, opacity: 0.9 });
  const l = new Line2(geo, lineMat);
  l.frustumCulled = false;
  scene.add(l);
  return l;
}
const tA = new THREE.Vector3(), tB = new THREE.Vector3(), tC = new THREE.Vector3();
function updateLine(a, b, sag) {
  tC.addVectors(a, b).multiplyScalar(0.5);
  tC.y -= sag;
  for (let i = 0; i < LINE_N; i++) {
    const t = i / (LINE_N - 1), u = 1 - t;
    linePts[i * 3] = u * u * a.x + 2 * u * t * tC.x + t * t * b.x;
    linePts[i * 3 + 1] = u * u * a.y + 2 * u * t * tC.y + t * t * b.y;
    linePts[i * 3 + 2] = u * u * a.z + 2 * u * t * tC.z + t * t * b.z;
  }
  line.geometry.setPositions(linePts);
}

// ---------- รูปปลาสำหรับสมุด/การ์ด (เรนเดอร์ครั้งเดียวตอนเริ่ม) ----------
const thumbs = {};
function renderThumbs() {
  const c = document.createElement('canvas');
  c.width = 320; c.height = 160;
  const r = new THREE.WebGLRenderer({ canvas: c, alpha: true, antialias: true, preserveDrawingBuffer: true });
  r.outputColorSpace = THREE.SRGBColorSpace;
  const s = new THREE.Scene();
  s.add(new THREE.HemisphereLight(0xffffff, 0x8899aa, 1.2));
  const d = new THREE.DirectionalLight(0xffffff, 2.2); d.position.set(1, 3, 4); s.add(d);
  const cam = new THREE.OrthographicCamera(-0.75, 0.75, 0.375, -0.375, 0.1, 10);
  cam.position.set(0, 0.25, 3); cam.lookAt(0, 0, 0);
  for (const sp of SPECIES) {
    const f = makeFish(assets, sp);
    const k = 1.05 / (0.6 * sp.shape[0] + 0.55);
    f.scale.multiplyScalar(k);
    f.position.set(0.05 * k, 0, 0);
    f.rotation.set(0, -0.35, 0.08);
    s.add(f);
    r.render(s, cam);
    thumbs[sp.id] = c.toDataURL('image/png');
    s.remove(f);
  }
  r.dispose();
  r.forceContextLoss();
}

// ---------- อินพุต ----------
const keys = {};
const joy = { x: 0, y: 0, id: null };
let actionHeld = false, actionPressedAt = 0;
const modalOpen = () => !$('catch').classList.contains('hidden') || !$('dex').classList.contains('hidden');

function actionDown() {
  if (modalOpen() || !started) return;
  if (actionHeld) return;
  actionHeld = true; actionPressedAt = performance.now();
  $('action').classList.add('pressed');
  game.onDown();
}
function actionUp() {
  if (!actionHeld) return;
  actionHeld = false;
  $('action').classList.remove('pressed');
  game.onUp();
}
addEventListener('keydown', e => {
  if (e.repeat && (e.code === 'Space' || e.code === 'KeyE')) { e.preventDefault(); return; }
  keys[e.code] = true;
  if (e.code === 'Space' || e.code === 'KeyE') { e.preventDefault(); if (!$('catch').classList.contains('hidden')) closeCatch(); else actionDown(); }
  if (e.code === 'Enter' && !$('catch').classList.contains('hidden')) closeCatch();
  if (e.code === 'Escape') { closeCatch(); $('dex').classList.add('hidden'); }
  if ((e.code === 'KeyB' || e.code === 'Tab') && started) { e.preventDefault(); toggleDex(); }
});
addEventListener('keyup', e => { keys[e.code] = false; if (e.code === 'Space' || e.code === 'KeyE') actionUp(); });
addEventListener('blur', () => { for (const k in keys) keys[k] = false; actionUp(); });
canvas.addEventListener('pointerdown', e => { if (e.pointerType === 'mouse' && e.button === 0) { initAudio(); actionDown(); } });
addEventListener('pointerup', e => { if (e.pointerType === 'mouse') actionUp(); });
canvas.addEventListener('contextmenu', e => e.preventDefault());

const actBtn = $('action');
actBtn.addEventListener('pointerdown', e => { e.preventDefault(); try { actBtn.setPointerCapture(e.pointerId); } catch (_) { /* ไม่มี pointer จริง */ } initAudio(); actionDown(); });
actBtn.addEventListener('pointerup', e => { e.preventDefault(); actionUp(); });
actBtn.addEventListener('pointercancel', actionUp);
actBtn.addEventListener('contextmenu', e => e.preventDefault());

const joyEl = $('joy'), knob = joyEl.firstElementChild;
function joyMove(e) {
  const r = joyEl.getBoundingClientRect();
  let dx = e.clientX - (r.left + r.width / 2), dy = e.clientY - (r.top + r.height / 2);
  const max = r.width * 0.38, l = Math.hypot(dx, dy);
  if (l > max) { dx *= max / l; dy *= max / l; }
  knob.style.transform = `translate(${dx}px, ${dy}px)`;
  joy.x = dx / max; joy.y = dy / max;
}
joyEl.addEventListener('pointerdown', e => { e.preventDefault(); joy.id = e.pointerId; try { joyEl.setPointerCapture(e.pointerId); } catch (_) { /* ไม่มี pointer จริง */ } initAudio(); joyMove(e); });
joyEl.addEventListener('pointermove', e => { if (e.pointerId === joy.id) joyMove(e); });
const joyEnd = e => { if (e.pointerId !== joy.id) return; joy.id = null; joy.x = joy.y = 0; knob.style.transform = ''; };
joyEl.addEventListener('pointerup', joyEnd);
joyEl.addEventListener('pointercancel', joyEnd);

function moveInput() {
  let x = (keys.KeyD || keys.ArrowRight ? 1 : 0) - (keys.KeyA || keys.ArrowLeft ? 1 : 0);
  let z = (keys.KeyS || keys.ArrowDown ? 1 : 0) - (keys.KeyW || keys.ArrowUp ? 1 : 0);
  if (joy.id !== null) { x = joy.x; z = joy.y; }
  const l = Math.hypot(x, z);
  if (l > 1) { x /= l; z /= l; }
  return { x, z, l: Math.min(l, 1) };
}

// ---------- UI ----------
let toastTimer;
function toast(msg, ms = 1800) {
  const t = $('toast');
  t.textContent = msg; t.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove('show'), ms);
}
let lastHint = '';
function hint(s) { if (s !== lastHint) { $('hint').textContent = s; lastHint = s; } }
let lastBtn = '';
function actionLabel(ico, txt, hot = false) {
  const k = ico + txt + hot;
  if (k === lastBtn) return;
  lastBtn = k;
  actBtn.querySelector('.ico').textContent = ico;
  actBtn.querySelector('.txt').textContent = txt;
  actBtn.classList.toggle('hot', hot);
}
function updateCount() { $('count').querySelector('b').textContent = dex.total; }
const stars = n => '★'.repeat(n) + '☆'.repeat(Math.max(0, 4 - n));

function toggleDex() {
  const d = $('dex');
  if (!d.classList.contains('hidden')) { d.classList.add('hidden'); return; }
  actionUp();
  sfx.click();
  $('dexNew').classList.add('hidden');
  const got = SPECIES.filter(s => dex.dex[s.id]).length;
  $('dexSum').textContent = `พบแล้ว ${got} / ${SPECIES.length} ชนิด · ตกได้ทั้งหมด ${dex.total} ตัว`;
  $('dexGrid').innerHTML = SPECIES.map(s => {
    const e = dex.dex[s.id];
    if (!e) return `<div class="dexItem locked"><img src="${thumbs[s.id]}" alt=""><h3>???</h3><div class="stars">${stars(s.stars)}</div><div class="meta">${s.rare ? 'ว่ากันว่าซ่อนอยู่ใกล้น้ำตก…' : 'ยังไม่เคยพบ'}</div></div>`;
    return `<div class="dexItem${s.rare ? ' rare' : ''}"><img src="${thumbs[s.id]}" alt="${s.name}"><h3>${s.name}</h3><div class="stars">${stars(s.stars)}</div>
      <div class="meta">ได้ ${e.n} ตัว · ใหญ่สุด <b>${e.best.toFixed(2)} กก.</b> (${e.cm} ซม.)</div><div class="desc">${s.desc}</div></div>`;
  }).join('');
  d.classList.remove('hidden');
}
$('btnDex').addEventListener('click', toggleDex);
$('dexClose').addEventListener('click', toggleDex);
$('dex').addEventListener('click', e => { if (e.target.id === 'dex') toggleDex(); });
$('btnMute').addEventListener('click', () => { initAudio(); setMuted(!isMuted()); $('btnMute').textContent = isMuted() ? '🔇' : '🔊'; });
$('btnMute').textContent = isMuted() ? '🔇' : '🔊';
$('catchOk').addEventListener('click', closeCatch);
function closeCatch() {
  if ($('catch').classList.contains('hidden')) return;
  $('catch').classList.add('hidden');
  sfx.click();
  game.endCatch();
}

// ---------- ระบบตกปลา ----------
const game = {
  state: 'free', t: 0, charge: 0, target: new THREE.Vector3(), from: new THREE.Vector3(), bob: new THREE.Vector3(),
  flight: 0, flightDur: 1, onWater: false, biteAt: 0, nibbles: [], biteEnd: 0, fish: null,
  tension: 0.4, prog: 0.2, slack: 0, dashT: 0, dashEnd: 0, nextDash: 0, fishGoal: new THREE.Vector3(), fishWob: 0,
  caughtMesh: null, caughtT: 0, retr: 0, lastReel: 0, nextSplash: 0,

  set(s) { this.state = s; this.t = 0; },
  onDown() {
    switch (this.state) {
      case 'free': this.set('charging'); this.charge = 0; break;
      case 'waiting': this.startRetrieve(); toast('เก็บสาย', 900); break;
      case 'bite': this.startFight(); break;
    }
  },
  onUp() {
    if (this.state === 'charging') this.cast();
  },
  cast() {
    const p = player.pos, f = fwd(player.yaw);
    const dist = 1.3 + this.charge * 8.7;
    this.target.set(p.x + f.x * dist, 0, p.z + f.z * dist);
    const dx = this.target.x - POND.x, dz = this.target.z - POND.z, d = Math.hypot(dx, dz);
    const inCliff = dz < 0 && Math.acos(Math.max(-1, Math.min(1, -dz / d))) < 2.05 && d > 6.9;
    this.onWater = inWater(this.target.x, this.target.z) && !onDock(this.target.x, this.target.z) && !inCliff;
    this.target.y = this.onWater ? WATER_Y + 0.03 : (onDock(this.target.x, this.target.z) ? 0.3 : groundH(this.target.x, this.target.z) + 0.08);
    player.tip.getWorldPosition(this.from);
    this.flightDur = 0.5 + dist * 0.045;
    this.flight = 0;
    this.set('casting');
    sfx.whoosh();
  },
  land() {
    this.bob.copy(this.target);
    if (!this.onWater) {
      sfx.click();
      toast('เหวี่ยงไม่ถึงน้ำ ลองใหม่นะ', 1300);
      this.set('landed');
      return;
    }
    sfx.plop();
    world.addRipple(this.bob.x, this.bob.z, 1.2);
    const nearFall = this.bob.distanceTo(world.fallPos) < 3.4;
    const depth = WATER_Y - groundH(this.bob.x, this.bob.z);
    this.fish = rollFish(nearFall, depth);
    this.newBite();
    this.set('waiting');
  },
  newBite() {
    this.biteAt = this.t + 2.2 + Math.random() * 5.5;
    this.nibbles = [];
    const n = Math.floor(Math.random() * 3);
    for (let i = 0; i < n; i++) this.nibbles.push(this.biteAt - 0.6 - Math.random() * 1.8);
    this.nibbles.sort((a, b) => a - b);
  },
  startRetrieve() { this.retr = 0; this.from.copy(this.bob); this.set('retrieve'); },
  startFight() {
    sfx.hook();
    $('alert').classList.add('hidden');
    this.tension = 0.45; this.prog = 0.22; this.slack = 0;
    this.nextDash = 1 + Math.random() * 1.5; this.dashEnd = 0;
    this.from.copy(this.bob);
    const p = player.pos, f = fwd(player.yaw);
    // จุดที่ปลาจะถูกดึงมา: ริมน้ำใกล้ตัวผู้เล่น
    this.fishGoal.set(p.x + f.x * 1.2, WATER_Y, p.z + f.z * 1.2);
    for (let k = 0; k < 20 && !inWater(this.fishGoal.x, this.fishGoal.z); k++) this.fishGoal.addScaledVector(f, 0.25);
    $('fightName').textContent = '???';
    $('fight').classList.remove('hidden');
    this.set('fight');
    buzz(60);
  },
  endFight(result) {
    $('fight').classList.add('hidden');
    $('fight').classList.remove('danger');
    if (result === 'caught') {
      const sp = this.fish.sp;
      sfx.catch(sp.stars >= 3);
      sfx.splash();
      world.addRipple(this.bob.x, this.bob.z, 1.6);
      this.caughtMesh = makeFish(assets, sp);
      this.caughtMesh.scale.multiplyScalar(0.55 + this.fish.cm / 80);
      this.caughtMesh.position.copy(this.bob);
      scene.add(this.caughtMesh);
      this.from.copy(this.bob);
      this.set('caught');
      const r = record(dex, this.fish);
      updateCount();
      const fish = this.fish;
      setTimeout(() => { if (this.state === 'caught' && this.fish === fish) this.showCard(r); }, 900);
      return;
    }
    if (result === 'snap') { sfx.snap(); toast('สายขาด! ปลาหนีไปแล้ว 😢', 2000); buzz([40, 40, 80]); this.set('snapped'); return; }
    sfx.escape();
    toast(result === 'slack' ? 'สายหย่อนเกินไป ปลาหลุด…' : 'ปลาว่ายหนีไปได้…', 1800);
    this.startRetrieve();
  },
  showCard(r) {
    const { sp, kg, cm } = this.fish;
    $('catchImg').src = thumbs[sp.id];
    $('catchName').textContent = sp.name;
    $('catchStars').textContent = stars(sp.stars);
    $('catchKg').textContent = kg.toFixed(2) + ' กก.';
    $('catchCm').textContent = cm + ' ซม.';
    $('catchDesc').textContent = sp.desc;
    const b = $('catchBadge');
    b.classList.toggle('hidden', !r.isNew && !r.isBest);
    b.classList.toggle('best', r.isBest);
    b.textContent = r.isNew ? 'ใหม่!' : 'ตัวใหญ่สุด!';
    if (r.isNew) $('dexNew').classList.remove('hidden');
    actionUp();
    $('catch').classList.remove('hidden');
  },
  endCatch() {
    if (this.caughtMesh) { scene.remove(this.caughtMesh); this.caughtMesh = null; }
    this.set('free');
  },

  update(dt) {
    this.t += dt;
    const s = this.state;
    const tip = player.tip.getWorldPosition(tA);
    const time = shared.uTime.value;

    if (s === 'charging') {
      this.charge = Math.min(1, this.charge + dt / 1.25);
      const f = fwd(player.yaw), d = 1.3 + this.charge * 8.7;
      const x = player.pos.x + f.x * d, z = player.pos.z + f.z * d;
      const w = inWater(x, z) && !onDock(x, z);
      aimRing.visible = true;
      aimRing.position.set(x, (w ? WATER_Y : groundH(x, z)) + 0.04, z);
      aimRing.material.color.set(w ? 0xffffff : 0xff8a70);
      aimRing.scale.setScalar(1 + Math.sin(time * 8) * 0.08);
      $('power').classList.remove('hidden');
      $('power').querySelector('.fill').style.width = (this.charge * 100) + '%';
    } else {
      aimRing.visible = false;
      $('power').classList.add('hidden');
    }

    if (s === 'free' || s === 'charging') {
      // ทุ่นห้อยจากปลายคัน
      this.bob.set(tip.x + Math.sin(time * 2) * 0.05, tip.y - 0.55, tip.z);
    } else if (s === 'casting') {
      this.flight += dt / this.flightDur;
      const t = Math.min(1, this.flight);
      const h = 1.5 + this.from.distanceTo(this.target) * 0.22;
      this.bob.lerpVectors(this.from, this.target, t);
      this.bob.y += Math.sin(t * Math.PI) * h;
      if (t >= 1) this.land();
    } else if (s === 'landed') {
      if (this.t > 0.7) this.startRetrieve();
    } else if (s === 'waiting') {
      let y = WATER_Y + 0.02 + Math.sin(time * 2.2) * 0.015;
      const n0 = this.nibbles[0];
      if (n0 !== undefined && this.t > n0) {
        const k = (this.t - n0) / 0.25;
        if (k < 1) {
          y -= Math.sin(k * Math.PI) * 0.07;
          if (!this._nib) { sfx.nibble(); world.addRipple(this.bob.x, this.bob.z, 0.5); this._nib = true; }
        } else { this.nibbles.shift(); this._nib = false; }
      }
      this.bob.y = y;
      if (this.t > this.biteAt) {
        this.set('bite');
        this.biteEnd = this.fish.sp.win;
        sfx.bite();
        world.addRipple(this.bob.x, this.bob.z, 1.5);
        $('alert').classList.remove('hidden');
        buzz(120);
      }
    } else if (s === 'bite') {
      this.bob.y = WATER_Y - 0.2 + Math.sin(this.t * 40) * 0.03;
      this.bob.x += Math.sin(this.t * 23) * 0.004;
      if (this.t > this.biteEnd) {
        $('alert').classList.add('hidden');
        sfx.escape();
        toast('ช้าไปนิด ปลากินเหยื่อหนีไป', 1500);
        this.fish = rollFish(this.bob.distanceTo(world.fallPos) < 3.4, WATER_Y - groundH(this.bob.x, this.bob.z));
        this.set('waiting');
        this.newBite();
      }
    } else if (s === 'fight') {
      this.fightUpdate(dt, time);
    } else if (s === 'retrieve' || s === 'snapped') {
      if (s === 'snapped' && this.t < 1.0) { line.visible = false; bobber.visible = false; }
      else {
        line.visible = true; bobber.visible = true;
        this.retr += dt / 0.45;
        const t = Math.min(1, this.retr);
        const end = tB.set(tip.x, tip.y - 0.55, tip.z);
        this.bob.lerpVectors(this.from, end, t);
        this.bob.y += Math.sin(t * Math.PI) * 0.8;
        if (s === 'snapped') this.bob.copy(end);
        if (t >= 1) this.set('free');
      }
    } else if (s === 'caught') {
      const t = Math.min(1, this.t / 0.7);
      const top = tB.copy(player.pos); top.y += 2.4;
      if (this.caughtMesh) {
        this.caughtMesh.position.lerpVectors(this.from, top, t);
        this.caughtMesh.position.y += Math.sin(t * Math.PI) * 1.2;
        this.caughtMesh.rotation.set(Math.sin(this.t * 9) * 0.3 * (1 - t * 0.5), this.t * 2.5, Math.sin(this.t * 12) * 0.25);
      }
      this.bob.copy(this.caughtMesh ? this.caughtMesh.position : top);
    }

    bobber.position.copy(this.bob);
    bobber.rotation.z = s === 'fight' ? Math.sin(time * 20) * 0.3 : 0;
    bobber.visible = s !== 'caught' && !(s === 'snapped' && this.t < 1);
    const sag = s === 'waiting' || s === 'bite' ? 0.9 : s === 'fight' ? 0.05 + (1 - this.tension) * 0.6 : s === 'casting' ? 0.4 : 0.05;
    updateLine(tip, tB.copy(this.bob).setY(this.bob.y + (s === 'caught' ? 0.1 : 0.22)), sag);
    line.visible = !(s === 'snapped' && this.t < 1);
  },

  fightUpdate(dt, time) {
    const sp = this.fish.sp;
    if (this.t > 1.2) $('fightName').textContent = sp.stars >= 3 ? 'ตัวใหญ่! ' + '★'.repeat(sp.stars) : '';
    // ปลาพุ่งหนีเป็นช่วง ๆ
    let dashing = false;
    if (this.t > this.nextDash) {
      this.dashEnd = this.t + 0.4 + Math.random() * 0.7;
      this.nextDash = this.dashEnd + 0.8 + Math.random() * 2.2 / (0.6 + sp.dash);
      this.fishWob = (Math.random() - 0.5) * 3;
      sfx.splash();
      world.addRipple(this.bob.x, this.bob.z, 1.2);
      buzz(30);
    }
    if (this.t < this.dashEnd) dashing = true;
    const pull = dashing ? sp.dash : sp.pull * (0.6 + 0.4 * Math.sin(time * 2.3));
    if (actionHeld) {
      this.tension += (0.35 + pull * 0.5) * dt;
      const inZone = this.tension > 0.2 && this.tension < 0.8;
      this.prog += sp.prog * dt * (inZone ? 1 : 0.35) - (dashing ? sp.dash * 0.06 * dt : 0);
      if (time - this.lastReel > 0.07) { sfx.reel(); this.lastReel = time; }
    } else {
      this.tension -= (0.55 - pull * 0.25) * dt;
      this.prog -= pull * 0.03 * dt;
    }
    this.tension = Math.max(0, this.tension);
    this.slack = this.tension < 0.1 ? this.slack + dt : 0;
    $('fight').querySelector('.needle').style.left = (Math.min(1, this.tension) * 100) + '%';
    $('fight').querySelector('.pfill').style.width = (Math.max(0, Math.min(1, this.prog)) * 100) + '%';
    $('fight').classList.toggle('danger', this.tension > 0.85);
    // ตำแหน่งปลา/ทุ่น: เข้าใกล้ฝั่งตามความคืบหน้า + ส่ายไปมา
    const p = Math.max(0, Math.min(1, this.prog));
    const nx = this.from.x + (this.fishGoal.x - this.from.x) * p * 0.85 + Math.sin(time * 1.7) * 0.5 * (1 - p) + this.fishWob * (dashing ? 0.25 : 0.1) * (1 - p);
    const nz = this.from.z + (this.fishGoal.z - this.from.z) * p * 0.85 + Math.cos(time * 1.3) * 0.4 * (1 - p);
    if (inWater(nx, nz)) { this.bob.x += (nx - this.bob.x) * Math.min(1, dt * 3); this.bob.z += (nz - this.bob.z) * Math.min(1, dt * 3); }
    this.bob.y = WATER_Y - 0.06 + Math.sin(time * 14) * 0.03;
    if (time > this.nextSplash) { world.addRipple(this.bob.x, this.bob.z, 0.6); this.nextSplash = time + 0.35; }
    if (this.tension >= 1) this.endFight('snap');
    else if (this.slack > 2.0) this.endFight('slack');
    else if (this.prog <= 0) this.endFight('escape');
    else if (this.prog >= 1) this.endFight('caught');
  },
};

// ---------- อัปเดตตัวละคร ----------
const camTarget = new THREE.Vector3(), camPos = new THREE.Vector3(), tmpV = new THREE.Vector3();
function updatePlayer(dt) {
  const s = game.state;
  const mv = moveInput();
  const canWalk = s === 'free';
  if (mv.l > 0.05 && (canWalk || s === 'charging')) {
    const want = Math.atan2(mv.x, mv.z);
    let d = want - player.yaw;
    d = Math.atan2(Math.sin(d), Math.cos(d));
    player.yaw += d * Math.min(1, dt * (s === 'charging' ? 5 : 12));
  }
  const speed = canWalk ? 3.6 * mv.l : 0;
  player.vel += (speed - player.vel) * Math.min(1, dt * 10);
  if (player.vel > 0.01) {
    const f = fwd(player.yaw, tmpV);
    const nx = player.pos.x + f.x * player.vel * dt, nz = player.pos.z + f.z * player.vel * dt;
    if (walkable(nx, nz)) { player.pos.x = nx; player.pos.z = nz; }
    else if (walkable(nx, player.pos.z)) player.pos.x = nx;
    else if (walkable(player.pos.x, nz)) player.pos.z = nz;
    else player.vel = 0;
  }
  const gy = standY(player.pos.x, player.pos.z);
  player.pos.y += (gy - player.pos.y) * Math.min(1, dt * 15);
  // ท่าทาง
  const walk = Math.min(1, player.vel / 3);
  player.phase += dt * player.vel * 2.8;
  const sw = Math.sin(player.phase) * 0.7 * walk;
  player.legL.rotation.x = sw; player.legR.rotation.x = -sw;
  player.armL.rotation.x = -sw * 0.8;
  let armR = 0, armL = player.armL.rotation.x;
  const t = game.t;
  if (s === 'charging') armR = -1.4 * game.charge;
  else if (s === 'casting') armR = Math.min(0.55, -1.4 + t * 14);
  else if (s === 'waiting' || s === 'bite' || s === 'landed') armR = 0.35 + Math.sin(shared.uTime.value * 1.5) * 0.02;
  else if (s === 'fight') { armR = -0.35 + Math.sin(shared.uTime.value * 30) * 0.04 * game.tension; armL = actionHeld ? -0.9 + Math.sin(shared.uTime.value * 18) * 0.35 : -0.6; }
  else if (s === 'caught') { armR = -2.6; armL = -2.6; }
  else armR = sw * 0.3;
  player.armRX += (armR - player.armRX) * Math.min(1, dt * (s === 'casting' ? 30 : 10));
  player.armR.rotation.x = player.armRX;
  player.armL.rotation.x = armL;
  player.body.rotation.y = 0;
  player.head.rotation.x = s === 'waiting' ? 0.15 : 0;
  player.root.position.copy(player.pos);
  player.root.position.y += Math.abs(Math.sin(player.phase)) * 0.06 * walk;
  player.root.rotation.y = player.yaw;
}

let zoom = 1;
addEventListener('wheel', e => { zoom = Math.max(0.65, Math.min(1.6, zoom * (e.deltaY > 0 ? 1.08 : 0.93))); }, { passive: true });
function updateCamera(dt, snap = false) {
  const portrait = camera.aspect < 0.9;
  const k = (portrait ? 1.6 : camera.aspect < 1.4 ? 1.2 : 1.0) * zoom;
  let tx = player.pos.x * 0.8, tz = player.pos.z * 0.55 + POND.z * 0.45;
  if (game.state !== 'free' && game.state !== 'charging') { tx = (tx + game.bob.x) / 2; tz = (tz + game.bob.z) / 2 + 0.5; }
  tmpV.set(Math.max(-9, Math.min(9, tx)), 0, Math.max(-7, Math.min(8, tz)));
  camTarget.lerp(tmpV, snap ? 1 : Math.min(1, dt * 2.5));
  camPos.set(camTarget.x, camTarget.y + 10.5 * k, camTarget.z + 15 * k);
  camera.position.lerp(camPos, snap ? 1 : Math.min(1, dt * 3));
  camera.lookAt(camTarget.x, camTarget.y + 1.4, camTarget.z);
}

// ---------- คำแนะนำบนจอ ----------
function nearWater() {
  const f = fwd(player.yaw, tmpV);
  for (let d = 1.3; d < 10; d += 0.7) if (inWater(player.pos.x + f.x * d, player.pos.z + f.z * d)) return true;
  return false;
}
function updateHints() {
  const s = game.state;
  const press = touch ? 'กดค้างปุ่ม 🎣' : 'กดค้าง Space / คลิกค้าง';
  if (s === 'free') { hint(nearWater() ? `${press} เพื่อเล็ง · ปล่อยเพื่อเหวี่ยงเบ็ด` : 'หันหน้าไปทางแอ่งน้ำ หรือเดินไปบนท่าเรือ'); actionLabel('🎣', 'เหวี่ยง'); }
  else if (s === 'charging') { hint('ปล่อยเพื่อเหวี่ยง · ค้างนาน = ไกล'); actionLabel('🎯', 'ปล่อย!'); }
  else if (s === 'waiting') { hint('รอให้ทุ่นจม… ' + (touch ? '(กดเพื่อเก็บสาย)' : '(กดเพื่อเก็บสาย)')); actionLabel('🪝', 'เก็บสาย'); }
  else if (s === 'bite') { hint('ทุ่นจม! กดเลย!'); actionLabel('❗', 'ดึง!', true); }
  else if (s === 'fight') { hint(touch ? 'กดค้างเพื่อกรอสาย · ปล่อยเมื่อเข็มใกล้สีแดง' : 'กดค้างเพื่อกรอสาย · ปล่อยเมื่อเข็มใกล้สีแดง'); actionLabel('🌀', 'กรอสาย'); }
  else { hint(''); actionLabel('🎣', '…'); }
}

function updateAlert() {
  const a = $('alert');
  if (a.classList.contains('hidden')) return;
  tmpV.copy(player.pos); tmpV.y += 2.3;
  tmpV.project(camera);
  a.style.transform = `translate(${(tmpV.x * 0.5 + 0.5) * innerWidth}px, ${(-tmpV.y * 0.5 + 0.5) * innerHeight}px)`;
}

// ---------- เริ่มเกม ----------
let started = false, ready = false;
function init() {
  world = buildWorld(scene, assets, { mobile, pixelRatio });
  player = makePlayer();
  bobber = makeBobber();
  line = makeLine();
  aimRing = new THREE.Mesh(new THREE.RingGeometry(0.32, 0.45, 24).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.85, depthWrite: false }));
  aimRing.visible = false;
  scene.add(aimRing);
  dex = loadDex();
  updateCount();
  renderThumbs();
  resize();
  updateCamera(0, true);
  game.update(0);
  renderer.compile(scene, camera);
  loadBar.style.width = '100%';
  ready = true;
  setTimeout(() => { $('loadBar').classList.add('hidden'); $('startBtn').classList.remove('hidden'); }, 150);
}
$('startBtn').addEventListener('click', () => {
  initAudio();
  started = true;
  $('title').classList.add('hidden');
  if (touch) { joyEl.classList.remove('hidden'); actBtn.classList.remove('hidden'); }
  toast('ยินดีต้อนรับสู่ริมน้ำตก 🌿', 2000);
});

let last = performance.now();
function tick(dt, draw = true) {
  shared.uTime.value += dt;
  shared.uWind.value = 0.8 + 0.35 * Math.sin(shared.uTime.value * 0.23);
  updatePlayer(dt);
  game.update(dt);
  updateCamera(dt);
  for (const u of world.update) u(dt, camera);
  if (started) { updateHints(); updateAlert(); setFallDistance(player.pos.distanceTo(world.fallPos)); }
  if (draw) renderer.render(scene, camera);
}
function loop(now) {
  requestAnimationFrame(loop);
  const dt = Math.min(0.05, (now - last) / 1000);
  last = now;
  if (ready) tick(dt);
}
requestAnimationFrame(loop);

// สำหรับทดสอบ: เรียก tick เองได้ตอนแท็บถูกซ่อน (timer ช้า)
window.__fish = { game, tick: (dt = 1 / 60, draw = true) => ready && tick(dt, draw), get player() { return player; }, get world() { return world; }, actionDown, actionUp, keys, get ready() { return ready; }, start: () => $('startBtn').click() };
