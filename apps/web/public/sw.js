const SHELL_CACHE_PREFIX = "our-tomorrow-shell-";
const SHELL_CACHE = `${SHELL_CACHE_PREFIX}v1`;
const SHELL_FALLBACK = "/__our_tomorrow_shell__";
const PRIVATE_PREFIXES = ["/api/", "/socket/"];
const STATIC_PATHS = [
  "/manifest.webmanifest",
  "/icons/icon-192.svg",
  "/icons/icon-512.svg",
  "/icons/icon-maskable-512.svg",
];

function isPrivateRequest(url) {
  return PRIVATE_PREFIXES.some((prefix) => url.pathname.startsWith(prefix));
}

function cacheable(response) {
  return (
    response.ok && (response.type === "basic" || response.type === "default")
  );
}

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(SHELL_CACHE)
      .then((cache) => cache.addAll(STATIC_PATHS))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter(
              (key) =>
                key.startsWith(SHELL_CACHE_PREFIX) && key !== SHELL_CACHE,
            )
            .map((key) => caches.delete(key)),
        ),
      )
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin || isPrivateRequest(url)) return;

  if (request.mode === "navigate") {
    event.respondWith(
      fetch(request)
        .then(async (response) => {
          if (cacheable(response)) {
            const cache = await caches.open(SHELL_CACHE);
            await cache.put(SHELL_FALLBACK, response.clone());
          }
          return response;
        })
        .catch(async () => {
          const cached = await caches.match(SHELL_FALLBACK);
          if (cached) return cached;
          return new Response(
            "<!doctype html><html lang='zh-CN'><meta charset='utf-8'><meta name='viewport' content='width=device-width'><title>明天 · 暂时离线</title><body style='font-family:system-ui;padding:2rem;background:#f8f6f2;color:#252a31'><h1>暂时没有网络</h1><p>应用外壳还没缓存完成。恢复网络后再打开一次明天即可。</p></body></html>",
            { headers: { "Content-Type": "text/html; charset=utf-8" } },
          );
        }),
    );
    return;
  }

  if (
    url.pathname.startsWith("/assets/") ||
    STATIC_PATHS.includes(url.pathname)
  ) {
    event.respondWith(
      caches.match(request).then(async (cached) => {
        if (cached) return cached;
        const response = await fetch(request);
        if (cacheable(response)) {
          const cache = await caches.open(SHELL_CACHE);
          await cache.put(request, response.clone());
        }
        return response;
      }),
    );
  }
});

self.addEventListener("message", (event) => {
  if (event.data?.type !== "CLEAR_PRIVATE_DATA") return;
  event.waitUntil(
    caches.open(SHELL_CACHE).then(async (cache) => {
      const requests = await cache.keys();
      await Promise.all(
        requests
          .filter((request) => isPrivateRequest(new URL(request.url)))
          .map((request) => cache.delete(request)),
      );
    }),
  );
});
