/* Service worker: cache-first for same-origin static assets so the app
   installs to the home screen and works offline. */
const VERSION = 'cube-v20260610c';
const CORE = [
  '.',
  'index.html',
  'manifest.json',
  'css/style.css?v=20260610c',
  'js/confetti.js?v=20260610c',
  'js/cube3d.js?v=20260610c',
  'js/cubie.js?v=20260610c',
  'js/sound.js?v=20260610c',
  'js/kidmode.js?v=20260610c',
  'js/stickers.js?v=20260610c',
  'js/speech.js?v=20260610c',
  'js/a11y.js?v=20260610c',
  'js/app.js?v=20260610c',
  'js/photo.js?v=20260610c',
  'js/toddler.js?v=20260610c',
  'js/solver-worker.js',
  'vendor/three.min.js',
  'vendor/cube.js',
  'icons/icon-192.png',
  'icons/icon-512.png'
];

self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(VERSION).then((c) => c.addAll(CORE)).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== VERSION).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);
  // Only handle same-origin GETs; API calls (photo scan) always hit the network.
  if (e.request.method !== 'GET' || url.origin !== location.origin) return;
  e.respondWith(
    caches.match(e.request).then(
      (hit) =>
        hit ||
        fetch(e.request).then((res) => {
          if (res.ok) {
            const copy = res.clone();
            caches.open(VERSION).then((c) => c.put(e.request, copy));
          }
          return res;
        })
    )
  );
});
