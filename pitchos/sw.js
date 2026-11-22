// Offline shell for the JOKBAL.L web app.
//
// Only static files are cached: API calls (Supabase REST/Auth/Functions) always
// go to the network, so a stale cache can never show another account's data or
// a vote that was already replaced.
//
// Static files are network-first with a revalidating fetch, and the cache is the
// fallback when the phone is offline. A deploy therefore shows up on the next
// visit instead of waiting for a background refresh that the browser's HTTP
// cache (GitHub Pages sends max-age=600) may answer with the old copy.

const CACHE = 'jokbal-shell-v14';

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
  './js/lib/gpx.js',
  './js/lib/lineup.js',
  './js/lib/matchEdit.js',
  './js/lib/pitch.js',
  './js/lib/quarters.js',
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
  './icons/icon-maskable-512.png',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(CACHE);
      // `cache: reload` skips the HTTP cache, so a new service worker never seeds
      // itself with the previous deploy's files.
      await Promise.all(
        SHELL.map(async (url) => {
          try {
            const response = await fetch(new Request(url, { cache: 'reload' }));
            if (response.ok) await cache.put(url, response);
          } catch {
            /* one missing file must not block the whole shell */
          }
        }),
      );
      await self.skipWaiting();
    })(),
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

  event.respondWith(
    (async () => {
      try {
        const response = await fetch(request, { cache: 'no-cache' });
        if (response && response.ok && response.type === 'basic') {
          const copy = response.clone();
          caches.open(CACHE).then((cache) => cache.put(request, copy)).catch(() => undefined);
        }
        return response;
      } catch {
        const cached = await caches.match(request);
        if (cached) return cached;
        if (request.mode === 'navigate') {
          const shell = await caches.match('./index.html');
          if (shell) return shell;
        }
        return new Response('오프라인 상태입니다.', {
          status: 503,
          headers: { 'content-type': 'text/plain; charset=utf-8' },
        });
      }
    })(),
  );
});
