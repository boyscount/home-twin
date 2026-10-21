// ตกปลาสบายใจ — เกมตกปลาเลี้ยงครอบครัว 4 ด่าน + บ้าน (Three.js r160, ไม่มี build step)
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { Line2 } from 'three/addons/lines/Line2.js';
import { LineMaterial } from 'three/addons/lines/LineMaterial.js';
import { LineGeometry } from 'three/addons/lines/LineGeometry.js';
import { toon, mossy, swaying, shared } from './toon.js';
import { makeRain } from './kit.js';
import { SPECIES, byId, rollFish, loadDex, record, makeFish, fishValue } from './fish.js';
import { initAudio, sfx, setMuted, isMuted, setAmbience, ambienceTick } from './audio.js';
import * as story from './story.js';
import { S, STAGES, stageById } from './story.js';
import * as falls from './stages/falls.js';
import * as forest from './stages/forest.js';
import * as beach from './stages/beach.js';
import * as sea from './stages/sea.js';
import * as home from './stages/home.js';

const BUILDERS = { falls, forest, beach, sea, home };
const VER = new URL(import.meta.url).search;          // ?v=… ของไฟล์นี้ ใช้ต่อท้ายไฟล์โมเดลด้วย
const $ = id => document.getElementById(id);
const touch = matchMedia('(pointer: coarse)').matches || 'ontouchstart' in window;
const mobile = touch || Math.min(screen.width, screen.height) < 700;
if (touch) document.body.classList.add('touch');

// ---------- renderer / camera ----------
const canvas = $('c');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: !mobile || devicePixelRatio < 2, powerPreference: 'high-performance' });
const pixelRatio = Math.min(devicePixelRatio, mobile ? 1.75 : 2);
renderer.setPixelRatio(pixelRatio);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.outputColorSpace = THREE.SRGBColorSpace;
let scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(40, 1, 0.3, 500);

function resize() {
  renderer.setSize(innerWidth, innerHeight, false);
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  if (lineMat) lineMat.resolution.set(innerWidth * pixelRatio, innerHeight * pixelRatio);
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
  BoatPaint: () => toon(0x2f8fa8), BoatRed: () => toon(0xc0453a), Ribbon: () => toon(0xff8fc0), Ribbon2: () => toon(0xffd84a),
  Metal: () => toon(0x55585e), Roof: () => toon(0xa5543c), Window: () => new THREE.MeshBasicMaterial({ color: 0x3a2a1c }),
  Palm: () => swaying(0x5aa840, 0.05), PalmTrunk: () => toon(0x9a7a56), Karst: () => mossy(0xc9c2b2, 0.9),
};
const matCache = {};
const keepGeo = new Set(), keepMat = new Set();
function convert(root) {
  root.traverse(o => {
    if (!o.isMesh) return;
    const n = o.material.name;
    if (!matCache[n]) { matCache[n] = (MAT[n] || (() => toon(o.material.color)))(); matCache[n].name = n; keepMat.add(matCache[n]); }
    o.material = matCache[n];
    keepGeo.add(o.geometry);
  });
}
const assets = { clone: name => { const src = assets.root.getObjectByName(name); if (!src) throw new Error('ไม่พบโมเดล ' + name); const c = src.clone(true); c.position.set(0, 0, 0); c.rotation.set(0, 0, 0); return c; } };

let world, player, bobber, line, lineMat, aimRing, dex, camp;
let mode = 'title';                 // title | map | fishing | home | travel
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

