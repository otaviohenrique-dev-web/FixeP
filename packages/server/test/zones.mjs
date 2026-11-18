// Teste de ponta a ponta das zonas e da travessia: portal por proximidade, recusa fora do alcance, zona salva e restaurada,
// sala errada recusada, inimigos de cada zona com os níveis e tipos certos, uma sessão por conta entre zonas.
// Uso: SERVER=http://localhost:2999 node test/zones.mjs   (servidor de teste sem carregar o .env)
import { Client } from "colyseus.js";

const HTTP = process.env.SERVER ?? "http://localhost:2999";
const WS = HTTP.replace(/^http/, "ws");
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const results = [];
const check = (name, ok, detail = "") => {
  results.push(ok);
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? "  -> " + detail : ""}`);
};

const { token } = await (await fetch(`${HTTP}/auth/guest`, { method: "POST" })).json();
const name = "Zn" + Math.random().toString(36).slice(2, 8);
const cr = await fetch(`${HTTP}/api/character`, { method: "POST", headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" }, body: JSON.stringify({ name, class: "warrior" }) });
if (!cr.ok) throw new Error(`criar personagem: ${cr.status}`);
const zoneApi = async () => (await (await fetch(`${HTTP}/api/me`, { headers: { Authorization: `Bearer ${token}` } })).json()).character.zone;

async function join(room, tk = token) {
  const r = await new Client(WS).joinOrCreate(room, { token: tk });
  await new Promise((ok) => (r.state?.players ? ok() : r.onStateChange.once(ok)));
  const ev = { travel: [], notice: [], left: null };
  r.onMessage("travel", (m) => ev.travel.push(m));
  r.onMessage("notice", (m) => ev.notice.push(String(m.text)));
  r.onLeave((c) => (ev.left = c));
  return { r, ev, me: () => r.state.players.get(r.sessionId) };
}
const enemies = (r) => { const a = []; r.state.enemies.forEach((e) => a.push({ kind: e.kind, level: e.level, hp: e.hp, maxHp: e.maxHp })); return a; };
const levels = (r) => enemies(r).map((e) => e.level).sort((a, b) => a - b).join(",");
const kinds = (r) => { const c = {}; enemies(r).forEach((e) => (c[e.kind] = (c[e.kind] ?? 0) + 1)); return JSON.stringify(c); };
const waitFor = async (fn, ms) => { for (let t = 0; t < ms; t += 100) { if (fn()) return true; await sleep(100); } return false; };
const near = (p, x, y, d = 2) => Math.hypot(p.x - x, p.y - y) <= d;

console.log("\n== Zona 1 (Cinzas) ==");
let A = await join("zone");
check("nasce na zona 1, no ponto de nascimento", A.r.state.zoneId === 1 && near(A.me(), 20, 20, 0.5), `zona ${A.r.state.zoneId} em (${A.me().x}, ${A.me().y})`);
check("inimigos da zona 1: 5 esqueletos, níveis 1,1,1,2,3", levels(A.r) === "1,1,1,2,3" && kinds(A.r) === '{"skeleton":5}', `${levels(A.r)} ${kinds(A.r)}`);
check("API informa a zona do personagem (1)", (await zoneApi()) === 1);

console.log("\n== Travessia ==");
A.r.send("travel", { to: 2 });
await sleep(400);
check("pedir o portal de longe é recusado (aviso, sem travessia)", A.ev.travel.length === 0 && A.ev.notice.some((t) => t.includes("portal")) && (await zoneApi()) === 1, JSON.stringify(A.ev.notice));
A.r.send("travel", { to: 99 });
A.r.send("travel", { to: "2" });
await sleep(200);
check("pedidos inválidos de travessia são ignorados", A.ev.travel.length === 0 && A.ev.left === null);

A.r.send("move_to", { x: 36, y: 36 });
const crossed = await waitFor(() => A.ev.travel.length > 0, 9000);
check("pisar no portal (sem apertar nada) aprova a travessia para a zona 2", crossed && A.ev.travel[0].zone === 2, JSON.stringify(A.ev.travel));
check("o servidor já gravou a zona 2 (API)", (await zoneApi()) === 2);
const frozenAt = { x: A.me()?.x, y: A.me()?.y };
A.r.send("move_to", { x: 20, y: 20 });
await sleep(400);
check("quem está atravessando não se mexe mais", !A.me() || Math.hypot(A.me().x - frozenAt.x, A.me().y - frozenAt.y) < 0.5);
await A.r.leave(true);

console.log("\n== Sala errada ==");
let rejected = false;
try { const bad = await join("zone"); await bad.r.leave(true); } catch { rejected = true; }
check("personagem da zona 2 NÃO entra na sala da zona 1", rejected);
rejected = false;
try { const bad = await join("zone3"); await bad.r.leave(true); } catch { rejected = true; }
check("nem pula direto para a sala da zona 3", rejected);

console.log("\n== Zona 2 (Floresta Gélida) ==");
let B = await join("zone2");
check("entra na zona 2 junto do portal de volta", B.r.state.zoneId === 2 && near(B.me(), 8, 8, 0.5), `(${B.me().x}, ${B.me().y})`);
check("inimigos da zona 2: lobos e esqueletos, níveis 6,6,6,7,8,8,9,10", levels(B.r) === "6,6,6,7,8,8,9,10" && kinds(B.r) === '{"wolf":5,"skeleton":3}', `${levels(B.r)} ${kinds(B.r)}`);
const e0 = enemies(B.r).find((e) => e.kind === "wolf" && e.level === 6);
check("a vida do inimigo segue o nível e o tipo (lobo nível 6 = 144)", e0 && e0.maxHp === 144 && e0.hp === 144, JSON.stringify(e0));
await B.r.leave(true);
await sleep(300);
B = await join("zone2");
check("zona salva e restaurada ao reconectar (volta à zona 2)", B.r.state.zoneId === 2 && (await zoneApi()) === 2);

console.log("\n== Uma sessão por conta entre salas ==");
const B2 = await join("zone2");
await sleep(500);
check("entrar de novo derruba a sessão anterior (4001)", B.ev.left === 4001, `código ${B.ev.left}`);
await B2.r.leave(true);
await sleep(300);

console.log("\n== Zona 2 → Zona 3 (Catacumbas) ==");
B = await join("zone2");
B.r.send("move_to", { x: 40, y: 40 });
const crossed3 = await waitFor(() => B.ev.travel.length > 0, 14000);
check("andar até o portal do fundo leva à zona 3", crossed3 && B.ev.travel[0].zone === 3, JSON.stringify(B.ev.travel));
await B.r.leave(true);
await sleep(300);
const C = await join("zone3");
check("entra na zona 3", C.r.state.zoneId === 3 && near(C.me(), 8, 8, 0.5), `(${C.me().x}, ${C.me().y})`);
check("inimigos da zona 3: espectros e esqueletos, níveis 12 a 20", levels(C.r) === "12,13,13,15,15,16,18,20" && kinds(C.r) === '{"skeleton":3,"wraith":5}', `${levels(C.r)} ${kinds(C.r)}`);
const w = enemies(C.r).find((e) => e.kind === "wraith" && e.level === 13);
check("espectro nível 13: vida 452 (60 x 1,3 x 5,8)", w && w.maxHp === Math.round(60 * 1.3 * (1 + 0.4 * 12)), JSON.stringify(w));

console.log("\n== Volta pelo portal ==");
C.r.send("move_to", { x: 4, y: 4 });
const back = await waitFor(() => C.ev.travel.length > 0, 5000);
check("o portal da zona 3 leva de volta à zona 2", back && C.ev.travel[0].zone === 2);
await C.r.leave(true);
await sleep(300);
const D = await join("zone2");
check("chega perto do portal da zona 3 (não em cima dele)", D.r.state.zoneId === 2 && near(D.me(), 36, 36, 0.5), `(${D.me().x}, ${D.me().y})`);
await sleep(1500);
check("e não atravessa de novo sozinho", D.ev.travel.length === 0 && D.ev.left === null);
await D.r.leave(true);

const failed = results.filter((r) => !r).length;
console.log(`\n${results.length - failed}/${results.length} verificações passaram`);
process.exit(failed ? 1 : 0);
