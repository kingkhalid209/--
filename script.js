/* sw.js — ضعه بجانب صفحة التطبيق على استضافة https */
const CACHE = 'prayer-shell-v4';
self.addEventListener('install', (e) => {
    self.skipWaiting();
    e.waitUntil(caches.open(CACHE).then((c) => c.addAll(['./'])).catch(() => {}));
});
self.addEventListener('activate', (e) => {
    e.waitUntil((async () => {
        const keys = await caches.keys();
        await Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)));
        await self.clients.claim();
    })());
});
self.addEventListener('fetch', (e) => {
    if (e.request.method !== 'GET') return;
    e.respondWith(
        fetch(e.request).then((res) => {
            const copy = res.clone();
            caches.open(CACHE).then((c) => c.put(e.request, copy)).catch(() => {});
            return res;
        }).catch(() => caches.match(e.request).then((m) => m || caches.match('./') || Response.error()))
    );
});
self.addEventListener('notificationclick', (e) => {
    const action = e.action;
    e.notification.close();
    e.waitUntil((async () => {
        const list = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
        if (action === 'stop-adhan') {
            for (const c of list) { c.postMessage({ type: 'STOP_ADHAN' }); }
            return;
        }
        for (const c of list) { if ('focus' in c) return c.focus(); }
        return self.clients.openWindow('./');
    })());
});
self.addEventListener('push', (e) => {
    let data = {};
    try { data = e.data ? e.data.json() : {}; } catch (err) {}
    e.waitUntil(self.registration.showNotification(data.title || 'أوقات الصلاة', {
        body: data.body || 'حان موعد الصلاة',
        dir: 'rtl', lang: 'ar',
        vibrate: [200, 100, 200],
        requireInteraction: true,
        tag: 'prayer-notification',
        actions: [{ action: 'stop-adhan', title: '⏹ إيقاف الأذان' }]
    }));
});
