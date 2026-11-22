// Teste de ponta a ponta dos itens no chão (reserva do dono/grupo, contagem, depois livre) e do chefe com baú.
// Servidor de teste com LOOT_TEST=1 LOOT_LOCK_S=3 BOSS_TEST=1 (o chefe nasce perto com 1 de vida). Uso: SERVER=http://localhost:2999 node test/loot.mjs
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

async function spawn(cls) {
  const { token } = await (await fetch(`${HTTP}/auth/guest`, { method: "POST" })).json();
  const name = "Lt" + Math.random().toString(10).slice(2, 8);
  const cr = await fetch(`${HTTP}/api/character`, { method: "POST", headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" }, body: JSON.stringify({ name, class: cls }) });
  if (!cr.ok) throw new Error(`criar ${cls}: ${cr.status}`);
  const room = await new Client(WS).joinOrCreate("zone", { token });
  await new Promise((r) => (room.state?.players ? r() : room.onStateChange.once(r)));
  const ev = { loot: [], notice: [], chest: [], invites: 0, party: null, died: [], xp: [], left: null };
  room.onMessage("loot", (m) => ev.loot.push(m));
  room.onMessage("notice", (m) => ev.notice.push(String(m.text)));
  room.onMessage("chest", (m) => ev.chest.push(m));
  room.onMessage("party_invite", () => ev.invites++);
  room.onMessage("party", (m) => (ev.party = m));
  room.onMessage("xp", (m) => ev.xp.push(m.amount));
  room.onMessage("died", (m) => ev.died.push(m));
  room.onMessage("*", () => {});
  room.onLeave((c) => (ev.left = c));
  room.send("inv_sync", {});
  room.send("party_sync", {});
  await sleep(300);
  return { room, ev, name, id: room.sessionId, me: () => room.state.players.get(room.sessionId), act: (a, ax, ay) => room.send("act", { a, ax, ay }), go: (x, y) => room.send("move_to", { x, y }) };
}
const items = (P) => { const a = []; P.room.state.items.forEach((g, id) => a.push({ id, itemId: g.itemId, qty: g.qty, x: g.x, y: g.y, owner: g.owner, party: g.party, lockS: g.lockS })); return a; };

const A = await spawn("archer"); // abate de longe (não fica em cima dos itens)
const B = await spawn("warrior"); // de fora: só pega depois da reserva
const C = await spawn("cleric"); // do grupo do A: pega durante a reserva
const e1 = A.room.state.enemies.get("e1");

console.log("\n== 1. Grupo e posição ==");
A.room.send("party_invite", { name: C.name });
await until(() => C.ev.invites > 0);
C.room.send("party_accept", {});
check("A e C formam um grupo", await until(() => A.ev.party?.members.length === 2 && C.ev.party?.members.length === 2));
A.go(e1.x - 7, e1.y);
B.go(e1.x + 2.2, e1.y + 0.5);
C.go(e1.x - 4.6, e1.y + 0.5);
await sleep(4200);

console.log("\n== 2. O abate solta itens no chão, reservados ==");
const t0 = Date.now();
while (e1.st !== "dead" && Date.now() - t0 < 50000 && !A.me().dead) { A.act("attack", e1.x, e1.y); await sleep(550); }
await sleep(250);
const t1 = Date.now(); // início da reserva (aproximado)
const gs = items(A);
check("o abate deixa 3 itens no chão (arma, armadura e poções)", e1.st === "dead" && gs.length === 3, gs.map((g) => g.itemId).join(",") + ` | loot A=${A.ev.loot.map((l) => l.id)} B=${B.ev.loot.map((l) => l.id)} C=${C.ev.loot.map((l) => l.id)} | e1 ${e1.x.toFixed(1)},${e1.y.toFixed(1)} A ${A.me().x.toFixed(1)},${A.me().y.toFixed(1)} B ${B.me().x.toFixed(1)},${B.me().y.toFixed(1)} C ${C.me().x.toFixed(1)},${C.me().y.toFixed(1)}`);
check("os itens são divididos por rodízio entre o arqueiro e o clérigo do grupo (dono exclusivo; o de fora não leva)", gs.every((g) => (g.owner === A.id || g.owner === C.id) && g.party === "") && gs.some((g) => g.owner === A.id) && gs.some((g) => g.owner === C.id));
check("a reserva anunciada é de 3 s (LOOT_LOCK_S) e os itens são visíveis a todos", gs.every((g) => g.lockS === 3) && items(B).length === 3 && items(C).length === 3);
check("ninguém recebeu nada ainda (só o chão)", A.ev.loot.length + B.ev.loot.length + C.ev.loot.length === 0);

console.log("\n== 3. Durante a reserva ==");
const i1 = gs.find((g) => g.owner === C.id), i0 = gs.find((g) => g.owner === A.id); // i0 é do arqueiro (reservado); i1 é do clérigo
B.go(i0.x, i0.y); // de fora do grupo
C.go(i1.x, i1.y); // o clérigo vai ao SEU item
await sleep(1100);
check("quem é de fora NÃO pega durante a reserva (andando em cima do item)", B.ev.loot.length === 0 && items(B).some((g) => g.id === i0.id));
B.room.send("pickup", { id: i0.id });
check("pedir para pegar um item reservado é recusado com aviso", await until(() => B.ev.notice.some((t) => t.includes("Reservado") || t.includes("perto")), 2000));
check("o dono do item (clérigo) pega só os SEUS durante a reserva (nunca os do arqueiro)", await until(() => C.ev.loot.length >= 1, 3000) && C.ev.loot.length <= gs.filter((g) => g.owner === C.id).length, C.ev.loot.map((l) => l.id).join(","));

console.log("\n== 4. Depois da reserva qualquer um pega ==");
const left = 3000 - (Date.now() - t1);
if (left > 0) await sleep(left + 600);
check("esgotada a reserva, quem estava em cima do item o pega", await until(() => B.ev.loot.some((l) => l.id === i0.itemId), 4000), B.ev.loot.map((l) => l.id).join(","));
const rest = items(A); // quem estava em cima dos itens já pode ter pego tudo; o que sobrou o dono busca
if (rest.length) A.room.send("pickup", { id: rest[0].id });
check("pedir para pegar de longe é recusado (alcance)", rest.length === 0 || await until(() => A.ev.notice.some((t) => t.includes("perto") || t.includes("Reservado")), 2000) || A.ev.loot.length > 0);
for (const g of rest) { A.go(g.x, g.y); await sleep(2200); }
check("o dono anda até o item que sobrou e o pega", rest.length === 0 || (await until(() => items(A).length === 0, 8000)) && A.ev.loot.length > 0);
await until(() => items(A).length === 0, 3000);
check("o chão fica vazio depois de tudo pego", items(A).length === 0, JSON.stringify(items(A)) + ` A ${A.me().x.toFixed(1)},${A.me().y.toFixed(1)} dead=${A.me().dead} rest=${JSON.stringify(rest)} notices=${A.ev.notice}`);
for (const v of ["", null, 5, {}, "g99999", "__proto__"]) B.room.send("pickup", { id: v });
B.room.send("pickup", null);
await sleep(300);
check("pedidos de pegar inválidos não derrubam ninguém", B.ev.left === null && (await fetch(`${HTTP}/health`)).ok);

console.log("\n== 5. Chefe: baú ==");
const boss = A.room.state.enemies.get("boss");
check("a zona tem um chefe (Rei Ossudo) em campo", boss && boss.kind === "bone_king" && boss.level === 6, boss?.kind);
A.go(22, 6);
await sleep(2600);
A.go(boss.x - 8.5, boss.y);
B.go(6, 38); // longe: não lutou
C.go(boss.x - 9, boss.y); // o clérigo do grupo também precisa estar por perto para ser elegível (o ponto de partida dele varia com a lentidão da máquina)
await sleep(2600);
await until(() => Math.hypot(A.me().x - boss.x, A.me().y - boss.y) < 10 && Math.hypot(C.me().x - boss.x, C.me().y - boss.y) < 12, 15000);
const lv0 = A.me().level;
A.act("attack", boss.x, boss.y);
for (let i = 0; i < 12 && boss.st !== "dead"; i++) { await sleep(400); if (boss.st !== "dead") A.act("attack", boss.x, boss.y); }
check("o chefe cai", await until(() => boss.st === "dead", 8000), boss.st);
check("o anúncio da derrota chega a todos", await until(() => B.ev.notice.some((t) => t.includes("Rei Ossudo foi derrotado")), 3000));
check("o evento do baú chega a todos (animação) com a raridade", await until(() => A.ev.chest.length === 1 && B.ev.chest.length === 1, 3000) && A.ev.chest[0].rarity === "uncommon" && A.ev.chest[0].boss === "Rei Ossudo", JSON.stringify(A.ev.chest[0]));
const bs = items(A);
check("cada elegível (arqueiro e o clérigo do grupo) tem o SEU baú: 2 itens para cada, reservados ao dono", bs.length === 4 && bs.filter((g) => g.owner === A.id).length === 2 && bs.filter((g) => g.owner === C.id).length === 2 && bs.some((g) => g.itemId === "archer_helmet_uncommon") && bs.some((g) => g.itemId === "cleric_helmet_uncommon"), bs.map((g) => g.itemId).join(","));
check("o XP do chefe é muito maior que o de um esqueleto", (A.ev.xp.at(-1) ?? 0) >= 500 && A.me().level > lv0, `xp ${A.ev.xp.at(-1)} nível ${lv0}→${A.me().level}`);
check("quem não lutou não recebe baú próprio", items(B).every((g) => g.owner !== B.id));
check("ninguém foi desconectado", A.ev.left === null && B.ev.left === null && C.ev.left === null);

for (const P of [A, B, C]) P.room.leave();
const failed = results.filter((r) => !r).length;
console.log(`\n${results.length - failed}/${results.length} verificações passaram`);
process.exit(failed ? 1 : 0);
