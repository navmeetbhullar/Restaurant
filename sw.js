// Background helper. Runs even when the app is closed.
//  1. Keeps the app's files on the phone so pages open instantly. It shows the
//     saved copy and quietly downloads the newest one for next time.
//  2. Shows notifications: the server sends { title, body, url }.
const CACHE = 'stock-v2';
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', e => e.waitUntil((async () => {
  for (const k of await caches.keys()) if (k !== CACHE) await caches.delete(k);
  await self.clients.claim();
})()));

const SAVE = url =>
  (url.origin === self.location.origin && !url.pathname.startsWith('/api/')) ||
  url.href.startsWith('https://www.gstatic.com/firebasejs/') ||
  url.href.startsWith('https://cdn.jsdelivr.net/npm/jspdf');

self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (!SAVE(url)) return;
  e.respondWith((async () => {
    const cache = await caches.open(CACHE);
    const key = url.origin === self.location.origin ? url.pathname : req;   // ignore ?id=... for pages
    const saved = await cache.match(key);
    const fetching = fetch(req).then(res => {
      if (res.ok) cache.put(key, res.clone());
      return res;
    }).catch(() => saved);
    if (saved) { e.waitUntil(fetching); return saved; }
    return fetching;
  })());
});

self.addEventListener('push', e => {
  let d = {};
  try { const p = e.data.json(); d = p.data || p.notification || p; } catch { d = { body: e.data?.text() }; }
  e.waitUntil(self.registration.showNotification(d.title || 'Restaurant Stock', {
    body: d.body || '',
    icon: 'icons/icon-192.png',
    badge: 'icons/badge-96.png',
    tag: d.tag || undefined,
    data: { url: d.url || '/today.html' },
  }));
});

self.addEventListener('notificationclick', e => {
  e.notification.close();
  const url = new URL(e.notification.data?.url || '/today.html', self.location.origin).href;
  e.waitUntil(self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(list => {
    for (const c of list) if ('focus' in c) { c.navigate?.(url); return c.focus(); }
    return self.clients.openWindow(url);
  }));
});
