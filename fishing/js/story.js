// โหมดเนื้อเรื่อง: วันต่อวัน · ดวงประจำวัน · ข้องปลา · เงิน · ความสุขของครอบครัว · ปลดล็อกด่าน · อุปกรณ์ · เป้าหมาย
import { SPECIES, byId } from './fish.js';

export const STAGES = [
  { id: 'paddy', name: 'บ่อปลาทุ่งนา', icon: '🌾', price: 0, desc: 'บ่อใหญ่กลางทุ่งข้าว ปลาบ้าน ๆ ตกง่าย บรรยากาศสบาย',
    go: 'เดินตามคันนาไปบ่อปลาหลังบ้าน…', back: 'เดินลัดทุ่งข้าวกลับบ้าน ควายเดินตามหลัง…', bg: 'linear-gradient(135deg,#c8e27a,#6aa84f)' },
  { id: 'falls', name: 'น้ำตกสายหมอก', icon: '💧', price: 0, desc: 'แอ่งน้ำใสใต้น้ำตกหลังหมู่บ้าน ปลาน้ำจืดคุ้นเคย',
    go: 'เดินลัดทุ่งนาไปน้ำตก…', back: 'เดินกลับบ้านตามคันนา ฟังเสียงจิ้งหรีด…', bg: 'linear-gradient(135deg,#9fd8c8,#5aa88a)' },
  { id: 'forest', name: 'ลำธารป่าลึก', icon: '🌲', price: 300, unlock: 'ซื้อมีดเดินป่ากับไฟฉาย', desc: 'ลำธารเย็นเฉียบกลางป่าดิบ มีปลาภูเขาหายาก',
    go: 'เดินลึกเข้าไปในป่า ตามเสียงลำธาร…', back: 'เดินออกจากป่าก่อนมืด หิ่งห้อยนำทาง…', bg: 'linear-gradient(135deg,#7fb08a,#2f5e3e)' },
  { id: 'beach', name: 'หาดหินปะการัง', icon: '🏝️', price: 900, unlock: 'ซื้อรถมอเตอร์ไซค์มือสอง', desc: 'ชายหาดน้ำใส แนวปะการัง ปลาทะเลชายฝั่ง',
    go: 'ขี่มอเตอร์ไซค์เลียบชายฝั่ง ลมทะเลเย็นสบาย…', back: 'ขี่รถกลับบ้าน พระอาทิตย์ตกลงทะเล…', bg: 'linear-gradient(135deg,#a8ecf0,#3fb0c8)' },
  { id: 'sea', name: 'ออกทะเลเรือหางยาว', icon: '⛵', price: 2200, unlock: 'ซื้อเรือหางยาวต่อจากลุงเปี๊ยก', desc: 'ล่องเรือออกไปไกลฝั่ง ปลาใหญ่ราคาดี',
    go: 'ติดเครื่องเรือหางยาว แล่นฝ่าคลื่นออกจากฝั่ง…', back: 'แล่นเรือกลับฝั่ง ฝูงนกบินกลับรัง…', bg: 'linear-gradient(135deg,#7cc4f0,#2a6fb0)' },
];
export const stageById = Object.fromEntries(STAGES.map(s => [s.id, s]));

export const UPGRADES = [
  { id: 'basket', name: 'ข้องใบใหญ่', icon: '🧺', price: 250, desc: 'ใส่ปลาได้ 14 ตัว (เดิม 8)' },
  { id: 'bait', name: 'เหยื่อหมักสูตรพ่อ', icon: '🪱', price: 350, desc: 'ปลากินเหยื่อเร็วขึ้น · ได้ขยะน้อยลง' },
  { id: 'rod', name: 'คันเบ็ดไฟเบอร์', icon: '🎣', price: 500, desc: 'สายตึงช้าลง ดึงปลาตัวใหญ่ง่ายขึ้น' },
];

export const GOALS = [
  { text: 'ซ่อมหลังคาบ้านก่อนหน้าฝน', icon: '🏠', cost: 1500, done: 'หลังคาใหม่แล้ว! ฝนตกก็ไม่รั่วอีกต่อไป' },
  { text: 'ซื้อจักรยานให้ลูกปั่นไปโรงเรียน', icon: '🚲', cost: 3000, done: 'ลูกปั่นจักรยานไปโรงเรียนอย่างภูมิใจ' },
  { text: 'พาครอบครัวไปเที่ยวงานวัด', icon: '🎡', cost: 5000, done: 'ทั้งบ้านได้ชิงช้าสวรรค์ ขนมสายไหม และรอยยิ้มเต็มหน้า' },
];

