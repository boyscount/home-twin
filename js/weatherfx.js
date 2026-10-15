// เอฟเฟกต์สภาพอากาศในฉาก 3D: ฝน, เมฆ, หมอก, ฟ้าแลบ/ฟ้าผ่า (ส่งเหตุการณ์ 'lightning' ให้เสียงฟ้าร้องและเรดาร์)
import * as THREE from 'three';
import { bus } from './bus.js';

const rand = (a, b) => a + Math.random() * (b - a);
const lerp = (a, b, t) => a + (b - a) * t;

export const PRESETS = {
  clear: { clouds: 0.05, rain: 0, storm: false, wind: 1.5, label: 'แจ่มใส' },
  cloudy: { clouds: 0.8, rain: 0, storm: false, wind: 3, label: 'เมฆครึ้ม' },
  rain: { clouds: 0.9, rain: 0.6, storm: false, wind: 4, label: 'ฝนตก' },
  storm: { clouds: 1, rain: 1, storm: true, wind: 9, label: 'พายุฝนฟ้าคะนอง' },
};

export class WeatherFX {
  constructor(farm) {
    this.farm = farm;
    this.target = { ...PRESETS.clear, windDir: 80, fog: 0 };
    this.cur = { clouds: 0.05, rain: 0, wind: 1.5, fog: 0 };
    this.nextStrike = 4;
    this.flash = 0;
    this.buildRain();
    this.buildClouds();
    this.flashLight = new THREE.DirectionalLight('#dfe8ff', 0);
    this.flashLight.position.set(0, 200, 0);
    farm.scene.add(this.flashLight);
  }

  // รับค่าแบบ 0..1 — เปลี่ยนแบบค่อย ๆ เฟด
  set(w) { Object.assign(this.target, w); }

  buildRain() {
    this.N = 8000;
    const pos = new Float32Array(this.N * 6);
    this.drops = new Float32Array(this.N * 3);
    for (let i = 0; i < this.N; i++) { this.drops[i * 3] = rand(-50, 50); this.drops[i * 3 + 1] = rand(0, 40); this.drops[i * 3 + 2] = rand(-50, 50); }
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    const top = new Float32Array(this.N * 2); for (let i = 0; i < this.N; i++) top[i * 2 + 1] = 1;
    g.setAttribute('top', new THREE.BufferAttribute(top, 1));
    // เม็ดฝนสว่างตามแสงรอบตัว: กลางวันเป็นเส้นเทาอ่อน กลางคืนแทบมองไม่เห็น ยกเว้นตอนผ่านแสงไฟ → ระยิบระยับรอบโคมไฟ
    const NL = 16;
    this.rainU = {
      lp: { value: Array.from({ length: NL }, () => new THREE.Vector3(0, -999, 0)) },
      lc: { value: Array.from({ length: NL }, () => new THREE.Color(0, 0, 0)) },
      ambient: { value: 1 }, opacity: { value: 0.5 }, flash: { value: 0 },
    };
    const mat = new THREE.ShaderMaterial({
      uniforms: this.rainU, transparent: true, depthWrite: false, fog: false,
      vertexShader: `attribute float top; varying vec3 vW; varying float vTop;
        void main() { vTop = top; vec4 w = modelMatrix * vec4(position, 1.0); vW = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }`,
      fragmentShader: `uniform vec3 lp[${NL}]; uniform vec3 lc[${NL}]; uniform float ambient, opacity, flash; varying vec3 vW; varying float vTop;
        void main() {
          vec3 col = vec3(0.62, 0.7, 0.82) * ambient;
          float glow = 0.0;
          for (int i = 0; i < ${NL}; i++) { vec3 d = lp[i] - vW; float k = 5.0 / (1.0 + dot(d, d) * 0.45); col += lc[i] * k; glow += k * (lc[i].r + lc[i].g + lc[i].b); }
          col += flash * vec3(0.8, 0.85, 1.0);
          float a = opacity * mix(0.15, 1.0, vTop) * clamp(ambient * 1.2 + glow * 0.35 + flash, 0.0, 1.0);
          gl_FragColor = vec4(col, a);
          #include <tonemapping_fragment>
          #include <colorspace_fragment>
        }`,
    });
    this.rain = new THREE.LineSegments(g, mat);
    this.rain.frustumCulled = false; this.rain.visible = false;
    this.farm.scene.add(this.rain);
    this.buildWet();
  }

