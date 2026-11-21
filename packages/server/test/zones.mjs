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
  const ev = { travel: [], notice: [], left: null, gate: 0 };
  r.onMessage("world_map", () => ev.gate++);
  r.onMessage("travel", (m) => ev.travel.push(m));
  r.onMessage("notice", (m) => ev.notice.push(String(m.text)));
  r.onLeave((c) => (ev.left = c));
  return { r, ev, me: () => r.state.players.get(r.sessionId) };
}
const enemies = (r, core = Infinity) => { const a = []; r.state.enemies.forEach((e, id) => ["bone_king", "frost_alpha", "crypt_lord"].includes(e.kind) || Number(id.slice(1)) > core || a.push({ kind: e.kind, level: e.level, hp: e.hp, maxHp: e.maxHp })); return a; };
const bossOf = (r) => { let b = null; r.state.enemies.forEach((e, id) => { if (id === "boss") b = e.kind; }); return b; };
const levels = (r, core) => enemies(r, core).map((e) => e.level).sort((a, b) => a - b).join(",");
const kinds = (r, core) => { const c = {}; enemies(r, core).forEach((e) => (c[e.kind] = (c[e.kind] ?? 0) + 1)); return JSON.stringify(c); };
const waitFor = async (fn, ms) => { for (let t = 0; t < ms; t += 100) { if (fn()) return true; await sleep(100); } return false; };
const near = (p, x, y, d = 2) => Math.hypot(p.x - x, p.y - y) <= d;

console.log("\n== Cidade segura (zona 4) ==");
check("personagem novo começa na cidade (API)", (await zoneApi()) === 4);
let H = await join("zone4");
check("nasce na cidade, no ponto de nascimento", H.r.state.zoneId === 4 && near(H.me(), 24, 30, 0.5), `(${H.me().x}, ${H.me().y})`);
check("a cidade não tem inimigos nem chefe", enemies(H.r).length === 0 && bossOf(H.r) === null);
H.r.send("travel", { to: 1 });
await sleep(400);
check("pedir uma zona de longe do portão é recusado", H.ev.travel.length === 0 && H.ev.notice.some((t) => t.includes("portão")));
H.r.send("move_to", { x: 24, y: 2 });
check("pisar no portão abre o mapa-mundo (e não atravessa sozinho)", (await waitFor(() => H.ev.gate > 0, 14000)) && H.ev.travel.length === 0);
await sleep(600);
check("o mapa-mundo abre uma vez só por entrada no portão", H.ev.gate === 1);
H.r.send("travel", { to: 4 });
H.r.send("travel", { to: 99 });
await sleep(300);
check("destino inválido (a própria cidade, zona inexistente) é ignorado", H.ev.travel.length === 0);
H.r.send("travel", { to: 1 });
check("escolher as Cinzas no mapa-mundo leva à zona 1", (await waitFor(() => H.ev.travel.length > 0, 5000)) && H.ev.travel[0].zone === 1, JSON.stringify(H.ev.travel));
check("o servidor já gravou a zona 1 (API)", (await zoneApi()) === 1);
await H.r.leave(true);
await sleep(300);

console.log("\n== Zona 1 (Cinzas) ==");
let A = await join("zone");
check("chega às Cinzas junto do portal da cidade (fora do raio dele)", A.r.state.zoneId === 1 && near(A.me(), 9.5, 28, 0.5), `zona ${A.r.state.zoneId} em (${A.me().x}, ${A.me().y})`);
check("cada zona tem o seu chefe (Rei Ossudo, Lobo Alfa, Soberano das Catacumbas)", bossOf(A.r) === "bone_king", bossOf(A.r));
check("inimigos da zona 1 (os 5 originais e1..e5): esqueletos, níveis 1,1,1,2,3", levels(A.r, 5) === "1,1,1,2,3" && kinds(A.r, 5) === '{"skeleton":5}', `${levels(A.r, 5)} ${kinds(A.r, 5)}`);
check("API informa a zona do personagem (1)", (await zoneApi()) === 1);

