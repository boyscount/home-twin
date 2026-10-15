// ท้องฟ้าแบบ shader: ไล่สีฟ้า + ดวงอาทิตย์ + เมฆ fBm ที่รับแสงจริง (ขอบส้มยามเย็น ท้องเมฆเทา) + ดาว + พระจันทร์
// สีขอบฟ้าใช้สีเดียวกับหมอก ภาพจึงกลืนกันไม่เห็นรอยต่อ · ความครึ้ม/ฝน/ฟ้าแลบ มาจาก WeatherFX
import * as THREE from 'three';

const vert = /* glsl */`
varying vec3 vDir;
void main() {
  vDir = normalize((modelMatrix * vec4(position, 1.0)).xyz - cameraPosition);
  vec4 p = projectionMatrix * viewMatrix * modelMatrix * vec4(position, 1.0);
  gl_Position = p.xyww; // อยู่ไกลสุดเสมอ
}`;

const frag = /* glsl */`
uniform vec3 sunDir, moonDir, zenith, horizon, sunColor;
uniform float time, cover, dark, night, flash, day, warm;
varying vec3 vDir;

float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float hash3(vec3 p) { return fract(sin(dot(p, vec3(127.1, 311.7, 74.7))) * 43758.5453); }
float noise(vec2 p) {
  vec2 i = floor(p), f = fract(p); vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i), hash(i + vec2(1, 0)), u.x), mix(hash(i + vec2(0, 1)), hash(i + vec2(1, 1)), u.x), u.y);
}
float fbm3(vec2 p) {
  float v = 0.0, a = 0.5;
  for (int i = 0; i < 3; i++) { v += a * noise(p); p = p * 2.03 + vec2(1.7, 9.2); a *= 0.5; }
  return v;
}
float fbm(vec2 p) {
  float v = 0.0, a = 0.5;
  for (int i = 0; i < 5; i++) { v += a * noise(p); p = p * 2.03 + vec2(1.7, 9.2); a *= 0.5; }
  return v;
}

void main() {
  vec3 d = normalize(vDir);
  float h = clamp(d.y, 0.0, 1.0);
  vec3 col = mix(horizon, zenith, pow(h, 0.38));

  // ดวงอาทิตย์ + แสงฟุ้งรอบดวง
  float sd = max(dot(d, sunDir), 0.0);
  float sunUp = smoothstep(-0.06, 0.04, sunDir.y);
  col += sunColor * (pow(sd, 1400.0) * 30.0 * (1.0 - cover) + pow(sd, 16.0) * 0.45 + pow(sd, 3.0) * 0.18 * warm) * sunUp;

  // ดาว (กระพริบ) และพระจันทร์
  if (night > 0.01 && d.y > 0.0) {
    vec3 cell = floor(d * 420.0);
    float s = hash3(cell);
    float tw = 0.6 + 0.4 * sin(time * 2.0 + s * 60.0);
    col += vec3(0.85, 0.9, 1.0) * step(0.9975, s) * tw * night * (1.0 - cover) * smoothstep(0.0, 0.2, d.y) * 1.6;
  }
  float md = dot(d, moonDir);
  col += vec3(1.0, 0.97, 0.9) * smoothstep(0.99955, 0.99975, md) * night * (1.0 - cover * 0.9) * 2.5;
  col += vec3(0.5, 0.6, 0.8) * pow(max(md, 0.0), 300.0) * night * (1.0 - cover) * 0.4;

  // เมฆ: ฉายลงระนาบเหนือหัว แล้วใช้ fBm 2 ชั้น
  if (d.y > -0.02) {
    vec2 uv = d.xz / (d.y + 0.08) * 0.9;
    vec2 wind = vec2(time * 0.006, time * 0.0025);
    float n = fbm(uv + wind) * 0.75 + fbm3(uv * 2.6 - wind * 1.7) * 0.25;
    float thr = mix(0.6, 0.18, cover); // ฟ้าใสก็ยังมีเมฆก้อนเล็ก ๆ ลอยอยู่
    float c = smoothstep(thr, thr + mix(0.22, 0.4, cover), n);
    // แสงบนเมฆ: เทียบความหนากับจุดที่เลื่อนไปทางดวงอาทิตย์ → ด้านรับแสงสว่าง ด้านในมืด
    float n2 = fbm3(uv + wind + sunDir.xz * 0.06);
    float lit = clamp(0.6 + (n - n2) * 3.0, 0.15, 1.0);
    vec3 base = mix(vec3(0.42, 0.45, 0.5), vec3(1.0), lit);
    base = mix(base, base * sunColor * vec3(1.35, 1.0, 0.8), warm * sunUp * (0.5 + sd * 0.8));
    base *= mix(0.06, 1.0, day) * (1.0 - dark * 0.65);
    base += flash * vec3(0.9, 0.95, 1.2);
    float fade = smoothstep(-0.02, 0.2, d.y);
    col = mix(col, base, c * fade * 0.96);
    // ฟ้าครึ้มมาก: ชั้นเมฆบาง ๆ ปิดทั้งฟ้า
    vec3 overcast = mix(vec3(0.5, 0.53, 0.58), vec3(0.85), lit * 0.5) * mix(0.05, 0.9, day) * (1.0 - dark * 0.6) + flash * 0.8;
    col = mix(col, overcast, smoothstep(0.55, 1.0, cover) * 0.75 * fade);
  }
  // ขอบฟ้ากลืนเข้ากับหมอก
  col = mix(col, horizon, 1.0 - smoothstep(-0.02, 0.22, d.y));
  gl_FragColor = vec4(col, 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}`;

