// ตัวละครจากไฟล์: โมเดลจาก Hunyuan3D (ไม่มีกระดูก) → ใส่กระดูกอัตโนมัติด้วยโค้ด ให้ใช้ท่าทางชุดเดิมของ human.js ได้ทันที
// คืนค่า API เดียวกับ makeHuman(): group, legL/legR, armL/armR, head, kneeL/kneeR, elbowL/elbowR, phase
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

const SCALE = 1.86; // โมเดลสูง 1 หน่วย (รวมหมวก) → ไหล่อยู่ที่ ~1.43 เท่าคนในฉาก
// ข้อต่อ (หน่วยโมเดลก่อนขยาย) วัดจากการตัดแนวนอนของตัวโมเดล
const J = {
  hipL: [-0.055, 0.50], kneeL: [-0.052, 0.27], ankleL: [-0.05, 0.05],
  shL: [-0.14, 0.745], elL: [-0.185, 0.61], wrL: [-0.215, 0.465], handL: [-0.22, 0.39],
  neck: [0, 0.80], headTop: [0, 0.95], pelvis: [0, 0.50],
};
const mir = k => { const [x, y] = J[k]; return [-x, y]; };

function segDist(p, a, b) {
  const ab = b.clone().sub(a), t = THREE.MathUtils.clamp(p.clone().sub(a).dot(ab) / ab.lengthSq(), 0, 1);
  return p.distanceTo(a.clone().addScaledVector(ab, t));
}

