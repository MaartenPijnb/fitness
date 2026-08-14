/* =========================================================================
   sw.js — offline cache.

   De app is volledig statisch, dus alles gaat cache-first. Bij een nieuwe
   versie wordt CACHE opgehoogd; oude caches worden bij activate opgeruimd.
   Netwerk wordt alleen geraadpleegd als de cache niets heeft, of op de
   achtergrond om de kopie te verversen.
   ========================================================================= */

const CACHE = 'kracht-v1';

const SHELL = [
  '.',
  'index.html',
  'css/styles.css',
  'js/store.js',
  'js/engine.js',
  'js/charts.js',
  'js/app.js',
  'manifest.webmanifest',
  'icons/icon-192.png',
  'icons/icon-512.png',
  'icons/maskable-512.png',
  'icons/apple-touch-icon.png',
];

// De seed hoeft er niet te zijn: staat de app publiek, dan wordt de
// geschiedenis via de importknop ingelezen in plaats van meegeleverd.
const OPTIONAL = ['data/seed.json'];

self.addEventListener('install', e => {
  e.waitUntil((async () => {
    const c = await caches.open(CACHE);
    await c.addAll(SHELL);
    await Promise.all(OPTIONAL.map(u => c.add(u).catch(() => {})));
    await self.skipWaiting();
  })());
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET' || new URL(req.url).origin !== location.origin) return;

  e.respondWith(
    caches.match(req).then(hit => {
      // Op de achtergrond verversen zodat een update de volgende keer klaarstaat.
      const net = fetch(req).then(res => {
        if (res && res.ok) {
          const copy = res.clone();
          caches.open(CACHE).then(c => c.put(req, copy));
        }
        return res;
      }).catch(() => hit);

      return hit || net;
    })
  );
});
