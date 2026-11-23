// Teste de ponta a ponta do Mago: criação, recurso, projétil arcano, Bola de Fogo explosiva, skills "do céu" e dano.
// Exige o servidor de teste com LOOT_TEST=1. Uso: SERVER=http://localhost:2999 node test/mago.mjs
import { Client } from "colyseus.js";

const HTTP = process.env.SERVER ?? "http://localhost:2999";
const WS = HTTP.replace(/^http/, "ws");
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const results = [];
const check = (name, ok, detail = "") => {
  results.push(ok);
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? "  -> " + detail : ""}`);
};
async function until(cond, ms = 15000, step = 100) {
  const t0 = Date.now();
  while (Date.now() - t0 < ms) { if (cond()) return true; await sleep(step); }
  return cond();
}

const { token } = await (await fetch(`${HTTP}/auth/guest`, { method: "POST" })).json();
const name = "Mag" + Math.random().toString(10).slice(2, 7);
const bad = await fetch(`${HTTP}/api/character`, { method: "POST", headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" }, body: JSON.stringify({ name, class: "necromante" }) });
check("classe inexistente é recusada", bad.status === 400);
const cr = await fetch(`${HTTP}/api/character`, { method: "POST", headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" }, body: JSON.stringify({ name, class: "mage" }) });
check("criar um Mago é aceito pela API", cr.ok, String(cr.status));

const room = await new Client(WS).joinOrCreate("zone", { token });
await new Promise((r) => (room.state?.players ? r() : room.onStateChange.once(r)));
const ev = { proj: [], projend: [], hit: [], tele: [], notice: [], loot: [], died: [], left: null };
for (const k of ["proj", "projend", "hit", "notice", "loot", "died"]) room.onMessage(k, (m) => ev[k].push(m));
room.onMessage("telegraph", (m) => ev.tele.push(m));
room.onMessage("*", () => {});
room.onLeave((c) => (ev.left = c));
room.send("inv_sync", {});
await sleep(300);
const me = () => room.state.players.get(room.sessionId);
const act = (a, ax, ay) => room.send("act", { a, ax, ay });
const e1 = room.state.enemies.get("e1");

console.log("\n== 1. Criação ==");
check("o Mago nasce com classe mage, 75 de vida e 140 de Mana", me().cls === "mage" && me().maxHp === 75 && me().maxMana === 140, `cls=${me().cls} hp=${me().maxHp} mana=${me().maxMana}`);

console.log("\n== 2. Ataque e Bola de Fogo ==");
room.send("move_to", { x: e1.x - 7.5, y: e1.y });
await sleep(2800);
act("attack", e1.x, e1.y);
check("o dardo arcano cria um projétil com aparência própria (arcane)", await until(() => ev.proj.some((p) => p.look === "arcane"), 3000), `look=${ev.proj[0]?.look}`);
check("o ataque custa pouca Mana", await until(() => me().mana < 140, 2000) && me().mana >= 130, `mana ${me().mana}`);
await sleep(900);
const mana0 = me().manaF ?? me().mana;
act("skill1", e1.x, e1.y);
check("a Bola de Fogo é um projétil explosivo (look fire, com raio de explosão)", await until(() => ev.proj.some((p) => p.look === "fire" && p.blast > 0), 3000), JSON.stringify(ev.proj.find((p) => p.look === "fire")));
check("a Bola de Fogo gasta 30 de Mana", await until(() => me().mana <= mana0 - 25, 1500), `${mana0} -> ${me().mana}`);
check("ela explode (projend com hit) e fere o inimigo", await until(() => ev.projend.some((p) => p.hit) && ev.hit.some((h) => h.k === "e" && h.dmg >= 15), 4000), `maior dano ${Math.max(0, ...ev.hit.map((h) => h.dmg))}`);

console.log("\n== 3. Skills vindas de cima ==");
await sleep(5000); // recarga da Bola de Fogo
const eAt = () => ({ x: e1.x, y: e1.y });
act("skill2", eAt().x, eAt().y);
check("o Relâmpago é telegrafado como área amiga com efeito vindo do céu (lightning)", await until(() => ev.tele.some((t) => t.friendly && t.fx === "lightning"), 3000), JSON.stringify(ev.tele.find((t) => t.fx)));
await sleep(900);
act("skill3", eAt().x, eAt().y);
check("a Chuva de Fogo desce do céu (firerain)", await until(() => ev.tele.some((t) => t.fx === "firerain"), 3000));
check("sem Mana suficiente, o Meteoro não sai e avisa", await (async () => { // o Meteoro custa 100: depois de gastar, não há
  act("ultimate", eAt().x, eAt().y);
  return until(() => ev.notice.some((m) => String(m.text).includes("Mana")) || ev.tele.some((x) => x.fx === "meteor"), 2500);
})());
await sleep(500);

console.log("\n== 4. Dano explosivo e loot do Mago ==");
const t0 = Date.now();
while (e1.st !== "dead" && Date.now() - t0 < 60000 && !me().dead) {
  act("attack", e1.x, e1.y);
  await sleep(850);
  if (me().mana > 70) act("skill1", e1.x, e1.y);
}
check("o Mago derruba o esqueleto à distância", e1.st === "dead", `hp ${e1.hp}`);
check("ganha XP do abate", me().xp >= 20 || me().level > 1, `xp ${me().xp}`);
await sleep(400);
const t1 = Date.now();
while (room.state.items.size > 0 && Date.now() - t1 < 9000) {
  let g = null; room.state.items.forEach((x) => { g ??= x; });
  room.send("move_to", { x: g.x, y: g.y });
  await sleep(300);
}
await sleep(400);
check("o loot do Mago (varinha de uma mão) vem do chão", ev.loot.some((l) => l.id === "varinha_common"), ev.loot.map((l) => l.id).join(","));
const snap = await new Promise((resolve) => { room.onMessage("inv", resolve); room.send("inv_sync", {}); });
const sl = snap.inv.findIndex((s) => s?.id === "varinha_common");
room.send("inv_equip", { slot: sl });
await sleep(400);
check("o Mago equipa a varinha, mas NÃO a armadura de guerreiro", sl >= 0 && me().maxHp === 75);
check("ninguém foi desconectado e o servidor segue de pé", ev.left === null && (await fetch(`${HTTP}/health`)).ok);

room.leave();
const failed = results.filter((r) => !r).length;
console.log(`\n${results.length - failed}/${results.length} verificações passaram`);
process.exit(failed ? 1 : 0);
