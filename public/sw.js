// VisaRadar Service Worker
// Enables reg.showNotification() AND a safe offline cache for static assets
// + a runtime cache for GET requests so users keep working briefly offline.
// IMPORTANT: We never cache HTML navigations (always network-first) to avoid
// stale UI, and we never cache Supabase API/auth/storage POSTs.

const SW_VERSION = "v3-offline";
const STATIC_CACHE = `visaradar-static-${SW_VERSION}`;
const RUNTIME_CACHE = `visaradar-runtime-${SW_VERSION}`;
const OFFLINE_URL = "/";

const PRECACHE_URLS = [
  "/",
  "/manifest.json",
  "/icon-192.png",
  "/icon-512.png",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(STATIC_CACHE)
      .then((cache) => cache.addAll(PRECACHE_URLS).catch(() => undefined))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      // Drop any caches from older SW versions
      const keys = await caches.keys();
      await Promise.all(
        keys
          .filter((k) => k !== STATIC_CACHE && k !== RUNTIME_CACHE)
          .map((k) => caches.delete(k)),
      );
      await self.clients.claim();
    })(),
  );
});

const isApiRequest = (url) =>
  url.hostname.endsWith(".supabase.co") ||
  url.hostname.endsWith(".supabase.in") ||
  url.pathname.startsWith("/auth/v1") ||
  url.pathname.startsWith("/rest/v1") ||
  url.pathname.startsWith("/storage/v1") ||
  url.pathname.startsWith("/realtime/v1");

const isAssetRequest = (request) => {
  const dest = request.destination;
  return (
    dest === "style" ||
    dest === "script" ||
    dest === "image" ||
    dest === "font" ||
    dest === "manifest"
  );
};

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;

  let url;
  try {
    url = new URL(request.url);
  } catch {
    return;
  }

  // Never intercept Supabase / API / OAuth — they must always hit network
  if (isApiRequest(url)) return;
  if (url.pathname.startsWith("/~oauth")) return;

  // HTML navigations: network-first, fall back to cached "/" when offline
  if (request.mode === "navigate") {
    event.respondWith(
      (async () => {
        try {
          const fresh = await fetch(request);
          return fresh;
        } catch {
          const cache = await caches.open(STATIC_CACHE);
          const cached = await cache.match(OFFLINE_URL);
          return (
            cached ||
            new Response("<h1>غير متصل</h1>", {
              status: 503,
              headers: { "Content-Type": "text/html; charset=utf-8" },
            })
          );
        }
      })(),
    );
    return;
  }

  // Static assets: stale-while-revalidate
  if (isAssetRequest(request) && url.origin === self.location.origin) {
    event.respondWith(
      (async () => {
        const cache = await caches.open(RUNTIME_CACHE);
        const cached = await cache.match(request);
        const networkPromise = fetch(request)
          .then((response) => {
            if (response && response.status === 200 && response.type !== "opaque") {
              cache.put(request, response.clone()).catch(() => undefined);
            }
            return response;
          })
          .catch(() => null);
        return cached || (await networkPromise) || new Response("", { status: 504 });
      })(),
    );
  }
});

// Handle clicks on notifications: focus an open tab or open a new one.
self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const targetUrl = (event.notification.data && event.notification.data.url) || "/";
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((clientsArr) => {
      for (const client of clientsArr) {
        if ("focus" in client) {
          try {
            client.navigate(targetUrl);
          } catch (_) {}
          return client.focus();
        }
      }
      if (self.clients.openWindow) {
        return self.clients.openWindow(targetUrl);
      }
    })
  );
});

// Optional: handle web push payloads if/when a push server is added later.
self.addEventListener("push", (event) => {
  let payload = {};
  try {
    payload = event.data ? event.data.json() : {};
  } catch (_) {
    payload = { title: "VisaRadar", body: event.data ? event.data.text() : "" };
  }
  const title = payload.title || "VisaRadar";
  const options = {
    body: payload.body || "",
    icon: payload.icon || "/icon-192.png",
    badge: payload.badge || "/icon-192.png",
    tag: payload.tag || "visaradar",
    data: { url: payload.url || "/" },
    dir: "rtl",
    lang: "ar",
  };
  event.waitUntil(self.registration.showNotification(title, options));
});
