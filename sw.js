// Service worker: ทำให้แจ้งเตือนมีปุ่ม "รู้จัก / ไม่รู้จัก" และพร้อมสำหรับ Web Push จากเซิร์ฟเวอร์ในอนาคต
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', e => e.waitUntil(self.clients.claim()));

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
