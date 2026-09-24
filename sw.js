// Service worker : l'app et la table Ciqual fonctionnent hors ligne.
// Fichiers de l'app : réseau d'abord (mises à jour immédiates), copie locale si hors ligne.
// À chaque modification du site, augmenter CACHE_VERSION (et APP_VERSION dans js/version.js).
const CACHE_VERSION = 'assiette-v9';
const SHELL = [
  './', 'index.html', 'manifest.webmanifest', 'css/app.css', 'data/ciqual.json',
  'icons/icon.svg', 'icons/icon-180.png', 'icons/icon-512.png',
  'js/app.js', 'js/version.js', 'js/ui.js', 'js/store.js', 'js/nutrition.js', 'js/food-model.js', 'js/foods.js',
  'js/scanner.js', 'js/sync.js', 'js/sync-model.js',
  'js/views/journal.js', 'js/views/add.js', 'js/views/product.js',
  'js/views/library.js', 'js/views/history.js', 'js/views/sheets.js', 'js/views/progress.js', 'js/views/profile.js',
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
  // La table Ciqual (gros fichier) et les bibliothèques changent rarement : copie locale d'abord.
  const cacheFirst = isLib || url.pathname.endsWith('/data/ciqual.json');
  const fromNetwork = () =>
    fetch(request).then((res) => {
      if (res.ok) {
        const copy = res.clone();
        caches.open(CACHE_VERSION).then((cache) => cache.put(request, copy));
      }
      return res;
    });
  const fromCache = () => caches.match(request, { ignoreSearch: isOwn });
  event.respondWith(
    cacheFirst
      ? fromCache().then((cached) => cached || fromNetwork())
      : fromNetwork().catch(() => fromCache().then((cached) => cached || Response.error())),
  );
});
