// Teste de ponta a ponta do inventário: loot, equipar, poção, entradas maliciosas e persistência.
// Exige o servidor de teste com LOOT_TEST=1. Uso: SERVER=http://localhost:2999 node test/inventory.mjs
import { Client } from "colyseus.js";

const HTTP = process.env.SERVER ?? "http://localhost:2999";
const WS = HTTP.replace(/^http/, "ws");
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const results = [];
const check = (name, ok, detail = "") => {
  results.push(ok);
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? "  -> " + detail : ""}`);
};
const alive = async () => { try { return (await fetch(`${HTTP}/health`, { signal: AbortSignal.timeout(2000) })).ok; } catch { return false; } };

const { token } = await (await fetch(`${HTTP}/auth/guest`, { method: "POST" })).json();
const name = "Inv" + Math.random().toString(36).slice(2, 8);
const cr = await fetch(`${HTTP}/api/character`, { method: "POST", headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" }, body: JSON.stringify({ name, class: "warrior" }) });
if (!cr.ok) throw new Error("criar personagem de teste falhou " + cr.status);

async function enter() {
  const room = await new Client(WS).joinOrCreate("zone", { token });
  await new Promise((r) => (room.state?.players ? r() : room.onStateChange.once(r)));
  const st = { snap: null, loot: [], notices: [], hits: [], left: null };
  room.onMessage("inv", (s) => (st.snap = s));
  room.onMessage("loot", (m) => st.loot.push(m));
  room.onMessage("notice", (m) => st.notices.push(m.text));
  room.onMessage("hit", (m) => st.hits.push(m));
  room.onLeave((c) => (st.left = c));
  room.send("inv_sync", {});
  await sleep(400);
  return { room, st, me: () => room.state.players.get(room.sessionId) };
}
// os itens caem no chão: anda até cada um (andar até o item pega sozinho)
async function collect(room, ms = 9000) {
  const t = Date.now();
  while (room.state.items.size > 0 && Date.now() - t < ms) {
    let g = null;
    room.state.items.forEach((x) => { g ??= x; });
    room.send("move_to", { x: g.x, y: g.y });
    await sleep(300);
  }
}
const count = (snap, id) => snap.inv.filter((s) => s?.id === id).reduce((n, s) => n + s.qty, 0);
const slotOf = (snap, id) => snap.inv.findIndex((s) => s?.id === id);

console.log("\n== 1. Entrada ==");
let { room, st, me } = await enter();
check("o cliente recebe o inventário ao pedir (inv_sync)", st.snap !== null && st.snap.inv.length === 20);
check("personagem novo começa com a mochila vazia", st.snap.inv.every((s) => s === null) && !st.snap.equip.weapon && !st.snap.equip.armor);
check("vida inicial = 120 (nível 1, sem armadura)", me().maxHp === 120, `maxHp ${me().maxHp}`);

console.log("\n== 2. Loot ao matar ==");
const e1 = room.state.enemies.get("e1");
room.send("move_to", { x: e1.x - 1.2, y: e1.y });
await sleep(4000);
const t0 = Date.now();
while (e1.st !== "dead" && Date.now() - t0 < 40000 && !me().dead) {
  room.send("act", { a: Math.random() < 0.5 ? "attack" : "skill1", ax: e1.x, ay: e1.y });
  await sleep(700);
}
await sleep(500);
check("os itens caem no CHÃO (ainda não estão na mochila)", e1.st === "dead" && room.state.items.size + st.loot.length === 3 && room.state.items.size >= 1, `${room.state.items.size} no chão, ${st.loot.length} recebidos`);
await collect(room);
await sleep(300);
check("matar o esqueleto concede os itens ao matador", e1.st === "dead" && st.loot.length === 3, `${st.loot.length} drops: ${st.loot.map((l) => l.id + "x" + l.qty).join(", ")}`);
check("o inventário recebido contém os itens e a poção empilhada", st.snap && slotOf(st.snap, "espada_1m_common") >= 0 && slotOf(st.snap, "warrior_armor_common") >= 0 && count(st.snap, "pocao_de_vida") === 2, JSON.stringify(st.snap.inv.filter(Boolean)));

console.log("\n== 3. Equipar ==");
room.send("inv_equip", { slot: slotOf(st.snap, "espada_1m_common") });
await sleep(300);
check("equipar a arma move o item para o equipamento", st.snap.equip.weapon === "espada_1m_common" && slotOf(st.snap, "espada_1m_common") === -1);
room.send("inv_equip", { slot: slotOf(st.snap, "warrior_armor_common") });
await sleep(400);
check("equipar a armadura aumenta a vida máxima (+15)", st.snap.equip.armor === "warrior_armor_common" && me().maxHp === 135, `maxHp ${me().maxHp}`);

console.log("\n== 4. Entradas maliciosas ==");
{
  const before = JSON.stringify(st.snap);
  const lixo = [-1, 20, 99, 1.5, NaN, "0", "x", null, {}, [], [0], true, "__proto__"];
  for (const v of lixo) {
    room.send("inv_equip", { slot: v });
    room.send("inv_drop", { slot: v });
    room.send("inv_use", { slot: v });
    room.send("inv_unequip", { slot: v });
    await sleep(35);
  }
  room.send("inv_equip", null);
  room.send("inv_drop", "lixo");
  room.send("inv_use", [1, 2]);
  room.send("inv_unequip", undefined);
  await sleep(600);
  check("slots e tipos inválidos não alteram o inventário", JSON.stringify(st.snap) === before);
  check("servidor segue de pé e o cliente não foi derrubado", (await alive()) && st.left === null, `saiu=${st.left}`);
  // slot válido, mas de um item que não pode ser usado/equipado
  const pot = slotOf(st.snap, "pocao_de_vida");
  room.send("inv_equip", { slot: pot });
  await sleep(300);
  check("poção não pode ser equipada", count(st.snap, "pocao_de_vida") === 2 && st.notices.some((t) => t.includes("equipado")));
}

console.log("\n== 5. Poção ==");
{
  const pot = slotOf(st.snap, "pocao_de_vida");
  st.notices.length = 0;
  // espera tomar dano (o esqueleto renasce e ataca)
  const tw = Date.now();
  while (me().hp >= me().maxHp && Date.now() - tw < 30000) await sleep(300);
  if (me().hp >= me().maxHp) {
    // vida ainda cheia: testa a recusa
    room.send("inv_use", { slot: pot });
    await sleep(300);
    check("poção com a vida cheia é recusada e NÃO é consumida", count(st.snap, "pocao_de_vida") === 2 && st.notices.some((t) => t.includes("cheia")));
  } else {
    const hpAntes = me().hp;
    room.send("inv_use", { slot: pot });
    await sleep(400);
    check("poção cura (+40, limitado ao máximo) e consome 1", me().hp > hpAntes && count(st.snap, "pocao_de_vida") === 1, `hp ${hpAntes}→${me().hp}`);
    room.send("inv_use", { slot: slotOf(st.snap, "pocao_de_vida") });
    await sleep(400);
    check("segunda poção em seguida fica em recarga (6 s) e não é consumida", count(st.snap, "pocao_de_vida") === 1 && st.notices.some((t) => t.includes("recarga")));
  }
}

console.log("\n== 6. Descartar e desequipar ==");
{
  const potBefore = count(st.snap, "pocao_de_vida");
  room.send("inv_drop", { slot: slotOf(st.snap, "pocao_de_vida") });
  await sleep(300);
  check("descartar remove o espaço inteiro", count(st.snap, "pocao_de_vida") === 0 && potBefore > 0);
  room.send("inv_unequip", { slot: "armor" });
  await sleep(400);
  check("desequipar a armadura devolve o item e reduz a vida máxima", st.snap.equip.armor === null && slotOf(st.snap, "warrior_armor_common") >= 0 && me().maxHp === 120, `maxHp ${me().maxHp}`);
  room.send("inv_equip", { slot: slotOf(st.snap, "warrior_armor_common") });
  await sleep(300);
}

console.log("\n== 7. Persistência ==");
{
  const antes = JSON.stringify(st.snap);
  room.leave();
  await sleep(1200);
  ({ room, st, me } = await enter());
  check("ao voltar, mochila e equipamento são exatamente os mesmos", JSON.stringify(st.snap) === antes, `equip: ${JSON.stringify(st.snap.equip)}`);
  check("a armadura equipada vale de novo na vida máxima", me().maxHp === 135, `maxHp ${me().maxHp}`);
  room.leave();
}

const failed = results.filter((r) => !r).length;
console.log(`\n${results.length - failed}/${results.length} verificações passaram`);
process.exit(failed ? 1 : 0);
