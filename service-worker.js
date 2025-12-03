// Service Worker version (increment this to force browser to update cache)
const CACHE_NAME = 'sleep-tracker-v4'; // Incrementing version again

// List of files to cache for offline use
const urlsToCache = [
  // --- CORE LOCAL FILES ---
  // Using absolute path with repo name to match GitHub Pages structure
  '/biphasic-alarm/',
  '/biphasic-alarm/index.html',
  '/biphasic-alarm/manifest.json',

  // --- ICON FILES (MUST MATCH MANIFEST PATH) ---
  '/biphasic-alarm/blob/main/android-chrome-192x192.png',
  '/biphasic-alarm/blob/main/android-chrome-512x512.png',

  // --- IMPORTANT FIX: Removed all external CDNs from caching (Tailwind, React, Babel)
  // because service workers cannot cache cross-origin resources without CORS headers,
  // causing the "Failed to fetch" error. The app will require network access for these,
  // but core logic and PWA status will be fixed.
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
      .catch(error => {
        console.error('[Service Worker] Caching failed:', error);
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
