// Teste de ponta a ponta das quests (C1.1): aceitar, progredir, não entregar sem completar, entregar uma vez só,
// e persistência depois de reconectar (ativa e entregue). Usa o atalho de teste "quest_teste_abate" (só com QUEST_TEST=1)
// no lugar de matar 3 esqueletos de verdade: a progressão e a validação são as mesmas do caminho do abate.
// Uso: servidor com QUEST_TEST=1 API_RATE_MULT=100 (sem TEST_START_ZONE: nasce na cidade, perto do comerciante)
//      SERVER=http://localhost:2999 node test/quests.mjs
import { Client } from "colyseus.js";

const HTTP = process.env.SERVER ?? "http://localhost:2999";
const WS = HTTP.replace(/^http/, "ws");
const QID = "caca_aos_ossos";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const until = async (fn, ms = 4000) => { const t0 = Date.now(); while (Date.now() - t0 < ms) { if (fn()) return true; await sleep(50); } return !!fn(); };
const results = [];
const check = (name, ok, detail = "") => { results.push(ok); console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? "  -> " + detail : ""}`); };

async function conta() {
  const { token } = await (await fetch(`${HTTP}/auth/guest`, { method: "POST" })).json();
  const name = "Qs" + Math.random().toString(36).slice(2, 8);
  const cr = await fetch(`${HTTP}/api/character`, { method: "POST", headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" }, body: JSON.stringify({ name, class: "warrior" }) });
  if (!cr.ok) throw new Error(`criar personagem: ${cr.status}`);
  return { token };
}

// entra na sala da cidade (zona 4); o ev guarda o que o servidor mandou
async function entrar(acc) {
  const r = await new Client(WS).joinOrCreate("zone4", { token: acc.token });
  await new Promise((ok) => (r.state?.players ? ok() : r.onStateChange.once(ok)));
  const ev = { notice: [], quests: null, inv: null, left: false };
  r.onMessage("notice", (m) => ev.notice.push(String(m.text)));
  r.onMessage("quest_estado", (m) => (ev.quests = m));
  r.onMessage("inv", (m) => (ev.inv = m));
  r.onLeave(() => (ev.left = true));
  const P = {
    r, ev,
    me: () => r.state.players.get(r.sessionId),
    said: (frag) => ev.notice.some((t) => t.includes(frag)),
    quest: () => ev.quests?.quests?.find((q) => q.id === QID),
    potions: () => (ev.inv?.inv ?? []).reduce((a, s) => a + (s && s.id === "pocao_de_vida" ? s.qty : 0), 0),
    async walk(x, y) { r.send("move_to", { x, y }); await until(() => Math.hypot(P.me().x - x, P.me().y - y) < 0.6, 12000); },
    async sair() { ev.left = false; r.leave(); await until(() => ev.left, 3000); await sleep(400); }, // dá tempo do servidor gravar ao sair
  };
  await until(() => ev.quests && ev.inv, 3000);
  return P;
}

const acc = await conta();
let P = await entrar(acc);

console.log("\n== Quests: aceitar e progredir ==");
check("ao entrar, o servidor manda a lista de quests (vazia)", !!P.ev.quests && P.ev.quests.quests.length === 0, JSON.stringify(P.ev.quests));
P.r.send("quest_aceitar", { id: QID });
await until(() => P.said("Chegue mais perto"));
check("aceitar longe do NPC é recusado", !P.quest() && P.said("Chegue mais perto"), JSON.stringify(P.ev.notice));
P.r.send("quest_aceitar", { id: "nao_existe" });
await until(() => P.said("não existe"));
check("quest inexistente é recusada", P.said("não existe"));
await P.walk(20.5, 24); // comerciante Garrick (19, 24)
P.r.send("quest_aceitar", { id: QID });
check("perto do NPC, aceita e a quest aparece como ativa", await until(() => P.quest()?.estado === "ativa"), JSON.stringify(P.quest()));
P.r.send("quest_aceitar", { id: QID });
await sleep(200);
check("aceitar de novo é recusado", P.said("já aceitou"));
P.r.send("quest_entregar", { id: QID });
await until(() => P.said("ainda não está pronta"));
check("não entrega sem completar", P.said("ainda não está pronta") && P.quest()?.estado === "ativa");
P.r.send("quest_teste_abate", { kind: "skeleton", zona: 1 });
P.r.send("quest_teste_abate", { kind: "skeleton", zona: 1 });
check("dois abates contam (progresso 2)", await until(() => P.quest()?.progresso[0] === 2), JSON.stringify(P.quest()));

console.log("\n== Persistência: sair e voltar ==");
await P.sair();
P = await entrar(acc);
check("depois de reconectar, o progresso (2) continua", await until(() => P.quest()?.progresso[0] === 2 && P.quest()?.estado === "ativa"), JSON.stringify(P.quest()));
await P.walk(20.5, 24);
P.r.send("quest_teste_abate", { kind: "wolf", zona: 1 });
P.r.send("quest_teste_abate", { kind: "skeleton", zona: 2 });
await sleep(250);
check("abate de outro tipo ou zona não conta", P.quest()?.progresso[0] === 2);
P.r.send("quest_teste_abate", { kind: "skeleton", zona: 1 });
check("terceiro abate: a quest fica pronta", await until(() => P.quest()?.estado === "pronta"), JSON.stringify(P.quest()));

console.log("\n== Entrega ==");
const pocoesAntes = P.potions();
P.r.send("quest_entregar", { id: QID });
check("entrega concede a recompensa (2 poções) e marca como entregue", await until(() => P.quest()?.estado === "entregue" && P.potions() === pocoesAntes + 2), `estado=${P.quest()?.estado} pocoes ${pocoesAntes}->${P.potions()}`);
check("aviso de recompensa recebida", P.said("Recompensa recebida"));
const ferro = P.ev.inv?.iron ?? -1;
P.r.send("quest_entregar", { id: QID });
await sleep(300);
check("entregar de novo não paga de novo", P.said("já entregou") && (P.ev.inv?.iron ?? -2) === ferro && P.potions() === pocoesAntes + 2);

console.log("\n== Persistência da entrega ==");
await P.sair();
P = await entrar(acc);
check("depois de reconectar, a quest segue entregue", await until(() => P.quest()?.estado === "entregue"), JSON.stringify(P.quest()));
check("recompensa de ferro ficou gravada", (P.ev.inv?.iron ?? -1) === ferro && ferro >= 40, `iron=${P.ev.inv?.iron}`);
check("poções ficaram gravadas", P.potions() === pocoesAntes + 2);
await P.sair();

const falhas = results.filter((r) => !r).length;
console.log(`\n${results.length - falhas}/${results.length} verificações passaram`);
process.exit(falhas ? 1 : 0);
