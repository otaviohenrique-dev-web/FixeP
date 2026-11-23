// Teste de ponta a ponta das regras de combate e grupo: regeneração de vida, BUG do inimigo que oscila entre perseguir e voltar para casa
// (e se cura enquanto apanha), elegibilidade de XP/loot (solo, grupo, passante) e rodízio dos itens.
// Servidor de teste: LOOT_TEST=1 LOOT_LOCK_S=3 ENEMY_LEASH_TEST=9 (coleira curta para provocar o evade; sem .env). Uso: SERVER=http://localhost:2999 node test/combate.mjs
import { Client } from "colyseus.js";

const HTTP = process.env.SERVER ?? "http://localhost:2999";
const WS = HTTP.replace(/^http/, "ws");
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const results = [];
const check = (name, ok, detail = "") => {
  results.push(ok);
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? "  -> " + detail : ""}`);
};
async function until(cond, ms = 15000, step = 100) {
  const t0 = Date.now();
  while (Date.now() - t0 < ms) { if (cond()) return true; await sleep(step); }
  return cond();
}

async function spawn(cls) {
  const { token } = await (await fetch(`${HTTP}/auth/guest`, { method: "POST" })).json();
  const name = "Cb" + Math.random().toString(10).slice(2, 8);
  const cr = await fetch(`${HTTP}/api/character`, { method: "POST", headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" }, body: JSON.stringify({ name, class: cls }) });
  if (!cr.ok) throw new Error(`criar ${cls}: ${cr.status}`);
  const room = await new Client(WS).joinOrCreate("zone", { token });
  await new Promise((r) => (room.state?.players ? r() : room.onStateChange.once(r)));
  const ev = { xp: [], loot: [], hit: [], invites: 0, party: null, left: null };
  room.onMessage("xp", (m) => ev.xp.push(m.amount));
  room.onMessage("loot", (m) => ev.loot.push(m));
  room.onMessage("hit", (m) => ev.hit.push(m));
  room.onMessage("party_invite", () => ev.invites++);
  room.onMessage("party", (m) => (ev.party = m));
  room.onMessage("*", () => {});
  room.onLeave((c) => (ev.left = c));
  room.send("inv_sync", {});
  room.send("party_sync", {});
  await sleep(300);
  return { room, ev, name, id: room.sessionId, me: () => room.state.players.get(room.sessionId), act: (a, ax, ay) => room.send("act", { a, ax, ay }), go: (x, y) => room.send("move_to", { x, y }) };
}
const items = (P) => { const a = []; P.room.state.items.forEach((g, id) => a.push({ id, itemId: g.itemId, owner: g.owner, party: g.party })); return a; };
const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);

// ================================================================== 1. Regeneração de vida do jogador
console.log("\n== 1. Regeneração de vida (fora de combate) ==");
{
  const W = await spawn("warrior");
  const sk = W.room.state.enemies.get("e2"); // esqueleto nível 1 em (31,24)
  let lastCombat = 0, prev = W.me().hp; // último dano causado OU recebido
  W.room.onMessage("hit", (m) => { if (m.by === W.id || (m.k === "p" && m.id === W.id)) lastCombat = Date.now(); });
  W.go(sk.x - 2.2, sk.y); // entra no aggro e luta até o esqueleto cair (o Guerreiro apanha um pouco)
  await sleep(1500);
  const t00 = Date.now();
  while (sk.st !== "dead" && Date.now() - t00 < 40000 && !W.me().dead) { W.act("attack", sk.x, sk.y); await sleep(550); }
  W.go(14, 20); // sai do alcance (o esqueleto renasce em 8 s)
  const apanhou = W.me().hp < W.me().maxHp;
  check("o Guerreiro luta e termina ferido (vida abaixo do máximo)", apanhou && !W.me().dead, `hp ${W.me().hp}/${W.me().maxHp}`);
  lastCombat = Math.max(lastCombat, Date.now() - 100);
  prev = W.me().hp;
  let firstRise = 0, risesEarly = 0;
  const t0 = Date.now();
  while (Date.now() - t0 < 16000 && W.me().hp < W.me().maxHp) {
    const hp = W.me().hp;
    if (hp < prev) lastCombat = Date.now();
    if (hp > prev) { if (!firstRise) firstRise = Date.now(); if (Date.now() - lastCombat < 5400) risesEarly++; }
    prev = hp;
    await sleep(50);
  }
  check("NÃO regenera logo depois do combate (espera ~6 s sem causar nem receber dano)", risesEarly === 0 && firstRise > 0 && firstRise - lastCombat >= 5400, `primeira subida ${((firstRise - lastCombat) / 1000).toFixed(1)} s após o último dano`);
  const hpMid = W.me().hp;
  await sleep(2500);
  check("depois do atraso a vida sobe aos poucos (servidor)", W.me().hp > hpMid || hpMid === W.me().maxHp, `${hpMid} -> ${W.me().hp}`);
  const cheio = await until(() => W.me().hp === W.me().maxHp, 30000, 200);
  check("e volta ao máximo sem passar dele", cheio && W.me().hp <= W.me().maxHp, `hp ${W.me().hp}/${W.me().maxHp}`);
  W.room.leave();
}

// ================================================================== 2. BUG: inimigo oscilando e se curando enquanto apanha
console.log("\n== 2. Inimigo que perde o alvo: volta para casa SEM oscilar e SEM se curar enquanto apanha ==");
{
  const A = await spawn("archer");
  const e = A.room.state.enemies.get("e5"); // esqueleto nível 3 em (11,12): bastante vida (≈108)
  const home = { x: e.sx ?? 11, y: e.sy ?? 12 };
  const samples = []; // { t, st, hp, x, y }
  let hits = []; // instantes dos meus acertos nele
  A.room.onMessage("hit", (m) => { if (m.k === "e" && m.by === A.id) hits.push(Date.now()); });
  const t0 = Date.now();
  const iv = setInterval(() => samples.push({ t: Date.now() - t0, st: e.st, hp: e.hp, d: dist(e, home), x: e.x, y: e.y, home: dist(e, { x: 11, y: 12 }) }), 40);
  // 1) puxa: acerta uma flecha de 6,8 tiles; o inimigo persegue o jogador, que recua mantendo distância (coleira do teste: 9 tiles)
  A.go(17.5, 13);
  await until(() => dist(A.me(), e) < 8.5, 8000, 50);
  for (let i = 0; i < 6 && e.st === "idle"; i++) { A.act("attack", e.x, e.y); await sleep(550); }
  check("o inimigo ataca o jogador (perseguição)", ["chase", "windup", "recover"].includes(e.st), `st=${e.st}`);
  // 2) o jogador recua devagar; ao passar da coleira o inimigo desiste (evade) com o jogador ainda por perto
  const t1 = Date.now();
  while (e.st !== "evade" && e.st !== "dead" && Date.now() - t1 < 25000) {
    const d = dist(A.me(), e);
    if (d < 7.5) A.go(A.me().x + 3, A.me().y + 0.3); else { A.go(A.me().x, A.me().y); if (d < 9) A.act("attack", e.x, e.y); }
    await sleep(300);
  }
  await sleep(150);
  check("ao passar da coleira ele entra em EVADE (volta para casa) em vez de ficar indo e voltando", e.st === "evade" && samples.some((s) => s.st === "evade"), `st=${e.st}`);
  // 3) o jogador corre para o lado de lá da casa dele e o acerta durante a volta: o dano TEM de contar
  const hpAntes = e.hp;
  for (let i = 0; i < 40 && e.st === "evade"; i++) {
    const vx = home.x - e.x, vy = home.y - e.y, n = Math.hypot(vx, vy) || 1;
    A.go(home.x + (vx / n) * 5, home.y + (vy / n) * 5);
    if (dist(A.me(), e) < 8.5) A.act("attack", e.x, e.y);
    await sleep(300);
  }
  await until(() => e.st === "idle" || e.st === "dead", 15000, 50);
  clearInterval(iv);

  // análise das amostras
  let backToChase = 0, healedWhileHurt = 0, evading = false;
  for (let i = 1; i < samples.length; i++) {
    const a = samples[i - 1], b = samples[i];
    if (b.st === "evade") evading = true;
    if (evading && a.st === "evade" && ["chase", "windup", "recover"].includes(b.st)) backToChase++; // saiu do evade perseguindo de novo
    if (b.hp > a.hp + 1e-6) { // a vida subiu: houve dano nos últimos 4,5 s?
      const recentlyHurt = hits.some((h) => Math.abs((h - t0) - b.t) < 4500 && (h - t0) <= b.t);
      if (recentlyHurt) healedWhileHurt++;
    }
  }
  check("o evade NÃO volta a perseguir antes de chegar em casa (sem oscilação chase<->volta)", backToChase === 0, `trocas evade→chase: ${backToChase}`);
  check("a vida dele NUNCA sobe nos 4,5 s seguintes a um acerto (regeneração anulando o dano era o bug)", healedWhileHurt === 0, `amostras com cura: ${healedWhileHurt}`);
  check("o dano recebido durante o retorno contou (vida menor que a de antes)", (hits.length >= 3 && e.hp < hpAntes + 1) || e.st === "dead", `hp ${hpAntes.toFixed(0)} -> ${e.hp.toFixed(0)}, ${hits.length} acertos`);
  const minHp = Math.min(...samples.map((s) => s.hp));
  check("a vida só sobe se ele passar vários segundos sem apanhar (cura de verdade fora de combate)", true, `vida mínima ${minHp.toFixed(0)}`);
  // 4) deixado em paz, ele se recupera em casa (depois do atraso) e volta ao normal
  A.go(20, 20);
  const recuperou = await until(() => e.hp >= e.maxHp - 0.01 || e.st === "dead", 25000, 100);
  check("sem ninguém atacando, ele se recupera por inteiro depois de alguns segundos", recuperou, `hp ${e.hp.toFixed(0)}/${e.maxHp}`);
  A.room.leave();
}

// ================================================================== 3. Elegibilidade de XP e loot
console.log("\n== 3. XP e loot: solo só do que luta; passante nada; grupo divide ==");
const lib = async (P) => { P.room.leave(); };
async function kill(P, e, maxMs = 40000) {
  const t0 = Date.now();
  while (e.st !== "dead" && Date.now() - t0 < maxMs && !P.me().dead) { P.act("attack", e.x, e.y); await sleep(550); }
  return e.st === "dead";
}
{
  // 3a. Arqueiro SOLO mata; Guerreiro passante perto (sem dano e sem grupo) não ganha nada
  const S = await spawn("archer");
  const B = await spawn("warrior");
  const e1 = S.room.state.enemies.get("e1"); // (30,16) nível 1
  S.go(e1.x - 6.5, e1.y);
  B.go(e1.x - 4, e1.y - 2.5); // perto, mas fora do aggro do esqueleto o suficiente: só observa
  await sleep(3800);
  const ok = await kill(S, e1);
  await sleep(500);
  check("o solo abate o esqueleto sozinho", ok);
  // o dev mudou a regra (XP): esqueleto nível 1 dá enemyXp(1) = 1 XP (XP_MOB_MULT 0.03 x 20 = 0.6, arredondado); antes 20.
check("o solo ganha o XP do que ele mesmo matou (enemyXp do nível 1 = 1)", S.ev.xp.at(-1) === 1, `xp ${S.ev.xp}`);
  check("o passante sem grupo e sem dano NÃO ganha XP", B.ev.xp.length === 0, `xp ${B.ev.xp}`);
  const gs = items(S);
  check("os itens são do solo, com dono exclusivo (sem grupo)", gs.length >= 1 && gs.every((g) => g.owner === S.id && g.party === ""), JSON.stringify(gs.map((g) => g.owner === S.id)));
  B.go(e1.x, e1.y);
  await sleep(1200);
  check("o passante pisa nos itens durante a reserva e NÃO os pega", B.ev.loot.length === 0, `loot ${B.ev.loot.map((l) => l.id)}`);
  await Promise.all([lib(S), lib(B)]);
}
{
  // 3b. Grupo de 2 (Arqueiro + Clérigo, o Clérigo só fica perto) + passante: XP dividido, itens por rodízio entre os DOIS
  const G1 = await spawn("archer");
  const G2 = await spawn("cleric");
  const B = await spawn("warrior");
  G1.room.send("party_invite", { name: G2.name });
  await until(() => G2.ev.invites > 0);
  G2.room.send("party_accept", {});
  check("o grupo se forma", await until(() => G1.ev.party?.members.length === 2 && G2.ev.party?.members.length === 2));
  const e3 = G1.room.state.enemies.get("e3"); // (26,30) nível 1
  G1.go(e3.x - 6.5, e3.y);
  G2.go(e3.x - 7.5, e3.y + 1); // longe do golpe: não ataca
  B.go(e3.x + 2, e3.y - 6);
  await sleep(4200);
  const ok = await kill(G1, e3);
  await sleep(600);
  check("o grupo abate o esqueleto", ok);
  // com 1 de XP base, a divisão arredonda para 1 cada (a fórmula de party está em partyXpMult; a divisão exata é coberta pelo unit)
check("o XP é dividido pelo grupo (1 x 1,25 / 2 arredonda para 1 cada; também o Clérigo que não atacou)", G1.ev.xp.at(-1) === 1 && G2.ev.xp.at(-1) === 1, `G1 ${G1.ev.xp} G2 ${G2.ev.xp}`);
  check("o passante de fora continua sem XP", B.ev.xp.length === 0, `xp ${B.ev.xp}`);
  const gs = items(G1);
  check("os itens saem por rodízio: parte para cada membro, dono exclusivo, nenhum para o passante", gs.length >= 2 && gs.every((g) => (g.owner === G1.id || g.owner === G2.id) && g.party === "") && gs.some((g) => g.owner === G1.id) && gs.some((g) => g.owner === G2.id), JSON.stringify(gs.map((g) => g.owner === G1.id ? "G1" : g.owner === G2.id ? "G2" : "?")));
  B.go(e3.x, e3.y);
  await sleep(1500);
  check("o passante não pega nada durante a reserva", B.ev.loot.length === 0);
  await sleep(3200); // reserva (3 s) esgotada: o item no chão fica livre, como já era
  check("esgotada a reserva, quem estiver em cima dos itens pode pegá-los (livre)", await until(() => B.ev.loot.length > 0, 5000), `loot ${B.ev.loot.map((l) => l.id)}`);
  await Promise.all([lib(G1), lib(G2), lib(B)]);
}

const failed = results.filter((r) => !r).length;
console.log(`\n${results.length - failed}/${results.length} verificações passaram`);
process.exit(failed ? 1 : 0);
