// Origens permitidas: HTTP (CORS/403), matchmaking do Colyseus e WebSocket.
// Uso: SERVER=http://localhost:2999 node test/origem.mjs   (servidor de teste, fora de produção)
import { WebSocket } from "ws";

const HTTP = process.env.SERVER ?? "http://localhost:2999";
const WS = HTTP.replace(/^http/, "ws");
const OK = "http://localhost:5173"; // CLIENT_URL padrão; fora de produção localhost:* também passa
const OK_PROD = "https://frixep.com";
const RUIM = "https://clone-do-frixep.example.com";
let fails = 0;
const check = (name, ok, detail = "") => {
  if (!ok) fails++;
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? "  -> " + detail : ""}`);
};
const req = (path, origin, init = {}) =>
  fetch(`${HTTP}${path}`, { ...init, headers: { ...(origin ? { Origin: origin } : {}), ...(init.headers ?? {}) } });

console.log("== HTTP ==");
const guest = (o) => req("/auth/guest", o, { method: "POST" });
let r = await guest(OK);
check("Origin permitida (localhost:5173) passa", r.status === 200, String(r.status));
r = await guest(OK_PROD);
check("Origin oficial (frixep.com) passa", r.status === 200, String(r.status));
r = await guest(undefined);
check("sem Origin passa", r.status === 200, String(r.status));
r = await guest(RUIM);
check("Origin de outro site é recusada (403)", r.status === 403, String(r.status));
r = await req("/api/character", RUIM);
check("Origin de outro site recusada também em /api", r.status === 403, String(r.status));
r = await req("/health", RUIM);
check("/health sempre liberado, mesmo com Origin estranha", r.status === 200, String(r.status));
r = await req("/auth/guest", RUIM, { method: "OPTIONS", headers: { "Access-Control-Request-Method": "POST" } });
check("preflight de outro site é recusado", r.status === 403, String(r.status));

console.log("\n== matchmaking (Colyseus) ==");
const mm = (o) => req("/matchmake/joinOrCreate/zone", o, { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" });
r = await mm(RUIM);
check("matchmaking com Origin de outro site: 403", r.status === 403, String(r.status));
r = await mm(OK);
check("matchmaking com Origin permitida chega ao Colyseus (não é 403)", r.status !== 403, String(r.status));
r = await mm(undefined);
check("matchmaking sem Origin chega ao Colyseus (não é 403)", r.status !== 403, String(r.status));

console.log("\n== WebSocket ==");
const ws = (origin) =>
  new Promise((res) => {
    const s = new WebSocket(`${WS}/qualquer`, origin ? { origin } : {});
    s.on("open", () => { s.terminate(); res("aberto"); });
    s.on("unexpected-response", (_rq, rs) => { rs.resume(); res(`http ${rs.statusCode}`); });
    s.on("error", () => res("erro"));
    setTimeout(() => res("tempo"), 5000);
  });
let w = await ws(RUIM);
check("WebSocket com Origin de outro site: negado (403)", w === "http 403", w);
w = await ws(OK);
check("WebSocket com Origin permitida: não é 403", w !== "http 403", w);
w = await ws(undefined);
check("WebSocket sem Origin: não é 403", w !== "http 403", w);

console.log(fails ? `\n${fails} FALHA(S)` : "\nTudo certo.");
process.exitCode = fails ? 1 : 0;
