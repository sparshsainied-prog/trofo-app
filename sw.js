// Service worker for the locked copy: keeps the unlock screen and the encrypted app
// available offline. Scans still need the internet.
importScripts('push-sw.js'); // reminders
const VERSION = 'trofo-locked-29c49f4df936';
const SHELL = ['./', 'index.html', 'lock.json', 'app.bin', 'manifest.webmanifest', 'icons/icon-192.png', 'icons/apple-touch-icon.png'];

self.addEventListener('install', event => {
  event.waitUntil(caches.open(VERSION).then(c => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', event => {
  event.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k !== VERSION).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});

self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);
  if (event.request.method !== 'GET' || url.hostname === 'api.anthropic.com') return;
  const isFont = url.hostname === 'fonts.googleapis.com' || url.hostname === 'fonts.gstatic.com';
  if (url.origin !== location.origin && !isFont) return;
  // App files: use the network when online so updates arrive, fall back to the cache offline.
  event.respondWith(
    fetch(event.request)
      .then(res => { const copy = res.clone(); caches.open(VERSION).then(c => c.put(event.request, copy)); return res; })
      .catch(() => caches.match(event.request).then(r => r || caches.match('index.html')))
  );
});
