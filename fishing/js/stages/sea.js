// ด่าน 4: ออกทะเลด้วยเรือหางยาว — ยืนตกปลาบนเรือที่โคลงเบา ๆ เขาหินปูนไกล ๆ นกนางนวลบินวนเหนือฝูงปลา
import * as THREE from 'three';
import { toon, shared } from '../toon.js';
import { rng, makeSky, makeLights, makeWater, makeFlyers, makeMotes, shadowAll } from '../kit.js';

const WATER_Y = 0;
const DECK = 0.1;

export function build(scene, assets, opts) {
  const { mobile } = opts;
  const r = rng(99);
  const T = shared.uTime;
  const world = { id: 'sea', update: [], waterY: WATER_Y, colliders: [] };
  const boatArea = (x, z) => Math.abs(x) < 4.3 && Math.abs(z) < 0.95;
  const bob = () => Math.sin(T.value * 0.9) * 0.07;
  Object.assign(world, {
    groundH: () => -18,
    standY: () => DECK + bob(),
    canCast: (x, z) => !boatArea(x, z),
    onSolid: boatArea,
    depthAt: () => 12,
    walkable: (x, z) => x > -2.9 && x < 2.3 && Math.abs(z) < 0.42,
    spawn: { x: 0.2, z: -0.1, yaw: Math.PI },
    camFocus: (px, pz) => [px * 0.5, pz * 0.4 - 2.5],
    camBounds: [-5, 5, -6, 3],
    camK: 1.05,
    camH: 0.55,
    camp: { x: -1.2, z: 0.05, ry: Math.PI / 2, y: 0.07, small: true },
    ambience: { sea: true },
    special: new THREE.Vector3(7, WATER_Y, -9),
    specialR: 3.2,
  });

  makeSky(scene, world, { top: 0x4fb0ef, bot: 0xdcf1f8, fogNear: 55, fogFar: 230 });
  makeLights(scene, world, { mobile, sun: [-16, 26, 12], target: [0, 0, -2], intensity: 2.3, hemi: 0.95, span: 14 });
  world.hemi.groundColor.set(0x2f7f9a);
  makeWater(scene, world, { cx: 0, cz: -40, size: 320, segs: mobile ? 120 : 180, groundH: () => -18, waterY: WATER_Y, shallow: 0x3fb8cf, deep: 0x2a8fbf, depthScale: 4, waves: 0.07, alphaMin: 0.9, alphaMax: 0.97, glint: 1, flow: [0.08, 0.05] });

  // เรือ
  const boat = assets.clone('Boat');
  boat.traverse(o => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
  scene.add(boat);
  world.boat = boat;
  world.campParent = boat;
  // คลื่นรอบลำเรือ
  const ringMat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.5, depthWrite: false });
  const wake = new THREE.Mesh(new THREE.RingGeometry(1, 1.15, 40).rotateX(-Math.PI / 2), ringMat);
  wake.scale.set(4.4, 1, 1.0);
  wake.position.y = WATER_Y + 0.02;
  scene.add(wake);
  world.update.push(() => {
    const t = T.value;
    boat.position.y = WATER_Y + bob();
    boat.rotation.x = Math.sin(t * 0.7) * 0.035;
    boat.rotation.z = Math.sin(t * 0.5 + 1) * 0.02;
    ringMat.opacity = 0.35 + Math.sin(t * 1.3) * 0.15;
    wake.scale.set(4.4 + Math.sin(t * 1.3) * 0.1, 1, 1.0 + Math.sin(t * 1.3) * 0.08);
  });

  // เขาหินปูนกลางทะเล
  for (const [x, z, s, ry] of [[-34, -58, 1.6, 0.3], [-20, -80, 2.2, 1.2], [28, -70, 1.9, 2.1], [55, -45, 1.4, 0.7], [-62, -35, 1.3, 2.5], [10, -110, 2.6, 0.2], [70, -90, 2.0, 1.6], [-80, -85, 2.4, 3.0], [40, 30, 1.6, 0.9], [-45, 25, 1.4, 2.0]]) {
    const k = assets.clone('Karst');
    k.position.set(x, -1, z);
    k.scale.setScalar(s);
    k.rotation.y = ry;
    scene.add(k);
  }
  // ทุ่นจับปลาลอยน้ำ
  const buoy = new THREE.Group();
  const b1 = new THREE.Mesh(new THREE.SphereGeometry(0.35, 10, 8), toon(0xff7a2f));
  const b2 = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 1.2, 5), toon(0x333333));
  b2.position.y = 0.6;
  const flag = new THREE.Mesh(new THREE.PlaneGeometry(0.4, 0.25), toon(0xffd23f, { side: THREE.DoubleSide }));
  flag.position.set(0.2, 1.05, 0);
  buoy.add(b1, b2, flag);
  buoy.position.set(-9, 0, -7);
  scene.add(buoy);
  world.update.push(() => { const t = T.value; buoy.position.y = Math.sin(t * 1.1 + 2) * 0.1; buoy.rotation.z = Math.sin(t * 0.9) * 0.12; flag.rotation.y = Math.sin(t * 3) * 0.3; });

  // นกนางนวลบินวนเหนือฝูงปลา (จุดปลาชุม)
  makeFlyers(scene, world, { colors: [0xffffff, 0xffffff, 0xf2f2f2, 0xffffff], r, groundH: () => 3.5, area: [6, 8, -10, -8], height: 0, radius: 2.6, speed: 0.5, wing: [0.55, 0.2], flap: 6 });
  makeFlyers(scene, world, { colors: [0xffffff, 0xffffff], r, groundH: () => 9, area: [-15, 15, -25, -5], height: 0, radius: 12, speed: 0.12, wing: [0.6, 0.22], flap: 4 });
  // ฝูงปลากระโดด
  {
    const N = 6;
    const g = new THREE.ConeGeometry(0.07, 0.35, 5).rotateZ(-Math.PI / 2);
    const m = toon(0xc8d6e0);
    const jumps = Array.from({ length: N }, () => { const f = new THREE.Mesh(g, m); f.visible = false; scene.add(f); return { f, t0: r() * 6, dur: 0.8 }; });
    world.update.push(() => {
      const t = T.value, S = world.special;
      for (const j of jumps) {
        let k = (t - j.t0) / j.dur;
        if (k > 1 + Math.random() * 6) { j.t0 = t; j.x = S.x + (Math.random() - 0.5) * 4; j.z = S.z + (Math.random() - 0.5) * 3; j.a = Math.random() * 6.28; k = 0; if (world.addRipple) world.addRipple(j.x, j.z, 0.6); }
        if (k >= 0 && k <= 1 && j.x !== undefined) {
          j.f.visible = true;
          j.f.position.set(j.x + Math.cos(j.a) * k * 0.8, Math.sin(k * Math.PI) * 0.6, j.z + Math.sin(j.a) * k * 0.8);
          j.f.rotation.set(0, -j.a, Math.cos(k * Math.PI) * 0.9);
        } else j.f.visible = false;
      }
    });
  }
  makeMotes(scene, world, { count: 30, area: [-10, 10, -10, 5], r, color: 0xffffff, size: 0.05, y: [0.5, 3] });

  shadowAll(scene, null);
  return world;
}
