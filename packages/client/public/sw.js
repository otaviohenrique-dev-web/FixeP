/* Service worker do FrixeP: só deixa o jogo instalável e acelera a abertura (cache do shell e da arte estática).
   NUNCA mexe em API, WebSocket (Colyseus) nem no _manifest.json de assets; o jogo continua exigindo rede.
   Para invalidar tudo, aumente VERSION. Versões antigas do cache são apagadas ao ativar. */
const VERSION = "v2"; // v2: a arte (PNG/JSON em subpastas de /assets) agora revalida na rede, para sprites novos aparecerem sem esperar
const CACHE = "frixep-static-" + VERSION;

self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (e) => {
  e.waitUntil((async () => {
    for (const k of await caches.keys()) if (k.startsWith("frixep-") && k !== CACHE) await caches.delete(k);
    await self.clients.claim();
  })());
});

const STATIC_EXT = /\.(?:png|jpg|jpeg|webp|svg|ico|woff2?|ogg|mp3|wav|css|js)$/i;

self.addEventListener("fetch", (e) => {
  const req = e.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return; // API e WebSocket ficam em outro host: passam direto
  const p = url.pathname;
  if (p === "/sw.js" || p.endsWith("/_manifest.json") || p.endsWith(".webmanifest") || (p.endsWith(".json") && !/^\/assets\/[^/]+\/.+\.json$/i.test(p)) || p.startsWith("/api")) return;
  if (req.mode === "navigate") { // página: rede primeiro; offline mostra a última cópia só para o app abrir
    e.respondWith(fetch(req).then((r) => { const c = r.clone(); caches.open(CACHE).then((x) => x.put("/", c)); return r; }).catch(() => caches.match("/").then((r) => r || Response.error())));
    return;
  }
  if (!STATIC_EXT.test(p) && !/^\/assets\/[^/]+\/.+\.json$/i.test(p)) return;
  // arte (atlas, sprites, ícones: /assets/<pasta>/...): rede primeiro (revalida com o servidor; um 304 é barato) e cai no cache só se estiver offline.
  // Sem isso o PNG antigo ficava preso (cache do navegador de 4 h + cache do service worker) e o arco novo "não chegava".
  if (/^\/assets\/[^/]+\/.+\.(?:png|json|webp|jpg|jpeg|svg)$/i.test(p)) {
    e.respondWith(caches.open(CACHE).then(async (c) => {
      try { const r = await fetch(req, { cache: "no-cache" }); if (r.ok) c.put(req, r.clone()); return r; }
      catch { return (await c.match(req)) || Response.error(); }
    }));
    return;
  }
  // estáticos: usa o cache e atualiza em segundo plano (a arte pode ser trocada sem renomear o arquivo)
  e.respondWith(caches.open(CACHE).then(async (c) => {
    const hit = await c.match(req);
    const net = fetch(req).then((r) => { if (r.ok) c.put(req, r.clone()); return r; }).catch(() => hit || Response.error());
    return hit || net;
  }));
});
