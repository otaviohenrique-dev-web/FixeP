// Teste de ponta a ponta do PvP (só na Arena Sangrenta, zona 5): dano entre jogadores só na arena, sem fogo amigo de grupo,
// morte na arena renasce na arena sem perda de nada, e fora da arena não há dano entre jogadores.
// Uso: SERVER=http://localhost:2999 node test/pvp.mjs   (servidor de teste sem carregar o .env; começa na cidade, zona 4)
import { Client } from "colyseus.js";

const HTTP = process.env.SERVER ?? "http://localhost:2999";
const WS = HTTP.replace(/^http/, "ws");
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const results = [];
const check = (name, ok, detail = "") => {
  results.push(ok);
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? "  -> " + detail : ""}`);
};
const until = async (fn, ms) => { const t0 = Date.now(); while (Date.now() - t0 < ms) { if (fn()) return true; await sleep(100); } return false; };

// Cria um personagem na cidade (zona 4) e devolve token e nome.
async function newChar(cls) {
  const { token } = await (await fetch(`${HTTP}/auth/guest`, { method: "POST" })).json();
  const name = "Pv" + Math.random().toString(10).slice(2, 8);
  const cr = await fetch(`${HTTP}/api/character`, { method: "POST", headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" }, body: JSON.stringify({ name, class: cls }) });
  if (!cr.ok) throw new Error(`criar ${cls}: ${cr.status}`);
  return { token, name };
}

// Como o cliente: na cidade, anda até o portão, abre o mapa-mundo e escolhe a zona `to`; sai da cidade já na zona nova.
async function travelFromCity(token, to) {
  const city = new Client(WS);
  const r = await city.joinOrCreate("zone4", { token });
  await new Promise((ok) => (r.state?.players ? ok() : r.onStateChange.once(ok)));
  let gate = false, travel = null;
  r.onMessage("world_map", () => (gate = true));
  r.onMessage("travel", (m) => (travel = m));
  r.send("move_to", { x: 24, y: 2 });
  await until(() => gate, 14000);
  r.send("travel", { to });
  await until(() => travel, 5000);
  await r.leave(true);
  await sleep(300);
}

// Entra numa zona de combate (já na zona `to` do personagem) e devolve o cliente com o estado de eventos.
async function join(token, room) {
  const r = await new Client(WS).joinOrCreate(room, { token });
  await new Promise((ok) => (r.state?.players ? ok() : r.onStateChange.once(ok)));
  const ev = { hits: [], died: [], notice: [], left: null };
  r.onMessage("hit", (m) => ev.hits.push(m));
  r.onMessage("died", (m) => ev.died.push(m));
  r.onMessage("notice", (m) => ev.notice.push(String(m.text)));
  r.onLeave((c) => (ev.left = c));
  const me = () => r.state.players.get(r.sessionId);
  const hit = (t) => r.send("act", { a: "attack", ax: t.x, ay: t.y }); // t: o jogador alvo (entidade sincronizada)
  return { r, ev, me, hit };
}

// Personagem já na arena (zona 5): cria, leva pela cidade e entra.
async function arenaChar(cls) {
  const c = await newChar(cls);
  await travelFromCity(c.token, 5);
  const P = await join(c.token, "zone5");
  return { ...c, P };
}

console.log("\n== Arena: a zona 5 existe, sem monstros, e o PvP já está ligado para quem entra ==");
const A = await arenaChar("warrior");
const B = await arenaChar("warrior");
const C = await arenaChar("cleric");
check("entrou na arena (zona 5)", A.P.r.state.zoneId === 5);
check("sem monstros na arena", A.P.r.state.enemies.size === 0);
check("PvP ligado para quem entra na arena", A.P.me().pvp === true && B.P.me().pvp === true && C.P.me().pvp === true);

console.log("\n== Arena: jogadores de grupos diferentes ferem uns aos outros ==");
const cHp0 = C.P.me().hp;
A.P.hit(C.P.me()); await sleep(900);
check("A (fora do grupo de C) fere C na arena", C.P.me().hp < cHp0, `hp ${cHp0} -> ${C.P.me().hp}`);
check("o evento de dano traz quem causou", C.P.ev.hits.some((h) => h.k === "p" && h.id === C.P.r.sessionId && h.by === A.P.r.sessionId));

console.log("\n== Party: membros do mesmo grupo nunca se ferem (sem fogo amigo) ==");
A.P.r.send("party_invite", { name: B.name });
await sleep(300);
B.P.r.send("party_accept", {});
await until(() => A.P.r.state.players.get(A.P.r.sessionId)?.party && B.P.me().party && A.P.me().party === B.P.me().party, 4000);
check("A e B estão no mesmo grupo", !!A.P.me().party && A.P.me().party === B.P.me().party);
const bHp0 = B.P.me().hp;
const nHitsBefore = A.P.ev.hits.length; // (o golpe no C acima pode ter varrido B, que ainda não estava no grupo: só conta o que vier depois)
A.P.hit(B.P.me()); await sleep(900);
check("A não fere B (mesmo grupo)", B.P.me().hp === bHp0, `hp ${bHp0} -> ${B.P.me().hp}`);
const bHits = A.P.ev.hits.slice(nHitsBefore).filter((h) => h.k === "p" && h.id === B.P.r.sessionId);
check("sem evento de dano para B", bHits.length === 0, JSON.stringify(bHits));

console.log("\n== Morte na arena: renasce na arena (no ponto da arena), sem perda ==");
const xp0 = C.P.me().xp, lvl0 = C.P.me().level, items0 = C.P.r.state.items.size;
let guard = 0;
while (!C.P.me().dead && guard++ < 40) { A.P.hit(C.P.me()); await sleep(600); } // A bate em C (fora do grupo) até cair
check("C cai em combate na arena", C.P.me().dead === true);
check("C continua na arena depois de cair (não vai à cidade)", C.P.r.state.zoneId === 5 && C.P.ev.left === null);
check("C renasce depois de alguns segundos (com a vida cheia)", await until(() => !C.P.me().dead, 12000) && C.P.me().hp === C.P.me().maxHp);
check("renascer no ponto da arena", Math.hypot(C.P.me().x - 30, C.P.me().y - 18) < 1.5, `(${C.P.me().x}, ${C.P.me().y})`);
check("morrer não tira XP nem nível de quem morreu", C.P.me().xp === xp0 && C.P.me().level === lvl0, `xp ${xp0} -> ${C.P.me().xp}`);
check("morrer não deixa item no chão (nenhum drop)", C.P.r.state.items.size === items0, `itens ${items0} -> ${C.P.r.state.items.size}`);
check("C continua no PvP depois de renascer", C.P.me().pvp === true);

console.log("\n== Fora da arena não há dano entre jogadores ==");
const D = await newChar("warrior");
const E = await newChar("warrior");
await travelFromCity(D.token, 1);
await travelFromCity(E.token, 1);
const DP = await join(D.token, "zone");
const EP = await join(E.token, "zone");
await until(() => DP.me() && EP.me(), 5000);
const eHp0 = EP.me().hp;
DP.hit(EP.me()); await sleep(900);
check("na zona 1 (Cinzas) um jogador não fere o outro", EP.me().hp === eHp0, `hp ${eHp0} -> ${EP.me().hp}`);
check("o PvP da zona 1 não liga (nem pelo pedido antigo)", (DP.r.send("pvp", { on: true }), await sleep(400), DP.me().pvp === false));
check("o servidor avisa que o PvP só existe na arena", DP.ev.notice.some((t) => /arena/i.test(t)));

for (const x of [A, B, C]) x.P.r.leave(true);
DP.r.leave(true); EP.r.leave(true);

const failed = results.filter((x) => !x).length;
console.log(`\n${results.length - failed}/${results.length} verificações passaram`);
process.exit(failed ? 1 : 0);
