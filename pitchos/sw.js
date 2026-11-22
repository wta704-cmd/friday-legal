// Offline shell for the PitchOS web app.
//
// Only static files are cached: API calls (Supabase REST/Auth/Functions) always
// go to the network, so a stale cache can never show another account's data or
// a vote that was already replaced.

const CACHE = 'pitchos-shell-v3';

const SHELL = [
  './',
  './index.html',
  './app.css',
  './manifest.webmanifest',
  './js/app.js',
  './js/api.js',
  './js/config.js',
  './js/diag.js',
  './js/store.js',
  './js/ui.js',
  './js/lib/crest.js',
  './js/lib/format.js',
  './js/lib/lineup.js',
  './js/lib/pitch.js',
  './js/views/auth.js',
  './js/views/common.js',
  './js/views/home.js',
  './js/views/my.js',
  './js/views/records.js',
  './js/views/team.js',
  './js/views/teamForms.js',
  './legal/terms.html',
  './legal/privacy.html',
  './legal/location.html',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/apple-touch-icon.png',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(CACHE)
      .then((cache) => cache.addAll(SHELL))
      .catch(() => undefined)
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((key) => key !== CACHE).map((key) => caches.delete(key))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .then((response) => {
          const copy = response.clone();
          caches.open(CACHE).then((cache) => cache.put('./index.html', copy)).catch(() => undefined);
          return response;
        })
        .catch(() => caches.match('./index.html').then((cached) => cached || caches.match('./'))),
    );
    return;
  }

  // Stale-while-revalidate: answer from the cache so the shell opens instantly,
  // and replace that copy in the background so a new deploy is picked up on the
  // next visit instead of being pinned by the service worker.
  event.respondWith(
    caches.match(request).then((cached) => {
      const network = fetch(request)
        .then((response) => {
          if (response.ok && response.type === 'basic') {
            const copy = response.clone();
            caches.open(CACHE).then((cache) => cache.put(request, copy)).catch(() => undefined);
          }
          return response;
        })
        .catch(() => cached);
      if (cached) {
        event.waitUntil(network.catch(() => undefined));
        return cached;
      }
      return network;
    }),
  );
});
