// Service Worker version (increment this to force browser to update cache)
const CACHE_NAME = 'sleep-tracker-v3'; // Incrementing version to force immediate update

// List of files to cache for offline use
const urlsToCache = [
  './',
  './index.html',
  './manifest.json',
  // --- FIXED: Using relative paths for local files ---
  // If the app is hosted at a subpath (e.g., /repo-name/), absolute paths (starting with /) fail.
  './android-chrome-192x192.png',
  './android-chrome-512x512.png',
  // ---------------------------------------------------
  'https://cdn.tailwindcss.com',
  'https://unpkg.com/react@18/umd/react.development.js',
  'https://unpkg.com/react-dom@18/umd/react-dom.development.js',
  'https://unpkg.com/@babel/standalone/babel.min.js'
];

// Install event: Caches all static assets
self.addEventListener('install', (event) => {
  console.log('[Service Worker] Install');
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => {
        console.log('[Service Worker] Caching app shell');
        return cache.addAll(urlsToCache);
      })
  );
});

// Activate event: Cleans up old caches
self.addEventListener('activate', (event) => {
  console.log('[Service Worker] Activate');
  const cacheWhitelist = [CACHE_NAME];
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cacheName) => {
          if (cacheWhitelist.indexOf(cacheName) === -1) {
            console.log('[Service Worker] Deleting old cache:', cacheName);
            return caches.delete(cacheName);
          }
        })
      );
    })
  );
  return self.clients.claim();
});

// Fetch event: Serves cached content or fetches from network
self.addEventListener('fetch', (event) => {
  event.respondWith(
    caches.match(event.request).then((response) => {
      // Cache hit - return response
      if (response) {
        return response;
      }

      // Not in cache - fetch from network
      return fetch(event.request).catch(() => {
        // This is where you could return an offline page if needed
        console.log('[Service Worker] Fetch failed, no cache match:', event.request.url);
      });
    })
  );
});
