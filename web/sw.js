/* Orbit service worker — app shell caching so the app opens offline.
   Bump CACHE_VERSION whenever app.html / app.js / sw.js change, otherwise
   installed clients keep serving the previous build. */
const CACHE_VERSION = 'orbit-v2.0.1';
const PRECACHE = [
  './',
  'index.html',
  'app.html',
  'app.js',
  'privacy.html',
  'manifest.webmanifest',
  'orbit-icon.svg',
  'icons/icon-192.png',
  'icons/icon-512.png',
  'vendor/supabase.js'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_VERSION)
      .then((cache) => Promise.all(PRECACHE.map((url) => cache.add(url).catch(() => null))))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE_VERSION).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const request = event.request;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);

  // Never cache auth or data traffic: the app must always see live cloud state.
  if (url.hostname.endsWith('supabase.co') || url.hostname.endsWith('supabase.in')) return;

  // App shell: cache first, then network.
  if (url.origin === self.location.origin) {
    event.respondWith(
      caches.match(request).then((cached) => {
        if (cached) {
          // Refresh in the background.
          fetch(request).then((response) => {
            if (response && response.ok) {
              caches.open(CACHE_VERSION).then((cache) => cache.put(request, response.clone()));
            }
          }).catch(() => {});
          return cached;
        }
        return fetch(request).then((response) => {
          if (response && response.ok) {
            const copy = response.clone();
            caches.open(CACHE_VERSION).then((cache) => cache.put(request, copy));
          }
          return response;
        }).catch(() => caches.match('app.html'));
      })
    );
    return;
  }

  // Third-party (fonts, CDN fallbacks): network first, fall back to cache.
  event.respondWith(
    fetch(request).then((response) => {
      if (response && response.ok) {
        const copy = response.clone();
        caches.open(CACHE_VERSION).then((cache) => cache.put(request, copy));
      }
      return response;
    }).catch(() => caches.match(request))
  );
});
