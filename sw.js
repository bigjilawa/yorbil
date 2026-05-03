// Yorbil Service Worker v6 — network-first, instant update, no stale cache
const CACHE = 'yorbil-v6';
const ASSETS = ['./index.html','./manifest.json','./yorbil-icon-192.png','./yorbil-icon-512.png'];

self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE).then(c => c.addAll(ASSETS)).catch(() => {})
  );
  self.skipWaiting(); // activate immediately
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim()) // take control of ALL open tabs now
  );
});

self.addEventListener('fetch', e => {
  const url = new URL(e.request.url);
  const isHTML = e.request.destination === 'document' || url.pathname.endsWith('.html') || url.pathname.endsWith('/');
  if (!url.href.startsWith(self.location.origin)) return;

  if (isHTML) {
    // Network-first for HTML — ALWAYS fetch latest version
    e.respondWith(
      fetch(e.request, { cache: 'no-cache' }) // bypass browser HTTP cache too
        .then(res => {
          if (res && res.status === 200) {
            const clone = res.clone();
            caches.open(CACHE).then(c => c.put(e.request, clone));
          }
          return res;
        })
        .catch(() => caches.match(e.request)) // offline fallback only
    );
  } else {
    // Cache-first for static assets (icons, manifest)
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
});
