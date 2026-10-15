// จุดเริ่มของแอป: สลับแท็บ, นาฬิกา, event bus ที่เชื่อม 3D ↔ เรดาร์ ↔ Hub
import { bus, toast } from './bus.js';
import { Farm3D } from './farm3d.js';
import { Radar } from './radar.js';
import { Hub } from './hub.js';
import { RealWeather, WeatherSound } from './weather.js';
import { PRESETS } from './weatherfx.js';
import { Tour } from './tour.js';

const farm = new Farm3D(document.getElementById('farmCanvas'));
const tour = farm.tour = new Tour(farm);
const radar = new Radar(document.getElementById('radarCanvas'), farm);
const hub = new Hub();

// ---------- tabs ----------
const tabs = document.querySelectorAll('.tab');
function showTab(name) {
  tabs.forEach(t => t.classList.toggle('active', t.dataset.tab === name));
  document.querySelectorAll('.view').forEach(v => v.classList.toggle('active', v.id === 'view-' + name));
  farm.setVisible(name === 'farm');
  radar.setVisible(name === 'radar');
  try { localStorage.setItem('tab', name); } catch {}
  if (name === 'radar') document.getElementById('radarBadge').hidden = true;
}
tabs.forEach(t => t.addEventListener('click', () => showTab(t.dataset.tab)));
let startTab = 'farm';
try { startTab = new URLSearchParams(location.search).get('tab') || localStorage.getItem('tab') || 'farm'; } catch {}
showTab(startTab);

// ---------- clock ----------
const clock = document.getElementById('clock');
const phoneClock = document.getElementById('phoneClock');
setInterval(() => {
  const s = new Date().toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' });
  clock.textContent = s; phoneClock.textContent = s;
}, 1000);

// ---------- farm controls ----------
// บนมือถือ แผงควบคุมพับเก็บได้ เพื่อไม่ให้บังฉาก 3D
const panelToggle = document.getElementById('panelToggle');
const farmPanel = document.getElementById('farmPanel');
panelToggle.addEventListener('click', () => {
  const open = farmPanel.classList.toggle('open');
  panelToggle.setAttribute('aria-expanded', open);
  panelToggle.textContent = open ? '✕ ปิด' : '☰ ควบคุม';
});
farmPanel.addEventListener('click', e => {
  if (e.target.closest('[data-cam]') && matchMedia('(max-width: 760px)').matches) panelToggle.click();
});
document.getElementById('camChips').addEventListener('click', e => {
  const b = e.target.closest('[data-cam]'); if (!b) return;
  document.querySelectorAll('#camChips .chip').forEach(c => c.classList.toggle('active', c === b));
  farm.flyTo(b.dataset.cam);
});
const slider = document.getElementById('timeSlider');
const timeLabel = document.getElementById('timeLabel');
const fmtTime = h => `${String(Math.floor(h)).padStart(2, '0')}:${String(Math.round((h % 1) * 60)).padStart(2, '0')}`;
slider.addEventListener('input', () => { farm.setTime(+slider.value); timeLabel.textContent = fmtTime(+slider.value); });
bus.on('time', h => { slider.value = h; timeLabel.textContent = fmtTime(h); });
document.getElementById('autoTime').addEventListener('change', e => {
  farm.autoTime = e.target.checked;
  if (e.target.checked) { realTimeBox.checked = false; clearInterval(realTimer); }
});

// ---------- เวลาจริง ----------
const realTimeBox = document.getElementById('realTime');
let realTimer;
const syncRealTime = () => { const d = new Date(); farm.setTime(d.getHours() + d.getMinutes() / 60); };
realTimeBox.addEventListener('change', () => {
  clearInterval(realTimer);
  if (realTimeBox.checked) {
    document.getElementById('autoTime').checked = false; farm.autoTime = false;
    syncRealTime(); realTimer = setInterval(syncRealTime, 30000);
  }
});
slider.addEventListener('input', () => { if (realTimeBox.checked) { realTimeBox.checked = false; clearInterval(realTimer); } });

