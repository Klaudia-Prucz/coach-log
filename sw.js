const CACHE_VERSION = "v1";
const APP_SHELL_CACHE = `coachlog-shell-${CACHE_VERSION}`;
const RUNTIME_CACHE = `coachlog-runtime-${CACHE_VERSION}`;

const PRECACHE_URLS = [
  "./",
  "./index.html",
  "./offline.html",
  "./styles/app.css",
  "./js/app.js",
  "./js/router.js",
  "./js/storage.js",
  "./js/api.js",
  "./manifest.webmanifest",
  "./assets/icons/icon-192.png",
  "./assets/icons/icon-512.png",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(APP_SHELL_CACHE);
      await cache.addAll(PRECACHE_URLS);
      self.skipWaiting();
    })()
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(
        keys.map((key) => {
          if (![APP_SHELL_CACHE, RUNTIME_CACHE].includes(key)) {
            return caches.delete(key);
          }
        })
      );
      self.clients.claim();
    })()
  );
});

/**
 * Strategie cache:
 * 1) Navigation (HTML): Network First + fallback offline.html
 * 2) Statyki (CSS/JS/images/fonts): Cache First
 * 3) Inne: Network First z fallbackiem do cache
 */
self.addEventListener("fetch", (event) => {
  const req = event.request;
  const url = new URL(req.url);

  // tylko zasoby z tego samego origin
  if (url.origin !== self.location.origin) return;

  // 1) HTML / navigacje
  if (req.mode === "navigate") {
    event.respondWith(networkFirst(req));
    return;
  }

  // 2) Statyki
  if (["style", "script", "image", "font"].includes(req.destination)) {
    event.respondWith(cacheFirst(req));
    return;
  }

  // 3) Reszta
  event.respondWith(networkFirst(req));
});

async function cacheFirst(req) {
  const cached = await caches.match(req);
  if (cached) return cached;

  const fresh = await fetch(req);
  const cache = await caches.open(RUNTIME_CACHE);
  cache.put(req, fresh.clone());
  return fresh;
}

async function networkFirst(req) {
  try {
    const fresh = await fetch(req);
    const cache = await caches.open(RUNTIME_CACHE);
    cache.put(req, fresh.clone());
    return fresh;
  } catch (err) {
    const cached = await caches.match(req);
    if (cached) return cached;

    // jeśli to nawigacja i nic nie mamy -> offline.html
    if (req.mode === "navigate") return caches.match("./offline.html");

    throw err;
  }
}
