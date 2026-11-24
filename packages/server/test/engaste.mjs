// Teste de ponta a ponta do ENGASTE na Ferreira (aba Engastar, C3.3): longe do NPC recusa sem gastar nada;
// perto, engasta uma gema de vida numa armadura rara (gasta 1 Óbolo); sem espaço livre recusa; remover devolve o
// espaço; e a gema persiste após reconectar. Exige o servidor de teste com ECON_TEST=1 (kit: armadura rara e 2 Óbolos).
// Uso: SERVER=http://localhost:2956 node test/engaste.mjs
import { Client } from "colyseus.js";

const HTTP = process.env.SERVER ?? "http://localhost:2999";
const WS = HTTP.replace(/^http/, "ws");
const ROOM = "zone4"; // a ferreira fica na cidade (zona 4), em (29, 24)
const SMITH = { npc: "smith", x: 29, y: 25.5 };
const MERCHANT = { npc: "merchant", x: 19, y: 25.5 };
const PECA = "warrior_armor_rare"; // armadura rara: 1 espaço de gema
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

const acc = await account("Engaste");
const A = await enter(acc);

console.log("== 1. Longe da ferreira não engasta e não gasta Óbolos");
await goto(A, MERCHANT.x, MERCHANT.y);
const slot = slotOf(A.st.snap, PECA);
const obols0 = A.st.snap.obols;
await after(A, () => A.room.send("socket", { npc: SMITH.npc, origem: "mochila", slot, gema: "vida" }));
check("longe do NPC: recusa e nada é gasto", /perto/i.test(lastNotice(A)) && A.st.snap.obols === obols0 && !A.st.snap.inv[slot]?.gm, lastNotice(A));

console.log("\n== 2. Perto da ferreira engasta a gema de vida e gasta 1 Óbolo");
await goto(A, SMITH.x, SMITH.y);
await after(A, () => A.room.send("socket", { npc: SMITH.npc, origem: "mochila", slot, gema: "vida" }));
check("a armadura passa a ter a gema de vida", A.st.snap.inv[slot]?.gm?.join() === "vida", lastNotice(A));
check("gasta 1 Óbolo de Sangue", A.st.snap.obols === obols0 - 1, `óbolos ${obols0} -> ${A.st.snap.obols}`);

console.log("\n== 3. Sem espaço livre recusa e não gasta");
const obols1 = A.st.snap.obols;
await after(A, () => A.room.send("socket", { npc: SMITH.npc, origem: "mochila", slot, gema: "vida" }));
check("espaço cheio: recusa e nada é gasto", /espaço/i.test(lastNotice(A)) && A.st.snap.obols === obols1 && A.st.snap.inv[slot]?.gm?.length === 1, lastNotice(A));

console.log("\n== 4. Remover devolve o espaço");
await after(A, () => A.room.send("unsocket", { npc: SMITH.npc, origem: "mochila", slot, idx: 0 }));
check("sem gema e sem custo: o espaço volta a ficar livre", !A.st.snap.inv[slot]?.gm && A.st.snap.obols === obols1, lastNotice(A));

console.log("\n== 5. A gema persiste após reconectar");
await after(A, () => A.room.send("socket", { npc: SMITH.npc, origem: "mochila", slot, gema: "vida" }));
A.room.leave();
await sleep(2000);
const B = await enter(acc);
const again = B.st.snap.inv[slotOf(B.st.snap, PECA)];
check("ao reconectar, a armadura continua com a gema de vida", again?.gm?.join() === "vida", JSON.stringify(again));
B.room.leave();

const falhou = results.filter((r) => !r).length;
console.log(`\n${results.length - falhou}/${results.length} passaram`);
process.exit(falhou ? 1 : 0);
