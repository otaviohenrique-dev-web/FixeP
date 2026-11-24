// Teste curto do rebalance das classes (C-rebalance): (1) acúmulos da Cura Focada do Clérigo, (2) provocar do Guerreiro,
// (3) lentidão da Bola de Fogo do Mago. Os valores vêm do servidor real; nada aqui depende de número de dano exato.
// Uso: SERVER=http://localhost:2993 node test/rebalance.mjs   (servidor de teste com LOOT_TEST=1 API_RATE_MULT=100 TEST_START_ZONE=1; veja run-all.sh)
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
  const name = "Re" + Math.random().toString(10).slice(2, 8);
  const cr = await fetch(`${HTTP}/api/character`, { method: "POST", headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" }, body: JSON.stringify({ name, class: cls }) });
  if (!cr.ok) throw new Error(`criar ${cls}: ${cr.status}`);
  const room = await new Client(WS).joinOrCreate("zone", { token });
  await new Promise((r) => (room.state?.players ? r() : room.onStateChange.once(r)));
  const ev = { hits: [] };
  // golpes na ordem em que chegam (uma única conexão mantém a ordem): a provocação se mede pela sequência, não pelo relógio
  room.onMessage("hit", (m) => ev.hits.push(m));
  room.onMessage("*", () => {});
  await sleep(250);
  return {
    room, ev, id: room.sessionId,
    me: () => room.state.players.get(room.sessionId),
    act: (a, ax, ay) => room.send("act", { a, ax, ay }),
    go: (x, y) => room.send("move_to", { x, y }),
    q: (mode) => room.send("q_mode", { mode }),
  };
}
const arrive = (P, x, y, ms = 6000) => { P.go(x, y); return until(() => Math.hypot(P.me().x - x, P.me().y - y) < 0.35, ms); };

// 1) Clérigo: cada Cura Focada no mesmo aliado soma 1 acúmulo, até 3; a duração renova a cada uso
console.log("\n== 1. Clérigo: acúmulos da Cura Focada (até 3) ==");
{
  const W = await spawn("warrior"), C = await spawn("cleric");
  await Promise.all([arrive(W, 22, 20.5), arrive(C, 19, 20.5)]); // o aliado fica a 3 tiles: a mira no aliado escolhe ele, não o Clérigo
  C.q(1);
  check("troca para Cura Focada fora de combate", await until(() => C.me().qMode === 1, 3000));
  const ally = () => C.room.state.players.get(W.id);
  for (let i = 1; i <= 4; i++) {
    C.act("skill1", W.me().x, W.me().y);
    const want = Math.min(i, 3);
    const ok = await until(() => (ally()?.healStacks ?? 0) === want, 3000, 50);
    check(`uso ${i} no aliado: ${want} acúmulo(s) (teto 3)`, ok, `acúmulos ${ally()?.healStacks}`);
    if (i === 4) { // logo depois do último uso, o tempo restante dos acúmulos está perto dos 8 s
      const left = await until(() => (ally()?.healStackS ?? 0) > 7, 1500, 50) ? ally().healStackS : (ally()?.healStackS ?? 0);
      check("os acúmulos mostram o tempo restante para a UI (≈ 8 s, renovado a cada uso)", left > 7 && left <= 8.1, `${left} s`);
    }
    if (i < 4) await sleep(4300); // recarga da Cura Focada: 4 s
  }
  [W, C].forEach((x) => x.room.leave());
}

// 2) Guerreiro: provocar (Escudo Refletor) puxa o ataque dos inimigos próximos para o Guerreiro, por alguns segundos
console.log("\n== 2. Guerreiro: provocar (E) ==");
{
  const G = await spawn("warrior"), B = await spawn("warrior");
  // o esqueleto e1 (30,16): B (outro guerreiro) está MAIS perto que G (2 tiles contra 6); sem provocar, o esqueleto bateria em B.
  // G fica do outro lado, longe de B, para o golpe do esqueleto contra G não atingir B de raspão.
  await Promise.all([arrive(B, 28, 16), arrive(G, 30, 22)]);
  // a provocação só puxa inimigos dentro de 7 tiles do Guerreiro (tauntRadius); se ele não chegou perto, o teste não mede nada
  const e1 = G.room.state.enemies.get("e1");
  const dG = e1 ? Math.hypot(G.me().x - e1.x, G.me().y - e1.y) : Infinity;
  check("o Guerreiro está perto do esqueleto (dentro dos 7 tiles da provocação)", dG <= 6.5, `distância ${dG.toFixed(2)}`);
  check("antes da provocação o esqueleto bate em B (quem está mais perto)", await until(() => B.ev.hits.some((h) => h.k === "p" && h.id === B.id), 15000, 100));
  G.act("skill3", G.me().x, G.me().y);
  const castAt = G.ev.hits.length; // a partir daqui, só golpes que chegam depois do cast contam
  check("E é aceito: o Guerreiro fica com o buff de defesa", await until(() => G.me().buff === true, 2000));
  // 1) o primeiro golpe da provocação: o esqueleto pode ter começado um golpe em B antes do cast (telégrafo de 0,7 s); pode cair antes do primeiro golpe no Guerreiro
  const firstG = await until(() => G.ev.hits.slice(castAt).some((h) => h.k === "p" && h.id === G.id), 6000, 50);
  check("depois da provocação o esqueleto bate no Guerreiro", firstG);
  const iFirst = G.ev.hits.findIndex((h, i) => i >= castAt && h.k === "p" && h.id === G.id);
  // 2) depois do primeiro golpe no Guerreiro (provocação ainda ativa: dura 4 s e o golpe chega antes disso), nenhum golpe em B por 1 s
  await sleep(1000);
  const toG = G.ev.hits.slice(iFirst).filter((h) => h.k === "p" && h.id === G.id).length;
  const toB = G.ev.hits.slice(iFirst).filter((h) => h.k === "p" && h.id === B.id).length;
  check("durante a provocação os golpes vão para o Guerreiro, não para B", toG >= 1 && toB === 0, `Guerreiro ${toG} · B ${toB}`);
  [G, B].forEach((x) => x.room.leave());
  await sleep(500);
}

// 3) Mago: a Bola de Fogo LENTIFICA o inimigo atingido (controle básico) e o lento acaba depois de 3 s.
// A queimadura saiu da classe (é o afixo "Queimadura ao Acertar", de item): o Mago não queima mais.
console.log("\n== 3. Mago: lentidão da Bola de Fogo ==");
{
  const M = await spawn("mage");
  await arrive(M, 24, 16); // e1 (30,16) a 6 tiles: dentro do alcance da Bola (10)
  const e = M.room.state.enemies.get("e1");
  M.act("skill1", 30, 16);
  check("a Bola de Fogo deixa o inimigo lento (flag slowed na tela)", await until(() => e.slowed === true, 3000, 50));
  check("a Bola de Fogo não acende queimadura (a classe não tem mais queimadura)", e.burning !== true);
  check("o lento acaba depois de 3 s", await until(() => e.slowed === false, 8000, 100));
  M.room.leave();
}

const failed = results.filter((x) => !x).length;
console.log(`\n${results.length - failed}/${results.length} verificações passaram`);
process.exit(failed ? 1 : 0);