export const LUCKS = [
  { id: 'great', p: 0.15, icon: '☀️', text: 'ฟ้าใส ลมเย็น — วันนี้ปลาชุมมาก!', bite: 0.6, junk: 0.04, sun: 1.0 },
  { id: 'normal', p: 0.5, icon: '⛅', text: 'อากาศดี ปลากินเหยื่อตามปกติ', bite: 1, junk: 0.08, sun: 0.9 },
  { id: 'slow', p: 0.23, icon: '☁️', text: 'ฟ้าครึ้ม ปลาไม่ค่อยกินเหยื่อ', bite: 1.8, junk: 0.16, sun: 0.55 },
  { id: 'bad', p: 0.12, icon: '🌧️', text: 'ฝนพรำ น้ำขุ่น… วันนี้อาจไม่ได้ปลาเลย', bite: 3.4, junk: 0.4, sun: 0.35, rain: true },
];
export const luckById = Object.fromEntries(LUCKS.map(l => [l.id, l]));

export const DAY_START = 6, DAY_END = 18, NIGHT_END = 22, HOURS_PER_SEC = 12 / 420;   // หนึ่งวัน = 7 นาทีจริง · ตกต่อกลางคืนได้ถึง 4 ทุ่ม
export const NEED_KG = 1.2;                                              // ครอบครัวต้องการปลาเท่านี้ถึงจะอิ่ม

const KEY = 'cozyfish.story.v1';
const fresh = () => ({ v: 1, day: 1, money: 0, happy: 70, unlocked: { paddy: true, falls: true }, up: {}, goal: 0, market: {}, hot: null, dexReward: {}, basket: [], luck: 'normal', time: DAY_START, phase: 'new', stage: null, stats: { caught: 0, junk: 0, sold: 0, grilled: 0, empty: 0, earned: 0 }, endingSeen: false });
export let S = load();
function load() {
  try { const d = JSON.parse(localStorage.getItem(KEY)); if (d && d.v === 1) return Object.assign(fresh(), d); } catch (e) { /* ไม่มีหรือเสีย */ }
  return fresh();
}
export function saveState() { return S; }
export function save() { try { localStorage.setItem(KEY, JSON.stringify(S)); } catch (e) { /* โหมดส่วนตัว */ } }
export function resetStory() { S = fresh(); save(); return S; }

// ---------- ราคาตลาด: เปลี่ยนทุกเช้า ±35% และมีปลา "ราคาพิเศษ" 1 ชนิด (x1.8) ----------
export const HOT_MUL = 1.8;
export function rollMarket() {
  S.market = {};
  for (const sp of SPECIES) S.market[sp.id] = +(0.65 + Math.random() * 0.7).toFixed(2);
  const pool = SPECIES.filter(sp => S.unlocked[sp.stage] && !sp.rare);
  S.hot = pool.length ? pool[Math.floor(Math.random() * pool.length)].id : null;
}
S.unlocked.paddy = true;                 // เซฟเก่าก่อนมีบ่อปลาทุ่งนา
if (!S.market || !Object.keys(S.market).length || !S.market.kradi) rollMarket();
export const priceOf = id => Math.round(byId[id].price * (S.market[id] || 1) * (S.hot === id ? HOT_MUL : 1));
export const value = f => Math.round(f.kg * priceOf(f.id));
export const trend = id => { const m = (S.market[id] || 1) * (S.hot === id ? HOT_MUL : 1); return m >= 1.12 ? 'up' : m <= 0.88 ? 'down' : 'flat'; };

// ---------- รางวัลสมุดสะสม: พบครบทุกชนิดในด่าน ----------
export const DEX_REWARD = { paddy: 200, falls: 300, forest: 600, beach: 900, sea: 1500 };
export function claimDexRewards(dex) {
  const got = [];
  for (const st of STAGES) {
    if (S.dexReward[st.id]) continue;
    const all = SPECIES.filter(sp => sp.stage === st.id);
    if (all.every(sp => dex.dex[sp.id])) { S.dexReward[st.id] = true; S.money += DEX_REWARD[st.id]; got.push(st); }
  }
  if (got.length) save();
  return got;
}

