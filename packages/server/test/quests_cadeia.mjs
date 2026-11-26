// Teste de ponta a ponta da CADEIA C1.5 inteira (PD-11): o tutorial (5 quests) e as quests 1 a 17 (níveis 1 a 10), em ordem.
// Cada quest é aceita perto do NPC dela, cada objetivo é cumprido por ação real do cliente simulado
// (falar com o NPC por quest_falar, abater em combate de verdade, usar habilidade, coletar pela mochila, equipar,
// chegar ao ponto, andando e atravessando os portões e portais) e a quest é entregue perto do NPC.
// Confere que nenhuma quest trava (aceitar, cumprir e entregar) e que tudo segue entregue depois de reconectar.
// Não há atalho de progresso. Por isso o personagem começa no nível 10 (VARIACAO_TEST_LEVEL=10): as habilidades 2 e 3 e
// o nível mínimo das quests 6 a 17 pedem nível alto e o teste não pode subir de nível pelo jogo. A regra de nível
// mínimo continua coberta por test/quests.unit.ts.
// Servidor de teste: ECON_TEST=1 (kit com poções e tostões) BOSS_TEST=1 (Rei Ossudo de 1 de vida) VARIACAO_TEST_LEVEL=10 API_RATE_MULT=100.
// Uso: SERVER=http://localhost:2999 node test/quests_cadeia.mjs
import { Client } from "colyseus.js";

