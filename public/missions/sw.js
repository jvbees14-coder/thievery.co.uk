/* Thievery.co.uk Missions: the service worker.
 *
 * Served from /missions/sw.js with the scope /missions (index.js says it may
 * reach that far), so it touches nothing else on the site. It caches nothing
 * and handles no fetches: its only jobs are to show a dare when one is
 * pushed, and to open the Missions page when the dare is tapped.
 *
 * Served no-store, so a change here reaches every phone on its next visit. */

self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (event) => event.waitUntil(self.clients.claim()));

self.addEventListener('push', (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch {
    data = { body: event.data ? event.data.text() : '' };
  }
  const title = data.title || 'New mission';
  const shown = self.registration.showNotification(title, {
    body: data.body || 'Open Missions to see it.',
    tag: data.tag || 'mission',
    renotify: true,
    icon: '/icons/icon-192.png',
    badge: '/icons/icon-192.png',
    data: { url: '/missions' },
  });
  // An open Missions page shows the new dare straight away rather than on
  // its next check.
  const told = self.clients
    .matchAll({ type: 'window', includeUncontrolled: true })
    .then((list) => list.forEach((c) => c.postMessage({ type: 'mission' })));
  event.waitUntil(Promise.all([shown, told]));
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const url = (event.notification.data && event.notification.data.url) || '/missions';
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((list) => {
      for (const c of list) {
        if (new URL(c.url).pathname.startsWith('/missions') && 'focus' in c) {
          c.postMessage({ type: 'mission' });
          return c.focus();
        }
      }
      return self.clients.openWindow(url);
    })
  );
});