export const capacity = () => (S.up.basket ? 14 : 8);
export const luck = () => luckById[S.luck] || LUCKS[1];
export function rollLuck() {
  rollMarket();
  if (S.day === 1) { S.luck = 'normal'; return; }
  let r = Math.random();
  for (const l of LUCKS) { r -= l.p; if (r <= 0) { S.luck = l.id; return; } }
  S.luck = 'normal';
}
export const biteMul = () => luck().bite * (S.up.bait ? 0.7 : 1) * (S.happy >= 75 ? 0.9 : 1);
export const junkChance = () => luck().junk * (S.up.bait ? 0.6 : 1);
export const isNight = h => h >= 18.5 || h < 5;
export const fmtTime = h => `${String(Math.floor(h)).padStart(2, '0')}:${String(Math.floor((h % 1) * 60)).padStart(2, '0')}`;
export const baht = n => '฿' + Math.round(n).toLocaleString('th-TH');

// ผลของมื้อเย็น: choices[i] = 'grill' | 'sell'
export function settleEvening(choices) {
  let fed = 0, earned = 0, nGrill = 0, nSell = 0;
  S.basket.forEach((f, i) => {
    if (choices[i] === 'grill') { fed += f.kg; nGrill++; } else { earned += value(f); nSell++; }
  });
  let dh, mood;
  if (!S.basket.length) { dh = -8; mood = 'empty'; S.stats.empty++; }
  else if (fed >= NEED_KG) { dh = 12; mood = 'full'; }
  else if (fed > 0) { dh = 4; mood = 'some'; }
  else { dh = -5; mood = 'sold'; }
  S.happy = Math.max(0, Math.min(100, S.happy + dh));
  S.money += earned;
  S.stats.earned = (S.stats.earned || 0) + earned;
  S.stats.sold += nSell; S.stats.grilled += nGrill;
  const grilled = S.basket.filter((_, i) => choices[i] === 'grill');
  S.basket = [];
  save();
  return { fed, earned, dh, mood, grilled, nGrill, nSell };
}

export const EVENING_LINES = {
  full: [['แม่', 'ปลาปิ้งหอมไปทั้งซอยเลยพ่อ อิ่มแปล้กันทั้งบ้าน 😋'], ['ลูก', 'พ่อเก่งที่สุดในโลก! พรุ่งนี้ไปด้วยได้ไหม']],
  some: [['แม่', 'วันนี้พอได้กินกันบ้าง แบ่งกันคนละนิดก็อร่อยนะ'], ['ลูก', 'อยากกินอีกตัวจัง… พรุ่งนี้พ่อตกตัวใหญ่ ๆ นะ']],
  sold: [['ลูก', 'ขายหมดเลยเหรอพ่อ… ไม่เป็นไร กินข้าวกับน้ำพริกก็ได้'], ['แม่', 'เก็บเงินไว้ซ่อมบ้านก็ดี แต่อย่าลืมเผื่อท้องตัวเองบ้างนะ']],
  empty: [['แม่', 'วันนี้ไม่ได้ปลาเลยเหรอ… ไม่เป็นไรนะพ่อ แม่ต้มไข่กับผักลวกไว้แล้ว'], ['ลูก', 'พรุ่งนี้ปลาต้องกินเหยื่อแน่ ๆ พ่อสู้ ๆ!']],
};
export const INTRO = [
  ['แม่', 'พ่อจ๋า เมื่อคืนฝนตก หลังคารั่วอีกแล้วนะ 🌧️'],
  ['ลูก', 'พ่อ ๆ ไปตกปลามาปิ้งกินกันเถอะ หนูหิว!'],
  ['พ่อ', 'ได้เลย วันนี้พ่อจะไปตกปลาที่บ่อกลางทุ่งนา หรือจะไปน้ำตกหลังหมู่บ้านก็ได้'],
  ['แม่', 'ได้ปลามาเยอะ ๆ ก็แบ่งปิ้งกินบ้าง ขายตลาดบ้าง เก็บเงินซ่อมหลังคานะ'],
  ['พ่อ', 'แต่บางวันปลาก็ไม่กินเหยื่อนะ… ไม่เป็นไร ค่อย ๆ เก็บไปทีละวัน'],
];

// ---------- กล่องบทสนทนา ----------
const $ = id => document.getElementById(id);
const FACES = { 'แม่': '👩🏻', 'ลูก': '👧🏻', 'พ่อ': '👨🏻‍🌾', 'ลุงเปี๊ยก': '👴🏽' };
export function dialog(lines) {
  return new Promise(res => {
    const box = $('dialog');
    let i = 0;
    const show = () => {
      const [who, text] = lines[i];
      box.querySelector('.who').textContent = (FACES[who] || '💬') + ' ' + who;
      box.querySelector('.say').textContent = text;
    };
    const next = e => {
      if (e) e.stopPropagation();
      i++;
      if (i >= lines.length) { box.classList.add('hidden'); box.onclick = null; removeEventListener('keydown', key); res(); return; }
      show();
    };
    const key = e => { if (e.code === 'Space' || e.code === 'Enter') { e.preventDefault(); next(); } };
    box.onclick = next;
    addEventListener('keydown', key);
    box.classList.remove('hidden');
    show();
  });
}

