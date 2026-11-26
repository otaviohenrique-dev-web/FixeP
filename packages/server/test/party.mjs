// Teste de ponta a ponta do GRUPO (party): convite, pedido para entrar, aceite/recusa/expiração, limite, líder, expulsão,
// XP com bônus, imunidade em PvP, grupo entre zonas, chat do grupo e mensagens inválidas.
// (servidor com TEST_START_ZONE=1: personagens de teste nascem nas Cinzas, onde há inimigos e PvP; a cidade é testada em cidade.mjs)
// Uso: PARTY_TEST=1 nos DOIS lados (servidor e teste; encurta convite para 6 s e tolerância de ausência para 3 s):
//   servidor: PARTY_TEST=1 PGLITE_DIR=memory API_RATE_MULT=50 PORT=2999 ... npx tsx src/index.ts   (sem carregar o .env)
//   teste:    PARTY_TEST=1 SERVER=http://localhost:2999 node test/party.mjs
import { Client } from "colyseus.js";

const HTTP = process.env.SERVER ?? "http://localhost:2999";
const WS = HTTP.replace(/^http/, "ws");
const FAST = process.env.PARTY_TEST === "1";
const INVITE_WAIT = FAST ? 6600 : 31_000; // convite (6 s no teste rápido, 30 s no normal) + folga
const GRACE_WAIT = FAST ? 3600 : 46_000; // tolerância de ausência (3 s / 45 s) + folga
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const results = [];
const check = (name, ok, detail = "") => {
  results.push(ok);
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? "  -> " + detail : ""}`);
};
const until = async (fn, ms = 3000) => { const t0 = Date.now(); while (Date.now() - t0 < ms) { if (fn()) return true; await sleep(60); } return false; };

async function account(cls) {
  const { token } = await (await fetch(`${HTTP}/auth/guest`, { method: "POST" })).json();
  const name = "Pt" + Math.random().toString(10).slice(2, 8);
  const cr = await fetch(`${HTTP}/api/character`, { method: "POST", headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" }, body: JSON.stringify({ name, class: cls }) });
  if (!cr.ok) throw new Error(`criar ${cls}: ${cr.status}`);
  return { token, name };
}

async function enter(acc, roomName = "zone") {
  const room = await new Client(WS).joinOrCreate(roomName, { token: acc.token });
  await new Promise((r) => (room.state?.players ? r() : room.onStateChange.once(r)));
  const ev = { party: null, parties: 0, invites: [], inviteEnd: 0, notices: [], chat: [], xp: [], hits: [], travel: [], left: null };
  room.onMessage("party", (m) => { ev.party = m; ev.parties++; });
  room.onMessage("party_invite", (m) => ev.invites.push(m));
  room.onMessage("party_invite_end", () => ev.inviteEnd++);
  room.onMessage("notice", (m) => ev.notices.push(String(m.text)));
  room.onMessage("party_chat", (m) => ev.chat.push(m));
  room.onMessage("xp", (m) => ev.xp.push(m.amount));
  room.onMessage("hit", (m) => ev.hits.push(m));
  room.onMessage("travel", (m) => ev.travel.push(m));
  room.onLeave((c) => (ev.left = c));
  room.onMessage("*", () => {}); // ignora eventos que o teste não usa (evita avisos)
  room.send("party_sync", {}); // como o cliente: pede o estado depois de registrar os receptores
  const P = {
    room, ev, name: acc.name, acc,
    me: () => room.state.players.get(room.sessionId),
    members: () => (ev.party?.members ?? []).map((m) => m.name),
    leader: () => ev.party?.members.find((m) => m.leader)?.name,
    inGroup: () => (ev.party?.members.length ?? 0) > 0,
    said: (frag) => ev.notices.some((t) => t.includes(frag)),
    invite: (n) => room.send("party_invite", { name: n }),
    join: (n) => room.send("party_join", { name: n }),
    accept: () => room.send("party_accept", {}),
    decline: () => room.send("party_decline", {}),
    leave: () => room.send("party_leave", {}),
    kick: (n) => room.send("party_kick", { name: n }),
    lead: (n) => room.send("party_lead", { name: n }),
  };
  return P;
}
const spawn = async (cls = "warrior") => enter(await account(cls));
/** A convida B e B aceita; devolve quando os dois já veem o grupo com `size` membros */
async function group(A, B, size = 2) {
  const n = B.ev.invites.length;
  A.invite(B.name);
  await until(() => B.ev.invites.length > n);
  B.accept();
  return until(() => A.members().length === size && B.members().length === size);
}

console.log("\n== Convite e aceite ==");
const [A, B, C, D, E] = await Promise.all([spawn("warrior"), spawn("archer"), spawn("cleric"), spawn("warrior"), spawn("warrior")]);
check("todos começam sem grupo", [A, B, C, D, E].every((p) => !p.inGroup() && p.me().party === ""));
A.invite(B.name);
check("o convidado recebe o convite (tipo, quem convidou, validade)", await until(() => B.ev.invites.length === 1) && B.ev.invites[0].kind === "invite" && B.ev.invites[0].from === A.name && B.ev.invites[0].ms > 1000 && B.ev.invites[0].ms <= 30_000, JSON.stringify(B.ev.invites));
check("quem convidou recebe a confirmação e ainda não tem grupo", await until(() => A.said("Convite enviado")) && !A.inGroup());
B.accept();
check("aceitar forma o grupo para os dois (A é o líder)", await until(() => A.members().length === 2 && B.members().length === 2) && A.leader() === A.name && B.leader() === A.name, JSON.stringify(B.members()));
check("o evento traz vida, nível, classe e zona de cada membro", (() => { const m = B.ev.party.members.find((x) => x.name === A.name); return m && m.hp > 0 && m.maxHp > 0 && m.level === 1 && m.cls === "warrior" && m.zone === 1 && m.maxMana > 0 && m.dead === false; })(), JSON.stringify(B.ev.party.members[0]));
check("o convite acaba para quem aceitou (evento de fim)", B.ev.inviteEnd >= 1);
check("a marca de grupo (schema) é igual nos dois e vazia nos outros", await until(() => A.me().party !== "" && A.me().party === B.me().party) && C.me().party === "");

console.log("\n== Recusa ==");
A.invite(C.name);
await until(() => C.ev.invites.length === 1);
C.decline();
check("recusar avisa quem convidou e não cria grupo", await until(() => A.said("recusou")) && !C.inGroup() && C.ev.inviteEnd >= 1);
C.accept();
check("aceitar depois de recusar não faz nada (sem convite pendente)", await until(() => C.said("Nenhum convite")) && !C.inGroup());

console.log("\n== Expiração ==");
A.invite(C.name);
await until(() => C.ev.invites.length === 2);
const endsBefore = C.ev.inviteEnd;
await sleep(INVITE_WAIT);
check("o convite expira sozinho (evento de fim ao convidado, aviso a quem convidou)", C.ev.inviteEnd > endsBefore && A.said("expirou"));
C.accept();
check("aceitar um convite vencido é recusado", await until(() => C.ev.notices.filter((t) => t.includes("Nenhum convite")).length >= 2) && !C.inGroup());

console.log("\n== Limite de tamanho (4) ==");
check("C entra (3 no grupo)", await group(A, C, 3));
check("D entra (4 no grupo)", await group(A, D, 4));
A.invite(E.name);
check("o 5º convite é recusado: grupo cheio", await until(() => A.said("cheio")) && E.ev.invites.length === 0);
E.join(A.name);
check("pedir para entrar num grupo cheio é recusado", await until(() => E.said("está cheio")) && !E.inGroup());
check("todos veem os 4 membros", [A, B, C, D].every((p) => p.members().length === 4));

console.log("\n== Regras de quem convida e quem é convidado ==");
B.invite(E.name);
check("membro que não é líder não pode convidar", await until(() => B.said("Só o líder")) && E.ev.invites.length === 0);
E.invite(B.name);
check("convidar quem já está em grupo é recusado", await until(() => E.said("já está em um grupo")));
E.invite(E.name);
check("auto-convite é recusado", await until(() => E.said("a si mesmo")));
E.invite("NomeQueNaoExiste" + Math.random().toString(10).slice(2, 6));
check("convidar jogador inexistente/offline é recusado", await until(() => E.said("não encontrado")));
A.join(E.name);
check("quem já tem grupo não pode pedir para entrar em outro", await until(() => A.said("já está em um grupo")) && E.ev.invites.length === 0);

console.log("\n== Mensagens inválidas são ignoradas ==");
const junk = [undefined, null, 5, true, [], {}, { name: 5 }, { name: null }, { name: {} }, { name: [] }, { name: "x".repeat(1500) }, { name: "<script>" }, "texto"];
for (const j of junk) for (const t of ["party_invite", "party_join", "party_kick", "party_lead", "party_chat", "party_accept", "party_decline"]) E.room.send(t, j);
await sleep(600);
check("lixo nos pedidos de grupo: servidor de pé, ninguém mudou de grupo", E.ev.left === null && !E.inGroup() && A.members().length === 4);
E.room.send("ping", { t: 1 });
check("e a sala continua respondendo (a conexão segue aberta)", E.ev.left === null && E.room.connection.isOpen);

console.log("\n== Chat do grupo ==");
A.room.send("party_chat", { text: "  oi   <b>grupo</b>\u0000  " });
check("a mensagem chega a todos os membros, limpa (sem tag, com o nome do servidor)", await until(() => [B, C, D].every((p) => p.ev.chat.length === 1)) && B.ev.chat[0].name === A.name && B.ev.chat[0].text === "oi grupo", JSON.stringify(B.ev.chat));
check("quem está fora do grupo não recebe", E.ev.chat.length === 0);
E.room.send("party_chat", { text: "estou de fora" });
check("falar no grupo sem ter grupo é recusado", await until(() => E.said("não está em um grupo")) && A.ev.chat.length === 1);
A.room.send("party_chat", { text: "y".repeat(201) });
check("mensagem longa demais é recusada", await until(() => A.said("longa demais")) && B.ev.chat.length === 1);
for (let i = 0; i < 8; i++) A.room.send("party_chat", { text: "spam " + i });
await sleep(500);
check("o limite de taxa do chat vale também no grupo", A.said("rápido demais") && B.ev.chat.length <= 5, `${B.ev.chat.length} recebidas`);

console.log("\n== Líder: passar a liderança, expulsar, sair ==");
B.lead(C.name);
check("não-líder não consegue passar a liderança", await until(() => B.said("Só o líder")) && A.leader() === A.name);
B.kick(D.name);
await sleep(300);
check("não-líder não consegue expulsar", B.members().length === 4);
A.kick(A.name);
check("o líder não pode se expulsar", await until(() => A.said("use Sair")));
A.lead(B.name);
check("o líder passa a liderança (todos veem o novo líder)", await until(() => [A, B, C, D].every((p) => p.leader() === B.name)));
A.kick(D.name);
await sleep(300);
check("o ex-líder não expulsa mais", D.inGroup());
B.kick(D.name);
check("o líder expulsa um membro: D fica sem grupo e é avisado", await until(() => !D.inGroup() && D.said("expulso") && D.me().party === "") && [A, B, C].every((p) => p.members().length === 3));
B.leave();
check("o líder sai: o membro mais antigo restante (A) vira líder", await until(() => !B.inGroup() && A.leader() === A.name && A.members().length === 2 && C.leader() === A.name), `${A.leader()} ${JSON.stringify(A.members())}`);
check("quem saiu fica sem marca de grupo", await until(() => B.me().party === "" && B.ev.party.members.length === 0, 3000));
A.leave();
check("sobrando um só, o grupo se desfaz para todos", await until(() => !A.inGroup() && !C.inGroup() && C.me().party === "" && C.said("desfeito")));
A.leave();
check("sair sem grupo é recusado", await until(() => A.said("não está em um grupo")));

console.log("\n== Pedir para entrar ==");
check("o grupo pode ser refeito depois (A convida B)", await group(A, B, 2));
C.join(B.name);
check("o dono do grupo recebe o pedido (tipo join) — mesmo sem ser o líder", await until(() => B.ev.invites.some((i) => i.kind === "join" && i.from === C.name)));
B.accept();
check("aceitar o pedido coloca quem pediu no grupo de quem aceitou", await until(() => [A, B, C].every((p) => p.members().length === 3)) && A.leader() === A.name);
C.leave(); A.leave();
await until(() => !A.inGroup() && !B.inGroup() && !C.inGroup());
D.join(E.name);
check("pedido a quem não tem grupo chega como pedido", await until(() => E.ev.invites.some((i) => i.kind === "join" && i.from === D.name)));
E.accept();
check("sem grupo existente, quem aceitou (E) vira o líder e D entra", await until(() => D.members().length === 2 && E.members().length === 2) && D.leader() === E.name && E.leader() === E.name, `${D.leader()}`);
D.decline();
E.leave();
await until(() => !D.inGroup() && !E.inGroup());
{ const n = E.ev.invites.length; D.invite(E.name); await until(() => E.ev.invites.length > n); }
D.join(E.name); // E já tem o convite de D pendente
check("segundo convite ao mesmo alvo com um pendente é recusado", await until(() => D.said("já tem um convite pendente")));
E.decline();
await sleep(300);

console.log("\n== XP dividido no grupo e passante sem nada ==");
// X e Y em grupo; Z no mesmo lugar mas fora do grupo. X mata o esqueleto nível 1 de (31,24): X e Y dividem 25 (20 +25%): 13 cada; Z (passante) não ganha nada.
const [X, Y, Z] = await Promise.all([spawn("warrior"), spawn("warrior"), spawn("warrior")]);
await group(X, Y, 2);
X.room.send("move_to", { x: 29.2, y: 24 });
await until(() => Math.hypot(X.me().x - 29.2, X.me().y - 24) < 0.5, 5000);
for (let i = 0; i < 25 && X.ev.xp.length === 0; i++) {
  let best = null, bd = 99;
  X.room.state.enemies.forEach((e) => { const d = Math.hypot(e.x - X.me().x, e.y - X.me().y); if (e.st !== "dead" && d < bd) { bd = d; best = e; } });
  X.room.send("act", { a: "attack", ax: best?.x ?? 31, ay: best?.y ?? 24 });
  await sleep(650);
}
await sleep(400);
// o dev mudou a regra (XP): esqueleto nível 1 dá enemyXp(1) = 1 XP (XP_MOB_MULT 0.03 x 20 = 0.6, arredondado); antes 20.
check("o XP do abate é DIVIDIDO no grupo: enemyXp(1)=1 x 1,25 (2 membros) / 2 arredonda para 1 cada", X.ev.xp[0] === 1 && Y.ev.xp[0] === 1, `X ${X.ev.xp} Y ${Y.ev.xp}`);
check("quem está por perto, fora do grupo e sem dano relevante NÃO ganha XP", Z.ev.xp.length === 0, `Z ${Z.ev.xp}`);
await Promise.all([X, Y, Z].map((p) => p.room.leave()));

console.log("\n== PvP: só na Arena Sangrenta (zona 5); fora dela é recusado ==");
{
  const Q = await spawn("warrior"); // nasce nas Cinzas (zona 1), onde o PvP não existe
  Q.room.send("pvp", { on: true });
  await sleep(500);
  check("fora da arena o pedido de PvP é recusado (com aviso) e a flag não liga", !Q.me().pvp && Q.said("Arena"), JSON.stringify(Q.ev.notices));
  await Q.room.leave();
}

console.log("\n== PvP: membros do grupo não se ferem (dentro da arena) ==");
// personagens levados à Arena Sangrenta: portal da zona 1 até a cidade, portão até o mapa-mundo, zona 5
async function toArena(acc) {
  const z1 = await new Client(WS).joinOrCreate("zone", { token: acc.token });
  await new Promise((r) => (z1.state?.players ? r() : z1.onStateChange.once(r)));
  let travel = null;
  z1.onMessage("travel", (m) => (travel = m));
  z1.onMessage("*", () => {});
  z1.send("move_to", { x: 4, y: 28 }); // portal da zona 1 que leva à cidade
  await until(() => travel, 20000);
  await z1.leave(true);
  await sleep(300);
  const city = await new Client(WS).joinOrCreate("zone4", { token: acc.token });
  await new Promise((r) => (city.state?.players ? r() : city.onStateChange.once(r)));
  let gate = false, arena = null;
  city.onMessage("world_map", () => (gate = true));
  city.onMessage("travel", (m) => (arena = m));
  city.onMessage("*", () => {});
  city.send("move_to", { x: 24, y: 2 }); // portão de Brasalume
  await until(() => gate, 14000);
  // recém-chegado à cidade: a viagem é recusada até passar a espera (TRAVEL_COOLDOWN_S); insiste a cada segundo
  for (let i = 0; i < 14 && !arena; i++) { city.send("travel", { to: 5 }); await until(() => arena, 1000); }
  await city.leave(true);
  await sleep(300);
}
const arenaAccs = [await account("warrior"), await account("warrior"), await account("warrior")];
await Promise.all(arenaAccs.map(toArena));
const [P1, P2, P3] = await Promise.all(arenaAccs.map((a) => enter(a, "zone5")));
check("os três estão na arena (zona 5)", [P1, P2, P3].every((p) => p.room.state.zoneId === 5));
await group(P1, P2, 2);
for (const p of [P1, P2, P3]) p.room.send("pvp", { on: true });
check("os três entram no PvP", await until(() => [P1, P2, P3].every((p) => p.me().pvp), 6500));
await sleep(300);
const h2 = P2.me().hp, h1 = P1.me().hp;
for (let i = 0; i < 3; i++) { P1.room.send("act", { a: "skill1", ax: P2.me().x, ay: P2.me().y }); P1.room.send("act", { a: "attack", ax: P2.me().x, ay: P2.me().y }); await sleep(700); }
check("P1 (em PvP) não fere o colega de grupo P2 (Golpe e Giro)", P2.me().hp === h2 && !P2.ev.hits.some((h) => h.k === "p" && h.id === P2.room.sessionId), `hp ${h2} -> ${P2.me().hp}`);
// P1 saiu do lugar com a Investida (skill1): P3 anda até ele antes de atacar (alcance corpo a corpo)
P3.room.send("move_to", { x: P1.me().x - 1, y: P1.me().y });
await until(() => Math.hypot(P3.me().x - P1.me().x, P3.me().y - P1.me().y) < 1.5, 4000);
P3.room.send("act", { a: "attack", ax: P1.me().x, ay: P1.me().y });
check("mas um jogador de fora do grupo em PvP continua ferindo (controle)", await until(() => P1.me().hp < h1, 2000), `hp ${h1} -> ${P1.me().hp}; P3 (${P3.me().x}, ${P3.me().y}) P1 (${P1.me().x}, ${P1.me().y}) eventos de dano de P3: ${P3.ev.hits.length}`);
await Promise.all([P1, P2, P3].map((p) => p.room.leave()));

console.log("\n== Grupo entre zonas, ausência e chat ==");
const M = await spawn("warrior"), N = await spawn("cleric");
await group(M, N, 2);
N.room.send("move_to", { x: 4, y: 35 }); // portão para a zona 2 (Floresta, muralha oeste das Cinzas)
check("N pisa no portal e a travessia é aprovada", await until(() => N.ev.travel.length > 0, 9000) && N.ev.travel[0].zone === 2);
check("durante a travessia o grupo continua (M ainda vê N)", M.members().includes(N.name));
await N.room.leave(true);
check("N ausente: M vê o membro com zona 0 e o grupo NÃO é desfeito", await until(() => M.ev.party?.members.find((m) => m.name === N.name)?.zone === 0) && M.members().length === 2);
const N2 = await enter(N.acc, "zone2");
check("N entra na sala da zona 2 e recebe o grupo na hora", await until(() => N2.members().length === 2 && N2.leader() === M.name), JSON.stringify(N2.members()));
check("M vê N na zona 2 (a lista mostra a zona de cada membro)", await until(() => M.ev.party?.members.find((m) => m.name === N.name)?.zone === 2));
check("a marca de grupo (schema) volta na sala nova", N2.me().party === M.me().party && N2.me().party !== "");
N2.room.send("party_chat", { text: "estou na floresta" });
check("o chat do grupo cruza as zonas (N na zona 2 → M na zona 1)", await until(() => M.ev.chat.some((c) => c.text === "estou na floresta" && c.name === N.name)));
M.room.send("party_chat", { text: "te vejo ai" });
check("e na volta (M → N)", await until(() => N2.ev.chat.some((c) => c.text === "te vejo ai")));
await N2.room.leave(true);
check("quem sai do jogo fica ausente...", await until(() => M.ev.party?.members.find((m) => m.name === N.name)?.zone === 0));
await sleep(GRACE_WAIT);
check("...e depois da tolerância sai do grupo (sobrando um só, o grupo some)", !M.inGroup(), JSON.stringify(M.members()));
// quem volta antes do fim da tolerância continua no grupo
const [R, S] = await Promise.all([spawn("warrior"), spawn("archer")]);
await group(R, S, 2);
await S.room.leave(true);
await sleep(800);
const S2 = await enter(S.acc, "zone");
check("recarregar a página (voltar antes do fim da tolerância) mantém o grupo", await until(() => S2.members().length === 2) && R.members().length === 2);
await sleep(GRACE_WAIT);
check("e o tempo de ausência não vale mais depois de voltar", R.members().length === 2 && S2.members().length === 2);

console.log("\n== Convite pendente sobrevive a recarregar a página ==");
const [T, U] = await Promise.all([spawn("warrior"), spawn("warrior")]);
T.invite(U.name);
check("o convite chegou ao alvo antes de ele recarregar", await until(() => U.ev.invites.length === 1));
await U.room.leave(true);
const U2 = await enter(U.acc, "zone");
check("quem recarrega ainda vê o convite pendente (com a validade restante)", await until(() => U2.ev.invites.length === 1) && U2.ev.invites[0].from === T.name && U2.ev.invites[0].ms <= 30_000);
U2.accept();
check("e consegue aceitar", await until(() => T.members().length === 2 && U2.members().length === 2));

const all = [A, B, C, D, E, R, S2, T, U2, M];
await Promise.all(all.map((p) => p.room.leave()));
const failed = results.filter((x) => !x).length;
console.log(`\n${results.length - failed}/${results.length} verificações passaram`);
process.exit(failed ? 1 : 0);
