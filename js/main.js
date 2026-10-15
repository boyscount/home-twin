// จุดเริ่มของแอป: สลับแท็บ, นาฬิกา, event bus ที่เชื่อม 3D ↔ เรดาร์ ↔ Hub
import { bus, toast } from './bus.js';
import { Farm3D, QUALITY } from './farm3d.js';
import { Radar } from './radar.js';
import { Hub } from './hub.js';
import { RealWeather, WeatherSound } from './weather.js';
import { PRESETS } from './weatherfx.js';
import { Tour } from './tour.js';
import { Ambient } from './ambient.js';
import { DailySummary } from './summary.js';
import { Kiosk } from './kiosk.js';
import { Festivals, FESTIVALS, festivalFor } from './festivals.js';
import { Fishermen } from './fishermen.js';
import { Simulator } from './simulate.js';

const farm = new Farm3D(document.getElementById('farmCanvas'));
const tour = farm.tour = new Tour(farm);
const festivals = farm.festivals = new Festivals(farm);
farm.fishers = new Fishermen(farm);
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
bus.on('zone-fly', cam => document.querySelectorAll('#camChips .chip').forEach(c => c.classList.toggle('active', c.dataset.cam === cam)));
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
let wxMode = 'clear';
const fmtLoc = l => `${l.name} · ${l.lat.toFixed(2)}, ${l.lon.toFixed(2)}`;
function applyWx(w) {
  farm.wx.set({ clouds: w.clouds, rain: w.rain, storm: w.storm, wind: w.wind, windDir: w.windDir ?? 80, fog: w.fog || 0 });
  sound.setRain(w.rain);
}
function setWxMode(mode) {
  wxMode = mode;
  try { localStorage.setItem('wxMode', mode); } catch {}
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
const ambient = new Ambient(sound, farm);
const summary = new DailySummary({ radar, hub, farm });
const kiosk = new Kiosk({ farm, tour, showTab });
setInterval(() => ambient.update(0.25), 250);
// เข้าครั้งแรก: อากาศแจ่มใส (ภาพสวยที่สุด) · ถ้าเคยเลือกไว้ จำค่าเดิม
let savedWx = 'clear'; try { savedWx = localStorage.getItem('wxMode') || 'clear'; } catch {}
setWxMode(savedWx);
if (realTimeBox.checked) { syncRealTime(); realTimer = setInterval(syncRealTime, 30000); }
document.getElementById('fogToggle').addEventListener('change', e => farm.setFog(e.target.checked));
// ป้ายชื่อโซน: ขึ้นให้เห็น 10 วินาทีตอนเข้าเว็บ แล้วซ่อนเอง (เปิดใหม่ได้ที่ปุ่ม 🏷️ ข้างปุ่มซูม)
const labelBox = document.getElementById('labelToggle'), btnLabels = document.getElementById('btnLabels');
let labelsTouched = false;
function setLabelsUI(on) { labelBox.checked = on; btnLabels.classList.toggle('active', on); farm.setLabels(on); }
labelBox.addEventListener('change', () => { labelsTouched = true; setLabelsUI(labelBox.checked); });
btnLabels.addEventListener('click', () => { labelsTouched = true; setLabelsUI(!labelBox.checked); });
setLabelsUI(true);
setTimeout(() => { if (!labelsTouched && !tour.active) setLabelsUI(false); }, 10000);

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

// favicon เรดาร์: เปลี่ยนเป็นสีแดงพร้อมจุดเตือนเมื่อมีคนแปลกหน้า (เห็นได้แม้เปิดแท็บเบราว์เซอร์อื่นอยู่)
const favicon = document.getElementById('favicon');
const baseTitle = document.title;
let alertIcon = null;
fetch('icon.svg').then(r => r.text()).then(svg => {
  const red = svg.replaceAll('#39ff6a', '#ff4d4d').replaceAll('#b6ffc9', '#ffc9c9').replaceAll('#0c3a19', '#3a0c0c').replaceAll('#03130a', '#130303').replaceAll('#06150c', '#150606')
    .replace('</svg>', '<circle cx="52" cy="12" r="10" fill="#ff2d2d" stroke="#fff" stroke-width="3"/></svg>');
  alertIcon = 'data:image/svg+xml,' + encodeURIComponent(red);
}).catch(() => {});
function setAlertFavicon(on) {
  if (on && alertIcon) { favicon.href = alertIcon; document.title = '⚠ คนแปลกหน้า · ' + baseTitle; }
  else { favicon.href = 'icon.svg'; document.title = baseTitle; }
}
bus.on('alert', () => setAlertFavicon(true));
bus.on('radar-known', () => setAlertFavicon(false));
document.querySelector('[data-tab=radar]').addEventListener('click', () => setTimeout(() => setAlertFavicon(false), 4000));

// badge บนแท็บเรดาร์เมื่อมีคนแปลกหน้าแต่ผู้ใช้อยู่แท็บอื่น
let unseen = 0;
bus.on('alert', () => {
  if (document.querySelector('.tab.active').dataset.tab === 'radar') return;
  const b = document.getElementById('radarBadge'); unseen++; b.textContent = unseen; b.hidden = false;
  toast('📡 เรดาร์ตรวจพบบุคคล — ดูที่แท็บเรดาร์');
});
document.querySelector('[data-tab=radar]').addEventListener('click', () => { unseen = 0; });

// ---------- ปุ่มซูม / หมุน ----------
document.getElementById('btnAutoRot').classList.toggle('active', farm.controls.autoRotate);
document.getElementById('zoomCtl').addEventListener('click', e => {
  const b = e.target.closest('[data-zoom]'); if (!b) return;
  if (b.dataset.zoom === 'in') farm.zoomBy(0.55);
  else if (b.dataset.zoom === 'out') farm.zoomBy(1.8);
  else if (b.dataset.zoom === 'labels') return;
  else if (b.dataset.zoom === 'left') farm.rotateBy(-30);
  else if (b.dataset.zoom === 'right') farm.rotateBy(30);
  else if (b.dataset.zoom === 'auto') { farm.setAutoRotate(!farm.controls.autoRotate); b.classList.toggle('active', farm.controls.autoRotate); }
  else { document.querySelectorAll('#camChips .chip').forEach(c => c.classList.toggle('active', c.dataset.cam === 'overview')); farm.flyTo('overview'); }
});
// บอกวิธีซูมครั้งแรกบนมือถือ
try {
  if (farm.touchDevice && !localStorage.getItem('gestureHint2')) {
    const hint = document.getElementById('zoomHint'); hint.hidden = false;
    setTimeout(() => { hint.hidden = true; localStorage.setItem('gestureHint2', '1'); }, 8000);
  }
} catch {}

// ---------- คุณภาพภาพ ----------
const qSel = document.getElementById('qualitySel');
qSel.innerHTML = Object.entries(QUALITY).map(([k, q]) => `<option value="${k}">${q.label}</option>`).join('');
qSel.value = farm.quality;
qSel.addEventListener('change', () => farm.setQuality(qSel.value));
const grassBox = document.getElementById('grassToggle');
grassBox.checked = farm.grassOn;
grassBox.addEventListener('change', () => farm.setGrass(grassBox.checked));

// ---------- เทศกาล ----------
const festSel = document.getElementById('festivalSel');
const todayFest = festivalFor();
festSel.innerHTML = `<option value="auto">อัตโนมัติตามวันที่${todayFest ? ` (วันนี้: ${FESTIVALS[todayFest].name})` : ' (วันนี้ไม่มีเทศกาล)'}</option>`
  + Object.entries(FESTIVALS).map(([id, f]) => `<option value="${id}">ดูตัวอย่าง: ${f.emoji} ${f.name}</option>`).join('')
  + '<option value="off">ปิด</option>';
festSel.value = festivals.mode;
festSel.addEventListener('change', () => festivals.setMode(festSel.value));

// ---------- เมนูจำลองเหตุการณ์ ----------
const setHour = h => {
  realTimeBox.checked = false; clearInterval(realTimer);
  farm.autoTime = false; document.getElementById('autoTime').checked = false;
  farm.setTime(h);
};
const sim = new Simulator({ farm, hub, radar, tour, festivals, setWx: setWxMode, setHour, showTab });

window.app = { farm, radar, hub, bus, sound, ambient, tour, summary, kiosk, festivals, sim };
