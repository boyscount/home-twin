// Service worker: ทำให้แจ้งเตือนมีปุ่ม "รู้จัก / ไม่รู้จัก" และพร้อมสำหรับ Web Push จากเซิร์ฟเวอร์ในอนาคต
const CDN_CACHE = 'cdn-v1', APP_CACHE = 'app-v1';
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', e => e.waitUntil(self.clients.claim()));

// เปิดครั้งถัดไปเร็วขึ้น: ไฟล์ three.js / ฟอนต์ (เวอร์ชันตายตัว) เก็บไว้ในเครื่องเลย
// ไฟล์ของเว็บเอง: ดึงของใหม่ก่อนเสมอ (deploy แล้วเห็นทันที) ถ้าเน็ตหลุดค่อยใช้ของที่เก็บไว้
self.addEventListener('fetch', event => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  const immutable = (url.hostname === 'cdn.jsdelivr.net' && /@\d/.test(url.pathname)) || url.hostname === 'fonts.gstatic.com';
  if (immutable) {
    event.respondWith(caches.open(CDN_CACHE).then(async c => {
      const hit = await c.match(req); if (hit) return hit;
      const res = await fetch(req); if (res.ok || res.type === 'opaque') c.put(req, res.clone()); return res;
    }));
  } else if (url.origin === self.location.origin) {
    event.respondWith(fetch(req).then(res => {
      if (res.ok) { const copy = res.clone(); caches.open(APP_CACHE).then(c => c.put(req, copy)); }
      return res;
    }).catch(() => caches.match(req)));
  }
});

self.addEventListener('notificationclick', event => {
  event.notification.close();
  const tag = event.notification.data?.tag;
  const action = event.action || 'open';
  event.waitUntil((async () => {
    const all = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    if (action !== 'open') all.forEach(c => c.postMessage({ type: 'notif-action', action, tag }));
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
