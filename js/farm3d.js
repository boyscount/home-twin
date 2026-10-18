// บ้านสวน 3D — สร้างทุกอย่างแบบ procedural ด้วย Three.js (ไม่ต้องโหลดโมเดลภายนอก)
// พิกัด: x = ตะวันออก, z = ทิศใต้ (ถนนอยู่ด้านหน้า z+), บ้านอยู่ราว ๆ จุด (0,0,0) ซึ่งเป็นศูนย์กลางเรดาร์
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { GTAOPass } from 'three/addons/postprocessing/GTAOPass.js';
import { SkyDome } from './sky.js';
import { CSS2DRenderer, CSS2DObject } from 'three/addons/renderers/CSS2DRenderer.js';
import { bus } from './bus.js';
import { WeatherFX } from './weatherfx.js';
import { freezeStatic } from './freeze.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { makeHuman, animateWalk, animateIdle, SKIN_MAT } from './human.js';
import { makePig, makeChicken, makeFish, makeCat, makeDog } from './animals.js';
import { FOL, windU, makeFoliageTextures, leafMaterial, canopyGeometry, frondGeometry } from './foliage.js';

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
// สร้าง normal map จากความสว่างของลายบนแคนวาส (ร่องไม้ รอยต่ออิฐ ลอนหลังคา) → ผิวมีมิติรับแสงจริง
function normalTex(src, strength = 2) {
  const s = src.image, w = s.width, h = s.height, d = s.getContext('2d').getImageData(0, 0, w, h).data;
  const L = (x, y) => { const i = (((y + h) % h) * w + ((x + w) % w)) * 4; return (d[i] * 0.299 + d[i + 1] * 0.587 + d[i + 2] * 0.114) / 255; };
  const t = canvasTex(w, h, c => {
    const img = c.createImageData(w, h);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const dx = (L(x + 1, y) - L(x - 1, y)) * strength, dy = (L(x, y + 1) - L(x, y - 1)) * strength;
      const n = Math.hypot(dx, dy, 1), i = (y * w + x) * 4;
      img.data[i] = (-dx / n * 0.5 + 0.5) * 255; img.data[i + 1] = (dy / n * 0.5 + 0.5) * 255; img.data[i + 2] = (1 / n * 0.5 + 0.5) * 255; img.data[i + 3] = 255;
    }
    c.putImageData(img, 0, 0);
  });
  t.colorSpace = THREE.NoColorSpace; t.repeat.copy(src.repeat);
  return t;
}
// เงาซอกมุมแบบถูก ๆ: ผนัง/เสาที่ตั้งบนพื้นจะเข้มลงตรงโคน (แทน AO จริงในคุณภาพปกติ เกือบไม่กินเครื่อง)
function groundAO(mat, strength = 0.42, height = 0.9) {
  const prev = mat.onBeforeCompile;
  mat.onBeforeCompile = (sh, r) => {
    prev?.(sh, r);
    sh.vertexShader = 'varying float vGY; varying float vGN;\n' + sh.vertexShader.replace('#include <project_vertex>', `#include <project_vertex>
      vec4 gwp = vec4(transformed, 1.0);
      #ifdef USE_INSTANCING
        gwp = instanceMatrix * gwp;
      #endif
      gwp = modelMatrix * gwp; vGY = gwp.y;
      vGN = abs(normalize(mat3(modelMatrix) * objectNormal).y);`);
    sh.fragmentShader = 'varying float vGY; varying float vGN;\n' + sh.fragmentShader.replace('#include <map_fragment>', `#include <map_fragment>
      diffuseColor.rgb *= mix(1.0 - ${strength.toFixed(2)} * (1.0 - smoothstep(0.0, ${height.toFixed(2)}, vGY)), 1.0, smoothstep(0.35, 0.8, vGN));`);
  };
  mat.customProgramCacheKey = () => 'gao' + strength + height + (prev ? 'p' : '');
}
// เงาซอกมุมที่อบด้วย Blender (Cycles) ลงพื้นทั้งบริเวณบ้าน + สวนยาง (media/ground_ao.jpg)
// คูณสีเฉพาะผิวที่หงายขึ้น ตามพิกัดโลก XZ → ใต้ชายคา/โคนรั้ว/ใต้ร่มต้นยางเข้มลงแบบนุ่ม ๆ ไม่ขึ้นกับเวลา จึงใช้ได้ทั้งกลางวันกลางคืน
const BAKED_AO = { map: { value: null }, X0: -75, X1: 75, Z0: -185, Z1: 62 };
function bakedAO(mat, always = false) {
  const prev = mat.onBeforeCompile;
  mat.onBeforeCompile = (sh, r) => {
    prev?.(sh, r);
    sh.uniforms.uBakedAO = BAKED_AO.map;
    sh.vertexShader = 'varying vec2 vAOuv; varying float vAOup;\n' + sh.vertexShader.replace('#include <project_vertex>', `#include <project_vertex>
      vec4 aop = vec4(transformed, 1.0);
      #ifdef USE_INSTANCING
        aop = instanceMatrix * aop;
      #endif
      aop = modelMatrix * aop;
      vAOuv = vec2((aop.x - (${BAKED_AO.X0.toFixed(1)})) / ${(BAKED_AO.X1 - BAKED_AO.X0).toFixed(1)}, (aop.z - (${BAKED_AO.Z0.toFixed(1)})) / ${(BAKED_AO.Z1 - BAKED_AO.Z0).toFixed(1)});
      vAOup = ${always ? '1.0' : 'smoothstep(0.55, 0.9, normalize(mat3(modelMatrix) * objectNormal).y)'};`);
    sh.fragmentShader = 'uniform sampler2D uBakedAO; varying vec2 vAOuv; varying float vAOup;\n' + sh.fragmentShader.replace('#include <map_fragment>', `#include <map_fragment>
      if (vAOuv.x > 0.0 && vAOuv.x < 1.0 && vAOuv.y > 0.0 && vAOuv.y < 1.0) diffuseColor.rgb *= mix(1.0, pow(texture2D(uBakedAO, vAOuv).r, 1.5), vAOup);`);
  };
  const key = mat.customProgramCacheKey?.bind(mat);
  mat.customProgramCacheKey = () => (key ? key() : '') + 'bao' + (always ? 1 : 0);
}
// ความสูงเนินเขารอบฟาร์ม (ต้องตรงกับ videos/env/gen_hills.py ที่ใช้ปั้นใน Blender) — ไว้วางทิวไม้ไกล ๆ บนเนิน
const sstep = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
export function hillHeight(x, z) {
  const r = Math.hypot(x, z);
  const n = 0.55 + 0.25 * Math.sin(x * 0.013 + 1.7) * Math.cos(z * 0.011 + 0.4) + 0.15 * Math.sin(x * 0.031 + z * 0.027 + 2.1) + 0.08 * Math.sin(x * 0.071 - z * 0.063 + 0.7);
  const ramp = sstep(200, 300, r), road = sstep(25, 70, Math.abs(z - 46));
  return 28 * n * ramp * road - 0.3 * (1 - ramp);
}
const TEX = {};
function makeTextures() {
  TEX.grass = canvasTex(256, 256, (c, w, h) => {
    noise(c, w, h, '#5d7440', 0.22, 9000, 2);
    for (let i = 0; i < 160; i++) { // หย่อมหญ้าแห้งสีฟาง / ดินโผล่
      c.fillStyle = `rgba(${rand(120, 160)},${rand(115, 140)},${rand(60, 80)},${rand(0.08, 0.2)})`;
      c.beginPath(); c.ellipse(rand(0, w), rand(0, h), rand(4, 14), rand(3, 9), rand(0, 3), 0, 7); c.fill();
    }
    for (let i = 0; i < 900; i++) {
      c.strokeStyle = `rgba(${rand(70, 120)},${rand(105, 140)},${rand(45, 70)},0.55)`;
      const x = rand(0, w), y = rand(0, h); c.beginPath(); c.moveTo(x, y); c.lineTo(x + rand(-2, 2), y - rand(3, 7)); c.stroke();
    }
  }, [40, 40]);
  TEX.rice = canvasTex(256, 256, (c, w, h) => {
    noise(c, w, h, '#8a9e58', 0.18, 7000, 2);
    for (let y = 0; y < h; y += 8) { c.fillStyle = 'rgba(40,80,20,0.18)'; c.fillRect(0, y, w, 2); }
    for (let i = 0; i < 1500; i++) { c.fillStyle = `rgba(195,200,120,${rand(0.1, 0.35)})`; c.fillRect(rand(0, w), rand(0, h), 1, 3); }
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
  for (const [k, s] of [['concrete', 1.2], ['asphalt', 1.5], ['wood', 3], ['deck', 4], ['roof', 5], ['brick', 4], ['bark', 3]]) TEX[k + 'N'] = normalTex(TEX[k], s);
}

// ---------------------------------------------------------------- materials
const M = {};
function makeMaterials() {
  const std = (o) => new THREE.MeshStandardMaterial(o);
  // normal map แบนรอไว้ก่อน → พอโหลดภาพพื้นผิวจาก Blender เสร็จ สลับภาพได้เลยไม่ต้องคอมไพล์ shader ใหม่ (ไม่กระตุก)
  const flatN = new THREE.DataTexture(new Uint8Array([128, 128, 255, 255]), 1, 1); flatN.needsUpdate = true; TEX.flatN = flatN;
  M.grass = std({ map: TEX.grass, roughness: 1, normalMap: flatN });
  M.rice = std({ map: TEX.rice, roughness: 1 });
  M.litter = std({ map: TEX.litter, roughness: 1, normalMap: flatN });
  // ด่างเข้ม-อ่อนเป็นหย่อมใหญ่ ๆ ตามตำแหน่งจริง → สนามไม่เขียวเรียบเท่ากันทั้งผืน (เหมือนแดดเผา/ร่มไม้/ดินชื้น)
  const patchy = (mat, dry, lush, scale) => {
    mat.onBeforeCompile = sh => {
      sh.vertexShader = 'varying vec3 vWP;\n' + sh.vertexShader.replace('#include <project_vertex>', '#include <project_vertex>\n vWP = (modelMatrix * vec4(transformed, 1.0)).xyz;');
      sh.fragmentShader = 'varying vec3 vWP;\n' + sh.fragmentShader.replace('#include <map_fragment>', `#include <map_fragment>
        float pp = sin(vWP.x * ${scale[0]} + 1.3) * sin(vWP.z * ${scale[1]} + 0.4) + sin(vWP.x * ${scale[2]} + vWP.z * ${scale[3]}) * 0.5 + sin(vWP.x * ${scale[4]} - vWP.z * ${scale[5]}) * 0.25;
        diffuseColor.rgb *= mix(vec3(${dry}), vec3(${lush}), smoothstep(-0.7, 0.8, pp));`);
    };
  };
  patchy(M.grass, '1.12, 1.04, 0.80', '0.86, 0.94, 0.86', [0.09, 0.075, 0.23, 0.17, 0.55, 0.41]);
  patchy(M.rice, '1.10, 1.02, 0.78', '0.88, 0.96, 0.9', [0.012, 0.017, 0.031, 0.027, 0.07, 0.06]);
  const nrm = (k, s = 1) => ({ normalMap: TEX[k + 'N'], normalScale: new THREE.Vector2(s, s) });
  M.concrete = std({ map: TEX.concrete, roughness: 0.9, ...nrm('concrete', 0.6) });
  M.asphalt = std({ map: TEX.asphalt, roughness: 0.95, ...nrm('asphalt', 0.8) });
  M.wood = std({ map: TEX.wood, roughness: 0.7, ...nrm('wood') });
  M.deck = std({ map: TEX.deck, roughness: 0.6, ...nrm('deck') });
  M.roof = std({ map: TEX.roof, roughness: 0.5, metalness: 0.4, side: THREE.DoubleSide, ...nrm('roof') });
  M.wall = std({ color: '#9fa19e', map: TEX.concrete, roughness: 0.85, ...nrm('concrete', 0.5) });
  M.wallDark = std({ color: '#5d3a2a', roughness: 0.8 });
  M.frame = std({ color: '#1c1c1c', roughness: 0.5, metalness: 0.6 });
  M.glass = new THREE.MeshPhysicalMaterial({ color: '#2b3a36', roughness: 0.05, metalness: 0.2, transparent: true, opacity: 0.32, envMapIntensity: 1.5 });
  M.warm = std({ color: '#ffd9a0', emissive: '#ffb45c', emissiveIntensity: 1.5 });
  M.white = std({ color: '#f2f2ee', roughness: 0.6 });
  M.pipe = std({ color: '#f4f4f0', roughness: 0.35 });
  M.leaf = std({ color: '#3d5a2c', roughness: 0.9 });
  M.leafDark = std({ color: '#2b4024', roughness: 0.9 });
  M.leafLight = std({ color: '#6c8442', roughness: 0.9, side: THREE.DoubleSide });
  // ต้นไม้แต่ละต้นสีไม่เท่ากัน: เขียวเข้ม, เขียวมะกอก, เขียวอมเหลือง, เขียวอมฟ้า
  M.foliage = ['#38542b', '#4a5f2f', '#56693a', '#2f4a30', '#5b6e3c', '#425a35'].map(c => std({ color: c, roughness: 0.92 }));
  M.trunk = std({ color: '#5a4636', roughness: 1 });
  M.bark = std({ map: TEX.bark, roughness: 1, ...nrm('bark') });
  M.brick = std({ map: TEX.brick, roughness: 0.95, ...nrm('brick') });
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
  M.ledBad = std({ color: '#f33', emissive: '#f22', emissiveIntensity: 2.5 });
  for (const k of ['wall', 'wallDark', 'wood', 'brick', 'concrete', 'white', 'trunk', 'bark', 'frame']) groundAO(M[k]);
  for (const k of ['grass', 'rice', 'litter', 'mud', 'concrete']) bakedAO(M[k]);
  // ใบไม้จริง (แผ่นใบโปร่งใส) แต่ละต้นสีต่างกันเล็กน้อย
  M.leaves = ['#ffffff', '#e6efcf', '#d2dcc0', '#f2e7c6', '#c9d8c4'].map(c => leafMaterial(FOL.broad, c));
  M.palmLeaf = ['#ffffff', '#e9e3c4', '#d8e2c2'].map(c => leafMaterial(FOL.palm, c, 1.6));
  M.palmDead = leafMaterial(FOL.palm, '#a07850', 0.6);
  M.bananaLeaf = leafMaterial(FOL.banana, '#c8d6a8', 1.2);
}
// รูปทรงพุ่มใช้ร่วมกัน (สุ่มไว้หลายแบบ ต้นไม้แต่ละต้นจะได้ไม่ซ้ำกันเป๊ะ)
const GEO = {};
function makeSharedGeo() {
  GEO.canopy = [0, 1, 2, 3].map(() => canopyGeometry(36, 1.7, 1.25, 1.7, 1.3));
  GEO.shrub = [0, 1].map(() => canopyGeometry(14, 0.6, 0.45, 0.6, 0.55));
  GEO.palmFrond = frondGeometry(1.6, 4.2, 1.9, 0.3);
  GEO.palmDead = frondGeometry(1.2, 3.2, 3.6, 0.15);
  GEO.bananaLeaf = frondGeometry(0.75, 2.3, 1.7, 0.08);
}

// รวม mesh ลูกหลานทั้งหมดในกลุ่ม (ที่ใช้วัสดุเดียวกัน) เป็น mesh เดียวในพิกัดของกลุ่ม → ลด draw call โดยกลุ่มยังขยับได้ตามเดิม
function mergeChildren(group) {
  group.updateMatrixWorld(true);
  const inv = new THREE.Matrix4().copy(group.matrixWorld).invert(), byMat = new Map();
  group.traverse(o => { if (o.isMesh && o !== group && !Array.isArray(o.material)) (byMat.get(o.material) || byMat.set(o.material, []).get(o.material)).push(o); });
  for (const [mat, list] of byMat) {
    if (list.length < 2) continue;
    const geos = list.map(o => { const g = o.geometry.clone(); g.applyMatrix4(new THREE.Matrix4().multiplyMatrices(inv, o.matrixWorld)); for (const k of Object.keys(g.attributes)) if (!['position', 'normal', 'uv'].includes(k)) g.deleteAttribute(k); return g.index ? g : g; });
    const merged = mergeGeometries(geos.map(g => g.index ? g : g), false); geos.forEach(g => g.dispose());
    if (!merged) continue;
    const m = new THREE.Mesh(merged, mat); m.castShadow = list.some(o => o.castShadow); m.receiveShadow = list.some(o => o.receiveShadow);
    list.forEach(o => o.parent.remove(o)); group.add(m);
  }
  // กลุ่มย่อยที่ว่างแล้วทิ้งได้
  group.children.filter(ch => ch.isGroup && ch.children.length === 0).forEach(ch => group.remove(ch));
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

// ---------------------------------------------------------------- characters (ร่างกายคนอยู่ใน human.js)
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
    // ถึงขอบถนนแล้วจะข้าม → หยุด หันมองซ้าย-ขวา รอจนไม่มีรถกำลังมา แล้วค่อยเดินข้าม
    const R = Walker.road, pz = g.position.z;
    if (R && g.position.y < 0.5) {
      const outside = pz < 41.3 || pz > 50.7, north = pz < 46;
      if (this.crossSide && ((this.crossSide === 'n' && pz > 51) || (this.crossSide === 's' && pz < 41))) this.crossSide = null; // ข้ามเสร็จแล้ว
      const toward = north ? t.z > 41.3 : t.z < 50.7;
      if (!this.crossSide && outside && toward && Math.abs(pz - (north ? 41.15 : 50.85)) < 0.3) {
        this.lookT = (this.lookT || 0) + dt;
        animateIdle(this.h, dt);
        this.h.head.rotation.y = Math.sin(this.lookT * 2.4) * 1.1;
        if (this.lookT > 1.8 && R.clear(g.position.x)) { this.crossSide = north ? 'n' : 's'; this.lookT = 0; }
        return;
      }
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

const CATS = [
  { name: 'ส้ม', color: '#e08a3c', eye: '#e8c547' },
  { name: 'ดำ', color: '#1d1d1f', eye: '#e8d34a' },
  { name: 'ขาว', color: '#f2f0ea', eye: '#6fb7e8' },
  { name: 'สามสี', color: '#f2efe6', patch: '#d4823a', point: '#2b2522' },
  { name: 'สลิ่ม', color: '#8a8580', patch: '#55504b' },
  { name: 'วิเชียรมาศ', color: '#efe3cf', point: '#4a3428', eye: '#5aa7e6' },
];

// ผู้มาเยือน — ใบหน้า/การแต่งตัวต่างกัน ให้เรดาร์ "จำ" ได้ว่าเป็นใคร (ในระบบจริงคือ face embedding)
const PERSONAS = [
  { id: 'P-07', shirt: '#e67e22', pants: '#333', hat: 'cap', hatColor: '#e67e22', skin: '#b97a50', desc: 'เสื้อส้ม หมวกแก๊ป' },
  { id: 'P-12', shirt: '#2c7a4b', pants: '#4a3b2a', hat: 'straw', skin: '#a8714a', desc: 'เสื้อเขียว หมวกสาน' },
  { id: 'P-21', shirt: '#222', pants: '#111', hat: 'helmet', hatColor: '#111', skin: '#c99a72', desc: 'ชุดดำ หมวกกันน็อก' },
  { id: 'P-33', shirt: '#d8d8d8', pants: '#2d4a7a', skin: '#e0b48c', glasses: true, desc: 'เสื้อขาว ใส่แว่น' },
  { id: 'P-48', shirt: '#9b2d5a', pants: '#333', skin: '#d4a07a', longHair: true, desc: 'เสื้อชมพูเข้ม ผมยาว' },
];

// ---------------------------------------------------------------- main class
// ระดับคุณภาพภาพ — มือถือเริ่มที่ 'medium' เพื่อไม่ให้หน่วง/ร้อน
export const QUALITY = {
  // shadowEvery = วาดเงาใหม่ทุกกี่เฟรม (เงาคือส่วนที่กินเครื่องที่สุด)
  // ao = เงาตามซอกมุม/รอยต่อแบบคำนวณจริง (GTAO) — สวยแต่กินการ์ดจอมาก จึงมีเฉพาะระดับสูงสุดสำหรับคอมแรง ๆ
  ultra: { label: 'สูงสุด (คอมการ์ดจอแรง)', post: true, ao: true, shadow: 4096, shadowEvery: 1, pr: 2, grass: 14000 },
  high: { label: 'สูง', post: true, shadow: 2048, shadowEvery: 2, pr: 1.75, grass: 10000 },
  medium: { label: 'กลาง', post: true, shadow: 1024, shadowEvery: 3, pr: 1.25, grass: 4500 },
  low: { label: 'ต่ำ (ประหยัดแบต)', post: false, shadow: 1024, shadowEvery: 4, pr: 1, grass: 0 },
};

// เกรดสี + ขอบมืด (vignette) หลัง tone mapping
const GradeShader = {
  uniforms: { tDiffuse: { value: null }, saturation: { value: 0.97 }, contrast: { value: 1.05 }, vignette: { value: 0.32 }, warmth: { value: 0.0 } },
  vertexShader: `varying vec2 vUv; void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
  fragmentShader: `uniform sampler2D tDiffuse; uniform float saturation, contrast, vignette, warmth; varying vec2 vUv;
    void main() {
      vec4 c = texture2D(tDiffuse, vUv);
      float l = dot(c.rgb, vec3(0.299, 0.587, 0.114));
      c.rgb = mix(vec3(l), c.rgb, saturation);
      c.rgb = (c.rgb - 0.5) * contrast + 0.5;
      c.rgb += vec3(0.03, 0.01, -0.02) * warmth;
      float v = smoothstep(0.85, 0.2, length(vUv - 0.5));
      c.rgb *= mix(1.0 - vignette, 1.0, v);
      gl_FragColor = c;
    }`,
};

const CAMS = {
  overview: { pos: [38, 36, 72], target: [2, 0, 0] },
  house: { pos: [6, 4.5, 26], target: [-2, 2, 2] },
  pig: { pos: [36, 7, 13], target: [30, 0.5, -2] },
  pond: { pos: [13, 8, 32.5], target: [14, 0, 21] },
  chicken: { pos: [38, 5, 27], target: [30, 0.5, 18] },
  hydro: { pos: [-15, 7, 22], target: [-26, 0.5, 6] },
  rubber: { pos: [45, 30, -10], target: [0, 2, -80] },
  school: { pos: [-17, 6, 36], target: [-25, 1, 25.5] },
  carport: { pos: [22, 5, 18], target: [14, 1, 5.5] },
  field: { pos: [74, 9, 54], target: [58, 0, 30] },
  bbq: { pos: [8, 4, 22], target: [2, 0.8, 15.5] },
  gate: { pos: [9, 5, 50], target: [0, 1, 34] },
  roof: { pos: [12, 9.5, 9], target: [3.6, 4.3, -0.5] },
  // กล้องวงจรปิดบนเสาไฟต้นที่ x=48 มองไปตามถนน: หน้าบ้านด้านขวา ถนนตรงกลาง ทุ่งนาฝั่งตรงข้ามด้านซ้าย
  pole: { pos: [47.1, 6.9, 41.3], target: [0, 1.2, 37.5] },
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

  splash(pct, text) {
    const bar = document.getElementById('splashBar'), st = document.getElementById('splashStep');
    if (bar) bar.style.width = pct + '%';
    if (st && text) st.textContent = text;
  }

  init() {
    this.splash(35, 'กำลังสร้างบ้านสวน…');
    makeTextures(); makeFoliageTextures(); makeMaterials(); makeSharedGeo();
    const [w, h] = this.size();
    this.lite = !!window.__lite; // โหมดเบา: จำลองครบ แต่ไม่วาดภาพ 3D (ทีวีชิปอ่อน)
    const r = this.renderer = new THREE.WebGLRenderer({ antialias: !this.lite, powerPreference: this.lite ? 'low-power' : 'default' });
    this.touchDevice = matchMedia('(pointer: coarse)').matches;
    // ทีวี (Tizen/webOS/Android TV ฯลฯ) การ์ดจออ่อนมาก → เริ่มที่คุณภาพต่ำ · มือถือเริ่มที่กลาง
    this.tvDevice = /Tizen|Web0S|webOS|SmartTV|SMART-TV|AFT|BRAVIA|Android TV|HbbTV|NetCast|VIDAA|Hisense|Roku/i.test(navigator.userAgent);
    let q = 'high'; try { q = localStorage.getItem('quality') || (this.tvDevice ? 'low' : this.touchDevice ? 'medium' : 'high'); } catch {}
    this.quality = QUALITY[q] ? q : 'medium';
    r.setPixelRatio(Math.min(devicePixelRatio, QUALITY[this.quality].pr));
    r.setSize(this.lite ? 1 : w, this.lite ? 1 : h);
    r.shadowMap.enabled = !this.lite; r.shadowMap.type = THREE.PCFSoftShadowMap;
    r.shadowMap.autoUpdate = false; this.frameN = 0; // อัปเดตเงาเว้นเฟรม (ดู tick)
    r.toneMapping = THREE.ACESFilmicToneMapping; r.toneMappingExposure = 0.55;
    this.host.appendChild(r.domElement);

    this.labelRenderer = new CSS2DRenderer();
    this.labelRenderer.setSize(w, h);
    Object.assign(this.labelRenderer.domElement.style, { position: 'absolute', top: '0', left: '0', pointerEvents: 'none' });
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
    // ซูมเข้าหาจุดที่นิ้วบีบ/เมาส์ชี้ (ไม่ใช่กลางจอเสมอ) — clampCamera() กันไม่ให้หลุดพื้นที่หรือมุดดิน
    this.controls.zoomToCursor = true;
    this.controls.zoomSpeed = this.touchDevice ? 1.9 : 1.2; // จอสัมผัส: บีบครั้งเดียวไปได้ไกลขึ้น
    this.controls.rotateSpeed = this.touchDevice ? 0.7 : 1;
    this.controls.panSpeed = this.touchDevice ? 1.4 : 1;
    this.setupDoubleTap();
    this.setupTwist();
    this.controls.autoRotateSpeed = 0.7; // หมุนรอบช้า ๆ ราว 85 วินาทีต่อรอบ
    // เปิดแอปทุกครั้งให้หมุนรอบบ้านช้า ๆ (ปุ่ม 🔄 ปิด/เปิดได้เฉพาะรอบที่ใช้งานอยู่ ไม่จำข้ามครั้ง)
    this.controls.autoRotate = true;
    try { localStorage.removeItem('autoRotate'); } catch {}
    this.snapCam = new THREE.PerspectiveCamera(32, 4 / 3, 0.1, 200);
    // ไฟฉายติดกล้อง (ใช้ตอนกล้องเล่าเรื่องเข้าสวนยางตอนกลางคืน หรือกดเปิดเอง)
    s.add(this.camera);
    this.camLight = new THREE.SpotLight('#fff1d8', 0, 110, 0.48, 0.6, 1.0);
    this.camLight.position.set(0.4, -0.3, 0);
    const camTarget = new THREE.Object3D(); camTarget.position.set(0, -3.5, -12);
    this.camera.add(this.camLight, camTarget); this.camLight.target = camTarget;
    this.camLightManual = false;

    // แสง & ท้องฟ้า
    this.skyDome = new SkyDome(); s.add(this.skyDome.mesh);
    this.sun = new THREE.DirectionalLight('#fff1d8', 3);
    this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(QUALITY[this.quality].shadow, QUALITY[this.quality].shadow);
    this.sun.shadow.radius = 3;
    Object.assign(this.sun.shadow.camera, { left: -70, right: 70, top: 70, bottom: -70, near: 1, far: 400 });
    this.sun.shadow.bias = -0.0004; this.sun.shadow.normalBias = 0.03;
    this.sun.target.position.set(5, 0, 5);
    s.add(this.sun, this.sun.target);
    this.hemi = new THREE.HemisphereLight('#cfe3ff', '#4a5a30', 0.8); s.add(this.hemi);
    s.fog = new THREE.FogExp2('#cfd6d0', 0.0065);
    this.pmrem = new THREE.PMREMGenerator(r);
    this.envScene = new THREE.Scene(); this.envScene.add(this.skyDome.envMesh);
    // post-processing: bloom ให้ไฟ/ดวงอาทิตย์เรือง + เกรดสี
    // render target แบบ MSAA 4x — ไม่งั้นขอบภาพจะหยัก (antialias ของ renderer ไม่มีผลตอนใช้ post-processing)
    const pr0 = r.getPixelRatio();
    this.composer = new EffectComposer(r, new THREE.WebGLRenderTarget(w * pr0, h * pr0, { type: THREE.HalfFloatType, samples: 4 }));
    this.composer.addPass(new RenderPass(s, this.camera));
    this.gtao = new GTAOPass(s, this.camera, w, h);
    this.gtao.output = GTAOPass.OUTPUT.Default; this.gtao.blendIntensity = 0.9;
    this.gtao.updateGtaoMaterial({ radius: 1.1, distanceExponent: 1.6, thickness: 1.5, scale: 1.2, samples: 12, distanceFallOff: 1, screenSpaceRadius: false });
    this.gtao.updatePdMaterial({ lumaPhi: 10, depthPhi: 2, normalPhi: 3, radius: 5, rings: 2, samples: 12 });
    this.gtao.enabled = !!QUALITY[this.quality].ao;
    this.composer.addPass(this.gtao);
    this.bloom = new UnrealBloomPass(new THREE.Vector2(w, h), 0.4, 0.55, 2.0);
    this.composer.addPass(this.bloom);
    this.composer.addPass(new OutputPass());
    this.grade = new ShaderPass(GradeShader); this.composer.addPass(this.grade);
    this.nightLights = [];

    // ภาพเงาซอกมุมที่อบจาก Blender: ระหว่างโหลดใช้สีขาว (ไม่มีผล)
    const white = new THREE.DataTexture(new Uint8Array([255, 255, 255, 255]), 1, 1); white.needsUpdate = true; BAKED_AO.map.value = white;
    this.bakedAO = BAKED_AO; // (ไว้เทียบเปิด/ปิดตอนตรวจ)
    if (!this.lite) new THREE.TextureLoader().load('media/ground_ao.jpg', t => { t.colorSpace = THREE.NoColorSpace; t.anisotropy = 4; BAKED_AO.map.value = t; });
    this.buildGround();
    if (!this.lite) this.loadGroundTextures();
    this.buildHouse();
    this.buildRooftop();
    this.buildCarport();
    this.scene.updateMatrixWorld(true); this.momCarSetup();
    this.buildFenceAndGarden();
    this.buildPoles();
    this.buildPond();
    this.buildPigPen();
    this.buildChickenCoop();
    this.buildHydro();
    this.buildRubber();
    this.buildBackdrop();
    this.buildMountains();
    this.grassPending = !this.lite; // หญ้าสร้างทีหลัง (หลังเห็นภาพแล้ว) เพื่อให้เปิดเว็บเร็วขึ้น
    this.buildCharacters();
    this.buildLabels();
    this.gen = 0;
    this.buildBBQ();
    this.buildSchool();
    this.buildSprinkler();
    this.buildFarmLights();
    this.buildBedroom();
    this.buildProps();
    bus.on('sensors', v => this.onSensors(v));
    this.vehicles = []; this.nextCar = 2; this.carsToday = 0; this.carSeq = 0;
    // คนเดินถามก่อนข้าม: มีรถกำลังวิ่งเข้ามาในระยะ 45 ม. ไหม (รถที่จอดรออยู่แล้วไม่นับ)
    Walker.road = { clear: x => !this.vehicles.some(v => { const d = v.dir * (x - v.g.position.x); return d > -4 && d < 45 && v.speed > 0.5; }) };
    this.wxState = { clouds: 0, rain: 0, fog: 0 };
    this.fogBase = 0.0065;
    this.wx = new WeatherFX(this);

    this.setTime(this.hour);
    // env map ต้องมีตั้งแต่แรก (ถ้ามาทีหลัง shader ทุกตัวต้องคอมไพล์ใหม่อีกรอบ)
    if (!this.lite) { clearTimeout(this.envTimer); this.envRT = this.pmrem.fromScene(this.envScene, 0.04); this.scene.environment = this.envRT.texture; }

    bus.on('cmd', c => this.onCommand(c));

    new ResizeObserver(() => this.resize()).observe(this.host);
    this.clock = new THREE.Clock();
    this.statusEl = document.getElementById('farmStatus');
    this.statusTimer = 0;
    this.splash(70, 'กำลังเตรียมแสง เงา และท้องฟ้า…');
    // วาดเฟรมแรก (คอมไพล์ shader) ตอนหน้าโหลดยังแสดงอยู่ แล้วค่อยซ่อนหน้าโหลดเมื่อเห็นภาพจริง
    // หมายเหตุ: ลอง compileAsync แล้วเฟรมแรกกลับช้าลงมาก จึงใช้การวาดตรง ๆ
    performance.mark('farm-built');
    const start = async () => {
      if (this.lite) { // ไม่คอมไพล์ shader / ไม่วาดภาพ — เดินแค่ตรรกะการจำลอง
        this.visible = false;
        r.setAnimationLoop(() => this.safeTick());
        const l = document.getElementById('farmLoading'); if (l) l.remove();
        performance.mark('farm-first-frame'); bus.emit('farm-ready');
        return;
      }
      // คอมไพล์ shader ทั้งฉากแบบขนานระหว่างหน้าโหลด (จอไม่ค้าง) — ตั้ง render target แบบเดียวกับตอนวาดจริง
      this.splash(85, 'กำลังเตรียมกราฟิก… (ครั้งแรกอาจใช้เวลาสักครู่)');
      document.getElementById('splashBar')?.classList.add('busy');
      try {
        const post = QUALITY[this.quality].post;
        if (post) r.setRenderTarget(this.composer.renderTarget1);
        await Promise.race([r.compileAsync(this.scene, this.camera), new Promise(res => setTimeout(res, 15000))]);
        r.setRenderTarget(null);
      } catch { r.setRenderTarget(null); }
      performance.mark('farm-compiled');
      document.getElementById('splashBar')?.classList.remove('busy');
      this.tick();
      performance.mark('farm-first-frame'); // ใช้วัดความเร็วเปิดเว็บ (DevTools → Performance)
      this.splash(100, 'พร้อมแล้ว');
      r.setAnimationLoop(() => this.safeTick());
      requestAnimationFrame(() => setTimeout(() => {
        const l = document.getElementById('farmLoading'); if (l) { l.style.opacity = 0; setTimeout(() => l.remove(), 700); }
        bus.emit('farm-ready');
      }, 120));
      // งานที่ไม่จำเป็นต่อภาพแรก ทำตอนเครื่องว่าง
      const idle = window.requestIdleCallback ? fn => requestIdleCallback(fn, { timeout: 2500 }) : fn => setTimeout(fn, 400);
      idle(() => { if (this.grassPending) { this.grassPending = false; this.buildGrass(); this.renderer.shadowMap.needsUpdate = true; } this.freeze(); });
    };
    // ให้หน้าโหลดได้วาดข้อความ/แถบความคืบหน้าก่อน (rAF เดียว ไม่ใช้ setTimeout ที่โดนหน่วงในแท็บพื้นหลัง)
    requestAnimationFrame(start);
  }

  resize() {
    if (this.lite || !this.host.clientWidth) return;
    const [w, h] = this.size();
    this.renderer.setSize(w, h); this.labelRenderer.setSize(w, h);
    this.composer.setPixelRatio(this.renderer.getPixelRatio()); this.composer.setSize(w, h);
    this.camera.aspect = w / h;
    this.camera.fov = w / h < 1 ? 62 : 45; // จอแนวตั้ง (มือถือ) ขยายมุมมองให้เห็นทั้งสวน
    this.camera.updateProjectionMatrix();
  }

  setVisible(v) { if (this.lite) { this.visible = false; return; } this.visible = v; if (v) requestAnimationFrame(() => this.resize()); }

  // ---------------------------------------------------------------- world
  // พื้นผิวหญ้า/ใบยางแห้งที่ปั้น 3 มิติแล้วเรนเดอร์จาก Blender (media/tex) — ต่อกันไร้รอยต่อ ช่องละ 2.5 / 2.2 ม.
  loadGroundTextures() {
    const L = new THREE.TextureLoader(), aniso = Math.min(8, this.renderer.capabilities.getMaxAnisotropy());
    const set = (mat, url, nurl, rep, ns) => {
      L.load(url, t => { t.colorSpace = THREE.SRGBColorSpace; t.wrapS = t.wrapT = THREE.RepeatWrapping; t.anisotropy = aniso; t.repeat.set(...rep); mat.map = t; });
      L.load(nurl, t => { t.wrapS = t.wrapT = THREE.RepeatWrapping; t.anisotropy = aniso; t.repeat.set(...rep); mat.normalMap = t; mat.normalScale.set(ns, ns); });
    };
    set(M.grass, 'media/tex/grass.jpg', 'media/tex/grass_n.jpg', [1 / 2.5, 1 / 2.5], 0.7); // สนามบ้าน: UV เป็นเมตร
    set(M.litter, 'media/tex/litter.jpg', 'media/tex/litter_n.jpg', [64 / 2.2, 142 / 2.2], 0.8); // พื้นสวนยาง 64×142 ม.
  }

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
    const im = new THREE.InstancedMesh(blade, new THREE.MeshStandardMaterial({ color: '#a3ad66', roughness: 1 }), count);
    const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), col = new THREE.Color();
    let n = 0;
    while (n < count) {
      const x = rand(-150, 150), z = rand(-180, 38);
      if (x > -48 && x < 52 && z > -24 && z < 38) continue; // ที่ดินบ้าน
      if (x > -32 && x < 32 && z < -16) continue; // สวนยาง
      e.set(rand(-0.25, 0.25), rand(0, 6), rand(-0.25, 0.25)); q.setFromEuler(e);
      const sc = rand(0.7, 1.4);
      m4.compose(new THREE.Vector3(x, 0, z), q, new THREE.Vector3(sc, sc, sc));
      im.setMatrixAt(n, m4); im.setColorAt(n, col.setHSL(rand(0.17, 0.25), rand(0.3, 0.42), rand(0.36, 0.5))); n++;
    }
    im.receiveShadow = true; s.add(im);
    this.riceBlades = im;
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
    // หลังคาเฉพาะฝั่งซ้าย — ฝั่งขวา (ห้องปูนเปลือย) เป็นดาดฟ้า ดู buildRooftop()
    const r1 = box(13.4, 0.15, 8, M.roof, -3.1, 5.0, -2.2, g); r1.rotation.x = 0.12;
    const fascia1 = box(13.4, 0.4, 0.12, M.wallDark, -3.1, 4.55, 1.8, g);
    void fascia1;
    // ช่องแสงระหว่างหลังคา
    box(11.7, 0.9, 0.2, M.wood, -2.25, y0 + H + 0.45, 1.6, g);
    this.glassPane(g, -2.25, y0 + H + 0.45, 1.75, 11, 0.6);
    const r2 = box(13.4, 0.15, 7.4, M.roof, -3.1, 3.95, 5.2, g); r2.rotation.x = 0.08;
    box(13.4, 0.35, 0.12, M.wallDark, -3.1, 3.62, 8.9, g);
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

  // ---------------------------------------------------------------- ดาดฟ้า
  // พื้นดาดฟ้าบนห้องปูนฝั่งขวา (กว้าง ~4 ม. ยาว 14 ม. คลุมระเบียงหน้าด้วย) บันไดเหล็กขึ้นด้านข้างบ้าน
  buildRooftop() {
    const g = this.house, Y = 4.16; this.roofY = Y;
    box(4.4, 0.25, 14.3, M.concrete, 5.7, 3.98, 1.85, g);
    const fl = box(4.1, 0.05, 13.9, M.deck, 5.7, 4.13, 1.85, g); fl.castShadow = false;
    box(0.2, 1.1, 14.3, M.wall, 3.5, Y + 0.5, 1.85, g); // ผนังกันด้านที่ติดหลังคา
    const rail = (x, z, w, d) => {
      const p = box(w, 0.95, d, M.glass, x, Y + 0.48, z, g); p.castShadow = false;
      box(w + 0.04, 0.06, d + 0.04, M.frame, x, Y + 0.98, z, g);
    };
    rail(7.85, -4.0, 0.06, 2.4); rail(7.85, 3.9, 0.06, 10.0); // ด้านข้าง (เว้นช่องทางขึ้นบันได)
    rail(5.7, 8.95, 4.3, 0.06); rail(5.7, -5.25, 4.3, 0.06);
    // บันไดเหล็กด้านข้าง: เริ่มที่พื้น z=3.8 ขึ้นไปถึงชานพัก z=-1.6
    const n = 18, run = 5.4;
    for (let i = 0; i < n; i++) box(1.0, 0.05, 0.3, M.wood, 8.5, (i + 1) * (Y / n), 3.8 - i * (run / n), g);
    const len = Math.hypot(run, Y), ang = Math.atan2(Y, run);
    for (const x of [7.98, 9.02]) {
      const st = box(0.06, 0.2, len, M.frame, x, Y / 2, 3.8 - run / 2, g); st.rotation.x = ang;
      const hr = box(0.04, 0.04, len, M.frame, x, Y / 2 + 0.95, 3.8 - run / 2, g); hr.rotation.x = ang;
    }
    box(1.2, 0.08, 1.2, M.frame, 8.5, Y - 0.04, -2.2, g);
    box(0.08, Y, 0.08, M.frame, 9.05, Y / 2, -2.75, g);
    // ม้านั่งไม้ติดผนัง + เบาะ
    box(0.55, 0.45, 5.2, M.wood, 3.9, Y + 0.225, 3.6, g);
    box(0.5, 0.08, 5.0, new THREE.MeshStandardMaterial({ color: '#d8c7a6', roughness: 1 }), 3.9, Y + 0.49, 3.6, g);
    // เสื่อนอนดูดาว 2 ผืน + หมอน + กล้องโทรทรรศน์
    const matC = ['#c0634a', '#4a6fa0'];
    this.roofMats = [5.0, 6.3].map((x, i) => {
      const m = box(0.85, 0.06, 1.95, new THREE.MeshStandardMaterial({ color: matC[i], roughness: 1 }), x, Y + 0.03, -2.1, g); m.castShadow = false;
      sph(0.2, M.white, x, Y + 0.1, -2.9, g, 10).scale.set(1.6, 0.45, 0.8);
      return { x: x - 2, z: -1.15 }; // จุดปลายเท้า (พิกัดโลก)
    });
    const tel = new THREE.Group(); tel.position.set(7.1, Y, -3.9); g.add(tel);
    for (let i = 0; i < 3; i++) {
      const a = i * 2.1, l = cyl(0.015, 0.015, 1.1, M.frame, Math.sin(a) * 0.16, 0.52, Math.cos(a) * 0.16, tel, 5);
      l.rotation.set(0.3 * Math.cos(a), 0, -0.3 * Math.sin(a));
    }
    const tube = cyl(0.06, 0.05, 0.85, M.white, 0, 1.12, 0, tel, 12); tube.rotation.x = -0.9; tube.rotation.z = 0.3;
    // กระถางต้นไม้ + ไฟระย้าตามราว
    for (const [x, z] of [[7.4, 8.4], [4.0, 8.4], [7.4, -4.8], [4.0, -4.8]]) {
      cyl(0.22, 0.16, 0.4, M.white, x, Y + 0.2, z, g, 10);
      const pl = new THREE.Mesh(GEO.shrub[0], M.leaves[1]); pl.position.set(x, Y + 0.75, z); pl.scale.setScalar(0.85); g.add(pl);
    }
    this.roofBulbs = [];
    for (let i = 0; i <= 14; i++) { const b = sph(0.045, M.warm, 7.8, Y + 1.25 + Math.sin(i * 0.9) * 0.08, -5 + i, g, 6); b.castShadow = false; this.roofBulbs.push(b); }
    for (let i = 1; i <= 4; i++) { const b = sph(0.045, M.warm, 7.8 - i * 0.85, Y + 1.2, 8.9, g, 6); b.castShadow = false; this.roofBulbs.push(b); }
    const pl = new THREE.PointLight('#ffc27a', 0, 9, 1.6); pl.position.set(6, Y + 1.6, 2); g.add(pl); this.nightLights.push({ l: pl, max: 2.2 });
    // ดาวตก (เส้นสว่างวิ่งข้ามฟ้า)
    const mm = new THREE.MeshBasicMaterial({ color: '#fff6e0', transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, fog: false });
    this.meteor = new THREE.Mesh(new THREE.CylinderGeometry(0.0, 0.35, 26, 5, 1, true), mm);
    this.meteor.visible = false; this.meteor.frustumCulled = false; this.meteor.userData = { t: 0, v: new THREE.Vector3() };
    this.scene.add(this.meteor); this.meteorT = 6;
    this.stargazing = null;
  }

  onRoof(o) { return o.position.y > 3; }
  // ทางขึ้น/ลงดาดฟ้า (พิกัดโลก) — แตกเป็นหลายจุดตามขั้นบันได ตัวละครจะได้ไต่ขึ้นตามความชันจริง
  roofUp() {
    const Y = this.roofY, pts = [[7.2, 0, 6.2], [6.5, 0, 4.4]];
    for (let i = 1; i <= 6; i++) pts.push([6.5, Y * i / 6, 3.8 - 5.4 * i / 6]);
    return [...pts, [6.5, Y, -2.2], [5.2, Y, -2.0]];
  }
  roofDown() { return this.roofUp().reverse().slice(1); }

  // ขึ้นไปนอนดูดาว (พี่สาว + น้องสาว)
  startStargaze(source = 'auto') {
    if (this.stargazing || this.familyAsleep || this.bbq.active || this.school.active) return false;
    this.stargazing = { source };
    this.kidGen = (this.kidGen || 0) + 1; this.sisGen = (this.sisGen || 0) + 1;
    [[this.kid, 0], [this.sis, 1]].forEach(([who, i]) => {
      const h = who.h, mat = this.roofMats[i], Y = this.roofY;
      who.w.locked = true; who.w.wait = 0; h.holding = false; h.sitting = false; h.teaching = false; who.task = 'ขึ้นดาดฟ้าไปดูดาว';
      const start = this.onRoof(h.group) ? [] : this.isInside(h.group) ? this.pathOut() : [];
      const up = this.onRoof(h.group) ? [] : this.roofUp();
      who.w.go([...start, ...up, [mat.x, Y, mat.z + 0.6], [mat.x, Y, mat.z]], () => {
        if (!this.stargazing) return;
        h.group.rotation.set(-Math.PI / 2, 0, 0); h.baseY = Y + 0.06 + 0.1 * h.group.scale.y; h.sleeping = true;
        who.task = 'นอนดูดาวบนดาดฟ้า 🌌';
      }, true);
    });
    bus.emit('farm-event', '🌌 พี่สาวกับน้องสาวขึ้นไปนอนดูดาวบนดาดฟ้า');
    return true;
  }
  endStargaze() {
    if (!this.stargazing) return;
    this.stargazing = null;
    this.kidGen = (this.kidGen || 0) + 1; this.sisGen = (this.sisGen || 0) + 1;
    let left = 2;
    [this.kid, this.sis].forEach(who => {
      const h = who.h;
      if (h.sleeping) { h.sleeping = false; h.group.rotation.set(0, 0, 0); h.group.position.y = this.roofY; h.baseY = this.roofY; }
      h.sitting = false; who.task = 'ลงจากดาดฟ้า';
      const down = this.onRoof(h.group) ? this.roofDown() : [];
      who.w.go([...down, who === this.kid ? [0, 0, 16] : [-3, 0, 11.5]], () => {
        who.w.locked = false;
        if (--left === 0 && !this.familyAsleep) { this.sis.task = 'พักหน้าบ้าน'; this.kid.task = 'เล่นในสวน'; setTimeout(() => this.sisLoop(), 20000); this.kidLoop(); }
      }, true);
    });
  }
  // น้องสาวขึ้นไปนั่งเล่นบนม้านั่งดาดฟ้าตอนกลางวัน
  kidRoofSit(gen) {
    const k = this.kid, h = k.h, Y = this.roofY, z = rand(2, 5);
    k.task = 'ขึ้นไปนั่งเล่นบนดาดฟ้า';
    k.w.go([...this.roofUp(), [2.6, Y, z], [2.05, Y, z]], () => {
      if (gen !== this.kidToken()) return;
      h.group.rotation.y = Math.PI / 2; h.baseY = Y + 0.53 - 0.46 * h.group.scale.y; h.sitting = true; k.task = 'นั่งเล่นบนดาดฟ้า';
      setTimeout(() => {
        if (gen !== this.kidToken()) return;
        h.sitting = false; h.baseY = Y; k.task = 'ลงจากดาดฟ้า';
        k.w.go([...this.roofDown(), [0, 0, 16]], () => this.kidLoop(gen));
      }, rand(18, 30) * 1000);
    });
  }
  updateRooftop(dt) {
    const night = (this.nightFactor || 0) > 0.5;
    const on = night || this.devices.lights;
    if (this.roofBulbsOn !== on) { this.roofBulbsOn = on; this.roofBulbs.forEach(b => (b.visible = on)); }
    // ดาวตก: ระหว่างนอนดูดาวตอนกลางคืน ทุก ๆ 5–12 วิ
    const m = this.meteor;
    if (m.visible) {
      m.userData.t += dt; const k = m.userData.t / 0.9;
      m.position.addScaledVector(m.userData.v, dt);
      m.material.opacity = Math.sin(Math.min(1, k) * Math.PI) * 0.95;
      this.meteorFlash = k < 1;
      if (k >= 1) m.visible = false;
    } else if (this.stargazing && night && (this.meteorT -= dt) < 0) {
      this.meteorT = rand(5, 12);
      const a = rand(0, Math.PI * 2), dir = new THREE.Vector3(Math.cos(a), -0.35, Math.sin(a)).normalize();
      m.position.set(rand(-120, 120), rand(140, 190), rand(-260, -60));
      m.userData = { t: 0, v: dir.clone().multiplyScalar(160) };
      m.quaternion.setFromUnitVectors(new THREE.Vector3(0, -1, 0), dir);
      m.visible = true;
    }
  }

  // ---------------------------------------------------------------- แม่ขับรถไปทำงาน (07:45 ออก · 17:00 กลับ)
  // รถเก๋งสีเงินในโรงรถเป็นรถแม่ จอดหันหัวออกเสมอ (ขากลับถอยเข้าซอง)
  momCarSetup() {
    const car = this.momCar, p = new THREE.Vector3(); car.getWorldPosition(p);
    this.scene.attach(car); // ย้ายออกจากกลุ่มโรงรถ จะได้ขับไปไหนก็ได้
    this.momPark = { x: p.x, z: p.z };
    car.rotation.set(0, 0, 0); car.position.set(p.x, 0, p.z);
    this.momState = 'home'; this.momDrive = null;
    this.momCarV = { g: car, dir: 1, speed: 0, len: 4.6, own: true, laneZ: 44.3 };
    this.momEnt = { id: 'CAR-MOM', type: 'vehicle', label: 'รถของแม่', obj: car };
  }
  // จุดทาง (พิกัดโลก): s = ความเร็ว ม./วิ, rev = ถอย, wait = รอให้ถนนว่างก่อนไปต่อ
  momRouteOut() {
    const P = this.momPark;
    return [
      { x: P.x, z: P.z + 3.8, s: 2.2 }, { x: P.x - 1.3, z: P.z + 6.6, s: 3 }, { x: 1.6, z: 22.4, s: 4 }, { x: 0.3, z: 26, s: 4 },
      { x: 0, z: 33, s: 4 }, { x: 0, z: 39.6, s: 2.5, wait: 'out' }, { x: 0.8, z: 42.4, s: 3.5 }, { x: 4, z: 44.3, s: 6 },
      { x: 30, z: 44.3, s: 12 }, { x: 330, z: 44.3, s: 14 },
    ];
  }
  momRouteIn() {
    const P = this.momPark;
    return [
      { x: 40, z: 47.7, s: 12 }, { x: 7, z: 47.7, s: 6 }, { x: 2.6, z: 47.4, s: 2.5, wait: 'in' }, { x: 0.6, z: 44.6, s: 3 },
      { x: 0, z: 39.5, s: 3.5 }, { x: 0, z: 33, s: 4 }, { x: 0.3, z: 26, s: 4 }, { x: 1.6, z: 22.4, s: 4 }, { x: P.x - 1.4, z: P.z + 6.4, s: 3 },
      { x: P.x + 3.4, z: P.z + 4.8, s: 2.2 }, // เลยซองไปนิด แล้วถอยเข้า
      { x: P.x + 1, z: P.z + 3.1, s: 1.6, rev: true }, { x: P.x, z: P.z + 1, s: 1.4, rev: true }, { x: P.x, z: P.z, s: 0.8, rev: true },
    ];
  }
  // ถนนว่างพอให้เลี้ยวออก/เข้าไหม (ไม่มีรถคันอื่นกำลังวิ่งเข้ามาใกล้ทางเข้าบ้าน)
  roadClearForTurn(lanes) {
    return !this.vehicles.some(v => !v.own && lanes.includes(v.dir) && v.speed > 0.5 && (() => { const d = v.dir * (0 - v.g.position.x); return d > -6 && d < 48; })());
  }
  startMomLeave(source = 'auto') {
    if (this.momState !== 'home' || this.familyAsleep) return false;
    const m = this.mom, h = m.h, P = this.momPark;
    this.momState = 'leaving'; m.w.locked = true; m.w.wait = 0; this.momTask = 'เดินไปขึ้นรถ';
    const start = this.isInside(h.group) ? this.pathOut() : [];
    m.w.go([...start, [7.5, 0, 10.2], [P.x - 1.25, 0, P.z + 1.4], [P.x - 1.25, 0, P.z + 0.6]], () => {
      h.group.visible = false; this.entities = this.entities.filter(e => e.h !== h);
      this.momTask = 'ขับรถไปทำงาน 🚗';
      this.momTimer = { t: 1.5, fn: () => this.momStartDrive(this.momRouteOut(), () => this.momArriveAway()) }; // ปิดประตูรถ สตาร์ท
    }, true);
    bus.emit('farm-event', '👩 แม่ออกจากบ้าน เดินไปขึ้นรถ — ไปทำงาน');
    return true;
  }
  momArriveAway() {
    this.momState = 'away'; this.momTask = 'ไปทำงาน (กลับ 17:00)';
    this.momCar.visible = false; this.momDrive = null;
    this.vehicles = this.vehicles.filter(v => v !== this.momCarV); this.entities = this.entities.filter(e => e !== this.momEnt);
  }
  startMomReturn(source = 'auto') {
    if (this.momState !== 'away') return false;
    this.momState = 'returning'; this.momTask = 'ขับรถกลับบ้าน 🚗';
    const car = this.momCar; car.visible = true; car.position.set(330, 0, 47.7); car.rotation.y = -Math.PI / 2;
    this.momStartDrive([{ x: 120, z: 47.7, s: 14 }, ...this.momRouteIn()], () => this.momParked());
    bus.emit('farm-event', '🚗 รถแม่กำลังกลับมาถึงบ้าน');
    return true;
  }
  momParked() {
    const m = this.mom, h = m.h, P = this.momPark;
    this.momDrive = null; this.momCar.position.set(P.x, 0, P.z); this.momCar.rotation.y = 0;
    this.vehicles = this.vehicles.filter(v => v !== this.momCarV); this.entities = this.entities.filter(e => e !== this.momEnt);
    this.momTask = 'ลงจากรถ';
    this.momTimer = { t: 1.2, fn: () => {
      h.group.visible = true; h.group.position.set(P.x - 1.25, 0, P.z + 0.6); h.baseY = 0; h.group.rotation.y = Math.PI;
      if (!this.entities.some(e => e.h === h)) this.entities.push({ id: 'H-MOM', type: 'human', label: 'แม่', resident: true, obj: h.group, h });
      m.w.go([[P.x - 1.25, 0, P.z + 1.6], [7.5, 0, 10.2], ...this.pathIn([-3.5, 0.65, -0.6])], () => {
        this.momState = 'home'; m.w.locked = false; this.momTask = 'อยู่บ้าน';
        if (!this.familyAsleep) this.momLoop();
      }, true);
      bus.emit('farm-event', '🏠 แม่กลับจากทำงานถึงบ้านแล้ว');
    } };
  }
  momStartDrive(route, done) {
    const car = this.momCar;
    this.momDrive = { route, i: 0, done, speed: 0, waitT: 0 };
    if (!this.vehicles.includes(this.momCarV)) this.vehicles.push(this.momCarV);
    if (!this.entities.includes(this.momEnt)) this.entities.push(this.momEnt);
    // ประตูรั้วปิดอยู่ → เปิดให้รถผ่าน แล้วค่อยปิดคืนตอนรถผ่านไปแล้ว
    if (this.devices.gateClosed) { this.momGateWasClosed = true; this.devices.gateClosed = false; }
    car.visible = true;
  }
  updateMomCar(dt) {
    if (this.momTimer && (this.momTimer.t -= dt) <= 0) { const fn = this.momTimer.fn; this.momTimer = null; fn(); } // หน่วงตามเวลาในฉาก
    const D = this.momDrive; if (!D) return;
    const car = this.momCar, p = car.position, wp = D.route[D.i];
    const dx = wp.x - p.x, dz = wp.z - p.z, dist = Math.hypot(dx, dz);
    // รอถนนว่างก่อนเลี้ยวออก/เข้า
    let target = wp.s;
    if (wp.wait && dist < 0.6) {
      const ok = this.roadClearForTurn(wp.wait === 'out' ? [1, -1] : [1]);
      if (!ok) { target = 0; D.waitT += dt; } else D.waitT = 0;
    }
    // ชะลอก่อนถึงจุดที่ต้องเลี้ยวแรง/หยุด
    const next = D.route[D.i + 1];
    if (!next) target = Math.min(target, Math.max(0.5, dist * 1.2));
    else if (next.s < wp.s && dist < 6) target = Math.min(target, next.s + dist * 0.8);
    D.speed += Math.max(-6 * dt, Math.min(2.4 * dt, target - D.speed));
    if (D.speed < 0) D.speed = 0;
    const step = Math.min(dist, D.speed * dt);
    if (dist > 0.01) {
      p.x += dx / dist * step; p.z += dz / dist * step;
      // หันหัวรถตามทิศที่วิ่ง (ถอย = หันหัวกลับด้าน) เลี้ยวได้เร็วตามความเร็วรถ
      let want = Math.atan2(dx, dz); if (wp.rev) want += Math.PI;
      let diff = want - car.rotation.y; diff = Math.atan2(Math.sin(diff), Math.cos(diff));
      const rate = Math.min(2.2, 0.35 + D.speed * 0.45) * dt;
      car.rotation.y += Math.max(-rate, Math.min(rate, diff));
    }
    const mv = this.momCarV; mv.speed = D.speed; mv.dir = Math.sin(car.rotation.y) >= 0 ? 1 : -1; mv.laneZ = p.z;
    const night = this.nightFactor > 0.4 || (this.wxState?.rain || 0) > 0.5;
    car.userData.hl.emissiveIntensity = night ? 4 : 0.3;
    car.userData.tl.emissiveIntensity = (D.speed < 0.5 || target < D.speed - 0.3) ? (night ? 7 : 3.5) : night ? 2.5 : 0.4;
    // ผ่านประตูรั้วไปแล้ว → ปิดคืนเหมือนเดิม
    if (this.momGateWasClosed && ((this.momState === 'leaving' && p.z > 42) || (this.momState === 'returning' && p.z < 30))) { this.devices.gateClosed = true; this.momGateWasClosed = false; }
    if (dist < 0.25 && !(wp.wait && D.waitT > 0)) {
      D.i++;
      if (D.i >= D.route.length) { const cb = D.done; this.momDrive = null; cb?.(); }
    }
  }
  // เวลาในฉากกระโดด (เช่น เลื่อนเวลา/เปิดเว็บกลางวัน) → จัดแม่+รถให้ตรงช่วงเวลาทันที
  syncMomInstant(h) {
    const away = h >= 8.1 && h < 17;
    const m = this.mom;
    if (away && this.momState === 'home') {
      m.w.locked = true; m.w.path = []; m.h.group.visible = false; this.entities = this.entities.filter(e => e.h !== m.h);
      this.momArriveAway();
    } else if (!away && h >= 17.6 && this.momState === 'away') {
      const P = this.momPark;
      this.momCar.visible = true; this.momCar.position.set(P.x, 0, P.z); this.momCar.rotation.y = 0;
      m.h.group.visible = true; m.w.locked = false; m.h.baseY = 0.65; m.h.group.position.set(-3.5, 0.65, -0.6);
      if (!this.entities.some(e => e.h === m.h)) this.entities.push({ id: 'H-MOM', type: 'human', label: 'แม่', resident: true, obj: m.h.group, h: m.h });
      this.momState = 'home'; this.momTask = 'อยู่บ้าน'; this.momLoop();
    }
  }

  // ---------------------------------------------------------------- เสาไฟฟ้า + สายไฟ + ไฟถนน
  // เสาคอนกรีตริมถนนทุก ~40 ม. คอนสายเหล็ก ลูกถ้วย สายไฟหย่อนตามจริง · ไฟถนนเว้นต้น
  // หม้อแปลงที่เสาใกล้บ้าน → สายเมนลงเสามิเตอร์หน้าบ้าน → เข้าบ้าน
  // ไฟถนนกลางคืนใช้วัสดุเรืองแสง + แผ่นแสงบนพื้น (ไม่เพิ่มดวงไฟจริง เพื่อไม่ให้ shader คอมไพล์ใหม่/เครื่องหนัก)
  buildPoles() {
    const s = this.scene, PZ = 39.4, H = 9.2;
    const poleM = new THREE.MeshStandardMaterial({ color: '#b9b7af', roughness: 0.9 });
    const steel = new THREE.MeshStandardMaterial({ color: '#6c7074', roughness: 0.5, metalness: 0.6 });
    const insul = new THREE.MeshStandardMaterial({ color: '#e9e6dc', roughness: 0.3 });
    const wireM = new THREE.MeshStandardMaterial({ color: '#1b1b1b', roughness: 0.6 });
    this.streetLampMat = new THREE.MeshStandardMaterial({ color: '#fff6e0', emissive: '#ffe7b0', emissiveIntensity: 0.05 });
    const pool = document.createElement('canvas'); pool.width = pool.height = 128;
    const pc = pool.getContext('2d'), rg = pc.createRadialGradient(64, 64, 0, 64, 64, 64);
    rg.addColorStop(0, 'rgba(255,225,170,.55)'); rg.addColorStop(0.45, 'rgba(255,210,150,.22)'); rg.addColorStop(1, 'rgba(255,200,140,0)');
    pc.fillStyle = rg; pc.fillRect(0, 0, 128, 128);
    this.lampPoolMat = new THREE.MeshBasicMaterial({ map: new THREE.CanvasTexture(pool), transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending, polygonOffset: true, polygonOffsetFactor: -2 });
    const poolGeo = new THREE.PlaneGeometry(13, 13); poolGeo.rotateX(-Math.PI / 2);
    const xs = []; for (let x = -272; x <= 290; x += 40) xs.push(x); // มีต้นหนึ่งที่ x = 8 (ใกล้ประตูบ้าน)
    const tops = [];
    xs.forEach((x, k) => {
      const g = new THREE.Group(); g.position.set(x, 0, PZ); s.add(g);
      const p = cyl(0.11, 0.17, H, poleM, 0, H / 2, 0, g, 8); p.scale.z = 0.8; // เสาคอนกรีตเรียวขึ้น
      box(0.1, 0.1, 2.4, steel, 0, H - 0.35, 0.25, g); // คอนสาย (ขวางถนน)
      for (const dz of [-0.75, 0.25, 1.25]) { cyl(0.05, 0.06, 0.16, insul, 0, H - 0.22, dz, g, 8); tops.push({ x, y: H - 0.12, z: PZ + dz }); }
      box(0.08, 0.08, 1.3, steel, 0, H - 1.5, 0.1, g); // คอนสายล่าง (สายสื่อสาร)
      tops.push({ x, y: H - 1.42, z: PZ + 0.6, low: true });
      // ไฟถนนเว้นต้น: แขนยื่นเข้าถนน + โคม
      if (k % 2 === 0) {
        const arm = box(0.07, 0.07, 2.2, steel, 0, H - 2.3, 1.1, g); arm.rotation.x = -0.18;
        const head = box(0.32, 0.12, 0.62, steel, 0, H - 2.12, 2.25, g);
        const lens = box(0.26, 0.03, 0.5, this.streetLampMat, 0, H - 2.2, 2.25, g); lens.castShadow = false; void head;
        const pl = new THREE.Mesh(poolGeo, this.lampPoolMat); pl.position.set(x, 0.07, PZ + 4.2); pl.renderOrder = 2; s.add(pl);
      }
      // กล้องวงจรปิดบนเสาต้นนี้ (มุมกล้อง "เสาไฟ")
      if (x === 48) {
        box(0.06, 0.06, 1.9, steel, 0, H - 2.25, 0.95, g); // แขนยึดกล้องยื่นออกไปทางถนน (อยู่ใต้สายไฟ)
        const cam = new THREE.Group(); cam.position.set(-0.12, H - 2.35, 1.85); cam.rotation.y = -Math.PI / 2 - 0.06; g.add(cam);
        box(0.06, 0.06, 0.3, steel, 0, 0.1, -0.12, cam);
        box(0.16, 0.14, 0.34, new THREE.MeshStandardMaterial({ color: '#eceae4', roughness: 0.4 }), 0, 0, 0.12, cam);
        box(0.2, 0.03, 0.4, new THREE.MeshStandardMaterial({ color: '#eceae4', roughness: 0.4 }), 0, 0.09, 0.14, cam);
        cyl(0.045, 0.045, 0.02, new THREE.MeshStandardMaterial({ color: '#111', roughness: 0.1, metalness: 0.5 }), 0, 0, 0.3, cam, 12).rotation.x = Math.PI / 2;
        sph(0.012, M.ledBad, 0.05, 0.05, 0.3, cam, 6);
      }
      // หม้อแปลงไฟฟ้าที่ต้นใกล้บ้าน
      if (x === 8) {
        box(0.12, 0.12, 1.4, steel, 0, H - 3.4, -0.35, g);
        cyl(0.36, 0.36, 0.95, new THREE.MeshStandardMaterial({ color: '#8a9096', roughness: 0.5, metalness: 0.4 }), 0, H - 2.85, -0.62, g, 14);
        for (const dx of [-0.16, 0, 0.16]) cyl(0.035, 0.035, 0.22, insul, dx, H - 2.27, -0.62, g, 6);
      }
    });
    // สายไฟหย่อนระหว่างเสา (catenary)
    const sagWire = (a, b, sag, r = 0.013) => {
      const pts = []; for (let i = 0; i <= 10; i++) { const t = i / 10; pts.push(new THREE.Vector3(a.x + (b.x - a.x) * t, a.y + (b.y - a.y) * t - sag * 4 * t * (1 - t), a.z + (b.z - a.z) * t)); }
      const m = new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 10, r, 3), wireM); m.castShadow = false; s.add(m);
    };
    const lines = {}; tops.forEach(t => (lines[`${t.z}|${t.low ? 1 : 0}`] ||= []).push(t));
    for (const L of Object.values(lines)) for (let i = 0; i < L.length - 1; i++) sagWire(L[i], L[i + 1], L[i].low ? 0.9 : 0.65);
    // ฝั่งตรงข้ามถนน: เสาเตี้ยกว่า (ไฟแรงต่ำ + สายสื่อสาร) — ไฟถนนสลับฝั่งกับฝั่งบ้าน ทุก 40 ม. มีไฟฝั่งใดฝั่งหนึ่ง
    const OZ = 52.9, OH = 7.6, otops = [];
    xs.forEach((x, k) => {
      const g = new THREE.Group(); g.position.set(x, 0, OZ); s.add(g);
      const p = cyl(0.09, 0.14, OH, poleM, 0, OH / 2, 0, g, 8); p.scale.z = 0.8;
      box(0.08, 0.08, 1.2, steel, 0, OH - 0.3, -0.15, g);
      for (const dz of [-0.6, 0.3]) { cyl(0.04, 0.05, 0.13, insul, 0, OH - 0.2, dz, g, 6); otops.push({ x, y: OH - 0.12, z: OZ + dz }); }
      otops.push({ x, y: OH - 1.3, z: OZ - 0.12, low: true }); // สายสื่อสาร
      if (k % 2 === 1) {
        const arm = box(0.07, 0.07, 2.0, steel, 0, OH - 1.0, -1.0, g); arm.rotation.x = 0.18;
        box(0.3, 0.12, 0.58, steel, 0, OH - 0.85, -2.05, g);
        const lens = box(0.24, 0.03, 0.46, this.streetLampMat, 0, OH - 0.93, -2.05, g); lens.castShadow = false;
        const pl = new THREE.Mesh(poolGeo, this.lampPoolMat); pl.position.set(x, 0.07, OZ - 4.4); pl.renderOrder = 2; s.add(pl);
      }
    });
    const olines = {}; otops.forEach(t => (olines[`${t.z}|${t.low ? 1 : 0}`] ||= []).push(t));
    for (const L of Object.values(olines)) for (let i = 0; i < L.length - 1; i++) sagWire(L[i], L[i + 1], L[i].low ? 0.8 : 0.6);
    // สายแรงต่ำข้ามถนนเป็นช่วง ๆ (จากหม้อแปลงฝั่งบ้านไปเลี้ยงฝั่งตรงข้าม)
    sagWire({ x: 8, y: H - 2.5, z: PZ - 0.5 }, { x: 8, y: OH - 0.15, z: OZ - 0.6 }, 0.7, 0.012);
    // เสามิเตอร์หน้าบ้าน (ในรั้ว ข้างประตู) + สายเมนจากหม้อแปลงลงมา + สายเข้าบ้าน
    const mg = new THREE.Group(); mg.position.set(5.6, 0, 34.2); s.add(mg);
    cyl(0.09, 0.13, 6.2, poleM, 0, 3.1, 0, mg, 8);
    box(0.36, 0.5, 0.18, new THREE.MeshStandardMaterial({ color: '#d9d9d2', roughness: 0.6 }), 0, 1.7, 0.14, mg); // ตู้มิเตอร์
    box(0.22, 0.22, 0.04, new THREE.MeshStandardMaterial({ color: '#30383c', roughness: 0.2, metalness: 0.3 }), 0, 1.75, 0.24, mg);
    cyl(0.04, 0.05, 0.12, insul, 0, 6.05, 0, mg, 6);
    sagWire({ x: 8, y: H - 2.4, z: PZ - 0.62 }, { x: 5.6, y: 6.1, z: 34.2 }, 0.35, 0.018);
    sagWire({ x: 5.6, y: 1.5, z: 34.25 }, { x: 5.6, y: 0.05, z: 34.25 }, 0, 0.02); // ท่อสายลงดิน
    sagWire({ x: 5.6, y: 6.0, z: 34.2 }, { x: 4.15, y: 3.55, z: 5.2 }, 1.1, 0.016); // สายเข้าบ้าน (ผนังขวาด้านหน้า)
    cyl(0.03, 0.03, 0.14, insul, 4.2, 3.55, 5.2, s, 6).rotation.z = Math.PI / 2;
  }
  updatePoles() {
    const night = (this.nightFactor || 0) > 0.45;
    const k = night ? 1 : 0;
    if (this.lampOn === k) return;
    this.lampOn = k;
    this.streetLampMat.emissiveIntensity = night ? 3.2 : 0.05;
    this.lampPoolMat.opacity = night ? 0.85 : 0;
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
    this.momCar = this.makeCar(g, -1.8, 0.2, '#b9bec4', false); // รถแม่ (ใช้ขับไปทำงาน)
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
      mergeChildren(leaf); // ซี่ประตู 15 ชิ้น → 1 ชิ้น (ยังเปิด-ปิดได้)
      pivot.rotation.y = side * 1.3; this.gates.push({ pivot, side });
    }
    // แนวรั้วต้นไม้
    const hedgeM = new THREE.MeshStandardMaterial({ color: '#4b6334', roughness: 1 });
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
      const b = new THREE.Mesh(GEO.shrub[i % 2], M.leaves[i % M.leaves.length]); b.position.set(x, 0.4, z);
      b.scale.setScalar(rand(0.6, 1.3)); b.rotation.y = rand(0, 6); b.castShadow = true; s.add(b);
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
    cyl(0.16, 0.3, 3.6, M.bark, 0, 1.8, 0, g, 8);
    const lm = M.leaves[Math.floor(Math.random() * M.leaves.length)];
    // กิ่งแตกออกจากลำต้น แล้วมีพุ่มใบที่ปลายกิ่งแต่ละกิ่ง + พุ่มกลางยอด
    const n = 4;
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2 + rand(-0.4, 0.4), tilt = rand(0.5, 0.9), len = rand(1.6, 2.3);
      const br = cyl(0.06, 0.11, len, M.bark, 0, 0, 0, g, 6);
      br.position.set(Math.sin(a) * Math.sin(tilt) * len / 2, 3.2 + Math.cos(tilt) * len / 2, Math.cos(a) * Math.sin(tilt) * len / 2);
      br.rotation.set(Math.cos(a) * tilt, 0, -Math.sin(a) * tilt);
      const c = new THREE.Mesh(GEO.canopy[(i + Math.floor(x)) & 3], lm); c.castShadow = true; c.receiveShadow = true;
      c.position.set(Math.sin(a) * Math.sin(tilt) * len, 3.3 + Math.cos(tilt) * len + 0.5, Math.cos(a) * Math.sin(tilt) * len);
      c.scale.setScalar(rand(0.85, 1.15)); c.rotation.y = rand(0, 6); g.add(c);
    }
    const top = new THREE.Mesh(GEO.canopy[Math.floor(z) & 3], lm); top.castShadow = true; top.receiveShadow = true;
    top.position.set(0, 5.6, 0); top.scale.set(1.15, 1, 1.15); g.add(top);
    return g;
  }

  makePalm(x, z, h) {
    const g = new THREE.Group(); g.position.set(x, 0, z); this.scene.add(g);
    const lean = rand(-0.6, 0.6), lean2 = rand(-0.6, 0.6);
    const curve = new THREE.CatmullRomCurve3([new THREE.Vector3(0, 0, 0), new THREE.Vector3(lean * 0.4, h * 0.5, lean2 * 0.4), new THREE.Vector3(lean, h, lean2)]);
    const trunk = new THREE.Mesh(new THREE.TubeGeometry(curve, 12, 0.2, 7), M.bark); trunk.castShadow = true; g.add(trunk);
    const top = new THREE.Group(); top.position.set(lean, h, lean2); g.add(top);
    const frondM = M.palmLeaf[Math.floor(Math.random() * M.palmLeaf.length)];
    // ทางมะพร้าว 2 ชั้น (ชั้นบนชี้ขึ้น ชั้นล่างกางออก) + ทางแห้งห้อยลงสีน้ำตาล
    for (let i = 0; i < 14; i++) {
      const upper = i % 2 === 0;
      const f = new THREE.Mesh(GEO.palmFrond, frondM); f.castShadow = true;
      const holder = new THREE.Group(); holder.rotation.y = (i / 14) * Math.PI * 2 + rand(-0.15, 0.15); top.add(holder);
      f.rotation.x = upper ? rand(0.55, 0.9) : rand(1.15, 1.45); f.scale.setScalar(upper ? rand(0.8, 0.95) : rand(0.95, 1.1)); holder.add(f);
    }
    for (let i = 0; i < 3; i++) {
      const f = new THREE.Mesh(GEO.palmDead, M.palmDead);
      const holder = new THREE.Group(); holder.position.y = -0.3; holder.rotation.y = rand(0, 6.3); top.add(holder);
      f.rotation.x = rand(2.2, 2.6); holder.add(f);
    }
    for (let i = 0; i < 5; i++) sph(0.16, M.coconut || (M.coconut = new THREE.MeshStandardMaterial({ color: '#5b6b25' })), rand(-0.25, 0.25), -0.2, rand(-0.25, 0.25), top, 6);
    mergeChildren(top); // ทางมะพร้าว ~20 ชิ้น → 3 ชิ้น (ยังไหวตามลมทั้งกลุ่ม)
    this.palms = this.palms || []; this.palms.push(top);
  }

  makeBanana(x, z) {
    const g = new THREE.Group(); g.position.set(x, 0, z); this.scene.add(g);
    cyl(0.13, 0.18, 2, new THREE.MeshStandardMaterial({ color: '#6b6a45', roughness: 0.9 }), 0, 1, 0, g, 7);
    for (let i = 0; i < 7; i++) {
      const l = new THREE.Mesh(GEO.bananaLeaf, M.bananaLeaf); l.castShadow = true;
      const h = new THREE.Group(); h.position.y = 1.9 + i * 0.03; h.rotation.y = i * 2.4 + rand(-0.3, 0.3); h.add(l);
      l.rotation.x = i < 2 ? rand(0.45, 0.7) : rand(0.9, 1.35); l.scale.setScalar(rand(0.85, 1.1)); g.add(h);
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
    const canopyGeo = canopyGeometry(26, 1.6, 1.1, 1.9, 1.35);
    const cupGeo = new THREE.CylinderGeometry(0.08, 0.06, 0.12, 6); cupGeo.translate(0, 1.0, 0.2);
    // ลำต้นยางจาก Blender (โคนบาน คดนิด ๆ + เปลือก/รอยกรีด/น้ำยางอบลงภาพ) — โหลดตามหลัง ระหว่างนั้นใช้ทรงกระบอกเดิม
    const barkMat = new THREE.MeshStandardMaterial({ map: TEX.bark, normalMap: TEX.flatN, roughness: 1 }); groundAO(barkMat);
    const trunks = new THREE.InstancedMesh(trunkGeo, barkMat, total);
    if (!this.lite) {
      const L = new THREE.TextureLoader();
      import('three/addons/loaders/GLTFLoader.js').then(({ GLTFLoader }) => new GLTFLoader().load('models/env/rubber_trunk.glb', g => {
        let geo; g.scene.traverse(o => { if (o.isMesh && !geo) geo = o.geometry; });
        // UV จาก glTF นับแถวจากบนลงล่าง → ภาพต้องไม่กลับหัว (flipY = false) ไม่งั้นรอยกรีดไปอยู่ยอดต้น
        L.load('media/tex/rubber_bark.jpg', t => { t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4; t.flipY = false; barkMat.map = t;
          L.load('media/tex/rubber_bark_n.jpg', nt => { nt.flipY = false; barkMat.normalMap = nt; barkMat.normalScale.set(0.9, 0.9); trunks.geometry = geo; this.renderer.shadowMap.needsUpdate = true; }); });
      }));
    }
    const canopy = new THREE.InstancedMesh(canopyGeo, leafMaterial(FOL.rubber, '#ffffff', 0.8), total * 3);
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
        canopy.setMatrixAt(ci, m4); canopy.setColorAt(ci, col.setHSL(rand(0.14, 0.24), rand(0.15, 0.35), rand(0.72, 0.95))); ci++;
      }
      i++;
    }
    trunks.castShadow = canopy.castShadow = true; trunks.receiveShadow = canopy.receiveShadow = true;
    s.add(trunks, canopy, cups);
    this.rubberCount = total;
  }

  // ภูเขาไกล ๆ 2 ชั้น (ไม่โดนหมอกแบบปกติ แต่ไล่สีเข้าหาสีหมอกเอง) → ภาพมีความลึก
  buildMountains() {
    this.mountainMat = new THREE.ShaderMaterial({
      uniforms: { fogColor: { value: new THREE.Color() }, night: { value: 0 } },
      vertexShader: `attribute float hgt; attribute float layer; varying float vH; varying float vL;
        void main() { vH = hgt; vL = layer; vec4 p = projectionMatrix * modelViewMatrix * vec4(position, 1.0); gl_Position = p; }`,
      fragmentShader: `uniform vec3 fogColor; uniform float night; varying float vH; varying float vL;
        void main() {
          vec3 tint = mix(vec3(0.16, 0.24, 0.24), vec3(0.3, 0.38, 0.44), vL);
          tint = mix(tint, fogColor * 0.35, night * 0.6);
          float a = mix(0.62, 0.42, vL);
          vec3 c = mix(fogColor, mix(fogColor, tint, a), smoothstep(0.0, 0.55, vH));
          gl_FragColor = vec4(c, 1.0);
          #include <tonemapping_fragment>
          #include <colorspace_fragment>
        }`,
      fog: false, depthWrite: true,
    });
    const pos = [], hgt = [], layer = [], idx = [];
    const ridge = (a, seed) => 0.5 + 0.28 * Math.sin(a * 3 + seed) + 0.14 * Math.sin(a * 7.3 + seed * 2) + 0.08 * Math.sin(a * 17 + seed * 3) + 0.05 * Math.sin(a * 41 + seed);
    [[780, 70, 0, 1.3], [1150, 120, 1, 4.1]].forEach(([R, H, L, seed]) => {
      const base = pos.length / 3, N = 220;
      for (let i = 0; i <= N; i++) {
        const a = (i / N) * Math.PI * 2, x = Math.cos(a) * R, z = Math.sin(a) * R;
        const top = Math.max(0.15, ridge(a, seed)) * H * (z > 300 ? 0.55 : 1); // ด้านถนน (ใต้) ภูเขาต่ำกว่า
        pos.push(x, -10, z, x, top, z); hgt.push(0, 1, 0, 1); layer.push(L, L);
        if (i < N) { const k = base + i * 2; idx.push(k, k + 2, k + 1, k + 1, k + 2, k + 3); }
      }
    });
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('hgt', new THREE.Float32BufferAttribute(hgt, 1));
    g.setAttribute('layer', new THREE.Float32BufferAttribute(layer, 1));
    g.setIndex(idx);
    const m = new THREE.Mesh(g, this.mountainMat); m.frustumCulled = false; m.renderOrder = -5;
    this.scene.add(m);
  }

  // หญ้าทีละใบในสนามบ้าน + โยกตามลม (shader) และให้ต้นข้าวโยกด้วย
  buildGrass() {
    this.grassU = { time: { value: 0 }, wind: { value: 0.8 } };
    const sway = (mat, amp) => {
      mat.onBeforeCompile = sh => {
        sh.uniforms.time = this.grassU.time; sh.uniforms.wind = this.grassU.wind;
        sh.vertexShader = 'uniform float time; uniform float wind;\n' + sh.vertexShader.replace('#include <begin_vertex>', `#include <begin_vertex>
          vec4 wp = instanceMatrix * vec4(0.0, 0.0, 0.0, 1.0);
          float hh = max(position.y, 0.0);
          float s = sin(time * 1.7 + wp.x * 0.31 + wp.z * 0.23) * 0.6 + sin(time * 3.3 + wp.x * 0.9 + wp.z * 0.4) * 0.25;
          transformed.x += s * wind * ${amp.toFixed(3)} * hh * hh;
          transformed.z += s * wind * ${(amp * 0.5).toFixed(3)} * hh * hh;`);
      };
    };
    if (this.riceBlades) { sway(this.riceBlades.material, 0.35); bakedAO(this.riceBlades.material, true); }
    // ใบหญ้าเล็ก ๆ สูงราว 20–30 ซม. (ของเดิมใหญ่เกินจนดูเป็นหนาม)
    const blade = new THREE.PlaneGeometry(0.045, 0.26, 1, 2);
    const bp = blade.attributes.position;
    for (let i = 0; i < bp.count; i++) { const y = bp.getY(i) + 0.13; bp.setX(i, bp.getX(i) * (1 - y / 0.29)); bp.setY(i, y); }
    blade.computeVertexNormals();
    const bc = new Float32Array(bp.count * 4); for (let i = 0; i < bp.count; i++) { const v = 0.45 + 0.55 * bp.getY(i) / 0.26; bc.set([v, v, v, 1], i * 4); }
    blade.setAttribute('color', new THREE.BufferAttribute(bc, 4)); // โคนเข้ม ปลายสว่าง (เหมือนกอหญ้าจาก Blender)
    const mat = new THREE.MeshStandardMaterial({ color: '#ffffff', side: THREE.DoubleSide, roughness: 0.9, vertexColors: true });
    sway(mat, 0.5); bakedAO(mat, true); // ใบหญ้าใต้ร่มเงาก็เข้มตามพื้น
    const max = QUALITY.high.grass;
    const im = new THREE.InstancedMesh(blade, mat, max);
    const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), col = new THREE.Color(), v = new THREE.Vector3(), sc = new THREE.Vector3();
    const blocked = (x, z) =>
      (x > -12 && x < 7 && z > -6 && z < 10) || (x > 9.5 && x < 18.5 && z > 1.5 && z < 9.5) ||          // บ้าน, โรงรถ
      (x > -3.6 && x < 3.6 && z > 22) || (Math.abs((x - 3) + (z - 24)) < 4.2 && x > -4 && x < 17 && z > 8 && z < 25) || // ทางรถ
      Math.hypot(x - 14, z - 22) < 5.3 || (x > -32.5 && x < -19.5 && z > -4.5 && z < 16.5) ||          // บ่อ, โรงเรือน
      (x > 23.5 && x < 36.5 && z > -6.5 && z < 2.5) || (x > 25.5 && x < 34.5 && z > 14 && z < 22) ||   // คอกหมู, เล้าไก่
      (x > -28.8 && x < -21.2 && z > 22.6 && z < 29.8) || (x > 37.5 && x < 42.5 && z > -9.5 && z < -4.5) || z > 35.4;
    // ขึ้นเป็นกอ ๆ ตามขอบรั้ว ใต้ต้นไม้ และกระจายบาง ๆ ในสนาม — ไม่โรยเต็มพื้นเท่ากันหมด
    const clumps = [];
    while (clumps.length < 420) {
      const x = rand(-45, 49), z = rand(-23, 35.5);
      if (blocked(x, z)) continue;
      const edge = z > 31 || x < -40 || x > 43 || z < -18; // ริมรั้ว/ขอบที่ดิน หญ้าขึ้นหนากว่า
      clumps.push({ x, z, r: rand(0.25, edge ? 1.4 : 0.8), w: edge ? 3 : 1 });
    }
    const pick = () => { let s = Math.random() * clumps.reduce((a, c) => a + c.w, 0); for (const c of clumps) { s -= c.w; if (s <= 0) return c; } return clumps[0]; };
    let n = 0;
    while (n < max) {
      const c = pick(), a = rand(0, Math.PI * 2), d = Math.sqrt(Math.random()) * c.r;
      const x = c.x + Math.cos(a) * d, z = c.z + Math.sin(a) * d;
      if (blocked(x, z)) continue;
      e.set(rand(-0.35, 0.35), rand(0, Math.PI), rand(-0.35, 0.35)); q.setFromEuler(e);
      const k = rand(0.55, 1.05) * (1 - d / (c.r * 1.6)); sc.set(k, k * rand(0.7, 1.15), k); // กลางกอสูงกว่าขอบ
      m4.compose(v.set(x, 0.02, z), q, sc);
      im.setMatrixAt(n, m4); im.setColorAt(n, col.setHSL(rand(0.21, 0.27), rand(0.42, 0.58), rand(0.3, 0.42))); // โทนเดียวกับพื้นหญ้า (เขียวสดขึ้นให้เข้ากับพื้นผิวจาก Blender)
      n++;
    }
    im.receiveShadow = true; im.frustumCulled = false;
    im.count = QUALITY[this.quality].grass;
    try { this.grassOn = localStorage.getItem('grassOn') !== '0'; } catch { this.grassOn = true; }
    im.visible = im.count > 0 && this.grassOn;
    this.scene.add(im); this.grass = im;
    // กอหญ้าโค้ง 3 ใบจาก Blender แทนใบเดี่ยว → สนามดูหนาฟูขึ้นโดยจำนวนชิ้นเท่าเดิม
    import('three/addons/loaders/GLTFLoader.js').then(({ GLTFLoader }) => new GLTFLoader().load('models/env/grass_clump.glb', g => {
      let geo; g.scene.traverse(o => { if (o.isMesh && !geo) geo = o.geometry; });
      // ไล่สีโคนเข้ม→ปลายสว่างแบบเดียวกับใบเดิม (สีจาก Blender เป็นคนละ color space)
      const gp = geo.attributes.position, gc = new Float32Array(gp.count * 4);
      for (let i = 0; i < gp.count; i++) { const v = 0.45 + 0.55 * Math.min(1, gp.getY(i) / 0.26); gc.set([v, v, v, 1], i * 4); }
      geo.setAttribute('color', new THREE.BufferAttribute(gc, 4));
      im.geometry = geo;
    }));
  }

  setGrass(on) {
    this.grassOn = on; try { localStorage.setItem('grassOn', on ? '1' : '0'); } catch {}
    if (this.grass) this.grass.visible = on && this.grass.count > 0;
    this.renderer.shadowMap.needsUpdate = true;
  }

  // รวมชิ้นส่วนนิ่งเป็นก้อนเดียว (ดู freeze.js) — เดินฉากล่วงหน้า 3 วิแบบไม่วาดภาพ เพื่อดูว่าอะไรขยับบ้าง
  freeze() {
    if (this.frozen || this.lite) return; this.frozen = true;
    const clk = this.clock, vis = this.visible, auto = this.autoTime, nv = this.nextVisitor, tourIdle = this.tour?.idle;
    let et = clk.elapsedTime;
    this.clock = { elapsedTime: et, getDelta() { et += 0.05; this.elapsedTime = et; return 0.05; } };
    this.visible = false; this.autoTime = false; this.nextVisitor = 1e9;
    const t0 = performance.now();
    try { this.frozenInfo = freezeStatic(this, () => { for (let i = 0; i < 60; i++) this.tick(); }, [this.house, this.pond]); }
    finally {
      this.clock = clk; clk.getDelta(); this.visible = vis; this.autoTime = auto; this.nextVisitor = nv;
      if (this.tour) this.tour.idle = tourIdle;
    }
    this.frozenInfo.ms = Math.round(performance.now() - t0);
    this.renderer.shadowMap.needsUpdate = true;
  }

  setQuality(q) {
    if (!QUALITY[q]) return;
    this.quality = q; const Q = QUALITY[q];
    try { localStorage.setItem('quality', q); } catch {}
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, Q.pr));
    if (this.sun.shadow.map) { this.sun.shadow.map.dispose(); this.sun.shadow.map = null; }
    this.sun.shadow.mapSize.set(Q.shadow, Q.shadow);
    if (this.grass) { this.grass.count = Q.grass; this.grass.visible = Q.grass > 0 && this.grassOn; }
    this.gtao.enabled = !!Q.ao;
    this.renderer.shadowMap.needsUpdate = true;
    this.resize();
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
      const h = rand(5, 12), w = rand(3, 7), gy = Math.max(0, hillHeight(x, z)) - 0.5; // ยืนบนเนินเขา
      m4.makeScale(1, h, 1); m4.setPosition(x, gy + h / 2, z); tr.setMatrixAt(i, m4);
      m4.makeScale(w, w * 0.8, w); m4.setPosition(x, gy + h + w * 0.4, z); im.setMatrixAt(i * 2, m4);
      m4.makeScale(w * 0.7, w * 0.6, w * 0.7); m4.setPosition(x + rand(-2, 2), gy + h + w, z + rand(-2, 2)); im.setMatrixAt(i * 2 + 1, m4);
    }
    this.scene.add(im, tr);
    // เนินเขาวงแหวน 190–430 ม. ปั้น + อบเงาใน Blender (สีจุดยอด) — โหลดตามหลัง
    if (!this.lite) import('three/addons/loaders/GLTFLoader.js').then(({ GLTFLoader }) => new GLTFLoader().load('models/env/hills.glb', g => {
      g.scene.traverse(o => { if (o.isMesh) { o.receiveShadow = false; o.castShadow = false; o.material.roughness = 1; o.material.metalness = 0; o.frustumCulled = false; } });
      this.scene.add(g.scene); this.hills = g.scene;
    }));
  }

  // ของประกอบฉากที่ปั้นใน Blender (models/env/props.glb): โอ่งมังกร กระถางต้นไม้ กองฟืน กระสอบปุ๋ย ราวตากยางแผ่น
  // วางชิดขอบ/มุมที่ไม่ขวางทางเดิน
  buildProps() {
    if (this.lite) return;
    const spots = [
      ['jar', -13.4, 8.7, 0.3], ['jar', -13.5, 7.4, 1.9], ['jar', 7.7, -6.6, 0.8],
      ['pot', -12.7, 10.7, 0], ['pot', 6.8, 10.7, 1.2], ['pot', -12.7, -6.6, 2.4],
      ['woodpile', 19.7, 3.2, Math.PI / 2],
      ['sacks', 31.2, -15.2, 0.15],
      ['rack', -34.5, -17.5, Math.PI / 2],
    ];
    import('three/addons/loaders/GLTFLoader.js').then(({ GLTFLoader }) => new GLTFLoader().load('models/env/props.glb', g => {
      // ชิ้นที่มีหลายวัสดุจะมาเป็นกลุ่ม (Group) ไม่ใช่ Mesh เดี่ยว → อ้างจากลูกชั้นแรกของฉาก
      const src = {}; for (const o of g.scene.children) src[o.name] = o;
      for (const [name, x, z, ry] of spots) {
        const s0 = src[name]; if (!s0) continue;
        const m = s0.clone(true); m.position.set(x, 0.02, z); m.rotation.set(0, ry, 0); m.name = 'prop-' + name;
        m.traverse(o => { if (o.isMesh) o.castShadow = o.receiveShadow = true; }); this.scene.add(m);
      }
      this.renderer.shadowMap.needsUpdate = true;
    }));
  }

  // คนจากโมเดล 3D (Hunyuan3D + ใส่กระดูกด้วยโค้ด) — โหลดตามหลัง ระหว่างนั้นใช้แบบปั้นด้วยโค้ดไปก่อน
  // ตัวไหนมีไฟล์ใน models/rigs.json ก็เปลี่ยนร่างให้ · คนแปลกหน้าที่มีโมเดลจะใช้ร่างใหม่ตอนเดินเข้ามา
  loadModels() {
    // ปิดไว้ก่อน: ตัวละครจากโมเดล AI ยังดูไม่ดีพอ → ใช้แบบปั้นด้วยโค้ดเป็นค่าเริ่มต้น · ดูแบบโมเดลได้ด้วย ?models=1
    if (this.lite || new URLSearchParams(location.search).get('models') !== '1') return;
    this.rigFactories = {};
    import('./rigged.js').then(async R => {
      this.rig = R;
      const rigs = await fetch('models/rigs.json').then(r => r.json());
      const fam = [['dad', this.dad.h, new THREE.Vector3(0, 0.25, -0.08)], ['mom', this.mom.h], ['sis', this.sis.h], ['kid', this.kid.h]]; // ไฟฉายพ่อไปอยู่บนยอดหมวก
      // โหลดพร้อมกันทุกตัว
      await Promise.all(fam.filter(([name]) => rigs[name]).map(async ([name, h, shift]) => {
        try {
          const r = (await R.loadRigFactory(name))();
          await this.renderer.compileAsync(r.mesh, this.camera, this.scene).catch(() => {}); // คอมไพล์ก่อนโชว์ (ตัวที่ใช้วัสดุแบบเดียวกันจะเร็วมาก)
          R.reskin(h, r, SKIN_MAT, shift);
        } catch (e) { console.warn('model', name, e); }
      }));
      for (const p of PERSONAS) {
        const key = p.id.replace('-', '').toLowerCase();
        if (rigs[key]) R.loadRigFactory(key).then(f => (this.rigFactories[p.id] = f)).catch(e => console.warn('model', key, e));
      }
    }).catch(e => console.warn('models', e));
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
    // ไฟฉายคาดหัวสำหรับกรีดยางตอนกลางคืน (อยู่ในฉากตลอด แค่ปรับความสว่าง)
    const lampM = new THREE.MeshStandardMaterial({ color: '#fff', emissive: '#fff8d0', emissiveIntensity: 0 });
    const lampBox = box(0.08, 0.05, 0.05, lampM, 0, 0.06, 0.14, dad.head); lampBox.castShadow = false;
    const lamp = new THREE.SpotLight('#fff3c8', 0, 22, 0.45, 0.6, 1.4); lamp.position.set(0, 0.06, 0.15);
    const lampTarget = new THREE.Object3D(); lampTarget.position.set(0, -0.6, 4); dad.head.add(lamp, lampTarget); lamp.target = lampTarget;
    // ลำแสงไฟฉายที่มองเห็นได้ (กรวยโปร่งแสงจางลงตามระยะ) — ให้เห็นชัดว่าพ่อคาดไฟฉาย แม้กล้องอยู่ไกล
    const bc = document.createElement('canvas'); bc.width = 4; bc.height = 64;
    const bg = bc.getContext('2d').createLinearGradient(0, 0, 0, 64); bg.addColorStop(0, '#fff'); bg.addColorStop(1, '#000');
    const bctx = bc.getContext('2d'); bctx.fillStyle = bg; bctx.fillRect(0, 0, 4, 64);
    const beamGeo = new THREE.ConeGeometry(1.5, 8, 18, 1, true); beamGeo.translate(0, -4, 0); beamGeo.rotateX(-Math.PI / 2); beamGeo.rotateX(0.32);
    const beam = new THREE.Mesh(beamGeo, new THREE.MeshBasicMaterial({ color: '#fff1c4', alphaMap: new THREE.CanvasTexture(bc), transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }));
    beam.position.set(0, 0.06, 0.16); beam.renderOrder = 3; beam.castShadow = false; dad.head.add(beam);
    this.headlamp = { light: lamp, mat: lampM, beam };
    this.dadAct = 'free'; this.dadActId = 0; this.tapState = { col: 9, row: 0, tapped: 0, latex: 0 }; this.familyAsleep = false; this.sleepers = new Set();
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
    const kid = makeHuman({ shirt: '#ff7eb6', pants: '#7b5cd6', longHair: true, skin: '#d4a57c', child: true });
    kid.group.scale.setScalar(0.68); kid.group.position.set(0, 0, 16);
    this.scene.add(kid.group);
    this.kid = { h: kid, w: new Walker(kid, 1.0), task: 'เล่นในสวน' };
    this.entities.push({ id: 'H-KID', type: 'human', label: 'น้องสาว', resident: true, obj: kid.group, h: kid });
    setTimeout(() => this.sisLoop(), 9000);
    setTimeout(() => this.kidLoop(), 2000);
    this.loadModels();
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
    setTimeout(() => { if (this.dadAct === 'free') this.feedPigs('auto'); }, 4000);
  }

  sisToken() { return `${this.gen}.${this.sisGen || 0}`; }
  sisLoop(gen = this.sisToken()) {
    if (gen !== this.sisToken()) return;
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

  kidToken() { return `${this.gen}.${this.kidGen || 0}`; }
  kidLoop(gen = this.kidToken()) {
    if (gen !== this.kidToken()) return;
    const k = this.kid, h = k.h;
    const next = () => setTimeout(() => this.kidLoop(gen), rand(1, 4) * 1000);
    const hr = this.hour;
    if (Math.random() < 0.12 && hr > 7 && hr < 18.5 && (this.wx?.cur.rain || 0) < 0.2) { this.kidRoofSit(gen); return; }
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
      if (gen !== this.gen || this.momState !== 'home') return;
      const p = spots[Math.floor(Math.random() * spots.length)];
      this.mom.w.go([[p[0] - 2, p[1], p[2]]], () => { this.mom.w.wait = rand(3, 8); setTimeout(go, 100); });
    };
    go();
  }

  buildLabels() {
    const add = (text, x, y, z, cam) => {
      const el = document.createElement('div'); el.className = 'zone-label'; el.textContent = text; el.dataset.cam = cam;
      el.addEventListener('click', () => this.flyTo(cam));
      const o = new CSS2DObject(el); o.position.set(x, y, z); this.scene.add(o); this.labels.push(o);
      return el;
    };
    add('🏡 บ้าน', -3, 6.4, -1, 'house');
    add('🌌 ดาดฟ้า', 3.7, 6.0, 4, 'roof');
    add('🐖 คอกหมู', 30, 3.6, -2, 'pig');
    add('🐟 บ่อปลา', 14, 1.6, 22, 'pond');
    add('🐔 เล้าไก่', 30, 3, 18, 'chicken');
    add('🥬 ผักไฮโดรโปนิกส์', -26, 4.2, 6, 'hydro');
    add('🌳 สวนยาง 400 ต้น', 0, 11, -40, 'rubber');
    add('🚗 โรงรถ', 14, 4, 5.5, 'carport');
    add('📚 ศาลาเรียน', -25, 5.6, 26, 'school');
    this.gateLabel = add('🚪 ประตูหน้า', 0, 2.6, 36, 'gate');
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
    const fac = this.rigFactories?.[p.id]; if (fac) this.rig.reskin(h, fac(), SKIN_MAT);
    const fromLeft = Math.random() > 0.5;
    h.group.position.set(fromLeft ? -70 : 70, 0, 40.9); // เดินบนไหล่ทางริมรั้ว ไม่เดินกลางถนน
    this.scene.add(h.group);
    const w = new Walker(h, 1.15);
    const ent = { id: 'H-' + p.id, type: 'human', label: 'บุคคล', persona: p, obj: h.group, h, visitor: true };
    const v = { h, w, persona: p, ent };
    this.visitors.push(v); this.entities.push(ent);
    if (nearGate) h.group.position.set(0.5, 0, 40.8);
    w.go([...(nearGate ? [] : [[0, 0, 40.9]]), [0, 0, 37], [-0.5, 0, 26], [-1, 0, 12]], () => {
      h.group.rotation.y = Math.PI; w.wait = 8;
      setTimeout(() => {
        w.go([[0, 0, 26], [0, 0, 37], [0, 0, 40.9], [fromLeft ? 70 : -70, 0, 40.9]], () => {
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
    const day = clamp((elev + 4) / 20, 0, 1);
    const night = 1 - clamp((elev + 6) / 12, 0, 1);
    this.nightFactor = night;
    this.sun.position.copy(sunDir).multiplyScalar(150).add(this.sun.target.position);
    const cl = this.wxState?.clouds || 0, rn = this.wxState?.rain || 0;
    this.sun.intensity = day * 3.2 * (1 - 0.85 * cl);
    const warm = clamp(1 - elev / 30, 0, 1);
    this.sun.color.setRGB(1, lerp(0.97, 0.72, warm), lerp(0.92, 0.5, warm));
    this.hemi.intensity = Math.max(lerp(0.12, 0.85, day) * (1 - 0.3 * cl - 0.2 * rn), 0.13 + rn * 0.05 * night);
    this.hemi.color.setHSL(0.6, 0.5 * (1 - cl), lerp(0.25, 0.85, day));
    this.hemiBase = this.hemi.intensity;
    this.renderer.toneMappingExposure = lerp(0.9, 0.5, day) * (1 - 0.2 * cl - 0.2 * rn);
    // สีขอบฟ้า/หมอก: ฟ้าใสตอนกลางวัน → ส้มทองตอนพระอาทิตย์ขึ้น-ตก → น้ำเงินเข้มตอนกลางคืน → เทาเมื่อฟ้าครึ้ม
    const sunUp = clamp((elev + 6) / 10, 0, 1);
    const fogC = new THREE.Color(0.58, 0.7, 0.86)
      .lerp(new THREE.Color(0.95, 0.62, 0.42), warm * sunUp * 0.75)
      .lerp(new THREE.Color(0.025, 0.035, 0.07), night)
      .lerp(new THREE.Color(0.5, 0.53, 0.57).multiplyScalar(Math.max(0.06, day)), Math.min(1, cl * 0.8 + rn * 0.2))
      .lerp(new THREE.Color(0.085, 0.075, 0.085), night * cl * 0.55); // คืนฟ้าครึ้ม: ใต้เมฆมีแสงเรืองจาง ๆ จากหมู่บ้านไกล ๆ
    this.scene.fog.color.copy(fogC);
    this.fogColor = fogC.clone();
    // หมอกยามเช้าหนาเฉพาะช่วงเช้ามืด–สาย กลางวันโปร่งขึ้นจึงมองเห็นไกลและมีมิติ
    const mist = this.fogBase > 0.003 ? (h >= 4.5 && h < 8.5 ? 1 - Math.abs(h - 6.5) / 2 : 0) : 0;
    this.scene.fog.density = (this.fogBase > 0.003 ? lerp(0.0024, 0.0075, clamp(mist, 0, 1)) : this.fogBase) + rn * 0.008 + (this.wxState?.fog || 0) * 0.02;
    this.scene.background = null;
    this.skyDome.update({ sunDir, day, night, warm, cover: cl, rain: rn, horizon: fogC });
    // กลางคืน: แสงจันทร์สีฟ้าอ่อน ๆ (ใช้ไฟดวงเดียวกับดวงอาทิตย์)
    if (night > 0.5) {
      this.sun.position.copy(this.skyDome.u.moonDir.value).multiplyScalar(150).add(this.sun.target.position);
      this.sun.color.set('#a8c0ff'); this.sun.intensity = 1.4 * (1 - 0.8 * cl) * night;
      // แสงสะท้อนฟ้ากลางคืนสีฟ้าอมม่วงอ่อน ๆ ให้เห็นรูปทรงในที่ร่ม (เช่น ใต้ทรงพุ่มสวนยาง) โดยยังดูเป็นกลางคืน
      this.hemi.color.setRGB(0.42, 0.5, 0.78); this.hemi.groundColor.setRGB(0.1, 0.12, 0.1);
      this.hemi.intensity = Math.max(this.hemi.intensity, 0.78 * (1 - 0.55 * cl) * night); this.hemiBase = this.hemi.intensity;
    } else this.hemi.groundColor.set('#4a5a30');
    if (this.mountainMat) { this.mountainMat.uniforms.fogColor.value.copy(fogC); this.mountainMat.uniforms.night.value = night; }
    this.bloom.threshold = lerp(2.2, 0.75, night); this.bloom.strength = lerp(0.28, 0.85, night);
    this.grade.uniforms.warmth.value = warm * day;
    const lightsOn = night > 0.25 || this.devices.lights || (cl > 0.85 && rn > 0.5 && night > 0.05);
    this.nightLights.forEach(n => (n.l.intensity = lightsOn ? n.max * Math.max(night, this.devices.lights ? 0.8 : 0) : 0));
    M.warm.emissiveIntensity = lightsOn ? 3 : 0.4;
    if (M.lamp) { M.lamp.emissiveIntensity = lightsOn ? 4 : 0.2; M.grow.emissiveIntensity = lightsOn ? 3.2 : 0.15; }
    this.innerLight.intensity = this.familyAsleep ? 0.9 : lerp(2, 9, night); // ปิดไฟนอน เหลือไฟหัวนอนสลัว ๆ
    this.updateEnv(sunDir);
    bus.emit('time', h);
  }

  updateEnv(sunDir) {
    if (this.lite) return;
    if (this.envHour !== undefined && Math.abs(this.envHour - this.hour) < 0.25) return;
    this.envHour = this.hour;
    clearTimeout(this.envTimer);
    this.envTimer = setTimeout(() => {
      if (this.envRT) this.envRT.dispose();
      this.envRT = this.pmrem.fromScene(this.envScene, 0.04);
      this.scene.environment = this.envRT.texture;
    }, 120);
  }

  // ไฟกลางคืนที่คอกหมู เล้าไก่ และโรงเรือนผัก (เปิดพร้อมไฟบ้านอัตโนมัติ)
  buildFarmLights() {
    const s = this.scene;
    M.lamp = new THREE.MeshStandardMaterial({ color: '#ffffff', emissive: '#fff3d6', emissiveIntensity: 0.2 });
    M.grow = new THREE.MeshStandardMaterial({ color: '#ff6be0', emissive: '#ff3fd0', emissiveIntensity: 0.15 });
    const light = (x, y, z, color, max, dist) => {
      const l = new THREE.PointLight(color, 0, dist, 1.4); l.position.set(x, y, z); s.add(l); this.nightLights.push({ l, max });
    };
    const bulb = (x, y, z, cord = 0.3) => {
      cyl(0.01, 0.01, cord, M.frame, x, y + cord / 2 + 0.08, z, s, 4);
      const b = sph(0.11, M.lamp, x, y, z, s, 10); b.castShadow = false;
      const shade = new THREE.Mesh(new THREE.ConeGeometry(0.22, 0.14, 12, 1, true), M.frame); shade.position.set(x, y + 0.1, z); s.add(shade);
    };
    const pole = (x, z, h = 3.2) => {
      cyl(0.06, 0.08, h, M.frame, x, h / 2, z, s, 6);
      box(0.5, 0.05, 0.05, M.frame, x + 0.2, h, z, s);
      bulb(x + 0.42, h - 0.15, z, 0.05);
    };
    // คอกหมู: หลอดไฟใต้หลังคา 2 ดวง
    for (const x of [26.5, 33.5]) { bulb(x, 2.35, -2); light(x, 2.2, -2, '#ffd9a0', 9, 14); }
    // เล้าไก่: ไฟเหนือประตูเล้า + เสาไฟมุมลาน
    bulb(31.6, 2.05, 17.25, 0.05); light(31.6, 2.0, 17.6, '#ffe2b0', 6, 10);
    pole(26.2, 21.2); light(26.6, 2.9, 21.2, '#fff1d6', 7, 15);
    // โรงเรือนผัก: ไฟปลูกพืช LED สีชมพู-ม่วงเหนือโต๊ะ NFT + ไฟหน้าประตู
    for (let t = 0; t < 5; t++) {
      const x = -30.4 + t * 2.2;
      const bar = box(0.12, 0.05, 14.5, M.grow, x, 2.15, 6, s); bar.castShadow = false;
      for (const z of [-0.5, 12.5]) cyl(0.008, 0.008, 0.75, M.frame, x, 2.55, z, s, 4);
    }
    light(-26, 2.3, 2, '#ff5fd8', 7, 14); light(-26, 2.3, 10.5, '#ff5fd8', 7, 14);
    pole(-23.5, 17.2, 2.9); light(-23.1, 2.6, 17.2, '#fff1d6', 6, 12);
  }

  setCamLight(on) { this.camLight.intensity = on ? 52 : 0; }

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
    this.skyDome.u.flash.value = k * 0.9;
    this.skyDome.u.horizon.value.copy(this.scene.fog.color);
  }
  setLabels(on) { this.labels.forEach(l => (l.visible = on)); }

  // ภาพมุมสูงของฟาร์ม (orthographic) สำหรับเป็นแผนที่ใต้จอเรดาร์ — ทิศเหนืออยู่บน
  captureTopView(center, range) {
    if (this.lite) return null;
    const r = this.renderer, pr = r.getPixelRatio();
    const sizeVec = new THREE.Vector2(); r.getSize(sizeVec);
    const S = Math.floor(Math.min(512, sizeVec.x, sizeVec.y)); if (S < 64) return null;
    const cam = this.topCam || (this.topCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 1, 800));
    cam.left = -range; cam.right = range; cam.top = range; cam.bottom = -range; cam.updateProjectionMatrix();
    cam.position.set(center.x, 400, center.z); cam.up.set(0, 0, -1); cam.lookAt(center.x, 0, center.z);
    // ปิดหมอกด้วยการตั้งความหนาเป็น 0 (ถ้าเอาหมอกออก shader ทุกตัวต้องคอมไพล์ใหม่)
    const fd = this.scene.fog.density; this.scene.fog.density = 0; this.skyDome.mesh.visible = false;
    const labels = this.labels.map(l => l.visible); this.labels.forEach(l => (l.visible = false));
    void pr;
    const c = this.snapshot(cam, S, S);
    this.scene.fog.density = fd; this.skyDome.mesh.visible = true; this.labels.forEach((l, i) => (l.visible = labels[i]));
    return c;
  }

  // ---------------------------------------------------------------- ตัวช่วยซูม (ปุ่ม + / − และแตะสองครั้ง)
  animateCam(p1, t1, dur = 450) {
    const p0 = this.camera.position.clone(), t0 = this.controls.target.clone(), start = performance.now();
    this.flying = (now) => {
      let k = Math.min(1, (now - start) / dur); k = 1 - Math.pow(1 - k, 3);
      this.camera.position.lerpVectors(p0, p1, k); this.controls.target.lerpVectors(t0, t1, k);
      if (k >= 1) this.flying = null;
    };
  }

  zoomBy(factor) {
    this.tour?.stop();
    const t = this.controls.target, off = this.camera.position.clone().sub(t);
    const d = clamp(off.length() * factor, this.controls.minDistance, this.controls.maxDistance);
    this.animateCam(t.clone().add(off.setLength(d)), t.clone());
  }

  // แตะสองครั้ง → ซูมเข้าไปที่จุดนั้นบนพื้น
  focusAt(clientX, clientY) {
    const rect = this.renderer.domElement.getBoundingClientRect();
    const ndc = new THREE.Vector2(((clientX - rect.left) / rect.width) * 2 - 1, -((clientY - rect.top) / rect.height) * 2 + 1);
    const ray = new THREE.Raycaster(); ray.setFromCamera(ndc, this.camera);
    const hit = new THREE.Vector3();
    if (!ray.ray.intersectPlane(new THREE.Plane(new THREE.Vector3(0, 1, 0), 0), hit)) return;
    hit.x = clamp(hit.x, -150, 150); hit.z = clamp(hit.z, -170, 70);
    const off = this.camera.position.clone().sub(this.controls.target);
    const d = clamp(off.length() * 0.4, 8, this.controls.maxDistance);
    this.tour?.stop();
    this.animateCam(hit.clone().add(off.setLength(d)), hit, 650);
  }

  // หมุนกล้องรอบจุดที่มองอยู่ (องศา, + = ตามเข็มนาฬิกาเมื่อมองจากด้านบน)
  orbitBy(rad) {
    const t = this.controls.target, off = this.camera.position.clone().sub(t);
    off.applyAxisAngle(new THREE.Vector3(0, 1, 0), rad);
    this.camera.position.copy(t).add(off);
  }

  rotateBy(deg) {
    this.tour?.stop();
    const t = this.controls.target.clone(), off = this.camera.position.clone().sub(t);
    off.applyAxisAngle(new THREE.Vector3(0, 1, 0), THREE.MathUtils.degToRad(deg));
    this.animateCam(t.clone().add(off), t, 550);
  }

  setAutoRotate(on) {
    this.controls.autoRotate = on;
  }

  // บิดสองนิ้ว = หมุนฉาก (เหมือนแอปแผนที่) — ทำงานพร้อมกับบีบซูมของ OrbitControls
  setupTwist() {
    const el = this.renderer.domElement, pts = new Map();
    let lastAng = null;
    const ang = () => { const [a, b] = [...pts.values()]; return Math.atan2(b.y - a.y, b.x - a.x); };
    el.addEventListener('pointerdown', e => { if (e.pointerType !== 'mouse') { pts.set(e.pointerId, { x: e.clientX, y: e.clientY }); lastAng = pts.size === 2 ? ang() : null; } });
    el.addEventListener('pointermove', e => {
      if (!pts.has(e.pointerId)) return;
      pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (pts.size !== 2 || lastAng === null) return;
      const a = ang(); let d = a - lastAng; d = Math.atan2(Math.sin(d), Math.cos(d)); lastAng = a;
      if (Math.abs(d) > 0.002) this.orbitBy(-d);
    });
    const up = e => { pts.delete(e.pointerId); lastAng = pts.size === 2 ? ang() : null; };
    el.addEventListener('pointerup', up); el.addEventListener('pointercancel', up);
  }

  // หาป้ายชื่อโซนที่อยู่ใต้นิ้ว (ขยายระยะกดรอบป้าย 14px ให้แตะง่ายบนจอเล็ก) — เลือกป้ายที่ใกล้นิ้วที่สุด
  labelAt(x, y, pad = 14) {
    let best = null, bd = Infinity;
    for (const l of this.labels) {
      const el = l.element;
      if (!l.visible || el.style.display === 'none' || !el.dataset.cam) continue;
      const r = el.getBoundingClientRect();
      if (x < r.left - pad || x > r.right + pad || y < r.top - pad || y > r.bottom + pad) continue;
      const d = Math.hypot(x - (r.left + r.right) / 2, y - (r.top + r.bottom) / 2);
      if (d < bd) { bd = d; best = el.dataset.cam; }
    }
    return best;
  }

  setupDoubleTap() {
    const el = this.renderer.domElement;
    let last = 0, lx = 0, ly = 0, downX = 0, downY = 0, multi = false;
    el.addEventListener('pointerdown', e => { downX = e.clientX; downY = e.clientY; if (!e.isPrimary) multi = true; });
    el.addEventListener('pointerup', e => {
      if (!e.isPrimary) return;
      const moved = Math.hypot(e.clientX - downX, e.clientY - downY) > 12;
      if (multi || moved) { multi = false; last = 0; return; }
      const now = performance.now();
      // แตะโดนป้ายชื่อโซน → บินไปที่โซนนั้น (บนจอสัมผัสป้ายไม่รับนิ้วโดยตรง เพื่อไม่ให้ขวางการบีบ/บิด)
      const zone = this.labelAt(e.clientX, e.clientY);
      if (zone) { this.flyTo(zone); bus.emit('zone-fly', zone); last = 0; return; }
      if (now - last < 320 && Math.hypot(e.clientX - lx, e.clientY - ly) < 40) { this.focusAt(e.clientX, e.clientY); last = 0; }
      else { last = now; lx = e.clientX; ly = e.clientY; }
    });
    el.addEventListener('dblclick', e => e.preventDefault());
  }

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
      id: e.id, type: e.type, label: e.label, resident: !!e.resident, student: !!e.student, villager: !!e.villager, persona: e.persona || null,
      x: e.obj.position.x, z: e.obj.position.z, heading: e.obj.rotation.y,
    }));
  }

  // ถ่ายภาพใบหน้าจาก "กล้องจับหน้า" ในฉาก — ใช้ renderer ตัวเดิม render ลงมุมจอแล้วคัดลอกออกมา
  captureFace(id) {
    if (this.lite) return null;
    const e = this.entities.find(x => x.id === id); if (!e || !e.h) return null;
    const W = 320, H = 240, pr = this.renderer.getPixelRatio();
    const head = new THREE.Vector3(); e.h.head.getWorldPosition(head);
    const ry = e.obj.rotation.y;
    const front = new THREE.Vector3(Math.sin(ry), 0, Math.cos(ry));
    this.snapCam.position.copy(head).addScaledVector(front, 1.7).add(new THREE.Vector3(0.25, 0.25, 0));
    this.snapCam.lookAt(head.x, head.y - 0.15, head.z);
    this.snapCam.updateProjectionMatrix();
    void pr;
    this.skyDome.mesh.position.copy(this.snapCam.position);
    const c = this.snapshot(this.snapCam, W, H);
    this.skyDome.mesh.position.copy(this.camera.position);
    const ctx = c.getContext('2d');
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

  // ถ่ายภาพจากกล้องอื่นลงแคนวาส: เรนเดอร์ลง render target แบบเดียวกับภาพหลัก (shader ชุดเดิม ไม่ต้องคอมไพล์ใหม่)
  // แล้วทำ tone mapping + แปลงสี sRGB เองใน JS
  snapshot(cam, W, H) {
    const r = this.renderer;
    const rt = this.snapRT || (this.snapRT = new THREE.WebGLRenderTarget(W, H));
    if (rt.width !== W || rt.height !== H) rt.setSize(W, H);
    const prev = r.getRenderTarget();
    r.setRenderTarget(rt); r.render(this.scene, cam); r.setRenderTarget(prev);
    const buf = new Uint8Array(W * H * 4); r.readRenderTargetPixels(rt, 0, 0, W, H, buf);
    const c = document.createElement('canvas'); c.width = W; c.height = H;
    const ctx = c.getContext('2d'), img = ctx.createImageData(W, H), ex = r.toneMappingExposure;
    const lut = new Uint8ClampedArray(256);
    for (let i = 0; i < 256; i++) { // ACES (ประมาณ) + gamma sRGB
      const x = (i / 255) * ex * 1.6, a = (x * (2.51 * x + 0.03)) / (x * (2.43 * x + 0.59) + 0.14);
      lut[i] = Math.pow(Math.min(1, Math.max(0, a)), 1 / 2.2) * 255;
    }
    for (let y = 0; y < H; y++) {
      const src = (H - 1 - y) * W * 4, dst = y * W * 4;
      for (let x = 0; x < W * 4; x += 4) { img.data[dst + x] = lut[buf[src + x]]; img.data[dst + x + 1] = lut[buf[src + x + 1]]; img.data[dst + x + 2] = lut[buf[src + x + 2]]; img.data[dst + x + 3] = 255; }
    }
    ctx.putImageData(img, 0, 0);
    return c;
  }

  // วนวาดภาพแบบกันพัง: ถ้าเฟรมไหน error (เช่น เบราว์เซอร์ทีวีไม่รู้จักคำสั่งบางตัว) ลูปยังวิ่งต่อ + แจ้ง error บนจอ
  // (ถ้าปล่อยให้ throw ออกไป three.js จะไม่ขอเฟรมถัดไป ภาพจะนิ่งไปเลย)
  safeTick() {
    const t0 = performance.now();
    try { this.tick(); }
    catch (e) {
      this.tickErrors = (this.tickErrors || 0) + 1;
      if (this.tickErrors === 1 || this.tickErrors % 600 === 0) bus.emit('app-error', { where: 'ภาพ 3D', error: e, count: this.tickErrors });
    }
    this.frameMs = performance.now() - t0;
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
    this.updateSchool(dt, t);
    this.updateSprinkler(dt);
    this.schedTimer = (this.schedTimer || 0) - dt;
    if (this.schedTimer < 0) { this.schedTimer = 0.5; this.updateSchedule(); }
    this.updateTraffic(dt);
    this.updateCats(dt, t);
    this.fishers?.update(dt, t);
    this.updateBubbles(dt);
    this.fan.rotation.y += dt * 6;
    const gust = 0.03 + (this.wx.cur.wind || 0) * 0.012;
    this.palms?.forEach((p, i) => { p.rotation.z = Math.sin(t * (0.8 + gust * 6) + i) * gust; p.rotation.x = Math.cos(t * 0.6 + i) * gust * 0.7; });
    M.water.normalMap.offset.set(t * 0.02, t * 0.013);
    this.tv.material.emissiveIntensity = this.familyAsleep ? 0 : 0.5 + Math.sin(t * 7) * 0.15 + Math.sin(t * 2.3) * 0.1;
    this.updateBedroom(dt, t);
    this.updateRooftop(dt, t);
    this.updateMomCar(dt);
    this.updatePoles();
    if (this.coopDoor) this.coopDoor.rotation.x = lerp(this.coopDoor.rotation.x, this.devices.chickenDoor ? 1.4 : 0, 0.05);
    this.gates.forEach(g => (g.pivot.rotation.y = lerp(g.pivot.rotation.y, this.devices.gateClosed ? 0 : g.side * 1.3, 0.04)));

    this.nextVisitor -= dt;
    if (this.nextVisitor < 0) { this.spawnVisitor(); this.nextVisitor = rand(70, 120); }

    this.statusTimer -= dt;
    if (this.statusTimer < 0) { this.statusTimer = 0.5; this.renderStatus(); }
    this.tour?.update(dt);
    this.festivals?.update(dt, t);

    this.skyDome.u.time.value = t;
    windU.time.value = t; windU.wind.value = 0.7 + (this.wx?.cur.wind || 1.5) * 0.18;
    if (this.grassU) { this.grassU.time.value = t; this.grassU.wind.value = 0.6 + (this.wx?.cur.wind || 1.5) * 0.12; }
    if (!this.visible) return;
    if (this.flying) this.flying(performance.now());
    this.controls.update();
    this.clampCamera();
    this.skyDome.mesh.position.copy(this.camera.position);
    if (++this.frameN % QUALITY[this.quality].shadowEvery === 0) this.renderer.shadowMap.needsUpdate = true;
    if (QUALITY[this.quality].post) this.composer.render(); else this.renderer.render(this.scene, this.camera);
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
      if (this.fishGasp) { y = -0.15 + Math.sin(t * 5 + f.r * 3) * 0.025; f.a -= f.sp * dt * 0.6; } // ออกซิเจนต่ำ → ลอยหัวที่ผิวน้ำ
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
    if (this.school.active) this.endClass();
    b.active = true; b.group.visible = true; b.timeLeft = source === 'auto' ? 300 : 180; b.source = source;
    this.sleepers.clear(); this.familyAsleep = false;
    for (const who of [this.dad, this.mom, this.sis, this.kid]) who.h.group.visible = true;
    b.light.intensity = 3;
    this.gen++; // หยุดกิจวัตรเดิมของทุกคน
    const d = this.dad; d.busy = false; d.bucket.visible = false; d.h.holding = false; d.bucket.rotation.x = 0;
    this.dadActId++; this.dadAct = 'bbq'; d.h.tapping = false; d.h.group.visible = true; this.setHeadlamp(false);
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
    this.dadAct = 'free-after-bbq';
    this.dad.w.go([[4, 0, 10.5]], () => { this.fatherState = 'พักผ่อนหน้าบ้าน'; this.dad.h.group.rotation.y = 0.3; });
    this.fatherState = 'เก็บโต๊ะ เดินกลับหน้าบ้าน';
    this.sis.task = 'เก็บจานล้างจาน';
    const gen = this.sisToken();
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
    const outOfWindow = b.source === 'auto' && (this.hour < 17.5 || this.hour >= 21.5); // เลื่อนเวลาออกนอกช่วงเย็น → เลิกวง
    if (b.timeLeft <= 0 || outOfWindow) { this.endBBQ(); return; }
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
      rider.legL.rotation.x = rider.legR.rotation.x = -1.2; rider.armL.rotation.x = rider.armR.rotation.x = -1.15; rider.kneeL.rotation.x = rider.kneeR.rotation.x = 1.3; rider.elbowL.rotation.x = rider.elbowR.rotation.x = -0.35;
      rider.group.position.set(0, -0.12, -0.15); rider.group.rotation.x = 0.12; g.add(rider.group);
      g.userData = { hl, tl };
      label = 'มอเตอร์ไซค์'; speed = rand(10, 14);
    }
    g.rotation.y = dir > 0 ? Math.PI / 2 : -Math.PI / 2;
    g.position.set(-dir * 300, 0, laneZ);
    const id = 'CAR-' + (++this.carSeq);
    const ent = { id, type: 'vehicle', label, obj: g };
    this.vehicles.push({ g, dir, speed, cruise: speed, laneZ, label, ent, passed: false, len: type === 'truck' ? 7 : type === 'moto' ? 2 : 4.6 });
    this.entities.push(ent);
  }

  updateTraffic(dt) {
    this.nextCar -= dt;
    if (this.nextCar < 0) { this.spawnVehicle(); this.nextCar = this.nightFactor > 0.6 ? rand(14, 35) : rand(5, 16); }
    const night = this.nightFactor > 0.4 || (this.wxState?.rain || 0) > 0.5;
    // คนที่อยู่บนพื้นถนน (ข้ามถนน / ยืนบนผิวทาง)
    const peds = [];
    for (const e of this.entities) if (e.type === 'human' && e.obj.visible !== false) { const p = e.obj.position; if (p.z > 41.2 && p.z < 50.8 && p.y < 0.5) peds.push(p); }
    for (const v of this.vehicles) {
      if (v.own) continue; // รถแม่ขับเองใน updateMomCar
      const x = v.g.position.x;
      // ระยะที่ต้องหยุดให้ทัน (ยิ่งเร็วยิ่งต้องมองไกล) — เจอคนในช่องทาง หรือรถคันหน้าใกล้เกิน → เบรก
      let pedGap = Infinity, carGap = Infinity;
      for (const p of peds) if (Math.abs(p.z - v.laneZ) < 2.3) { const d = v.dir * (p.x - x); if (d > -1) pedGap = Math.min(pedGap, d - v.len / 2 - 1.2); }
      for (const o of this.vehicles) if (o !== v && o.dir === v.dir && Math.abs((o.laneZ ?? o.g.position.z) - v.laneZ) < 2) { const d = v.dir * (o.g.position.x - x); if (d > 0) carGap = Math.min(carGap, d - (o.len + v.len) / 2 - 3); }
      const gap = Math.min(pedGap, carGap);
      const stopDist = (v.speed * v.speed) / (2 * 9) + 1.5;
      const want = gap < stopDist + 6 ? Math.max(0, Math.min(v.cruise, (gap - 1.5) * 1.6)) : v.cruise;
      v.speed += Math.max(-14 * dt, Math.min(3.2 * dt, want - v.speed));
      if (v.speed < 0.08 && want < 0.4) v.speed = 0; // ค่อย ๆ จอดสนิท
      v.braking = want < v.speed - 0.3 || v.speed < 0.5;
      // จอดรอคนข้ามถนนนานเกิน 1 วิ → บีบแตรเบา ๆ ครั้งเดียว
      if (v.speed < 0.3 && pedGap <= carGap) { v.waitT = (v.waitT || 0) + dt; if (v.waitT > 1.2 && !v.honked) { v.honked = true; bus.emit('honk', { x, z: v.laneZ, moto: v.label === 'มอเตอร์ไซค์' }); } }
      else if (v.speed > 3) { v.waitT = 0; v.honked = false; }
      v.g.position.x += v.dir * v.speed * dt;
      v.g.userData.hl.emissiveIntensity = night ? 4 : 0.3;
      v.g.userData.tl.emissiveIntensity = v.braking ? (night ? 7 : 3.5) : night ? 2.5 : 0.4; // ไฟเบรกสว่างขึ้นตอนชะลอ/จอด
      if (!v.passed && v.dir * v.g.position.x > 0) { v.passed = true; this.carsToday++; bus.emit('vehicle-pass', { label: v.label, total: this.carsToday }); }
      if (Math.abs(v.g.position.x) > 310) {
        v.dead = true; this.scene.remove(v.g);
        v.g.traverse(o => { if (o.isMesh) { o.geometry.dispose(); } });
        this.entities = this.entities.filter(e => e !== v.ent);
      }
    }
    this.vehicles = this.vehicles.filter(v => !v.dead);
  }

  // ---------------------------------------------------------------- กิจวัตรตามเวลา (ใช้เวลาในฉาก ซึ่งตรงกับเวลาจริงเมื่อเปิด "ใช้เวลาจริง")
  // พ่อ: 02:00–06:00 กรีดยาง (ไฟฉายคาดหัว) · 06:30 ให้อาหารหมู · 07:00–09:00 เก็บน้ำยาง · 12:00–13:30 พักกลางวัน
  //      16:30 ให้อาหารหมู · 21:45–01:45 นอน    ครอบครัว: 21:45–05:45 นอน
  dadPlan(h) {
    if (h >= 21.75 || h < 1.75) return 'sleep';
    if (h < 6) return 'tap';
    if (h >= 6.5 && h < 7) return 'feed-am';
    if (h >= 7 && h < 9) return 'collect';
    if (h >= 12 && h < 13.5) return 'rest';
    if (h >= 16.5 && h < 17) return 'feed-pm';
    return 'free';
  }

  updateSchedule() {
    const h = this.hour;
    // แม่ไปทำงาน 07:45–17:00 — ทำตอนช่วงเวลาเปลี่ยน (ปุ่มจำลองสั่งเองได้โดยไม่โดนดึงกลับ)
    const momPhase = h >= 7.75 && h < 17 ? 'work' : 'home';
    if (momPhase !== this.momPhase && !this.familyAsleep) {
      this.momPhase = momPhase;
      if (momPhase === 'work') { if (h < 8.1) this.startMomLeave(); else this.syncMomInstant(h); }
      else if (h < 17.6 && this.momState === 'away') this.startMomReturn(); else this.syncMomInstant(h);
    }
    if (this.bbq.active) return;
    const famSleep = h >= 21.75 || h < 5.75;
    // นอนดูดาว 19:45–21:40 ถ้าฟ้าไม่ฝน (ลงมาก่อนเข้านอน) · วันละครั้ง
    const starHour = h >= 19.75 && h < 21.66, clearSky = (this.wx?.cur.rain || 0) < 0.2 && (this.wx?.cur.clouds ?? 0) < 0.85;
    if (starHour && clearSky && !this.stargazing && !this.familyAsleep && !this.starDone) { if (this.startStargaze()) this.starDone = true; }
    if (!starHour) this.starDone = false;
    if (this.stargazing && (!starHour || !clearSky) && this.stargazing.source === 'auto') this.endStargaze();
    if (famSleep && !this.familyAsleep && !this.school.active) this.sleepFamily();
    if (!famSleep && this.familyAsleep) this.wakeFamily();
    if (this.dadTask) return; // กำลังทำงานด่วน (เช่น เติมอาหารหมู)
    const plan = this.dadPlan(h);
    if (plan !== this.dadAct && !(this.dadAct === 'free-after-bbq' && plan === 'free')) this.setDadActivity(plan);
  }

  setHeadlamp(on) { this.headlamp.light.intensity = on ? 38 : 0; this.headlamp.mat.emissiveIntensity = on ? 3 : 0; this.headlamp.beam.material.opacity = on ? 0.16 : 0; }

  // เส้นทางออกจากในบ้าน (ทางประตูกระจกหน้า → ระเบียง → บันได)
  pathOut() { return [[-0.75, 0.65, 3.5], [-0.75, 0.65, 7.2], [3.2, 0.65, 7.6], [3.2, 0, 10]]; }
  pathIn(spot) { return [[3.2, 0, 10], [3.2, 0.65, 7.6], [-0.75, 0.65, 7.2], [-0.75, 0.65, 3.5], spot]; }
  isInside(o) { return o.position.y > 0.3 && o.position.x > -10 && o.position.x < 4 && o.position.z > -5 && o.position.z < 5.2; }

  setDadActivity(act) {
    const d = this.dad, h = d.h, id = ++this.dadActId;
    const alive = () => id === this.dadActId;
    this.dadAct = act;
    const wasAsleep = this.sleepers.has('dad');
    if (h.sleeping) this.standUp('dad', h);
    h.group.visible = true; this.sleepers.delete('dad');
    h.sitting = false; h.tapping = false; d.bucket.visible = false; h.holding = false; d.bucket.rotation.x = 0;
    this.setHeadlamp(false);
    d.w.locked = act !== 'free' && !act.startsWith('feed'); d.busy = false;
    const out = wasAsleep || this.isInside(h.group) ? this.pathOut() : [];
    if (act === 'free') {
      this.fatherState = 'พักผ่อนหน้าบ้าน';
      d.w.go([...out, [4, 0, 10.5]], () => { h.group.rotation.y = 0.3; });
    } else if (act.startsWith('feed')) {
      d.w.go([...out, [4, 0, 10.5]], () => { if (alive()) this.feedPigs('ตามเวลา'); });
      if (!out.length) this.feedPigs('ตามเวลา');
    } else if (act === 'sleep') {
      this.fatherState = 'เข้านอน';
      this.bed.group.visible = true;
      d.w.go(this.isInside(h.group) ? [this.bed.slots.dad.side] : this.pathIn(this.bed.slots.dad.side), () => { if (!alive()) return; this.lieDown('dad', h); this.fatherState = 'นอนหลับในมุ้ง 💤'; }, true);
    } else if (act === 'rest') {
      this.fatherState = 'พักกลางวันบนระเบียง';
      d.w.go([...out, [3.2, 0, 10], [3.2, 0.65, 7.6], [-6.5, 0.65, 8.3]], () => {
        if (!alive()) return; h.group.rotation.y = 0; h.baseY = 0.62; h.sitting = true; this.fatherState = 'นั่งพักกลางวัน ดื่มน้ำเย็นบนระเบียง';
      }, true);
    } else if (act === 'tap' || act === 'collect') {
      const tapping = act === 'tap';
      if (tapping) { this.tapState.tapped = 0; this.setHeadlamp(this.nightFactor > 0.25); }
      else { this.tapState.latex = 0; d.bucket.visible = true; h.holding = true; h.armR.rotation.x = -0.15; }
      this.fatherState = tapping ? 'ตื่นตีสอง เดินไปกรีดยาง' : 'ไปเก็บน้ำยาง';
      bus.emit('farm-event', tapping ? 'พ่อคาดไฟฉายเดินไปกรีดยางที่สวน' : 'พ่อถือถังไปเก็บน้ำยางจากถ้วยรับน้ำยาง');
      const ts = this.tapState;
      const step = () => {
        if (!alive()) return;
        const x = -28.5 + 3 * ts.col + 1.5, z = -20 - 7 * ts.row;
        d.w.go([[x, 0, z]], () => {
          if (!alive()) return;
          h.group.rotation.y = -Math.PI / 2;
          if (tapping) h.tapping = true;
          setTimeout(() => {
            if (!alive()) return;
            h.tapping = false;
            if (tapping) { ts.tapped += 2; bus.emit('rubber-tapped', ts.tapped); this.fatherState = `กรีดยาง ${ts.tapped}/400 ต้น`; }
            else { ts.latex += 0.35; bus.emit('rubber-latex', 0.35); this.fatherState = `เก็บน้ำยางได้ ${ts.latex.toFixed(1)} กก.`; }
            ts.row++;
            if (ts.row >= 20) { ts.row = 0; ts.col = (ts.col + 2) % 19; }
            step();
          }, tapping ? 1600 : 900);
        }, true);
      };
      d.w.go([...out, [7.6, 0, 10.5], [7.6, 0, -7], [-28.5 + 3 * ts.col + 1.5, 0, -15]], step, true); // เดินผ่านข้างบ้าน (เลี่ยงบันไดดาดฟ้า)
    }
  }

  // ---------------------------------------------------------------- ห้องนอน: ฟูก 4 ผืนในมุ้ง (หลังประตูกระจกหน้าบ้าน มองเห็นจากข้างนอก)
  buildBedroom() {
    const g = new THREE.Group(); this.house.add(g); g.visible = false;
    const mattM = new THREE.MeshStandardMaterial({ color: '#e9e4d8', roughness: 0.95 });
    const pillowM = new THREE.MeshStandardMaterial({ color: '#f6f3ea', roughness: 0.9 });
    const blankets = { dad: '#4b6a8a', mom: '#b86b7a', kid: '#e9a3c4', sis: '#d9b45a' };
    const order = ['dad', 'mom', 'kid', 'sis']; // ลูกคนเล็กนอนข้างแม่
    const slots = {};
    order.forEach((key, i) => {
      const x = -0.15 + i * 0.95;
      box(0.88, 0.12, 2.0, mattM, x, 0.71, 2.05, g).castShadow = false;
      const pillow = box(0.5, 0.1, 0.32, pillowM, x, 0.82, 1.22, g); pillow.castShadow = false;
      const bl = box(0.86, 0.1, 1.25, new THREE.MeshStandardMaterial({ color: blankets[key], roughness: 1 }), x, 0.86, 2.42, g); bl.castShadow = false; bl.visible = false;
      // ตัว Z ลอยขึ้นจากหัว
      const zs = [0, 1, 2].map(k => { const sp = new THREE.Sprite(this.zMat.clone()); sp.scale.setScalar(0.22); sp.visible = false; g.add(sp); return { sp, t: k / 3 }; });
      const world = new THREE.Vector3(x - 2, 0, 0); // house group อยู่ที่ x = -2
      slots[key] = { x, blanket: bl, zs, side: [world.x, 0.65, 3.5], head: new THREE.Vector3(x, 0.9, 1.25) };
    });
    // มุ้ง: ผ้าโปร่งสีขาวคลุมฟูกทั้ง 4 ผืน + เชือกแขวน
    const netM = new THREE.MeshStandardMaterial({ color: '#f4f6f8', transparent: true, opacity: 0.2, side: THREE.DoubleSide, depthWrite: false, roughness: 1 });
    const net = new THREE.Mesh(new THREE.BoxGeometry(4.0, 1.55, 2.3), netM); net.position.set(1.28, 0.65 + 0.78, 2.05); g.add(net);
    const edgeM = new THREE.LineBasicMaterial({ color: '#ffffff', transparent: true, opacity: 0.35 });
    const edges = new THREE.LineSegments(new THREE.EdgesGeometry(net.geometry), edgeM); edges.position.copy(net.position); g.add(edges);
    for (const [x, z] of [[-0.72, 0.9], [3.28, 0.9], [-0.72, 3.2], [3.28, 3.2]]) cyl(0.004, 0.004, 1.1, M.frame, x, 2.75, z, g, 3);
    // โคมไฟหัวนอนสลัว ๆ
    const lamp = sph(0.07, new THREE.MeshStandardMaterial({ color: '#ffd9a0', emissive: '#ffb050', emissiveIntensity: 2 }), -0.95, 0.85, 1.0, g, 8); lamp.castShadow = false;
    this.bed = { group: g, slots };
  }

  get zMat() {
    if (!this._zMat) {
      const c = document.createElement('canvas'); c.width = c.height = 64;
      const x = c.getContext('2d'); x.fillStyle = '#cfe0ff'; x.font = 'bold 52px sans-serif'; x.textAlign = 'center'; x.textBaseline = 'middle';
      x.shadowColor = '#7fa8ff'; x.shadowBlur = 8; x.fillText('Z', 32, 34);
      this._zMat = new THREE.SpriteMaterial({ map: new THREE.CanvasTexture(c), transparent: true, depthWrite: false, fog: false });
    }
    return this._zMat;
  }

  lieDown(key, h) {
    const s = this.bed.slots[key];
    const local = new THREE.Vector3(s.x, 0, 3.0); // ปลายเท้า → นอนหงาย หัวไปทางหมอน
    h.group.position.copy(local).add(this.house.position);
    h.group.rotation.set(-Math.PI / 2, 0, 0);
    h.baseY = 0.8 + 0.06 * h.group.scale.y; h.sleeping = true; h.group.visible = true;
    s.blanket.visible = true; s.blanket.scale.set(1, 1, h.group.scale.y < 0.8 ? 0.75 : 1);
    s.blanket.position.z = h.group.scale.y < 0.8 ? 2.6 : 2.42;
    this.sleepers.add(key);
  }

  standUp(key, h) {
    const s = this.bed.slots[key];
    if (h.sleeping) { h.sleeping = false; h.group.rotation.set(0, 0, 0); h.baseY = 0.65; h.group.position.set(s.side[0], 0.65, s.side[2]); }
    s.blanket.visible = false; s.zs.forEach(z => (z.sp.visible = false));
    h.armL.rotation.z = h.armR.rotation.z = 0;
    this.sleepers.delete(key);
  }

  updateBedroom(dt, t) {
    if (!this.bed?.group.visible) return;
    for (const key in this.bed.slots) {
      const s = this.bed.slots[key], on = this.sleepers.has(key);
      s.blanket.scale.y = on ? 1 + Math.sin(t * 1.6 + s.x) * 0.25 : 1; // ผ้าห่มขยับตามลมหายใจ
      s.zs.forEach(z => {
        z.sp.visible = on;
        if (!on) return;
        z.t = (z.t + dt * 0.28) % 1;
        z.sp.position.set(s.x + 0.15 + Math.sin(z.t * 6 + s.x) * 0.08, 1.05 + z.t * 0.9, 1.3 - z.t * 0.2);
        z.sp.material.opacity = Math.sin(z.t * Math.PI);
        z.sp.scale.setScalar(0.12 + z.t * 0.16);
      });
    }
  }

  // ---------------------------------------------------------------- คำสั่งจากเมนูจำลอง
  spawnKnownVisitor(ids) {
    const p = PERSONAS.find(p => ids.includes(p.id) && !this.visitors.some(v => v.persona.id === p.id));
    if (!p) return false;
    this.spawnVisitor(p, true); return true;
  }

  kidFeedFish() {
    const k = this.kid, h = k.h;
    if (h.sleeping || k.w.locked) return;
    this.kidGen = (this.kidGen || 0) + 1; // หยุดกิจวัตรเดิมก่อน
    k.task = 'ไปให้อาหารปลา';
    k.w.go([[4, 0, 18], [8.7, 0, 22]], () => {
      h.group.rotation.y = Math.PI / 2; k.task = 'ให้อาหารปลา'; this.fishFeed = 9; h.holding = true;
      bus.emit('farm-event', 'น้องสาวกำลังให้อาหารปลา — ปลาว่ายมารวมกัน');
      let n = 0;
      const toss = setInterval(() => { h.armR.rotation.x = n++ % 2 ? -1.6 : -0.6; if (n > 12) { clearInterval(toss); h.holding = false; k.task = 'เล่นในสวน'; this.kidLoop(); } }, 600);
    });
  }

  sisCollectEggs() {
    const s = this.sis, h = s.h;
    if (h.sleeping || this.school.active || this.bbq.active || this.sisBusy) return;
    this.sisGen = (this.sisGen || 0) + 1;
    h.teaching = false; h.holding = false; s.task = 'ไปเก็บไข่ไก่';
    const via = h.group.position.x < -18 ? [[-18, 0, 18.5], [-6, 0, 13]] : [];
    s.w.go([...via, [6, 0, 12.6], [24, 0, 12.6], [26.3, 0, 18], [31.8, 0, 17.8]], () => {
      h.group.rotation.y = Math.PI; s.task = 'เก็บไข่ไก่'; h.holding = true; h.armL.rotation.x = h.armR.rotation.x = -0.9;
      setTimeout(() => {
        h.holding = false;
        const n = 2 + Math.floor(Math.random() * 4);
        bus.emit('farm-event', `พี่สาวเก็บไข่ไก่ได้ ${n} ฟอง`); bus.emit('eggs-collected', n);
        s.task = 'เดินกลับบ้าน';
        const tok = this.sisToken();
        s.w.go([[26.3, 0, 18], [24, 0, 12.6], [6, 0, 12.6], [-3, 0, 11.5]], () => { s.task = 'พักหน้าบ้าน'; setTimeout(() => this.sisLoop(tok), 20000); });
      }, 3000);
    }, true);
  }

  sleepFamily() {
    this.stargazing = null;
    this.familyAsleep = true;
    this.gen++;
    this.bed.group.visible = true;
    for (const [key, who] of [['mom', this.mom], ['sis', this.sis], ['kid', this.kid]]) {
      if (key === 'mom' && this.momState !== 'home') continue; // แม่ยังไม่กลับ
      const w = who.w, o = who.h.group, bed = this.bed.slots[key];
      w.locked = true; who.h.sitting = false; who.h.holding = false; who.h.teaching = false;
      if (who.task !== undefined) who.task = 'เข้านอน';
      if (who.h.sleeping) { who.h.sleeping = false; o.rotation.set(0, 0, 0); o.position.y = this.roofY; who.h.baseY = this.roofY; }
      const path = this.isInside(o) ? [bed.side] : [...(this.onRoof(o) ? this.roofDown() : []), ...this.pathIn(bed.side)];
      w.go(path, () => { this.lieDown(key, who.h); if (who.task !== undefined) who.task = 'นอนหลับในมุ้ง 💤'; }, true);
    }
    this.setTime(this.hour);
    bus.emit('farm-event', '🌙 ทุกคนกางมุ้งเข้านอนแล้ว — เรดาร์เฝ้าบ้านต่อ');
  }

  wakeFamily() {
    this.familyAsleep = false;
    this.gen++;
    for (const [key, who] of [['mom', this.mom], ['sis', this.sis], ['kid', this.kid]]) {
      this.standUp(key, who.h); who.w.locked = false;
    }
    if (!this.sleepers.size) this.bed.group.visible = false;
    this.setTime(this.hour);
    this.momLoop();
    this.sis.task = 'ตื่นนอน'; this.kid.task = 'ตื่นนอน';
    const gen = this.sisToken ? this.sisToken() : this.gen;
    this.sis.w.go([...this.pathOut(), [-3, 0, 11.5]], () => { this.sis.task = 'พักหน้าบ้าน'; setTimeout(() => this.sisLoop(gen), 15000); });
    this.kid.w.go([...this.pathOut(), [0, 0, 16]], () => this.kidLoop());
    bus.emit('farm-event', '☀️ เช้าแล้ว ครอบครัวตื่นนอน');
  }

  // ---------------------------------------------------------------- ค่าเซนเซอร์จาก Hub → สิ่งที่เกิดขึ้นในฉาก
  onSensors(v) {
    // ไฮโดรโปนิกส์: pH / EC / ระดับน้ำ ผิดปกติ → ไฟปั๊มแดง + พี่สาวไปแก้
    const probs = [];
    if (v['hydro/ph'] < 5.5 || v['hydro/ph'] > 6.5) probs.push(`pH ${v['hydro/ph'].toFixed(1)}`);
    if (v['hydro/ec'] < 1.2) probs.push(`EC ต่ำ ${v['hydro/ec'].toFixed(2)}`);
    if (v['hydro/level'] < 30) probs.push(`น้ำในถังเหลือ ${Math.round(v['hydro/level'])}%`);
    this.pumpLed.material = probs.length ? M.ledBad : this.devices.pump ? M.ledOn : M.ledOff;
    if (probs.length) this.sisFixHydro(probs.join(', '));
    // บ่อปลา: ออกซิเจนต่ำ → ปลาลอยหัว + เปิดเครื่องเติมอากาศอัตโนมัติ
    const gasp = v['pond/do'] < 4;
    if (gasp && !this.fishGasp) {
      bus.emit('farm-event', `⚠ ออกซิเจนในบ่อต่ำ (${v['pond/do'].toFixed(1)} mg/L) — ปลาลอยหัว`);
      if (!this.devices.aerator) bus.emit('cmd', { device: 'aerator', value: true, source: 'ระบบอัตโนมัติ (DO ต่ำ)' });
    }
    if (!gasp && this.fishGasp) bus.emit('farm-event', '✅ ออกซิเจนในบ่อกลับมาปกติ ปลาว่ายลงไปแล้ว');
    this.fishGasp = gasp;
    // คอกหมู: อาหารใกล้หมด → พ่อไปขนมาเติม · ร้อนเกิน → สปริงเกอร์
    if (v['pig/feed'] < 15) this.dadRefill();
    const hot = v['pig/temp'] > 33;
    if (hot !== this.sprinklerOn) {
      this.sprinklerOn = hot;
      bus.emit('farm-event', hot ? `🌡 คอกหมูร้อน ${v['pig/temp'].toFixed(1)}°C — เปิดสปริงเกอร์พ่นละอองน้ำอัตโนมัติ` : 'คอกหมูเย็นลงแล้ว ปิดสปริงเกอร์');
      if (hot) bus.emit('sprinkler', true);
    }
  }

  sisFixHydro(problem) {
    if (this.sisBusy || this.school.active || this.bbq.active || this.sleepers.has('sis')) return false;
    this.sisBusy = true; this.sisGen = (this.sisGen || 0) + 1;
    const s = this.sis, h = s.h;
    s.w.locked = true; h.holding = false; h.teaching = false; h.sitting = false; s.w.wait = 0;
    s.task = `รีบไปแก้ ${problem}`;
    bus.emit('farm-event', `⚠ ไฮโดรโปนิกส์: ${problem} — พี่สาวกำลังไปแก้`);
    const p = h.group.position, via = p.x > -18 ? [[-6, 0, 13], [-18, 0, 18.5]] : [];
    s.w.go([...via, [-27.1, 0, 18], [-29.6, 0, 15.6]], () => {
      h.group.rotation.y = -2.2; h.holding = true; h.armL.rotation.x = -1.1; h.armR.rotation.x = -1.3;
      s.task = 'ปรับสารละลาย A/B และเติมน้ำในถัง';
      setTimeout(() => {
        h.holding = false;
        bus.emit('sensor-fix', { 'hydro/ph': 6.0, 'hydro/ec': 1.6, 'hydro/level': 92 });
        bus.emit('farm-event', '✅ พี่สาวปรับ pH เป็น 6.0, EC 1.6 และเติมน้ำเต็มถังแล้ว');
        this.sisBusy = false; s.w.locked = false; s.task = 'กลับบ้าน';
        const tok = this.sisToken();
        s.w.go([[-27.1, 0, 18], [-18, 0, 18.5], [-3, 0, 11.5]], () => { s.task = 'พักหน้าบ้าน'; setTimeout(() => this.sisLoop(tok), 10000); });
      }, 5000);
    }, true);
    return true;
  }

  dadRefill() {
    const d = this.dad;
    if (this.dadTask || d.busy || this.bbq.active || !['free', 'free-after-bbq'].includes(this.dadAct)) return false;
    this.dadTask = 'refill'; this.dadActId++;
    d.w.locked = true; d.h.sitting = false;
    if (!this.feedSack) { this.feedSack = box(0.55, 0.3, 0.35, new THREE.MeshStandardMaterial({ color: '#e5ddc5' }), 0, 1.75, -0.05, d.h.group); }
    this.fatherState = 'อาหารหมูใกล้หมด — ไปขนกระสอบอาหาร';
    bus.emit('farm-event', '⚠ อาหารในไซโลหมูเหลือน้อย — พ่อไปขนกระสอบอาหารมาเติม');
    d.w.go([[12, 0, 11.5], [21, 0, 10.5], [37, 0, 4.5], [37, 0, -7]], () => {
      this.fatherState = 'แบกกระสอบอาหารหมู';
      setTimeout(() => {
        this.feedSack.visible = true; d.h.holding = true; d.h.armL.rotation.x = d.h.armR.rotation.x = -2.6;
        d.w.go([[37, 0, -3], [36.8, 0, 2.6]], () => {
          this.fatherState = 'เทอาหารเติมไซโล';
          setTimeout(() => {
            this.feedSack.visible = false; d.h.holding = false;
            bus.emit('sensor-fix', { 'pig/feed': 95 });
            bus.emit('farm-event', '✅ พ่อเติมอาหารหมูเต็มไซโลแล้ว (95%)');
            this.dadTask = null; this.dadAct = 'free'; d.w.locked = false;
            this.fatherState = 'เดินกลับบ้าน';
            d.w.go([[24, 0, 6], [20, 0, 10.5], [12, 0, 11.5], [4, 0, 10.5]], () => { this.fatherState = 'พักผ่อนหน้าบ้าน'; d.h.group.rotation.y = 0.3; });
          }, 2500);
        }, true);
      }, 2000);
    }, true);
    return true;
  }

  buildSprinkler() {
    const N = 260, pos = new Float32Array(N * 3);
    this.sprayData = Array.from({ length: N }, () => ({ x: rand(24.5, 35.5), y: rand(0, 2.4), z: rand(-5.5, 1.5) }));
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    this.spray = new THREE.Points(g, new THREE.PointsMaterial({ color: '#dff4ff', size: 0.06, transparent: true, opacity: 0.7, depthWrite: false }));
    this.spray.visible = false; this.spray.frustumCulled = false; this.scene.add(this.spray);
    for (const x of [26, 30, 34]) { const n = cyl(0.04, 0.04, 0.12, M.metal, x, 2.55, -2, this.scene, 6); n.castShadow = false; }
    this.sprinklerOn = false;
  }

  updateSprinkler(dt) {
    this.spray.visible = !!this.sprinklerOn;
    if (!this.sprinklerOn) return;
    const pos = this.spray.geometry.attributes.position;
    this.sprayData.forEach((d, i) => {
      d.y -= dt * 2.2;
      if (d.y < 0.1) { d.y = 2.4; d.x = rand(24.5, 35.5); d.z = rand(-5.5, 1.5); }
      pos.setXYZ(i, d.x, d.y, d.z);
    });
    pos.needsUpdate = true;
  }

  // ---------------------------------------------------------------- พี่สาวสอนหนังสือเด็ก ๆ ที่ศาลา
  buildSchool() {
    const c = new THREE.Vector3(-25, 0, 26);
    const g = new THREE.Group(); g.position.copy(c); this.scene.add(g);
    box(7, 0.5, 6, M.deck, 0, 0.25, 0, g);
    for (let i = 0; i < 3; i++) box(1.6, 0.17, 0.35, M.wood, 0, 0.08 + i * 0.17, 3.35 - i * 0.3, g);
    for (const [x, z] of [[-3.3, -2.8], [3.3, -2.8], [-3.3, 2.8], [3.3, 2.8], [0, -2.8], [0, 2.8]]) cyl(0.1, 0.12, 3, M.wood, x, 1.9, z, g, 8);
    // หลังคาจั่วทรงไทย
    const tri = new THREE.Shape([new THREE.Vector2(-4, 0), new THREE.Vector2(4, 0), new THREE.Vector2(0, 2.3)]);
    const roofGeo = new THREE.ExtrudeGeometry(tri, { depth: 8.4, bevelEnabled: false }); roofGeo.translate(0, 0, -4.2);
    const roof = new THREE.Mesh(roofGeo, M.roof); roof.rotation.y = Math.PI / 2; roof.position.y = 3.4; roof.castShadow = true; g.add(roof);
    box(8.4, 0.12, 0.3, M.wallDark, 0, 3.4, 4, g); box(8.4, 0.12, 0.3, M.wallDark, 0, 3.4, -4, g);
    // กระดานไวท์บอร์ด
    const cv = document.createElement('canvas'); cv.width = 512; cv.height = 256;
    const tex = new THREE.CanvasTexture(cv); tex.colorSpace = THREE.SRGBColorSpace;
    const board = new THREE.Mesh(new THREE.PlaneGeometry(2.6, 1.3), new THREE.MeshStandardMaterial({ map: tex, roughness: 0.4 }));
    board.position.set(0, 1.85, -2.45); g.add(board);
    box(2.75, 1.45, 0.06, M.metal, 0, 1.85, -2.5, g);
    for (const x of [-1.2, 1.2]) cyl(0.03, 0.03, 1.1, M.metal, x, 1.05, -2.5, g, 6);
    // โต๊ะญี่ปุ่นเตี้ย 2 แถว + เก้าอี้เตี้ยของเด็ก
    const seats = [];
    const stoolM = ['#f39c12', '#16a085', '#e74c3c', '#2980b9'];
    for (let row = 0; row < 2; row++) {
      const z = 0 + row * 1.6;
      box(5.2, 0.05, 0.5, M.wood, -0.2, 0.82, z - 0.55, g);
      for (const x of [-2.6, 2.2]) box(0.06, 0.32, 0.4, M.wood, x, 0.66, z - 0.55, g);
      for (let i = 0; i < 4; i++) {
        const x = -2.1 + i * 1.25;
        cyl(0.14, 0.16, 0.3, new THREE.MeshStandardMaterial({ color: stoolM[(i + row) % 4] }), x, 0.65, z, g, 10);
        box(0.28, 0.02, 0.2, M.white, x, 0.86, z - 0.55, g); // สมุด
        seats.push(c.clone().add(new THREE.Vector3(x, 0.5, z)));
      }
    }
    this.school = {
      group: g, center: c, seats, board: { cv, tex }, active: false, kids: [], timeLeft: 0, lastDay: null, phase: 0, lessonIdx: 0,
      // ชั้นเรียนภาษาอังกฤษ — หัวข้อเปลี่ยนวนทุกครั้ง ใช้ของรอบตัวในบ้านสวน
      lessons: [
        { name: 'ภาษาอังกฤษ', topic: 'ABC', lines: ['A  B  C  D  E  F  G', 'H  I  J  K  L  M  N', 'O  P  Q  R  S  T  U'] },
        { name: 'ภาษาอังกฤษ', topic: 'Farm Animals', lines: ['pig = หมู   fish = ปลา', 'chicken = ไก่   cat = แมว', 'dog = หมา   egg = ไข่'] },
        { name: 'ภาษาอังกฤษ', topic: 'Greetings', lines: ['Hello! / Good morning', 'How are you?', "I'm fine, thank you."] },
        { name: 'ภาษาอังกฤษ', topic: 'Numbers', lines: ['one  two  three  four', 'five  six  seven  eight', 'We have 8 students!'] },
        { name: 'ภาษาอังกฤษ', topic: 'Colors', lines: ['red  blue  green', 'yellow  white  black', 'The leaf is green.'] },
        { name: 'ภาษาอังกฤษ', topic: 'My Farm', lines: ['This is my farm.', 'I have 400 rubber trees.', 'I like vegetables.'] },
      ],
    };
    this.school.lesson = this.school.lessons[0];
    this.drawBoard(0);
  }

  drawBoard(progress) {
    const { cv, tex } = this.school.board, ctx = cv.getContext('2d'), L = this.school.lesson;
    ctx.fillStyle = '#fbfbf7'; ctx.fillRect(0, 0, 512, 256);
    ctx.fillStyle = '#c0392b'; ctx.font = 'bold 30px "IBM Plex Sans Thai", sans-serif'; ctx.fillText(`English Class: ${L.topic}`, 20, 44);
    ctx.fillStyle = '#1f4fa8'; ctx.font = '34px "IBM Plex Sans Thai", sans-serif';
    const n = Math.floor(progress * L.lines.length * 12);
    L.lines.forEach((line, i) => { const shown = Math.max(0, Math.min(line.length, n - i * 12)); ctx.fillText(line.slice(0, shown), 28, 104 + i * 54); });
    tex.needsUpdate = true;
  }

  startClass(source = 'manual') {
    const sc = this.school; if (sc.active || this.bbq.active) return;
    sc.active = true; sc.timeLeft = source === 'auto' ? 300 : 200; sc.phase = 0; sc.writeT = 0; sc.started = false; sc.source = source;
    this.sleepers.delete('sis'); this.sis.h.group.visible = true;
    sc.lesson = sc.lessons[sc.lessonIdx++ % sc.lessons.length];
    this.drawBoard(0);
    // พี่สาวเดินไปที่ศาลา
    this.gen++;
    const s = this.sis; s.w.locked = true; s.h.holding = false; s.task = 'ไปสอนภาษาอังกฤษที่ศาลา';
    s.w.go([[-18, 0, 27.5], [-25, 0, 30], [-25, 0.5, 28.4], [-25, 0.5, 23.9]], () => {
      s.h.group.rotation.y = 0; s.h.teaching = true; s.task = `สอนภาษาอังกฤษ (${sc.lesson.topic})`;
    }, true);
    // ลูกศิษย์ 8 คนเดินมาจากถนน (ชุดนักเรียนไทย เสื้อขาว กางเกง/กระโปรงกรมท่า)
    const skins = ['#c68e62', '#d4a57c', '#b97a50', '#e0b48c'], bags = ['#e74c3c', '#3498db', '#f1c40f', '#9b59b6', '#2ecc71', '#e67e22'];
    sc.kids = [];
    for (let i = 0; i < 8; i++) {
      const girl = i % 2 === 1;
      const h = makeHuman({ shirt: '#f6f6f2', pants: girl ? '#22305e' : '#1b2a4a', skin: skins[i % 4], longHair: girl, child: true, shoe: '#222' });
      box(0.26, 0.32, 0.12, new THREE.MeshStandardMaterial({ color: bags[i % bags.length] }), 0, 1.3, -0.22, h.group);
      h.group.scale.setScalar(rand(0.58, 0.7));
      h.group.position.set(-34 - i * 1.4, 0, 40.6 + (i % 2) * 0.5);
      this.scene.add(h.group);
      const w = new Walker(h, rand(1.25, 1.4));
      const seat = sc.seats[i];
      const kid = { h, w, seat, i, sitting: false };
      w.go([[-2, 0, 40.9], [0, 0, 37], [-4, 0, 31], [-16, 0, 30.5], [-24.5 + (i % 3) * 0.4, 0, 30.2], [seat.x, 0.5, 28.6], [seat.x, 0.5, seat.z]], () => {
        h.group.rotation.y = Math.PI; h.baseY = 0.5; h.sitting = true; kid.sitting = true;
      });
      const ent = { id: 'STU-' + (i + 1), type: 'human', label: 'นักเรียน', student: true, obj: h.group, h };
      kid.ent = ent; this.entities.push(ent);
      sc.kids.push(kid);
    }
    bus.emit('farm-event', `📚 นักเรียน 8 คนกำลังเดินมาเรียนภาษาอังกฤษ (${sc.lesson.topic}) กับพี่สาวที่ศาลา`);
    bus.emit('class', { on: true, lesson: `ภาษาอังกฤษ หัวข้อ ${sc.lesson.topic}`, kids: 8 });
  }

  endClass() {
    const sc = this.school; if (!sc.active) return;
    sc.active = false;
    const s = this.sis; s.h.teaching = false; s.h.writing = false; s.w.locked = false; this.gen++;
    s.task = 'เลิกสอน เดินกลับบ้าน';
    const gen = this.sisToken();
    s.w.go([[-25, 0.5, 28.4], [-25, 0, 30], [-18, 0, 27.5], [-3, 0, 11.5]], () => { s.task = 'พักหน้าบ้าน'; setTimeout(() => this.sisLoop(gen), 20000); });
    for (const k of sc.kids) {
      k.h.sitting = false; k.h.handUp = 0;
      k.w.wait = rand(0, 3);
      k.w.go([[k.seat.x, 0.5, 28.6], [-25, 0, 30.4], [-16, 0, 30.8], [-4, 0, 31.5], [0, 0, 37], [-2, 0, 40.9], [-80, 0, 40.9]], () => {
        this.scene.remove(k.h.group);
        this.entities = this.entities.filter(e => e !== k.ent);
        sc.kids = sc.kids.filter(x => x !== k);
      });
    }
    bus.emit('farm-event', 'เลิกเรียนแล้ว เด็ก ๆ บอก “Goodbye, teacher!” แล้วเดินกลับบ้าน');
    bus.emit('class', { on: false });
  }

  updateSchool(dt, t) {
    const sc = this.school;
    sc.kids.forEach(k => k.w.update(dt));
    // ตารางสอน: ทุกวัน 16:00–17:30 (เวลาในฉาก) หลังเลิกเรียนที่โรงเรียน
    const day = new Date().toDateString();
    if (!sc.active && !this.bbq.active && this.hour >= 16 && this.hour < 17.5 && sc.lastDay !== day) { sc.lastDay = day; this.startClass('auto'); }
    if (!sc.active) return;
    const seated = sc.kids.filter(k => k.sitting).length;
    if (!sc.started && seated >= sc.kids.length) { sc.started = true; bus.emit('farm-event', `นักเรียนมาครบ ${seated} คน เริ่มเรียนภาษาอังกฤษ: ${sc.lesson.topic}`); }
    if (sc.started) {
      sc.timeLeft -= dt;
      // สลับ เขียนกระดาน 5 วิ ↔ หันมาอธิบาย 6 วิ
      sc.phase += dt;
      const s = this.sis.h, writing = sc.phase % 11 < 5 && this.sis.h.teaching;
      if (s.teaching) { s.writing = writing; s.group.rotation.y = lerp(s.group.rotation.y, writing ? Math.PI : 0, 0.08); }
      if (writing) { sc.writeT += dt; this.drawBoardThrottle = (this.drawBoardThrottle || 0) - dt; if (this.drawBoardThrottle < 0) { this.drawBoardThrottle = 0.25; this.drawBoard(Math.min(1, sc.writeT / 30)); } }
      if (!writing && Math.random() < dt * 0.6) { const k = sc.kids[Math.floor(Math.random() * sc.kids.length)]; if (k?.sitting) k.h.handUp = rand(1.5, 3); }
    }
    const outOfWindow = sc.source === 'auto' && (this.hour < 15.5 || this.hour >= 18);
    if (sc.timeLeft <= 0 || outOfWindow) this.endClass();
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
      <div class="st"><span>แม่</span><b>${this.momTask || 'อยู่บ้าน'}</b></div>
      ${this.bbq.active ? '<div class="st"><span>🍖 หมูกะทะหน้าบ้าน</span><b>กำลังกิน</b></div>' : ''}
      ${this.school.active ? `<div class="st"><span>📚 ศาลาเรียน</span><b>English · ${this.school.lesson.topic} · ${this.school.kids.length} คน</b></div>` : ''}
      ${this.festival ? `<div class="st"><span>${this.festival.emoji} เทศกาล</span><b>${this.festival.name}</b></div>` : ''}
      ${this.fishers?.statusRow() || ''}
      <div class="st"><span>พี่สาว / น้องสาว</span><b>${this.sis.task} / ${this.kid.task}</b></div>
      <div class="st"><span>หมู / ไก่ / ปลา / แมว</span><b>${this.pigs.length} / ${this.chickens.length} / ${this.fish.length} / ${this.cats.length}</b></div>
      <div class="st"><span>สวนยางพารา</span><b>${this.rubberCount} ต้น</b></div>
      <div class="st"><span>ปั๊มไฮโดร / เติมอากาศบ่อ</span><b>${this.devices.pump ? '🟢' : '⚪'} / ${this.devices.aerator ? '🟢' : '⚪'}</b></div>`;
  }
}

// ให้โมดูลอื่น (เช่น ชาวบ้านปักเบ็ด) สร้างตัวละคร/วัตถุแบบเดียวกันได้
export { makeHuman, Walker, box, cyl, sph, M };
