// Teste de ponta a ponta do ABATE REAL nas quests (PD-07): o personagem aceita a quest "Caça aos Ossos" na cidade,
// atravessa o portão até as Cinzas, mata os 3 esqueletos em combate de verdade (ataque, sem atalho "quest_teste_abate"),
// volta à cidade, entrega e recebe a recompensa (60 de XP, 40 de ferro, 2 poções). Confere o progresso a cada abate,
// a conclusão ("pronta"), a entrega e a persistência depois de reconectar.
// Servidor de teste: QUEST_TEST=1 QUEST_FIXTURE=1 LOOT_TEST=1 API_RATE_MULT=100 (sem TEST_START_ZONE: nasce na cidade).
// QUEST_TEST só libera o atalho, que este teste NÃO usa. Uso: SERVER=http://localhost:2998 node test/quests_combate.mjs
import { Client } from "colyseus.js";

const HTTP = process.env.SERVER ?? "http://localhost:2999";
const WS = HTTP.replace(/^http/, "ws");
const QID = "caca_aos_ossos";
const KILLS = 3;
const GARRICK = { x: 20.5, y: 24 };
const GATE = { x: 24, y: 1 }; // dentro do raio do portão da cidade (24, 0)
const PORTAL_ZONE1_TO_CITY = { x: 4, y: 28 };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const until = async (fn, ms = 4000, step = 50) => { const t0 = Date.now(); while (Date.now() - t0 < ms) { if (fn()) return true; await sleep(step); } return !!fn(); };
const roomDe = (zona) => (zona === 1 ? "zone" : `zone${zona}`); // mesmo nome que zoneRoomName (shared/src/zones.ts)
const results = [];
const check = (name, ok, detail = "") => { results.push(ok); console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? "  -> " + detail : ""}`); };

async function conta() {
  const { token } = await (await fetch(`${HTTP}/auth/guest`, { method: "POST" })).json();
  const name = "Qc" + Math.random().toString(10).slice(2, 8);
  const cr = await fetch(`${HTTP}/api/character`, { method: "POST", headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" }, body: JSON.stringify({ name, class: "warrior" }) });
  if (!cr.ok) throw new Error(`criar personagem: ${cr.status}`);
  return { token };
}

// entra numa zona (cidade por padrão) e acompanha quests, inventário, XP e avisos
async function entrar(acc, room = "zone4") {
  const r = await new Client(WS).joinOrCreate(room, { token: acc.token });
  await new Promise((ok) => (r.state?.players ? ok() : r.onStateChange.once(ok)));
  const ev = { notice: [], quests: null, defs: null, inv: null, xp: 0, travelTo: null, left: false };
  r.onMessage("notice", (m) => ev.notice.push(String(m.text)));
  r.onMessage("quest_estado", (m) => (ev.quests = m));
  r.onMessage("inv", (m) => (ev.inv = m));
  r.onMessage("xp", (m) => (ev.xp += Number(m.amount) || 0));
  r.onMessage("travel", (m) => (ev.travelTo = m.zone));
  r.onLeave(() => (ev.left = true));
  const P = {
    r, ev, room,
    me: () => r.state.players.get(r.sessionId),
    said: (frag) => ev.notice.some((t) => t.includes(frag)),
    quest: () => ev.quests?.quests?.find((q) => q.id === QID),
    estado: () => P.quest()?.estado ?? "nenhuma",
    contar: (id) => (ev.inv?.inv ?? []).reduce((a, s) => a + (s && s.id === id ? s.qty : 0), 0),
    iron: () => ev.inv?.iron ?? 0,
    async walk(x, y) { r.send("move_to", { x, y }); await until(() => Math.hypot(P.me().x - x, P.me().y - y) < 0.6, 12000); },
    async sair() { ev.left = false; r.leave(); await until(() => ev.left, 3000); await sleep(400); }, // dá tempo do servidor gravar ao sair
  };
  r.send("ready", {});
  r.send("inv_sync", {});
  r.send("quest_sync", {});
  await until(() => ev.quests && ev.inv, 5000);
  return P;
}

// Atravessa para outra zona: repete a tentativa (andar até o portal, ou o pedido do portão) até o servidor aprovar a travessia
// (a sala de combate só libera depois de alguns segundos sem combate). Depois entra na sala nova.
async function viajar(P, acc, dest, tentar) {
  const t0 = Date.now();
  while (P.ev.travelTo == null && Date.now() - t0 < 25000) { tentar(); await sleep(1200); }
  if (P.ev.travelTo !== dest) throw new Error(`travessia para ${dest} não aprovada (veio ${P.ev.travelTo})`);
  await P.sair();
  return entrar(acc, roomDe(dest));
}

// Mata UM inimigo do tipo: escolhe o vivo mais perto no estado da sala, vai até ele e ataca até cair (combate real).
async function matarUm(P, kind) {
  // prefere um inimigo sozinho (poucos vizinhos do mesmo tipo): um bando puxa vários de uma vez e o personagem morre
  const escolher = () => {
    const me = P.me(); let best = null, bd = Infinity;
    const vivos = [];
    P.r.state.enemies.forEach((e, k) => { if (e.kind === kind && e.st !== "dead" && e.hp > 0) vivos.push({ k, e }); });
    for (const { k, e } of vivos) {
      const vizinhos = vivos.filter((o) => o.k !== k && Math.hypot(o.e.x - e.x, o.e.y - e.y) < 6).length;
      const d = Math.hypot(e.x - me.x, e.y - me.y) + vizinhos * 100;
      if (d < bd) { bd = d; best = k; }
    }
    return best;
  };
  const k = escolher();
  if (k == null) return false;
  const t0 = Date.now();
  while (Date.now() - t0 < 45000) {
    const en = P.r.state.enemies.get(k);
    if (!en || en.st === "dead" || en.hp <= 0 || P.me().dead) break;
    if (Math.hypot(en.x - P.me().x, en.y - P.me().y) > 2) P.r.send("move_to", { x: en.x - 2.2, y: en.y });
    else P.r.send("act", { a: "attack", ax: en.x, ay: en.y });
    await sleep(550);
  }
  return P.r.state.enemies.get(k)?.st === "dead";
}

console.log("\n== Quests: abate real em combate (PD-07) ==");
const acc = await conta();
let P = await entrar(acc, "zone4");
check("ao entrar na cidade, sem quests", P.ev.quests.quests.length === 0);
await P.walk(GARRICK.x, GARRICK.y);
P.r.send("quest_aceitar", { id: QID });
check("aceita a quest perto do Garrick (ativa, sem progresso)", await until(() => P.estado() === "ativa") && P.quest().progresso[0] === 0, JSON.stringify(P.quest()));

// portão da cidade -> Cinzas (zona 1): o pedido de travessia sai do mapa-mundo do portão
await P.walk(GATE.x, GATE.y);
P = await viajar(P, acc, 1, () => P.r.send("travel", { to: 1 }));
check("atravessa o portão e chega às Cinzas com a quest ainda ativa", P.room === "zone" && P.estado() === "ativa" && P.quest().progresso[0] === 0, JSON.stringify(P.quest()));

const CLAREIRA = { x: 9.5, y: 28 }; // clareira de chegada das Cinzas, sem inimigos
for (let i = 1; i <= KILLS; i++) {
  // sai do combate para a clareira (os outros esqueletos que pegaram o personagem não o seguem até lá) e descansa
  // até quase cheio antes do próximo abate (a regeneração só começa depois de 6 s sem dano: 2% por segundo)
  await P.walk(CLAREIRA.x, CLAREIRA.y);
  await until(() => P.me().dead || P.me().hp >= P.me().maxHp * 0.9, 70000, 200);
  console.log(`      (antes do abate ${i}: hp ${P.me().hp}/${P.me().maxHp})`);
  const morreu = P.me().dead;
  const caiu = await matarUm(P, "skeleton");
  check(`abate real ${i}/${KILLS}: um esqueleto cai em combate`, caiu && !morreu, `hp ${P.me().hp}/${P.me().maxHp}`);
  check(`abate ${i}/${KILLS} conta na quest (progresso ${i})`, await until(() => P.quest()?.progresso[0] === i), JSON.stringify(P.quest()));
  if (i < KILLS) check(`depois de ${i} abate(s) a quest segue ativa, não pronta`, P.estado() === "ativa");
}
check("com os 3 abates, a quest fica pronta (sem entregar)", await until(() => P.estado() === "pronta"), JSON.stringify(P.quest()));
check("o XP dos abates chegou ao cliente (combate real, sem atalho)", P.ev.xp > 0, `xp recebido ${P.ev.xp}`);

// volta à cidade pelo portal sul das Cinzas e entrega ao Garrick
P = await viajar(P, acc, 4, () => P.r.send("move_to", { x: PORTAL_ZONE1_TO_CITY.x, y: PORTAL_ZONE1_TO_CITY.y }));
check("volta à cidade com a quest pronta", P.room === "zone4" && P.estado() === "pronta", JSON.stringify(P.quest()));
await P.walk(GARRICK.x, GARRICK.y);

console.log("\n== Entrega ==");
const xp0 = P.me().xp ?? 0, lv0 = P.me().level ?? 1, iron0 = P.iron(), pocoes0 = P.contar("pocao_de_vida");
P.r.send("quest_entregar", { id: QID });
check("entrega marca a quest como entregue", await until(() => P.estado() === "entregue"), JSON.stringify(P.quest()));
// a recompensa chega em duas mensagens (inventário e estado do personagem): espera as duas
await until(() => (P.iron() > iron0 || P.contar("pocao_de_vida") > pocoes0) && ((P.me().level ?? 1) > lv0 || (P.me().xp ?? 0) > xp0), 3000);
check("recompensa: 40 de ferro", P.iron() - iron0 === 40, `ferro ${iron0} -> ${P.iron()}`);
check("recompensa: 2 poções", P.contar("pocao_de_vida") - pocoes0 === 2, `poções ${pocoes0} -> ${P.contar("pocao_de_vida")}`);
check("recompensa: 60 de XP (ou subiu de nível)", (P.me().level ?? 1) > lv0 || (P.me().xp ?? 0) - xp0 >= 60, `xp ${xp0} -> ${P.me().xp}, nível ${lv0} -> ${P.me().level}`);
check("aviso de recompensa recebida", P.said("Recompensa recebida"));

console.log("\n== Persistência depois de reconectar ==");
const iron1 = P.iron(), pocoes1 = P.contar("pocao_de_vida");
await P.sair();
P = await entrar(acc, "zone4");
check("depois de reconectar, a quest segue entregue", await until(() => P.estado() === "entregue"), JSON.stringify(P.quest()));
check("ferro e poções da recompensa ficaram gravados", P.iron() === iron1 && P.contar("pocao_de_vida") === pocoes1, `ferro ${P.iron()} poções ${P.contar("pocao_de_vida")}`);
await P.sair();

const falhas = results.filter((r) => !r).length;
console.log(`\n${results.length - falhas}/${results.length} verificações passaram`);
process.exit(falhas ? 1 : 0);
