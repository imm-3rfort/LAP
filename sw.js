// Service worker mínimo: permite instalar la PWA y abrir sin conexión lo ya visitado
const CACHE = 'ans-v1';
const FILES = ['./', './index.html', './ans-shell.css', './ans-shell.js', './ans-firebase.js', './manifest.json'];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(FILES)));
  self.skipWaiting();
});

self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== CACHE).map(k => caches.delete(k)))));
  self.clients.claim();
});

// Red primero (para ver cambios nuevos), caché como respaldo
self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET') return;
  e.respondWith(fetch(e.request).catch(() => caches.match(e.request)));
});
