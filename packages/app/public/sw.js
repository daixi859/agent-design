/* Pi Studio service worker：满足 Chrome 安装条件，并给独立窗口一个离线兜底。
   策略：GET 且非 /api 一律 network-first，成功响应顺手进运行时缓存；
   断网时回退缓存，所以装好的应用至少能看最后一次打开过的页面。
   /api 是会话实时数据，永不缓存。 */
const CACHE = "pi-studio-v1";

self.addEventListener("install", () => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(keys.filter((key) => key !== CACHE).map((key) => caches.delete(key)));
      await self.clients.claim();
    })(),
  );
});

self.addEventListener("fetch", (event) => {
  const url = new URL(event.request.url);
  if (event.request.method !== "GET" || url.pathname.startsWith("/api")) return;
  event.respondWith(
    fetch(event.request)
      .then((response) => {
        if (response.ok && url.origin === self.location.origin) {
          const copy = response.clone();
          caches.open(CACHE).then((cache) => cache.put(event.request, copy));
        }
        return response;
      })
      .catch(() => caches.match(event.request)),
  );
});
