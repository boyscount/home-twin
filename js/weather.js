// สภาพอากาศจริงจาก Open-Meteo (ฟรี ไม่ต้องใช้ API key) + เสียงฝน/ฟ้าร้องสังเคราะห์ด้วย Web Audio
import { bus, store } from './bus.js';

const API = 'https://api.open-meteo.com/v1/forecast';
export const DEFAULT_LOC = { lat: 13.75, lon: 100.5, name: 'กรุงเทพฯ (ค่าเริ่มต้น)' };

// WMO weather code → สภาพในฉาก
export function mapWeather(cur) {
  const code = cur.weather_code;
  const clouds = (cur.cloud_cover ?? 0) / 100;
  let rain = 0, storm = false, fog = 0, label = 'แจ่มใส';
  if (code === 0) label = 'ท้องฟ้าแจ่มใส';
  else if (code <= 3) label = ['', 'มีเมฆบางส่วน', 'มีเมฆเป็นส่วนมาก', 'เมฆครึ้ม'][code];
  else if (code === 45 || code === 48) { fog = 1; label = 'มีหมอก'; }
  else if (code >= 51 && code <= 57) { rain = 0.25; label = 'ฝนปรอย'; }
  else if (code >= 61 && code <= 67) { rain = { 61: 0.4, 63: 0.65, 65: 0.95, 66: 0.5, 67: 0.9 }[code] ?? 0.5; label = code >= 65 ? 'ฝนตกหนัก' : 'ฝนตก'; }
  else if (code >= 80 && code <= 82) { rain = [0.45, 0.7, 1][code - 80]; label = ['ฝนตกเป็นช่วง ๆ', 'ฝนตกหนักเป็นช่วง ๆ', 'ฝนตกหนักมาก'][code - 80]; }
  else if (code >= 95) { rain = code === 95 ? 0.8 : 1; storm = true; label = code === 95 ? 'พายุฝนฟ้าคะนอง' : 'พายุฝนฟ้าคะนอง + ลูกเห็บ'; }
  rain = Math.max(rain, Math.min(1, (cur.precipitation || 0) / 6));
  return {
    clouds: Math.max(clouds, rain > 0 ? 0.85 : 0, storm ? 1 : 0), rain, storm, fog,
    wind: (cur.wind_speed_10m || 0) / 3.6, windDir: cur.wind_direction_10m || 0, label, code,
  };
}

export class RealWeather {
  constructor() {
    this.loc = store.get('farmLoc', DEFAULT_LOC);
    this.data = null;
  }

  setLocation(loc) { this.loc = loc; store.set('farmLoc', loc); return this.refresh(); }

  locate() {
    return new Promise((resolve, reject) => {
      if (!navigator.geolocation) return reject(new Error('เบราว์เซอร์ไม่รองรับการระบุตำแหน่ง'));
      navigator.geolocation.getCurrentPosition(
        p => resolve(this.setLocation({ lat: +p.coords.latitude.toFixed(4), lon: +p.coords.longitude.toFixed(4), name: 'ตำแหน่งปัจจุบัน' })),
        e => reject(new Error(e.message)), { timeout: 10000 });
    });
  }

  start() { this.refresh(); clearInterval(this.timer); this.timer = setInterval(() => this.refresh(), 10 * 60 * 1000); }
  stop() { clearInterval(this.timer); }

  async refresh() {
    const { lat, lon } = this.loc;
    const url = `${API}?latitude=${lat}&longitude=${lon}&current=temperature_2m,relative_humidity_2m,precipitation,rain,weather_code,cloud_cover,wind_speed_10m,wind_direction_10m,is_day&timezone=auto`;
    try {
      const r = await fetch(url);
      if (!r.ok) throw new Error('HTTP ' + r.status);
      const j = await r.json();
      this.data = { ...j.current, ...mapWeather(j.current), loc: this.loc, fetched: new Date() };
      bus.emit('real-weather', this.data);
      return this.data;
    } catch (e) {
      bus.emit('real-weather-error', e.message);
      throw e;
    }
  }
}

// ---------------------------------------------------------------- เสียง
export class WeatherSound {
  constructor() { this.enabled = false; this.rainLevel = 0; }

  enable(on) {
    this.enabled = on;
    if (on && !this.ctx) {
      const ctx = this.ctx = new (window.AudioContext || window.webkitAudioContext)();
      this.master = ctx.createGain(); this.master.gain.value = 0.8; this.master.connect(ctx.destination);
      // เสียงฝน: white noise วนลูป ผ่าน filter
      const len = ctx.sampleRate * 2, buf = ctx.createBuffer(1, len, ctx.sampleRate), d = buf.getChannelData(0);
      for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
      const src = ctx.createBufferSource(); src.buffer = buf; src.loop = true;
      const hp = ctx.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 400;
      const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 6000;
      this.rainGain = ctx.createGain(); this.rainGain.gain.value = 0;
      src.connect(hp).connect(lp).connect(this.rainGain).connect(this.master); src.start();
    }
    if (this.ctx) { on ? this.ctx.resume() : this.ctx.suspend(); }
    this.setRain(this.rainLevel);
  }

  setRain(level) {
    this.rainLevel = level;
    if (this.rainGain) this.rainGain.gain.setTargetAtTime(this.enabled ? level * 0.28 : 0, this.ctx.currentTime, 0.8);
  }

  // ฟ้าร้อง: ดังช้ากว่าแสงตามระยะจริง (เสียงเดินทาง ~343 ม./วินาที)
  thunder(distance) {
    if (!this.enabled || !this.ctx) return;
    const ctx = this.ctx, delay = Math.min(distance / 343, 6);
    const dur = 3.5 + Math.random() * 2.5, len = Math.floor(ctx.sampleRate * dur);
    const buf = ctx.createBuffer(1, len, ctx.sampleRate), d = buf.getChannelData(0);
    let last = 0;
    for (let i = 0; i < len; i++) { // brown noise + เสียงครืน ๆ เป็นระลอก
      last = (last + 0.02 * (Math.random() * 2 - 1)) / 1.02;
      const t = i / ctx.sampleRate;
      const env = Math.exp(-t / (dur * 0.35)) * (0.6 + 0.4 * Math.sin(t * (3 + Math.random() * 0.3)));
      d[i] = last * 3.5 * env;
    }
    const src = ctx.createBufferSource(); src.buffer = buf;
    const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = distance < 150 ? 900 : distance < 400 ? 380 : 220;
    const g = ctx.createGain(); g.gain.value = Math.min(1.4, 160 / (distance + 60));
    src.connect(lp).connect(g).connect(this.master);
    src.start(ctx.currentTime + delay);
    if (distance < 150) { // ฟ้าผ่าใกล้ มีเสียงแตก "เปรี้ยง"
      const cl = ctx.createBufferSource(), cb = ctx.createBuffer(1, ctx.sampleRate * 0.25, ctx.sampleRate), cd = cb.getChannelData(0);
      for (let i = 0; i < cd.length; i++) cd[i] = (Math.random() * 2 - 1) * Math.exp(-i / (ctx.sampleRate * 0.05));
      cl.buffer = cb; const cg = ctx.createGain(); cg.gain.value = 0.9; cl.connect(cg).connect(this.master); cl.start(ctx.currentTime + delay);
    }
  }
}
