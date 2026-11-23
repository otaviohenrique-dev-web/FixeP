// Poder total ponta a ponta: equipar e desequipar muda o poder ENVIADO pelo servidor, no sentido certo. (A função pura é testada em poder.unit.ts.)
// Exige o servidor de teste com LOOT_TEST=1. Uso: SERVER=http://localhost:2999 node test/poder.mjs
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
const name = "Pod" + Math.random().toString(10).slice(2, 8);
const cr = await fetch(`${HTTP}/api/character`, { method: "POST", headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" }, body: JSON.stringify({ name, class: "warrior" }) });
if (!cr.ok) throw new Error("criar personagem de teste falhou " + cr.status);

const room = await new Client(WS).joinOrCreate("zone", { token });
await new Promise((r) => (room.state?.players ? r() : room.onStateChange.once(r)));
let snap = null;
room.onMessage("inv", (s) => (snap = s));
room.send("inv_sync", {});
await sleep(400);
const me = () => room.state.players.get(room.sessionId);
const slotOf = (id) => snap.inv.findIndex((s) => s?.id === id);
const esperaPoder = async (fn, ms = 1500) => { const t = Date.now(); while (!fn() && Date.now() - t < ms) await sleep(100); };

console.log("\n== Poder total: servidor envia e muda certo ==");
const p0 = me().poder;
check("o servidor envia um poder inicial positivo", p0 > 0, `poder ${p0}`);

// pega itens: mata o esqueleto (LOOT_TEST garante os mesmos drops)
const e1 = room.state.enemies.get("e1");
room.send("move_to", { x: e1.x - 1.2, y: e1.y });
await sleep(4000);
const t0 = Date.now();
while (e1.st !== "dead" && Date.now() - t0 < 40000 && !me().dead) {
  room.send("act", { a: Math.random() < 0.5 ? "attack" : "skill1", ax: e1.x, ay: e1.y });
  await sleep(700);
}
const tc = Date.now();
while (room.state.items.size > 0 && Date.now() - tc < 9000) {
  let g = null;
  room.state.items.forEach((x) => { g ??= x; });
  room.send("move_to", { x: g.x, y: g.y });
  await sleep(300);
}
await sleep(400);

const arm = "warrior_armor_common";
const arma = "espada_1m_common";
check("os itens do teste chegaram à mochila", slotOf(arm) >= 0 && slotOf(arma) >= 0, JSON.stringify(snap?.inv.filter(Boolean).map((s) => s.id)));

const antes = me().poder;
room.send("inv_equip", { slot: slotOf(arm) });
await esperaPoder(() => me().poder !== antes);
const comArmadura = me().poder;
check("equipar a armadura sobe o poder enviado", comArmadura > antes, `${antes} -> ${comArmadura}`);

room.send("inv_equip", { slot: slotOf(arma) });
await esperaPoder(() => me().poder !== comArmadura);
const comArma = me().poder;
check("equipar a arma sobe o poder enviado de novo", comArma > comArmadura, `${comArmadura} -> ${comArma}`);

room.send("inv_unequip", { slot: "weapon" });
await esperaPoder(() => me().poder !== comArma);
const semArma = me().poder;
check("desequipar a arma desce o poder", semArma < comArma, `${comArma} -> ${semArma}`);

room.send("inv_unequip", { slot: "armor" });
await esperaPoder(() => me().poder !== semArma);
const semNada = me().poder;
check("desequipar a armadura desce o poder (volta ao início)", semNada < semArma && semNada === p0, `${semArma} -> ${semNada} (início ${p0})`);

room.send("inv_equip", { slot: slotOf(arm) });
await esperaPoder(() => me().poder !== semNada);
check("equipar de novo a armadura volta ao poder com ela (determinístico)", me().poder === comArmadura, `${me().poder} vs ${comArmadura}`);

room.leave();
const ok = results.every(Boolean);
console.log(`\n${results.filter(Boolean).length}/${results.length} verificações passaram`);
process.exit(ok ? 0 : 1);