// ---------- ตัวละคร / ทุ่น / สาย ----------
function makePlayer() {
  const g = assets.clone('Fisher');
  const p = {
    root: g, pos: new THREE.Vector3(), yaw: Math.PI, vel: 0, phase: 0,
    legL: g.getObjectByName('LegL'), legR: g.getObjectByName('LegR'), armL: g.getObjectByName('ArmL'), armR: g.getObjectByName('ArmR'),
    head: g.getObjectByName('Head'), tip: g.getObjectByName('RodTip'), rod: g.getObjectByName('Rod'), armRX: 0,
  };
  g.traverse(o => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
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
  return g;
}
const LINE_N = 24;
const linePts = new Float32Array(LINE_N * 3);
function makeLine() {
  const geo = new LineGeometry();
  geo.setPositions(linePts);
  lineMat = new LineMaterial({ color: 0xf8f8f0, linewidth: 1.6, transparent: true, opacity: 0.9 });
  const l = new Line2(geo, lineMat);
  l.frustumCulled = false;
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

// ---------- เสื่อ + ข้องปลา + ปลาที่ตกได้วางเรียง ----------
function makeMatTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d');
  g.fillStyle = '#d9bd7c'; g.fillRect(0, 0, 128, 128);
  for (let i = 0; i < 128; i += 4) { g.fillStyle = i % 8 ? '#cfae68' : '#e4cb8e'; g.fillRect(0, i, 128, 2); }
  for (let i = 0; i < 128; i += 16) { g.fillStyle = 'rgba(120,80,40,.18)'; g.fillRect(i, 0, 1, 128); }
  g.fillStyle = '#2f7f7a'; g.fillRect(0, 0, 8, 128); g.fillRect(120, 0, 8, 128);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
let matTex;
function buildCamp() {
  const C = world.camp;
  if (!C) return null;
  const g = new THREE.Group();
  const small = !!C.small;
  matTex = matTex || makeMatTexture();
  const mat = new THREE.Mesh(new THREE.BoxGeometry(small ? 1.3 : 1.7, 0.025, small ? 0.75 : 1.2), toon(0xffffff, { map: matTex }));
  mat.receiveShadow = true;
  g.add(mat);
  if (!small) {
    const basket = new THREE.Group();
    const body = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.27, 0.55, 12), toon(0xc9a060));
    body.position.y = 0.28;
    const neck = new THREE.Mesh(new THREE.CylinderGeometry(0.13, 0.2, 0.14, 12), toon(0xb08a4e));
    neck.position.y = 0.62;
    basket.add(body, neck);
    for (const y of [0.12, 0.3, 0.48]) { const band = new THREE.Mesh(new THREE.TorusGeometry(0.255 - y * 0.05, 0.015, 4, 16).rotateX(Math.PI / 2), toon(0x8a6a3a)); band.position.y = y; basket.add(band); }
    basket.position.set(-1.15, 0, -0.1);
    basket.traverse(o => { if (o.isMesh) o.castShadow = true; });
    g.add(basket);
  }
  g.position.set(C.x, C.y ?? world.groundH(C.x, C.z) + 0.02, C.z);
  g.rotation.y = C.ry || 0;
  if (!small) g.scale.setScalar(1.35);
  (world.campParent || scene).add(g);
  g.userData.fish = new THREE.Group();
  g.add(g.userData.fish);
  return g;
}
function refreshCamp() {
  if (!camp) return;
  const F = camp.userData.fish;
  while (F.children.length) F.remove(F.children[0]);
  const small = !!world.camp.small;
  S.basket.slice(0, small ? 6 : 9).forEach((f, i) => {
    const m = makeFish(assets, byId[f.id]);
    const k = Math.min(0.42 + f.cm / 160, 0.95) * (small ? 0.55 : 0.62);
    m.scale.multiplyScalar(k);
    const col = i % 3, row = Math.floor(i / 3);
    m.position.set((col - 1) * (small ? 0.4 : 0.52), 0.04, (row - 1) * (small ? 0.22 : 0.34));
    m.rotation.set(Math.PI / 2, 0, (i % 2 ? 0.2 : -0.15));
    m.traverse(o => { if (o.isMesh) o.castShadow = true; });
    F.add(m);
  });
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

// ---------- สลับฉาก ----------
function disposeScene(sc) {
  sc.traverse(o => {
    if (o.geometry && !keepGeo.has(o.geometry)) o.geometry.dispose();
    if (o.material) for (const m of [].concat(o.material)) if (!keepMat.has(m) && m.dispose) m.dispose();
  });
}
function loadWorld(id) {
  const old = scene;
  for (const o of [player.root, bobber, line, aimRing]) old.remove(o);
  scene = new THREE.Scene();
  world = BUILDERS[id].build(scene, assets, { mobile, pixelRatio });
  scene.add(player.root, bobber, line, aimRing);
  disposeScene(old);
  camp = id === 'home' ? null : buildCamp();
  refreshCamp();
  if (id !== 'home' && story.luck().rain) makeRain(scene, world, {});
  const sp = world.spawn;
  player.pos.set(sp.x, 0, sp.z);
  player.pos.y = world.standY(sp.x, sp.z);
  player.yaw = sp.yaw;
  player.vel = 0;
  player.rod.visible = id !== 'home';
  game.reset();
  const a = world.ambience || {};
  setAmbience(a.falls ? 'falls' : a.stream ? 'stream' : a.surf ? 'surf' : a.sea ? 'sea' : 'night');
  world.camTarget = camTarget;
  if (id !== 'home') applyTime(S.time);
  camOrbit = 0;
  updatePlayer(0);
  updateCamera(0, true);
  game.update(0);
  renderer.compile(scene, camera);
}

// ---------- แสงตามเวลาของวัน ----------
const KEYS = [
  [6, 0x8fb8e0, 0xffd0a8, 0xffc08a, 0.55], [8.5, null, null, 0xfff1d6, 1], [15, null, null, 0xfff1d6, 1],
  [17, 0x7aa6d8, 0xffc890, 0xffb070, 0.8], [18.2, 0x5a6fa8, 0xff9a6a, 0xff8a50, 0.5],
];
const cA = new THREE.Color(), cB = new THREE.Color(), cGray = new THREE.Color(0x9aa4ad);
function applyTime(h) {
  if (!world.sky) return;
  let i = 0;
  while (i < KEYS.length - 2 && h > KEYS[i + 1][0]) i++;
  const k0 = KEYS[i], k1 = KEYS[i + 1];
  const t = Math.max(0, Math.min(1, (h - k0[0]) / (k1[0] - k0[0])));
  const L = story.luck();
  const gray = (1 - (L.sun ?? 1)) * 0.9;
  const sky = world.sky.material.uniforms;
  for (const [idx, name] of [[1, 'top'], [2, 'bot']]) {
    cA.set(k0[idx] ?? world.skyBase[name]); cB.set(k1[idx] ?? world.skyBase[name]);
    cA.lerp(cB, t).lerp(cGray, gray);
    sky[name].value.copy(cA);
  }
  if (scene.fog) scene.fog.color.copy(sky.bot.value);
  const sunK = (k0[4] + (k1[4] - k0[4]) * t) * (L.sun ?? 1);
  world.sun.color.set(k0[3]).lerp(cB.set(k1[3]), t);
  world.sun.intensity = world.sunBase.intensity * sunK;
  world.hemi.intensity = world.sunBase.hemi * (0.75 + 0.25 * sunK);
  world.rayK = Math.max(0, sunK - 0.3) * 1.4;
}

// ---------- อินพุต ----------
const keys = {};
const joy = { x: 0, y: 0, id: null };
let actionHeld = false;
const modalOpen = () => ['catch', 'dex', 'map', 'evening', 'dialog'].some(id => !$(id).classList.contains('hidden'));

function actionDown() {
  if (modalOpen() || mode !== 'fishing') return;
  if (actionHeld) return;
  actionHeld = true;
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
  if (!$('dialog').classList.contains('hidden')) return;
  if (e.code === 'Space' || e.code === 'KeyE') { e.preventDefault(); if (!$('catch').classList.contains('hidden')) closeCatch(); else actionDown(); }
  if (e.code === 'Enter' && !$('catch').classList.contains('hidden')) closeCatch();
  if (e.code === 'Escape') { closeCatch(); $('dex').classList.add('hidden'); }
  if ((e.code === 'KeyB' || e.code === 'Tab') && mode !== 'title') { e.preventDefault(); toggleDex(); }
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
let lastHud = '';
function updateHud() {
  const s = `${story.fmtTime(S.time)}|${S.basket.length}|${S.money}`;
  if (s === lastHud) return;
  lastHud = s;
  $('clock').querySelector('b').textContent = story.fmtTime(S.time);
  $('clock').classList.toggle('late', S.time >= 17);
  $('basket').querySelector('b').textContent = `${S.basket.length}/${story.capacity()}`;
  $('money').textContent = story.baht(S.money);
}
function showFishingUi(on) {
  $('hud').classList.toggle('hidden', !on);
  $('hint').classList.toggle('hidden', !on);
  if (touch) { joyEl.classList.toggle('hidden', !on); actBtn.classList.toggle('hidden', !on); }
}
const stars = n => '★'.repeat(n) + '☆'.repeat(Math.max(0, 4 - n));

let dexTab = 'falls';
function toggleDex() {
  const d = $('dex');
  if (!d.classList.contains('hidden')) { d.classList.add('hidden'); return; }
  actionUp();
  sfx.click();
  $('dexNew').classList.add('hidden');
  if (world && stageById[world.id]) dexTab = world.id;
  renderDex();
  d.classList.remove('hidden');
}
function renderDex() {
  const got = SPECIES.filter(s => dex.dex[s.id]).length;
  $('dexSum').textContent = `พบแล้ว ${got} / ${SPECIES.length} ชนิด · ตกได้ทั้งหมด ${dex.total} ตัว`;
  $('dexTabs').innerHTML = STAGES.map(s => `<button data-tab="${s.id}" class="${s.id === dexTab ? 'on' : ''}">${s.icon} ${s.name}</button>`).join('');
  $('dexGrid').innerHTML = SPECIES.filter(s => s.stage === dexTab).map(s => {
    const e = dex.dex[s.id];
    if (!e) return `<div class="dexItem locked"><img src="${thumbs[s.id]}" alt=""><h3>???</h3><div class="stars">${stars(s.stars)}</div><div class="meta">${s.rare ? 'ว่ากันว่าซ่อนอยู่ในจุดพิเศษ…' : 'ยังไม่เคยพบ'}</div></div>`;
    return `<div class="dexItem${s.rare ? ' rare' : ''}"><img src="${thumbs[s.id]}" alt="${s.name}"><h3>${s.name}</h3><div class="stars">${stars(s.stars)}</div>
      <div class="meta">ได้ ${e.n} ตัว · ใหญ่สุด <b>${e.best.toFixed(2)} กก.</b> · ${story.baht(s.price)}/กก.</div><div class="desc">${s.desc}</div></div>`;
  }).join('');
}
$('dexTabs').addEventListener('click', e => { const b = e.target.closest('button[data-tab]'); if (b) { dexTab = b.dataset.tab; sfx.click(); renderDex(); } });
$('btnDex').addEventListener('click', toggleDex);
$('dexClose').addEventListener('click', toggleDex);
$('dex').addEventListener('click', e => { if (e.target.id === 'dex') toggleDex(); });
$('btnMute').addEventListener('click', () => { initAudio(); setMuted(!isMuted()); $('btnMute').textContent = isMuted() ? '🔇' : '🔊'; });
$('btnMute').textContent = isMuted() ? '🔇' : '🔊';
$('btnHome').addEventListener('click', () => {
  if (mode !== 'fishing') return;
  if (game.state === 'fight' || game.state === 'caught') { toast('ดึงปลาตัวนี้ขึ้นมาก่อนนะ!'); return; }
  if (S.time < 15 && !confirm('ยังไม่ค่ำเลย จะกลับบ้านเลยไหม?')) return;
  goHome();
});
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
  tension: 0.4, prog: 0.2, slack: 0, dashEnd: 0, nextDash: 0, fishGoal: new THREE.Vector3(), fishWob: 0,
  caughtMesh: null, retr: 0, lastReel: 0, nextSplash: 0, _nib: false,

  set(s) { this.state = s; this.t = 0; },
  reset() {
    if (this.caughtMesh) { this.caughtMesh.parent?.remove(this.caughtMesh); this.caughtMesh = null; }
    $('fight').classList.add('hidden'); $('alert').classList.add('hidden'); $('catch').classList.add('hidden');
    this.set('free');
  },
  onDown() {
    switch (this.state) {
      case 'free':
        if (S.basket.length >= story.capacity()) { toast('ข้องเต็มแล้ว! กด 🏠 กลับบ้านกันเถอะ', 2200); return; }
        this.set('charging'); this.charge = 0; break;
      case 'waiting': this.startRetrieve(); toast('เก็บสาย', 900); break;
      case 'bite': this.startFight(); break;
    }
  },
  onUp() { if (this.state === 'charging') this.cast(); },
  castPoint(charge, out) {
    const f = fwd(player.yaw), d = 1.3 + charge * 8.7;
    return out.set(player.pos.x + f.x * d, 0, player.pos.z + f.z * d);
  },
  cast() {
    this.castPoint(this.charge, this.target);
    this.onWater = world.canCast(this.target.x, this.target.z);
    this.target.y = this.onWater ? world.waterY + 0.03 : (world.onSolid?.(this.target.x, this.target.z) ? world.standY(this.target.x, this.target.z) + 0.05 : world.groundH(this.target.x, this.target.z) + 0.08);
    player.tip.getWorldPosition(this.from);
    this.flightDur = 0.5 + this.from.distanceTo(this.target) * 0.045;
    this.flight = 0;
    this.set('casting');
    sfx.whoosh();
  },
  nearSpecial() { return world.special && Math.hypot(this.bob.x - world.special.x, this.bob.z - world.special.z) < world.specialR; },
  roll() {
    this.fish = S.dead && Math.random() < 0.85 ? rollFish(world.id, false, 0, 1) : rollFish(world.id, this.nearSpecial(), world.depthAt(this.bob.x, this.bob.z), story.junkChance());
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
    this.roll();
    this.newBite();
    this.set('waiting');
    if (this.nearSpecial()) toast('✨ จุดนี้ดูน่าสนใจ…', 1500);
  },
  newBite() {
    const mul = story.biteMul() * (S.dead ? 3 : 1);
    this.biteAt = this.t + (2.2 + Math.random() * 5.5) * mul;
    this.nibbles = [];
    const n = Math.floor(Math.random() * 3);
    for (let i = 0; i < n; i++) this.nibbles.push(this.biteAt - 0.6 - Math.random() * 1.8);
    this.nibbles.sort((a, b) => a - b);
  },
  startRetrieve() { this.retr = 0; this.from.copy(this.bob); this.set('retrieve'); },
  startFight() {
    $('alert').classList.add('hidden');
    if (this.fish.junk) {               // ของติดเบ็ดแทนปลา
      const j = this.fish.junk;
      sfx.junk();
      S.stats.junk++; story.save();
      toast(`ได้${j.name} ${j.icon} …เก็บไปทิ้งให้น้ำสะอาด`, 2200);
      this.roll();
      this.startRetrieve();
      return;
    }
    sfx.hook();
    this.tension = 0.45; this.prog = 0.22; this.slack = 0;
    this.nextDash = 1 + Math.random() * 1.5; this.dashEnd = 0;
    this.from.copy(this.bob);
    const p = player.pos, f = fwd(player.yaw);
    this.fishGoal.set(p.x + f.x * 1.2, world.waterY, p.z + f.z * 1.2);
    for (let k = 0; k < 20 && !world.canCast(this.fishGoal.x, this.fishGoal.z); k++) this.fishGoal.addScaledVector(f, 0.25);
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
      this.caughtMesh.scale.multiplyScalar(Math.min(2.4, 0.55 + this.fish.cm / 80));
      this.caughtMesh.position.copy(this.bob);
      scene.add(this.caughtMesh);
      this.from.copy(this.bob);
      this.set('caught');
      const r = record(dex, this.fish);
      S.basket.push({ id: sp.id, kg: this.fish.kg, cm: this.fish.cm });
      S.stats.caught++;
      story.save();
      const fish = this.fish;
      setTimeout(() => { if (this.state === 'caught' && this.fish === fish) this.showCard(r); }, 900);
      return;
    }
    if (result === 'snap') { sfx.snap(); toast('สายขาด! ปลาหนีไปแล้ว 😢', 2000); buzz([40, 40, 80]); this.set('snapped'); this.roll(); return; }
    sfx.escape();
    toast(result === 'slack' ? 'สายหย่อนเกินไป ปลาหลุด…' : 'ปลาว่ายหนีไปได้…', 1800);
    this.roll();
    this.startRetrieve();
  },
  showCard(r) {
    const { sp, kg } = this.fish;
    $('catchImg').src = thumbs[sp.id];
    $('catchName').textContent = sp.name;
    $('catchStars').textContent = stars(sp.stars);
    $('catchKg').textContent = kg.toFixed(2) + ' กก.';
    $('catchPrice').textContent = story.baht(fishValue({ id: sp.id, kg }));
    $('catchDesc').textContent = sp.desc;
    const b = $('catchBadge');
    b.classList.toggle('hidden', !r.isNew && !r.isBest);
    b.classList.toggle('best', r.isBest);
    b.textContent = r.isNew ? 'ใหม่!' : 'ตัวใหญ่สุด!';
    if (r.isNew) $('dexNew').classList.remove('hidden');
    $('catchOk').textContent = S.basket.length >= story.capacity() ? 'เก็บใส่ข้อง (ข้องเต็มแล้ว!)' : `เก็บใส่ข้องปลา (${S.basket.length}/${story.capacity()})`;
    actionUp();
    $('catch').classList.remove('hidden');
  },
  endCatch() {
    if (this.caughtMesh) { scene.remove(this.caughtMesh); this.caughtMesh = null; }
    refreshCamp();
    this.set('free');
  },

  update(dt) {
    this.t += dt;
    const s = this.state;
    const tip = player.tip.getWorldPosition(tA);
    const time = shared.uTime.value;
    const wy = world.waterY;

    if (s === 'charging') {
      this.charge = Math.min(1, this.charge + dt / 1.25);
      const p = this.castPoint(this.charge, tB);
      const w = world.canCast(p.x, p.z);
      aimRing.visible = true;
      aimRing.position.set(p.x, (w ? wy : world.groundH(p.x, p.z)) + 0.04, p.z);
      aimRing.material.color.set(w ? 0xffffff : 0xff8a70);
      aimRing.scale.setScalar(1 + Math.sin(time * 8) * 0.08);
      $('power').classList.remove('hidden');
      $('power').querySelector('.fill').style.width = (this.charge * 100) + '%';
    } else {
      aimRing.visible = false;
      $('power').classList.add('hidden');
    }

    if (s === 'free' || s === 'charging') {
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
      let y = wy + 0.02 + Math.sin(time * 2.2) * 0.015 + (world.id === 'sea' ? Math.sin(time * 1.4 + this.bob.x) * 0.05 : 0);
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
        this.biteEnd = this.fish.junk ? 1.2 : this.fish.sp.win;
        sfx.bite();
        world.addRipple(this.bob.x, this.bob.z, 1.5);
        $('alert').classList.remove('hidden');
        buzz(120);
      }
    } else if (s === 'bite') {
      this.bob.y = wy - 0.2 + Math.sin(this.t * 40) * 0.03;
      this.bob.x += Math.sin(this.t * 23) * 0.004;
      if (this.t > this.biteEnd) {
        $('alert').classList.add('hidden');
        sfx.escape();
        toast('ช้าไปนิด ปลากินเหยื่อหนีไป', 1500);
        this.roll();
        this.set('waiting');
        this.newBite();
      }
    } else if (s === 'fight') {
      this.fightUpdate(dt, time);
    } else if (s === 'retrieve' || s === 'snapped') {
      if (!(s === 'snapped' && this.t < 1.0)) {
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

    const hideLine = (s === 'snapped' && this.t < 1) || mode === 'home' || world.id === 'home';
    bobber.position.copy(this.bob);
    bobber.rotation.z = s === 'fight' ? Math.sin(time * 20) * 0.3 : 0;
    bobber.visible = s !== 'caught' && !hideLine;
    line.visible = !hideLine;
    const sag = s === 'waiting' || s === 'bite' ? 0.9 : s === 'fight' ? 0.05 + (1 - this.tension) * 0.6 : s === 'casting' ? 0.4 : 0.05;
    updateLine(tip, tB.copy(this.bob).setY(this.bob.y + (s === 'caught' ? 0.1 : 0.22)), sag);
  },

  fightUpdate(dt, time) {
    const sp = this.fish.sp;
    if (this.t > 1.2) $('fightName').textContent = sp.stars >= 3 ? 'ตัวใหญ่! ' + '★'.repeat(sp.stars) : '';
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
    const rodK = S.up.rod ? 0.8 : 1;
    if (actionHeld) {
      this.tension += (0.35 + pull * 0.5) * rodK * dt;
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
    const p = Math.max(0, Math.min(1, this.prog));
    const nx = this.from.x + (this.fishGoal.x - this.from.x) * p * 0.85 + Math.sin(time * 1.7) * 0.5 * (1 - p) + this.fishWob * (dashing ? 0.25 : 0.1) * (1 - p);
    const nz = this.from.z + (this.fishGoal.z - this.from.z) * p * 0.85 + Math.cos(time * 1.3) * 0.4 * (1 - p);
    if (world.canCast(nx, nz)) { this.bob.x += (nx - this.bob.x) * Math.min(1, dt * 3); this.bob.z += (nz - this.bob.z) * Math.min(1, dt * 3); }
    this.bob.y = world.waterY - 0.06 + Math.sin(time * 14) * 0.03;
    if (time > this.nextSplash) { world.addRipple(this.bob.x, this.bob.z, 0.6); this.nextSplash = time + 0.35; }
    if (this.tension >= 1) this.endFight('snap');
    else if (this.slack > 2.0) this.endFight('slack');
    else if (this.prog <= 0) this.endFight('escape');
    else if (this.prog >= 1) this.endFight('caught');
  },
};

// ---------- อัปเดตตัวละคร ----------
const camTarget = new THREE.Vector3(), camPos = new THREE.Vector3(), tmpV = new THREE.Vector3();
let camOrbit = 0;
function updatePlayer(dt) {
  const s = game.state;
  const mv = mode === 'fishing' && !modalOpen() ? moveInput() : { x: 0, z: 0, l: 0 };
  const canWalk = s === 'free';
  if (mv.l > 0.05 && (canWalk || s === 'charging')) {
    const want = Math.atan2(mv.x, mv.z);
    let d = want - player.yaw;
    d = Math.atan2(Math.sin(d), Math.cos(d));
    player.yaw += d * Math.min(1, dt * (s === 'charging' ? 5 : 12));
  }
  const speed = canWalk ? 3.6 * mv.l * (world.id === 'sea' ? 0.5 : 1) : 0;
  player.vel += (speed - player.vel) * Math.min(1, dt * 10);
  if (player.vel > 0.01) {
    const f = fwd(player.yaw, tmpV);
    const nx = player.pos.x + f.x * player.vel * dt, nz = player.pos.z + f.z * player.vel * dt;
    if (world.walkable(nx, nz)) { player.pos.x = nx; player.pos.z = nz; }
    else if (world.walkable(nx, player.pos.z)) player.pos.x = nx;
    else if (world.walkable(player.pos.x, nz)) player.pos.z = nz;
    else player.vel = 0;
  }
  const gy = world.standY(player.pos.x, player.pos.z);
  player.pos.y += (gy - player.pos.y) * Math.min(1, dt * 15);
  const walk = Math.min(1, player.vel / 3);
  player.phase += dt * player.vel * 2.8;
  const sw = Math.sin(player.phase) * 0.7 * walk;
  player.legL.rotation.x = sw; player.legR.rotation.x = -sw;
  let armR = 0, armL = -sw * 0.8;
  const t = game.t, now = shared.uTime.value;
  if (world.id === 'home') { const c = world.cheer > 0; armR = c ? -2.5 + Math.sin(now * 9) * 0.4 : Math.sin(now * 1.2) * 0.1; armL = c ? -2.5 + Math.cos(now * 9) * 0.4 : -armR; }
  else if (s === 'charging') armR = -1.4 * game.charge;
  else if (s === 'casting') armR = Math.min(0.55, -1.4 + t * 14);
  else if (s === 'waiting' || s === 'bite' || s === 'landed') armR = 0.35 + Math.sin(now * 1.5) * 0.02;
  else if (s === 'fight') { armR = -0.35 + Math.sin(now * 30) * 0.04 * game.tension; armL = actionHeld ? -0.9 + Math.sin(now * 18) * 0.35 : -0.6; }
  else if (s === 'caught') { armR = -2.6; armL = -2.6; }
  else armR = sw * 0.3;
  player.armRX += (armR - player.armRX) * Math.min(1, dt * (s === 'casting' ? 30 : 10));
  player.armR.rotation.x = player.armRX;
  player.armL.rotation.x = armL;
  player.head.rotation.x = s === 'waiting' ? 0.15 : 0;
  player.root.position.copy(player.pos);
  player.root.position.y += Math.abs(Math.sin(player.phase)) * 0.06 * walk;
  player.root.rotation.y = player.yaw;
  player.root.rotation.z = world.boat ? world.boat.rotation.x * 0.8 : 0;
}

let zoom = 1;
addEventListener('wheel', e => { if (!modalOpen()) zoom = Math.max(0.65, Math.min(1.6, zoom * (e.deltaY > 0 ? 1.08 : 0.93))); }, { passive: true });
function updateCamera(dt, snap = false) {
  if (world.id === 'home') {
    camOrbit += dt * 0.05;
    const r = camera.aspect < 0.9 ? 15 : 11.5;
    camera.position.set(Math.sin(camOrbit - 0.25) * r + 0.6, 4.2 + (camera.aspect < 0.9 ? 2 : 0), Math.cos(camOrbit - 0.25) * r + 1);
    camera.lookAt(0.2, 1.4, -0.5);
    return;
  }
  const portrait = camera.aspect < 0.9;
  const k = (portrait ? 1.6 : camera.aspect < 1.4 ? 1.2 : 1.0) * zoom * (world.camK || 1);
  let [tx, tz] = world.camFocus(player.pos.x, player.pos.z);
  if (game.state !== 'free' && game.state !== 'charging') { tx = (tx + game.bob.x) / 2; tz = (tz + game.bob.z) / 2 + 0.5; }
  const B = world.camBounds;
  tmpV.set(Math.max(B[0], Math.min(B[1], tx)), 0, Math.max(B[2], Math.min(B[3], tz)));
  camTarget.lerp(tmpV, snap ? 1 : Math.min(1, dt * 2.5));
  camPos.set(camTarget.x, camTarget.y + 10.5 * k * (world.camH || 1), camTarget.z + 15 * k);
  camera.position.lerp(camPos, snap ? 1 : Math.min(1, dt * 3));
  camera.lookAt(camTarget.x, camTarget.y + 1.4, camTarget.z);
}

// ---------- คำแนะนำบนจอ ----------
function nearWater() {
  for (let c = 0; c <= 1; c += 0.1) { const p = game.castPoint(c, tmpV); if (world.canCast(p.x, p.z)) return true; }
  return false;
}
function updateHints() {
  const s = game.state;
  const press = touch ? 'กดค้างปุ่ม 🎣' : 'กดค้าง Space / คลิกค้าง';
  if (s === 'free') {
    if (S.basket.length >= story.capacity()) hint('ข้องเต็มแล้ว! กด 🏠 กลับบ้านไปปิ้งปลา');
    else hint(nearWater() ? `${press} เพื่อเล็ง · ปล่อยเพื่อเหวี่ยงเบ็ด` : 'หันหน้าไปทางน้ำ แล้วเหวี่ยงเบ็ด');
    actionLabel('🎣', 'เหวี่ยง');
  } else if (s === 'charging') { hint('ปล่อยเพื่อเหวี่ยง · ค้างนาน = ไกล'); actionLabel('🎯', 'ปล่อย!'); }
  else if (s === 'waiting') { hint(S.dead ? 'น้ำเงียบผิดปกติ… (กดเพื่อเก็บสาย)' : 'รอให้ทุ่นจม… (กดเพื่อเก็บสาย)'); actionLabel('🪝', 'เก็บสาย'); }
  else if (s === 'bite') { hint('ทุ่นจม! กดเลย!'); actionLabel('❗', 'ดึง!', true); }
  else if (s === 'fight') { hint('กดค้างเพื่อกรอสาย · ปล่อยเมื่อเข็มใกล้สีแดง'); actionLabel('🌀', 'กรอสาย'); }
  else { hint(''); actionLabel('🎣', '…'); }
}
function updateAlert() {
  const a = $('alert');
  if (a.classList.contains('hidden')) return;
  tmpV.copy(player.pos); tmpV.y += 2.3;
  tmpV.project(camera);
  a.style.transform = `translate(${(tmpV.x * 0.5 + 0.5) * innerWidth}px, ${(-tmpV.y * 0.5 + 0.5) * innerHeight}px)`;
}

// ---------- ลำดับเรื่องราวของแต่ละวัน ----------
const dexCount = stage => { const l = SPECIES.filter(s => s.stage === stage); return [l.filter(s => dex.dex[s.id]).length, l.length]; };
function openMap() {
  mode = 'map';
  if (world.setMorning) world.setMorning(true);
  S.phase = 'map'; story.save();
  showFishingUi(false);
  story.showMap({ dexCount, sfx, onGo: goFishing });
}
function goFishing(id) {
  S.stage = id; S.phase = 'fishing'; S.time = story.DAY_START;
  S.dead = S.luck === 'bad' && Math.random() < 0.4;      // บางวันปลาไม่กินเลยจริง ๆ
  story.save();
  mode = 'travel';
  story.fade(stageById[id].go, () => loadWorld(id)).then(startFishingMode);
}
function startFishingMode() {
  mode = 'fishing';
  showFishingUi(true);
  lastHud = '';
  const L = story.luck();
  toast(`${stageById[world.id].icon} ${stageById[world.id].name}
${L.icon} ${L.text}`, 3200);
}
let homeBusy = false;
function goHome() {
  if (homeBusy) return;
  homeBusy = true;
  actionUp();
  game.reset();
  mode = 'travel';
  S.phase = 'home'; story.save();
  showFishingUi(false);
  const st = stageById[world.id] || STAGES[0];
  story.fade(st.back, () => loadWorld('home')).then(evening);
}
function evening() {
  mode = 'home';
  homeBusy = false;
  if (world.setMorning) world.setMorning(false);
  story.showEvening({ thumbs, sfx, onDone: async choices => {
    const res = story.settleEvening(choices);
    if (res.grilled.length) world.grillFish(res.grilled.map(f => makeFish(assets, byId[f.id])));
    if (res.earned) sfx.coin();
    world.cheer = res.mood === 'full' ? 1 : 0;
    const lines = [...story.EVENING_LINES[res.mood]];
    if (res.earned) lines.push(['แม่', `ปลาที่เหลือเอาไปขายตลาดได้ ${story.baht(res.earned)} 💰 (มีเงินเก็บ ${story.baht(S.money)})`]);
    if (S.happy < 30) lines.push(['แม่', 'ช่วงนี้ลูกกินไม่ค่อยอิ่มเลย… พรุ่งนี้แบ่งปลามาปิ้งบ้างนะพ่อ']);
    await story.dialog(lines);
    world.cheer = 0;
    $('sleepBtn').classList.remove('hidden');
  } });
}
$('sleepBtn').addEventListener('click', () => {
  $('sleepBtn').classList.add('hidden');
  sfx.click();
  mode = 'travel';
  story.fade(`🌙 ราตรีสวัสดิ์…  เช้าวันที่ ${S.day + 1}`, () => {
    S.day++; S.time = story.DAY_START; story.rollLuck(); S.phase = 'map'; story.save();
  }).then(openMap);
});
const day = { warned: false, saveT: 0 };
function dayTick(dt) {
  if (mode !== 'fishing' || modalOpen()) return;
  S.time += dt * story.HOURS_PER_SEC;
  if (S.time >= 17 && !day.warned) { day.warned = true; toast('🌇 ใกล้ค่ำแล้ว อีกไม่นานต้องกลับบ้าน', 2600); }
  if (S.time < 17) day.warned = false;
  if (S.time >= story.DAY_END && game.state !== 'fight' && game.state !== 'caught') {
    S.time = story.DAY_END;
    toast('ค่ำแล้ว กลับบ้านกันเถอะ 🏠', 2000);
    goHome();
  }
  applyTime(S.time);
  if ((day.saveT += dt) > 5) { day.saveT = 0; story.save(); }
}

// ---------- เริ่มเกม ----------
let ready = false;
function init() {
  player = makePlayer();
  bobber = makeBobber();
  line = makeLine();
  aimRing = new THREE.Mesh(new THREE.RingGeometry(0.32, 0.45, 24).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.85, depthWrite: false }));
  aimRing.visible = false;
  dex = loadDex();
  renderThumbs();
  resize();
  loadWorld(S.phase === 'fishing' && S.stage ? S.stage : 'falls');
  loadBar.style.width = '100%';
  ready = true;
  const cont = S.phase !== 'new';
  $('startBtn').textContent = cont ? `เล่นต่อ (วันที่ ${S.day})` : 'เริ่มเล่น';
  $('newBtn').classList.toggle('hidden', !cont);
  setTimeout(() => { $('loadBar').classList.add('hidden'); $('titleBtns').classList.remove('hidden'); }, 150);
}
async function start() {
  initAudio();
  $('title').classList.add('hidden');
  if (S.phase === 'fishing' && S.stage) {
    if (world.id !== S.stage) loadWorld(S.stage);
    startFishingMode();
    return;
  }
  mode = 'travel';
  if (S.phase === 'home') { await story.fade('กลับถึงบ้านแล้ว…', () => loadWorld('home')); evening(); return; }
  await story.fade(S.phase === 'new' ? 'บ้านไม้หลังเล็ก ริมทุ่งนา…' : `เช้าวันที่ ${S.day}`, () => loadWorld('home'));
  mode = 'home';
  world.setMorning(true);
  if (S.phase === 'new') await story.dialog(story.INTRO);
  openMap();
}
$('startBtn').addEventListener('click', start);
$('newBtn').addEventListener('click', () => {
  if (!confirm('เริ่มเรื่องใหม่ตั้งแต่วันที่ 1? (สมุดสะสมปลายังอยู่)')) return;
  story.resetStory();
  location.reload();
});

let last = performance.now();
function tick(dt, draw = true) {
  shared.uTime.value += dt;
  shared.uWind.value = 0.8 + 0.35 * Math.sin(shared.uTime.value * 0.23);
  updatePlayer(dt);
  game.update(dt);
  updateCamera(dt);
  for (const u of world.update) u(dt, camera);
  if (mode === 'fishing') { dayTick(dt); updateHints(); updateHud(); updateAlert(); }
  ambienceTick(world.ambience?.falls && world.special ? player.pos.distanceTo(world.special) : 10, shared.uTime.value);
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
window.__fish = {
  game, story, get S() { return story.S; }, tick: (dt = 1 / 60, draw = true) => ready && tick(dt, draw), get player() { return player; }, get world() { return world; },
  actionDown, actionUp, keys, get ready() { return ready; }, get mode() { return mode; }, loadWorld, goFishing, goHome, start,
};
