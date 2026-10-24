const C = 'tl-v3';
const FILES = ['./', 'index.html', 'css/style.css', 'js/math.js', 'js/app.js', 'js/account.js', 'js/firebase-config.js',
  'manifest.webmanifest', 'icon.svg', 'icon-192.png', 'icon-512.png'];
// Faqat o'z saytimiz va statik kutubxona/model manbalari keshlanadi (Firebase/Auth so'rovlari keshlanmaydi)
const CDN = ['cdn.jsdelivr.net', 'storage.googleapis.com', 'tfhub.dev', 'www.gstatic.com'];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(C).then(c => Promise.all(FILES.map(f => c.add(f).catch(() => {})))));
  self.skipWaiting();
});
self.addEventListener('activate', e => e.waitUntil(
  caches.keys().then(k => Promise.all(k.filter(x => x !== C).map(x => caches.delete(x)))).then(() => self.clients.claim())));

// Tarmoq birinchi, oflayn bo'lsa kesh
self.addEventListener('fetch', e => {
  const r = e.request;
  if (r.method !== 'GET') return;
  const u = new URL(r.url);
  if (u.origin !== location.origin && !CDN.includes(u.hostname)) return;
  e.respondWith(
    fetch(r).then(res => {
      if (res.status === 200 || res.type === 'opaque') {
        const cp = res.clone();
        caches.open(C).then(c => c.put(r, cp)).catch(() => {});
      }
      return res;
    }).catch(() => caches.match(r).then(m => m || (r.mode === 'navigate' ? caches.match('index.html') : Response.error())))
  );
});
