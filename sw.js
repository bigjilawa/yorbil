// Yorbil Service Worker v4 — network-first with instant auto-update
const CACHE = 'yorbil-v4';
const ASSETS = ['./index.html','./manifest.json','./icon-192.png','./icon-512.png'];

// Install — cache assets, activate immediately
self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE).then(c => c.addAll(ASSETS)).catch(() => {})
  );
  self.skipWaiting(); // take over immediately, no waiting
});

// Activate — delete ALL old caches, claim all clients immediately
self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim()) // take control of all open tabs NOW
  );
});

// Fetch — network-first for HTML (always get latest), cache fallback for offline
self.addEventListener('fetch', e => {
  const url = new URL(e.request.url);
  const isHTML = e.request.destination === 'document' || url.pathname.endsWith('.html');
  const isSameOrigin = url.origin === location.origin;

  if (!isSameOrigin) return; // let browser handle external requests

  if (isHTML) {
    // Network-first for HTML — always try to get the latest version
    e.respondWith(
      fetch(e.request)
        .then(res => {
          if (res && res.status === 200) {
            const clone = res.clone();
            caches.open(CACHE).then(c => c.put(e.request, clone));
          }
          return res;
        })
        .catch(() => caches.match(e.request)) // offline fallback
    );
  } else {
    // Cache-first for assets (icons, manifest) — these rarely change
    e.respondWith(
      caches.match(e.request).then(cached => {
        if (cached) return cached;
        return fetch(e.request).then(res => {
          if (res && res.status === 200) {
            caches.open(CACHE).then(c => c.put(e.request, res.clone()));
          }
          return res;
        });
      })
    );
  }
});

// Listen for skip-waiting message from app
self.addEventListener('message', e => {
  if (e.data === 'skipWaiting') self.skipWaiting();
});
