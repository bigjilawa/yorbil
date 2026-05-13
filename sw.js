// Yorbil Service Worker v8 — push notifications + network-first cache
const CACHE = 'yorbil-v8';
const ASSETS = ['./index.html','./manifest.json','./icon-192.png','./icon-512.png'];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(ASSETS)).catch(()=>{}));
  self.skipWaiting();
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
  // Start notification check loop
  startNotifCheck();
});

self.addEventListener('fetch', e => {
  const url = new URL(e.request.url);
  const isHTML = e.request.destination === 'document' || url.pathname.endsWith('.html') || url.pathname.endsWith('/');
  if (!url.href.startsWith(self.location.origin)) return;
  if (isHTML) {
    e.respondWith(
      fetch(e.request, { cache: 'no-cache' })
        .then(res => {
          if (res && res.status === 200) {
            caches.open(CACHE).then(c => c.put(e.request, res.clone()));
          }
          return res;
        })
        .catch(() => caches.match(e.request))
    );
  } else {
    e.respondWith(
      caches.match(e.request).then(cached => {
        if (cached) return cached;
        return fetch(e.request).then(res => {
          if (res && res.status === 200)
            caches.open(CACHE).then(c => c.put(e.request, res.clone()));
          return res;
        });
      })
    );
  }
});

self.addEventListener('message', e => {
  if (e.data === 'skipWaiting') self.skipWaiting();
  if (e.data === 'checkNotifs') checkScheduledNotifs();
});

self.addEventListener('notificationclick', e => {
  e.notification.close();
  e.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then(clientList => {
      // Focus existing window or open new one
      for (const client of clientList) {
        if (client.url.includes('yorbil') && 'focus' in client) return client.focus();
      }
      if (clients.openWindow) return clients.openWindow('./index.html');
    })
  );
});

// ── Notification scheduler ────────────────────────────────────────────────────
function startNotifCheck() {
  // Check every 30 minutes
  setInterval(checkScheduledNotifs, 30 * 60 * 1000);
  checkScheduledNotifs();
}

async function checkScheduledNotifs() {
  try {
    const perm = await self.registration.pushManager.permissionState
      ? null : null; // just check via Notification API instead
  } catch(e) {}

  // Read scheduled notifs from localStorage via clients
  const allClients = await clients.matchAll({ includeUncontrolled: true });
  if (allClients.length > 0) {
    // App is open — let it handle scheduling
    return;
  }

  // App is closed — check localStorage via IndexedDB workaround
  // (SW can't access localStorage directly, so we store in cache)
  try {
    const cache = await caches.open(CACHE);
    const resp = await cache.match('./notif-schedule');
    if (!resp) return;
    const scheduled = await resp.json();
    const now = Date.now();
    const fired = JSON.parse((await (await cache.match('./notif-fired'))?.text()) || '[]');

    for (const notif of scheduled) {
      if (notif.notifAt <= now && notif.notifAt > now - (60 * 60 * 1000) && !fired.includes(notif.id)) {
        await self.registration.showNotification(notif.title, {
          body: notif.body,
          icon: './icon-192.png',
          badge: './icon-192.png',
          tag: notif.id,
          requireInteraction: false,
        });
        fired.push(notif.id);
      }
    }
    // Save fired list
    await cache.put('./notif-fired', new Response(JSON.stringify(fired)));
  } catch(e) {}
}
