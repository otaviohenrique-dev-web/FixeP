// Teste de ponta a ponta do recurso das classes (Fúria, Foco, Mana): custo, regeneração, bloqueio sem gastar a recarga.
// Uso: SERVER=http://localhost:2999 node test/mana.mjs   (servidor de teste sem carregar o .env)
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
  const name = "Mn" + Math.random().toString(36).slice(2, 8);
  const cr = await fetch(`${HTTP}/api/character`, { method: "POST", headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" }, body: JSON.stringify({ name, class: cls }) });
  if (!cr.ok) throw new Error(`criar ${cls}: ${cr.status}`);
  const room = await new Client(WS).joinOrCreate("zone", { token });
  await new Promise((r) => (room.state?.players ? r() : room.onStateChange.once(r)));
  const ev = { swing: [], notice: [], left: null };
  room.onMessage("swing", (m) => ev.swing.push(m));
  room.onMessage("notice", (m) => ev.notice.push(String(m.text)));
  room.onLeave((c) => (ev.left = c));
  const me = () => room.state.players.get(room.sessionId);
  const act = (a, ax = 25, ay = 20) => room.send("act", { a, ax, ay });
  const mine = (a) => ev.swing.filter((s) => s.id === room.sessionId && s.a === a).length;
  return { room, ev, me, act, mine };
}

console.log("\n== Guerreiro (Fúria: máx 100, regen 5/s; Giro 25, Carga 30, Grito 35) ==");
{
  const W = await spawn("warrior");
  check("começa com o recurso cheio (100 / 100)", W.me().mana === 100 && W.me().maxMana === 100, `${W.me().mana}/${W.me().maxMana}`);

  const t0 = Date.now();
  W.act("skill1"); await sleep(120);
  const m1 = W.me().mana;
  check("Giro gasta 25", m1 >= 74 && m1 <= 77, `mana ${m1}`);
  W.act("skill2"); await sleep(450); // a Carga é um avanço de 0,25 s: ações durante ele são ignoradas de propósito
  W.act("skill3"); await sleep(200);
  const m3 = W.me().mana;
  check("Carga (30) e Grito (35) também gastam: sobra pouco", m3 >= 8 && m3 <= 16, `mana ${m3} (esperado ~10)`);
  check("as 3 habilidades aconteceram", W.mine("skill1") === 1 && W.mine("skill2") === 1 && W.mine("skill3") === 1);

  // A Esquiva não custa nada, mesmo com pouco recurso
  const antes = W.me().mana;
  W.act("dodge"); await sleep(150);
  check("Esquiva é de graça (não gasta recurso) mesmo com pouca Fúria", W.mine("dodge") === 1 && W.me().mana >= antes, `${antes} → ${W.me().mana}`);

  // 4 s: o Giro volta da recarga e a Fúria regenerada (~28) já paga os 25 dele; isso deixa a Fúria baixa de novo
  await sleep(Math.max(0, 4250 - (Date.now() - t0)));
  const giro2 = W.mine("skill1");
  W.act("skill1"); await sleep(200);
  check("com a recarga pronta e Fúria regenerada, o Giro sai de novo", W.mine("skill1") === giro2 + 1, `mana ${W.me().mana}`);

  // 6,4 s: a Carga volta da recarga, mas a Fúria (≈15) ainda não paga os 30
  await sleep(Math.max(0, 6500 - (Date.now() - t0)));
  const mBloq = W.me().mana;
  const swingsAntes = W.mine("skill2");
  W.ev.notice.length = 0;
  W.act("skill2"); await sleep(300);
  check("sem Fúria suficiente a Carga NÃO acontece", W.mine("skill2") === swingsAntes && mBloq < 30, `mana ${mBloq} (precisa de 30)`);
  check("o jogador recebe o aviso 'Fúria insuficiente'", W.ev.notice.some((t) => t.includes("Fúria") && t.includes("insuficiente")), JSON.stringify(W.ev.notice));
  check("o recurso não foi gasto na tentativa recusada", W.me().mana >= mBloq - 1, `${mBloq} → ${W.me().mana}`);

  // regenera e tenta de novo: se a recarga tivesse sido gasta na tentativa recusada, isso falharia
  await sleep(3200);
  const mAntes2 = W.me().mana;
  W.act("skill2"); await sleep(300);
  check("regenerou (≈5 por segundo) e a Carga agora acontece (a recarga não foi queimada)", mAntes2 >= 30 && W.mine("skill2") === swingsAntes + 1, `mana antes ${mAntes2}`);
  check("o servidor não derrubou o jogador por mandar ações recusadas", W.ev.left === null);
  W.room.leave();
}

console.log("\n== Arqueiro e Clérigo: recursos próprios ==");
{
  const A = await spawn("archer");
  check("Arqueiro: Foco 100 / 100", A.me().maxMana === 100 && A.me().mana === 100, `${A.me().mana}/${A.me().maxMana}`);
  A.act("skill1", 30, 20); await sleep(150);
  check("Perfurar gasta 20 de Foco", A.me().mana >= 78 && A.me().mana <= 82, `mana ${A.me().mana}`);
  A.room.leave();

  const C = await spawn("cleric");
  check("Clérigo: Mana 120 / 120", C.me().maxMana === 120 && C.me().mana === 120, `${C.me().mana}/${C.me().maxMana}`);
  C.act("skill2"); await sleep(150);
  check("Compressor de Ar gasta 30 de Mana", C.me().mana >= 89 && C.me().mana <= 92, `mana ${C.me().mana}`);
  const m = C.me().mana;
  C.act("skill3"); await sleep(250);
  check("Julgamento gasta 30 de Mana", C.me().mana >= m - 31 && C.me().mana <= m - 28, `${m} → ${C.me().mana}`);
  const m2 = C.me().mana;
  C.act("attack"); await sleep(150);
  check("o Raio (ataque básico) custa pouco (4)", C.me().mana >= m2 - 5 && C.mine("attack") === 1, `${m2} → ${C.me().mana}`);
  C.room.leave();
}

console.log("\n== Ultimate (tecla R): custo alto, recarga longa ==");
{
  const W = await spawn("warrior");
  W.act("ultimate"); await sleep(150);
  check("Terremoto (ultimate do Guerreiro) acontece e gasta 80 de Fúria", W.mine("ultimate") === 1 && W.me().mana >= 18 && W.me().mana <= 24, `mana ${W.me().mana}`);
  W.act("ultimate"); await sleep(150);
  check("a recarga longa (40 s) impede repetir", W.mine("ultimate") === 1);
  W.room.leave();
  const C = await spawn("cleric");
  C.act("ultimate"); await sleep(150);
  check("Luz Divina (Clérigo) custa 90 de Mana", C.mine("ultimate") === 1 && C.me().mana >= 28 && C.me().mana <= 34, `mana ${C.me().mana}`);
  C.room.leave();
  const A = await spawn("archer");
  A.act("ultimate", 30, 20); await sleep(150);
  check("Salva Final (Arqueiro) custa 80 de Foco", A.mine("ultimate") === 1 && A.me().mana >= 18 && A.me().mana <= 24, `mana ${A.me().mana}`);
  A.room.leave();
}

const failed = results.filter((r) => !r).length;
console.log(`\n${results.length - failed}/${results.length} verificações passaram`);
process.exit(failed ? 1 : 0);
