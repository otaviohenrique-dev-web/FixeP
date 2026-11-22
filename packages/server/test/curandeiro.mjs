// Teste de ponta a ponta do Q do Clérigo: (A) Cura em Área (fraca) e (B) Cura Focada (um aliado, forte), com troca só fora de combate.
// Uso: SERVER=http://localhost:2999 node test/curandeiro.mjs   (servidor de teste sem .env; veja o README)
import { Client } from "colyseus.js";

const HTTP = process.env.SERVER ?? "http://localhost:2999";
const WS = HTTP.replace(/^http/, "ws");
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const results = [];
const check = (name, ok, detail = "") => {
  results.push(ok);
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? "  -> " + detail : ""}`);
};
const until = async (fn, ms = 5000, step = 50) => { const t0 = Date.now(); while (Date.now() - t0 < ms) { if (fn()) return true; await sleep(step); } return fn(); };

async function spawn(cls) {
  const { token } = await (await fetch(`${HTTP}/auth/guest`, { method: "POST" })).json();
  const name = "Cu" + Math.random().toString(10).slice(2, 8);
  const cr = await fetch(`${HTTP}/api/character`, { method: "POST", headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" }, body: JSON.stringify({ name, class: cls }) });
  if (!cr.ok) throw new Error(`criar ${cls}: ${cr.status}`);
  const room = await new Client(WS).joinOrCreate("zone", { token });
  await new Promise((r) => (room.state?.players ? r() : room.onStateChange.once(r)));
  const ev = { hits: [], heal: [], notice: [], left: null };
  room.onMessage("hit", (m) => ev.hits.push(m));
  room.onMessage("heal", (m) => ev.heal.push(m));
  room.onMessage("notice", (m) => ev.notice.push(String(m.text)));
  room.onMessage("*", () => {});
  room.onLeave((c) => (ev.left = c));
  await sleep(250);
  return { room, ev, id: room.sessionId, me: () => room.state.players.get(room.sessionId), act: (a, ax = 25, ay = 20) => room.send("act", { a, ax, ay }), go: (x, y) => room.send("move_to", { x, y }), q: (mode) => room.send("q_mode", { mode }) };
}
const arrive = (P, x, y, ms = 6000) => { P.go(x, y); return until(() => Math.hypot(P.me().x - x, P.me().y - y) < 0.35, ms); };

console.log("\n== A. Cura em Área (padrão): cura todos em volta, mas pouco ==");
{
  const W = await spawn("warrior"), C = await spawn("cleric");
  const e = W.room.state.enemies.get("e1"); // (30,16)
  check("o Clérigo nasce com o Q em 'cura em área' (qMode 0)", C.me().qMode === 0);
  await Promise.all([arrive(W, 25.9, 16.5), arrive(C, 22.5, 17.5)]); // o Clérigo fica fora do aggro do esqueleto (7 tiles) e a 3,5 do guerreiro (dentro da cura de 4): só o guerreiro apanha
  check("o guerreiro apanha do esqueleto (perde mais de 20 de vida)", await until(() => W.me().hp <= W.me().maxHp - 20, 15000, 100), `hp ${W.me().hp}/${W.me().maxHp}`);
  C.act("skill1", C.me().x, C.me().y);
  check("a cura em área chega ao aliado com 16 de vida (e sem `from`)", await until(() => C.ev.heal.some((h) => h.id === W.id && h.amount === 16 && !h.from) || W.ev.heal.some((h) => h.id === W.id && h.amount === 16 && !h.from), 1500), JSON.stringify(W.ev.heal.at(-1)));
  check("custa 26 de Mana", await until(() => C.me().mana >= 90 && C.me().mana <= 98, 1500, 50), `mana ${C.me().mana}`); // o estado chega por sincronização: espera em vez de ler na hora
  // em combate (o Clérigo acerta o esqueleto): a troca do Q é recusada
  C.act("attack", e.x, e.y);
  await until(() => C.ev.hits.some((h) => h.k === "e" && h.by === C.id), 3000);
  C.ev.notice.length = 0;
  C.q(1);
  await sleep(400);
  check("trocar o Q em combate é recusado, com o aviso", C.me().qMode === 0 && C.ev.notice.some((t) => /fora de combate/i.test(t)), JSON.stringify(C.ev.notice));
  [W, C].forEach((x) => x.room.leave());
}

console.log("\n== B. Cura Focada: um aliado só, bem mais forte ==");
{
  const W = await spawn("warrior"), C = await spawn("cleric");
  C.ev.notice.length = 0;
  C.q(1);
  check("fora de combate a troca é aceita (qMode 1) e o jogador é avisado", await until(() => C.me().qMode === 1, 1500) && C.ev.notice.some((t) => /Focada/i.test(t)), `qMode=${C.me().qMode}`);
  C.q(2); C.q("x"); C.q(null);
  await sleep(200);
  check("valores inválidos são ignorados", C.me().qMode === 1);
  const W2 = await spawn("warrior");
  W2.q(1); await sleep(300);
  check("quem não é Clérigo não troca (aviso)", W2.me().qMode === 0 && W2.ev.notice.some((t) => /Cl[ée]rigo/i.test(t)), JSON.stringify(W2.ev.notice));
  W2.room.leave();

  await Promise.all([arrive(W, 27.3, 23.6), arrive(C, 24, 22.5)]); // o esqueleto e2 (31,24) bate só no guerreiro; o Clérigo fica fora do alcance dele
  check("o guerreiro apanha (perde mais de 40 de vida)", await until(() => W.me().hp <= W.me().maxHp - 40, 20000, 100), `hp ${W.me().hp}/${W.me().maxHp}`);
  const m0 = C.me().mana, hp0 = W.me().hp;
  C.act("skill1", W.me().x, W.me().y);
  check("a cura focada acerta o aliado mirado, vinda do Clérigo (`from`)", await until(() => C.ev.heal.some((h) => h.id === W.id && h.from === C.id), 1500), JSON.stringify(C.ev.heal.at(-1)));
  const h = C.ev.heal.find((x) => x.id === W.id && x.from === C.id);
  check("cura bem mais que a de área (≥ 40, até 65)", !!h && h.amount >= 40 && h.amount <= 65, `+${h?.amount}`);
  check("custa 30 de Mana e só UMA pessoa é curada", C.me().mana <= m0 - 25 && C.ev.heal.filter((x) => x.from === C.id).length === 1, `mana ${m0}->${C.me().mana}`);
  check("a vida do aliado sobe de verdade", W.me().hp > hp0 || W.me().hp === W.me().maxHp, `${hp0} -> ${W.me().hp}`);
  // mira longe do aliado (a mais de 2,2 tiles dele): o alvo vira o próprio Clérigo (cheio de vida: nada a curar) e o aliado NÃO é curado
  await sleep(4300);
  const n = C.ev.heal.length;
  C.act("skill1", C.me().x - 3, C.me().y);
  await sleep(500);
  check("mirando longe do aliado ele NÃO é curado (alvo = o próprio Clérigo)", !C.ev.heal.slice(n).some((x) => x.id === W.id));
  // longe demais (fora do alcance de 9 tiles): cai para o próprio Clérigo
  [W, C].forEach((x) => x.room.leave());
}

const failed = results.filter((x) => !x).length;
console.log(`\n${results.length - failed}/${results.length} verificações passaram`);
process.exit(failed ? 1 : 0);
