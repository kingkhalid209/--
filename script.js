// ═══════════════════════════════════════════════════════════
// Service Worker محسّن — يعمل في الخلفية مع Periodic Sync
// ═══════════════════════════════════════════════════════════

const CACHE_NAME = 'prayer-adhan-v4';
const SCHEDULE_KEY = 'prayer-schedule';

// ─── التثبيت ───
self.addEventListener('install', (event) => {
    self.skipWaiting();
    event.waitUntil(
        caches.open(CACHE_NAME)
            .then(cache => cache.addAll(['./', './index.html']))
            .catch(() => {})
    );
});

// ─── التفعيل وتنظيف الكاش القديم ───
self.addEventListener('activate', (event) => {
    event.waitUntil((async () => {
        const keys = await caches.keys();
        await Promise.all(
            keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k))
        );
        await self.clients.claim();
    })());
});

// ─── Cache-First للطلبات ───
self.addEventListener('fetch', (event) => {
    if (event.request.method !== 'GET') return;
    event.respondWith(
        fetch(event.request)
            .then(res => {
                const copy = res.clone();
                caches.open(CACHE_NAME)
                    .then(cache => cache.put(event.request, copy))
                    .catch(() => {});
                return res;
            })
            .catch(() => caches.match(event.request)
                .then(m => m || caches.match('./') || Response.error()))
    );
});

// ─── استقبال الرسائل من التطبيق ───
self.addEventListener('message', (event) => {
    if (!event.data) return;
    
    if (event.data.type === 'SET_SCHEDULE') {
        // حفظ جدول الصلوات لفحصه دورياً
        self.registration.put(SCHEDULE_KEY, event.data.schedule)
            .catch(() => {
                // Fallback للـ localStorage عبر العميل
            });
        console.log('[SW] تم حفظ الجدول:', event.data.schedule);
    }
    
    if (event.data.type === 'SHOW_NOTIFICATION') {
        const { title, body, prayerKey, withStop } = event.data;
        showPrayerNotification(title, body, prayerKey, withStop);
    }
});

// ─── Periodic Background Sync (Android Chrome فقط) ───
self.addEventListener('periodicsync', (event) => {
    if (event.tag === 'prayer-check') {
        event.waitUntil(checkAndNotifyPrayer());
    }
});

// ─── Push Notifications ───
self.addEventListener('push', (event) => {
    if (!event.data) return;
    const data = event.data.json() || {};
    event.waitUntil(
        showPrayerNotification(
            data.title || 'حان وقت الصلاة',
            data.body || '',
            data.prayerKey || '',
            true
        )
    );
});

// ─── فحص الصلاة القادمة وتشغيل الإشعار ───
async function checkAndNotifyPrayer() {
    try {
        const clients = await self.clients.matchAll({ type: 'window' });
        if (clients.length > 0) {
            // إذا كان التطبيق مفتوحاً، أرسل له الرسالة
            clients[0].postMessage({ type: 'CHECK_PRAYER_NOW' });
            return;
        }
        // التطبيق مغلق — اعرض إشعاراً عاماً
        await showPrayerNotification(
            'تذكير بالأذان',
            'افتح التطبيق لمعرفة الصلاة القادمة',
            '',
            false
        );
    } catch (e) {
        console.error('[SW] فشل الفحص:', e);
    }
}

// ─── عرض إشعار الصلاة ───
async function showPrayerNotification(title, body, prayerKey, withStop) {
    const options = {
        body,
        dir: 'rtl',
        lang: 'ar',
        icon: './icon-192.png',
        badge: './icon-192.png',
        tag: 'prayer-' + (prayerKey || 'general'),
        renotify: true,
        requireInteraction: withStop,
        vibrate: withStop ? [300, 150, 300, 150, 300, 150, 300] : [200, 100, 200],
        silent: !withStop,
        actions: withStop ? [
            { action: 'stop-adhan', title: '⏹ إيقاف الأذان' },
            { action: 'open-app', title: '📱 فتح التطبيق' }
        ] : [],
        data: { prayerKey, url: './' }
    };
    
    try {
        await self.registration.showNotification(title, options);
    } catch (e) {
        console.error('[SW] فشل الإشعار:', e);
    }
}

// ─── معالجة أزرار الإشعار ───
self.addEventListener('notificationclick', (event) => {
    event.notification.close();
    const action = event.action;
    const data = event.notification.data || {};
    
    event.waitUntil((async () => {
        const list = await self.clients.matchAll({ 
            type: 'window', 
            includeUncontrolled: true 
        });
        
        // إيقاف الأذان
        if (action === 'stop-adhan') {
            for (const client of list) {
                client.postMessage({ type: 'STOP_ADHAN' });
            }
            return;
        }
        
        // فتح التطبيق
        for (const client of list) {
            if (client.url.includes(self.location.origin) && 'focus' in client) {
                client.postMessage({ type: 'FOCUS_APP' });
                return client.focus();
            }
        }
        
        // فتح نافذة جديدة
        if (self.clients.openWindow) {
            return self.clients.openWindow(data.url || './');
        }
    })());
});

// ─── Background Sync (للمزامنة عند استعادة الاتصال) ───
self.addEventListener('sync', (event) => {
    if (event.tag === 'prayer-sync') {
        event.waitUntil(
            self.clients.matchAll({ type: 'window' })
                .then(clients => {
                    clients.forEach(c => c.postMessage({ type: 'RESYNC_TIMES' }));
                })
        );
    }
});
