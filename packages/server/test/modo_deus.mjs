// Teste de ponta a ponta do Modo Deus (ferramenta de admin): 403 para não-admin, 401 sem o token do painel,
// ligar/desligar (invisível e velocidade visíveis para outro jogador), criar item, item do GM não vai ao mercado,
// teleporte na zona, puxar jogador e auditoria de cada ação.
// Uso: SERVER=http://localhost:2999 PAINEL_CODIGO_FILE=../../.data/painel-test-codigo.txt node test/modo_deus.mjs
// (servidor de teste com ADMIN_TEST_FIRST_GUEST=1 e PAINEL_CODIGO_ARQUIVO com o mesmo arquivo; ver run-all.sh)
import { Client } from "colyseus.js";
import { readFile, rm } from "node:fs/promises";

const HTTP = process.env.SERVER ?? "http://localhost:2999";
const WS = HTTP.replace(/^http/, "ws");
const ARQ = process.env.PAINEL_CODIGO_FILE;
if (!ARQ) throw new Error("defina PAINEL_CODIGO_FILE (o mesmo arquivo que o servidor de teste grava)");
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const until = async (fn, ms = 3000) => {
  const t0 = Date.now();
  while (Date.now() - t0 < ms) { if (await fn()) return true; await sleep(40); }
  return !!(await fn());
};
let fails = 0;
const check = (name, ok, detail = "") => {
  if (!ok) fails++;
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? "  -> " + detail : ""}`);
};
const rnd = () => Math.random().toString(10).slice(2, 7);
const AUCTIONEER = { x: 24, y: 18.5 }; // leiloeiro da zona 4 (shared/src/economy.ts)

// chamada à API do painel: token do jogo sempre; token do painel quando houver
async function api(metodo, caminho, { token, painel, corpo } = {}) {
  const cab = { Authorization: `Bearer ${token}` };
  if (corpo !== undefined) cab["Content-Type"] = "application/json";
  if (painel) cab["X-Painel-Token"] = painel;
  const res = await fetch(`${HTTP}/api/admin${caminho}`, { method: metodo, headers: cab, body: corpo === undefined ? undefined : JSON.stringify(corpo) });
  const body = await res.json().catch(() => ({}));
  return { status: res.status, body };
}

// conta + personagem + sala da zona 4 (cidade, com o leiloeiro); ev guarda o que chegou
async function jogador(prefix, zona = "zone4") {
  const { token } = await (await fetch(`${HTTP}/auth/guest`, { method: "POST" })).json();
  const name = prefix + rnd().replace(/[^a-z0-9]/g, "x");
  const cr = await fetch(`${HTTP}/api/character`, { method: "POST", headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" }, body: JSON.stringify({ name, class: "warrior" }) });
  if (!cr.ok) throw new Error(`criar personagem: ${cr.status}`);
  const room = await new Client(WS).joinOrCreate(zona, { token });
  await new Promise((r) => (room.state?.players ? r() : room.onStateChange.once(r)));
  const ev = { inv: null, notices: [], done: [] };
  room.onMessage("inv", (s) => (ev.inv = s));
  room.onMessage("notice", (m) => ev.notices.push(String(m.text)));
  room.onMessage("market_done", (m) => ev.done.push(m));
  for (const t of ["telegraph", "hit", "swing", "died", "proj", "projend", "coins", "loot", "trap", "levelup", "heal", "pong", "market_page", "market_mine", "market_prices"]) room.onMessage(t, () => {});
  room.send("inv_sync", {});
  await sleep(300);
  return { room, ev, name, token, sid: room.sessionId, me: () => room.state.players.get(room.sessionId) };
}

// código do painel: lê a última linha do arquivo que o servidor de teste grava, esperando uma linha nova
async function linhasCodigo() {
  return (await readFile(ARQ, "utf8").catch(() => "")).split("\n").filter(Boolean);
}
async function tokenPainel(token) {
  const antes = (await linhasCodigo()).length;
  await api("POST", "/codigo", { token });
  await until(async () => (await linhasCodigo()).length > antes);
  const codigo = (await linhasCodigo()).at(-1);
  const r = await api("POST", "/sessao", { token, corpo: { codigo } });
  return r.body.token;
}
const acao = (painel, token, corpo) => api("POST", "/modo-deus/acao", { token, painel, corpo });
const contaInv = (c, id) => (c.ev.inv?.inv ?? []).filter((s) => s?.id === id).reduce((n, s) => n + s.qty, 0);
const slotDe = (c, id, gmv) => (c.ev.inv?.inv ?? []).findIndex((s) => s?.id === id && !!s.gmv === gmv);

const ADM = await jogador("Adm"); // o 1º convidado do servidor de teste é o admin
const B = await jogador("Bea"); // jogador comum, na mesma zona
await rm(ARQ, { force: true });
await sleep(150);

console.log("\n== não-admin é recusado");
const tokB = await tokenPainel(B.token); // B nem consegue token de painel
check("B não ganha token do painel (403 no /codigo)", !tokB);
const rB = await api("POST", "/modo-deus/acao", { token: B.token, painel: "x", corpo: { acao: "modo", ligado: true } });
check("não-admin em POST /modo-deus/acao => 403", rB.status === 403, `status ${rB.status}`);
check("não-admin em GET /modo-deus => 403", (await api("GET", "/modo-deus", { token: B.token, painel: "x" })).status === 403);
check("o personagem do não-admin continua sem Modo Deus", !B.me().gm);

console.log("\n== admin sem token do painel recebe 401");
const r401 = await api("POST", "/modo-deus/acao", { token: ADM.token, corpo: { acao: "modo", ligado: true } });
check("admin sem X-Painel-Token => 401", r401.status === 401, `status ${r401.status}`);

const painel = await tokenPainel(ADM.token);
check("admin recebe token do painel", !!painel);

console.log("\n== ligar o Modo Deus (invisível e velocidade)");
const lig = await acao(painel, ADM.token, { acao: "modo", ligado: true, invis: true, invuln: true, vel: 2 });
check("admin liga o modo => 200", lig.status === 200, JSON.stringify(lig.body));
check("o estado chega ao jogador comum: [GM], invisível e velocidade 2", await until(() => {
  const o = B.room.state.players.get(ADM.sid);
  return o && o.gm === true && o.gmInvis === true && o.gmInvuln === true && o.gmVel === 2;
}), JSON.stringify(B.room.state.players.get(ADM.sid) ? { gm: B.room.state.players.get(ADM.sid).gm, invis: B.room.state.players.get(ADM.sid).gmInvis, vel: B.room.state.players.get(ADM.sid).gmVel } : null));
check("velocidade fora do intervalo é recusada", (await acao(painel, ADM.token, { acao: "modo", vel: 9 })).status === 400);

console.log("\n== item criado pelo GM (vinculado)");
await sleep(200);
const it = await acao(painel, ADM.token, { acao: "item", id: "pocao_de_vida", qtd: 3 });
check("criar 3 poções => 200", it.status === 200, JSON.stringify(it.body));
check("item aparece na mochila do admin", await until(() => contaInv(ADM, "pocao_de_vida") >= 3));
check("item criado vem marcado como GM", await until(() => slotDe(ADM, "pocao_de_vida", true) >= 0));
check("item inexistente é recusado", (await acao(painel, ADM.token, { acao: "item", id: "nao_existe" })).status === 400);

console.log("\n== item do GM não vai ao mercado");
// o leiloeiro só atende de perto: o admin vai até ele pelo próprio teleporte (mesma zona)
const tp = await acao(painel, ADM.token, { acao: "teleporte", zona: 4, x: AUCTIONEER.x, y: AUCTIONEER.y });
check("teleporte até o leiloeiro (mesma zona) => 200", tp.status === 200, JSON.stringify(tp.body));
await until(() => Math.hypot(ADM.me().x - AUCTIONEER.x, ADM.me().y - AUCTIONEER.y) < 1);
check("o admin chegou perto do leiloeiro", Math.hypot(ADM.me().x - AUCTIONEER.x, ADM.me().y - AUCTIONEER.y) < 1);
// com o modo LIGADO a trava geral do personagem responde antes de tudo
const slotG = slotDe(ADM, "pocao_de_vida", true);
ADM.room.send("market_list", { npc: "auctioneer", slot: slotG, qty: 1, price: 100 });
check("com o modo ligado, o mercado recusa o personagem", await until(() => ADM.ev.notices.some((t) => /Modo Deus ligado/.test(t))));
// desliga o modo: a trava do ITEM continua valendo (o item é vinculado ao personagem)
await acao(painel, ADM.token, { acao: "modo", ligado: false });
await until(() => ADM.me().gm === false);
ADM.room.send("market_list", { npc: "auctioneer", slot: slotG, qty: 1, price: 100 });
const recusa = (d) => !d.ok && /Item criado pelo Modo Deus/.test(d.text);
check("item do GM não é listado no mercado", await until(() => ADM.ev.done.some(recusa)), JSON.stringify(ADM.ev.done.at(-1)));
check("nenhuma listagem foi criada", !ADM.ev.done.some((d) => d.ok && d.kind === "list"));
check("o item continua na mochila (não saiu)", await until(() => contaInv(ADM, "pocao_de_vida") >= 3));

console.log("\n== teleporte e puxar");
await acao(painel, ADM.token, { acao: "modo", ligado: true, invis: false });
const tp2 = await acao(painel, ADM.token, { acao: "teleporte", zona: 4, x: 10, y: 10 });
check("teleporte com coordenada => 200", tp2.status === 200);
check("o admin foi para (10, 10)", await until(() => Math.hypot(ADM.me().x - 10, ADM.me().y - 10) < 1));
check("coordenada fora da zona é recusada", (await acao(painel, ADM.token, { acao: "teleporte", zona: 4, x: 9999, y: 1 })).status === 400);
const pux = await acao(painel, ADM.token, { acao: "puxar", jogador: B.charId ?? "" });
check("puxar sem jogador válido é recusado", pux.status === 404);
const jog = await api("GET", "/modo-deus", { token: ADM.token, painel });
const alvoB = (jog.body.jogadores ?? []).find((j) => j.nome === B.name);
check("o painel lista o jogador B na mesma zona", !!alvoB, JSON.stringify(jog.body.jogadores ?? []));
if (alvoB) {
  const p2 = await acao(painel, ADM.token, { acao: "puxar", jogador: alvoB.charId });
  check("puxar o jogador B => 200", p2.status === 200, JSON.stringify(p2.body));
  check("B foi puxado para perto do admin", await until(() => Math.hypot(B.me().x - ADM.me().x, B.me().y - ADM.me().y) < 2.5));
}

console.log("\n== auditoria registra as ações");
const aud = await api("GET", "/auditoria?limite=200", { token: ADM.token, painel });
const acoes = (aud.body.itens ?? []).map((l) => l.acao);
check("auditoria tem ligar o modo (gm_modo)", acoes.includes("gm_modo"));
check("auditoria tem criar item (gm_item)", acoes.includes("gm_item"));
check("auditoria tem teleporte (gm_teleporte)", acoes.includes("gm_teleporte"));
check("auditoria tem puxar (gm_puxar)", acoes.includes("gm_puxar"));
const linhaModo = (aud.body.itens ?? []).find((l) => l.acao === "gm_modo");
check("linha de auditoria traz antes e depois", !!linhaModo && linhaModo.antes !== null && linhaModo.depois !== null);

ADM.room.leave();
B.room.leave();
await sleep(200);
console.log(fails ? `\n${fails} FALHA(S)` : "\nTODOS PASSARAM");
process.exit(fails ? 1 : 0);