// ---------- จอมืดระหว่างเดินทาง ----------
export function fade(text, during) {
  return new Promise(res => {
    const f = $('fade');
    f.querySelector('.ftext').textContent = text;
    f.classList.remove('hidden');
    requestAnimationFrame(() => f.classList.add('on'));
    setTimeout(async () => {
      if (during) await during();
      setTimeout(() => {
        f.classList.remove('on');
        setTimeout(() => { f.classList.add('hidden'); res(); }, 600);
      }, 900);
    }, 650);
  });
}

// ---------- แผนที่ (เลือกที่ตกปลา + ร้านค้า + เป้าหมาย) ----------
export const allUnlocked = () => STAGES.every(s => S.unlocked[s.id]);
export function showMap({ onGo, dexCount, sfx, dexKnown = () => true, onEnding = null }) {
  const m = $('map');
  const render = () => {
    const L = luck();
    const g = GOALS[S.goal];
    $('mapDay').textContent = `เช้าวันที่ ${S.day}`;
    $('mapLuck').textContent = `${L.icon} ${L.text}`;
    $('mapMoney').textContent = baht(S.money);
    $('mapHappy').innerHTML = `${S.happy >= 75 ? '😊' : S.happy >= 40 ? '🙂' : '😟'} ครอบครัว <b>${S.happy}%</b>`;
    $('mapGoal').innerHTML = g
      ? `<div class="gtxt">${g.icon} เป้าหมาย: <b>${g.text}</b></div><div class="gbar"><i style="width:${Math.min(100, S.money / g.cost * 100)}%"></i></div>
         <div class="grow"><span>${baht(S.money)} / ${baht(g.cost)}</span><button class="mini" id="payGoal" ${S.money >= g.cost && (S.goal < GOALS.length - 1 || allUnlocked()) ? '' : 'disabled'}>จ่ายเลย</button></div>
         ${S.goal === GOALS.length - 1 && !allUnlocked() ? '<div class="glock">🔒 ต้องปลดล็อกที่ตกปลาครบทุกด่านก่อน ถึงจะพาครอบครัวไปงานวัดได้</div>' : ''}`
      : '<div class="gtxt">🌟 ทำครบทุกเป้าหมายแล้ว! ตกปลาสบาย ๆ ได้ตลอดไป</div>';
    const hot = S.hot && byId[S.hot];
    const seen = SPECIES.filter(sp => S.unlocked[sp.stage]);
    $('mapMarket').innerHTML = (hot ? `<div class="hotFish">🔥 วันนี้แม่ค้ารับซื้อ <b>${hot.name}</b> ราคาพิเศษ <b>${baht(priceOf(hot.id))}</b>/กก.</div>` : '') +
      `<details><summary>📈 ดูราคาตลาดวันนี้ (${seen.length} ชนิด)</summary><div class="priceList">${seen.map(sp => {
        const tr = trend(sp.id);
        return `<div class="priceRow ${S.hot === sp.id ? 'hot' : ''}"><span>${stageById[sp.stage].icon} ${dexKnown(sp.id) ? sp.name : '???'}</span><b>${baht(priceOf(sp.id))}<i class="tr ${tr}">${tr === 'up' ? '▲' : tr === 'down' ? '▼' : '•'}</i></b></div>`;
      }).join('')}</div></details>`;
    $('mapStages').innerHTML = STAGES.map(s => {
      const open = S.unlocked[s.id];
      const n = dexCount(s.id);
      return `<button class="stage ${open ? '' : 'locked'}" data-id="${s.id}" style="background:${s.bg}">
        <span class="sicon">${s.icon}</span><span class="sname">${s.name}</span>
        <span class="sdesc">${open ? s.desc : `🔒 ${s.unlock}`}</span>
        <span class="sfoot">${open ? `🐟 พบแล้ว ${n[0]}/${n[1]} ชนิด` : `<b>${baht(s.price)}</b> ${S.money >= s.price ? '· แตะเพื่อซื้อ' : ''}`}</span></button>`;
    }).join('');
    $('mapShop').innerHTML = UPGRADES.map(u => `<button class="shopItem ${S.up[u.id] ? 'owned' : ''}" data-up="${u.id}" ${S.up[u.id] || S.money < u.price ? 'disabled' : ''}>
      <span class="uicon">${u.icon}</span><span class="utext"><b>${u.name}</b><small>${u.desc}</small></span><span class="uprice">${S.up[u.id] ? 'มีแล้ว ✓' : baht(u.price)}</span></button>`).join('');
    const pay = $('payGoal');
    if (pay) pay.onclick = async () => {
      if (S.money < g.cost) return;
      if (S.goal === GOALS.length - 1 && !allUnlocked()) return;
      S.money -= g.cost; S.goal++; save(); sfx.catch(true);
      m.classList.add('hidden');
      if (S.goal >= GOALS.length && onEnding) { onEnding(); return; }
      await dialog([['แม่', g.done], ['ลูก', 'เย้! ขอบคุณนะพ่อ ❤️']]);
      m.classList.remove('hidden');
      render();
    };
  };
  m.onclick = e => {
    const st = e.target.closest('.stage');
    if (st) {
      const s = stageById[st.dataset.id];
      if (S.unlocked[s.id]) { m.classList.add('hidden'); sfx.click(); onGo(s.id); return; }
      if (S.money >= s.price) { S.money -= s.price; S.unlocked[s.id] = true; save(); sfx.catch(false); render(); }
      else { sfx.escape(); st.classList.add('nope'); setTimeout(() => st.classList.remove('nope'), 400); }
      return;
    }
    const u = e.target.closest('.shopItem');
    if (u && !u.disabled) {
      const up = UPGRADES.find(x => x.id === u.dataset.up);
      if (S.money >= up.price && !S.up[up.id]) { S.money -= up.price; S.up[up.id] = true; save(); sfx.catch(false); render(); }
    }
  };
  render();
  m.classList.remove('hidden');
}

