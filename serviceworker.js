const CACHE_NAME = 'financedb-v1.2.4';
const ASSETS_TO_CACHE = [
  './',
  './index.html',
  './style.css',
  './app.js',
  './icon.png',
  './vendor/chart.umd.min.js',
  './vendor/lucide.min.js',
  './vendor/sql-wasm.js',
  './vendor/sql-wasm.wasm'
];

// Install event: Cache assets
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => {
      return cache.addAll(ASSETS_TO_CACHE);
    })
  );
  self.skipWaiting();
});

// Activate event: Clean up old caches
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(cacheNames => {
      return Promise.all(
        cacheNames.map(cache => {
          if (cache !== CACHE_NAME) {
            return caches.delete(cache);
          }
        })
      );
    })
  );
  self.clients.claim();
});

// Fetch event: Serve from cache, fallback to network
self.addEventListener('fetch', event => {
  // We only want to handle GET requests
  if (event.request.method !== 'GET') return;

  event.respondWith(
    caches.match(event.request).then(cachedResponse => {
      if (cachedResponse) {
        return cachedResponse; // Return cached copy (perfect for offline!)
      }
      return fetch(event.request).then(networkResponse => {
        // Cache the dynamically fetched resource (good for future-proofing)
        return caches.open(CACHE_NAME).then(cache => {
          cache.put(event.request, networkResponse.clone());
          return networkResponse;
        });
      }).catch(() => {
        // If both cache and network fail (offline and not cached)
        return null; 
      });
    })
  );
});
