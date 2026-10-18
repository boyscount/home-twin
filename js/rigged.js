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
  const pos = geo.attributes.position, n = pos.count;
  const si = new Uint16Array(n * 4), sw = new Float32Array(n * 4), p = new THREE.Vector3(), q = new THREE.Vector3();
  const sm = (a, b, x) => { const t = THREE.MathUtils.clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
  // ---- แขน: ตัดระนาบเลยรักแร้ไปนิด แล้ว "ไหลตามผิว" จากปลายนิ้วเข้ามา — ผิวข้างลำตัวไม่ต่อกับแขนหลังระนาบ จึงไม่ถูกนับเป็นแขน
  const adj = Array.from({ length: n }, () => []), ix = geo.index ? geo.index.array : null;
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
  const AL = arm(-1), AR = arm(1);
  for (let i = 0; i < n; i++) {
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
  // เกลี่ยน้ำหนักตามผิว (เพื่อนบ้านบนผิว) สองสามรอบ → ข้อต่อ คอ รักแร้ เป้า งอแบบนุ่ม ไม่หักเป็นรอยแตก
  if (ix) {
    const NB = 10; let W = new Float32Array(n * NB);
    for (let i = 0; i < n; i++) for (let k = 0; k < 4; k++) W[i * NB + si[i * 4 + k]] += sw[i * 4 + k];
    for (let it = 0; it < 3; it++) {
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
  geo.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(si, 4));
  geo.setAttribute('skinWeight', new THREE.Float32BufferAttribute(sw, 4));
  geo.scale(SCALE, SCALE, SCALE); geo.computeVertexNormals();
  geo.boundingSphere = new THREE.Sphere(V(0, 0.9, 0), 1.3);

  const fixL = new THREE.Quaternion().setFromAxisAngle(V(0, 0, 1), rig.pull), fixR = new THREE.Quaternion().setFromAxisAngle(V(0, 0, 1), -rig.pull);
  return function make() {
    const root = new THREE.Bone();
    const mk = (parent, pos) => { const b = new THREE.Bone(); b.position.copy(pos).multiplyScalar(SCALE); parent.add(b); return b; };
    const legL = mk(root, P('hipL')), legR = mk(root, Pm('hipL'));
    const kneeL = mk(legL, P('kneeL').sub(P('hipL'))), kneeR = mk(legR, Pm('kneeL').sub(Pm('hipL')));
    const armL = mk(root, P('shL')), armR = mk(root, Pm('shL'));
    const elbowL = mk(armL, P('elL').sub(P('shL'))), elbowR = mk(armR, Pm('elL').sub(Pm('shL')));
    const head = mk(root, P('neck'));
    const mesh = new THREE.SkinnedMesh(geo, MAT);
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
