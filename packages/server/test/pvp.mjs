// Teste de ponta a ponta do modo PvP: canalização (só parado e sem dano recente), cancelamento por mover/agir/dano, regras de quem pode ser alvo e saída do modo.
// Uso: SERVER=http://localhost:2999 node test/pvp.mjs   (servidor de teste sem carregar o .env)
import { Client } from "colyseus.js";

const HTTP = process.env.SERVER ?? "http://localhost:2999";
const WS = HTTP.replace(/^http/, "ws");
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const results = [];
const check = (name, ok, detail = "") => {
  results.push(ok);
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? "  -> " + detail : ""}`);
};

async function spawn(cls) {
  const { token } = await (await fetch(`${HTTP}/auth/guest`, { method: "POST" })).json();
  const name = "Pv" + Math.random().toString(36).slice(2, 8);
  const cr = await fetch(`${HTTP}/api/character`, { method: "POST", headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" }, body: JSON.stringify({ name, class: cls }) });
  if (!cr.ok) throw new Error(`criar ${cls}: ${cr.status}`);
  const room = await new Client(WS).joinOrCreate("zone", { token });
  await new Promise((r) => (room.state?.players ? r() : room.onStateChange.once(r)));
  const ev = { swing: [], notice: [], pvp: [], why: [], hits: [], left: null };
  room.onMessage("pvp", (m) => { ev.pvp.push(m.s); if (m.why) ev.why.push(m.why); });
  room.onMessage("hit", (m) => ev.hits.push(m));
  room.onMessage("swing", (m) => ev.swing.push(m));
  room.onMessage("notice", (m) => ev.notice.push(String(m.text)));
  room.onLeave((c) => (ev.left = c));
  const me = () => room.state.players.get(room.sessionId);
  const act = (a, ax = 25, ay = 20) => room.send("act", { a, ax, ay });
  const mine = (a) => ev.swing.filter((s) => s.id === room.sessionId && s.a === a).length;
  return { room, ev, me, act, mine };
}

const until = async (fn, ms) => { const t0 = Date.now(); while (Date.now() - t0 < ms) { if (fn()) return true; await sleep(100); } return false; };
const aimAt = (att, tgt) => att.act("attack", tgt.me().x, tgt.me().y);
const CH = 5300; // canalização de 5 s + folga

console.log("\n== Entrar no modo: canalização sem dano conclui ==");
{
  const A = await spawn("warrior");
  check("começa fora do PvP e sem canalizar", A.me().pvp === false && A.me().pvpChan === 0);
  A.room.send("pvp", { on: "sim" }); A.room.send("pvp", { on: 1 }); A.room.send("pvp", {}); A.room.send("pvp", null);
  await sleep(300);
  check("payload inválido é ignorado", A.me().pvpChan === 0 && !A.me().pvp);
  A.room.send("pvp", { on: true });
  await sleep(500);
  check("pedir PvP inicia a canalização (pvpChan=1) e ainda não está em PvP", A.me().pvpChan === 1 && !A.me().pvp && A.ev.pvp.includes("start"));
  await sleep(3500);
  check("aos ~4 s ainda canalizando (não entra antes do tempo)", A.me().pvpChan === 1 && !A.me().pvp);
  check("conclui em ~5 s: pvp=true e canalização zerada", await until(() => A.me().pvp && A.me().pvpChan === 0, 2500) && A.ev.pvp.includes("on"));

  console.log("\n== Sair do modo: também canaliza 5 s ==");
  A.room.send("pvp", { on: false });
  await sleep(1000);
  check("saindo: pvpChan=2 e ainda em PvP", A.me().pvpChan === 2 && A.me().pvp);
  check("conclui: pvp=false", await until(() => !A.me().pvp && A.me().pvpChan === 0, CH) && A.ev.pvp.includes("off"));
  A.room.send("pvp", { on: false }); await sleep(300);
  check("pedir sair estando fora não faz nada", A.me().pvpChan === 0);

  console.log("\n== Pedir o contrário no meio da canalização cancela (sem aviso de dano) ==");
  A.room.send("pvp", { on: true }); await sleep(600);
  A.room.send("pvp", { on: false }); await sleep(400);
  check("cancelado pelo próprio jogador", A.me().pvpChan === 0 && !A.me().pvp && A.ev.pvp.includes("stop"));
  A.room.leave();
}

console.log("\n== Só canaliza PARADO: mover-se ou agir cancela; pedir andando é recusado ==");
{
  const A = await spawn("warrior");
  A.room.send("move_to", { x: 26, y: 26 });
  await sleep(300);
  A.ev.notice.length = 0;
  A.room.send("pvp", { on: true });
  await sleep(300);
  check("pedir PvP andando é recusado, com o motivo (parado)", A.me().pvpChan === 0 && A.ev.notice.some((t) => /parado/i.test(t)), JSON.stringify(A.ev.notice));
  A.room.send("move_to", { x: A.me().x, y: A.me().y }); // para
  await sleep(500);
  A.room.send("pvp", { on: true });
  await sleep(500);
  check("parado, a canalização começa", A.me().pvpChan === 1);
  A.room.send("move_to", { x: A.me().x + 2, y: A.me().y });
  check("mover-se cancela (evento cancel, motivo 'move')", await until(() => A.ev.pvp.includes("cancel") && A.ev.why.includes("move"), 1500));
  await until(() => A.me().pvpChan === 0, 800);
  check("sem entrar no PvP e sem canalização", A.me().pvpChan === 0 && !A.me().pvp);
  await sleep(1500); // chega ao destino
  A.room.send("pvp", { on: true }); await sleep(600);
  check("parado de novo: canaliza", A.me().pvpChan === 1);
  A.ev.why.length = 0;
  A.act("attack", A.me().x + 3, A.me().y);
  check("agir (atacar) cancela (motivo 'act')", await until(() => A.ev.why.includes("act"), 1500));
  await until(() => A.me().pvpChan === 0, 800);
  await sleep(CH);
  check("continua fora do PvP depois de passar o tempo", !A.me().pvp && A.me().pvpChan === 0);
  A.room.leave();
}

console.log("\n== Dano de inimigo: cancela e bloqueia um novo pedido por alguns segundos ==");
{
  const A = await spawn("warrior");
  A.room.send("move_to", { x: 27, y: 16 }); // perto do esqueleto de (30,16): ele ataca em poucos segundos
  const hurt = await until(() => A.ev.hits.some((h) => h.k === "p" && h.id === A.room.sessionId), 9000);
  check("o esqueleto acerta o jogador", hurt);
  A.room.send("move_to", { x: A.me().x, y: A.me().y }); // fica parado
  await sleep(300);
  A.ev.notice.length = 0;
  A.room.send("pvp", { on: true });
  await sleep(400);
  check("logo depois de tomar dano o pedido é recusado, com o motivo (dano recente)", A.me().pvpChan === 0 && A.ev.notice.some((t) => /dano/i.test(t)), JSON.stringify(A.ev.notice));
  check("e não entra no PvP", !A.me().pvp);
  A.room.leave();
}

console.log("\n== Depois de 5 s sem dano o pedido é aceito (parado) ==");
{
  const A = await spawn("warrior");
  A.room.send("pvp", { on: true }); await sleep(500);
  check("sem dano recente e parado: canaliza", A.me().pvpChan === 1);
  A.room.leave();
}

console.log("\n== Dois em PvP se machucam; habilidade de outro jogador cancela a canalização ==");
{
  const [A, B, C] = await Promise.all([spawn("warrior"), spawn("warrior"), spawn("cleric")]);
  A.room.send("pvp", { on: true }); B.room.send("pvp", { on: true });
  check("A e B entram no PvP", await until(() => A.me().pvp && B.me().pvp, CH + 500));
  check("C (nunca pediu) está fora", !C.me().pvp);

  // C canaliza para entrar; A e B (em PvP) o atacam: C não é alvo, nada cancela
  C.room.send("pvp", { on: true }); await sleep(400);
  const cHp = C.me().hp;
  A.act("skill2", C.me().x, C.me().y); await sleep(800); // Correntes (área)
  aimAt(A, C); await sleep(700);
  check("jogador fora do PvP não recebe dano de quem está em PvP (Correntes e Golpe)", C.me().hp === cHp, `hp ${cHp} -> ${C.me().hp}`);
  check("e a canalização dele NÃO é cancelada por isso", C.me().pvpChan === 1 && !C.ev.pvp.includes("cancel"));
  check("nenhum evento de dano com alvo C", !C.ev.hits.some((h) => h.k === "p" && h.id === C.room.sessionId));

  // A (guerreiro) acerta B: ambos em PvP
  const bHp = B.me().hp;
  aimAt(A, B); await sleep(500);
  check("A em PvP fere B em PvP", B.me().hp < bHp, `hp ${bHp} -> ${B.me().hp}`);
  const aHp = A.me().hp;
  aimAt(B, A); await sleep(500);
  check("B fere A de volta", A.me().hp < aHp, `hp ${aHp} -> ${A.me().hp}`);
  check("o evento de dano traz quem causou", A.ev.hits.some((h) => h.k === "p" && h.id === B.room.sessionId && h.by === A.room.sessionId));

  // B começa a sair; A o atinge: cancela
  B.room.send("pvp", { on: false }); await sleep(600);
  check("B tomou dano há pouco: o pedido de saída é recusado (aguarde sem apanhar)", B.me().pvpChan === 0 && B.me().pvp && B.ev.notice.some((t) => /dano/i.test(t)), JSON.stringify(B.ev.notice));
  await sleep(5300); // 5 s sem dano e parado
  B.room.send("pvp", { on: false }); await sleep(600);
  check("B saindo: canalizando", B.me().pvpChan === 2);
  aimAt(A, B);
  check("habilidade de outro jogador em PvP cancela a canalização de saída (motivo 'damage')", await until(() => B.ev.pvp.includes("cancel") && B.ev.why.includes("damage"), 1500) && B.me().pvpChan === 0);
  await sleep(CH);
  check("B continua em PvP (a saída foi interrompida)", B.me().pvp);

  // C conclui a entrada e agora também é alvo
  check("C conclui a entrada sem dano", await until(() => C.me().pvp, 3000));
  const cHp2 = C.me().hp;
  aimAt(A, C); await sleep(500);
  check("depois de entrar, C também recebe dano de A", C.me().hp < cHp2, `hp ${cHp2} -> ${C.me().hp}`);

  // morte em PvP: respawn normal e sem perda
  let died = false; C.room.onMessage("died", (m) => { if (m.id === C.room.sessionId) died = true; });
  for (let i = 0; i < 30 && !C.me().dead; i++) { A.act("ultimate", C.me().x, C.me().y); A.act("attack", C.me().x, C.me().y); await sleep(700); }
  check("alvo derrubado em PvP aparece como morto", C.me().dead && died);
  check("renasce (respawn normal) com a vida cheia", await until(() => !C.me().dead, 10_000) && C.me().hp === C.me().maxHp);
  [A, B, C].forEach((x) => x.room.leave());
}

console.log("\n== Projétil: só acerta quem está em PvP ==");
{
  const [R, P, N] = await Promise.all([spawn("archer"), spawn("warrior"), spawn("warrior")]);
  R.room.send("pvp", { on: true }); P.room.send("pvp", { on: true });
  await until(() => R.me().pvp && P.me().pvp, CH + 500);
  await sleep(300);
  const pHp = P.me().hp, nHp = N.me().hp;
  R.act("attack", P.me().x + 3, P.me().y); await sleep(600); // mira para a frente (todos nascem no mesmo ponto)
  check("flecha acerta quem está em PvP", P.me().hp < pHp, `hp ${pHp} -> ${P.me().hp}`);
  check("quem está fora do PvP, no mesmo ponto, não é ferido", N.me().hp === nHp);
  [R, P, N].forEach((x) => x.room.leave());
}

const failed = results.filter((x) => !x).length;
console.log(`\n${results.length - failed}/${results.length} verificações passaram`);
process.exit(failed ? 1 : 0);
