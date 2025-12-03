// Service Worker version (increment this to force browser to update cache)
const CACHE_NAME = 'sleep-tracker-v8'; // Incrementing version for path adjustment

// List of files to cache for offline use
const urlsToCache = [
  // --- CORE LOCAL FILES ---
  // FIX: Switching to absolute paths relative to the GitHub Pages *subpath* // (e.g., /biphasic-alarm/) for greater reliability in caching.
  '/biphasic-alarm/',
  '/biphasic-alarm/index.html',
  '/biphasic-alarm/manifest.json',

  // --- ICON FILES (Using absolute repository path) ---
  '/biphasic-alarm/images/android-chrome-192x192.png',
  '/biphasic-alarm/images/android-chrome-512x512.png',

  // External CDNs remain excluded to prevent CORS failure during caching.
];

// Install event: Caches all static assets
self.addEventListener('install', (event) => {
  console.log('[Service Worker] Install (v8)');
  // Force the new service worker to activate immediately, bypassing waiting period
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => {
        console.log('[Service Worker] Caching app shell');
        // This is where the fetch failure happens. We trust the new paths fix it.
        return cache.addAll(urlsToCache);
      })
      .catch(error => {
        // Log caching failures, likely due to a path issue
        console.error('[Service Worker] Caching failed:', error);
      })
  );
});

// Activate event: Cleans up old caches
self.addEventListener('activate', (event) => {
  console.log('[Service Worker] Activate (v8)');
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
  // Check if this is a request for a file we want to cache-first (e.g., local assets)
  const url = new URL(event.request.url);
  const isLocalAsset = url.origin === location.origin;

  if (isLocalAsset) {
    event.respondWith(
      caches.match(event.request).then((response) => {
        // Cache hit - return cached response
        if (response) {
          return response;
        }

        // Cache miss - fetch from network
        return fetch(event.request);
      })
    );
  } else {
    // For external CDNs (like Tailwind), use network only (or network-first)
    // to avoid CORS errors during caching. We rely on the browser's normal network access.
    event.respondWith(fetch(event.request));
  }
});
