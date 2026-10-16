// รวมชิ้นส่วนที่ไม่เคยขยับ (บ้าน รั้ว คอก โรงเรือน ฯลฯ) เป็นก้อนใหญ่ตามวัสดุ → draw call ลดจากหลักพันเหลือหลักร้อย
// ชิ้นที่โค้ดยังอ้างถึง (เก็บไว้ใน this.xxx เพื่อขยับ/สลับวัสดุ/ซ่อน) หรือที่ขยับจริงตอนทดลองเดินฉาก จะไม่ถูกรวม
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

// ไล่หา Object3D ทุกตัวที่ farm (และโมดูลลูก) ถือ reference ไว้ → ถือว่าเป็นของที่ขยับได้ พร้อมลูกหลานทั้งหมด
// containers = กลุ่มที่เก็บไว้แค่อ่านตำแหน่ง (บ้าน, บ่อ) → ไม่ลากลูกหลานทั้งหมดเป็นของขยับได้
function referenced(root, skip, containers) {
  const dyn = new Set(), seen = new Set();
  const mark = o => (containers.has(o) ? dyn.add(o) : o.traverse(x => dyn.add(x)));
  const walk = (v, depth) => {
    if (!v || typeof v !== 'object' || seen.has(v) || depth > 5) return;
    seen.add(v);
    if (v.isObject3D) { if (!v.isScene) mark(v); return; }
    if (v.isMaterial || v.isTexture || v.isBufferGeometry || skip.has(v)) return;
    if (v instanceof Map) { v.forEach(x => walk(x, depth + 1)); return; }
    if (v instanceof Set || Array.isArray(v)) { for (const x of v) walk(x, depth + 1); return; }
    if (ArrayBuffer.isView(v) || v instanceof HTMLElement || v instanceof Function) return;
    for (const k of Object.keys(v)) walk(v[k], depth + 1);
  };
  walk(root, 0);
  return dyn;
}

export function freezeStatic(farm, simulate, containers = []) {
  const scene = farm.scene;
  const skip = new Set([farm.renderer, farm.composer, farm.controls, farm.labelRenderer, farm.pmrem, farm.host, farm.clock]);
  const dyn = referenced(farm, skip, new Set(containers));
  const cand = [];
  scene.updateMatrixWorld(true);
  scene.traverse(o => {
    if (!o.isMesh || o.isInstancedMesh || o.isSkinnedMesh || dyn.has(o)) return;
    if (Array.isArray(o.material) || o.geometry.morphAttributes.position || !o.visible) return;
    let p = o.parent, ok = true;
    while (p && p !== scene) { if (!p.visible || p.isCSS2DObject) ok = false; p = p.parent; }
    if (ok && p === scene) cand.push(o);
  });
  // เดินฉากจริงสักพัก → อะไรขยับ (matrixWorld เปลี่ยน) ตัดทิ้ง
  const before = new Map(cand.map(o => [o, o.matrixWorld.clone()]));
  simulate?.();
  scene.updateMatrixWorld(true);
  const stat = cand.filter(o => o.visible && o.matrixWorld.equals(before.get(o)) && !dyn.has(o));
  // จัดกลุ่มตามวัสดุ + การรับ/ทอดเงา + ชุด attribute
  const groups = new Map();
  for (const o of stat) {
    const g = o.geometry, attrs = Object.keys(g.attributes).sort().join(',');
    const key = `${o.material.uuid}|${o.castShadow}|${o.receiveShadow}|${o.renderOrder}|${attrs}|${g.index ? 1 : 0}`;
    (groups.get(key) || groups.set(key, []).get(key)).push(o);
  }
  let removed = 0, made = 0;
  for (const list of groups.values()) {
    if (list.length < 2) continue;
    const geos = list.map(o => { const g = o.geometry.clone(); g.applyMatrix4(o.matrixWorld); return g; });
    const merged = mergeGeometries(geos, false);
    geos.forEach(g => g.dispose());
    if (!merged) continue;
    merged.computeBoundingSphere();
    const m = new THREE.Mesh(merged, list[0].material);
    m.castShadow = list[0].castShadow; m.receiveShadow = list[0].receiveShadow; m.renderOrder = list[0].renderOrder;
    m.matrixAutoUpdate = false; m.name = 'frozen';
    scene.add(m); made++;
    for (const o of list) { o.parent.remove(o); removed++; }
  }
  return { candidates: cand.length, static: stat.length, removed, made };
}
