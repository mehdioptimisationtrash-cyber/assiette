// Service worker : l'app et la table Ciqual fonctionnent hors ligne.
// À chaque modification du site, augmenter CACHE_VERSION.
const CACHE_VERSION = 'assiette-v2';
const SHELL = [
  './', 'index.html', 'manifest.webmanifest', 'css/app.css', 'data/ciqual.json',
  'icons/icon.svg', 'icons/icon-180.png', 'icons/icon-512.png',
  'js/app.js', 'js/ui.js', 'js/store.js', 'js/nutrition.js', 'js/food-model.js', 'js/foods.js',
  'js/scanner.js',
  'js/views/journal.js', 'js/views/add.js', 'js/views/product.js',
  'js/views/library.js', 'js/views/progress.js', 'js/views/profile.js',
];
const LIBS = ['https://cdn.jsdelivr.net/npm/@zxing/browser@0.1.5/umd/zxing-browser.min.js'];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_VERSION).then(async (cache) => {
      await cache.addAll(SHELL);
      await cache.addAll(LIBS).catch(() => {}); // facultatif : chargé à la demande sinon
    }).then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE_VERSION).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  const isOwn = url.origin === self.location.origin;
  const isLib = url.hostname === 'cdn.jsdelivr.net';
  if (!isOwn && !isLib) return; // API Open Food Facts : toujours en direct
  event.respondWith(
    caches.match(request, { ignoreSearch: isOwn }).then((cached) => {
      if (cached) return cached;
      return fetch(request).then((res) => {
        if (res.ok && (isOwn || isLib)) {
          const copy = res.clone();
          caches.open(CACHE_VERSION).then((cache) => cache.put(request, copy));
        }
        return res;
      });
    }),
  );
});
