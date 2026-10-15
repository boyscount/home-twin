// Service worker: ทำให้แจ้งเตือนมีปุ่ม "รู้จัก / ไม่รู้จัก" และพร้อมสำหรับ Web Push จากเซิร์ฟเวอร์ในอนาคต
const CDN_CACHE = 'cdn-v1';
self.addEventListener('install', () => self.skipWaiting());
// navigation preload: เบราว์เซอร์เริ่มโหลดหน้าเว็บพร้อมกับปลุก service worker (ไม่ต้องรอ SW ตื่นก่อน)
self.addEventListener('activate', e => e.waitUntil((async () => {
  if (self.registration.navigationPreload) await self.registration.navigationPreload.enable();
  await self.clients.claim();
})()));

// เปิดครั้งถัดไปเร็วขึ้น: ไฟล์ three.js / ฟอนต์ (เวอร์ชันตายตัว) เก็บไว้ในเครื่องเลย
self.addEventListener('fetch', event => {
  const req = event.request;
  if (req.method !== 'GET') return;
  if (req.mode === 'navigate') { event.respondWith((async () => (await event.preloadResponse) || fetch(req))()); return; }
  const url = new URL(req.url);
  const immutable = (url.hostname === 'cdn.jsdelivr.net' && /@\d/.test(url.pathname)) || url.hostname === 'fonts.gstatic.com';
  if (immutable) {
    event.respondWith(caches.open(CDN_CACHE).then(async c => {
      const hit = await c.match(req); if (hit) return hit;
      const res = await fetch(req); if (res.ok || res.type === 'opaque') c.put(req, res.clone()); return res;
    }));
  }
  // ไฟล์ของเว็บเอง (หน้าเว็บ, js, css) ปล่อยให้เบราว์เซอร์โหลดตรง ๆ — ไม่ผ่าน service worker จะได้ไม่ช้าและ deploy แล้วเห็นทันที
});

self.addEventListener('notificationclick', event => {
  event.notification.close();
  const tag = event.notification.data?.tag;
  const action = event.action || 'open';
  event.waitUntil((async () => {
    const all = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    all.forEach(c => c.postMessage(action === 'open' ? { type: 'open-radar', tag } : { type: 'notif-action', action, tag }));
    const c = all[0];
    if (c) return c.focus();
    return self.clients.openWindow('./?tab=radar');
  })());
});

// เมื่อมีเซิร์ฟเวอร์ส่ง Web Push (VAPID) มา — payload: { title, body, image, tag }
self.addEventListener('push', event => {
  const d = event.data ? event.data.json() : {};
  event.waitUntil(self.registration.showNotification(d.title || 'บ้านสวน Monitor', {
    body: d.body, image: d.image, icon: d.image, tag: d.tag, data: { tag: d.tag }, requireInteraction: true,
    actions: [{ action: 'allow', title: '✅ รู้จัก' }, { action: 'deny', title: '🚨 ไม่รู้จัก' }],
  }));
});