// ---------- สภาพอากาศ ----------
const real = new RealWeather();
const sound = new WeatherSound();
const wxStatus = document.getElementById('wxStatus');
let wxMode = 'real';
const fmtLoc = l => `${l.name} · ${l.lat.toFixed(2)}, ${l.lon.toFixed(2)}`;
function applyWx(w) {
  farm.wx.set({ clouds: w.clouds, rain: w.rain, storm: w.storm, wind: w.wind, windDir: w.windDir ?? 80, fog: w.fog || 0 });
  sound.setRain(w.rain);
}
function setWxMode(mode) {
  wxMode = mode;
  document.querySelectorAll('#wxChips .chip').forEach(c => c.classList.toggle('active', c.dataset.wx === mode));
  if (mode === 'real') {
    real.start();
    wxStatus.textContent = 'กำลังดึงสภาพอากาศจริง…';
  } else {
    real.stop();
    applyWx(PRESETS[mode]);
    wxStatus.innerHTML = `โหมดจำลอง: <b>${PRESETS[mode].label}</b>`;
  }
}
let lastStorm = null;
bus.on('real-weather', d => {
  if (wxMode !== 'real') return;
  // แจ้งเตือนจริงเมื่อเริ่มมีพายุฝนฟ้าคะนองในพื้นที่บ้านสวน
  if (lastStorm === false && d.storm && radar.tg.ready) {
    radar.tg.sendText(`⛈️ พายุฝนฟ้าคะนองเข้าพื้นที่บ้านสวนแล้ว (${d.label})\nฝน ${d.precipitation} มม. · ลม ${d.wind_speed_10m} กม./ชม.\nเก็บของ ปิดหน้าต่าง และถอดปลั๊กอุปกรณ์ที่ไม่จำเป็น`).catch(() => {});
    radar.log('📲 แจ้งเตือนพายุเข้า Telegram แล้ว');
  }
  lastStorm = d.storm;
  applyWx(d);
  const t = d.fetched.toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' });
  wxStatus.innerHTML = `<b>${d.label}</b> · ${d.temperature_2m}°C · ความชื้น ${d.relative_humidity_2m}%<br>`
    + `ฝน ${d.precipitation} มม. · ลม ${d.wind_speed_10m} กม./ชม. · เมฆ ${d.cloud_cover}%<br>`
    + `📍 ${fmtLoc(d.loc)} · อัปเดต ${t} (Open-Meteo)`;
  hub.setExternal({ 'weather/temp': d.temperature_2m, 'weather/humidity': d.relative_humidity_2m, 'weather/rain': d.precipitation }, 'ESP32-WX', 'Open-Meteo');
});
bus.on('real-weather-error', msg => { if (wxMode === 'real') wxStatus.textContent = `ดึงข้อมูลอากาศไม่สำเร็จ (${msg}) — จะลองใหม่ใน 1 นาที`; });
bus.on('lightning', e => sound.thunder(e.distance));
document.getElementById('wxChips').addEventListener('click', e => { const b = e.target.closest('[data-wx]'); if (b) setWxMode(b.dataset.wx); });
document.getElementById('btnLocate').addEventListener('click', async () => {
  wxStatus.textContent = 'กำลังขอตำแหน่ง GPS…';
  try { await real.locate(); setWxMode('real'); toast('📍 ตั้งตำแหน่งบ้านสวนแล้ว'); }
  catch (err) { wxStatus.textContent = 'ระบุตำแหน่งไม่ได้: ' + err.message; }
});
document.getElementById('soundToggle').addEventListener('change', e => sound.enable(e.target.checked));
setWxMode('real');
if (realTimeBox.checked) { syncRealTime(); realTimer = setInterval(syncRealTime, 30000); }
document.getElementById('fogToggle').addEventListener('change', e => farm.setFog(e.target.checked));
document.getElementById('labelToggle').addEventListener('change', e => farm.setLabels(e.target.checked));
document.getElementById('btnFeed').addEventListener('click', () => bus.emit('cmd', { device: 'pig-feeder', action: 'feed', source: '3D' }));
document.getElementById('btnVisitor').addEventListener('click', () => farm.spawnVisitor());

// ---------- กล้องเล่าเรื่อง ----------
const btnTour = document.getElementById('btnTour');
const autoTourBox = document.getElementById('autoTour');
autoTourBox.checked = tour.auto;
autoTourBox.addEventListener('change', () => tour.setAuto(autoTourBox.checked));
btnTour.addEventListener('click', () => {
  tour.toggle();
  if (tour.active && matchMedia('(max-width: 760px)').matches && farmPanel.classList.contains('open')) panelToggle.click();
});
document.getElementById('tourStop').addEventListener('click', () => tour.stop());
bus.on('tour', on => { btnTour.classList.toggle('active', on); btnTour.textContent = on ? '⏹ หยุดเล่าเรื่อง' : '🎬 เล่าเรื่องอัตโนมัติ'; });

// badge บนแท็บเรดาร์เมื่อมีคนแปลกหน้าแต่ผู้ใช้อยู่แท็บอื่น
let unseen = 0;
bus.on('alert', () => {
  if (document.querySelector('.tab.active').dataset.tab === 'radar') return;
  const b = document.getElementById('radarBadge'); unseen++; b.textContent = unseen; b.hidden = false;
  toast('📡 เรดาร์ตรวจพบบุคคล — ดูที่แท็บเรดาร์');
});
document.querySelector('[data-tab=radar]').addEventListener('click', () => { unseen = 0; });

window.app = { farm, radar, hub, bus };
