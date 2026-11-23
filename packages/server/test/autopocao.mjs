// Teste de ponta a ponta da auto-poção: o servidor limita o limiar (0..90, passo 5), grava no banco e devolve ao reconectar;
// com a vida cheia ou desligada, a poção NÃO é bebida sozinha (a quantidade na bolsa não muda).
// Exige ECON_TEST=1 (kit inicial com poções). Uso: SERVER=http://localhost:2999 node test/autopocao.mjs
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
const name = "Ap" + Math.random().toString(10).slice(2, 8);
const cr = await fetch(`${HTTP}/api/character`, { method: "POST", headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" }, body: JSON.stringify({ name, class: "warrior" }) });
if (!cr.ok) throw new Error("criar personagem de teste falhou " + cr.status);

// a bolsa chega pela mensagem "inv" (snapshot completo): guardamos a última para contar as poções
async function enter() {
  const room = await new Client(WS).joinOrCreate("zone", { token });
  await new Promise((r) => (room.state?.players ? r() : room.onStateChange.once(r)));
  const st = { inv: null };
  room.onMessage("inv", (snap) => (st.inv = snap));
  room.send("inv_sync", {});
  await sleep(400);
  return { room, st, me: () => room.state.players.get(room.sessionId) };
}
const potCount = (st) => (st.inv?.inv ?? []).filter((x) => x?.id === "pocao_de_vida").reduce((n, x) => n + x.qty, 0);

console.log("\n== 1. Padrão e limite ==");
let s = await enter();
check("personagem novo começa com a auto-poção desligada (0)", s.me().autoPotAt === 0, `autoPotAt ${s.me().autoPotAt}`);
s.room.send("auto_pot", { at: 250 });
await sleep(300);
check("valor acima do máximo vira 90", s.me().autoPotAt === 90, `autoPotAt ${s.me().autoPotAt}`);
s.room.send("auto_pot", { at: 37 });
await sleep(300);
check("valor fora do passo é arredondado para 35", s.me().autoPotAt === 35, `autoPotAt ${s.me().autoPotAt}`);
s.room.send("auto_pot", { at: -20 });
await sleep(300);
check("valor negativo vira 0 (desligada)", s.me().autoPotAt === 0, `autoPotAt ${s.me().autoPotAt}`);
s.room.send("auto_pot", { at: "lixo" });
await sleep(300);
check("texto no lugar de número é ignorado (mantém 0)", s.me().autoPotAt === 0, `autoPotAt ${s.me().autoPotAt}`);
s.room.send("auto_pot", { at: 60 });
await sleep(300);

console.log("\n== 2. Gravação e volta ao reconectar ==");
s.room.leave();
await sleep(800);
s = await enter();
check("ao reconectar, o limiar gravado (60) volta ao personagem", s.me().autoPotAt === 60, `autoPotAt ${s.me().autoPotAt}`);

console.log("\n== 3. Não gasta poção com a vida cheia ==");
const antes = potCount(s.st);
check("o kit de teste deu poções ao personagem (ECON_TEST)", antes > 0, `poções ${antes}`);
check("personagem começa com a vida cheia", s.me().hp >= s.me().maxHp, `${s.me().hp}/${s.me().maxHp}`);
await sleep(7000); // mais de uma recarga de poção: se a auto-poção ignorasse a vida cheia, já teria bebido
check("com a vida cheia e a auto-poção em 60%, nenhuma poção é bebida", potCount(s.st) === antes, `antes ${antes}, agora ${potCount(s.st)}`);

const falhas = results.filter((r) => !r).length;
console.log(`\n${results.length - falhas}/${results.length} verificações passaram`);
s.room.leave();
await sleep(200);
if (falhas) process.exit(1);