console.log("\n== Pontos de caça (grupos de inimigos) ==");
{
  const near4 = (id) => { const e = A.r.state.enemies.get(id); return e ? { x: e.x, y: e.y } : null; };
  let total = 0; A.r.state.enemies.forEach((e, id) => { if (id !== "boss") total++; });
  check("a zona 1 tem bem mais inimigos agora (5 originais + 3 pontos de caça = 21)", total === 21, `${total}`);
  const e1 = near4("e1");
  check("os 5 originais não mudaram de lugar (e1 em 30,16)", !!e1 && Math.abs(e1.x - 30) < 0.01 && Math.abs(e1.y - 16) < 0.01, JSON.stringify(e1));
  // um grupo: e6..e10 em torno de (8, 6), raio 3, níveis de 2 a 3
  const grp = []; for (let i = 6; i <= 10; i++) grp.push(A.r.state.enemies.get(`e${i}`));
  check("o primeiro ponto de caça tem 5 esqueletos espalhados em torno de (5, 4), até 2,5 tiles", grp.every((e) => e && e.kind === "skeleton" && Math.hypot(e.x - 5, e.y - 4) <= 2.55), grp.map((e) => e && `${e.x.toFixed(1)},${e.y.toFixed(1)}`).join(" "));
  const xs = new Set(grp.map((e) => `${e.x.toFixed(1)},${e.y.toFixed(1)}`));
  check("ninguém nasce em cima de ninguém (posições todas diferentes)", xs.size === 5);
  check("o nível sobe ao longo do grupo (2 a 3)", Math.min(...grp.map((e) => e.level)) === 2 && Math.max(...grp.map((e) => e.level)) === 3, grp.map((e) => e.level).join(","));
  const far = []; A.r.state.enemies.forEach((e, id) => { if (Math.hypot(e.x - 9.5, e.y - 28) < 14 || Math.hypot(e.x - 9.5, e.y - 35) < 14 || Math.hypot(e.x - 12, e.y - 31) < 14) far.push(id); }); // pontos de chegada das Cinzas e o spawn
  check("nenhum inimigo (comum nem chefe) a menos de 14 tiles dos pontos de chegada nem do spawn", far.length === 0, far.join(","));
}

console.log("\n== Travessia ==");
A.r.send("travel", { to: 2 });
await sleep(400);
check("pedir o portal de longe é recusado (aviso, sem travessia)", A.ev.travel.length === 0 && A.ev.notice.some((t) => t.includes("portal")) && (await zoneApi()) === 1, JSON.stringify(A.ev.notice));
A.r.send("travel", { to: 99 });
A.r.send("travel", { to: "2" });
await sleep(200);
check("pedidos inválidos de travessia são ignorados", A.ev.travel.length === 0 && A.ev.left === null);

A.r.send("move_to", { x: 4, y: 35 }); // portão para a Floresta (muralha oeste, canto sudoeste)
const crossed = await waitFor(() => A.ev.travel.length > 0, 16000);
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
check("entra na zona 2 junto do portal de volta", B.r.state.zoneId === 2 && near(B.me(), 8.5, 8.5, 0.5), `(${B.me().x}, ${B.me().y})`);
check("inimigos da zona 2: lobos e esqueletos, níveis 6,6,6,7,8,8,9,10", levels(B.r, 8) === "6,6,6,7,8,8,9,10" && kinds(B.r, 8) === '{"wolf":5,"skeleton":3}', `${levels(B.r, 8)} ${kinds(B.r, 8)}`);
const e0 = enemies(B.r, 8).find((e) => e.kind === "wolf" && e.level === 6);
check("a vida do inimigo segue o nível e o tipo (lobo nível 6 = 108: 60 x 0,8 x 2,25)", e0 && e0.maxHp === 108 && e0.hp === 108, JSON.stringify(e0));
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
check("entra na zona 3", C.r.state.zoneId === 3 && near(C.me(), 8.5, 8.5, 0.5), `(${C.me().x}, ${C.me().y})`);
check("inimigos da zona 3: espectros e esqueletos, níveis 12 a 20", levels(C.r, 8) === "12,13,13,15,15,16,18,20" && kinds(C.r, 8) === '{"skeleton":3,"wraith":5}', `${levels(C.r, 8)} ${kinds(C.r, 8)}`);
const w = enemies(C.r, 8).find((e) => e.kind === "wraith" && e.level === 13);
check("espectro nível 13: vida 312 (60 x 1,3 x 4,0; 0,25 por nível)", w && w.maxHp === Math.round(60 * 1.3 * (1 + 0.25 * 12)), JSON.stringify(w));

