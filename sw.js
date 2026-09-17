/* Service Worker: hält die App offline verfügbar. */
// Der Deploy ersetzt den Platzhalter durch den Commit-SHA (.github/workflows/deploy.yml).
const VERSION = '__BUILD__';
const CACHE = `zollstock-${VERSION}`;
const ASSETS = [
  './',
  './index.html',
  './css/style.css',
  './js/devices.js',
  './js/calibration.js',
  './js/check.js',
  './js/scales.js',
  './js/edge.js',
  './js/ruler.js',
  './js/gauge.js',
  './js/protractor.js',
  './js/app.js',
  './manifest.webmanifest',
  './icons/icon.svg',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/icon-180.png',
  './icons/icon-maskable-512.png'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE)
      .then((cache) => Promise.all(ASSETS.map((url) => {
        // cache: 'reload' umgeht den HTTP-Cache des Browsers. Sonst könnte
        // der neue Stand mit alten Dateien aus dem Browsercache gefüllt
        // werden, wenn der Webspace lange Haltbarkeiten mitschickt.
        const request = new Request(url, { cache: 'reload' });
        return fetch(request).then((response) => {
          if (!response.ok) throw new Error(`${url}: ${response.status}`);
          return cache.put(url, response);
        });
      })))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(
        keys.filter((key) => key.startsWith('zollstock-') && key !== CACHE)
          .map((key) => caches.delete(key))
      ))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;

  event.respondWith(
    caches.match(event.request).then((cached) => {
      if (cached) return cached;

      return fetch(event.request)
        .then((response) => {
          // Erfolgreiche Antworten für den Offline-Betrieb nachtragen.
          if (response.ok && new URL(event.request.url).origin === self.location.origin) {
            const copy = response.clone();
            caches.open(CACHE).then((cache) => cache.put(event.request, copy));
          }
          return response;
        })
        .catch(() => caches.match('./index.html'));
    })
  );
});
