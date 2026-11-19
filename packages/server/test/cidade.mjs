// Teste de ponta a ponta da CIDADE SEGURA e do BAÚ: zona sem dano e sem PvP, baú pessoal (depositar, retirar, anti-duplicação,
// validação, moedas, persistência, isolamento entre jogadores) e renascimento na cidade depois de morrer numa zona de combate.
// Uso: servidor com ECON_TEST=1 (kit inicial) e sem TEST_START_ZONE; depois: SERVER=http://localhost:2999 node test/cidade.mjs
import { Client } from "colyseus.js";

const HTTP = process.env.SERVER ?? "http://localhost:2999";
const WS = HTTP.replace(/^http/, "ws");
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const results = [];
const check = (name, ok, detail = "") => { results.push(ok); console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? "  -> " + detail : ""}`); };
const until = async (fn, ms = 3000) => { const t0 = Date.now(); while (Date.now() - t0 < ms) { if (fn()) return true; await sleep(60); } return false; };

async function account(cls = "warrior") {
  const { token } = await (await fetch(`${HTTP}/auth/guest`, { method: "POST" })).json();
  const name = "Cd" + Math.random().toString(36).slice(2, 8);
  const cr = await fetch(`${HTTP}/api/character`, { method: "POST", headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" }, body: JSON.stringify({ name, class: cls }) });
  if (!cr.ok) throw new Error(`criar personagem: ${cr.status}`);
  return { token, name };
}
const zoneApi = async (acc) => (await (await fetch(`${HTTP}/api/me`, { headers: { Authorization: `Bearer ${acc.token}` } })).json()).character.zone;

async function enter(acc, room = "zone4") {
  const r = await new Client(WS).joinOrCreate(room, { token: acc.token });
  await new Promise((ok) => (r.state?.players ? ok() : r.onStateChange.once(ok)));
  const ev = { inv: null, vault: null, vaults: 0, notice: [], travel: [], hits: [], died: 0, left: null };
  r.onMessage("inv", (m) => (ev.inv = m));
  r.onMessage("vault", (m) => { ev.vault = m; ev.vaults++; });
  r.onMessage("notice", (m) => ev.notice.push(String(m.text)));
  r.onMessage("travel", (m) => ev.travel.push(m));
  r.onMessage("hit", (m) => ev.hits.push(m));
  r.onMessage("died", () => ev.died++);
  r.onMessage("*", () => {});
  r.onLeave((c) => (ev.left = c));
  const P = {
    r, ev, acc, me: () => r.state.players.get(r.sessionId),
    send: (t, p) => r.send(t, p),
    said: (frag) => ev.notice.some((t) => t.includes(frag)),
    // espera a fotografia mais nova do baú depois de enviar uma operação
    async op(t, p) { const n = ev.vaults; r.send(t, p); await until(() => ev.vaults > n, 1500); await sleep(120); },
    async walk(x, y) { r.send("move_to", { x, y }); await until(() => Math.hypot(P.me().x - x, P.me().y - y) < 0.6, 12000); },
    invCount: (id) => (ev.inv?.inv ?? []).reduce((a, s) => a + (s && s.id === id ? s.qty : 0), 0),
    vaultCount: (id) => (ev.vault?.slots ?? []).reduce((a, s) => a + (s && s.id === id ? s.qty : 0), 0),
  };
  await until(() => ev.inv, 2000);
  return P;
}

console.log("\n== Cidade: segurança ==");
const accA = await account(), accB = await account("cleric");
const A = await enter(accA), B = await enter(accB);
check("nascem na cidade (zona 4), no ponto de nascimento", A.r.state.zoneId === 4 && Math.hypot(A.me().x - 24, A.me().y - 30) < 0.6 && (await zoneApi(accA)) === 4);
let enemyCount = 0; A.r.state.enemies.forEach(() => enemyCount++);
check("sem inimigos nem chefe", enemyCount === 0);
A.send("pvp", { on: true });
await sleep(700);
check("PvP desligado: o pedido é recusado com aviso e a flag não liga", !A.me().pvp && A.said("paz"), JSON.stringify(A.ev.notice));
const hpB = B.me().hp;
for (let i = 0; i < 4; i++) { for (const a of ["attack", "skill1", "skill2", "skill3"]) A.send("act", { a, ax: B.me().x, ay: B.me().y }); await sleep(500); }
check("nenhum dano em jogadores (golpes, habilidades de área, projéteis e armadilhas)", B.me().hp === hpB && !B.ev.hits.some((h) => h.k === "p"), `hp ${hpB} -> ${B.me().hp}`);

console.log("\n== Baú: acesso ==");
await A.walk(20, 31); // as habilidades acima podem ter empurrado o jogador (investidas): volta para longe do baú
A.send("vault_open", {});
await sleep(500);
check("longe do baú: recusado, nada é enviado", A.ev.vaults === 0 && A.said("baú"), JSON.stringify(A.ev.notice.slice(-1)));
A.send("vault_deposit", { slot: 0 });
await sleep(300);
check("depositar de longe não move o item", A.invCount("espada_1m_common") === 1 && A.ev.vaults === 0);
await A.walk(29, 30);
await A.op("vault_open", {});
check("perto do baú: abre, com 180 espaços vazios e saldo zero", A.ev.vault?.slots.length === 180 && A.ev.vault.slots.every((s) => s === null) && A.ev.vault.iron === 0, `${A.ev.vault?.slots.length} espaços, ${A.ev.vaults} envios, em (${A.me().x.toFixed(1)}, ${A.me().y.toFixed(1)})`);

console.log("\n== Baú: depositar e retirar ==");
const sword = A.ev.inv.inv.findIndex((s) => s?.id === "espada_1m_common");
await A.op("vault_deposit", { slot: sword });
check("depositar tira da mochila e põe no baú (conservação)", A.invCount("espada_1m_common") === 0 && A.vaultCount("espada_1m_common") === 1);
await A.op("vault_withdraw", { slot: A.ev.vault.slots.findIndex((s) => s?.id === "espada_1m_common") });
check("retirar devolve à mochila", A.invCount("espada_1m_common") === 1 && A.vaultCount("espada_1m_common") === 0);
// anti-duplicação: o mesmo pedido enviado em rajada só vale uma vez
const sw2 = A.ev.inv.inv.findIndex((s) => s?.id === "espada_1m_common");
for (let i = 0; i < 6; i++) A.send("vault_deposit", { slot: sw2 });
await sleep(900);
check("6 depósitos do MESMO espaço em rajada: o item existe uma só vez no total", A.invCount("espada_1m_common") + A.vaultCount("espada_1m_common") === 1, `mochila ${A.invCount("espada_1m_common")} baú ${A.vaultCount("espada_1m_common")}`);
const vs = A.ev.vault.slots.findIndex((s) => s?.id === "espada_1m_common");
for (let i = 0; i < 6; i++) A.send("vault_withdraw", { slot: vs });
await sleep(900);
check("6 retiradas do MESMO espaço em rajada: continua uma só", A.invCount("espada_1m_common") + A.vaultCount("espada_1m_common") === 1);

console.log("\n== Baú: pilhas, espaço escolhido e organização ==");
const pot = A.ev.inv.inv.findIndex((s) => s?.id === "pocao_de_vida");
const potQty = A.invCount("pocao_de_vida");
await A.op("vault_deposit", { slot: pot, qty: 2, to: 7 });
check("depositar parte de uma pilha, no espaço 7 escolhido", A.ev.vault.slots[7]?.id === "pocao_de_vida" && A.ev.vault.slots[7].qty === 2 && A.invCount("pocao_de_vida") === potQty - 2);
await A.op("vault_move", { from: 7, to: 20 });
check("mover dentro do baú (para espaço vazio)", A.ev.vault.slots[7] === null && A.ev.vault.slots[20]?.qty === 2);
const pot2 = A.ev.inv.inv.findIndex((s) => s?.id === "pocao_de_vida");
await A.op("vault_deposit", { slot: pot2, qty: 1 });
check("depósito seguinte junta com a pilha existente", A.vaultCount("pocao_de_vida") === 3 && A.ev.vault.slots[20].qty === 3);
await A.op("vault_withdraw", { slot: 20, qty: 3 });
check("retirar tudo devolve as 5 poções", A.invCount("pocao_de_vida") === potQty && A.vaultCount("pocao_de_vida") === 0);

console.log("\n== Baú: pedidos inválidos ==");
const before = JSON.stringify(A.ev.inv.inv), n0 = A.ev.vaults;
for (const bad of [{ slot: -1 }, { slot: 99 }, { slot: 1.5 }, { slot: "a" }, { slot: null }, { slot: 0, qty: 0 }, { slot: 0, qty: -3 }, { slot: 0, qty: 1.5 }, { slot: 0, qty: "x" }, { slot: 0, to: 9999 }, {}, null]) A.send("vault_deposit", bad);
for (const bad of [{ slot: -1 }, { slot: 180 }, { slot: 5 }, { slot: "z" }, { slot: 5, to: 99 }]) A.send("vault_withdraw", bad);
for (const bad of [{ from: 1, to: 2 }, { from: -1, to: 2 }, { from: 0, to: 999 }, { from: "a", to: "b" }]) A.send("vault_move", bad);
await sleep(800);
check("pedidos inválidos são recusados sem alterar nada", JSON.stringify(A.ev.inv.inv) === before && A.ev.vault.slots.every((s) => s === null), `${A.ev.vaults - n0} respostas`);
check("o servidor segue de pé e o jogador conectado", A.ev.left === null);

console.log("\n== Baú: moedas ==");
const iron0 = A.ev.inv.iron;
await A.op("vault_coins", { coin: "iron", amount: 1000, dir: "in" });
check("depositar tostões", A.ev.vault.iron === 1000 && A.ev.inv.iron === iron0 - 1000);
await A.op("vault_coins", { coin: "iron", amount: 400, dir: "out" });
check("retirar tostões", A.ev.vault.iron === 600 && A.ev.inv.iron === iron0 - 600);
const v1 = A.ev.vaults;
for (const bad of [{ coin: "iron", amount: 999999, dir: "out" }, { coin: "iron", amount: -5, dir: "in" }, { coin: "iron", amount: 1.5, dir: "in" }, { coin: "ouro", amount: 5, dir: "in" }, { coin: "iron", amount: 5, dir: "x" }, { coin: "iron", amount: 10 ** 12, dir: "in" }, { coin: "obols", amount: 99, dir: "in" }]) A.send("vault_coins", bad);
await sleep(800);
check("moedas: acima do saldo, negativas, fracionadas ou inválidas são recusadas", A.ev.vault.iron === 600 && A.ev.inv.iron === iron0 - 600 && A.ev.vault.obols === 0 && A.ev.inv.obols === 2);
await A.op("vault_coins", { coin: "obols", amount: 1, dir: "in" });
check("óbolos também", A.ev.vault.obols === 1 && A.ev.inv.obols === 1);

console.log("\n== Baú: distância é conferida a cada pedido ==");
await A.op("vault_deposit", { slot: A.ev.inv.inv.findIndex((s) => s?.id === "warrior_armor_rare") });
const stored = A.vaultCount("warrior_armor_rare");
await A.walk(24, 30);
A.send("vault_withdraw", { slot: A.ev.vault.slots.findIndex((s) => s?.id === "warrior_armor_rare") });
A.send("vault_coins", { coin: "iron", amount: 100, dir: "out" });
await sleep(600);
check("depois de se afastar, retirar item e moedas é recusado", stored === 1 && A.vaultCount("warrior_armor_rare") === 1 && A.ev.vault.iron === 600 && A.said("perto"));

console.log("\n== Baú: persistência e isolamento ==");
await A.r.leave(true);
await sleep(600);
const A2 = await enter(accA);
await A2.walk(29, 30);
await A2.op("vault_open", {});
check("depois de sair e voltar, o baú está igual (armadura rara, 600 tostões, 1 óbolo)", A2.vaultCount("warrior_armor_rare") === 1 && A2.ev.vault.iron === 600 && A2.ev.vault.obols === 1, JSON.stringify({ i: A2.ev.vault.iron }));
check("e a bolsa também (sem duplicar o que foi guardado)", A2.invCount("warrior_armor_rare") === 0 && A2.ev.inv.iron === iron0 - 600, `armaduras na mochila ${A2.invCount("warrior_armor_rare")}`);
await B.walk(29, 30);
await B.op("vault_open", {});
check("outro jogador abre o PRÓPRIO baú: vazio, sem ver o do primeiro", B.ev.vault.slots.every((s) => s === null) && B.ev.vault.iron === 0);

console.log("\n== Renascer na cidade ==");
await A2.r.leave(true);
await B.r.leave(true);
await sleep(500);
const D = await enter(await account(), "zone4");
D.send("move_to", { x: 24, y: 2 });
await until(() => Math.hypot(D.me().x - 24, D.me().y - 2) < 1.5, 20000);
D.send("travel", { to: 1 });
check("sai pelo portão (mapa-mundo) para as Cinzas", await until(() => D.ev.travel.length > 0, 14000) && D.ev.travel[0].zone === 1);
await D.r.leave(true);
await sleep(400);
const Z = await enter(D.acc, "zone");
Z.send("move_to", { x: 30, y: 16 }); // direto para os esqueletos
check("morre numa zona de combate", await until(() => Z.ev.died > 0 || Z.me()?.dead, 90_000), `hp ${Z.me()?.hp}`);
check("e o servidor manda renascer na cidade (zona 4)", await until(() => Z.ev.travel.some((t) => t.zone === 4), 20_000));
await Z.r.leave(true);
await sleep(500);
const R = await enter(D.acc, "zone4");
check("a cidade o recebe no ponto de nascimento, vivo e com a zona gravada", Math.hypot(R.me().x - 24, R.me().y - 30) < 0.8 && R.me().hp > 0 && (await zoneApi(D.acc)) === 4, `(${R.me().x}, ${R.me().y})`);
await R.r.leave(true);

const failed = results.filter((r) => !r).length;
console.log(`\n${results.length - failed}/${results.length} verificações passaram`);
process.exit(failed ? 1 : 0);