// ---------- มื้อเย็นที่บ้าน: เลือกปิ้งหรือขาย ----------
export function showEvening({ onDone, thumbs, sfx }) {
  const p = $('evening');
  // ค่าเริ่มต้น: ปิ้งตัวที่ราคาต่อกิโลถูกที่สุดก่อน จนพอให้ครอบครัวอิ่ม ที่เหลือขาย
  const choices = S.basket.map(() => 'sell');
  let fed0 = 0;
  for (const i of S.basket.map((f, i) => i).sort((a, b) => byId[S.basket[a].id].price - byId[S.basket[b].id].price)) {
    if (fed0 >= NEED_KG) break;
    choices[i] = 'grill'; fed0 += S.basket[i].kg;
  }
  const render = () => {
    let fed = 0, earn = 0;
    S.basket.forEach((f, i) => { if (choices[i] === 'grill') fed += f.kg; else earn += value(f); });
    $('eveList').innerHTML = S.basket.length ? S.basket.map((f, i) => {
      const sp = byId[f.id];
      return `<div class="eveRow"><img src="${thumbs[f.id]}" alt=""><div class="einfo"><b>${sp.name}</b><small>${f.kg.toFixed(2)} กก. · ขายได้ ${baht(value(f))}</small></div>
        <div class="etog"><button data-i="${i}" data-c="grill" class="${choices[i] === 'grill' ? 'on' : ''}">🔥 ปิ้ง</button><button data-i="${i}" data-c="sell" class="${choices[i] === 'sell' ? 'on' : ''}">💰 ขาย</button></div></div>`;
    }).join('') : '<div class="eveEmpty">🧺 วันนี้ข้องว่างเปล่า…</div>';
    const pct = Math.min(100, fed / NEED_KG * 100);
    $('eveSum').innerHTML = `<div class="erow"><span>🍚 ความอิ่มของครอบครัว</span><b>${fed.toFixed(2)} / ${NEED_KG} กก.</b></div>
      <div class="gbar food"><i style="width:${pct}%"></i></div>
      <div class="erow"><span>💰 ขายตลาดได้</span><b>${baht(earn)}</b></div>`;
    $('eveAll').classList.toggle('hidden', !S.basket.length);
  };
  p.onclick = e => {
    const b = e.target.closest('button[data-i]');
    if (b) { choices[+b.dataset.i] = b.dataset.c; sfx.click(); render(); return; }
    if (e.target.id === 'eveGrillAll') { choices.fill('grill'); sfx.click(); render(); }
    if (e.target.id === 'eveSellAll') { choices.fill('sell'); sfx.click(); render(); }
    if (e.target.id === 'eveOk') { p.classList.add('hidden'); onDone(choices); }
  };
  render();
  p.classList.remove('hidden');
}