console.log("\n== Volta pelo portal ==");
C.r.send("move_to", { x: 4, y: 4 });
const back = await waitFor(() => C.ev.travel.length > 0, 5000);
check("o portal da zona 3 leva de volta à zona 2", back && C.ev.travel[0].zone === 2);
await C.r.leave(true);
await sleep(300);
let D = await join("zone2");
check("chega perto do portal da zona 3 (não em cima dele)", D.r.state.zoneId === 2 && near(D.me(), 36, 36, 0.5), `(${D.me().x}, ${D.me().y})`);
await sleep(1500);
check("e não atravessa de novo sozinho", D.ev.travel.length === 0 && D.ev.left === null);
D.r.send("move_to", { x: 4, y: 14 });
check("o portal da zona 2 para a cidade leva à zona 4", (await waitFor(() => D.ev.travel.length > 0, 9000)) && D.ev.travel[0].zone === 4, JSON.stringify(D.ev.travel));
await D.r.leave(true);
await sleep(300);
D = await join("zone4");
check("volta à cidade já dentro do portão (24; 7,5), de qualquer zona", D.r.state.zoneId === 4 && near(D.me(), 24, 7.5, 0.5), `(${D.me().x}, ${D.me().y})`);
await sleep(800);
check("e não reabre o mapa-mundo sozinho (fora do raio)", D.ev.gate === 0);
D.r.send("move_to", { x: 24, y: 2 });
check("andar até o portão abre o mapa-mundo de novo", await waitFor(() => D.ev.gate > 0, 6000));
D.r.send("travel", { to: 3 });
check("qualquer zona de combate serve de destino (Catacumbas)", (await waitFor(() => D.ev.travel.length > 0, 5000)) && D.ev.travel[0].zone === 3);
await D.r.leave(true);

console.log("\n== Em combate não se atravessa ==");
{
  const g = await (await fetch(`${HTTP}/auth/guest`, { method: "POST" })).json();
  const nm = "Cb" + Math.random().toString(36).slice(2, 8);
  await fetch(`${HTTP}/api/character`, { method: "POST", headers: { Authorization: `Bearer ${g.token}`, "Content-Type": "application/json" }, body: JSON.stringify({ name: nm, class: "warrior" }) });
  const h = await join("zone4", g.token);
  h.r.send("move_to", { x: 24, y: 2 });
  await waitFor(() => h.ev.gate > 0, 14000);
  h.r.send("travel", { to: 1 });
  await waitFor(() => h.ev.travel.length > 0, 5000);
  await h.r.leave(true);
  await sleep(300);
  const P = await join("zone", g.token); // chega às Cinzas em (9,5; 28); o primeiro ponto de caça está em (5, 4)
  P.r.send("move_to", { x: 6, y: 10 }); // dentro do aggro dos esqueletos do ponto de caça
  const hit = await waitFor(() => P.me().hp < P.me().maxHp, 20000);
  check("os esqueletos do ponto de caça atacam quem chega perto", hit, `hp ${P.me().hp}/${P.me().maxHp}`);
  P.r.send("move_to", { x: 4, y: 28 }); // corre para o portal da cidade, ainda em combate
  const locked = await waitFor(() => P.ev.notice.some((t) => t.includes("Em combate")), 15000);
  check("pisar no portal em combate avisa e não atravessa", locked && P.ev.travel.length === 0, JSON.stringify(P.ev.notice.slice(-2)));
  check("continua na mesma zona (zona 1) e conectado", P.r.state.zoneId === 1 && P.ev.left === null);
  await P.r.leave(true);
}

const failed = results.filter((r) => !r).length;
console.log(`\n${results.length - failed}/${results.length} verificações passaram`);
process.exit(failed ? 1 : 0);
