const CACHE = 'prayer-shell-v5';

self.addEventListener('install', (e) => {
    self.skipWaiting();
});

self.addEventListener('activate', (e) => {
    e.waitUntil(self.clients.claim());
});

self.addEventListener('push', (e) => {
    let data = {};
    try { data = e.data ? e.data.json() : {}; } catch (err) {}
    e.waitUntil(self.registration.showNotification(data.title || 'أوقات الصلاة', {
        body: data.body || 'حان موعد الأذان',
        dir: 'rtl', lang: 'ar',
        vibrate: [300, 150, 300],
        requireInteraction: true,
        tag: 'prayer-notification',
        icon: data.icon || '/icon.png',
        actions: [{ action: 'stop-adhan', title: '⏹ إيقاف' }]
    }));
});

self.addEventListener('notificationclick', (e) => {
    e.notification.close();
    if (e.action === 'stop-adhan') {
        e.waitUntil(clients.matchAll({ type: 'window' }).then(list => {
            list.forEach(c => c.postMessage({ type: 'STOP_ADHAN' }));
        }));
    } else {
        e.waitUntil(clients.openWindow('./'));
    }
});

function wakeUpCheck() {
    tickSecond();
    if (lastFetchDay && lastFetchDay !== new Date().toDateString()) fetchPrayerTimes();
    updateAudioStatus();
    if (sharedAudioCtx && sharedAudioCtx.state === 'suspended') {
        sharedAudioCtx.resume().catch(() => {});
    }
    
    // 💡 الحل الذكي: التحقق فوراً عند فتح الشاشة إذا فات وقت الأذان
    if (nextPrayerObj && timingsData) {
        const now = new Date();
        const diffMs = now - nextPrayerObj.date;
        // إذا مر على وقت الأذان أقل من 5 دقائق والجوال كان مقفلاً
        if (diffMs > 0 && diffMs < 5 * 60 * 1000) {
            const triggerId = `${nextPrayerObj.key}-${nextPrayerObj.date.toDateString()}`;
            if (lastTriggeredAdhanKey !== triggerId) {
                lastTriggeredAdhanKey = triggerId;
                try { localStorage.setItem('last_adhan_trigger_v17', triggerId); } catch (e) {}
                onPrayerTimeArrived(nextPrayerObj.key);
            }
        }
    }
}
