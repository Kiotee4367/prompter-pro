const CACHE_NAME = 'prompterpro-v8';
const ASSETS = [
  './',
  './index.html',
  './manifest.json',
  './icon-192.svg',
  './icon-512.svg',
  'https://cdnjs.cloudflare.com/ajax/libs/mammoth/1.6.0/mammoth.browser.min.js'
];

// Install: cache core assets
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => cache.addAll(ASSETS))
      .then(() => self.skipWaiting())
  );
});

// Activate: clean old caches
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', event => {
  const req = event.request;
  const url = new URL(req.url);

  // Never cache API traffic (GitHub or the Supabase proxy). Always hit network.
  if (url.hostname === 'api.github.com' || url.hostname.endsWith('.supabase.co')) {
    event.respondWith(fetch(req));
    return;
  }

  // Network-first for navigations and the HTML shell, so a new deploy shows up
  // immediately instead of being trapped behind the cache. Fall back to cache
  // only when offline. This is what stops the app from getting "stuck" on an
  // old version after a deploy.
  const isShell = req.mode === 'navigate' ||
    (req.method === 'GET' && url.origin === self.location.origin &&
     (url.pathname === '/' || url.pathname.endsWith('/') || url.pathname.endsWith('index.html')));

  if (isShell) {
    event.respondWith(
      fetch(req).then(response => {
        if (response.ok) {
          const clone = response.clone();
          caches.open(CACHE_NAME).then(cache => cache.put(req, clone));
        }
        return response;
      }).catch(() => caches.match(req).then(c => c || caches.match('./index.html')))
    );
    return;
  }

  // Cache-first for other static assets (icons, manifest, libraries).
  event.respondWith(
    caches.match(req).then(cached => cached || fetch(req).then(response => {
      if (response.ok) {
        const clone = response.clone();
        caches.open(CACHE_NAME).then(cache => cache.put(req, clone));
      }
      return response;
    }))
  );
});
