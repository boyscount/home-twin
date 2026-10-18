// ไอคอนเส้นวาดเอง (SVG) แทนอีโมจิ — สไตล์ HUD แฟนตาซีล้ำ ๆ ใช้สีตามข้อความ (currentColor) เรืองแสงด้วย CSS
// ใส่ sprite ครั้งเดียว แล้วแปลงอีโมจิในปุ่ม/เมนู/การ์ดเป็นไอคอนอัตโนมัติ (รวมของที่สร้างทีหลังด้วย MutationObserver)
const P = {
  farm: '<path d="M3 11.5 12 4l9 7.5"/><path d="M5.5 10v10h13V10"/><path d="M10 20v-4.5h4V20"/><path d="M15.5 6.2c1.6-.9 3.3-.6 4 .2-.4 1.6-2 2.6-3.6 2.3"/>',
  radar: '<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="5" opacity=".6"/><path d="M12 12 18.4 5.6"/><circle cx="15.5" cy="9" r="1.1" fill="currentColor" stroke="none"/>',
  hub: '<path d="M12 3.5 19.4 7.8v8.4L12 20.5 4.6 16.2V7.8z"/><circle cx="12" cy="12" r="2.2"/><path d="M12 3.5v6.3M19.4 16.2l-5.5-3.1M4.6 16.2l5.5-3.1" opacity=".6"/>',
  tv: '<rect x="3" y="5" width="18" height="12" rx="2"/><path d="M8 21h8M12 17v4"/><path d="M7 9.5h5" opacity=".6"/>',
  menu: '<path d="M4 7h10M18 7h2M4 12h4M12 12h8M4 17h12M20 17h0"/><circle cx="16" cy="7" r="2"/><circle cx="10" cy="12" r="2"/><circle cx="18" cy="17" r="2"/>',
  tour: '<circle cx="12" cy="12" r="9"/><path d="M10 8.5v7l6-3.5z"/>',
  cam: '<path d="M3.5 8.5 15 6l1.4 5.2-11.5 2.6z"/><path d="M16.4 8.2 20 7.2v4l-3 .8"/><path d="M9 12.8 10.2 17H6.5"/><path d="M6.5 15v4"/>',
  globe: '<circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3c3 3.2 3 14.8 0 18M12 3c-3 3.2-3 14.8 0 18"/>',
  sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2.5v2.5M12 19v2.5M2.5 12H5M19 12h2.5M5.3 5.3l1.8 1.8M16.9 16.9l1.8 1.8M5.3 18.7l1.8-1.8M16.9 7.1l1.8-1.8"/>',
  cloud: '<path d="M7 18h10.5a3.8 3.8 0 0 0 .4-7.6A5.5 5.5 0 0 0 7.3 9.6 4.2 4.2 0 0 0 7 18z"/>',
  rain: '<path d="M7 15h10.5a3.8 3.8 0 0 0 .4-7.6A5.5 5.5 0 0 0 7.3 6.6 4.2 4.2 0 0 0 7 15z"/><path d="M8.5 18l-1 2.5M12.5 18l-1 2.5M16.5 18l-1 2.5"/>',
  storm: '<path d="M7 14h10.5a3.8 3.8 0 0 0 .4-7.6A5.5 5.5 0 0 0 7.3 5.6 4.2 4.2 0 0 0 7 14z"/><path d="M12.5 14l-2.5 4h3l-2 4"/>',
  bolt: '<path d="M13.5 2.5 5.5 13.5h5.5L9.8 21.5l8.2-11h-5.5z"/>',
  fog: '<path d="M4 9c2-1.3 4-1.3 6 0s4 1.3 6 0 3-1 4-.6M4 13c2-1.3 4-1.3 6 0s4 1.3 6 0 3-1 4-.6M4 17c2-1.3 4-1.3 6 0s4 1.3 6 0"/>',
  sunset: '<path d="M3 17h18M6 20.5h12"/><path d="M7 17a5 5 0 0 1 10 0"/><path d="M12 3.5v5m-2.5-2.5L12 8.5 14.5 6"/>',
  moon: '<path d="M19.5 14.5A8 8 0 1 1 9.5 4.5a6.3 6.3 0 0 0 10 10z"/>',
  sleep: '<path d="M16.5 15.5A6.5 6.5 0 1 1 8.5 7.5a5 5 0 0 0 8 8z"/><path d="M15 4h4l-4 4h4" opacity=".7"/>',
  pin: '<path d="M12 21.5s-6.5-6.2-6.5-11.2a6.5 6.5 0 0 1 13 0c0 5-6.5 11.2-6.5 11.2z"/><circle cx="12" cy="10.2" r="2.4"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  minus: '<path d="M5 12h14"/>',
  reset: '<circle cx="12" cy="12" r="7.5"/><circle cx="12" cy="12" r="2"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3"/>',
  tag: '<path d="M3.5 12.3V4.5h7.8l9.2 9.2-7.8 7.8z"/><circle cx="8" cy="9" r="1.5"/>',
  rotl: '<path d="M4.5 9.5A8 8 0 1 1 4 14"/><path d="M4 4.5v5h5"/>',
  rotr: '<path d="M19.5 9.5A8 8 0 1 0 20 14"/><path d="M20 4.5v5h-5"/>',
  orbit: '<circle cx="12" cy="12" r="2.6"/><ellipse cx="12" cy="12" rx="9.5" ry="4.5" transform="rotate(-25 12 12)"/><circle cx="19.2" cy="8.4" r="1.1" fill="currentColor" stroke="none"/>',
  sim: '<path d="M12 2.5c.6 4.5 2 5.9 6.5 6.5-4.5.6-5.9 2-6.5 6.5-.6-4.5-2-5.9-6.5-6.5 4.5-.6 5.9-2 6.5-6.5z"/><path d="M18.5 15c.3 2 .9 2.6 3 3-2.1.4-2.7 1-3 3-.3-2-.9-2.6-3-3 2.1-.4 2.7-1 3-3z" opacity=".75"/>',
  check: '<circle cx="12" cy="12" r="9"/><path d="m7.8 12.3 2.8 2.8 5.6-5.8"/>',
  alert: '<path d="M12 3.5 21.5 20h-19z"/><path d="M12 10v4.5"/><circle cx="12" cy="17.2" r=".9" fill="currentColor" stroke="none"/>',
  siren: '<path d="M6.5 18v-5.5a5.5 5.5 0 0 1 11 0V18"/><path d="M4.5 18h15v2.5h-15z"/><path d="M12 2.5v2M4.2 5.2l1.4 1.4M19.8 5.2l-1.4 1.4"/><path d="M10 13a2 2 0 0 1 2-2" opacity=".7"/>',
  close: '<path d="M6 6l12 12M18 6 6 18"/>',
  hand: '<path d="M8 13V5.5a1.5 1.5 0 0 1 3 0V11V4a1.5 1.5 0 0 1 3 0v7V5.5a1.5 1.5 0 0 1 3 0V14c0 4-2.5 7-6 7-2.6 0-4-1.6-5.4-3.6L3.5 13a1.6 1.6 0 0 1 2.6-1.8z"/>',
  walk: '<circle cx="13" cy="4.5" r="1.8"/><path d="M10 21l2.2-6 2.6 2.5V21M8.5 11.5 11.5 8l3 2.8 2.5.7M11.5 8l.7 7"/>',
  wave: '<circle cx="9" cy="8" r="3.2"/><path d="M3 20a6 6 0 0 1 12 0"/><path d="M17 6.5c1.4.6 2.4 1.8 2.6 3.3M16.5 10c.6.3 1 .9 1.1 1.6" opacity=".8"/>',
  book: '<path d="M12 6.5C10 5 7 4.5 4 5v13c3-.5 6 0 8 1.5 2-1.5 5-2 8-1.5V5c-3-.5-6 0-8 1.5zM12 6.5v13"/>',
  fish: '<path d="M3 12c3-4.5 8.5-6 13-2.5L21 6v12l-5-3.5C11.5 18 6 16.5 3 12z"/><circle cx="8" cy="11" r=".9" fill="currentColor" stroke="none"/>',
  hook: '<path d="M14 3v11.5a4 4 0 0 1-8 0V12l2.5 2"/><circle cx="14" cy="3" r="1.2"/>',
  car: '<path d="M3.5 16.5v-4l2-5h13l2 5v4z"/><path d="M3.5 12.5h17"/><circle cx="7.5" cy="16.8" r="1.8"/><circle cx="16.5" cy="16.8" r="1.8"/>',
  homein: '<path d="M4 11 12 4l8 7M6 10v10h12V10"/><path d="M9 15h6m-2.5-2.5L15 15l-2.5 2.5"/>',
  flame: '<path d="M12 21.5c-4 0-6.5-2.6-6.5-6 0-4 3.5-5.5 4-10 2.7 1.8 4 4 4 6 .8-.6 1.4-1.6 1.6-2.8 1.8 1.6 3.4 4 3.4 6.8 0 3.4-2.5 6-6.5 6z"/><path d="M12 21.5c-1.7 0-2.8-1.1-2.8-2.7 0-1.8 1.6-2.4 2.3-4.3 1.6 1 3.3 2.4 3.3 4.3 0 1.6-1.1 2.7-2.8 2.7z" opacity=".7"/>',
  stars: '<path d="M9 3l1.4 3.6L14 8l-3.6 1.4L9 13l-1.4-3.6L4 8l3.6-1.4z"/><path d="M17 12l.9 2.1 2.1.9-2.1.9L17 18l-.9-2.1L14 15l2.1-.9zM18 3.5l.5 1.2 1.2.5-1.2.5-.5 1.2-.5-1.2-1.2-.5 1.2-.5z" opacity=".75"/>',
  chair: '<path d="M7 3.5v9h10v-9M5.5 12.5h13v3h-13zM7 15.5v5M17 15.5v5"/>',
  pig: '<ellipse cx="11.5" cy="13" rx="7" ry="5.5"/><path d="M18.5 12h2v3h-2M7 8.5 6 5l3.2 2.2M8 18.5V21M15 18.5V21"/><circle cx="9" cy="11.5" r=".8" fill="currentColor" stroke="none"/>',
  egg: '<path d="M12 21c-3.9 0-6.5-2.6-6.5-6.6C5.5 9.2 8.4 3.5 12 3.5s6.5 5.7 6.5 10.9c0 4-2.6 6.6-6.5 6.6z"/>',
  paw: '<circle cx="7" cy="9" r="1.8"/><circle cx="11" cy="5.8" r="1.8"/><circle cx="15.5" cy="6.5" r="1.8"/><circle cx="18.5" cy="10.5" r="1.8"/><path d="M8.5 17.5c0-3 2.4-5.5 4.6-5.5 2.6 0 4.4 2.9 4.4 5.2 0 2.1-1.8 3.3-4.3 2.7-1.8-.4-2.8.6-3.4.6-1 0-1.3-1.5-1.3-3z"/>',
  users: '<circle cx="9" cy="8" r="3"/><path d="M3.5 19a5.5 5.5 0 0 1 11 0"/><circle cx="16.5" cy="9" r="2.4" opacity=".75"/><path d="M15.5 14a4.6 4.6 0 0 1 5.5 4.5" opacity=".75"/>',
  clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3.5 2"/>',
  torch: '<path d="M4 9.5 9.5 4l6.5 6.5L10.5 16z"/><path d="M13.2 13.3 19 19a1.4 1.4 0 0 1-2 2l-5.8-5.7"/><path d="M3 4l2 1M5.5 1.8l.6 2M1.8 6.5l2-.3" opacity=".75"/>',
  leaf: '<path d="M4 20c0-9 6-15 16-16-.5 10-6.5 16-15.5 16z"/><path d="M4 20 13 11"/>',
  drop: '<path d="M12 3s6.5 7 6.5 11.5a6.5 6.5 0 0 1-13 0C5.5 10 12 3 12 3z"/><path d="M9 15a3 3 0 0 0 3 3" opacity=".7"/>',
  bubbles: '<circle cx="9" cy="15" r="4"/><circle cx="16.5" cy="8.5" r="2.8"/><circle cx="17" cy="17.5" r="1.6"/><circle cx="9.5" cy="6" r="1.4" opacity=".75"/>',
  grain: '<path d="M12 21V8M12 8c-2.5-.5-3.5-2.5-3.5-4.5C11 4 12 6 12 8zm0 0c2.5-.5 3.5-2.5 3.5-4.5C13 4 12 6 12 8zM12 13c-2.8-.3-4-2.3-4-4.3 2.8.2 4 2.2 4 4.3zm0 0c2.8-.3 4-2.3 4-4.3-2.8.2-4 2.2-4 4.3zM12 18c-2.8-.3-4-2.3-4-4.3 2.8.2 4 2.2 4 4.3zm0 0c2.8-.3 4-2.3 4-4.3-2.8.2-4 2.2-4 4.3z"/>',
  temp: '<path d="M10 14V5a2 2 0 0 1 4 0v9a4 4 0 1 1-4 0z"/><path d="M12 9v7"/>',
  bulb: '<path d="M9 17h6M10 20.5h4M12 3a6 6 0 0 1 3.7 10.7c-.8.7-1.2 1.5-1.2 2.3V17h-5v-1c0-.8-.4-1.6-1.2-2.3A6 6 0 0 1 12 3z"/>',
  gate: '<path d="M3 20.5V5h18v15.5M3 9.5h18M8 9.5v11M13 9.5v11M18 9.5v11"/>',
  bird: '<path d="M4 15c0-5 3.5-8.5 8-8.5 2.6 0 4.5 1.5 5.5 3.5L21 11l-3.3 1.2C17 16.5 14 19 10 19c-3.4 0-6-1.6-6-4z"/><path d="M9 14c1.5 1.2 3.4 1.4 5 .5" opacity=".7"/><circle cx="15" cy="9.5" r=".8" fill="currentColor" stroke="none"/>',
  spin: '<path d="M12 12c0-4 2-7 5-7 2 0 3 1.5 3 3 0 3-4 4-8 4zm0 0c4 0 7 2 7 5 0 2-1.5 3-3 3-3 0-4-4-4-8zm0 0c0 4-2 7-5 7-2 0-3-1.5-3-3 0-3 4-4 8-4zm0 0c-4 0-7-2-7-5 0-2 1.5-3 3-3 3 0 4 4 4 8z"/>',
  film: '<rect x="3.5" y="4.5" width="17" height="15" rx="2"/><path d="M3.5 9h17M3.5 15h17M8 4.5v4.5M12 4.5v4.5M16 4.5v4.5M8 15v4.5M12 15v4.5M16 15v4.5"/>',
  burst: '<path d="M12 3v4M12 17v4M3 12h4M17 12h4M5.6 5.6l2.8 2.8M15.6 15.6l2.8 2.8M5.6 18.4l2.8-2.8M15.6 8.4l2.8-2.8"/><circle cx="12" cy="12" r="1.6" fill="currentColor" stroke="none"/>',
  lotus: '<path d="M12 19c-2.5-2-3.5-5-3.5-8 0-2.5 1.5-5 3.5-6.5 2 1.5 3.5 4 3.5 6.5 0 3-1 6-3.5 8z"/><path d="M12 19c-4 0-7.5-2.4-8.5-6 2.4-.5 4.4.1 5.8 1.4M12 19c4 0 7.5-2.4 8.5-6-2.4-.5-4.4.1-5.8 1.4"/><path d="M5 21h14" opacity=".7"/>',
  splash: '<path d="M8 3s3.5 4 3.5 6.5a3.5 3.5 0 0 1-7 0C4.5 7 8 3 8 3zM16.5 9s3 3.5 3 5.6a3 3 0 0 1-6 0c0-2.1 3-5.6 3-5.6zM9 17.5s2.2 2.4 2.2 3.8a2.2 2.2 0 0 1-4.4 0c0-1.4 2.2-3.8 2.2-3.8z"/>',
  undo: '<path d="M9 7.5 4.5 12 9 16.5"/><path d="M5 12h9.5a5 5 0 0 1 0 10H12"/>',
  tree: '<path d="M12 21.5V13M12 13c-4.5 0-7-2.5-7-5.5a7 7 0 0 1 14 0c0 3-2.5 5.5-7 5.5z"/><path d="M12 16l-3-2M12 15l3-2.5" opacity=".7"/>',
  shield: '<path d="M12 3 19.5 6v6c0 4.5-3.3 8-7.5 9.5C7.8 20 4.5 16.5 4.5 12V6z"/><path d="m8.8 12.2 2.3 2.3 4.3-4.6"/>',
  weather: '<circle cx="9" cy="8.5" r="3.2"/><path d="M9 2.5v1.3M3 8.5h1.3M4.8 4.3l.9.9M13.2 4.3l-.9.9"/><path d="M9.5 19.5h8.2a3.2 3.2 0 0 0 .3-6.4 4.6 4.6 0 0 0-8.5-.6 3.5 3.5 0 0 0 0 7z"/>',
  flask: '<path d="M9.5 3.5h5M10.5 3.5v6L4.8 19a1.5 1.5 0 0 0 1.3 2.3h11.8a1.5 1.5 0 0 0 1.3-2.3L13.5 9.5v-6"/><path d="M7.2 15h9.6" opacity=".7"/>',
  clip: '<rect x="5" y="4.5" width="14" height="17" rx="2"/><path d="M9 4.5V3h6v1.5M8.5 10h7M8.5 14h7M8.5 18h4"/>',
  bell: '<path d="M6 16V11a6 6 0 0 1 12 0v5l1.5 2h-15z"/><path d="M10 20.5a2 2 0 0 0 4 0"/>',
  chip: '<rect x="6.5" y="6.5" width="11" height="11" rx="1.5"/><rect x="9.5" y="9.5" width="5" height="5" rx=".8" opacity=".7"/><path d="M9.5 3v3.5M14.5 3v3.5M9.5 17.5V21M14.5 17.5V21M3 9.5h3.5M3 14.5h3.5M17.5 9.5H21M17.5 14.5H21"/>',
  energy: '<rect x="3" y="7" width="16" height="10" rx="2"/><path d="M21 10.5v3"/><path d="M11.5 8.5 8.5 12.5h3.5l-1 3.5 3.5-4.5H11z"/>',
  rice: '<path d="M12 21.5V9"/><path d="M12 9c-1-2-1-4 0-6 1 2 1 4 0 6zM12 12.5c-2-.5-3.2-2-3.4-4 2 .4 3.2 2 3.4 4zM12 12.5c2-.5 3.2-2 3.4-4-2 .4-3.2 2-3.4 4zM12 16.5c-2.2-.4-3.6-2-3.8-4.2 2.2.4 3.6 2 3.8 4.2zM12 16.5c2.2-.4 3.6-2 3.8-4.2-2.2.4-3.6 2-3.8 4.2z"/>',
  bowl: '<path d="M3.5 11.5h17a8.5 8.5 0 0 1-17 0z"/><path d="M8 8c.5-1.5 2-2.5 4-2.5s3.5 1 4 2.5" opacity=".7"/><path d="M9 20.5h6"/>',
  door: '<path d="M5 21V4.5L15 3v18M5 21h14M15 6h4v15"/><circle cx="12" cy="12.5" r=".9" fill="currentColor" stroke="none"/>',
  vortex: '<path d="M20 12a8 8 0 1 1-8-8c3.5 0 6 2.5 6 5.5S15.8 15 13 15s-4.5-1.8-4.5-4 1.5-3.5 3.3-3.5"/>',
  sensor: '<circle cx="12" cy="12" r="2"/><path d="M8.5 15.5a5 5 0 0 1 0-7M15.5 8.5a5 5 0 0 1 0 7M5.6 18.4a9 9 0 0 1 0-12.8M18.4 5.6a9 9 0 0 1 0 12.8"/>',
  home: '<path d="M4 11 12 4l8 7M6.5 10v10h11V10"/>',
  send: '<path d="M21 3.5 3 10.5l7 2.5 2.5 7z"/><path d="M21 3.5 10 13"/>',
};
// อีโมจิ → ชื่อไอคอน
const MAP = {
  '🏡': 'farm', '📡': 'radar', '🛰️': 'hub', '📺': 'tv', '☰': 'menu', '🎬': 'tour', '📹': 'cam', '🌐': 'globe', '☀️': 'sun', '☁️': 'cloud', '🌧️': 'rain', '⛈️': 'storm',
  '📍': 'pin', '＋': 'plus', '−': 'minus', '⌂': 'reset', '🏷️': 'tag', '⟲': 'rotl', '⟳': 'rotr', '🔄': 'orbit', '🎮': 'sim', '✅': 'check', '🚨': 'siren', '✕': 'close',
  '✋': 'hand', '🚶': 'walk', '👋': 'wave', '📚': 'book', '🎣': 'hook', '🚗': 'car', '🏠': 'homein', '🍖': 'flame', '🌌': 'stars', '🪑': 'chair', '🐖': 'pig', '🐟': 'fish',
  '🥚': 'egg', '🐕': 'paw', '⚡': 'bolt', '🌫️': 'fog', '🌇': 'sunset', '🌙': 'moon', '💤': 'sleep', '🔦': 'torch', '🥬': 'leaf', '💧': 'drop', '🌾': 'rice', '🌡️': 'temp',
  '💡': 'bulb', '🚪': 'door', '🐔': 'bird', '🌀': 'vortex', '🫧': 'bubbles', '🎆': 'burst', '🪷': 'lotus', '💦': 'splash', '↩️': 'undo', '👥': 'users', '🐾': 'paw',
  '🌦️': 'weather', '🕒': 'clock', '⚠️': 'alert', '🌤️': 'weather', '🌳': 'tree', '🛡️': 'shield', '🧪': 'flask', '📋': 'clip', '🍚': 'bowl', '🔔': 'bell', '🌱': 'leaf', '📲': 'send', '🕒': 'clock', '⚠': 'alert', '🐷': 'pig', '🧑‍🌾': 'users', '👀': 'radar', '🌅': 'sunset', '🌃': 'moon', '🌊': 'splash', '🏍️': 'car', '🚜': 'car', '🐄': 'paw', '🦆': 'bird', '🐓': 'bird', '🌈': 'weather',
};
const ICON_RE = new RegExp('^\\s*(' + Object.keys(MAP).map(k => k.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|') + ')\\uFE0F?\\s*');
export const icon = (name, cls = '') => `<svg class="ic ${cls}" viewBox="0 0 24 24" aria-hidden="true"><use href="#i-${name}"/></svg>`;

function sprite() {
  if (document.getElementById('iconSprite')) return;
  const div = document.createElement('div');
  div.innerHTML = `<svg id="iconSprite" xmlns="http://www.w3.org/2000/svg" style="position:absolute;width:0;height:0;overflow:hidden" aria-hidden="true">` +
    Object.entries(P).map(([k, d]) => `<symbol id="i-${k}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">${d}</symbol>`).join('') + '</svg>';
  document.body.prepend(div.firstChild);
}
// แปลงอีโมจิตัวแรกของข้อความในองค์ประกอบที่กำหนดเป็นไอคอน
const SEL = 'button, .sim-ico, .ico, .sim-panel h4, .sim-head b, .lite-ico, .ac-title, summary, label.check, .tc-kicker, .tc-title';
function convert(el) {
  if (el.dataset.iconized === '1' && el.querySelector(':scope > svg.ic, :scope > .ic')) return;
  for (const node of [...el.childNodes]) {
    if (node.nodeType !== 3) continue;
    const m = node.nodeValue.match(ICON_RE); if (!m) continue;
    const name = MAP[m[1]]; if (!name) continue;
    const span = document.createElement('span'); span.className = 'ic-wrap'; span.innerHTML = icon(name);
    node.nodeValue = node.nodeValue.slice(m[0].length);
    el.insertBefore(span.firstChild, node);
    el.dataset.iconized = '1';
    break;
  }
}
function scan(root) {
  if (root.nodeType !== 1) return;
  if (root.matches?.(SEL)) convert(root);
  root.querySelectorAll?.(SEL).forEach(convert);
}
export function initIcons() {
  sprite();
  scan(document.body);
  let queued = new Set(), timer = 0;
  new MutationObserver(list => {
    for (const m of list) {
      if (m.type === 'childList') m.addedNodes.forEach(n => queued.add(n.nodeType === 3 ? n.parentElement : n));
      else if (m.type === 'characterData') queued.add(m.target.parentElement);
    }
    if (!timer) timer = requestAnimationFrame(() => { timer = 0; const q = queued; queued = new Set(); q.forEach(n => n && scan(n.closest?.(SEL) || n)); });
  }).observe(document.body, { childList: true, subtree: true, characterData: true });
}
