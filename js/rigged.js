// ตัวละครจากไฟล์: โมเดลจาก Hunyuan3D (ไม่มีกระดูก) → ใส่กระดูกอัตโนมัติด้วยโค้ด ให้ใช้ท่าทางชุดเดิมของ human.js ได้ทันที
// คืนค่า API เดียวกับ makeHuman(): group, legL/legR, armL/armR, head, kneeL/kneeR, elbowL/elbowR, phase
// ข้อมูลข้อต่อของแต่ละโมเดลอยู่ใน models/rigs.json (สร้างโดย videos/hy3d/make_char.py)
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

let rigsP = null;
const rigs = () => rigsP || (rigsP = fetch('models/rigs.json').then(r => r.json()));
const MAT = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.8 }); // ทุกตัวใช้วัสดุร่วมกัน
const V = (x, y, z = 0) => new THREE.Vector3(x, y, z);

function segDist(p, a, b) {
  const ab = b.clone().sub(a), t = THREE.MathUtils.clamp(p.clone().sub(a).dot(ab) / ab.lengthSq(), 0, 1);
  return p.distanceTo(a.clone().addScaledVector(ab, t));
}

// ทำน้ำหนักผิวครั้งเดียวต่อโมเดล — คืน "โรงงาน" ที่สร้างตัวละครได้หลายตัว (ใช้ geometry ร่วมกัน)
export async function loadRigFactory(name) {
  const [gltf, all] = await Promise.all([new GLTFLoader().loadAsync(`models/${name}.glb`), rigs()]);
  const rig = all[name]; if (!rig) throw new Error('no rig for ' + name);
  const J = rig.joints, SCALE = rig.scale;
  let src; gltf.scene.traverse(o => { if (o.isMesh && !src) src = o; });
  const geo = src.geometry.clone();
  // สีจุดยอดจาก trimesh เป็นค่า sRGB แต่ three อ่านเป็น linear → แปลงกลับ ไม่งั้นสีซีด
  const col = geo.attributes.color, c = new THREE.Color();
  if (col) for (let i = 0; i < col.count; i++) { c.fromBufferAttribute(col, i).convertSRGBToLinear(); col.setXYZ(i, c.r, c.g, c.b); }
  const P = k => V(...J[k]), Pm = k => V(-J[k][0], J[k][1]);
  const yNeck = J.neck[1], yHip = J.hipL[1], ySh = J.shL[1], yHand = J.handL[1];

  // ---- น้ำหนักผิว: ระยะถึงแกนกระดูก (1/d^4) + กฎแยกซ้าย/ขวา, หัว/ผม/หมวกตามหัว
  const segs = [ // [bone index, a, b] — ลำดับกระดูกตรงกับ make() ด้านล่าง
    [0, P('pelvis'), P('neck')],
    [1, P('hipL'), P('kneeL')], [2, Pm('hipL'), Pm('kneeL')],
    [3, P('kneeL'), P('ankleL')], [4, Pm('kneeL'), Pm('ankleL')],
    [5, P('shL'), P('elL')], [6, Pm('shL'), Pm('elL')],
    [7, P('elL'), P('handL')], [8, Pm('elL'), Pm('handL')],
    [9, P('neck'), P('headTop')],
  ];
  // ---- เชื่อมจุดที่ตำแหน่งเดียวกัน (โมเดลมีพื้นผิวภาพจะแยกจุดตามรอยตัด UV) — คำนวณน้ำหนัก/ผิวบนตัวที่เชื่อมแล้ว
  // จุดคู่แฝดตรงรอยตัดจึงได้น้ำหนักและทิศผิวเท่ากันเป๊ะ → ไม่มีรอยแตก/เส้นตะเข็บตอนขยับ
  const pos0 = geo.attributes.position, n0 = pos0.count, canon = new Uint32Array(n0), keyMap = new Map(), wp = [];
  for (let i = 0; i < n0; i++) {
    const x = pos0.getX(i), y = pos0.getY(i), z = pos0.getZ(i), key = `${Math.round(x * 1e5)},${Math.round(y * 1e5)},${Math.round(z * 1e5)}`;
    let id = keyMap.get(key); if (id === undefined) { id = wp.length / 3; keyMap.set(key, id); wp.push(x, y, z); } canon[i] = id;
  }
  const pos = new THREE.BufferAttribute(new Float32Array(wp), 3), n = pos.count;
  const si = new Uint16Array(n * 4), sw = new Float32Array(n * 4), p = new THREE.Vector3(), q = new THREE.Vector3();
  const sm = (a, b, x) => { const t = THREE.MathUtils.clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
  // ---- แขน: ตัดระนาบเลยรักแร้ไปนิด แล้ว "ไหลตามผิว" จากปลายนิ้วเข้ามา — ผิวข้างลำตัวไม่ต่อกับแขนหลังระนาบ จึงไม่ถูกนับเป็นแขน
  const adj = Array.from({ length: n }, () => []), ix = geo.index ? Uint32Array.from(geo.index.array, v => canon[v]) : null;
  if (ix) for (let k = 0; k < ix.length; k += 3) { const a = ix[k], b = ix[k + 1], c3 = ix[k + 2]; adj[a].push(b, c3); adj[b].push(a, c3); adj[c3].push(a, b); }
  const arm = side => {
    const sh = side < 0 ? P('shL') : Pm('shL'), hd = side < 0 ? P('handL') : Pm('handL');
    const d = hd.clone().sub(sh), len = d.length(); d.normalize();
    const t = new Float32Array(n), inArm = new Uint8Array(n), t0 = 0.22 * len;
    let seed = -1, best = 1e9;
    for (let k = 0; k < n; k++) {
      p.fromBufferAttribute(pos, k); t[k] = (p.x - sh.x) * d.x + (p.y - sh.y) * d.y;
      const dd = (p.x - hd.x) ** 2 + (p.y - hd.y) ** 2; if (dd < best && Math.sign(p.x) === side) { best = dd; seed = k; }
    }
    let cnt = 0;
    if (ix && seed >= 0) { const st = [seed]; inArm[seed] = 1; while (st.length) { const v = st.pop(); cnt++; for (const w of adj[v]) if (!inArm[w] && t[w] > t0) { inArm[w] = 1; st.push(w); } } }
    if (cnt > 0.14 * n) inArm.fill(0); // แขนแนบตัวจนผิวติดกัน (ไหลเลยเข้าลำตัว) → ใช้วิธีระยะทางแบบเดิมแทน
    return { t, inArm, len, t0, ok: cnt > 0 && cnt <= 0.14 * n };
  };
  // ---- น้ำหนักจาก Blender (bone heat) ถ้ามีในไฟล์ → ใช้เลย แม่นกว่าที่คำนวณเอง (ใช้แค่น้ำหนัก ส่วนโครงกระดูกยังเป็นของเรา)
  const BONES = ['root', 'legL', 'legR', 'kneeL', 'kneeR', 'armL', 'armR', 'elbowL', 'elbowR', 'head'];
  const bsi = src.isSkinnedMesh ? src.geometry.attributes.skinIndex : null, bsw = bsi && src.geometry.attributes.skinWeight;
  const g4 = (at, i, k) => k === 0 ? at.getX(i) : k === 1 ? at.getY(i) : k === 2 ? at.getZ(i) : at.getW(i);
  if (bsi) {
    const remap = src.skeleton.bones.map(b => BONES.indexOf(b.name)), seen = new Uint8Array(n);
    for (let i = 0; i < n0; i++) {
      const c = canon[i]; if (seen[c]) continue; seen[c] = 1;
      const pr = [0, 1, 2, 3].map(k => { const w = g4(bsw, i, k); return [w > 0 ? Math.max(0, remap[g4(bsi, i, k)]) : 0, w]; }).sort((x, y) => y[1] - x[1]); // ช่องแรก = กระดูกหลัก
      pr.forEach(([b2, w], k) => { si[c * 4 + k] = b2; sw[c * 4 + k] = w; });
    }
  }
  // จุดหลงจาก bone heat (จุดเดี่ยว ๆ ที่ได้กระดูกต่างจากเพื่อนบ้านทั้งหมด เช่น ชิ้นหมวกไปติดแขน) → ใช้น้ำหนักเฉลี่ยของเพื่อนบ้านแทน
  if (bsi && ix) {
    for (let pass = 0; pass < 3; pass++) {
      let fixed = 0;
      for (let i = 0; i < n; i++) {
        const nb = adj[i]; if (!nb.length) continue;
        const d = si[i * 4], cnt = {}; let same = 0;
        for (const j of nb) { const dj = si[j * 4]; cnt[dj] = (cnt[dj] || 0) + 1; if (dj === d) same++; }
        if (same > 0) continue;
        const acc = new Float32Array(10);
        for (const j of nb) for (let k = 0; k < 4; k++) acc[si[j * 4 + k]] += sw[j * 4 + k];
        const top = [...acc.keys()].filter(b2 => acc[b2] > 1e-4).sort((x, y) => acc[y] - acc[x]).slice(0, 4), tot = top.reduce((s2, b2) => s2 + acc[b2], 0);
        for (let k = 0; k < 4; k++) { si[i * 4 + k] = top[k] ?? 0; sw[i * 4 + k] = top[k] !== undefined ? acc[top[k]] / tot : 0; }
        fixed++;
      }
      if (!fixed) break;
    }
  }
  const AL = arm(-1), AR = arm(1);
  for (let i = 0; i < n && !bsi; i++) {
    p.fromBufferAttribute(pos, i); q.set(p.x, p.y, 0);
    let cand = [];
    const A = AL.inArm[i] ? [AL, 5, 7] : AR.inArm[i] ? [AR, 6, 8] : null;
    if (A) {
      const [R, bu, bf] = A, tr = R.t[i] / R.len;
      const f = sm(0.38, 0.52, tr), a = sm(R.t0 / R.len, R.t0 / R.len + 0.14, tr); // ศอก / โคนแขนผสมกับลำตัว
      cand = [[bu, a * (1 - f)], [bf, a * f], [0, 1 - a]].filter(c => c[1] > 1e-3);
    } else if (p.y > yNeck + 0.01) cand = [[9, 1]];
    else {
      const legacy = !(p.x < 0 ? AL.ok : AR.ok); // ด้านนี้ใช้วิธีระยะทาง (แขนแนบตัว)
      for (const [b, a, e] of segs) {
        if (b >= 5 && b <= 8 && (!legacy || p.y < yHand - 0.04)) continue;
        if ((b === 5 || b === 7) && p.x > 0.01) continue;
        if ((b === 6 || b === 8) && p.x < -0.01) continue;
        if ((b === 1 || b === 3) && p.x > 0.01) continue; // ซ้ายอยู่ฝั่ง -x
        if ((b === 2 || b === 4) && p.x < -0.01) continue;
        if (b >= 1 && b <= 4 && p.y > yHip + 0.06) continue; // ขาไม่ดึงลำตัวบน
        let w = 1 / Math.max(segDist(q, a, e), 0.004) ** 4;
        if (b === 0 && p.y < yHip) w *= Math.max(0, (p.y - (yHip - 0.08)) / 0.08) ** 2; // ใต้สะโพกเป็นของขา
        if (b === 9) w *= 0.3;
        cand.push([b, w]);
      }
      if (legacy && Math.abs(p.x) > (rig.torsoHalf || 0.1) + 0.03 && p.y < ySh - 0.03 && p.y > yHand - 0.04) cand = cand.filter(([b]) => b >= 5 && b <= 8);
      const tot0 = cand.reduce((s, c) => s + c[1], 0) || 1; cand = cand.map(([b, w]) => [b, w / tot0]);
      cand.sort((x, y) => y[1] - x[1]); cand = cand.slice(0, 3);
    }
    const tot = cand.reduce((s, c) => s + c[1], 0) || 1;
    cand.forEach(([b, w], k) => { si[i * 4 + k] = b; sw[i * 4 + k] = w / tot; });
  }
  // เกลี่ยน้ำหนักตามผิว (เพื่อนบ้านบนผิว) → ข้อต่อ คอ รักแร้ เป้า งอแบบนุ่ม ไม่หักเป็นรอยแตก (น้ำหนักจาก Blender เกลี่ยมาแล้ว)
  if (ix && !bsi) {
    const NB = 10; let W = new Float32Array(n * NB);
    for (let i = 0; i < n; i++) for (let k = 0; k < 4; k++) W[i * NB + si[i * 4 + k]] += sw[i * 4 + k];
    for (let it = 0, IT = globalThis.__rigSmooth ?? 30; it < IT; it++) { // 30 รอบ: วัดแล้วรอยยืดตามข้อต่อลดลงมากที่สุดโดยแขนขายังไม่เหลว
      const W2 = new Float32Array(n * NB);
      for (let i = 0; i < n; i++) {
        const nb = adj[i], m = nb.length; if (!m) { for (let b = 0; b < NB; b++) W2[i * NB + b] = W[i * NB + b]; continue; }
        for (let b = 0; b < NB; b++) { let acc = 0; for (const j of nb) acc += W[j * NB + b]; W2[i * NB + b] = 0.5 * W[i * NB + b] + 0.5 * acc / m; }
      }
      W = W2;
    }
    for (let i = 0; i < n; i++) { // เก็บ 4 กระดูกที่มีน้ำหนักมากสุด
      const top = []; for (let b = 0; b < NB; b++) if (W[i * NB + b] > 1e-4) top.push([b, W[i * NB + b]]);
      top.sort((x, y) => y[1] - x[1]); top.length = Math.min(4, top.length);
      const tot = top.reduce((s2, c) => s2 + c[1], 0) || 1;
      for (let k = 0; k < 4; k++) { si[i * 4 + k] = top[k] ? top[k][0] : 0; sw[i * 4 + k] = top[k] ? top[k][1] / tot : 0; }
    }
  }
  const si0 = new Uint16Array(n0 * 4), sw0 = new Float32Array(n0 * 4);
  for (let i = 0; i < n0; i++) for (let k = 0; k < 4; k++) { si0[i * 4 + k] = si[canon[i] * 4 + k]; sw0[i * 4 + k] = sw[canon[i] * 4 + k]; }
  // มือ: จุดรอบข้อมือ/ฝ่ามือที่อยู่นอกแนวต้นขา → ให้ตามแขนท่อนล่าง 100% (มือที่แนบขาในโมเดลเดิมจะไม่โดนขาดึงไว้)
  {
    const S0 = yNeck / (rig.child ? 0.83 : 0.865), RH = 0.075 * S0, xThigh = Math.abs(J.hipL[0]) + 0.09 * S0;
    for (let i = 0; i < n; i++) {
      p.fromBufferAttribute(pos, i); if (Math.abs(p.x) < xThigh) continue;
      const hd = p.x < 0 ? P('handL') : Pm('handL'), wr = p.x < 0 ? P('wrL') : Pm('wrL');
      if (Math.hypot(p.x - hd.x, p.y - hd.y) < RH || Math.hypot(p.x - wr.x, p.y - wr.y) < RH * 0.8) { si.fill(0, i * 4, i * 4 + 4); sw.fill(0, i * 4, i * 4 + 4); si[i * 4] = p.x < 0 ? 7 : 8; sw[i * 4] = 1; }
    }
  }
  // แขนกับขาต้องไม่ดึงกัน: จุดที่เป็นของแขนตัดน้ำหนักขาทิ้ง และกลับกัน (มือที่แนบขาในโมเดลเดิมจะได้ยกออกได้สะอาด)
  for (let i = 0; i < n; i++) {
    const d = si[i * 4], armDom = d >= 5 && d <= 8, legDom = d >= 1 && d <= 4; if (!armDom && !legDom) continue;
    let tot = 0;
    for (let k = 0; k < 4; k++) { const b2 = si[i * 4 + k]; if ((armDom && b2 >= 1 && b2 <= 4) || (legDom && b2 >= 5 && b2 <= 8)) sw[i * 4 + k] = 0; tot += sw[i * 4 + k]; }
    if (tot > 0) for (let k = 0; k < 4; k++) sw[i * 4 + k] /= tot;
  }
  // ตัด "สะพาน" ผิวระหว่างมือกับต้นขา: บางโมเดลมือแนบขาจนผิวติดกัน พอยกมือ/งอขา ผิวตรงนั้นจะยืดเป็นแผ่นยาว
  // (สามเหลี่ยมที่มุมหนึ่งเป็นของแขน อีกมุมเป็นของขา — อยู่ตรงจุดสัมผัสพอดี จึงมองไม่เห็นตอนยืนปกติ)
  if (geo.index) {
    const dom = new Uint8Array(n); for (let i = 0; i < n; i++) dom[i] = si[i * 4]; // กระดูกหลักของแต่ละจุด (ตัวที่เชื่อมแล้ว)
    const isArm = b => b >= 5 && b <= 8, isLeg = b => b >= 1 && b <= 4;
    const src = geo.index.array, keep = []; let cut = 0;
    for (let k = 0; k < src.length; k += 3) {
      const d = [dom[canon[src[k]]], dom[canon[src[k + 1]]], dom[canon[src[k + 2]]]];
      if (d.some(isArm) && d.some(isLeg)) { cut++; continue; }
      keep.push(src[k], src[k + 1], src[k + 2]);
    }
    if (cut) geo.setIndex(keep); rig.cut = cut;
  }
  geo.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(si0, 4));
  geo.setAttribute('skinWeight', new THREE.Float32BufferAttribute(sw0, 4));
  // ทิศผิวคิดจากตัวที่เชื่อมแล้ว → ผิวเรียบต่อเนื่อง ไม่เห็นตะเข็บ UV
  const wg = new THREE.BufferGeometry(); wg.setAttribute('position', pos); if (ix) wg.setIndex(new THREE.BufferAttribute(ix, 1)); wg.computeVertexNormals();
  const wn = wg.attributes.normal, nn = new Float32Array(n0 * 3);
  for (let i = 0; i < n0; i++) { nn[i * 3] = wn.getX(canon[i]); nn[i * 3 + 1] = wn.getY(canon[i]); nn[i * 3 + 2] = wn.getZ(canon[i]); }
  geo.scale(SCALE, SCALE, SCALE); geo.setAttribute('normal', new THREE.BufferAttribute(nn, 3));
  geo.boundingSphere = new THREE.Sphere(V(0, 0.9, 0), 1.3);

  // มีภาพพื้นผิว (Tripo) → ใช้ภาพจริง · ไม่มี → สีจุดยอด (วัสดุร่วม)
  const map = src.material && src.material.map, mat = map ? new THREE.MeshStandardMaterial({ map, roughness: 0.85 }) : MAT;
  if (map) { map.anisotropy = 4; }
  // โมเดลที่สร้างท่ากางแขน (Tripo) หุบแขนเพิ่มอีกนิดให้แขนแนบลำตัวตอนเดิน (ไม่กางเหมือนเดินเป็ด)
  const PULL = rig.pull > 0.3 ? rig.pull + 0.09 : rig.pull;
  const fixL = new THREE.Quaternion().setFromAxisAngle(V(0, 0, 1), PULL), fixR = new THREE.Quaternion().setFromAxisAngle(V(0, 0, 1), -PULL);
  return function make() {
    const root = new THREE.Bone();
    const mk = (parent, pos) => { const b = new THREE.Bone(); b.position.copy(pos).multiplyScalar(SCALE); parent.add(b); return b; };
    const legL = mk(root, P('hipL')), legR = mk(root, Pm('hipL'));
    const kneeL = mk(legL, P('kneeL').sub(P('hipL'))), kneeR = mk(legR, Pm('kneeL').sub(Pm('hipL')));
    const armL = mk(root, P('shL')), armR = mk(root, Pm('shL'));
    const elbowL = mk(armL, P('elL').sub(P('shL'))), elbowR = mk(armR, Pm('elL').sub(Pm('shL')));
    const head = mk(root, P('neck'));
    const mesh = new THREE.SkinnedMesh(geo, mat);
    mesh.add(root); mesh.bind(new THREE.Skeleton([root, legL, legR, kneeL, kneeR, armL, armR, elbowL, elbowR, head]));
    mesh.castShadow = true;
    // โมเดลยืนกางแขน (A-pose) → ท่าทางชุดเดิมคิดจากแขนห้อยตรง: โค้ดท่าทางหมุน "ตัวแทน" แล้วแปลงเป็นกระดูกจริง = ท่าทาง × หุบแขนลง
    const proxyL = new THREE.Object3D(), proxyR = new THREE.Object3D();
    proxyL.rotation.z = -0.06; proxyR.rotation.z = 0.06;
    const upd = mesh.updateMatrixWorld;
    mesh.updateMatrixWorld = function (force) {
      armL.quaternion.copy(proxyL.quaternion).multiply(fixL); armR.quaternion.copy(proxyR.quaternion).multiply(fixR);
      upd.call(this, force);
    };
    const group = new THREE.Group(); group.add(mesh);
    return { group, legL, legR, armL: proxyL, armR: proxyR, head, kneeL, kneeR, elbowL, elbowR, phase: Math.random() * 6, mesh, bones: { armL, armR }, headY: J.neck[1] * SCALE };
  };
}

