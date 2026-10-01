// Background helper. Runs even when the app is closed.
//  1. Keeps a copy of the app's files on the phone. Pages and app code come
//     from the internet first (so a new version is never mixed with an old
//     one) and the copy is only used when offline. Library files with a
//     version number in their address never change, so those load from the copy.
//  2. Shows notifications: the server sends { title, body, url }.
const CACHE = 'stock-v3';
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', e => e.waitUntil((async () => {
  for (const k of await caches.keys()) if (k !== CACHE) await caches.delete(k);
  await self.clients.claim();
})()));

const FIXED = url => url.href.startsWith('https://www.gstatic.com/firebasejs/') || url.href.startsWith('https://cdn.jsdelivr.net/npm/jspdf');
const OURS = url => url.origin === self.location.origin && !url.pathname.startsWith('/api/');

self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (FIXED(url)) {
    e.respondWith(caches.open(CACHE).then(async cache => {
      const hit = await cache.match(req);
      if (hit) return hit;
      const res = await fetch(req);
      if (res.ok) cache.put(req, res.clone());
      return res;
    }));
  } else if (OURS(url)) {
    const key = url.pathname;                       // ignore ?id=... for pages
    e.respondWith(fetch(req).then(res => {
      if (res.ok) { const copy = res.clone(); caches.open(CACHE).then(c => c.put(key, copy)); }
      return res;
    }).catch(async () => (await caches.match(key)) || Response.error()));
  }
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
