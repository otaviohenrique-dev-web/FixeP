// Teste de ponta a ponta do CRAFT na Ferreira (aba Craftar): longe do NPC recusa, perto craftar (gasta tudo ou nada),
// Óbolos só do épico para cima, mochila cheia não consome nada, falta de ingrediente recusa, e o item craftado persiste.
// Exige o servidor de teste com ECON_TEST=1 CRAFT_TEST=1 VARIACAO_TEST_LEVEL=40 (kit de ingredientes + nível 40: o mítico pede nível 40).
// Uso: SERVER=http://localhost:2990 node test/craft.mjs
import { Client } from "colyseus.js";

const HTTP = process.env.SERVER ?? "http://localhost:2999";
const WS = HTTP.replace(/^http/, "ws");
const ROOM = "zone4"; // a ferreira fica na cidade (zona 4), em (29, 24); a loja (comerciante) em (19, 24)
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
  const st = { snap: null, msgs: [] }; // msgs: todos os avisos, na ordem em que chegaram (ok = sucesso)
  room.onMessage("inv", (s) => (st.snap = s));
  room.onMessage("notice", (m) => st.msgs.push({ text: m.text, ok: !!m.ok }));
  room.send("inv_sync", {});
  await sleep(500);
  return { room, st, me: () => room.state.players.get(room.sessionId) };
}
const count = (snap, id) => snap.inv.filter((s) => s?.id === id).reduce((n, s) => n + s.qty, 0);
const slotOf = (snap, id) => snap.inv.findIndex((s) => s?.id === id);
const lastNotice = (c) => c.st.msgs[c.st.msgs.length - 1]?.text ?? "";
const freeSlots = (snap) => snap.inv.filter((s) => !s).length;
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

const acc = await account("Craft");
const A = await enter(acc);
check("o kit de teste deu ingredientes (ferro, couro, essência) e Óbolos", count(A.st.snap, "mat_ferro_bruto") === 100 && count(A.st.snap, "mat_couro_curtido") === 100 && A.st.snap.obols === 2, `ferro ${count(A.st.snap, "mat_ferro_bruto")} obols ${A.st.snap.obols}`);

console.log("\n== 1. Longe da ferreira não craftar");
await after(A, () => A.room.send("craft", { npc: SMITH.npc, tipo: "arma", familia: "espada_1m", raridade: "common" }));
check("longe do NPC: recusa e nada é gasto", /perto/i.test(lastNotice(A)) && count(A.st.snap, "mat_ferro_bruto") === 100 && A.st.snap.iron === 50000, lastNotice(A));

await goto(A, SMITH.x, SMITH.y);
console.log("\n== 2. Pedido inválido (formato) é recusado");
await after(A, () => A.room.send("craft", { npc: SMITH.npc, tipo: "xyz", raridade: "common" }));
check("tipo inválido: recusa com mensagem em PT-BR", /arma ou peça/i.test(lastNotice(A)), lastNotice(A));
await after(A, () => A.room.send("craft", { npc: SMITH.npc, tipo: "arma", familia: "espada_1m", raridade: "ancestral" }));
check("raridade fora da tabela: recusa", /raridade/i.test(lastNotice(A)), lastNotice(A));

console.log("\n== 3. Sucesso: arma comum gasta ingredientes e Tostões");
await after(A, () => A.room.send("craft", { npc: SMITH.npc, tipo: "arma", familia: "espada_1m", raridade: "common" }));
check("arma comum sai na mochila", slotOf(A.st.snap, "espada_1m_common") >= 0, lastNotice(A));
check("gasta 3 Ferro, 2 Couro, 2 Essência e 40 Tostões", count(A.st.snap, "mat_ferro_bruto") === 97 && count(A.st.snap, "mat_couro_curtido") === 98 && count(A.st.snap, "mat_essencia_arcana") === 98 && A.st.snap.iron === 50000 - 40, `${count(A.st.snap, "mat_ferro_bruto")}/${count(A.st.snap, "mat_couro_curtido")}/${count(A.st.snap, "mat_essencia_arcana")} iron ${A.st.snap.iron}`);
check("a mensagem de sucesso diz o que foi gasto", /Craftado/.test(lastNotice(A)), lastNotice(A));