const HTTP = process.env.SERVER ?? "http://localhost:2999";
const WS = HTTP.replace(/^http/, "ws");
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const until = async (fn, ms = 4000, step = 50) => { const t0 = Date.now(); while (Date.now() - t0 < ms) { if (fn()) return true; await sleep(step); } return !!fn(); };
const roomDe = (zona) => (zona === 1 ? "zone" : `zone${zona}`); // mesmo nome que zoneRoomName (shared/src/zones.ts)
const results = [];
const check = (name, ok, detail = "") => { results.push(ok); console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? "  -> " + detail : ""}`); };

// A ordem da cadeia: tutorial (C1.4) e depois as quests 1 a 17 da C1.5 (cada uma pede a anterior).
const ORDEM = [
  "tutorial_1_andar", "tutorial_2_primeiro_abate", "tutorial_3_habilidade", "tutorial_4_pocao", "tutorial_5_equipar",
  "cadeia_01_ferreira", "cadeia_02_pocoes", "cadeia_03_leilao", "cadeia_04_bau", "cadeia_05_cinzas", "cadeia_06_ossos",
  "cadeia_07_elmo", "cadeia_08_habilidade_1", "cadeia_09_floresta", "cadeia_10_lobos", "cadeia_11_ossos_gelo",
  "cadeia_12_habilidade_2", "cadeia_13_habilidade_3", "cadeia_14_lobos_2", "cadeia_15_botas", "cadeia_16_rei_ossudo", "cadeia_17_nivel_10",
];
// onde ficam os NPCs (cidade, zona 4; alcance de conversa 3,5 tiles, ver shared/src/economy.ts) e onde parar perto deles
const PARADA = { merchant: { x: 20.5, y: 24 }, smith: { x: 27, y: 24 }, auctioneer: { x: 24, y: 21 } };
const GATE = { x: 24, y: 3 }; // dentro do raio do portão da cidade (24, 2): dali o pedido do mapa-mundo vale
// saídas das zonas de combate: [x, y, zona de destino] (ver shared/src/zones.ts)
const SAIDA = { "1>2": [4, 35, 2], "1>4": [4, 28, 4], "2>1": [4, 4, 1], "2>4": [4, 14, 4] };
// clareira sem inimigos onde o personagem descansa (chegada de cada zona)
const CLAREIRA = { 1: { x: 9.5, y: 28 }, 2: { x: 8.5, y: 8.5 }, 4: { x: 24, y: 12 } };

async function conta() {
  const { token } = await (await fetch(`${HTTP}/auth/guest`, { method: "POST" })).json();
  const name = "Cd" + Math.random().toString(10).slice(2, 8);
  const cr = await fetch(`${HTTP}/api/character`, { method: "POST", headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" }, body: JSON.stringify({ name, class: "warrior" }) });
  if (!cr.ok) throw new Error(`criar personagem: ${cr.status}`);
  return { token };
}

// entra numa zona e acompanha quests, definições, inventário, XP e avisos
async function entrar(acc, zona) {
  const r = await new Client(WS).joinOrCreate(roomDe(zona), { token: acc.token });
  await new Promise((ok) => (r.state?.players ? ok() : r.onStateChange.once(ok)));
  const ev = { notice: [], quests: null, defs: null, inv: null, travelTo: null, left: false };
  r.onMessage("notice", (m) => ev.notice.push(String(m.text)));
  r.onMessage("quest_estado", (m) => (ev.quests = m));
  r.onMessage("quest_defs", (m) => (ev.defs = m));
  r.onMessage("inv", (m) => (ev.inv = m));
  r.onMessage("travel", (m) => (ev.travelTo = m.zone));
  r.onLeave(() => (ev.left = true));
  const P = {
    r, ev, zona,
    me: () => r.state.players.get(r.sessionId),
    said: (frag) => ev.notice.some((t) => t.includes(frag)),
    def: (id) => ev.defs?.defs?.find((d) => d.id === id),
    q: (id) => ev.quests?.quests?.find((x) => x.id === id),
    estado: (id) => P.q(id)?.estado ?? "nenhuma",
    prog: (id, i) => P.q(id)?.progresso?.[i] ?? 0,
    slots: () => ev.inv?.inv ?? [],
    contar: (id) => P.slots().reduce((a, s) => a + (s && s.id === id ? s.qty : 0), 0),
    bolsa: (pred) => P.slots().findIndex((s) => s && pred(s.id)),
    async walk(x, y) { r.send("move_to", { x, y }); await until(() => Math.hypot(P.me().x - x, P.me().y - y) < 0.6, 12000); },
    async sair() { ev.left = false; r.leave(); await until(() => ev.left, 3000); await sleep(400); },
  };
  r.send("ready", {});
  r.send("inv_sync", {});
  r.send("quest_sync", {});
  await until(() => ev.quests && ev.inv && ev.defs, 5000);
  return P;
}

let acc, P;

// Atravessa para `dest` repetindo a tentativa (andar até o portal, ou o pedido do portão) até o servidor aprovar.
// Em combate o servidor só deixa atravessar depois de alguns segundos sem luta: por isso a repetição.
async function viajar(dest, tentar) {
  const t0 = Date.now();
  while (P.ev.travelTo == null && Date.now() - t0 < 30000) { tentar(); await sleep(1200); }
  if (P.ev.travelTo !== dest) throw new Error(`travessia para ${dest} não aprovada (veio ${P.ev.travelTo})`);
  await P.sair();
  P = await entrar(acc, dest);
}

// Leva o personagem para a zona `dest` pelo caminho certo (portão da cidade, ou portal entre as zonas de combate).
async function irPara(dest) {
  if (P.zona === dest) return;
  if (P.zona === 4) { await P.walk(GATE.x, GATE.y); return viajar(dest, () => P.r.send("travel", { to: dest })); }
  const saida = SAIDA[`${P.zona}>${dest}`];
  if (saida) { const [x, y, to] = saida; await viajar(to, () => P.r.send("move_to", { x, y })); }
  else { // ex.: Floresta (2) -> cidade (4): passa pela Cinzas (1)
    const via = SAIDA[`${P.zona}>1`] ? 1 : null;
    if (!via) throw new Error(`sem caminho da zona ${P.zona} para ${dest}`);
    await irPara(1);
  }
  if (P.zona !== dest) return irPara(dest);
}

async function irParaNpc(npc) { await irPara(4); await P.walk(PARADA[npc].x, PARADA[npc].y); }

function contaVivos(kind) { let n = 0; P.r.state.enemies.forEach((e) => { if (e.kind === kind && e.st !== "dead" && e.hp > 0) n++; }); return n; }

// Morte: o servidor manda o personagem para a cidade (Evt.Travel) e o cliente troca de sala. Espera isso e entra na nova.
async function renascer() {
  await until(() => P.ev.travelTo != null || P.ev.left, 20000);
  if (P.ev.travelTo == null) return;
  const dest = P.ev.travelTo;
  await P.sair();
  P = await entrar(acc, dest);
  // na cidade o personagem renasce depois de RESPAWN_S (8 s) caído: só então pode atravessar de novo
  const vivo = await until(() => !P.me().dead, 15000, 200);
  console.log(`      (renasceu na cidade: ${vivo}, hp ${P.me().hp}/${P.me().maxHp}, zona ${P.zona})`);
}

// Mata UM inimigo do tipo: prefere um inimigo sozinho, vai até ele e ataca até cair (combate real, sem atalho).
async function matarUm(kind) {
  // conta QUALQUER inimigo vivo perto (bandos misturam lobos e esqueletos): quem está no meio de um bando puxa todos
  const escolher = () => {
    const me = P.me(); let best = null, bd = Infinity;
    const vivos = [], todos = [];
    P.r.state.enemies.forEach((e, k) => { if (e.st !== "dead" && e.hp > 0) { todos.push({ k, e }); if (e.kind === kind) vivos.push({ k, e }); } });
    for (const { k, e } of vivos) {
      const vizinhos = todos.filter((o) => o.k !== k && Math.hypot(o.e.x - e.x, o.e.y - e.y) < 9).length;
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

// Descansa na clareira da zona até 90% de vida (abaixo de 95% já descansa): morrer no meio da cadeia atrasaria o teste.
async function descansar() {
  if (P.me().hp >= P.me().maxHp * 0.95) return;
  await P.walk(CLAREIRA[P.zona].x, CLAREIRA[P.zona].y);
  await until(() => P.me().dead || P.me().hp >= P.me().maxHp * 0.9, 60000, 200);
}

// Cumpre um objetivo por ação real. Devolve true se o objetivo ficou cumprido.
async function cumprir(d, o, i) {
  const id = d.id;
  if (o.tipo === "falar") {
    await irParaNpc(o.npc);
    P.r.send("quest_falar", { npc: o.npc });
    return until(() => P.prog(id, i) >= 1, 4000);
  }
  if (o.tipo === "chegar") {
    await irPara(o.zona);
    await P.walk(o.x, o.y);
    return until(() => P.prog(id, i) >= 1, 5000);
  }
  if (o.tipo === "abater") {
    await irPara(o.zona);
    for (let k = 1; k <= o.qtd; k++) {
      // um bando pode matar o personagem no meio do abate: ele renasce na cidade, volta à zona e tenta de novo
      let feito = false;
      for (let tent = 0; tent < 6 && !feito; tent++) {
        if (P.me().dead) { await renascer(); await irPara(o.zona); }
        await descansar();
        if (P.me().dead) continue;
        if (!P.me().dead && contaVivos(o.kind) === 0) break; // não há mais inimigo do tipo na zona: trava, o teste acusa
        await matarUm(o.kind);
        feito = await until(() => P.prog(id, i) >= k, 4000);
      }
      if (!feito) return console.log(`      (abate ${k} não contou: zona ${P.zona}, hp ${P.me().hp}/${P.me().maxHp}, ${o.kind} vivos ${contaVivos(o.kind)})`), false;
    }
    return true;
  }
  if (o.tipo === "coletar") {
    const falta = o.qtd - P.prog(id, i);
    if (falta > 0) { // compra o que falta com o comerciante (tostões do kit de teste)
      await irParaNpc("merchant");
      P.r.send("shop_buy", { npc: "merchant", id: o.itemId, qty: falta });
    }
    return until(() => P.prog(id, i) >= o.qtd, 4000);
  }
  if (o.tipo === "usar") { // na cidade (zona segura), como no tutorial; conta só quando a habilidade dispara
    await irPara(4);
    const t0 = Date.now();
    while (P.prog(id, i) < o.qtd && Date.now() - t0 < 90000) {
      const me = P.me();
      P.r.send("act", { a: o.acao, ax: me.x + 1, ay: me.y });
      await sleep(1300);
    }
    return P.prog(id, i) >= o.qtd;
  }
  if (o.tipo === "equipar") { // equipa a peça do slot que a quest pede (vinda da recompensa de uma quest anterior ou do kit)
    // entre as peças do slot, a de raridade mais baixa (o kit traz uma épica, que pede nível 14; a da quest é incomum)
    const ordem = ["_common", "_uncommon", "_rare", "_epic"];
    const peca = P.slots().filter((s) => s && s.id.startsWith(`warrior_${o.slot}_`))
      .sort((a, b) => ordem.findIndex((r) => a.id.endsWith(r)) - ordem.findIndex((r) => b.id.endsWith(r)))[0];
    const idx = peca ? P.slots().indexOf(peca) : -1;
    if (idx < 0) return false;
    P.r.send("inv_equip", { slot: idx });
    return until(() => P.prog(id, i) >= 1, 4000);
  }
  return false;
}

console.log("\n== Cadeia C1.5 inteira (tutorial + quests 1 a 17) ==");
acc = await conta();
P = await entrar(acc, 4);
check("as definições das 22 quests da cadeia chegam ao cliente", ORDEM.every((id) => !!P.def(id)), ORDEM.filter((id) => !P.def(id)).join(", "));

for (const id of ORDEM) {
  const d = P.def(id);
  if (!d) { check(`${id}: existe no servidor`, false); continue; }
  await irParaNpc(d.npc);
  P.r.send("quest_aceitar", { id });
  // "coletar" e "equipar" já contam no ato de aceitar (o item já está na mochila ou equipado): aí a quest nasce "pronta"
  const aceita = await until(() => ["ativa", "pronta"].includes(P.estado(id)), 4000);
  check(`${id}: aceita no ${d.npc}`, aceita, aceita ? "" : `avisos: ${P.ev.notice.slice(-2).join(" | ")}`);
  if (!aceita) continue;
  let cumpriu = true;
  for (let i = 0; i < d.objetivos.length && cumpriu; i++) {
    const o = d.objetivos[i];
    const feito = await cumprir(d, o, i);
    if (!feito) { cumpriu = false; check(`${id}: objetivo ${i + 1} (${o.tipo}) cumprido`, false, `estado ${P.estado(id)} progresso ${JSON.stringify(P.q(id)?.progresso)} avisos: ${P.ev.notice.slice(-2).join(" | ")}`); }
  }
  if (cumpriu) check(`${id}: todos os objetivos cumpridos (pronta)`, await until(() => P.estado(id) === "pronta", 4000), JSON.stringify(P.q(id)));
  if (cumpriu && P.estado(id) === "pronta") {
    const ferro0 = P.ev.inv?.iron ?? 0;
    await irParaNpc(d.npc);
    P.r.send("quest_entregar", { id });
    const entregue = await until(() => P.estado(id) === "entregue", 4000);
    check(`${id}: entregue ao ${d.npc}, recompensa paga`, entregue && (P.ev.inv?.iron ?? 0) >= ferro0, entregue ? "" : `avisos: ${P.ev.notice.slice(-2).join(" | ")}`);
  }
}

check("toda a cadeia (22 quests) ficou entregue, nenhuma travou", ORDEM.every((id) => P.estado(id) === "entregue"), ORDEM.filter((id) => P.estado(id) !== "entregue").join(", "));

console.log("\n== Persistência depois de reconectar ==");
await P.sair();
P = await entrar(acc, 4);
check("depois de reconectar, a cadeia inteira segue entregue", await until(() => ORDEM.every((id) => P.estado(id) === "entregue"), 5000), ORDEM.filter((id) => P.estado(id) !== "entregue").join(", "));
await P.sair();

const falhas = results.filter((r) => !r).length;
console.log(`\n${results.length - falhas}/${results.length} verificações passaram`);
process.exit(falhas ? 1 : 0);
