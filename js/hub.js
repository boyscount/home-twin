// แท็บ Hub: แดชบอร์ดเซนเซอร์ + สั่งงานอุปกรณ์
// ตอนนี้ใช้ค่าจำลอง ถ้าเชื่อม MQTT ได้ ค่าจริงจาก topic  <prefix>/<metric>  จะมาแทนทันที
// เช่น  banshuan/demo/hydro/ph  payload "6.2"  หรือ {"value":6.2}
import { bus, toast, nowStr } from './bus.js';

// metric: [ชื่อ, หน่วย, ค่าเริ่ม, min, max, step, ช่วงปกติ [lo,hi]]
const METRICS = {
  'weather/temp': ['อุณหภูมิ', '°C', 27, 20, 38, 0.3, [18, 35]],
  'weather/humidity': ['ความชื้นอากาศ', '%', 78, 40, 99, 1, [40, 95]],
  'weather/light': ['แสง', 'lux', 12000, 0, 90000, 1500],
  'weather/rain': ['ฝน', 'mm/h', 0, 0, 20, 0.4, [0, 5]],
  'hydro/ph': ['pH', '', 6.1, 4.5, 8, 0.05, [5.5, 6.5]],
  'hydro/ec': ['EC', 'mS/cm', 1.6, 0.5, 3, 0.03, [1.2, 2.0]],
  'hydro/water_temp': ['อุณหภูมิน้ำ', '°C', 26, 20, 34, 0.2, [20, 29]],
  'hydro/level': ['ระดับน้ำในถัง', '%', 82, 0, 100, 0.4, [30, 100]],
  'pond/do': ['ออกซิเจนละลาย', 'mg/L', 5.4, 1, 9, 0.1, [4, 9]],
  'pond/water_temp': ['อุณหภูมิน้ำ', '°C', 28, 22, 34, 0.15, [24, 31]],
  'pond/level': ['ระดับน้ำ', 'cm', 92, 40, 120, 0.5, [70, 115]],
  'pig/temp': ['อุณหภูมิคอก', '°C', 29, 22, 38, 0.3, [24, 32]],
  'pig/nh3': ['แอมโมเนีย', 'ppm', 8, 0, 40, 0.6, [0, 20]],
  'pig/feed': ['อาหารในไซโล', '%', 64, 0, 100, 0, [20, 100]],
  'chicken/eggs': ['ไข่วันนี้', 'ฟอง', 5, 0, 12, 0],
  'chicken/temp': ['อุณหภูมิเล้า', '°C', 28, 22, 36, 0.3, [22, 32]],
  'rubber/latex': ['น้ำยางวันนี้', 'กก.', 46, 0, 120, 0],
  'rubber/soil': ['ความชื้นดิน', '%', 41, 10, 80, 0.4, [25, 70]],
  'energy/solar': ['โซลาร์เซลล์', 'W', 1800, 0, 5000, 120],
  'energy/battery': ['แบตเตอรี่', '%', 76, 0, 100, 0.3, [20, 100]],
};

const CARDS = [
  { ico: '🌤️', title: 'สภาพอากาศ', node: 'ESP32-WX', metrics: ['weather/temp', 'weather/humidity', 'weather/rain', 'weather/light'], spark: 'weather/temp' },
  { ico: '🥬', title: 'ผักไฮโดรโปนิกส์', node: 'ESP32-HYDRO', metrics: ['hydro/ph', 'hydro/ec', 'hydro/water_temp', 'hydro/level'], spark: 'hydro/ph', toggle: ['hydro-pump', 'ปั๊มน้ำวน NFT', true] },
  { ico: '🐟', title: 'บ่อปลา', node: 'ESP32-POND', metrics: ['pond/do', 'pond/water_temp', 'pond/level'], spark: 'pond/do', toggle: ['aerator', 'เครื่องเติมอากาศ', false] },
  { ico: '🐖', title: 'คอกหมู', node: 'ESP32-PIG', metrics: ['pig/temp', 'pig/nh3'], bar: 'pig/feed', spark: 'pig/nh3', action: ['pig-feeder', 'feed', '🍚 สั่งให้อาหารหมู (พ่อเดินไปให้ในฉาก 3D)'] },
  { ico: '🐔', title: 'เล้าไก่', node: 'ESP32-COOP', metrics: ['chicken/eggs', 'chicken/temp'], spark: 'chicken/temp', toggle: ['chicken-door', 'ประตูเล้าอัตโนมัติ', true] },
  { ico: '🌳', title: 'สวนยางพารา 400 ต้น', node: 'LoRa-RUBBER', metrics: ['rubber/latex', 'rubber/soil'], spark: 'rubber/soil', extra: 'tap' },
  { ico: '⚡', title: 'พลังงาน', node: 'INV-SOLAR', metrics: ['energy/solar'], bar: 'energy/battery', spark: 'energy/solar' },
  { ico: '🛡️', title: 'ความปลอดภัย', node: 'RPi-RADAR', extra: 'security', toggle: ['lights', 'ไฟสปอตไลท์รอบบ้าน', false], toggle2: ['gate', 'ประตูรั้ว (เปิด)', true] },
];

