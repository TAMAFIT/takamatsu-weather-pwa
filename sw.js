const CACHE_NAME = 'takamatsu-weather-checker-mock-ui-v6-5-auto-verify';
const FILES = [
  './',
  './index.html',
  './style.css',
  './app.js',
  './manifest.webmanifest',
  './icons/icon.svg',
  './icons/weather-sun.svg',
  './icons/weather-sun-cloud.svg',
  './icons/weather-cloud-sun.svg',
  './icons/weather-cloud.svg',
  './icons/weather-rain.svg',
  './icons/metric-sun.svg',
  './icons/metric-flower.svg',
  './icons/metric-rain.svg',
  './icons/metric-wave.svg',
  './assets/bg-sunny.webp',
  './assets/bg-cloudy.webp',
  './assets/bg-rain.webp',
  './assets/bg-night.webp'
];

self.addEventListener('install', event => {
  event.waitUntil(caches.open(CACHE_NAME).then(cache => cache.addAll(FILES)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(key => key !== CACHE_NAME).map(key => caches.delete(key))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', event => {
  if (event.request.method !== 'GET') return;
  const url = new URL(event.request.url);
  if (url.origin !== location.origin) {
    event.respondWith(fetch(event.request).catch(() => new Response('', { status: 503 })));
    return;
  }
  event.respondWith(
    fetch(event.request)
      .then(response => {
        const copy = response.clone();
        caches.open(CACHE_NAME).then(cache => cache.put(event.request, copy)).catch(() => {});
        return response;
      })
      .catch(() => caches.match(event.request).then(cached => cached || caches.match('./index.html')))
  );
});
