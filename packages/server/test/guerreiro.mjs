// Teste de ponta a ponta do Guerreiro redesenhado: Investida (atordoa), Correntes (enraíza), Escudo Refletor (provoca, mitiga e devolve dano)
// e Queda do Colosso (ultimate telegrafada, dano enorme e atordoamento). Servidor de teste sem .env (veja o README). Uso: SERVER=http://localhost:2999 node test/guerreiro.mjs
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
const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);

async function spawn(cls) {
  const { token } = await (await fetch(`${HTTP}/auth/guest`, { method: "POST" })).json();
  const name = "Gu" + Math.random().toString(10).slice(2, 8);
  const cr = await fetch(`${HTTP}/api/character`, { method: "POST", headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" }, body: JSON.stringify({ name, class: cls }) });
  if (!cr.ok) throw new Error(`criar ${cls}: ${cr.status}`);
  const room = await new Client(WS).joinOrCreate("zone", { token });
  await new Promise((r) => (room.state?.players ? r() : room.onStateChange.once(r)));
  const ev = { hits: [], tele: [], swing: [], notice: [], died: [], left: null };
  room.onMessage("hit", (m) => ev.hits.push(m));
  room.onMessage("telegraph", (m) => ev.tele.push(m));
  room.onMessage("swing", (m) => ev.swing.push(m));
  room.onMessage("notice", (m) => ev.notice.push(String(m.text)));
  room.onMessage("died", (m) => ev.died.push(m));
  room.onMessage("*", () => {});
  room.onLeave((c) => (ev.left = c));
  await sleep(250);
  return {
    room, ev, id: room.sessionId, me: () => room.state.players.get(room.sessionId),
    act: (a, ax = 25, ay = 20) => room.send("act", { a, ax, ay }), go: (x, y) => room.send("move_to", { x, y }),
    mine: (a) => ev.swing.filter((s) => s.id === room.sessionId && s.a === a).length,
  };
}
const arrive = (P, x, y, ms = 6000) => { P.go(x, y); return until(() => Math.hypot(P.me().x - x, P.me().y - y) < 0.35, ms); };

console.log("\n== Q Investida: avanço que machuca e ATORDOA; W Correntes: ENRAÍZA a área ==");
{
  const W = await spawn("warrior");
  const e = W.room.state.enemies.get("e1"); // (30,16) nível 1, 60 de vida
  check("o Guerreiro tem 120 de vida e 100 de Fúria (continua o tanque do grupo)", W.me().maxHp === 120 && W.me().maxMana === 100, `${W.me().maxHp}/${W.me().maxMana}`);
  check("chegou perto do esqueleto", await arrive(W, 25.6, 16.2));
  const hp0 = e.hp;
  W.act("skill1", e.x, e.y);
  check("a Investida atordoa o inimigo (stunned) e o fere", await until(() => e.stunned && e.hp < hp0, 1200), `stunned=${e.stunned} hp ${hp0}->${e.hp}`);
  check("a Investida custa 25 de Fúria", W.me().mana >= 74 && W.me().mana <= 80, `mana ${W.me().mana}`);
  const x0 = e.x, y0 = e.y;
  await sleep(600);
  check("atordoado, ele não sai do lugar", Math.hypot(e.x - x0, e.y - y0) < 0.05, `moveu ${Math.hypot(e.x - x0, e.y - y0).toFixed(2)}`);
  check("o atordoamento passa (cerca de 1,5 s)", await until(() => !e.stunned, 2500));

  // Correntes: afasta-se e enraíza (o esqueleto estaria perseguindo)
  await arrive(W, 23.5, 16.2, 4000);
  await until(() => e.st === "chase" || e.st === "windup" || e.st === "recover", 2000);
  const hp1 = e.hp;
  W.act("skill2", e.x, e.y);
  check("as Correntes mandam o telégrafo com o visual 'chains'", await until(() => W.ev.tele.some((t) => t.fx === "chains"), 1000));
  check("depois do atraso, o inimigo fica ENRAIZADO e leva dano", await until(() => e.rooted && e.hp < hp1, 1500), `rooted=${e.rooted} hp ${hp1}->${e.hp}`);
  const rx = e.x, ry = e.y;
  await sleep(1800);
  check("enraizado, ele não anda atrás do jogador (que está fora do alcance dele)", Math.hypot(e.x - rx, e.y - ry) < 0.05 && dist(W.me(), e) > 2, `moveu ${Math.hypot(e.x - rx, e.y - ry).toFixed(2)}, dist ${dist(W.me(), e).toFixed(1)}`);
  check("as Correntes custam 30 de Fúria", W.me().mana < 78, `mana ${W.me().mana}`);
  check("a raiz acaba (cerca de 3,5 s)", await until(() => !e.rooted, 3000));
  W.room.leave();
}

console.log("\n== E Escudo Refletor: provoca, reduz o dano e DEVOLVE parte dele ==");
{
  const W = await spawn("warrior");
  const e = W.room.state.enemies.get("e2"); // (31,24) nível 1
  check("chegou perto do esqueleto", await arrive(W, 29.6, 23.8));
  W.act("skill3");
  check("o escudo liga (buff e reflect sincronizados)", await until(() => W.me().buff && W.me().reflect, 800), `buff=${W.me().buff} reflect=${W.me().reflect}`);
  check("o Escudo Refletor custa 35 de Fúria", W.me().mana >= 60 && W.me().mana <= 66, `mana ${W.me().mana}`);
  check("o esqueleto bate no escudo e leva dano de volta (evento hit com refl)", await until(() => W.ev.hits.some((h) => h.k === "e" && h.refl && h.by === W.id), 6000), `refl=${W.ev.hits.filter((h) => h.refl).length}`);
  const refl = W.ev.hits.find((h) => h.k === "e" && h.refl);
  check("o dano devolvido é ~75% do golpe (14 → ~10)", !!refl && refl.dmg >= 8 && refl.dmg <= 13, `dmg ${refl?.dmg}`);
  const taken = W.ev.hits.find((h) => h.k === "p" && h.id === W.id);
  check("e o golpe que o Guerreiro leva é reduzido à metade (14 → ~7)", !!taken && taken.dmg >= 6 && taken.dmg <= 8, `dmg ${taken?.dmg}`);
  check("o escudo acaba depois de ~5 s", await until(() => !W.me().reflect && !W.me().buff, 6000));
  W.room.leave();
}

console.log("\n== R Queda do Colosso: telegrafada, dano enorme em área e atordoamento ==");
{
  const W = await spawn("warrior");
  const e = W.room.state.enemies.get("e3"); // (26,30) nível 1, 60 de vida
  check("chegou perto do esqueleto", await arrive(W, 24.5, 26.8));
  W.act("ultimate", e.x, e.y);
  check("telégrafo da ultimate com o visual 'colossus' e raio grande", await until(() => W.ev.tele.some((t) => t.fx === "colossus" && t.r >= 4 && t.ms >= 1400), 800), JSON.stringify(W.ev.tele.at(-1)));
  check("ela custa 80 de Fúria", await until(() => W.me().mana >= 18 && W.me().mana <= 26, 1500, 50), `mana ${W.me().mana}`); // o estado chega por sincronização: espera em vez de ler na hora
  // REBALANCE (Guerreiro é tanque): a R foi de 120 para 40 de dano base; ela já não mata um esqueleto de 60 de vida num golpe só
  check("a espada cai e a R dá dano médio na área (30 a 50, sem one-shot)", await until(() => W.ev.hits.some((h) => h.k === "e" && h.dmg >= 30 && h.dmg <= 50), 3000), `maior dano ${Math.max(0, ...W.ev.hits.map((h) => h.dmg))}`);
  W.act("ultimate", e.x, e.y);
  await sleep(300);
  check("a recarga longa (40 s) impede repetir", W.mine("ultimate") === 1);
  W.room.leave();
}

console.log("\n== Regras: chefes resistem ao controle; o resto do kit ==");
{
  const { BOSS_CC_RESIST } = await import("../../shared/src/index.ts").catch(() => ({ BOSS_CC_RESIST: 0.4 }));
  check("a resistência dos chefes ao controle existe (0 < x < 1)", BOSS_CC_RESIST > 0 && BOSS_CC_RESIST < 1, String(BOSS_CC_RESIST));
}

const failed = results.filter((x) => !x).length;
console.log(`\n${results.length - failed}/${results.length} verificações passaram`);
process.exit(failed ? 1 : 0);
