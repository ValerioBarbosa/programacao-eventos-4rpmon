const CACHE_NAME = "agenda-4rpmon-v20";
const APP_SHELL = [
  "./",
  "./index.html",
  "./admin.html",
  "./style.css?v=20260821-1",
  "./app.js?v=20260821-1",
  "./core.js?v=20260816-1",
  "./firebase-config.js",
  "./manifest.webmanifest",
  "./image.png?v=20260814-1",
  "./icon-192.png",
  "./icon-512.png"
];

self.addEventListener("install", event => {
  event.waitUntil(caches.open(CACHE_NAME).then(cache => cache.addAll(APP_SHELL)));
  self.skipWaiting();
});

self.addEventListener("activate", event => {
  event.waitUntil(
    caches.keys().then(keys => Promise.all(keys.filter(key => key !== CACHE_NAME).map(key => caches.delete(key))))
  );
  self.clients.claim();
});

async function buscarEAtualizarCache(request) {
  try {
    const response = await fetch(request);
    const cache = await caches.open(CACHE_NAME);
    await cache.put(request, response.clone());
    return response;
  } catch {
    return (await caches.match(request)) || Response.error();
  }
}

self.addEventListener("fetch", event => {
  const request = event.request;
  if (request.method !== "GET") return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  if (request.mode === "navigate") {
    event.respondWith(
      fetch(request).then(response => {
        const copia = response.clone();
        caches.open(CACHE_NAME).then(cache => cache.put(request, copia));
        return response;
      }).catch(() => caches.match(request).then(response => response || caches.match("./index.html")))
    );
    return;
  }

  const recursoVersionado = url.searchParams.has("v");
  event.respondWith(recursoVersionado
    ? buscarEAtualizarCache(request)
    : caches.match(request).then(response => response || buscarEAtualizarCache(request))
  );
});
