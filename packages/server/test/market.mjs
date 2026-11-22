// Teste de ponta a ponta do mercado (leiloeiro) com 3 jogadores. Exige o servidor de teste com ECON_TEST=1 LOOT_TEST=1 MARKET_TTL_S=4
// (kit inicial: 50000 tostões, armaduras de guerreiro, elmo épico, poções; listagens que vencem em 4 s).
// Uso: SERVER=http://localhost:2999 node test/market.mjs
import { Client } from "colyseus.js";

const HTTP = process.env.SERVER ?? "http://localhost:2999";
const WS = HTTP.replace(/^http/, "ws");
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const results = [];
const check = (name, ok, detail = "") => { results.push(ok); console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? "  -> " + detail : ""}`); };

async function account(prefix) {
  const { token } = await (await fetch(`${HTTP}/auth/guest`, { method: "POST" })).json();
  const name = prefix + Math.random().toString(10).slice(2, 7);
  const cr = await fetch(`${HTTP}/api/character`, { method: "POST", headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" }, body: JSON.stringify({ name, class: "warrior" }) });
  if (!cr.ok) throw new Error("criar personagem falhou " + cr.status);
  return { token, name };
}
async function enter(acc) {
  const room = await new Client(WS).joinOrCreate("zone4", { token: acc.token });
  await new Promise((r) => (room.state?.players ? r() : room.onStateChange.once(r)));
  const st = { snap: null, notices: [], page: null, mine: null, done: [] };
  room.onMessage("inv", (s) => (st.snap = s));
  room.onMessage("notice", (m) => st.notices.push(m.text));
  room.onMessage("market_page", (m) => (st.page = m));
  room.onMessage("market_mine", (m) => (st.mine = m));
  room.onMessage("market_done", (m) => st.done.push(m));
  for (const t of ["telegraph", "hit", "swing", "died", "proj", "projend", "coins", "loot", "trap", "levelup", "heal", "pong"]) room.onMessage(t, () => {});
  room.send("inv_sync", {});
  await sleep(500);
  return { room, st, me: () => room.state.players.get(room.sessionId) };
}
const count = (snap, id) => snap.inv.filter((s) => s?.id === id).reduce((n, s) => n + s.qty, 0);
const slotOf = (snap, id) => snap.inv.findIndex((s) => s?.id === id);
const last = (a) => a[a.length - 1];
async function goto(c, x, y, tol = 0.6) {
  c.room.send("move_to", { x, y });
  const t = Date.now();
  while (Math.hypot(c.me().x - x, c.me().y - y) > tol && Date.now() - t < 9000) await sleep(100);
}
const NPC = "auctioneer";
const AX = 24, AY = 20;

const accA = await account("MkA");
let A = await enter(accA);
const B = await enter(await account("MkB")), C = await enter(await account("MkC"));

console.log("\n== Distância e leitura ==");
A.room.send("market_browse", { npc: NPC, filter: {} });
await sleep(300);
check("longe do leiloeiro não consulta", A.st.page === null && /perto/i.test(last(A.st.notices) ?? ""));
A.room.send("market_list", { npc: NPC, slot: slotOf(A.st.snap, "warrior_armor_rare"), qty: 1, price: 1000 });
await sleep(300);
check("longe do leiloeiro, listar é recusado e o item fica na mochila", count(A.st.snap, "warrior_armor_rare") === 1 && A.st.done.length === 0);
await Promise.all([goto(A, AX, AY), goto(B, AX + 1.5, AY), goto(C, AX, AY + 1)]);

console.log("\n== Listar ==");
const iron0 = A.st.snap.iron;
A.room.send("market_list", { npc: "merchant", slot: slotOf(A.st.snap, "warrior_armor_rare"), qty: 1, price: 1000 }); // NPC errado
await sleep(300);
check("NPC errado não vale", count(A.st.snap, "warrior_armor_rare") === 1);
A.room.send("market_list", { npc: NPC, slot: slotOf(A.st.snap, "warrior_armor_rare"), qty: 1, price: 1000 });
await sleep(700);
check("listar tira o item e cobra 4% de taxa (40)", count(A.st.snap, "warrior_armor_rare") === 0 && A.st.snap.iron === iron0 - 40 && last(A.st.done)?.ok === true, JSON.stringify(last(A.st.done)));
check("o servidor devolve as minhas listagens", A.st.mine?.listings.length === 1 && A.st.mine.listings[0].status === "active" && A.st.mine.listings[0].fee === 40);
for (const bad of [{ slot: 0, qty: 1, price: 1 }, { slot: 0, qty: 1, price: 1e12 }, { slot: 0, qty: -1, price: 100 }, { slot: "x", qty: 1, price: 100 }, { slot: 0, qty: 1, price: NaN }, null, 5]) A.room.send("market_list", { npc: NPC, ...(bad ?? {}) });
await sleep(400);
check("pedidos malformados não criam listagem", A.st.mine.listings.length === 1);

console.log("\n== Comprar ==");
B.room.send("market_browse", { npc: NPC, filter: { kind: "armor", rarity: "rare", sort: "price_asc" } });
await sleep(400);
const l = B.st.page?.items.find((i) => i.itemId === "warrior_armor_rare");
check("outro jogador encontra a listagem pelos filtros", !!l && l.price === 1000 && !l.mine);
const ironB = B.st.snap.iron;
B.room.send("market_buy", { npc: NPC, id: l.id });
await sleep(700);
check("comprar cobra e entrega o item", count(B.st.snap, "warrior_armor_rare") >= 1 && B.st.snap.iron === ironB - 1000, `${B.st.snap.iron}`);
C.room.send("market_buy", { npc: NPC, id: l.id });
await sleep(500);
check("quem chega depois recebe que não está mais à venda e não paga", last(C.st.done)?.ok === false && C.st.snap.iron === 50000);
A.room.send("market_my", { npc: NPC });
await sleep(300);
check("o vendedor vê a venda pendente", A.st.mine.listings[0]?.status === "sold");
const ironA = A.st.snap.iron;
A.room.send("market_claim", { npc: NPC, id: l.id });
await sleep(600);
check("recolher paga o preço inteiro", A.st.snap.iron === ironA + 1000 && A.st.mine.listings.length === 0);
A.room.send("market_claim", { npc: NPC, id: l.id });
await sleep(400);
check("recolher de novo não paga outra vez", A.st.snap.iron === ironA + 1000);

console.log("\n== Concorrência: B e C compram o mesmo item ao mesmo tempo ==");
A.room.send("market_list", { npc: NPC, slot: slotOf(A.st.snap, "warrior_helmet_epic"), qty: 1, price: 1500 });
await sleep(600);
B.room.send("market_browse", { npc: NPC, filter: { kind: "helmet" } });
await sleep(400);
const h = B.st.page.items.find((i) => i.itemId === "warrior_helmet_epic");
const hB = count(B.st.snap, "warrior_helmet_epic"), hC = count(C.st.snap, "warrior_helmet_epic");
const ib = B.st.snap.iron, ic = C.st.snap.iron;
B.room.send("market_buy", { npc: NPC, id: h.id });
C.room.send("market_buy", { npc: NPC, id: h.id });
await sleep(900);
const gotB = count(B.st.snap, "warrior_helmet_epic") - hB, gotC = count(C.st.snap, "warrior_helmet_epic") - hC;
check("só um dos dois leva o elmo (sem duplicar)", gotB + gotC === 1, `B+${gotB} C+${gotC}`);
check("só quem levou o elmo pagou (1500); o outro mantém os tostões", (gotB ? ib - B.st.snap.iron === 1500 && C.st.snap.iron === ic : ic - C.st.snap.iron === 1500 && B.st.snap.iron === ib));

console.log("\n== Vencer e devolver ==");
A.room.send("market_list", { npc: NPC, slot: slotOf(A.st.snap, "warrior_armor_common"), qty: 1, price: 50 });
await sleep(600);
const cA = count(A.st.snap, "warrior_armor_common");
await sleep(4600);
B.room.send("market_browse", { npc: NPC, filter: { rarity: "common", kind: "armor" } });
await sleep(400);
check("depois do prazo a listagem some da busca", !B.st.page.items.some((i) => i.seller === A.me().name));
A.room.send("market_my", { npc: NPC });
await sleep(300);
check("o vendedor a vê como vencida", A.st.mine.listings.some((x) => x.status === "expired"));
A.room.send("market_claim", { npc: NPC, id: "all" });
await sleep(700);
check("recolher tudo devolve o item vencido", count(A.st.snap, "warrior_armor_common") === cA + 1 && A.st.mine.listings.length === 0, `${cA}->${count(A.st.snap, "warrior_armor_common")}`);

console.log("\n== Cancelar e persistência ==");
const pots0 = count(A.st.snap, "pocao_de_vida");
A.room.send("market_list", { npc: NPC, slot: slotOf(A.st.snap, "pocao_de_vida"), qty: 2, price: 300 });
await sleep(600);
const ironP = A.st.snap.iron;
check("listar parte de uma pilha deixa o resto na mochila", count(A.st.snap, "pocao_de_vida") === pots0 - 2);
const idP = A.st.mine.listings[0].id;
A.room.send("market_cancel", { npc: NPC, id: idP });
await sleep(600);
check("cancelar devolve o item e não devolve a taxa", count(A.st.snap, "pocao_de_vida") === pots0 && A.st.snap.iron === ironP);
A.room.send("market_list", { npc: NPC, slot: slotOf(A.st.snap, "pocao_de_vida"), qty: 1, price: 100 });
await sleep(600);
const potsAfter = count(A.st.snap, "pocao_de_vida"), ironAfter = A.st.snap.iron;
await A.room.leave();
await sleep(900);
A = await enter(accA);
check("ao reentrar, mochila e saldo batem com o gravado (item em custódia não volta duplicado)", count(A.st.snap, "pocao_de_vida") === potsAfter && A.st.snap.iron === ironAfter, `${count(A.st.snap, "pocao_de_vida")}/${A.st.snap.iron} vs ${potsAfter}/${ironAfter}`);
await Promise.all([goto(A, AX, AY)]);
A.room.send("market_my", { npc: NPC });
await sleep(400);
check("e a listagem continua ativa depois de sair e entrar", A.st.mine?.listings.length === 1 && A.st.mine.listings[0].itemId === "pocao_de_vida");

const failed = results.filter((r) => !r).length;
console.log(`\n${results.length - failed}/${results.length} passaram`);
await A.room.leave(); await B.room.leave(); await C.room.leave();
process.exit(failed ? 1 : 0);