export async function loadRiggedHuman(url) {
  const gltf = await new GLTFLoader().loadAsync(url);
  let src; gltf.scene.traverse(o => { if (o.isMesh && !src) src = o; });
  const geo = src.geometry.clone();
  // สีจุดยอดจาก trimesh เป็นค่า sRGB แต่ three อ่านเป็น linear → แปลงกลับ ไม่งั้นสีซีด
  const col = geo.attributes.color, c = new THREE.Color();
  if (col) for (let i = 0; i < col.count; i++) { c.fromBufferAttribute(col, i).convertSRGBToLinear(); col.setXYZ(i, c.r, c.g, c.b); }
  const V = (x, y, z = 0) => new THREE.Vector3(x, y, z);
  const P = k => V(...(J[k] || [0, 0]));
  const Pm = k => V(...mir(k));

  // ---- กระดูก (ตำแหน่ง local เทียบพ่อแม่) — ใช้ชื่อ/ลำดับเหมือนคนในฉาก
  const root = new THREE.Bone();
  const mkBone = (parent, pos) => { const b = new THREE.Bone(); b.position.copy(pos).multiplyScalar(SCALE); parent.add(b); return b; };
  const legL = mkBone(root, P('hipL')), legR = mkBone(root, Pm('hipL'));
  const kneeL = mkBone(legL, P('kneeL').sub(P('hipL'))), kneeR = mkBone(legR, Pm('kneeL').sub(Pm('hipL')));
  const armL = mkBone(root, P('shL')), armR = mkBone(root, Pm('shL'));
  const elbowL = mkBone(armL, P('elL').sub(P('shL'))), elbowR = mkBone(armR, Pm('elL').sub(Pm('shL')));
  const head = mkBone(root, P('neck'));
  const bones = [root, legL, legR, kneeL, kneeR, armL, armR, elbowL, elbowR, head];

  // ---- น้ำหนักผิว: ระยะถึงแกนกระดูก (1/d^4) + กฎแยกซ้าย/ขวา, หมวกตามหัว
  const segs = [ // [bone index, a, b]
    [0, P('pelvis'), P('neck')],
    [1, P('hipL'), P('kneeL')], [2, Pm('hipL'), Pm('kneeL')],
    [3, P('kneeL'), P('ankleL')], [4, Pm('kneeL'), Pm('ankleL')],
    [5, P('shL'), P('elL')], [6, Pm('shL'), Pm('elL')],
    [7, P('elL'), P('handL')], [8, Pm('elL'), Pm('handL')],
    [9, P('neck'), P('headTop')],
  ];
  const pos = geo.attributes.position, n = pos.count;
  const si = new Uint16Array(n * 4), sw = new Float32Array(n * 4), p = new THREE.Vector3();
  for (let i = 0; i < n; i++) {
    p.fromBufferAttribute(pos, i); p.z = 0; // ใช้มุมหน้า (x,y) เป็นหลัก — ตัวบาง แกนลึกไม่สำคัญ
    let cand = [];
    if (p.y > 0.81) cand = [[9, 1]]; // หัว + หมวก
    else {
      for (const [b, a, c] of segs) {
        if ((b === 1 || b === 3 || b === 5 || b === 7) && p.x > 0.01) continue; // ซ้ายอยู่ฝั่ง -x
        if ((b === 2 || b === 4 || b === 6 || b === 8) && p.x < -0.01) continue;
        if ((b <= 4 && b >= 1) && p.y > 0.56) continue; // ขาไม่ดึงลำตัวบน
        if ((b >= 5 && b <= 8) && p.y < 0.36) continue;
        const d = Math.max(segDist(p, a, c), 0.004);
        let w = 1 / d ** 4;
        if (b === 0 && p.y < 0.5) w *= Math.max(0, (p.y - 0.42) / 0.08) ** 2; // ใต้สะโพกเป็นของขา
        if (b === 9) w *= 0.3;
        cand.push([b, w]);
      }
      // แขนแยกจากลำตัว: ถ้าอยู่นอกแนวลำตัว (|x| > 0.13) และสูงระดับแขน ให้เป็นของแขนล้วน
      if (Math.abs(p.x) > 0.135 && p.y < 0.72 && p.y > 0.36) cand = cand.filter(([b]) => b >= 5 && b <= 8);
      cand.sort((a, b) => b[1] - a[1]); cand = cand.slice(0, 3);
    }
    const tot = cand.reduce((s, c) => s + c[1], 0) || 1;
    cand.forEach(([b, w], k) => { si[i * 4 + k] = b; sw[i * 4 + k] = w / tot; });
  }
  geo.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(si, 4));
  geo.setAttribute('skinWeight', new THREE.Float32BufferAttribute(sw, 4));
  geo.scale(SCALE, SCALE, SCALE);
  geo.computeVertexNormals();

  const mat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.8 });
  const mesh = new THREE.SkinnedMesh(geo, mat);
  mesh.add(root); mesh.bind(new THREE.Skeleton(bones));
  mesh.castShadow = true; mesh.frustumCulled = false;
  const group = new THREE.Group(); group.add(mesh);
  // โมเดลยืนกางแขน (A-pose) → ท่าทางชุดเดิมคิดจากแขนห้อยตรง: ให้โค้ดท่าทางหมุน "ตัวแทน" แล้วค่อยแปลงเป็นกระดูกจริง
  // กระดูก = การหมุนจากท่าทาง × การหุบแขนลง (ทำทุกครั้งก่อนคำนวณตำแหน่งในฉาก)
  const PULL = 0.2, fixL = new THREE.Quaternion().setFromAxisAngle(V(0, 0, 1), PULL), fixR = new THREE.Quaternion().setFromAxisAngle(V(0, 0, 1), -PULL);
  const proxyL = new THREE.Object3D(), proxyR = new THREE.Object3D();
  proxyL.rotation.z = -0.06; proxyR.rotation.z = 0.06;
  const upd = mesh.updateMatrixWorld;
  mesh.updateMatrixWorld = function (force) {
    armL.quaternion.copy(proxyL.quaternion).multiply(fixL); armR.quaternion.copy(proxyR.quaternion).multiply(fixR);
    upd.call(this, force);
  };
  return { group, legL, legR, armL: proxyL, armR: proxyR, head, kneeL, kneeR, elbowL, elbowR, phase: Math.random() * 6, mesh, bones: { armL, armR } };
}
