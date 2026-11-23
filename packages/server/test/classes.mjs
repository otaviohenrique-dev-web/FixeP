// Teste de ponta a ponta das classes Arqueiro e Clérigo jogando juntos.
// Exige o servidor de teste com LOOT_TEST=1. Uso: SERVER=http://localhost:2999 node test/classes.mjs
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
  const name = (cls === "archer" ? "Arq" : "Cle") + Math.random().toString(10).slice(2, 7);
  const cr = await fetch(`${HTTP}/api/character`, { method: "POST", headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" }, body: JSON.stringify({ name, class: cls }) });
  if (!cr.ok) throw new Error(`criar ${cls}: ${cr.status} ${await cr.text()}`);
  const room = await new Client(WS).joinOrCreate("zone", { token });
  await new Promise((r) => (room.state?.players ? r() : room.onStateChange.once(r)));
  const ev = { proj: [], projend: [], hit: [], trap: [], heal: [], notice: [], tele: [], loot: [], died: [], swing: [], left: null };
  for (const k of ["proj", "projend", "hit", "trap", "heal", "notice", "loot", "died", "swing"]) room.onMessage(k, (m) => ev[k].push(m));
  room.onMessage("telegraph", (m) => ev.tele.push(m));
  room.onLeave((c) => (ev.left = c));
  room.send("inv_sync", {});
  await sleep(300);
  const me = () => room.state.players.get(room.sessionId);
  const act = (a, ax, ay) => room.send("act", { a, ax, ay });
  return { room, ev, me, act, id: room.sessionId };
}

const A = await spawn("archer");
const C = await spawn("cleric");
const e1 = A.room.state.enemies.get("e1");

console.log("\n== 1. Criação das classes ==");
check("o Arqueiro nasce com classe archer e 90 de vida", A.me().cls === "archer" && A.me().maxHp === 90, `cls=${A.me().cls} maxHp=${A.me().maxHp}`);
check("o Clérigo nasce com classe cleric e 100 de vida", C.me().cls === "cleric" && C.me().maxHp === 100, `cls=${C.me().cls} maxHp=${C.me().maxHp}`);
check("cada um vê a classe do outro (sincronizada para todos)", A.room.state.players.get(C.id)?.cls === "cleric" && C.room.state.players.get(A.id)?.cls === "archer");

console.log("\n== 2. Arqueiro: flecha, perfurar, armadilha e chuva ==");
A.room.send("move_to", { x: 25.2, y: 18.2 });
await sleep(1800);
const dE = () => Math.hypot(e1.x - A.me().x, e1.y - A.me().y);
A.act("attack", e1.x, e1.y);
check("a flecha cria um projétil visível para todos", await until(() => A.ev.proj.some((p) => p.look === "arrow") && C.ev.proj.length > 0, 3000), `look=${A.ev.proj[0]?.look}`);
check("a flecha acerta o esqueleto e causa dano", await until(() => A.ev.hit.some((h) => h.k === "e" && h.by === A.id), 3000), `dano ${A.ev.hit.find((h) => h.k === "e")?.dmg}`);
check("o projétil termina ao acertar (projend com hit)", await until(() => A.ev.projend.some((p) => p.hit), 3000));
await sleep(500);
A.act("skill1", e1.x, e1.y);
check("o tiro perfurante tem aparência própria", await until(() => A.ev.proj.some((p) => p.look === "pierce"), 3000));
await sleep(700);
A.act("skill2", e1.x, e1.y);
check("a armadilha é colocada (evento trap set)", await until(() => A.ev.trap.some((t) => t.s === "set"), 3000));
check("a armadilha dispara quando o esqueleto passa (trap boom)", await until(() => A.ev.trap.some((t) => t.s === "boom"), 8000) || e1.st === "dead", `${A.ev.trap.map((t) => t.s).join(",")}`);
await sleep(300);
if (e1.st !== "dead") {
  A.act("skill3", e1.x, e1.y);
  check("a chuva de flechas é telegrafada como área amiga", await until(() => A.ev.tele.some((t) => t.friendly), 3000));
}
const dano = A.ev.hit.filter((h) => h.k === "e" && h.by === A.id).length;
await until(() => e1.st === "dead", 30000, 300).then(async (dead) => {
  // se ainda vivo, termina com flechas
  const t0 = Date.now();
  while (e1.st !== "dead" && Date.now() - t0 < 45000 && !A.me().dead) {
    // o esqueleto pode recuar (evade) e sair do alcance, sobretudo em máquina lenta: o Arqueiro se reaproxima ANTES de atirar.
    // Agir cancela o movimento, então enquanto estiver longe só anda (sem atacar no mesmo ciclo).
    if (Math.hypot(e1.x - A.me().x, e1.y - A.me().y) > 7) { A.room.send("move_to", { x: e1.x - 5, y: e1.y }); await sleep(600); continue; }
    A.act("attack", e1.x, e1.y); await sleep(600);
  }
});
check("o Arqueiro derruba o esqueleto só com ataques à distância", e1.st === "dead", `${dano}+ acertos | e1 ${e1.st} hp ${e1.hp} a ${Math.hypot(e1.x - A.me().x, e1.y - A.me().y).toFixed(1)} | A morto=${A.me().dead} hp ${A.me().hp}`);
await sleep(500);
// os itens caem no chão: anda até cada um (andar até o item pega sozinho)
async function collect(P, ms = 9000) {
  const t = Date.now();
  while (P.room.state.items.size > 0 && Date.now() - t < ms) {
    let g = null;
    P.room.state.items.forEach((x) => { g ??= x; });
    P.room.send("move_to", { x: g.x, y: g.y });
    await sleep(300);
  }
}
await collect(A);
await sleep(300);
check("o Arqueiro recebe XP e loot (o item do chão é dele; qualquer classe pode cair, aqui o teste solta o arco)", A.me().xp >= 1 && A.ev.loot.some((l) => l.id === "arco_curto_common"), `xp ${A.me().xp}, loot ${A.ev.loot.map((l) => l.id)}`);

console.log("\n== 3. Clérigo: Compressor de Ar, Julgamento e ataque ==");
// ambos vão para perto do esqueleto e2 (31,24): A fica no alcance de aggro, C um pouco atrás (dentro do raio de cura 4)
A.room.send("move_to", { x: 28.2, y: 24 });
const dAC = () => Math.hypot(A.me().x - C.me().x, A.me().y - C.me().y);
// o Clérigo segue a posição REAL do aliado (o ponto fixo dependia do desenho do mapa e do tempo de caminhada)
{
  const t0 = Date.now();
  while (Date.now() - t0 < 12000 && !(dAC() <= 3.5 && Date.now() - t0 > 2500)) { C.room.send("move_to", { x: A.me().x - 2, y: A.me().y }); await sleep(400); }
}
check("o Clérigo ficou perto o bastante do aliado (cura 4)", dAC() <= 4.2, `distância ${dAC().toFixed(1)}`);
const e2 = C.room.state.enemies.get("e2");
{
  const hitsAntes = C.ev.hit.filter((h) => h.k === "e" && h.by === C.id).length;
  C.act("skill2", e2.x, e2.y);
  check("o Compressor de Ar é telegrafado como área amiga", await until(() => C.ev.tele.some((t) => t.friendly), 2000));
  await sleep(700);
  check("o inimigo puxado fica atordoado (não ataca)", e2.st === "recover" || e2.st === "dead", `st=${e2.st}`);
  C.act("skill3", e2.x, e2.y);
  await sleep(1200);
  check("Julgamento (dano em área) machuca o inimigo depois do atraso", C.ev.hit.filter((h) => h.k === "e" && h.by === C.id).length > hitsAntes || e2.st === "dead");
}
C.act("attack", e2.x, e2.y);
check("o ataque do Clérigo é um raio (bolt)", await until(() => C.ev.proj.some((p) => p.look === "bolt"), 3000));

console.log("\n== 4. Cura ==");
check("o Arqueiro toma dano do esqueleto", await until(() => A.me().hp < A.me().maxHp, 30000, 200), `hp ${A.me().hp}/${A.me().maxHp}`);
const hpAntes = A.me().hp;
const healsAntes = C.ev.heal.length;
C.act("skill1", 0, 0);
let hpMax = hpAntes; // o esqueleto ainda bate no aliado: vale o maior valor visto durante a cura, não o final
for (let i = 0; i < 12; i++) { hpMax = Math.max(hpMax, A.me().hp); await sleep(50); }
const heal = C.ev.heal.slice(healsAntes).find((h) => h.id === A.id && !h.revive);
check("a Cura chega ao aliado (evento heal)", !!heal && heal.amount > 0, `+${heal?.amount}`);
check("a vida do aliado sobe de verdade no servidor", hpMax > hpAntes || hpMax === A.me().maxHp, `${hpAntes} → máx ${hpMax}`);

console.log("\n== 5. Queda e renascimento ==");
const tm = Date.now();
while (!A.me().dead && Date.now() - tm < 60000) await sleep(200);
check("o Arqueiro cai (morto)", A.me().dead === true);
A.act("attack", e2.x, e2.y);
const projsAntes = A.ev.proj.length;
await sleep(500);
check("jogador morto não consegue agir", A.ev.proj.length === projsAntes);
check("depois de alguns segundos ele renasce com a vida cheia", await until(() => A.me().dead === false, 20000, 200) && A.me().hp === A.me().maxHp, `hp ${A.me().hp}/${A.me().maxHp}`);

console.log("\n== 5b. Chuva de flechas (esqueleto vivo) ==");
{
  // o inimigo que perdeu o alvo volta para casa (evade): o Arqueiro renasce longe e precisa chegar ao alcance da chuva (8 tiles)
  A.room.send("move_to", { x: e2.x - 4.5, y: e2.y });
  await sleep(1800);
  A.room.send("move_to", { x: A.me().x, y: A.me().y });
  await sleep(300);
  const teleAntes = A.ev.tele.filter((t) => t.friendly).length;
  const hitsAntes = A.ev.hit.filter((h) => h.k === "e").length;
  A.act("skill3", e2.x, e2.y);
  check("a chuva é telegrafada em azul (área amiga)", await until(() => A.ev.tele.filter((t) => t.friendly).length > teleAntes, 2000));
  check("o dano da chuva cai DEPOIS do atraso, não na hora", A.ev.hit.filter((h) => h.k === "e").length === hitsAntes);
  await sleep(1300);
  check("a chuva machuca quem estiver na área", A.ev.hit.filter((h) => h.k === "e").length > hitsAntes || e2.st === "dead", `e2 ${e2.st} em ${e2.x.toFixed(1)},${e2.y.toFixed(1)} alvo ${"" + 0}`);
}

console.log("\n== 6. XP e loot em grupo ==");
// Reagrupa: quem estiver caído renasce no ponto inicial com a vida cheia; ninguém começa esta parte morto.
A.room.send("move_to", { x: 20, y: 20 });
C.room.send("move_to", { x: 20, y: 20 });
await until(() => !A.me().dead && !C.me().dead, 20000, 200);
await until(() => Math.hypot(A.me().x - 20, A.me().y - 20) < 1 && Math.hypot(C.me().x - 20, C.me().y - 20) < 1, 10000, 200);
C.act("skill1", 0, 0); // se algum ainda estiver ferido
await sleep(500);
const xpC0 = C.me().xp, lvC0 = C.me().level, xpA0 = A.me().xp, lvA0 = A.me().level;
const lootC0 = C.ev.loot.length, lootA0 = A.ev.loot.length;
const died0 = { A: A.ev.died.filter((d) => d.k === "e").length, C: C.ev.died.filter((d) => d.k === "e").length };

// os dois enfrentam o esqueleto vivo mais próximo (a morte dispara o rateio para quem estiver por perto)
const nearestAlive = (P) => {
  let best = null, bd = 1e9;
  P.room.state.enemies.forEach((e) => { if (e.st === "dead") return; const d = Math.hypot(e.x - P.me().x, e.y - P.me().y); if (d < bd) { bd = d; best = e; } });
  return best;
};
const tk = Date.now();
let alvo = null;
A.room.send("move_to", { x: 27.5, y: 26 });
C.room.send("move_to", { x: 26.6, y: 25.4 });
await sleep(3500);
while (Date.now() - tk < 60000 && !C.me().dead) {
  const diedA = A.ev.died.filter((d) => d.k === "e").length - died0.A;
  if (diedA >= 1) break; // um esqueleto caiu
  const e = nearestAlive(C);
  if (!e) { await sleep(500); continue; }
  alvo = e;
  if (!A.me().dead) A.act("attack", e.x, e.y); // quem estiver vivo ataca; o Clérigo também cura (o servidor ignora a recarga)
  C.act("attack", e.x, e.y);
  C.act("skill1", 0, 0);
  await sleep(700);
}
await sleep(700);
{
  const kills = { A: A.ev.died.filter((d) => d.k === "e").length - died0.A, C: C.ev.died.filter((d) => d.k === "e").length - died0.C };
  check("um esqueleto cai com os dois atacando", kills.A >= 1 && kills.C >= 1, `abates vistos: A=${kills.A} C=${kills.C} | A: hp ${A.me().hp} morto=${A.me().dead} | C: hp ${C.me().hp} morto=${C.me().dead} | ${((Date.now() - tk) / 1000).toFixed(0)}s`);
}
check("o Arqueiro também ganha XP do abate", A.me().level > lvA0 || A.me().xp > xpA0, `xp ${xpA0} → ${A.me().xp}`);
check("o Clérigo ganha XP mesmo sem dar o golpe final (rateio)", C.me().level > lvC0 || C.me().xp > xpC0, `xp ${xpC0} → ${C.me().xp} (nv ${C.me().level})`);
{
  // os itens saem por rodízio entre quem lutou; quem estava perto já pode ter pisado em alguns, então a prova vem do que cada um RECEBEU
  await Promise.all([collect(A), collect(C)]);
  await sleep(300);
  const gotA = A.ev.loot.slice(lootA0).map((l) => l.id), gotC = C.ev.loot.slice(lootC0).map((l) => l.id);
  check("o loot do abate é dividido: os dois recebem itens e nada fica esquecido no chão", gotA.length >= 1 && gotC.length >= 1 && A.room.state.items.size === 0, `A ${gotA} | C ${gotC} | chão ${A.room.state.items.size}`);
}

console.log("\n== 7. Estabilidade ==");
check("ninguém foi desconectado pelo limite de taxa", A.ev.left === null && C.ev.left === null, `A=${A.ev.left} C=${C.ev.left}`);
check("servidor segue de pé", (await fetch(`${HTTP}/health`)).ok);

A.room.leave(); C.room.leave();
const failed = results.filter((r) => !r).length;
console.log(`\n${results.length - failed}/${results.length} verificações passaram`);
process.exit(failed ? 1 : 0);
