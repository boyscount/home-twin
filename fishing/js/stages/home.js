// ฉากบ้านตอนเย็น: บ้านใต้ถุนสูง ทุ่งนา เตาถ่านปิ้งปลา ครอบครัวรอกินข้าว
import * as THREE from 'three';
import { toon, shared } from '../toon.js';
import { rng, makeSky, makeLights, makeTerrain, placer, scatterGrass, makeMotes, shadowAll } from '../kit.js';

const groundH = (x, z) => (z < -9 ? -0.05 : 0.04 * Math.sin(x * 0.5) * Math.cos(z * 0.4));

export function build(scene, assets, opts) {
  const { mobile } = opts;
  const r = rng(2024);
  const T = shared.uTime;
  const world = { id: 'home', update: [], waterY: -10, colliders: [] };
  Object.assign(world, {
    groundH, standY: groundH, canCast: () => false, walkable: () => true, depthAt: () => 0,
    spawn: { x: 1.2, z: 3.4, yaw: Math.PI * 0.8 },
    camFocus: (px, pz) => [0.4, 0.8], camBounds: [-5, 5, -5, 5], ambience: { night: true },
  });
  makeSky(scene, world, { top: 0x4b5c94, bot: 0xffb27a, fogNear: 30, fogFar: 90 });
  makeLights(scene, world, { mobile, sun: [-30, 9, 6], target: [0, 0, 0], intensity: 1.5, hemi: 0.55, span: 16 });
  world.sun.color.set(0xffa766);
  world.hemi.color.set(0xffd2b0); world.hemi.groundColor.set(0x40406a);

  const cG = new THREE.Color(0x7aa14a), cField = new THREE.Color(0xb7b85a), cPath = new THREE.Color(0xc2a77a);
  const terrain = makeTerrain(scene, world, {
    size: 80, segs: 80, groundH,
    colorAt(x, z, h, c) {
      c.copy(cG);
      if (z < -9) c.copy(cField).lerp(cG, (Math.sin(x * 2.2) * 0.5 + 0.5) * 0.4);
      if (Math.abs(x - 3.2) < 0.7 && z > -3 && z < 8) c.lerp(cPath, 0.7);
    },
  });
  // ทุ่งนา: ต้นข้าวเป็นแถว
  {
    const g = new THREE.ConeGeometry(0.12, 0.6, 4).translate(0, 0.3, 0);
    const N = mobile ? 900 : 1800;
    const im = new THREE.InstancedMesh(g, toon(0xc9c25a), N);
    const m4 = new THREE.Matrix4();
    let k = 0;
    for (let x = -36; x < 36 && k < N; x += 0.9) for (let z = -11; z > -40 && k < N; z -= 0.9) { m4.makeTranslation(x + r.range(-0.1, 0.1), -0.05, z + r.range(-0.1, 0.1)); im.setMatrixAt(k++, m4); }
    im.count = k;
    scene.add(im);
  }
  const place = placer(scene, assets, groundH, world.colliders, r);
  place('House', -1.5, -4.5, 1, 0, 0);
  for (const [n, x, z, s] of [['Tree1', -8, -3, 1.2], ['Tree2', 6.5, -5, 1.1], ['Tree1', 9, 2, 1.0], ['Pine1', -10, 4, 1.0], ['Tree2', -7, 7, 0.9], ['Palm', 5, -7.5, 1.0]]) place(n, x, z, s);
  for (const [x, z] of [[-4.6, -1.2], [2.2, -2.2], [6, 4], [-6, 2.5]]) place('Bush', x, z, 0.8);

  // เตาถ่าน + ตะแกรง
  const grill = new THREE.Group();
  const pot = new THREE.Mesh(new THREE.CylinderGeometry(0.32, 0.24, 0.42, 12), toon(0xb5653f));
  pot.position.y = 0.21;
  const rim = new THREE.Mesh(new THREE.TorusGeometry(0.31, 0.03, 6, 16).rotateX(Math.PI / 2), toon(0x8a4a2e));
  rim.position.y = 0.42;
  const coal = new THREE.Mesh(new THREE.CircleGeometry(0.27, 12).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0xff6a2a }));
  coal.position.y = 0.4;
  const grate = new THREE.Mesh(new THREE.CircleGeometry(0.33, 16).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0x333333, wireframe: true }));
  grate.position.y = 0.46;
  grill.add(pot, rim, coal, grate);
  grill.position.set(2.0, 0, 1.0);
  scene.add(grill);
  world.grill = grill;
  const fire = new THREE.PointLight(0xff8a3a, 3, 7, 1.6);
  const lamps = [];
  fire.position.set(2.0, 0.9, 1.0);
  scene.add(fire);
  // ควัน
  {
    const N = 40;
    const geo = new THREE.BufferGeometry();
    const p = new Float32Array(N * 3), life = Array.from({ length: N }, (_, i) => i / N);
    geo.setAttribute('position', new THREE.BufferAttribute(p, 3));
    const smoke = new THREE.Points(geo, new THREE.PointsMaterial({ color: 0xdedede, size: 0.35, transparent: true, opacity: 0.35, depthWrite: false }));
    smoke.frustumCulled = false;
    scene.add(smoke);
    world.smoke = smoke;
    world.update.push(dt => {
      const t = T.value;
      fire.intensity = 2.6 + Math.sin(t * 13) * 0.4 + Math.sin(t * 7.3) * 0.3;
      coal.material.color.setHSL(0.05, 1, 0.5 + Math.sin(t * 9) * 0.06);
      for (let i = 0; i < N; i++) {
        life[i] += dt * 0.25;
        if (life[i] > 1) life[i] -= 1;
        const l = life[i];
        p.set([2.0 + Math.sin(i * 3 + t * 0.8) * 0.15 * (1 + l * 2) + l * 0.8, 0.5 + l * 3.0, 1.0 + Math.cos(i * 2.1) * 0.12 * (1 + l * 2)], i * 3);
      }
      geo.attributes.position.needsUpdate = true;
    });
  }
  // เสื่อ + สำรับข้าว
  const mat = new THREE.Mesh(new THREE.BoxGeometry(2.0, 0.03, 1.4), toon(0xd8bd7a));
  mat.position.set(-0.6, 0.02, 1.4);
  scene.add(mat);
  for (const [x, z, col] of [[-0.9, 1.3, 0xffffff], [-0.3, 1.5, 0xffffff], [-0.6, 1.0, 0x7fbf5a]]) {
    const b = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.08, 0.08, 10), toon(col));
    b.position.set(x, 0.07, z);
    scene.add(b);
  }
  // โคมไฟ
  for (const [x, y, z] of [[-3.6, 2.6, -2.2], [0.6, 2.6, -2.2], [3.0, 1.9, 2.6]]) {
    const l = new THREE.Mesh(new THREE.SphereGeometry(0.14, 8, 6), new THREE.MeshBasicMaterial({ color: 0xffd27a }));
    l.position.set(x, y, z);
    scene.add(l);
    const pl = new THREE.PointLight(0xffc56a, 1.2, 5, 2);
    pl.position.copy(l.position);
    scene.add(pl);
    lamps.push(pl);
  }

  // ครอบครัว: แม่ ลูก (โคลนตัวละครหลัก แล้วเปลี่ยนสี)
  const family = [];
  const mk = (shirt, scale, hat, pos, ry) => {
    const g = assets.clone('Fisher');
    const sm = toon(shirt);
    g.traverse(o => {
      if (!o.isMesh) return;
      if (o.material.name === 'Shirt') o.material = sm;
      o.castShadow = true;
    });
    const rod = g.getObjectByName('Rod'); if (rod) rod.visible = false;
    const h = g.getObjectByName('Hat'); if (h) h.visible = hat;
    g.scale.setScalar(scale);
    g.position.set(...pos);
    g.rotation.y = ry;
    scene.add(g);
    const f = { g, armL: g.getObjectByName('ArmL'), armR: g.getObjectByName('ArmR'), head: g.getObjectByName('Head'), ph: Math.random() * 6 };
    family.push(f);
    return f;
  };
  const mom = mk(0xc0567a, 0.95, false, [2.8, 0, 1.6], -2.2);
  const bun = new THREE.Mesh(new THREE.SphereGeometry(0.11, 8, 6), toon(0x2c231e));
  bun.position.set(0, 0.12, 0.14);
  mom.head.add(bun);
  const kid = mk(0xf2b632, 0.62, false, [-0.9, 0, 1.9], 2.6);
  const kid2 = mk(0x5fae6e, 0.55, false, [-0.2, 0, 2.0], -2.9);
  world.family = family;
  // เช้า (หน้าแผนที่) / เย็น (มื้อเย็น)
  const sky = world.sky.material.uniforms;
  world.setNight = () => {
    world.setMorning(false);
    sky.top.value.set(0x1a2768); sky.bot.value.set(0x51569a); sky.uNight.value = 1;
    scene.fog.color.copy(sky.bot.value);
    world.sun.color.set(0xa8b8ff); world.sun.intensity = 0.45; world.sun.position.set(12, 22, -18);
    world.hemi.color.set(0x6070b0); world.hemi.intensity = 0.3;
  };
  world.setMorning = on => {
    sky.uNight.value = 0;
    sky.top.value.set(on ? 0x7cc4f0 : 0x4b5c94); sky.bot.value.set(on ? 0xfde9c8 : 0xffb27a);
    scene.fog.color.copy(sky.bot.value);
    world.sun.color.set(on ? 0xfff0d0 : 0xffa766); world.sun.intensity = on ? 2.0 : 1.5;
    world.sun.position.set(on ? 20 : -30, on ? 16 : 9, on ? 10 : 6);
    world.hemi.color.set(on ? 0xe6f4ff : 0xffd2b0); world.hemi.intensity = on ? 0.85 : 0.55;
    for (const l of lamps) l.visible = !on;
    fire.visible = !on; world.smoke.visible = !on;
  };
  world.cheer = 0;
  world.update.push(() => {
    const t = T.value;
    for (const f of family) {
      const c = world.cheer > 0 ? 1 : 0;
      f.armL.rotation.x = c ? -2.6 + Math.sin(t * 10 + f.ph) * 0.4 : Math.sin(t * 1.2 + f.ph) * 0.1;
      f.armR.rotation.x = c ? -2.6 + Math.cos(t * 10 + f.ph) * 0.4 : f === mom ? -0.9 + Math.sin(t * 3) * 0.3 : -Math.sin(t * 1.2 + f.ph) * 0.1;
      f.g.position.y = c ? Math.abs(Math.sin(t * 8 + f.ph)) * 0.12 : 0;
      f.head.rotation.y = Math.sin(t * 0.6 + f.ph) * 0.3;
    }
  });

  // วางปลาบนเตา
  const onGrill = [];
  world.grillFish = (meshes) => {
    for (const m of onGrill) scene.remove(m);
    onGrill.length = 0;
    meshes.slice(0, 4).forEach((m, i) => {
      m.scale.multiplyScalar(0.5);
      m.position.set(2.0 + (i % 2 - 0.5) * 0.25, 0.5, 1.0 + (Math.floor(i / 2) - 0.5) * 0.2);
      m.rotation.set(Math.PI / 2, 0, 0.3);
      scene.add(m);
      onGrill.push(m);
    });
  };

  const ok = (x, z) => (z < -9 || (x > -4.5 && x < 2 && z > -7 && z < -2) || (Math.abs(x + 0.6) < 1.2 && Math.abs(z - 1.4) < 0.9) ? null : groundH(x, z));
  scatterGrass(scene, { ok, count: mobile ? 3000 : 6000, area: [-18, 18, -9, 14], r, root: 0x4f7a32, tip: 0xb7c46a });
  makeMotes(scene, world, { count: 60, area: [-10, 10, -10, 8], r, color: 0xe6ff8a, size: 0.1, glow: true, y: [0.3, 3] });
  shadowAll(scene, terrain);
  return world;
}
