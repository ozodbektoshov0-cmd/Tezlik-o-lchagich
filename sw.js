const C = 'tl-v2';
const FILES = ['./', 'index.html', 'css/style.css', 'js/math.js', 'js/app.js', 'js/account.js', 'js/firebase-config.js', 'manifest.webmanifest', 'icon.svg'];
self.addEventListener('install', e => { e.waitUntil(caches.open(C).then(c => c.addAll(FILES))); self.skipWaiting(); });
self.addEventListener('activate', e => e.waitUntil(
  caches.keys().then(k => Promise.all(k.filter(x => x !== C).map(x => caches.delete(x)))).then(() => self.clients.claim())));
// Tarmoq birinchi, oflayn bo'lsa kesh
self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET') return;
  e.respondWith(fetch(e.request).then(r => {
    const cp = r.clone(); caches.open(C).then(c => c.put(e.request, cp)); return r;
  }).catch(() => caches.match(e.request)));
});
