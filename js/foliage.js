// ใบไม้จริงแทนลูกบอลเหลี่ยม: พุ่มไม้ทำจากแผ่นใบโปร่งใส (leaf cards) หลายสิบแผ่น จัดเป็นทรงพุ่ม
// normal ของแต่ละแผ่นชี้ออกจากกลางพุ่ม → แสงตกกระทบนุ่มเหมือนพุ่มไม้จริง · ไหวตามลมด้วย shader
import * as THREE from 'three';

const rand = (a, b) => a + Math.random() * (b - a);
export const windU = { time: { value: 0 }, wind: { value: 1 } };

function tex(w, h, draw) {
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4;
  return t;
}
// ใบเดี่ยวรูปไข่ มีเส้นกลางใบ
function leaf(c, x, y, len, wid, ang, col) {
  c.save(); c.translate(x, y); c.rotate(ang);
  c.fillStyle = col; c.beginPath(); c.moveTo(0, 0);
  c.quadraticCurveTo(wid, len * 0.45, 0, len); c.quadraticCurveTo(-wid, len * 0.45, 0, 0); c.fill();
  c.strokeStyle = 'rgba(255,255,240,.18)'; c.lineWidth = 1; c.beginPath(); c.moveTo(0, len * 0.05); c.lineTo(0, len * 0.92); c.stroke();
  c.restore();
}
const hsl = (h, s, l) => `hsl(${h},${s}%,${l}%)`;

export const FOL = {};
export function makeFoliageTextures() {
  // ช่อใบไม้กว้างใบ (ต้นไม้ทั่วไป / ต้นยาง)
  const cluster = (hue, light) => tex(256, 256, (c, w, h) => {
    for (let i = 0; i < 70; i++) {
      const a = rand(0, Math.PI * 2), r = rand(0, 100);
      leaf(c, w / 2 + Math.cos(a) * r * 0.9, h / 2 + Math.sin(a) * r * 0.9, rand(30, 48), rand(10, 16), a + rand(-0.6, 0.6) + Math.PI / 2,
        hsl(hue + rand(-8, 8), rand(30, 48), light + rand(-8, 9)));
    }
  });
  FOL.broad = cluster(100, 28);
  FOL.rubber = cluster(96, 26);
  // ใบมะพร้าว: ก้านกลาง + ใบย่อยเรียวยาวทั้งสองข้าง
  FOL.palm = tex(256, 1024, (c, w, h) => {
    for (let y = 30; y < h - 16; y += 15) {
      const k = y / h, len = 118 * Math.sin(k * Math.PI * 0.92 + 0.2);
      for (const s of [-1, 1]) {
        c.strokeStyle = hsl(rand(78, 96), rand(34, 50), rand(22, 34)); c.lineWidth = rand(5, 7); c.lineCap = 'round';
        c.beginPath(); c.moveTo(w / 2, y); c.quadraticCurveTo(w / 2 + s * len * 0.55, y + 14, w / 2 + s * len, y + 60 + k * 30); c.stroke();
      }
    }
    c.lineWidth = 6;
    c.strokeStyle = '#8a8a4a'; c.beginPath(); c.moveTo(w / 2, 0); c.lineTo(w / 2, h); c.stroke();
  });
  // ใบกล้วย: ใบใหญ่ยาว มีเส้นใบขวาง และรอยฉีกตามขอบ
  FOL.banana = tex(128, 512, (c, w, h) => {
    const g = c.createLinearGradient(0, 0, w, 0); g.addColorStop(0, '#5f8a3a'); g.addColorStop(0.5, '#7ba24a'); g.addColorStop(1, '#5a8236');
    c.fillStyle = g; c.beginPath(); c.moveTo(w / 2, 4);
    c.bezierCurveTo(w + 6, h * 0.2, w + 6, h * 0.8, w / 2, h - 4); c.bezierCurveTo(-6, h * 0.8, -6, h * 0.2, w / 2, 4); c.fill();
    c.strokeStyle = 'rgba(30,50,15,.35)'; c.lineWidth = 1;
    for (let y = 12; y < h; y += 5) { c.beginPath(); c.moveTo(w / 2, y); c.lineTo(4, y + 14); c.moveTo(w / 2, y); c.lineTo(w - 4, y + 14); c.stroke(); }
    c.globalCompositeOperation = 'destination-out';
    for (let i = 0; i < 9; i++) { const y = rand(60, h - 40), s = Math.random() > 0.5 ? 1 : -1; c.fillRect(s > 0 ? w / 2 + 6 : 0, y, w / 2 - 6, 2); }
    c.globalCompositeOperation = 'source-over';
    c.fillStyle = '#c9c070'; c.fillRect(w / 2 - 2, 0, 4, h);
  });
}