console.log("\n== 4. Óbolos de Sangue: épico+ pede Óbolo (e só via craft)");
await after(A, () => A.room.send("craft", { npc: SMITH.npc, tipo: "arma", familia: "espada_1m", raridade: "mythic" }));
check("mítico com 2 Óbolos (pede 8): recusa, nada gasto", /Óbolos/.test(lastNotice(A)) && A.st.snap.obols === 2 && count(A.st.snap, "mat_ferro_bruto") === 97, lastNotice(A));
await after(A, () => A.room.send("craft", { npc: SMITH.npc, tipo: "arma", familia: "espada_1m", raridade: "epic" }));
check("épico com 2 Óbolos: sai e consome os 2 Óbolos", slotOf(A.st.snap, "espada_1m_epic") >= 0 && A.st.snap.obols === 0, lastNotice(A));
const epic = A.st.snap.inv.find((s) => s?.id === "espada_1m_epic");
check("o épico sai com no máximo 3 afixos", (epic?.af?.length ?? 0) <= 3, JSON.stringify(epic?.af ?? []));
await after(A, () => A.room.send("craft", { npc: SMITH.npc, tipo: "arma", familia: "espada_1m", raridade: "epic" }));
check("outro épico sem Óbolos: recusa", /Óbolos de Sangue 0\/2/.test(lastNotice(A)), lastNotice(A));

console.log("\n== 5. Mochila cheia não consome nada");
// a compra só funciona perto do comerciante: vai até ele antes de encher a mochila
await goto(A, MERCHANT.x, MERCHANT.y);
for (let i = 0; i < 40 && freeSlots(A.st.snap) > 0; i++) await after(A, () => A.room.send("shop_buy", { npc: MERCHANT.npc, id: "pocao_de_vida", qty: 10 }));
check("a mochila ficou sem nenhum espaço livre antes do craft", freeSlots(A.st.snap) === 0, `espaços livres ${freeSlots(A.st.snap)}`);
await goto(A, SMITH.x, SMITH.y);
const cheioAntes = JSON.stringify(A.st.snap.inv);
const ironAntes = A.st.snap.iron;
await after(A, () => A.room.send("craft", { npc: SMITH.npc, tipo: "arma", familia: "espada_1m", raridade: "common" }));
check("mochila cheia: recusa com mensagem e nenhum ingrediente sai", /Mochila cheia/.test(lastNotice(A)) && JSON.stringify(A.st.snap.inv) === cheioAntes && A.st.snap.iron === ironAntes, lastNotice(A));

console.log("\n== 6. Falta de ingrediente não consome nada");
await goto(A, MERCHANT.x, MERCHANT.y);
for (let i = 0; i < 3 && count(A.st.snap, "mat_ferro_bruto") > 0; i++) {
  const s = slotOf(A.st.snap, "mat_ferro_bruto");
  await after(A, () => A.room.send("shop_sell", { npc: MERCHANT.npc, slot: s, qty: A.st.snap.inv[s].qty }));
}
check("vendeu todo o ferro (sobrou 0)", count(A.st.snap, "mat_ferro_bruto") === 0, `ferro ${count(A.st.snap, "mat_ferro_bruto")}`);
await goto(A, SMITH.x, SMITH.y);
const semFerroAntes = JSON.stringify(A.st.snap.inv);
await after(A, () => A.room.send("craft", { npc: SMITH.npc, tipo: "arma", familia: "espada_1m", raridade: "common" }));
check("sem ferro: recusa dizendo o que falta, e o inventário fica igual", /Ferro Bruto 0\/3/.test(lastNotice(A)) && JSON.stringify(A.st.snap.inv) === semFerroAntes, lastNotice(A));

console.log("\n== 7. Persistência do item craftado");
await A.room.leave();
await sleep(1500);
const B = await enter(acc); // mesma conta: o personagem volta com a mochila salva
check("reentrar: o épico craftado continua na mochila", slotOf(B.st.snap, "espada_1m_epic") >= 0, "");
await B.room.leave();

const ok = results.filter(Boolean).length;
console.log(`\n${ok}/${results.length} passaram`);
if (ok !== results.length) process.exit(1);
