const CACHE = 'words-v1.1.0';
const ASSETS = [
  './',
  './index.html',
  './styles.css',
  './app.js',
  './src/scheduler.js',
  './src/storage.js',
  './src/importers.js',
  './src/share.js',
  './src/samples.js',
  './manifest.webmanifest',
];
const STATIC_PATHS = new Set(ASSETS.map(asset => new URL(asset, self.location.href).pathname));

self.addEventListener('install', event => {
  event.waitUntil(caches.open(CACHE).then(cache => cache.addAll(ASSETS)));
  self.skipWaiting();
});

self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    const names = await caches.keys();
    await Promise.all(names.filter(name => name.startsWith('words-') && name !== CACHE).map(name => caches.delete(name)));
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', event => {
  if (event.request.method !== 'GET') return;
  const url = new URL(event.request.url);
  if (url.origin !== self.location.origin || url.pathname.startsWith('/api/')) return;

  const isNavigation = event.request.mode === 'navigate';
  const isStaticAsset = STATIC_PATHS.has(url.pathname);
  if (!isNavigation && !isStaticAsset) return;

  event.respondWith((async () => {
    try {
      const response = await fetch(event.request);
      if (response.ok && isStaticAsset) {
        const cache = await caches.open(CACHE);
        await cache.put(event.request, response.clone());
      }
      return response;
    } catch {
      if (isNavigation) return (await caches.match('./index.html')) || Response.error();
      return (await caches.match(event.request)) || Response.error();
    }
  })());
});
