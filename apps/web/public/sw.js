/* Kept caches only publicly versioned static build assets.
 * Never cache HTML, auth, wallet, RPC, or API responses. */
const CACHE_NAME = "kept-static-v1";
const STATIC_ASSET = /^\/assets\/[^/]+\.(?:js|css|woff2?|png|svg|ico)$/;

self.addEventListener("install", () => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    Promise.all([
      caches.keys().then((keys) =>
        Promise.all(
          keys.filter((key) => key.startsWith("kept-static-") && key !== CACHE_NAME)
            .map((key) => caches.delete(key)),
        ),
      ),
      self.clients.claim(),
    ]),
  );
});

self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET" || request.mode === "navigate") return;
  const url = new URL(request.url);
  if (
    url.origin !== self.location.origin
    || !STATIC_ASSET.test(url.pathname)
    || request.headers.has("Authorization")
  ) return;

  event.respondWith(
    fetch(request).then((response) => {
      if (response.ok && response.type === "basic") {
        const copy = response.clone();
        event.waitUntil(
          caches.open(CACHE_NAME).then((cache) => cache.put(request, copy)),
        );
      }
      return response;
    }).catch(async () => {
      const cached = await caches.match(request);
      if (cached) return cached;
      return Response.error();
    }),
  );
});
