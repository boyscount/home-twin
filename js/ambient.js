// เสียงบรรยากาศบ้านสวน — สังเคราะห์ด้วย Web Audio ทั้งหมด (ไม่ต้องโหลดไฟล์เสียง)
// ไก่ขันตอนเช้า, นกร้องกลางวัน, จิ้งหรีด/กบตอนกลางคืน, ไก่กุ๊ก ๆ, หมูร้องตอนให้อาหาร, หมาเห่าคนแปลกหน้า, รถวิ่งผ่าน, เสียงหมูกะทะฉ่า
// ใช้ AudioContext เดียวกับเสียงฝน/ฟ้าร้อง และเปิดด้วยสวิตช์เสียงตัวเดียวกัน
import { bus } from './bus.js';

const rand = (a, b) => a + Math.random() * (b - a);

export class Ambient {
  constructor(sound, farm) {
    this.sound = sound; this.farm = farm;
    this.timers = { rooster: 5, bird: 2, cricket: 0, frog: 3, cluck: 4 };
    bus.on('alert', () => this.bark(3));
    bus.on('vehicle-pass', v => this.whoosh(v.label));
    bus.on('farm-event', msg => { if (msg.includes('เทอาหารหมู')) this.oinks(4); if (msg.includes('Goodbye')) this.kidsChatter(); });
    bus.on('bbq', on => this.sizzle(on));
    bus.on('firework', fw => this.boom(fw));
    bus.on('honk', h => this.honk(h));
  }

  get ok() { return this.sound.enabled && this.sound.ctx && this.sound.ctx.state === 'running'; }
  get ctx() { return this.sound.ctx; }

  // ระยะจากกล้องถึงแหล่งเสียง → ความดัง
  near(x, z) {
    const c = this.farm.camera.position;
    const d = Math.hypot(c.x - x, c.z - z);
    return Math.max(0.12, Math.min(1, 35 / (d + 15)));
  }

  noiseBuf() {
    if (!this._noise) {
      const ctx = this.ctx, len = ctx.sampleRate * 2, b = ctx.createBuffer(1, len, ctx.sampleRate), d = b.getChannelData(0);
      for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
      this._noise = b;
    }
    return this._noise;
  }

