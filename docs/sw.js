// 네트워크 우선, 오프라인이면 마지막으로 본 화면을 보여줌
const C = "beltgrad-v2";
self.addEventListener("install", (e) => self.skipWaiting());
self.addEventListener("activate", (e) => e.waitUntil(
  caches.keys().then((ks) => Promise.all(ks.filter((k) => k !== C).map((k) => caches.delete(k)))).then(() => self.clients.claim())
));
self.addEventListener("fetch", (e) => {
  if (e.request.method !== "GET" || new URL(e.request.url).origin !== location.origin) return;
  e.respondWith(
    // 브라우저 HTTP 캐시(GitHub Pages 기본 10분)를 건너뛰고 항상 새 파일을 확인
    fetch(e.request.mode === "navigate" ? e.request : new Request(e.request, { cache: "no-cache" })).then((r) => { const copy = r.clone(); caches.open(C).then((c) => c.put(e.request, copy)); return r; })
      .catch(() => caches.match(e.request))
  );
});