  // พื้นเปียก: แสงไฟสะท้อนเป็นวงบนพื้น + ระลอกน้ำในบ่อ + ละอองกระเด็นบนพื้น
  buildWet() {
    const f = this.farm, s = f.scene;
    s.updateMatrixWorld(true); // ให้ getWorldPosition ของไฟที่อยู่ในกลุ่ม (เช่น ไฟระเบียง) ถูกต้อง
    this.wet = 0;
    const c = document.createElement('canvas'); c.width = c.height = 128;
    const ctx = c.getContext('2d'), g = ctx.createRadialGradient(64, 64, 0, 64, 64, 64);
    g.addColorStop(0, 'rgba(255,255,255,1)'); g.addColorStop(0.35, 'rgba(255,255,255,.45)'); g.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = g; ctx.fillRect(0, 0, 128, 128);
    const tex = new THREE.CanvasTexture(c);
    this.pools = f.nightLights.map(n => {
      const p = new THREE.Vector3(); n.l.getWorldPosition(p);
      const m = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial({ map: tex, color: n.l.color, transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending, fog: false }));
      m.rotation.x = -Math.PI / 2; m.position.set(p.x, 0.07, p.z); m.scale.setScalar(Math.min(9, n.l.distance * 0.55)); m.renderOrder = 2;
      s.add(m); return { m, n };
    });
    // ระลอกฝนในบ่อปลา
    const ringGeo = new THREE.RingGeometry(0.8, 1, 24); ringGeo.rotateX(-Math.PI / 2);
    this.ripples = Array.from({ length: 28 }, () => {
      const m = new THREE.Mesh(ringGeo, new THREE.MeshBasicMaterial({ color: '#cfe6ff', transparent: true, opacity: 0, depthWrite: false }));
      f.pond.add(m); m.position.y = -0.1; return { m, life: Math.random(), on: false };
    });
    // ละอองฝนกระเด็นบนพื้นรอบจุดที่กล้องมอง
    const N = 400, pos = new Float32Array(N * 3), sg = new THREE.BufferGeometry();
    sg.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    this.splash = new THREE.Points(sg, new THREE.PointsMaterial({ color: '#dbe8f5', size: 0.09, transparent: true, opacity: 0.6, depthWrite: false }));
    this.splash.frustumCulled = false; this.splash.visible = false; s.add(this.splash);
  }

  updateWet(dt, rain, ambient) {
    const f = this.farm;
    this.wet += ((rain > 0.05 ? 1 : 0) - this.wet) * Math.min(1, dt * (rain > 0.05 ? 0.5 : 0.03)); // เปียกเร็ว แห้งช้า
    const night = f.nightFactor || 0;
    for (const p of this.pools) p.m.material.opacity = this.wet * Math.min(1, p.n.l.intensity / p.n.max) * 0.55 * (0.4 + night * 0.6);
    for (const r of this.ripples) {
      r.life += dt * 1.6;
      if (r.life > 1) { r.life = 0; r.on = Math.random() < rain * 1.2; const a = rand(0, Math.PI * 2), d = Math.sqrt(Math.random()) * 4.2; r.m.position.set(Math.cos(a) * d, -0.1, Math.sin(a) * d); }
      r.m.visible = r.on; if (!r.on) continue;
      r.m.scale.setScalar(0.05 + r.life * 0.45); r.m.material.opacity = (1 - r.life) * 0.7 * Math.max(0.25, ambient);
    }
    this.splash.visible = rain > 0.15;
    if (this.splash.visible) {
      const pos = this.splash.geometry.attributes.position, t = f.controls.target;
      const n = Math.floor(400 * rain);
      for (let i = 0; i < 400; i++) {
        if (i < n && Math.random() < 0.35) pos.setXYZ(i, t.x + rand(-18, 18), 0.06 + Math.random() * 0.08, t.z + rand(-18, 18));
        else if (i >= n) pos.setXYZ(i, 0, -50, 0);
      }
      pos.needsUpdate = true;
      this.splash.material.opacity = 0.15 + ambient * 0.5;
    }
  }

  buildClouds() {
    const c = document.createElement('canvas'); c.width = c.height = 512;
    const ctx = c.getContext('2d');
    for (let i = 0; i < 260; i++) {
      const x = rand(0, 512), y = rand(0, 512), r = rand(20, 80);
      const g = ctx.createRadialGradient(x, y, 0, x, y, r);
      g.addColorStop(0, `rgba(255,255,255,${rand(0.15, 0.35)})`); g.addColorStop(1, 'rgba(255,255,255,0)');
      ctx.fillStyle = g;
      for (const [dx, dy] of [[0, 0], [512, 0], [-512, 0], [0, 512], [0, -512]]) { ctx.save(); ctx.translate(dx, dy); ctx.fillRect(x - r, y - r, r * 2, r * 2); ctx.restore(); }
    }
    const tex = new THREE.CanvasTexture(c); tex.wrapS = tex.wrapT = THREE.RepeatWrapping; tex.repeat.set(3, 3);
    this.cloudMat = new THREE.MeshBasicMaterial({ map: tex, transparent: true, opacity: 0, depthWrite: false, fog: false, color: '#ffffff' });
    const m = new THREE.Mesh(new THREE.PlaneGeometry(2400, 2400), this.cloudMat);
    m.rotation.x = Math.PI / 2; m.position.y = 160; m.renderOrder = -1; m.visible = false; // เมฆย้ายไปอยู่ใน SkyDome แล้ว
    this.farm.scene.add(m); this.cloud = m;
    // ชั้นเมฆที่สอง ให้ดูมีความลึก
    this.cloudMat2 = this.cloudMat.clone(); this.cloudMat2.map = tex.clone(); this.cloudMat2.map.repeat.set(2, 2);
    const m2 = new THREE.Mesh(m.geometry, this.cloudMat2); m2.rotation.x = Math.PI / 2; m2.position.y = 220; m2.renderOrder = -2; m2.visible = false;
    this.farm.scene.add(m2);
  }

  strike() {
    const f = this.farm;
    const a = rand(0, Math.PI * 2), d = Math.random() < 0.12 ? rand(40, 90) : rand(120, 600);
    const x = Math.cos(a) * d, z = Math.sin(a) * d;
    // สายฟ้าแบบหยัก + กิ่ง
    const group = new THREE.Group();
    const mat = new THREE.MeshBasicMaterial({ color: '#f4f7ff', fog: false, toneMapped: false, transparent: true });
    const bolt = (x0, y0, z0, x1, y1, z1, segs, r) => {
      const pts = [];
      for (let i = 0; i <= segs; i++) {
        const t = i / segs, j = i === 0 || i === segs ? 0 : (y0 - y1) * 0.06;
        pts.push(new THREE.Vector3(lerp(x0, x1, t) + rand(-j, j), lerp(y0, y1, t), lerp(z0, z1, t) + rand(-j, j)));
      }
      group.add(new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts, false, 'catmullrom', 0), segs * 2, r, 4), mat));
      return pts;
    };
    const main = bolt(x + rand(-30, 30), 160, z + rand(-30, 30), x, 0, z, 18, Math.max(0.25, d / 500));
    for (let b = 0; b < 3; b++) {
      const p = main[Math.floor(rand(3, 12))];
      bolt(p.x, p.y, p.z, p.x + rand(-40, 40), p.y - rand(30, 70), p.z + rand(-40, 40), 8, Math.max(0.12, d / 1100));
    }
    f.scene.add(group);
    this.flash = 1; this.flashPos = new THREE.Vector3(x, 150, z);
    this.flashLight.position.set(x, 150, z);
    let life = 0.45;
    const fade = () => {
      life -= 0.016; mat.opacity = life > 0.3 ? 1 : Math.max(0, life / 0.3) * (Math.random() > 0.3 ? 1 : 0.2);
      if (life > 0) requestAnimationFrame(fade);
      else { f.scene.remove(group); group.traverse(o => o.geometry?.dispose()); mat.dispose(); }
    };
    fade();
    bus.emit('lightning', { x, z, distance: Math.hypot(x, z - 5) });
  }

  update(dt, t) {
    const c = this.cur, tg = this.target, k = Math.min(1, dt * 0.6);
    const before = c.clouds + c.rain * 2 + c.fog;
    c.clouds = lerp(c.clouds, tg.clouds, k); c.rain = lerp(c.rain, tg.rain, k);
    c.wind = lerp(c.wind, tg.wind, k); c.fog = lerp(c.fog, tg.fog || 0, k);
    const f = this.farm;
    // แจ้ง farm ให้ปรับแสงเมื่อค่าเปลี่ยนพอสมควร
    if (Math.abs(before - (this._applied ?? -1)) > 0.02) { this._applied = before; f.applyWeather(c); }

    // ฝน
    const n = Math.floor(this.N * Math.min(1, c.rain));
    this.rain.visible = n > 20;
    if (this.rain.visible) {
      const center = f.controls.target, dist = f.camera.position.distanceTo(center);
      const spread = Math.min(1.6, Math.max(0.5, dist / 60));
      const pos = this.rain.geometry.attributes.position.array, d = this.drops;
      const wdir = (tg.windDir || 0) * Math.PI / 180;
      const wx = -Math.sin(wdir) * c.wind * 0.6, wz = Math.cos(wdir) * c.wind * 0.6;
      const speed = 24, len = 0.045;
      for (let i = 0; i < n; i++) {
        d[i * 3 + 1] -= speed * dt; d[i * 3] += wx * dt; d[i * 3 + 2] += wz * dt;
        if (d[i * 3 + 1] < 0) { d[i * 3 + 1] += 40; d[i * 3] = rand(-50, 50); d[i * 3 + 2] = rand(-50, 50); }
        if (d[i * 3] > 50) d[i * 3] -= 100; else if (d[i * 3] < -50) d[i * 3] += 100;
        if (d[i * 3 + 2] > 50) d[i * 3 + 2] -= 100; else if (d[i * 3 + 2] < -50) d[i * 3 + 2] += 100;
        const x = center.x + d[i * 3] * spread, y = d[i * 3 + 1], z = center.z + d[i * 3 + 2] * spread, o = i * 6;
        pos[o] = x; pos[o + 1] = y; pos[o + 2] = z;
        pos[o + 3] = x - wx * len; pos[o + 4] = y + speed * len; pos[o + 5] = z - wz * len;
      }
      this.rain.geometry.setDrawRange(0, n * 2);
      this.rain.geometry.attributes.position.needsUpdate = true;
      // แสงรอบเม็ดฝน: ไฟที่เปิดอยู่ใกล้ ๆ
      const u = this.rainU, lights = f.nightLights;
      for (let i = 0; i < u.lp.value.length; i++) {
        const n = lights[i];
        if (n && n.l.intensity > 0) { n.l.getWorldPosition(u.lp.value[i]); u.lc.value[i].copy(n.l.color).multiplyScalar(Math.min(1.2, n.l.intensity / n.max)); }
        else u.lc.value[i].setRGB(0, 0, 0);
      }
      u.opacity.value = 0.3 + 0.4 * c.rain;
    }
    const ambient = Math.max(0.04, 1 - (f.nightFactor || 0)) * (1 - 0.35 * c.clouds);
    this.rainU.ambient.value = ambient;
    this.rainU.flash.value = Math.max(0, this.flash) * 1.5;
    this.updateWet(dt, c.rain, ambient);

    // เมฆ
    const dayLight = 1 - (f.nightFactor || 0);
    const shade = lerp(1, 0.45, Math.min(1, c.rain + (tg.storm ? 0.4 : 0))) * lerp(0.12, 1, dayLight);
    this.cloudMat.opacity = Math.min(0.95, c.clouds * 1.05);
    this.cloudMat2.opacity = Math.min(0.85, c.clouds * 0.9);
    this.cloudMat.map.offset.x += dt * 0.0015 * c.wind; this.cloudMat2.map.offset.y += dt * 0.001 * c.wind;

    // ส่งค่าเมฆไปที่ท้องฟ้า shader
    if (f.skyDome) { f.skyDome.u.cover.value = c.clouds; f.skyDome.u.dark.value = Math.min(1, c.rain * 0.8 + (tg.storm ? 0.35 : 0)); }

    // ฟ้าแลบ
    if (tg.storm) {
      this.nextStrike -= dt;
      if (this.nextStrike < 0) { this.strike(); this.nextStrike = rand(4, 14); }
    }
    if (this.flash > 0) {
      this.flash -= dt * 2.5;
      const flick = this.flash > 0 ? (Math.sin(this.flash * 40) > -0.2 ? this.flash : this.flash * 0.2) : 0;
      this.flashLight.intensity = flick * 9;
      const lum = shade + flick * 1.5;
      this.cloudMat.color.setScalar(Math.min(2, lum)); this.cloudMat2.color.setScalar(Math.min(2, lum * 0.9));
      f.flashSky?.(flick);
      this.flashing = true;
    } else {
      if (this.flashing) { this.flashing = false; f.flashSky?.(0); }
      this.flashLight.intensity = 0;
      this.cloudMat.color.setScalar(shade); this.cloudMat2.color.setScalar(shade * 0.9);
    }
  }
}