// ใส่ร่างใหม่ให้คนที่มีอยู่แล้วในฉาก (ตำแหน่ง/สถานะ/การเดินเหมือนเดิม) — ของที่ถืออยู่ย้ายไปบนกระดูกใหม่
// headShift: เลื่อนของที่ติดหัว (เช่น ไฟฉาย) จากตำแหน่งหัวเดิม (1.68) ไปหัวใหม่
export function reskin(h, r, SKIN_MAT, headShift) {
  const g = h.group;
  for (const c of [...h.armR.children]) if (!(c.isMesh && c.material === SKIN_MAT) && c !== h.elbowR) r.bones.armR.add(c);
  for (const c of [...h.armL.children]) if (!(c.isMesh && c.material === SKIN_MAT) && c !== h.elbowL) r.bones.armL.add(c);
  const shift = headShift || V(0, 1.68 - r.headY, 0);
  for (const c of [...h.head.children]) { if (c.isMesh && c.material === SKIN_MAT) continue; c.position.add(shift); r.head.add(c); }
  for (const c of [...g.children]) if ((c.isMesh && c.material === SKIN_MAT) || [h.legL, h.legR, h.armL, h.armR, h.head].includes(c)) g.remove(c);
  g.add(r.mesh);
  for (const k of ['legL', 'legR', 'armL', 'armR', 'head', 'kneeL', 'kneeR', 'elbowL', 'elbowR']) h[k] = r[k];
  h.mesh = r.mesh; h.rigged = true;
}
