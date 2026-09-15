// Muzik is a controller for a server that is only reachable over the VPN. Nothing is
// cached: a cached shell would keep rendering the UI on devices that are off the VPN,
// which defeats the access gate. The worker only exists so the app stays installable.
// "activate" purges caches left behind by the previous, shell-caching version.
self.addEventListener("install", () => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.map((key) => caches.delete(key))))
      .then(() => self.clients.claim()),
  );
});
