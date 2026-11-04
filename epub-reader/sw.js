// Bump this version whenever a cached reader file changes. A release activates
// after all Reader tabs/windows close, keeping an open book on one asset version.
const CACHE_VERSION = "v9";
const CACHE_PREFIX = `epub-reader:${self.registration.scope}:`;
const CACHE_NAME = `${CACHE_PREFIX}${CACHE_VERSION}`;
const SHELL_FILES = [
  "index.html",
  "styles.css",
  "app.js",
  "config.js",
  "book-cache.js",
  "drive.js",
  "drive-ui.js",
  "pwa.js",
  "manifest.webmanifest",
  "vendor/jszip.min.js",
  "vendor/epub.min.js",
  "../logo.svg",
  "icons/logo-192.png",
  "icons/logo-512.png",
  "icons/logo-maskable-512.png",
  "icons/logo-180.png",
];
const shellUrls = new Set(SHELL_FILES.map((path) => new URL(path, self.registration.scope).href));
const indexUrl = new URL("index.html", self.registration.scope).href;
const scopeUrl = new URL(self.registration.scope);

self.addEventListener("install", (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE_NAME);
    await cache.addAll([...shellUrls].map((url) => new Request(url, { cache: "reload" })));
  })());
  // No skipWaiting: do not change the reader underneath an open book.
});

self.addEventListener("activate", (event) => {
  event.waitUntil((async () => {
    const names = await caches.keys();
    await Promise.all(names
      .filter((name) => name.startsWith(CACHE_PREFIX) && name !== CACHE_NAME)
      .map((name) => caches.delete(name)));
    await self.clients.claim();
  })());
});

self.addEventListener("fetch", (event) => {
  const request = event.request;
  const url = new URL(request.url);
  if (request.method !== "GET" || url.origin !== scopeUrl.origin) return;

  let cacheKey = url.href;
  if (request.mode === "navigate" &&
      (url.pathname === scopeUrl.pathname || url.pathname === new URL(indexUrl).pathname)) {
    cacheKey = indexUrl;
  }
  if (!shellUrls.has(cacheKey)) return;

  // Only the explicit app shell is cached, never selected books or web lookups.
  event.respondWith((async () => {
    const cache = await caches.open(CACHE_NAME);
    return await cache.match(cacheKey) || fetch(request);
  })());
});
