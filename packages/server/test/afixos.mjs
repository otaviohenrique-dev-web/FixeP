// Teste de ponta a ponta dos AFIXOS de item: o drop traz afixos válidos, equipar aplica o efeito no status
// e o afixo sobrevive a sair e voltar ao jogo (persistência). Exige o servidor de teste com LOOT_TEST=1 e AFIXO_TEST=1
// (o drop de teste traz "afiado" na arma e "vigor" na armadura). Itens antigos (sem afixo) são cobertos pelas
// suítes de inventário e pelo teste unitário (afixos.unit.ts: lista vazia ou nula = sem afixo).
// Uso: SERVER=http://localhost:2993 node test/afixos.mjs
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
const name = "Afx" + Math.random().toString(10).slice(2, 8);
const cr = await fetch(`${HTTP}/api/character`, { method: "POST", headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" }, body: JSON.stringify({ name, class: "warrior" }) });
if (!cr.ok) throw new Error("criar personagem de teste falhou " + cr.status);

async function enter() {
  const room = await new Client(WS).joinOrCreate("zone", { token });
  await new Promise((r) => (room.state?.players ? r() : room.onStateChange.once(r)));
  const st = { snap: null };
  room.onMessage("inv", (s) => (st.snap = s));
  room.send("inv_sync", {});
  await sleep(400);
  return { room, st, me: () => room.state.players.get(room.sessionId) };
}
async function collect(room, ms = 9000) {
  const t = Date.now();
  while (room.state.items.size > 0 && Date.now() - t < ms) {
    let g = null;
    room.state.items.forEach((x) => { g ??= x; });
    room.send("move_to", { x: g.x, y: g.y });
    await sleep(300);
  }
}
const slotOf = (snap, id) => snap.inv.findIndex((s) => s?.id === id);
const afixosDe = (snap, id) => snap.inv.find((s) => s?.id === id)?.af ?? [];

console.log("\n== 1. Drop com afixos");
let { room, st, me } = await enter();
const e1 = room.state.enemies.get("e1");
room.send("move_to", { x: e1.x - 1.2, y: e1.y });
await sleep(4000);
const t0 = Date.now();
while (e1.st !== "dead" && Date.now() - t0 < 40000 && !me().dead) {
  room.send("act", { a: "attack", ax: e1.x, ay: e1.y });
  await sleep(700);
}
await sleep(400);
const chao = [];
room.state.items.forEach((g) => chao.push({ id: g.itemId, af: g.af }));
check("o abate solta o equipamento de teste com o afixo no chão", chao.some((g) => g.id === "espada_1m_common" && g.af === "afiado") && chao.some((g) => g.id === "warrior_armor_common" && g.af === "vigor"), JSON.stringify(chao));
check("cada afixo do chão é um id conhecido e no máximo 3 por item", chao.every((g) => !g.af || (g.af.split(",").length <= 3 && g.af.split(",").every((a) => /^[a-z_]+$/.test(a)))));
await collect(room);
await sleep(300);
check("ao pegar, a mochila guarda o item com o afixo", afixosDe(st.snap, "espada_1m_common").join() === "afiado" && afixosDe(st.snap, "warrior_armor_common").join() === "vigor", JSON.stringify(st.snap.inv.filter(Boolean)));
check("pocao (sem afixo) continua sem afixo na mochila", afixosDe(st.snap, "pocao_de_vida").length === 0);

console.log("\n== 2. Equipar aplica o efeito");
const poderAntes = me().poder;
room.send("inv_equip", { slot: slotOf(st.snap, "espada_1m_common") });
await sleep(300);
check("equipar a arma leva o afixo para o equipamento (equipAf)", st.snap.equip.weapon === "espada_1m_common" && (st.snap.equipAf?.weapon ?? []).join() === "afiado", JSON.stringify(st.snap.equipAf));
room.send("inv_equip", { slot: slotOf(st.snap, "warrior_armor_common") });
await sleep(400);
check("equipar a armadura com Vigor soma +5 de vida à armadura (120 + 15 + 5 = 140)", me().maxHp === 140, `maxHp ${me().maxHp}`);
check("o poder total sobe ao equipar (considera os afixos)", me().poder > poderAntes, `${poderAntes} -> ${me().poder}`);

console.log("\n== 3. Persistência");
await room.leave();
await sleep(1500);
({ room, st, me } = await enter());
await sleep(300);
check("depois de sair e voltar, a arma continua com o afixo equipado", (st.snap.equipAf?.weapon ?? []).join() === "afiado", JSON.stringify(st.snap.equipAf));
check("depois de sair e voltar, a armadura continua com Vigor (maxHp 140)", (st.snap.equipAf?.armor ?? []).join() === "vigor" && me().maxHp === 140, `maxHp ${me().maxHp}`);
await room.leave();

const ok = results.filter(Boolean).length;
console.log(`\n${ok}/${results.length} verificações passaram`);
if (ok !== results.length) process.exit(1);
