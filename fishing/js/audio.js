// เสียงทั้งหมดสังเคราะห์ด้วย WebAudio (ไม่ต้องโหลดไฟล์)
let ctx, master, fallGain, noiseBuf, ambLp;
let amb = 'falls', nightOn = false;
export function setNight(on) { nightOn = on; }
let muted = false;
try { muted = localStorage.getItem('cozyfish.mute') === '1'; } catch (e) { /* ไม่มี storage */ }

export function initAudio() {
  if (ctx) { if (ctx.state === 'suspended') ctx.resume(); return; }
  const AC = window.AudioContext || window.webkitAudioContext;
  if (!AC) return;
  ctx = new AC();
  master = ctx.createGain();
  master.gain.value = muted ? 0 : 0.8;
  master.connect(ctx.destination);
  noiseBuf = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
  const d = noiseBuf.getChannelData(0);
  let last = 0;
  for (let i = 0; i < d.length; i++) { const w = Math.random() * 2 - 1; last = (last + 0.04 * w) / 1.04; d[i] = last * 3.2 * 0.5 + w * 0.5 * 0.25; }
  // เสียงน้ำตกต่อเนื่อง
  const src = ctx.createBufferSource();
  src.buffer = noiseBuf; src.loop = true;
  ambLp = ctx.createBiquadFilter(); ambLp.type = 'lowpass'; ambLp.frequency.value = 1100;
  fallGain = ctx.createGain(); fallGain.gain.value = 0.0;
  src.connect(ambLp).connect(fallGain).connect(master);
  setAmbience(amb);
  src.start();
  setTimeout(bird, 3000);
}

export function isMuted() { return muted; }
export function setMuted(m) {
  muted = m;
  try { localStorage.setItem('cozyfish.mute', m ? '1' : '0'); } catch (e) { /* ไม่มี storage */ }
  if (master) master.gain.setTargetAtTime(m ? 0 : 0.8, ctx.currentTime, 0.05);
}

// เสียงบรรยากาศของแต่ละที่: falls น้ำตก · stream ลำธาร · surf คลื่นซัดหาด · sea ทะเลเปิด · night กลางคืนที่บ้าน
const AMB = { falls: [1100, 'lowpass'], stream: [1700, 'bandpass'], surf: [700, 'lowpass'], sea: [420, 'lowpass'], night: [300, 'lowpass'] };
export function setAmbience(kind) {
  amb = kind;
  if (!ambLp) return;
  const [f, type] = AMB[kind] || AMB.falls;
  ambLp.type = type;
  ambLp.frequency.setTargetAtTime(f, ctx.currentTime, 0.2);
}
// เรียกทุกเฟรม: d = ระยะถึงต้นเสียง (น้ำตก), t = เวลา
export function ambienceTick(d, t) {
  if (!fallGain) return;
  let v;
  if (amb === 'falls') v = Math.max(0.04, Math.min(0.32, 3.2 / (d + 2)));
  else if (amb === 'stream') v = 0.16;
  else if (amb === 'surf') v = 0.06 + 0.2 * Math.pow(Math.max(0, Math.sin(t * 0.7)), 2);
  else if (amb === 'sea') v = 0.1 + 0.05 * Math.sin(t * 0.5);
  else v = 0.015;
  fallGain.gain.setTargetAtTime(v, ctx.currentTime, 0.3);
}

function env(g, t, a, peak, rel) {
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(peak, t + a);
  g.gain.exponentialRampToValueAtTime(0.0001, t + a + rel);
}

function tone(freq, freq2, dur, vol = 0.2, type = 'sine', delay = 0) {
  if (!ctx) return;
  const t = ctx.currentTime + delay;
  const o = ctx.createOscillator(), g = ctx.createGain();
  o.type = type;
  o.frequency.setValueAtTime(freq, t);
  if (freq2) o.frequency.exponentialRampToValueAtTime(freq2, t + dur);
  env(g, t, 0.008, vol, dur);
  o.connect(g).connect(master);
  o.start(t); o.stop(t + dur + 0.05);
}

function noise(dur, f0, f1, vol = 0.3, type = 'lowpass', delay = 0) {
  if (!ctx) return;
  const t = ctx.currentTime + delay;
  const s = ctx.createBufferSource(); s.buffer = noiseBuf;
  const f = ctx.createBiquadFilter(); f.type = type; f.frequency.setValueAtTime(f0, t); f.frequency.exponentialRampToValueAtTime(f1, t + dur);
  const g = ctx.createGain(); env(g, t, 0.01, vol, dur);
  s.connect(f).connect(g).connect(master);
  s.start(t, Math.random()); s.stop(t + dur + 0.05);
}

