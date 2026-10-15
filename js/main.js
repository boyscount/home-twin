// จุดเริ่มของแอป: สลับแท็บ, นาฬิกา, event bus ที่เชื่อม 3D ↔ เรดาร์ ↔ Hub
import { bus, toast } from './bus.js';
import { Farm3D } from './farm3d.js';
import { Radar } from './radar.js';
import { Hub } from './hub.js';

const farm = new Farm3D(document.getElementById('farmCanvas'));
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
document.getElementById('autoTime').addEventListener('change', e => farm.autoTime = e.target.checked);
document.getElementById('fogToggle').addEventListener('change', e => farm.setFog(e.target.checked));
document.getElementById('labelToggle').addEventListener('change', e => farm.setLabels(e.target.checked));
document.getElementById('btnFeed').addEventListener('click', () => bus.emit('cmd', { device: 'pig-feeder', action: 'feed', source: '3D' }));
document.getElementById('btnVisitor').addEventListener('click', () => farm.spawnVisitor());

// badge บนแท็บเรดาร์เมื่อมีคนแปลกหน้าแต่ผู้ใช้อยู่แท็บอื่น
let unseen = 0;
bus.on('alert', () => {
  if (document.querySelector('.tab.active').dataset.tab === 'radar') return;
  const b = document.getElementById('radarBadge'); unseen++; b.textContent = unseen; b.hidden = false;
  toast('📡 เรดาร์ตรวจพบบุคคล — ดูที่แท็บเรดาร์');
});
document.querySelector('[data-tab=radar]').addEventListener('click', () => { unseen = 0; });

window.app = { farm, radar, hub, bus };
