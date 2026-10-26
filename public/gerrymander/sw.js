// Service worker: lets the game load and play with no connection once it has been opened once.
// - On install it saves the page and every file the page needs.
// - Pages are fetched fresh when online (so updates arrive) and fall back to the saved copy offline.
// - Everything else is served from the saved copy first.
// Change VERSION to force every device to refresh its saved copy.
const VERSION = 'gerrymander-v1';

self.addEventListener('install', (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(VERSION);
    const base = self.registration.scope;
    const page = await fetch(base, { cache: 'reload' });
    const html = await page.clone().text();
    await cache.put(base, page);
    const found = [...html.matchAll(/(?:src|href)="([^"]+)"/g)].map((m) => m[1]).filter((u) => !u.startsWith('http') && !u.startsWith('#') && !u.startsWith('data:'));
    const extras = ['manifest.webmanifest', 'favicon.svg', 'icons/icon-192.png', 'icons/icon-512.png', 'icons/apple-touch-icon.png'];
    const urls = [...new Set([...found, ...extras])].map((u) => new URL(u, base).href);
    await Promise.all(urls.map(async (u) => {
      try { await cache.add(new Request(u, { cache: 'reload' })); } catch (e) { /* one missing file should not block install */ }
    }));
    await self.skipWaiting();
  })());
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    for (const key of await caches.keys()) if (key !== VERSION) await caches.delete(key);
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET' || new URL(req.url).origin !== self.location.origin) return;
  if (req.mode === 'navigate') {
    event.respondWith((async () => {
      const cache = await caches.open(VERSION);
      try {
        const fresh = await fetch(req);
        cache.put(self.registration.scope, fresh.clone());
        return fresh;
      } catch (e) {
        return (await cache.match(self.registration.scope)) || Response.error();
      }
    })());
    return;
  }
  event.respondWith((async () => {
    const cache = await caches.open(VERSION);
    const hit = await cache.match(req);
    if (hit) return hit;
    const fresh = await fetch(req);
    if (fresh.ok) cache.put(req, fresh.clone());
    return fresh;
  })());
});
