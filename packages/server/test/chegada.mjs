// Teste de ponta a ponta da CHEGADA nas zonas e da bolha de proteção: durante o carregamento (cliente ainda sem mandar "ready") o jogador não leva dano
// nem é perseguido; a contagem só começa no "ready"; a bolha acaba sozinha e estoura se o jogador atacar; o "ready" solta destino preso;
// quem chega por um portão aparece a vários tiles dele e longe de qualquer inimigo.
// Servidor de teste SEM .env e com TEST_START_ZONE=1 (veja o README). Uso: SERVER=http://localhost:3101 node test/chegada.mjs
import { Client } from "colyseus.js";

const HTTP = process.env.SERVER ?? "http://localhost:2999";
const WS = HTTP.replace(/^http/, "ws");
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let fails = 0;
const check = (name, ok, detail = "") => { if (!ok) fails++; console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? "  -> " + detail : ""}`); };
const until = async (fn, ms = 5000, step = 50) => { const t0 = Date.now(); while (Date.now() - t0 < ms) { if (fn()) return true; await sleep(step); } return fn(); };

async function account(cls = "warrior") {
  const { token } = await (await fetch(`${HTTP}/auth/guest`, { method: "POST" })).json();
  const name = "Ch" + Math.random().toString(10).slice(2, 8);
  const cr = await fetch(`${HTTP}/api/character`, { method: "POST", headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" }, body: JSON.stringify({ name, class: cls }) });
  if (!cr.ok) throw new Error(`criar personagem: ${cr.status}`);
  return token;
}
async function join(room, token, load) {
  const r = await new Client(WS).joinOrCreate(room, load ? { token, load: true } : { token });
  await new Promise((ok) => (r.state?.players ? ok() : r.onStateChange.once(ok)));
  const ev = { hits: [], shield: [], travel: [], notice: [], denied: 0, left: null };
  r.onMessage("hit", (m) => { if (m.k === "p" && m.id === r.sessionId) ev.hits.push(m); });
  r.onMessage("shield", (m) => ev.shield.push(m));
  r.onMessage("travel_denied", () => ev.denied++);
  r.onMessage("travel", (m) => ev.travel.push(m));
  r.onMessage("notice", (m) => ev.notice.push(String(m.text)));
  r.onMessage("*", () => {});
  r.onLeave((c) => (ev.left = c));
  await sleep(250);
  return { r, ev, me: () => r.state.players.get(r.sessionId), go: (x, y) => r.send("move_to", { x, y }), act: (a, ax, ay) => r.send("act", { a, ax, ay }), ready: () => r.send("ready", {}) };
}
const near = (p, x, y, d) => Math.hypot(p.x - x, p.y - y) <= d;
const closestEnemy = (P) => { let d = 1e9; P.r.state.enemies.forEach((e) => { if (e.st !== "dead") d = Math.min(d, Math.hypot(e.x - P.me().x, e.y - P.me().y)); }); return d; };

console.log("\n== Entrada sem aviso de carregamento (bots, testes antigos): sem bolha ==");
{
  const A = await join("zone", await account(), false);
  check("sem o aviso de carregamento não há bolha", A.me().shield === false);
  await A.r.leave(true);
}

console.log("\n== Bolha durante o carregamento: sem dano e sem ser perseguido ==");
{
  const tkP = await account("warrior"), tkC = await account("warrior");
  const P = await join("zone", tkP, true); // protegido (carregando)
  const C = await join("zone", tkC, false); // controle: sem bolha, no mesmo lugar
  check("nasce no ponto de nascimento da zona 1", near(P.me(), 12, 31, 0.5), `(${P.me().x}, ${P.me().y})`);
  check("entra já com a bolha (shield=true) enquanto carrega", P.me().shield === true);
  check("o servidor ainda não mandou a contagem (nada de tempo durante o load)", P.ev.shield.length === 0);
  // os dois caminham até o esqueleto e1 (30,16), como se a tela estivesse carregando por muito tempo (sem "ready")
  P.go(28.2, 16); C.go(28.2, 16);
  check("o controle (sem bolha) leva dano do esqueleto", await until(() => C.ev.hits.length > 0, 9000), `golpes ${C.ev.hits.length}`);
  await until(() => near(P.me(), 28.2, 16, 0.4), 9000);
  const hp0 = P.me().hp, hits0 = P.ev.hits.length;
  await sleep(2500);
  check("o jogador na bolha, ao lado do esqueleto, NÃO leva dano", P.ev.hits.length === hits0 && P.me().hp === hp0 && hp0 === P.me().maxHp, `golpes ${P.ev.hits.length}, vida ${P.me().hp}/${P.me().maxHp}`);
  check("e o esqueleto nem o escolhe como alvo", ![...P.r.state.enemies.values()].some((e) => e.targetId === P.r.sessionId));
  check("durante o load a bolha segue ativa (sem contar)", P.me().shield === true && P.ev.shield.length === 0);
  check("o jogador chegou e está móvel durante a espera", near(P.me(), 28.2, 16, 1.5), `(${P.me().x.toFixed(1)}, ${P.me().y.toFixed(1)})`);
  await C.r.leave(true);

  console.log("\n== Ready: a contagem começa agora, dura ARRIVAL_SHIELD_S e acaba sozinha ==");
  P.ready();
  check("o servidor manda a contagem da bolha (9000 ms)", await until(() => P.ev.shield.length > 0, 1500) && P.ev.shield[0].ms === 9000, JSON.stringify(P.ev.shield));
  await sleep(6500);
  check("6,5 s depois a bolha ainda vale e a vida está cheia (ao lado do esqueleto)", P.me().shield === true && P.me().hp === P.me().maxHp, `shield=${P.me().shield} hp=${P.me().hp}`);
  check("a bolha acaba sozinha em cerca de 9 s", await until(() => P.me().shield === false, 4000));
  check("sem a bolha o esqueleto passa a bater", await until(() => P.ev.hits.length > hits0, 7000), `golpes ${P.ev.hits.length}`);
  await P.r.leave(true);
}

console.log("\n== A bolha estoura na hora se o jogador agir; o Ready solta destino preso ==");
{
  const A = await join("zone", await account("warrior"), true);
  A.go(1, 20); // destino pedido durante o load (longe)
  await sleep(300);
  A.ready();
  check("com o Ready a contagem começa", await until(() => A.me().shield === true && A.ev.shield.length > 0, 1500));
  await sleep(250); const x1 = A.me().x; await sleep(500);
  check("e o destino preso é solto: o personagem para, sem arrastar até o destino antigo", Math.abs(A.me().x - x1) < 0.05, `${x1.toFixed(2)} -> ${A.me().x.toFixed(2)}`);
  A.go(A.me().x + 2, A.me().y);
  const x2 = A.me().x;
  check("um novo comando de movimento funciona", await until(() => Math.abs(A.me().x - x2) > 0.8, 1500));
  check("andar não estoura a bolha", A.me().shield === true);
  A.act("attack", A.me().x + 3, A.me().y);
  check("atacar estoura a bolha na hora", await until(() => A.me().shield === false, 600));
  await A.r.leave(true);
}

console.log("\n== Esquiva não estoura a bolha ==");
{
  const A = await join("zone", await account("warrior"), true);
  A.ready(); await sleep(300);
  A.act("dodge", A.me().x + 3, A.me().y);
  await sleep(400);
  check("a esquiva não gasta a bolha", A.me().shield === true);
  await A.r.leave(true);
}

console.log("\n== Travessia: aparece logo à frente do portão, sem inimigo por perto, protegido durante o load ==");
{
  const tk = await account("warrior");
  let A = await join("zone", tk, true);
  A.ready(); await sleep(200);
  A.go(4, 28); // portão para a cidade (oeste)
  check("pisar no portão atravessa", await until(() => A.ev.travel.length > 0, 8000) && A.ev.travel[0].zone === 4, JSON.stringify(A.ev.travel));
  await A.r.leave(true);
  await sleep(500);
  A = await join("zone4", tk, true); // chegada na cidade com carregamento
  check("chega na cidade a 3 tiles do portão (perto, mas fora do gatilho)", near(A.me(), 24, 5, 0.2) && Math.hypot(A.me().x - 24, A.me().y - 2) >= 2.9, `(${A.me().x}, ${A.me().y})`);
  check("e protegido pela bolha desde a chegada", A.me().shield === true);
  A.ready(); await sleep(200);
  A.go(24, 2.6);
  check("anda até o portão da cidade", await until(() => Math.hypot(A.me().x - 24, A.me().y - 2.6) < 0.4, 5000));
  A.r.send("travel", { to: 1 });
  await sleep(600);
  check("recém-chegado: o portão recusa viajar de novo na hora (espera)", A.ev.travel.length === 0 && A.ev.notice.some((t) => t.includes("Recém-chegado")), JSON.stringify(A.ev.notice.slice(-1)));
  let viajou = false;
  for (let i = 0; i < 14 && !viajou; i++) { A.r.send("travel", { to: 1 }); viajou = await until(() => A.ev.travel.length > 0, 1000); }
  check("passada a espera, o mapa-mundo leva à zona 1", viajou && A.ev.travel[0].zone === 1);
  await A.r.leave(true);
  await sleep(500);
  A = await join("zone", tk, true);
  const me = A.me();
  check("chega nas Cinzas no ponto de chegada vindo da cidade (7; 28), a 3 tiles do portão", near(me, 7, 28, 0.2) && Math.hypot(me.x - 4, me.y - 28) >= 2.9, `(${me.x}, ${me.y})`);
  check("segunda travessia em menos de 60 s: sem bolha nova (não se renova a proteção atravessando)", A.me().shield === false);
  check("sem nenhum inimigo a menos de 14 tiles", closestEnemy(A) >= 14, `mais perto ${closestEnemy(A).toFixed(1)}`);
  await sleep(4000); // 4 s "carregando" (sem ready): nada acontece com ele
  check("4 s sem mandar ready: sem dano e vida cheia", A.ev.hits.length === 0 && A.me().hp === A.me().maxHp);
  await A.r.leave(true);
}

console.log("\n== Em combate o portão recusa e o servidor avisa o cliente (que tira a tela de load) ==");
{
  const A = await join("zone", await account("warrior"), false);
  A.go(6, 10); // dentro do aggro do ponto de caça em (5, 4)
  check("o grupo de esqueletos ataca quem chega perto", await until(() => A.me().hp < A.me().maxHp, 20000), `vida ${A.me().hp}/${A.me().maxHp}`);
  A.go(4, 28); // corre para o portão da cidade, ainda em combate
  check("pisar no portão em combate avisa (texto) e manda travel_denied", await until(() => A.ev.notice.some((t) => t.includes("Em combate")) && A.ev.denied > 0, 15000), `notice ${A.ev.notice.slice(-1)} denied ${A.ev.denied}`);
  check("e não atravessa", A.ev.travel.length === 0 && A.ev.left === null);
  await A.r.leave(true);
}

console.log(fails ? `\n${fails} FALHA(S)` : "\nTudo certo.");
process.exit(fails ? 1 : 0);