// วัสดุใบไม้ + ลมพัด (ปลายบนไหวมากกว่า) ใช้ได้ทั้ง mesh ปกติและ InstancedMesh
export function leafMaterial(map, color = '#ffffff', sway = 1) {
  const m = new THREE.MeshStandardMaterial({ map, color, alphaTest: 0.45, alphaToCoverage: true, side: THREE.DoubleSide, roughness: 0.85 });
  m.onBeforeCompile = sh => {
    sh.uniforms.uTime = windU.time; sh.uniforms.uWind = windU.wind;
    sh.vertexShader = 'uniform float uTime; uniform float uWind;\n' + sh.vertexShader.replace('#include <begin_vertex>', `#include <begin_vertex>
      vec4 lwp = vec4(transformed, 1.0);
      #ifdef USE_INSTANCING
        lwp = instanceMatrix * lwp;
      #endif
      lwp = modelMatrix * lwp;
      float sw = ${sway.toFixed(2)} * uWind * 0.06 * (0.6 + 0.4 * sin(uTime * 0.7 + lwp.x * 0.11));
      transformed.x += sin(uTime * 1.9 + lwp.x * 0.35 + lwp.z * 0.21 + lwp.y) * sw;
      transformed.z += cos(uTime * 1.6 + lwp.z * 0.33 + lwp.y * 1.3) * sw * 0.8;`);
  };
  m.customProgramCacheKey = () => 'leaf' + sway;
  return m;
}

// ทรงพุ่ม: แผ่นใบ n แผ่นกระจายในทรงรี (rx, ry, rz) — normal ชี้ออกจากกลางพุ่ม
export function canopyGeometry(n = 34, rx = 1.6, ry = 1.2, rz = 1.6, size = 1.25) {
  const pos = [], nor = [], uv = [], idx = [];
  const q = new THREE.Quaternion(), e = new THREE.Euler(), v = new THREE.Vector3(), nrm = new THREE.Vector3();
  const corners = [[-0.5, -0.5], [0.5, -0.5], [0.5, 0.5], [-0.5, 0.5]];
  for (let i = 0; i < n; i++) {
    // จุดในทรงรี เอนไปทางผิวนอก (พุ่มด้านในโปร่ง)
    const u = Math.random(), th = rand(0, Math.PI * 2), ph = Math.acos(rand(-0.75, 1)), r = Math.pow(u, 0.35);
    const cx = Math.sin(ph) * Math.cos(th) * rx * r, cy = Math.cos(ph) * ry * r, cz = Math.sin(ph) * Math.sin(th) * rz * r;
    nrm.set(cx / rx, cy / ry + 0.35, cz / rz).normalize();
    q.setFromEuler(e.set(rand(0, Math.PI), rand(0, Math.PI * 2), rand(0, Math.PI)));
    const s = size * rand(0.8, 1.2), b = pos.length / 3;
    for (const [a, c] of corners) {
      v.set(a * s, c * s, 0).applyQuaternion(q);
      pos.push(cx + v.x, cy + v.y, cz + v.z); nor.push(nrm.x, nrm.y, nrm.z); uv.push(a + 0.5, c + 0.5);
    }
    idx.push(b, b + 1, b + 2, b, b + 2, b + 3);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx); g.computeBoundingSphere();
  return g;
}

// ใบยาวโค้ง (มะพร้าว/กล้วย): แผ่นยาว length โค้งลงตามความยาว พับสันกลางเล็กน้อยให้เป็นรูปตัว V
export function frondGeometry(width, length, droop, fold = 0.25, segs = 10) {
  const g = new THREE.PlaneGeometry(width, length, 2, segs);
  g.translate(0, length / 2, 0);
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const y = p.getY(i), k = y / length, x = p.getX(i);
    p.setZ(i, Math.pow(k, 2) * droop - Math.abs(x) * fold); // +z = ด้านนอก/ล่าง หลังหมุนแกน x → ปลายใบห้อยลง
    p.setY(i, y * (1 - k * droop * 0.05));
  }
  g.computeVertexNormals();
  return g;
}
