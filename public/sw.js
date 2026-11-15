// Hors ligne : coquille de l'appli en cache, livres téléchargés dans "book-<id>", lectures audio par plages (Range).
const SHELL = "shell-v16";
const SHELL_FILES = ["/", "/style.css", "/app.js", "/i18n.js", "/build.js", "/align.js", "/vendor/pdf.min.mjs", "/vendor/pdf.worker.min.mjs", "/manifest.webmanifest", "/icon.svg", "/books/index.json"];

self.addEventListener("install", (e) => { e.waitUntil(caches.open(SHELL).then((c) => Promise.all(SHELL_FILES.map((f) => fetch(f, { cache: "reload" }).then((r) => c.put(f, r)))))); self.skipWaiting(); });
// les anciennes versions sont effacées : sinon, hors ligne, caches.match trouvait d'abord le vieux style.css
self.addEventListener("activate", (e) => e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k.startsWith("shell-") && k !== SHELL).map((k) => caches.delete(k)))).then(() => self.clients.claim())));

async function rangeFrom(res, range) {
  const buf = await res.arrayBuffer(), m = /bytes=(\d*)-(\d*)/.exec(range);
  const start = m[1] ? +m[1] : buf.byteLength - +m[2], end = m[2] && m[1] ? Math.min(+m[2], buf.byteLength - 1) : buf.byteLength - 1;
  return new Response(buf.slice(start, end + 1), { status: 206, headers: {
    "content-type": res.headers.get("content-type") || "audio/mp4", "content-range": `bytes ${start}-${end}/${buf.byteLength}`,
    "content-length": String(end - start + 1), "accept-ranges": "bytes" } });
}

self.addEventListener("fetch", (e) => {
  const req = e.request, url = new URL(req.url);
  if (req.method !== "GET") return;
  if (url.origin !== location.origin && !url.host.includes("fonts.")) return; // ex. l'assistant local 127.0.0.1
  if (url.pathname.startsWith("/admin")) return; // panneau admin : jamais en cache (et ne doit pas remplacer la page « / »)
  if (url.origin === location.origin && url.pathname.startsWith("/books/") && url.pathname !== "/books/index.json") {
    e.respondWith((async () => {
      const hit = await caches.match(url.pathname);
      if (hit) return req.headers.get("range") ? rangeFrom(hit, req.headers.get("range")) : hit;
      return fetch(req);
    })());
    return;
  }
  // API : réseau d'abord, dernière réponse connue si hors ligne
  if (url.origin === location.origin && url.pathname.startsWith("/api/")) {
    e.respondWith(fetch(req).then((r) => { if (r.ok) { const c = r.clone(); caches.open("api").then((ca) => ca.put(req, c)); } return r; })
      .catch(() => caches.match(req).then((r) => r || new Response('{"error":"hors ligne"}', { status: 503, headers: { "content-type": "application/json" } }))));
    return;
  }
  // Coquille + polices : réseau d'abord (mises à jour visibles tout de suite), cache sinon
  const isPage = req.mode === "navigate";
  e.respondWith(fetch(req).then((r) => {
    if (r.ok && (url.origin === location.origin || url.host.includes("fonts."))) { const c = r.clone(); caches.open(SHELL).then((ca) => ca.put(isPage ? "/" : req, c)); }
    return r;
  }).catch(() => caches.open(SHELL).then((c) => c.match(isPage ? "/" : req, { ignoreSearch: true })).then((r) => r || caches.match(req)).then((r) => r || Response.error())));
});
