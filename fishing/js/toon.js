// วัสดุ toon/cel แบบนุ่ม ใช้ร่วมกันทั้งฉาก
import * as THREE from 'three';

let gradient;
export function toonGradient() {
  if (gradient) return gradient;
  // 4 ระดับแสง: เงา → กลาง → สว่าง → ไฮไลต์ (ต่างกันไม่มาก ให้ดูนุ่ม)
  const data = new Uint8Array([120, 120, 120, 255, 178, 178, 178, 255, 228, 228, 228, 255, 255, 255, 255, 255]);
  gradient = new THREE.DataTexture(data, 4, 1, THREE.RGBAFormat);
  gradient.minFilter = gradient.magFilter = THREE.NearestFilter;
  gradient.needsUpdate = true;
  return gradient;
}

export function toon(color, extra = {}) {
  return new THREE.MeshToonMaterial({ color, gradientMap: toonGradient(), ...extra });
}

// ชุดค่าที่ทุก shader แบบเคลื่อนไหวใช้ร่วมกัน (เวลา ลม)
export const shared = { uTime: { value: 0 }, uWind: { value: 1 } };

// หิน/หน้าผา: ด้านที่หันขึ้นฟ้ามีมอสเขียว + ลายจุดหินเล็กน้อย
export function mossy(color, mossAmount = 0.55) {
  const m = toon(color);
  m.onBeforeCompile = sh => {
    sh.uniforms.uMoss = { value: new THREE.Color(0x5f8f3a) };
    sh.uniforms.uMossAmt = { value: mossAmount };
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vWN; varying vec3 vWP;')
      .replace('#include <worldpos_vertex>', '#include <worldpos_vertex>\nvWN = normalize(mat3(modelMatrix) * objectNormal); vWP = (modelMatrix * vec4(transformed,1.0)).xyz;');
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', `#include <common>
varying vec3 vWN; varying vec3 vWP; uniform vec3 uMoss; uniform float uMossAmt;
float h3(vec3 p){ return fract(sin(dot(p, vec3(12.9898,78.233,37.719)))*43758.5453); }
float n3(vec3 p){ vec3 i=floor(p), f=fract(p); f=f*f*(3.0-2.0*f);
  return mix(mix(mix(h3(i),h3(i+vec3(1,0,0)),f.x),mix(h3(i+vec3(0,1,0)),h3(i+vec3(1,1,0)),f.x),f.y),
             mix(mix(h3(i+vec3(0,0,1)),h3(i+vec3(1,0,1)),f.x),mix(h3(i+vec3(0,1,1)),h3(i+vec3(1,1,1)),f.x),f.y),f.z); }`)
      .replace('#include <color_fragment>', `#include <color_fragment>
{ float n = n3(vWP*1.3) * 0.6 + n3(vWP*4.0) * 0.4;
  diffuseColor.rgb *= 0.88 + n * 0.24;
  float up = smoothstep(0.35, 0.75, vWN.y + (n - 0.5) * 0.5);
  diffuseColor.rgb = mix(diffuseColor.rgb, uMoss * (0.85 + n * 0.3), smoothstep(0.42, 0.5, up * uMossAmt * 1.6)); }`);
  };
  return m;
}

// ใบไม้ไหวตามลม (ขยับจุดยอดตามความสูง)
export function swaying(color, amp = 0.08) {
  const m = toon(color);
  m.onBeforeCompile = sh => {
    sh.uniforms.uTime = shared.uTime;
    sh.uniforms.uWind = shared.uWind;
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nuniform float uTime; uniform float uWind;')
      .replace('#include <begin_vertex>', `#include <begin_vertex>
{ vec4 wp = modelMatrix * vec4(transformed, 1.0);
  float k = max(transformed.y - 1.5, 0.0) * ${amp.toFixed(3)} * uWind;
  transformed.x += sin(uTime * 1.3 + wp.x * 0.3 + wp.z * 0.2) * k;
  transformed.z += cos(uTime * 1.1 + wp.z * 0.3) * k * 0.6; }`);
  };
  return m;
}
