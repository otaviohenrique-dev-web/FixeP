// Teste de ponta a ponta do DESMONTAR na Ferreira (aba Desmontar, C3.5): longe do NPC recusa sem tirar nada;
// perto, desmonta uma arma comum: o item sai da mochila e entram os materiais (1 Ferro Bruto).
// Exige o servidor de teste com ECON_TEST=1 CRAFT_TEST=1 (kit para craftar a arma de teste).
// Uso: SERVER=http://localhost:2961 node test/desmontar.mjs
import { Client } from "colyseus.js";

const HTTP = process.env.SERVER ?? "http://localhost:2999";
const WS = HTTP.replace(/^http/, "ws");
const ROOM = "zone4"; // a ferreira fica na cidade (zona 4), em (29, 24); o comerciante em (19, 24)
const SMITH = { npc: "smith", x: 29, y: 25.5 };
const MERCHANT = { npc: "merchant", x: 19, y: 25.5 };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const results = [];
const check = (name, ok, detail = "") => {
  results.push(ok);
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? "  -> " + detail : ""}`);
};

async function account(prefix) {
  const { token } = await (await fetch(`${HTTP}/auth/guest`, { method: "POST" })).json();
  const name = prefix + Math.random().toString(10).slice(2, 7);
  const cr = await fetch(`${HTTP}/api/character`, { method: "POST", headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" }, body: JSON.stringify({ name, class: "warrior" }) });
  if (!cr.ok) throw new Error("criar personagem falhou " + cr.status);
  return { token, name };
}
async function enter(acc) {
  const room = await new Client(WS).joinOrCreate(ROOM, { token: acc.token });
  await new Promise((r) => (room.state?.players ? r() : room.onStateChange.once(r)));
  const st = { snap: null, msgs: [] };
  room.onMessage("inv", (s) => (st.snap = s));
  room.onMessage("notice", (m) => st.msgs.push({ text: m.text, ok: !!m.ok }));
  room.send("inv_sync", {});
  await sleep(500);
  return { room, st, me: () => room.state.players.get(room.sessionId) };
}
const count = (snap, id) => snap.inv.filter((s) => s?.id === id).reduce((n, s) => n + s.qty, 0);
const slotOf = (snap, id) => snap.inv.findIndex((s) => s?.id === id);
const lastNotice = (c) => c.st.msgs[c.st.msgs.length - 1]?.text ?? "";
async function goto(c, x, y, tol = 0.6) {
  c.room.send("move_to", { x, y });
  const t = Date.now();
  while (Math.hypot(c.me().x - x, c.me().y - y) > tol && Date.now() - t < 20000) await sleep(100);
  if (Math.hypot(c.me().x - x, c.me().y - y) > 3) throw new Error(`não chegou a (${x}, ${y}): parou em (${c.me().x.toFixed(1)}, ${c.me().y.toFixed(1)})`);
}
/** espera a próxima atualização do inventário (o servidor manda o inv depois de cada operação) */
async function after(c, fn) {
  const antes = c.st.snap;
  fn();
  for (let i = 0; i < 30 && c.st.snap === antes; i++) await sleep(100);
  await sleep(150);
}

const acc = await account("Desmonte");
const A = await enter(acc);

console.log("== 1. Craftar uma arma comum de teste (perto da ferreira)");
await goto(A, SMITH.x, SMITH.y);
await after(A, () => A.room.send("craft", { npc: SMITH.npc, tipo: "arma", familia: "espada_1m", raridade: "common" }));
const slot = slotOf(A.st.snap, "espada_1m_common");
check("a arma de teste saiu na mochila", slot >= 0, lastNotice(A));

console.log("\n== 2. Longe da ferreira não desmonta e não tira nada");
await goto(A, MERCHANT.x, MERCHANT.y);
const ferro0 = count(A.st.snap, "mat_ferro_bruto");
await after(A, () => A.room.send("dismantle", { npc: SMITH.npc, slot, confirm: true }));
check("longe do NPC: recusa e a arma continua", /perto/i.test(lastNotice(A)) && slotOf(A.st.snap, "espada_1m_common") >= 0, lastNotice(A));

console.log("\n== 3. Perto da ferreira desmonta: a arma sai e entra 1 Ferro Bruto");
await goto(A, SMITH.x, SMITH.y);
await after(A, () => A.room.send("dismantle", { npc: SMITH.npc, slot, confirm: true }));
check("a arma sai da mochila", slotOf(A.st.snap, "espada_1m_common") < 0, lastNotice(A));
check("entra 1 Ferro Bruto (regra de comum)", count(A.st.snap, "mat_ferro_bruto") === ferro0 + 1, `ferro ${ferro0} -> ${count(A.st.snap, "mat_ferro_bruto")}`);

A.room.leave();
const falhou = results.filter((r) => !r).length;
console.log(`\n${results.length - falhou}/${results.length} passaram`);
process.exit(falhou ? 1 : 0);