export const sfx = {
  whoosh: () => noise(0.35, 600, 2400, 0.12, 'bandpass'),
  plop: () => { tone(520, 160, 0.16, 0.25); noise(0.25, 2500, 400, 0.15); },
  nibble: () => tone(900, 520, 0.08, 0.12),
  bite: () => { noise(0.4, 3000, 300, 0.35); tone(880, 0, 0.12, 0.18, 'triangle', 0.02); tone(1320, 0, 0.2, 0.18, 'triangle', 0.13); },
  hook: () => tone(300, 900, 0.12, 0.15, 'square'),
  reel: () => tone(2200 + Math.random() * 300, 0, 0.02, 0.05, 'square'),
  splash: () => noise(0.3, 2000, 300, 0.2),
  snap: () => { noise(0.15, 6000, 2000, 0.4, 'highpass'); tone(400, 90, 0.3, 0.15, 'sawtooth'); },
  escape: () => { tone(500, 300, 0.2, 0.12, 'triangle'); tone(380, 220, 0.3, 0.12, 'triangle', 0.18); },
  catch: (rare) => {
    const notes = rare ? [523, 659, 784, 1047, 1319, 1568] : [523, 659, 784, 1047];
    notes.forEach((f, i) => tone(f, 0, 0.3, 0.16, 'triangle', i * 0.09));
  },
  click: () => tone(1200, 0, 0.04, 0.08, 'triangle'),
  ghost: () => { tone(880, 220, 0.7, 0.2, 'sawtooth'); noise(0.6, 3000, 600, 0.25, 'bandpass'); },
  boom: () => { noise(0.5, 300, 60, 0.35); noise(0.9, 5000, 2000, 0.06, 'highpass', 0.15); },
  cheer: () => { for (let i = 0; i < 5; i++) tone(700 + Math.random() * 500, 0, 0.12, 0.05, 'triangle', i * 0.08); },
  softSplash: () => { noise(0.22, 1800, 400, 0.07); tone(700, 250, 0.1, 0.05); },
  coin: () => { tone(1568, 0, 0.08, 0.12, 'square'); tone(2093, 0, 0.18, 0.12, 'square', 0.07); },
  junk: () => { tone(300, 200, 0.15, 0.12, 'triangle'); tone(220, 150, 0.2, 0.1, 'triangle', 0.12); },
};

function bird() {
  if (!ctx) return;
  if (!muted && document.visibilityState === 'visible' && (amb === 'night' || nightOn)) {
    for (let i = 0; i < 6; i++) tone(4300, 4200, 0.04, 0.025, 'sine', i * 0.07);   // จิ้งหรีด
    if (nightOn && amb !== 'sea' && Math.random() < 0.6) for (let i = 0; i < 2; i++) tone(190, 120, 0.12, 0.06, 'triangle', 0.5 + i * 0.22);   // กบ
  } else if (!muted && document.visibilityState === 'visible' && amb !== 'sea') {
    const base = 2200 + Math.random() * 1600, n = 2 + Math.floor(Math.random() * 4);
    for (let i = 0; i < n; i++) tone(base, base * (0.75 + Math.random() * 0.6), 0.09, 0.05, 'sine', i * 0.13);
  }
  setTimeout(bird, 4000 + Math.random() * 8000);
}

// ---------- เพลงงานวัด (บันไดเสียงห้าเสียงแบบไทย + กลองตะโพน) ----------
let festTimer = null;
export function startFestival() {
  if (!ctx || festTimer) return;
  const scale = [392, 440, 523, 587, 659, 784, 880];
  const tune = [0, 2, 3, 4, 3, 2, 4, 5, 4, 3, 2, 0, 1, 2, 3, 2];
  let step = 0;
  festTimer = setInterval(() => {
    if (muted || document.visibilityState !== 'visible') { step++; return; }
    const n = tune[step % tune.length];
    tone(scale[n], 0, 0.22, 0.07, 'triangle');                  // ระนาด
    if (step % 4 === 0) noise(0.12, 400, 90, 0.18);             // กลอง
    if (step % 4 === 2) noise(0.06, 3000, 1500, 0.05, 'highpass'); // ฉิ่ง
    step++;
  }, 260);
}
export function stopFestival() { clearInterval(festTimer); festTimer = null; }