const DEVICES = [
  ['ESP32-WX', 'เสาวัดอากาศ', 'weather/#'], ['ESP32-HYDRO', 'โรงเรือนผัก', 'hydro/#'], ['ESP32-POND', 'บ่อปลา', 'pond/#'],
  ['ESP32-PIG', 'คอกหมู', 'pig/#'], ['ESP32-COOP', 'เล้าไก่', 'chicken/#'], ['LoRa-RUBBER', 'สวนยาง (LoRa 1 กม.)', 'rubber/#'],
  ['INV-SOLAR', 'อินเวอร์เตอร์โซลาร์', 'energy/#'], ['RPi-RADAR', 'Raspberry Pi + mmWave + กล้อง', 'radar/#'],
];

export class Hub {
  constructor() {
    this.vals = {}; this.hist = {}; this.live = {}; this.lastSeen = {};
    for (const [k, m] of Object.entries(METRICS)) { this.vals[k] = m[2]; this.hist[k] = Array.from({ length: 40 }, () => m[2]); }
    this.security = { people: 0, alerts: 0, known: 0 };
    this.grid = document.getElementById('hubGrid');
    this.logEl = document.getElementById('hubLog');
    this.build();
    this.buildDevices();
    setInterval(() => this.simulate(), 2000);
    bus.on('cmd', c => this.onCmd(c));
    bus.on('alert', () => { this.security.alerts++; this.renderSecurity(); });
    bus.on('radar-known', () => { this.security.known++; this.renderSecurity(); });
    bus.on('eggs-collected', n => { this.vals['chicken/eggs'] = Math.min(METRICS['chicken/eggs'][4], this.vals['chicken/eggs'] + n); this.render(); });
    bus.on('farm-event', msg => { if (msg.includes('เทอาหาร')) { this.vals['pig/feed'] = Math.max(0, this.vals['pig/feed'] - 6); this.render(); } });
    document.getElementById('mqttForm').addEventListener('submit', e => { e.preventDefault(); this.connectMqtt(); });
    this.log('Hub พร้อมใช้งาน (โหมดจำลอง)');
  }

  build() {
    this.grid.innerHTML = '';
    this.els = {};
    CARDS.forEach((cd, ci) => {
      const card = document.createElement('div'); card.className = 'card';
      let html = `<div class="card-h"><span><span class="ico">${cd.ico}</span> ${cd.title}</span><span class="pill sim" data-node="${cd.node}">SIM</span></div>`;
      if (cd.spark) html += `<canvas class="spark" data-spark="${cd.spark}"></canvas>`;
      (cd.metrics || []).forEach(k => { html += `<div class="metric"><span>${METRICS[k][0]}</span><span><b data-m="${k}">-</b><small>${METRICS[k][1]}</small></span></div>`; });
      if (cd.bar) html += `<div class="metric"><span>${METRICS[cd.bar][0]}</span><span><b data-m="${cd.bar}">-</b><small>%</small></span></div><div class="bar"><i data-bar="${cd.bar}"></i></div>`;
      if (cd.extra === 'tap') html += `<div class="metric"><span>เหมาะกรีดยางคืนนี้?</span><b data-tap style="font-size:15px">-</b></div><div class="metric"><span>จำนวนต้นที่กรีดได้</span><b>400</b></div>`;
      if (cd.extra === 'security') html += `<div class="metric"><span>คนในเขตบ้าน</span><b data-sec="people">0</b></div><div class="metric"><span>แจ้งเตือนวันนี้</span><b data-sec="alerts">0</b></div><div class="metric"><span>หน้าที่จดจำได้</span><b data-sec="known">0</b></div>`;
      for (const t of [cd.toggle, cd.toggle2].filter(Boolean)) html += `<div class="toggle-row"><span>${t[1]}</span><label class="switch"><input type="checkbox" data-dev="${t[0]}" ${t[2] ? 'checked' : ''}><span></span></label></div>`;
      if (cd.action) html += `<button class="act" data-act="${ci}">${cd.action[2]}</button>`;
      card.innerHTML = html;
      this.grid.appendChild(card);
    });
    this.grid.querySelectorAll('[data-dev]').forEach(inp => inp.addEventListener('change', () => {
      bus.emit('cmd', { device: inp.dataset.dev, value: inp.checked, source: 'Hub' });
    }));
    this.grid.querySelectorAll('[data-act]').forEach(b => b.addEventListener('click', () => {
      const a = CARDS[+b.dataset.act].action;
      bus.emit('cmd', { device: a[0], action: a[1], source: 'Hub' });
    }));
    this.render();
  }

