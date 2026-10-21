// โหมดอัดวิดีโอโปรโมท (เปิด index.html?promo): เดินเกมทีละเฟรมแบบคงที่ 30 fps
// ซ้อนตัวหนังสือลงภาพ แล้วส่งแต่ละเฟรมเป็น JPEG ไปที่ POST /frame?i=N (เซิร์ฟเวอร์อัดวิดีโอในเครื่อง)
import * as THREE from 'three';
import { byId } from './fish.js';

const FPS = 30;
const ease = t => t * t * (3 - 2 * t);
const V = (x, y, z) => new THREE.Vector3(x, y, z);

export async function run(F) {
  const R = F.renderer, W = R.domElement.width, H = R.domElement.height;
  const out = document.createElement('canvas');
  out.width = W; out.height = H;
  const g = out.getContext('2d');
  await document.fonts.load('700 48px Mali');
  await document.fonts.load('600 48px Mali');
  const S = F.S, game = F.game;
  const thumbs = {};
  const img = id => thumbs[id] || (thumbs[id] = Object.assign(new Image(), { src: F.thumbs[id] }));
  const log = msg => fetch('/log', { method: 'POST', body: String(msg) }).catch(() => {});
  addEventListener('error', e => log('ERROR ' + e.message));
  addEventListener('unhandledrejection', e => log('ERROR ' + (e.reason && e.reason.stack || e.reason)));
  const FROM = +(new URLSearchParams(location.search).get('from') || 0);   // อัดต่อจากเฟรมนี้ (เฟรมก่อนหน้าแค่จำลอง ไม่วาด)
  const cam = { pos: V(0, 10, 20), look: V(0, 0, 0) };
  F.setCam(cam);
  F.setMode('promo');
  S.luck = 'great'; S.dead = false; S.night = false; S.basket = []; S.goal = 0;

  const camMove = (a, b, k) => { cam.pos.lerpVectors(a[0], b[0], ease(k)); cam.look.lerpVectors(a[1], b[1], ease(k)); };

  // ---------- ตัวหนังสือบนจอ ----------
  const u = W / 720;
  function rr(x, y, w, h, r) { g.beginPath(); g.moveTo(x + r, y); g.arcTo(x + w, y, x + w, y + h, r); g.arcTo(x + w, y + h, x, y + h, r); g.arcTo(x, y + h, x, y, r); g.arcTo(x, y, x + w, y, r); g.closePath(); }
  function caption(title, sub, a, y = 0.13) {
    if (!title || a <= 0) return;
    g.save();
    g.globalAlpha = a;
    // ย่อตัวอักษรอัตโนมัติถ้าข้อความยาวเกินจอ
    let ts = 46 * u, ss = 26 * u;
    g.font = `700 ${ts}px Mali, sans-serif`;
    let tw = g.measureText(title).width;
    if (tw > W - 110 * u) { ts *= (W - 110 * u) / tw; g.font = `700 ${ts}px Mali, sans-serif`; tw = g.measureText(title).width; }
    g.font = `600 ${ss}px Mali, sans-serif`;
    let sw = sub ? g.measureText(sub).width : 0;
    if (sw > W - 110 * u) { ss *= (W - 110 * u) / sw; g.font = `600 ${ss}px Mali, sans-serif`; sw = g.measureText(sub).width; }
    const bw = Math.max(tw, sw) + 64 * u, bh = (sub ? 128 : 84) * u, bx = (W - bw) / 2, by = H * y - (8 * (1 - a)) * u;
    g.shadowColor = 'rgba(0,0,0,.28)'; g.shadowBlur = 18 * u; g.shadowOffsetY = 6 * u;
    rr(bx, by, bw, bh, 28 * u); g.fillStyle = 'rgba(255,248,234,.94)'; g.fill();
    g.shadowColor = 'transparent';
    g.lineWidth = 4 * u; g.strokeStyle = '#fff'; g.stroke();
    g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillStyle = '#4b7f37'; g.font = `700 ${ts}px Mali, sans-serif`;
    g.fillText(title, W / 2, by + (sub ? 46 : 44) * u);
    if (sub) { g.fillStyle = '#3b2f24'; g.font = `600 ${ss}px Mali, sans-serif`; g.fillText(sub, W / 2, by + 96 * u); }
    g.restore();
  }
  function watermark() {
    g.save();
    g.globalAlpha = 0.9;
    g.font = `700 ${24 * u}px Mali, sans-serif`;
    g.textAlign = 'center';
    const t = '🎣 ตกปลาสบายใจ';
    const w = g.measureText(t).width + 36 * u;
    rr((W - w) / 2, H - 82 * u, w, 46 * u, 23 * u); g.fillStyle = 'rgba(30,40,30,.45)'; g.fill();
    g.fillStyle = '#fff'; g.textBaseline = 'middle'; g.fillText(t, W / 2, H - 59 * u);
    g.restore();
  }
  function tensionBar(tension, prog, a) {
    g.save(); g.globalAlpha = a;
    const bx = 70 * u, bw = W - 140 * u, by = H * 0.30;
    rr(bx - 16 * u, by - 46 * u, bw + 32 * u, 118 * u, 22 * u); g.fillStyle = 'rgba(255,248,234,.95)'; g.fill();
    g.fillStyle = '#3b2f24'; g.font = `700 ${22 * u}px Mali, sans-serif`; g.textBaseline = 'middle'; g.textAlign = 'left';
    g.fillText('แรงตึงสาย', bx, by - 22 * u);
    const grd = g.createLinearGradient(bx, 0, bx + bw, 0); grd.addColorStop(0, '#cfe3f0'); grd.addColorStop(0.85, '#f6d6c9'); grd.addColorStop(1, '#e0604a');
    rr(bx, by, bw, 26 * u, 13 * u); g.fillStyle = grd; g.fill();
    g.fillStyle = 'rgba(106,168,79,.6)'; g.fillRect(bx + bw * 0.2, by, bw * 0.6, 26 * u);
    g.fillStyle = '#3b2f24'; rr(bx + bw * Math.min(1, tension) - 5 * u, by - 4 * u, 10 * u, 34 * u, 5 * u); g.fill();
    rr(bx, by + 40 * u, bw, 16 * u, 8 * u); g.fillStyle = '#e9dcc0'; g.fill();
    rr(bx, by + 40 * u, bw * Math.max(0.02, Math.min(1, prog)), 16 * u, 8 * u); g.fillStyle = '#6aa84f'; g.fill();
    g.restore();
  }
  function fishCard(id, kg, a) {
    if (a <= 0) return;
    const sp = byId[id];
    g.save(); g.globalAlpha = a;
    const cw = 470 * u, ch = 330 * u, cx = (W - cw) / 2, cy = H * 0.56 + (1 - a) * 40 * u;
    g.shadowColor = 'rgba(0,0,0,.3)'; g.shadowBlur = 24 * u;
    rr(cx, cy, cw, ch, 30 * u); g.fillStyle = 'rgba(255,248,234,.97)'; g.fill(); g.shadowColor = 'transparent';
    const gr = g.createLinearGradient(0, cy + 20 * u, 0, cy + 170 * u); gr.addColorStop(0, '#3b4170'); gr.addColorStop(0.6, '#555b8c'); gr.addColorStop(1, sp.stars >= 4 ? '#f0a63a' : sp.stars === 3 ? '#b06ee8' : sp.stars === 2 ? '#4ea3e0' : '#a7adbd');
    rr(cx + 30 * u, cy + 22 * u, cw - 60 * u, 150 * u, 20 * u); g.fillStyle = gr; g.fill();
    const im = img(id);
    if (im.complete) g.drawImage(im, cx + 60 * u, cy + 28 * u, cw - 120 * u, (cw - 120 * u) / 2);
    g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillStyle = '#3b2f24'; g.font = `700 ${38 * u}px Mali, sans-serif`; g.fillText(sp.name, W / 2, cy + 210 * u);
    g.fillStyle = '#f2b632'; g.font = `700 ${26 * u}px Mali, sans-serif`; g.fillText('★'.repeat(sp.stars) + '☆'.repeat(4 - sp.stars), W / 2, cy + 252 * u);
    g.fillStyle = '#6b4e12'; g.font = `700 ${26 * u}px Mali, sans-serif`; g.fillText(`${kg.toFixed(2)} กก. · ขายได้ ฿${Math.round(kg * sp.price)}`, W / 2, cy + 292 * u);
    g.restore();
  }
  function endCard(a) {
    g.save(); g.globalAlpha = a;
    g.fillStyle = 'rgba(20,16,50,.45)'; g.fillRect(0, 0, W, H);
    g.textAlign = 'center'; g.textBaseline = 'middle';
    g.font = `${120 * u}px sans-serif`; g.fillText('🎣', W / 2, H * 0.30);
    g.shadowColor = 'rgba(0,0,0,.5)'; g.shadowBlur = 20 * u;
    g.fillStyle = '#fff6d8'; g.font = `700 ${78 * u}px Mali, sans-serif`; g.fillText('ตกปลาสบายใจ', W / 2, H * 0.42);
    g.font = `600 ${30 * u}px Mali, sans-serif`; g.fillText('หาปลาเลี้ยงครอบครัว · 5 ด่าน · ปลา 30 ชนิด', W / 2, H * 0.49);
    g.shadowColor = 'transparent';
    rr(W * 0.14, H * 0.56, W * 0.72, 96 * u, 48 * u); g.fillStyle = '#6aa84f'; g.fill();
    g.fillStyle = '#fff'; g.font = `700 ${40 * u}px Mali, sans-serif`; g.fillText('เล่นฟรี! มือถือ & คอม', W / 2, H * 0.56 + 48 * u);
    g.fillStyle = '#fff6d8'; g.font = `600 ${25 * u}px Mali, sans-serif`; g.fillText('boyscount.github.io/home-twin/fishing', W / 2, H * 0.66);
    g.font = `600 ${24 * u}px Mali, sans-serif`; g.fillText('ไม่ต้องติดตั้ง เปิดลิงก์แล้วเล่นได้เลย', W / 2, H * 0.70);
    g.restore();
  }

  // ---------- ช็อตต่าง ๆ ----------
  let castDone = false;
  const shots = [
    { dur: 3.4, cap: ['ตกปลาสบายใจ 🎣', 'เกมตกปลาเลี้ยงครอบครัว แนวคอซี่'],
      setup() { S.time = 7.2; F.loadWorld('paddy'); F.player.pos.set(-3.2, 0.27, 2.2); F.player.yaw = Math.PI; },
      update(k) { camMove([V(-1, 16, 26), V(0, 0, -5)], [V(-5, 5, 9), V(-3, 0.5, -2)], k); } },
    { dur: 3.0, cap: ['เหวี่ยงเบ็ด รอทุ่นจม', 'กดค้าง = เหวี่ยงไกล'],
      setup() { F.setMode('fishing'); F.player.pos.set(-3.2, 0.27, 2.2); F.player.yaw = Math.PI; game.reset(); castDone = false; },
      update(k, t) {
        camMove([V(-6.5, 3.2, 6.5), V(-3, 1, -1)], [V(-6, 3.6, 5.5), V(-3, 0, -3)], k);
        if (t < 0.02) F.actionDown();
        if (t > 0.75 && !castDone) { castDone = true; F.actionUp(); }
        if (game.state === 'waiting') { game.fish = { sp: byId.chado, kg: 4.6, cm: 85 }; game.biteAt = Math.min(game.biteAt, game.t + 0.9); }
      } },
    { dur: 3.6, cap: ['ทุ่นจม! ดึงทันจังหวะ', 'คุมแรงตึงสายให้อยู่ในโซนเขียว'],
      setup() { if (game.state !== 'bite') { game.fish = { sp: byId.chado, kg: 4.6, cm: 85 }; game.set('bite'); } F.actionDown(); F.actionUp(); if (game.state === 'strike') { game.sk.hits = game.sk.need - 1; game.sk.pos = game.sk.c; F.actionDown(); F.actionUp(); } },
      update(k, t) {
        camMove([V(-5.5, 2.6, 5), V(-3, 1.2, -1.5)], [V(-5, 2.3, 4.2), V(-3, 0.8, -2.2)], k);
        if (game.state === 'fight') { game.prog = Math.min(0.995, 0.25 + k * 0.8); const want = Math.sin(t * 5) > 0; if (want) F.actionDown(); else F.actionUp(); }
        if (k > 0.97 && game.state === 'fight') { F.actionUp(); game.prog = 1.2; }
      },
      overlay(k) { if (game.state === 'fight') tensionBar(game.tension, game.prog, Math.min(1, k * 5)); } },
    { dur: 3.2, cap: ['ได้ปลาชะโดตัวเบ้อเริ่ม!', 'ปลา 30 ชนิด หายากถึงระดับตำนาน'],
      update(k) { camMove([V(-5, 2.6, 4.8), V(-3, 1.8, 1.8)], [V(-4.6, 2.8, 4.4), V(-3, 2.0, 1.8)], k); },
      overlay(k) { fishCard('chado', 4.6, Math.min(1, Math.max(0, (k - 0.25) * 4))); } },
    { dur: 3.0, cap: ['น้ำตกสายหมอก', 'โขดหิน แอ่งน้ำใส ปลาว่ายให้เห็น'],
      setup() { game.endCatch(); F.setMode('promo'); S.time = 9.5; F.loadWorld('falls'); F.player.pos.set(-1.2, 0.1, 1.6); F.player.yaw = Math.PI; },
      update(k) { camMove([V(4, 4, 6), V(0, 2, -8)], [V(-2.5, 3.2, 3), V(0, 3.2, -10)], k); } },
    { dur: 2.6, cap: ['ลำธารป่าลึก', 'ลำแสงลอดใบไม้ หิ่งห้อย ปลาภูเขา'],
      setup() { S.time = 10; F.loadWorld('forest'); },
      update(k) { camMove([V(-8, 5, 9), V(1, 0, -2)], [V(2, 4, 8), V(3, 0, -3)], k); } },
    { dur: 2.6, cap: ['หาดหินปะการัง', 'คลื่นซัดฝั่ง ปูเดิน ปลาสีสวย'],
      setup() { S.time = 10.5; F.loadWorld('beach'); },
      update(k) { camMove([V(-6, 6, 8), V(0, 0, -6)], [V(5, 4, 6), V(2, 0, -6)], k); } },
    { dur: 3.0, cap: ['ออกทะเลเรือหางยาว ⛵', 'ปลาใหญ่ราคาดี กระโดดรอบเรือ'],
      setup() { S.time = 9; F.loadWorld('sea'); },
      update(k) { camMove([V(7, 3.5, 9), V(0, 1, -3)], [V(-6, 4, 8), V(2, 1, -4)], k); } },
    { dur: 3.4, cap: ['ตกปลากลางคืนใต้แสงดาว 🌙', 'จุดตะเกียง ฟังเสียงกบเสียงจิ้งหรีด'],
      setup() { S.time = 20.5; S.night = true; F.loadWorld('paddy'); F.player.pos.set(-3.2, 0.27, 2.2); F.player.yaw = Math.PI; },
      update(k) { camMove([V(-5.5, 2.5, 9), V(-2, 4, -14)], [V(-4.5, 2, 7), V(-1, 6, -16)], k); } },
    { dur: 3.4, cap: ['กลับบ้าน ปิ้งปลาให้ครอบครัว', 'หรือเอาไปขายตลาดเก็บเงิน 💰'],
      setup() { S.night = false; S.goal = 0; F.loadWorld('home'); F.world.grillFish(['mo', 'salit', 'nil'].map(id => F.makeFish(id))); F.world.cheer = 1; },
      update(k) { camMove([V(8, 4.2, 10), V(0.8, 1, 0.8)], [V(5.5, 3.2, 8), V(0.8, 1, 1)], k); } },
    { dur: 3.0, cap: ['หลังคารั่ว… ต้องเก็บเงินซ่อม 🌧️', 'บางวันปลาไม่กินเลยก็มี'],
      setup() { F.world.cheer = 0; F.world.setMorning(true); },
      update(k) { camMove([V(1.5, 6.5, 9), V(-1.5, 4.5, -2)], [V(0.5, 6, 7.5), V(-1.5, 4.8, -2.5)], k); } },
    { dur: 2.4, cap: ['ซ่อมเสร็จแล้ว! ✨', 'ทำเป้าหมายครอบครัวทีละขั้น'],
      setup() { S.goal = 1; F.loadWorld('home'); F.world.setMorning(true); F.world.cheer = 1; },
      update(k) { camMove([V(0.5, 6, 7.5), V(-1.5, 4.8, -2.5)], [V(3, 5, 9), V(-1, 3.5, -2)], k); } },
    { dur: 4.6, cap: ['ตอนจบสุดอบอุ่นที่งานวัด 🎡', 'ชิงช้าสวรรค์ บ้านผีสิง ดอกไม้ไฟ'],
      setup() { F.loadWorld('fair'); F.world.fireworksOn = true; F.world.firework(-3, 16, -20); F.world.firework(5, 18, -21, 0.6); },
      update(k) { camMove([V(0, 4, 22), V(2, 5, -4)], [V(-3, 3, 10), V(4, 9, -10)], k); } },
    { dur: 4.0, end: true,
      update(k) { camMove([V(-3, 3, 10), V(4, 9, -10)], [V(-2, 4, 12), V(3, 11, -12)], k); } },
  ];

  // ---------- เรนเดอร์ทีละเฟรม ----------
  let frame = 0;
  const total = shots.reduce((a, s) => a + Math.round(s.dur * FPS), 0);
  log(`start ${W}x${H} frames=${total}`);
  for (let si = 0; si < shots.length; si++) {
    const sh = shots[si];
    if (sh.setup) { sh.setup(); for (let i = 0; i < 4; i++) F.step(1 / FPS); }
    const n = Math.round(sh.dur * FPS);
    for (let f = 0; f < n; f++) {
      const t = f / FPS, k = f / (n - 1);
      sh.update(k, t);
      F.step(1 / FPS);
      if (frame < FROM) { frame++; continue; }
      F.renderNow();
      g.drawImage(R.domElement, 0, 0, W, H);
      if (sh.overlay) sh.overlay(k);
      const capA = Math.min(1, t / 0.35, (sh.dur - t) / 0.3);
      if (sh.cap) caption(sh.cap[0], sh.cap[1], capA);
      if (sh.end) endCard(Math.min(1, t / 0.6));
      else watermark();
      // เฟดดำสั้น ๆ ระหว่างช็อต
      const fade = Math.max(0, 1 - t / 0.18, 1 - (sh.dur - t) / 0.12);
      if (fade > 0 && !(si === 0 && t < 0.2)) { g.fillStyle = `rgba(0,0,0,${fade * 0.85})`; g.fillRect(0, 0, W, H); }
      const blob = await new Promise(res => out.toBlob(res, 'image/jpeg', 0.9));
      await fetch('/frame?i=' + frame, { method: 'POST', body: blob });
      frame++;
      if (frame % 60 === 0) log(`frame ${frame}/${total}`);
    }
  }
  await fetch('/done', { method: 'POST', body: String(frame) });
}
