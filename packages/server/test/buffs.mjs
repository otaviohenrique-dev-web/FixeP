// Buffs próprios (Evt.Buffs, só para o dono): o buff aparece ao usar a skill, com duração coerente, e some depois.
// Cobre: Escudo Refletor do Guerreiro (Refletor + Provocação), Cura em Área do Clérigo (Guarda) e Cura Focada (acúmulos).
// Servidor de teste sem .env (veja o README). Uso: SERVER=http://localhost:2993 node test/buffs.mjs
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
  const name = "Bf" + Math.random().toString(10).slice(2, 8);
  const cr = await fetch(`${HTTP}/api/character`, { method: "POST", headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" }, body: JSON.stringify({ name, class: cls }) });
  if (!cr.ok) throw new Error(`criar ${cls}: ${cr.status}`);
  const room = await new Client(WS).joinOrCreate("zone", { token });
  await new Promise((r) => (room.state?.players ? r() : room.onStateChange.once(r)));
  const P = { room, list: null, at: 0 };
  room.onMessage("buffs", (m) => { P.list = m.list; P.at = Date.now(); });
  room.onMessage("*", () => {});
  await sleep(250);
  P.me = () => room.state.players.get(room.sessionId);
  P.get = (id) => (P.list ?? []).find((b) => b.id === id);
  P.act = (a, ax, ay) => room.send("act", { a, ax: ax ?? P.me().x, ay: ay ?? P.me().y });
  return P;
}

console.log("\n== Guerreiro: Escudo Refletor aparece com Provocação, e some depois de ~5 s ==");
{
  const W = await spawn("warrior");
  await sleep(400);
  check("sem buffs no começo (lista vazia, nada de Refletor)", (W.list ?? []).length === 0, `lista ${JSON.stringify(W.list)}`);
  W.act("skill3");
  const got = await until(() => W.get("reflect"), 2000);
  check("ao usar o Escudo Refletor, o buff \"reflect\" chega ao dono", got);
  const r = W.get("reflect");
  check("duração coerente: ~5 s restantes logo após o uso", !!r && r.ate >= 4 && r.ate <= 5.3, `ate ${r?.ate}`);
  check("a Provocação (4 s) também aparece", !!W.get("provoke") && W.get("provoke").ate >= 3 && W.get("provoke").ate <= 4.3, `ate ${W.get("provoke")?.ate}`);
  check("o buff de Refletor não traz acúmulos (sem campo stacks)", r && r.stacks === undefined);
  const first = r?.ate ?? 0;
  await sleep(1500);
  const r2 = W.get("reflect");
  check("o tempo restante desce com o relógio (menos ~1,5 s)", !!r2 && r2.ate < first - 1, `${first} -> ${r2?.ate}`);
  const gone = await until(() => !W.get("reflect"), 6000, 100);
  check("o Refletor some depois do tempo", gone);
  check("a Provocação some junto (não sobra buff velho)", await until(() => !W.get("provoke"), 2000, 100));
  check("a lista volta a vazia", (W.list ?? []).length === 0, `lista ${JSON.stringify(W.list)}`);
  W.room.leave();
}

console.log("\n== Clérigo: Cura em Área dá a Guarda a quem recebe; Cura Focada soma acúmulos ==");
{
  const C = await spawn("cleric");
  await sleep(300);
  // o Q do Clérigo tem uma recarga só: primeiro a Cura Focada (acúmulos), depois a Cura em Área (guarda)
  C.room.send("q_mode", { mode: 1 }); // Q passa a ser Cura Focada (fora de combate)
  await sleep(300);
  C.act("skill1", C.me().x, C.me().y); // sem ninguém na mira: cura a si mesmo
  check("Cura Focada: aparece o buff de acúmulo com 1 stack", await until(() => C.get("heal_stacks")?.stacks === 1, 2000), `${JSON.stringify(C.get("heal_stacks"))}`);
  const h1 = C.get("heal_stacks");
  check("acúmulo dura ~8 s", !!h1 && h1.ate >= 7 && h1.ate <= 8.3, `ate ${h1?.ate}`);
  await sleep(4200); // recarga da Cura Focada
  C.act("skill1", C.me().x, C.me().y);
  check("segundo uso no mesmo alvo sobe para 2 acúmulos", await until(() => C.get("heal_stacks")?.stacks === 2, 2000), `${JSON.stringify(C.get("heal_stacks"))}`);
  check("o segundo uso renova o tempo (volta para ~8 s)", !!C.get("heal_stacks") && C.get("heal_stacks").ate >= 7, `ate ${C.get("heal_stacks")?.ate}`);
  check("os acúmulos somem depois do tempo", await until(() => !C.get("heal_stacks"), 10000, 100));

  C.room.send("q_mode", { mode: 0 }); // volta para a Cura em Área
  await sleep(300);
  C.act("skill1");
  check("Cura em Área: o buff \"guard\" aparece em quem foi curado (o próprio Clérigo)", await until(() => C.get("guard"), 2000));
  const g = C.get("guard");
  check("Guarda dura ~3 s", !!g && g.ate >= 2 && g.ate <= 3.3, `ate ${g?.ate}`);
  check("a Guarda some depois", await until(() => !C.get("guard"), 5000, 100));
  C.room.leave();
}

const ok = results.every(Boolean);
console.log(`\n${results.filter(Boolean).length}/${results.length} verificações passaram`);
process.exit(ok ? 0 : 1);