  buildDevices() {
    const tb = document.getElementById('devTable');
    const prefix = this.prefix();
    tb.innerHTML = DEVICES.map(([id, loc, topic]) => {
      const seen = this.lastSeen[id];
      const live = seen && Date.now() - seen < 60000;
      return `<tr><td>${id}</td><td>${loc}</td><td><code>${prefix}/${topic}</code></td><td><span class="pill ${live ? 'on' : 'sim'}">${live ? 'ONLINE' : 'จำลอง'}</span></td><td class="dim">${seen ? new Date(seen).toLocaleTimeString('th-TH') : '-'}</td></tr>`;
    }).join('');
    document.getElementById('devCount').textContent = `${DEVICES.length} โหนด`;
  }

  prefix() { return document.getElementById('mqttTopic').value.replace(/\/#$/, ''); }

  simulate() {
    const app = window.app;
    for (const [k, m] of Object.entries(METRICS)) {
      if (this.live[k] && Date.now() - this.live[k] < 30000) continue;
      let v = this.vals[k];
      if (m[5]) v += (Math.random() - 0.5) * m[5] * 2;
      if (k === 'weather/light' && app) { const h = app.farm.hour; v = Math.max(0, Math.sin((h - 6) / 12 * Math.PI)) * 80000 + Math.random() * 2000; }
      if (k === 'energy/solar') v = this.vals['weather/light'] / 16 + Math.random() * 60;
      if (k === 'pond/do' && app?.farm.devices.aerator) v += 0.08;
      if (k === 'hydro/level' && app?.farm.devices.pump) v -= 0.05;
      this.vals[k] = Math.min(m[4], Math.max(m[3], v));
      this.hist[k].push(this.vals[k]); this.hist[k].shift();
    }
    if (Math.random() < 0.04) this.vals['chicken/eggs'] = Math.min(12, this.vals['chicken/eggs'] + 1);
    if (app) this.security.people = app.farm.getEntities().filter(e => e.type === 'human' && e.z < 36 && e.z > -24 && Math.abs(e.x) < 47).length;
    this.render();
  }

  render() {
    this.grid.querySelectorAll('[data-m]').forEach(b => {
      const k = b.dataset.m, m = METRICS[k], v = this.vals[k];
      b.textContent = m[1] === 'lux' || m[1] === 'W' ? Math.round(v).toLocaleString() : m[5] === 0 ? Math.round(v) : v.toFixed(m[5] < 0.1 ? 2 : 1);
      const ok = m[6]; b.className = ok && (v < ok[0] || v > ok[1]) ? 'bad' : '';
    });
    this.grid.querySelectorAll('[data-bar]').forEach(i => {
      const v = this.vals[i.dataset.bar]; i.style.width = v + '%'; i.style.background = v < 20 ? 'var(--danger)' : v < 40 ? 'var(--warn)' : 'var(--accent)';
    });
    const tap = this.grid.querySelector('[data-tap]');
    if (tap) { const ok = this.vals['weather/rain'] < 1 && this.vals['weather/humidity'] < 97; tap.textContent = ok ? '✓ เหมาะ (ตี 2–6)' : '✗ ฝนตก/ชื้นเกิน'; tap.className = ok ? '' : 'warn'; }
    this.grid.querySelectorAll('[data-spark]').forEach(cv => this.spark(cv, this.hist[cv.dataset.spark]));
    this.renderSecurity();
  }

  renderSecurity() {
    for (const k of ['people', 'alerts', 'known']) { const b = this.grid.querySelector(`[data-sec="${k}"]`); if (b) b.textContent = this.security[k]; }
  }

  spark(cv, data) {
    const w = cv.clientWidth, h = cv.clientHeight; if (!w) return;
    const dpr = Math.min(devicePixelRatio, 2);
    if (cv.width !== w * dpr) { cv.width = w * dpr; cv.height = h * dpr; }
    const c = cv.getContext('2d'); c.setTransform(dpr, 0, 0, dpr, 0, 0); c.clearRect(0, 0, w, h);
    const min = Math.min(...data), max = Math.max(...data), span = max - min || 1;
    const pts = data.map((v, i) => [i / (data.length - 1) * w, h - 4 - (v - min) / span * (h - 8)]);
    const g = c.createLinearGradient(0, 0, 0, h); g.addColorStop(0, 'rgba(123,216,143,.35)'); g.addColorStop(1, 'rgba(123,216,143,0)');
    c.beginPath(); pts.forEach(([x, y], i) => (i ? c.lineTo(x, y) : c.moveTo(x, y))); c.lineTo(w, h); c.lineTo(0, h); c.fillStyle = g; c.fill();
    c.beginPath(); pts.forEach(([x, y], i) => (i ? c.lineTo(x, y) : c.moveTo(x, y))); c.strokeStyle = '#7bd88f'; c.lineWidth = 1.5; c.stroke();
  }

  onCmd(c) {
    const label = { 'pig-feeder': 'เครื่องให้อาหารหมู', aerator: 'เครื่องเติมอากาศบ่อปลา', 'hydro-pump': 'ปั๊มไฮโดรโปนิกส์', 'chicken-door': 'ประตูเล้าไก่', lights: 'ไฟสปอตไลท์', gate: 'ประตูรั้ว' }[c.device] || c.device;
    const state = c.action === 'feed' ? 'สั่งให้อาหาร' : c.value ? 'เปิด' : 'ปิด';
    this.log(`${label} → ${state} (จาก ${c.source || 'ระบบ'})`);
    const inp = this.grid.querySelector(`[data-dev="${c.device}"]`);
    if (inp && typeof c.value === 'boolean') inp.checked = c.value;
    if (this.client?.connected) this.client.publish(`${this.prefix()}/cmd/${c.device}`, JSON.stringify({ value: c.value ?? c.action, ts: Date.now() }));
  }

  log(msg) {
    const d = document.createElement('div'); d.innerHTML = `<span class="t">${nowStr()}</span>`; d.appendChild(document.createTextNode(msg));
    this.logEl.prepend(d); while (this.logEl.children.length > 60) this.logEl.lastChild.remove();
  }

  async connectMqtt() {
    const btn = document.getElementById('mqttBtn');
    if (this.client) { this.client.end(true); this.client = null; btn.textContent = 'เชื่อมต่อ'; this.setConn(false); this.log('ตัดการเชื่อมต่อ MQTT'); return; }
    const url = document.getElementById('mqttUrl').value.trim();
    const topic = document.getElementById('mqttTopic').value.trim();
    btn.textContent = 'กำลังเชื่อม…';
    try {
      const mod = await import('https://cdn.jsdelivr.net/npm/mqtt@5.10.1/dist/mqtt.esm.js');
      const mqtt = mod.default || mod;
      const client = this.client = mqtt.connect(url, { clientId: 'banshuan-web-' + Math.random().toString(16).slice(2, 8), connectTimeout: 8000, reconnectPeriod: 0 });
      client.on('connect', () => {
        btn.textContent = 'ตัดการเชื่อมต่อ'; this.setConn(true);
        client.subscribe(topic); this.log(`เชื่อม MQTT แล้ว · subscribe ${topic}`); toast('🛰️ เชื่อมต่อ MQTT สำเร็จ');
      });
      client.on('message', (t, payload) => this.onMessage(t, payload.toString()));
      client.on('error', err => { this.log('MQTT error: ' + err.message); });
      client.on('close', () => { if (this.client === client) { this.client = null; btn.textContent = 'เชื่อมต่อ'; this.setConn(false); } });
    } catch (e) {
      btn.textContent = 'เชื่อมต่อ'; this.log('โหลด/เชื่อม MQTT ไม่สำเร็จ: ' + e.message); this.client = null;
    }
  }

  onMessage(topic, raw) {
    const key = topic.slice(this.prefix().length + 1);
    if (key.startsWith('cmd/')) return;
    let v; try { const j = JSON.parse(raw); v = typeof j === 'number' ? j : j.value; } catch { v = parseFloat(raw); }
    if (!(key in METRICS) || !isFinite(v)) { this.log(`รับ ${key}: ${raw.slice(0, 40)}`); return; }
    this.vals[key] = v; this.live[key] = Date.now(); this.hist[key].push(v); this.hist[key].shift();
    const card = CARDS.find(c => c.metrics?.includes(key) || c.bar === key);
    if (card) {
      this.lastSeen[card.node] = Date.now();
      const pill = this.grid.querySelector(`[data-node="${card.node}"]`); pill.className = 'pill on'; pill.textContent = 'LIVE';
      this.buildDevices();
    }
    this.render();
  }

  // ค่าจากแหล่งภายนอก (เช่น Open-Meteo) — ถือว่าเป็นค่าจริงไป 15 นาที
  setExternal(values, node, source) {
    for (const [k, v] of Object.entries(values)) {
      if (!(k in METRICS) || !isFinite(v)) continue;
      this.vals[k] = v; this.live[k] = Date.now() + 15 * 60 * 1000; this.hist[k].push(v); this.hist[k].shift();
    }
    const pill = this.grid.querySelector(`[data-node="${node}"]`);
    if (pill) { pill.className = 'pill on'; pill.textContent = 'LIVE · ' + source; }
    this.render();
  }

  setConn(live) {
    document.getElementById('connDot').className = 'dot ' + (live ? 'live' : 'ok');
    document.getElementById('connText').textContent = live ? 'MQTT เชื่อมต่อแล้ว' : 'จำลองข้อมูล';
  }
}
