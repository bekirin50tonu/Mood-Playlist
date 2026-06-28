// Minimal offline-first service worker for the Mood Playlist PWA.
// Caches the app shell so the app loads offline; network-first for API calls.

const CACHE = "mood-playlist-v1";
const SHELL = ["/", "/manifest.webmanifest", "/icon.svg"];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE).then((cache) => cache.addAll(SHELL)).catch(() => {}),
  );
  // Activate immediately, even if another SW was controlling the page.
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))),
      ),
  );
  // Take control of all open tabs immediately.
  self.clients.claim();
});

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;

  const url = new URL(request.url);
  // Never cache API responses — they depend on auth + live data.
  if (url.pathname.startsWith("/api/")) return;

  // Same-origin requests only.
  if (url.origin !== self.location.origin) return;

  // Network-first for HTML navigations so dev changes show up immediately
  // and we never serve a stale shell.
  if (request.mode === "navigate") {
    event.respondWith(
      fetch(request)
        .then((res) => {
          if (res.ok && res.type === "basic") {
            const copy = res.clone();
            caches.open(CACHE).then((c) => c.put(request, copy)).catch(() => {});
          }
          return res;
        })
        .catch(() => caches.match("/").then((c) => c || new Response("Offline", { status: 503 }))),
    );
    return;
  }

  // Cache-first for static assets (JS/CSS/images).
  event.respondWith(
    caches.match(request).then((cached) => {
      if (cached) return cached;
      return fetch(request)
        .then((res) => {
          if (res.ok && res.type === "basic") {
            const copy = res.clone();
            caches.open(CACHE).then((c) => c.put(request, copy)).catch(() => {});
          }
          return res;
        })
        .catch(() => caches.match("/").then((c) => c || new Response("Offline", { status: 503 })));
    }),
  );
});