export class SkyDome {
  constructor() {
    this.u = {
      sunDir: { value: new THREE.Vector3(0, 1, 0) }, moonDir: { value: new THREE.Vector3(0, 1, 0) },
      zenith: { value: new THREE.Color() }, horizon: { value: new THREE.Color() }, sunColor: { value: new THREE.Color(1, 0.95, 0.85) },
      time: { value: 0 }, cover: { value: 0.2 }, dark: { value: 0 }, night: { value: 0 }, flash: { value: 0 }, day: { value: 1 }, warm: { value: 0 },
    };
    this.material = new THREE.ShaderMaterial({ uniforms: this.u, vertexShader: vert, fragmentShader: frag, side: THREE.BackSide, depthWrite: false, fog: false });
    this.mesh = new THREE.Mesh(new THREE.SphereGeometry(1, 48, 24), this.material);
    this.mesh.scale.setScalar(1500); this.mesh.renderOrder = -10; this.mesh.frustumCulled = false;
    // ตัวเล็กสำหรับทำ environment map (PMREM ใช้ระยะกล้อง 0.1–100)
    this.envMesh = new THREE.Mesh(this.mesh.geometry, this.material); this.envMesh.scale.setScalar(50);
  }

  // เรียกจาก setTime: คำนวณสีฟ้าตามเวลาและความครึ้ม
  update({ sunDir, day, night, warm, cover, rain, horizon }) {
    const u = this.u;
    u.sunDir.value.copy(sunDir);
    u.moonDir.value.set(-sunDir.x * 0.8 + 0.2, Math.max(0.25, -sunDir.y * 0.9 + 0.2), -sunDir.z * 0.8 - 0.3).normalize();
    u.day.value = day; u.night.value = night; u.warm.value = warm; u.cover.value = cover;
    const blue = new THREE.Color(0.06, 0.2, 0.62), dusk = new THREE.Color(0.16, 0.18, 0.42), nightC = new THREE.Color(0.006, 0.009, 0.025);
    const z = blue.clone().lerp(dusk, warm * 0.7).lerp(nightC, night);
    z.lerp(new THREE.Color(0.36, 0.39, 0.44).multiplyScalar(Math.max(0.05, day)), Math.min(1, cover * 0.85 + rain * 0.3));
    u.zenith.value.copy(z);
    u.horizon.value.copy(horizon);
    u.sunColor.value.setRGB(1, 0.95 - warm * 0.35, 0.85 - warm * 0.55);
  }
}
