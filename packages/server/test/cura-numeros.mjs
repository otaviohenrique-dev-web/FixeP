// Teste de integração dos números de cura: a poção (aqui via auto-poção) envia o evento "heal" com o valor EFETIVO
// (já limitado à vida máxima e com a Bênção somada, quando houver). Com a vida cheia nada é enviado.
// Exige ECON_TEST=1 e TEST_START_ZONE=1. Uso: SERVER=http://localhost:2986 node test/cura-numeros.mjs
import { Client } from "colyseus.js";
const HTTP = process.env.SERVER ?? "http://localhost:2986";
const WS = HTTP.replace(/^http/, "ws");
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const results = [];
const check = (n, ok, d = "") => { results.push(ok); console.log(`${ok ? "PASS" : "FAIL"}  ${n}${d ? "  -> " + d : ""}`); };
const { token } = await (await fetch(`${HTTP}/auth/guest`, { method: "POST" })).json();
const name = "Cn" + Math.random().toString(10).slice(2, 8);
const cr = await fetch(`${HTTP}/api/character`, { method: "POST", headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" }, body: JSON.stringify({ name, class: "warrior" }) });
if (!cr.ok) throw new Error("criar personagem falhou " + cr.status);
const room = await new Client(WS).joinOrCreate("zone", { token });
await new Promise((r) => (room.state?.players ? r() : room.onStateChange.once(r)));
const heals = [];
room.onMessage("heal", (m) => { if (m.id === room.sessionId) heals.push(m); });
room.onMessage("inv", () => {});
const me = () => room.state.players.get(room.sessionId);
await sleep(500);
room.send("inv_use", { slot: 0 }); // vida cheia: nenhuma cura efetiva, nenhum número
await sleep(600);
check("vida cheia: nenhum evento de cura", heals.length === 0, `eventos ${heals.length}`);
room.send("auto_pot", { at: 90 });
const sk = room.state.enemies.get("e2");
room.send("move_to", { x: sk.x - 2.2, y: sk.y });
const t0 = Date.now();
while (!heals.length && Date.now() - t0 < 30000) await sleep(100);
check("a poção enviou o evento de cura", heals.length > 0);
const h = heals[0];
check("valor efetivo positivo e no máximo o da poção (40 + Bênção)", !!h && h.amount > 0 && h.amount <= 40, `amount ${h?.amount}`);
check("o evento traz a posição do personagem", !!h && Number.isFinite(h.x) && Number.isFinite(h.y));
console.log(`\n${results.filter(Boolean).length}/${results.length} verificações passaram`);
room.send("move_to", { x: 14, y: 20 });
room.leave();
await sleep(200);
process.exit(results.every(Boolean) ? 0 : 1);