  tone({ type = 'sine', f0, f1 = f0, dur, gain = 0.1, at = 0, filter, q = 1, vibrato = 0 }) {
    const ctx = this.ctx, t = ctx.currentTime + at;
    const o = ctx.createOscillator(), g = ctx.createGain();
    o.type = type; o.frequency.setValueAtTime(f0, t); o.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur);
    if (vibrato) { const l = ctx.createOscillator(), lg = ctx.createGain(); l.frequency.value = 28; lg.gain.value = vibrato; l.connect(lg).connect(o.frequency); l.start(t); l.stop(t + dur); }
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(gain, t + Math.min(0.03, dur / 4)); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    let node = o;
    if (filter) { const f = ctx.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = filter; f.Q.value = q; node = o.connect(f); }
    node.connect(g).connect(this.sound.master);
    o.start(t); o.stop(t + dur + 0.05);
  }

  noise({ dur, gain = 0.1, at = 0, type = 'bandpass', f0 = 800, f1 = f0, q = 1, attack = 0.05 }) {
    const ctx = this.ctx, t = ctx.currentTime + at;
    const src = ctx.createBufferSource(); src.buffer = this.noiseBuf(); src.loop = true;
    const f = ctx.createBiquadFilter(); f.type = type; f.Q.value = q;
    f.frequency.setValueAtTime(f0, t); f.frequency.exponentialRampToValueAtTime(f1, t + dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(gain, t + attack); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(f).connect(g).connect(this.sound.master); src.start(t); src.stop(t + dur + 0.05);
  }

  // ---------------------------------------------------------------- เสียงแต่ละแบบ
  rooster() { // เอ้ก-อี-เอ้ก-เอ้ก
    const v = this.near(30, 18) * 0.22;
    [[520, 720, 0.16], [700, 700, 0.12], [760, 920, 0.2], [900, 560, 0.6]].reduce((at, [a, b, d]) => {
      this.tone({ type: 'sawtooth', f0: a, f1: b, dur: d, gain: v, at, filter: 1200, q: 2.5, vibrato: 18 }); return at + d + 0.03;
    }, 0);
  }
  bird() {
    const n = 2 + Math.floor(Math.random() * 3), base = rand(2600, 4200);
    for (let i = 0; i < n; i++) this.tone({ f0: base, f1: base * rand(1.2, 1.6), dur: 0.07, gain: 0.04, at: i * 0.12 });
  }
  cricket() { for (let i = 0; i < 3; i++) this.tone({ f0: 4500, dur: 0.025, gain: 0.018, at: i * 0.045 }); }
  frog() { const v = 0.05; this.tone({ type: 'square', f0: 150, f1: 110, dur: 0.12, gain: v, filter: 500, q: 3 }); this.tone({ type: 'square', f0: 150, f1: 110, dur: 0.12, gain: v, filter: 500, q: 3, at: 0.2 }); }
  cluck() { const v = this.near(30, 18) * 0.12, n = 2 + Math.floor(Math.random() * 3); for (let i = 0; i < n; i++) this.tone({ type: 'square', f0: 480, f1: 380, dur: 0.06, gain: v, filter: 900, q: 4, at: i * 0.14 }); }
  oinks(n) {
    if (!this.ok) return;
    const v = this.near(30, -2) * 0.25;
    for (let i = 0; i < n; i++) {
      const at = i * rand(0.35, 0.6);
      this.tone({ type: 'sawtooth', f0: rand(200, 260), f1: 120, dur: 0.25, gain: v, filter: 650, q: 3, at });
      this.noise({ dur: 0.2, gain: v * 0.3, f0: 500, q: 4, at });
    }
  }
  bark(n) {
    if (!this.ok) return;
    const p = this.farm.dog?.group.position || { x: 0, z: 20 }, v = this.near(p.x, p.z) * 0.3;
    for (let i = 0; i < n; i++) { const at = i * 0.32; this.tone({ type: 'square', f0: 460, f1: 260, dur: 0.12, gain: v, filter: 1300, q: 1.5, at }); this.noise({ dur: 0.08, gain: v * 0.4, f0: 1500, at }); }
  }
  whoosh(label) {
    if (!this.ok) return;
    const v = this.near(0, 46) * 0.3, moto = label === 'มอเตอร์ไซค์', truck = label?.includes('บรรทุก');
    this.noise({ dur: 2.4, gain: v * (truck ? 1.2 : 1), f0: 300, f1: 1400, q: 0.8, attack: 1.1 });
    this.tone({ type: 'sawtooth', f0: moto ? 110 : truck ? 55 : 75, f1: moto ? 85 : truck ? 45 : 60, dur: 2.2, gain: v * 0.35, filter: moto ? 700 : 300, q: 1.2, at: 0.1 });
  }
  // แตรรถเบา ๆ 2 จังหวะ (รถยนต์ = แตรสองโทน, มอเตอร์ไซค์ = แหลมกว่า)
  honk(h) {
    if (!this.ok) return;
    const v = this.near(h.x, h.z) * 0.09;
    for (const at of [0, 0.32]) {
      if (h.moto) this.tone({ type: 'square', f0: 620, dur: 0.14, gain: v, filter: 1800, q: 1.2, at });
      else { this.tone({ type: 'square', f0: 415, dur: 0.18, gain: v, filter: 1600, q: 1, at }); this.tone({ type: 'square', f0: 520, dur: 0.18, gain: v * 0.8, filter: 1600, q: 1, at }); }
    }
  }
  kidsChatter() {
    if (!this.ok) return;
    const v = this.near(-25, 26) * 0.08;
    for (let i = 0; i < 14; i++) this.tone({ type: 'triangle', f0: rand(380, 620), f1: rand(300, 700), dur: rand(0.08, 0.2), gain: v, at: i * rand(0.08, 0.2) });
  }
  sizzle(on) {
    if (!this.sound.ctx) return;
    if (on && !this._sizzle) {
      const ctx = this.ctx, src = ctx.createBufferSource(); src.buffer = this.noiseBuf(); src.loop = true;
      const f = ctx.createBiquadFilter(); f.type = 'highpass'; f.frequency.value = 3500;
      const g = ctx.createGain(); g.gain.value = 0;
      src.connect(f).connect(g).connect(this.sound.master); src.start();
      this._sizzle = { src, g };
    } else if (!on && this._sizzle) { this._sizzle.src.stop(); this._sizzle = null; }
  }

  boom(fw) { // พลุ: แสงมาก่อน เสียงตามมาทีหลังตามระยะ
    if (!this.ok) return;
    const c = this.farm.camera.position, d = Math.hypot(c.x - fw.x, c.z - fw.z, 55), at = Math.min(d / 343, 0.6);
    this.noise({ dur: 1.2, gain: Math.min(0.35, 25 / d), type: 'lowpass', f0: 900, f1: 120, attack: 0.01, at });
    for (let i = 0; i < 6; i++) this.noise({ dur: 0.05, gain: 0.04, f0: 3000, q: 2, at: at + 0.3 + i * rand(0.05, 0.12) });
  }

  // เรียกทุก 0.25 วินาที
  update(dt) {
    if (!this.ok) return;
    const h = this.farm.hour, night = (this.farm.nightFactor || 0) > 0.5, rain = (this.farm.wxState?.rain || 0) > 0.5;
    const T = this.timers;
    for (const k in T) T[k] -= dt;
    if (h >= 5.2 && h < 7.5 && T.rooster < 0) { this.rooster(); T.rooster = rand(18, 45); }
    if (!night && !rain && h >= 6 && h < 18 && T.bird < 0) { this.bird(); T.bird = rand(2.5, 7); }
    if (night && T.cricket < 0) { this.cricket(); T.cricket = rand(0.35, 0.8); }
    if ((night || rain) && T.frog < 0) { this.frog(); T.frog = rand(rain ? 1.5 : 4, rain ? 4 : 10); }
    if (!night && T.cluck < 0) { this.cluck(); T.cluck = rand(8, 20); }
    if (!!this.farm.bbq?.active !== !!this._sizzle) this.sizzle(!!this.farm.bbq?.active);
    if (this._sizzle) this._sizzle.g.gain.setTargetAtTime(this.near(2, 15.5) * 0.05, this.ctx.currentTime, 0.3);
  }
}
