// Teste de ponta a ponta do tutorial (C1.4): 5 quests encadeadas, na cidade e com o atalho de teste de abate.
// Confere: a quest N+1 só abre depois da N entregue; cada tipo de objetivo novo (chegar, usar, coletar, equipar);
// a recompensa (XP, tostões, poções e a armadura da classe); e o progresso continua depois de reconectar.
// Roda para as 4 classes (guerreiro, arqueiro, clérigo, mago): cada uma com personagem novo.
// Uso: servidor com QUEST_TEST=1 API_RATE_MULT=100 (sem TEST_START_ZONE: nasce na cidade)
//      SERVER=http://localhost:2999 node test/tutorial.mjs
import { Client } from "colyseus.js";

const HTTP = process.env.SERVER ?? "http://localhost:2999";
const WS = HTTP.replace(/^http/, "ws");
const CLASSES = (process.env.CLASSES ?? "warrior,archer,cleric,mage").split(",");
const T = ["tutorial_1_andar", "tutorial_2_primeiro_abate", "tutorial_3_habilidade", "tutorial_4_pocao", "tutorial_5_equipar"];
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const until = async (fn, ms = 4000) => { const t0 = Date.now(); while (Date.now() - t0 < ms) { if (fn()) return true; await sleep(50); } return !!fn(); };
const results = [];
const check = (name, ok, detail = "") => { results.push(ok); console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? "  -> " + detail : ""}`); };

async function conta(cls) {
  const { token } = await (await fetch(`${HTTP}/auth/guest`, { method: "POST" })).json();
  const name = "Tu" + Math.random().toString(36).slice(2, 8);
  const cr = await fetch(`${HTTP}/api/character`, { method: "POST", headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" }, body: JSON.stringify({ name, class: cls }) });
  if (!cr.ok) throw new Error(`criar personagem ${cls}: ${cr.status}`);
  return { token };
}

// entra na cidade (zona 4) e acompanha quests, inventário e avisos
async function entrar(acc) {
  const r = await new Client(WS).joinOrCreate("zone4", { token: acc.token });
  await new Promise((ok) => (r.state?.players ? ok() : r.onStateChange.once(ok)));
  const ev = { notice: [], quests: null, defs: null, inv: null, left: false };
  r.onMessage("notice", (m) => ev.notice.push(String(m.text)));
  r.onMessage("quest_estado", (m) => (ev.quests = m));
  r.onMessage("quest_defs", (m) => (ev.defs = m));
  r.onMessage("inv", (m) => (ev.inv = m));
  r.onLeave(() => (ev.left = true));
  const P = {
    r, ev,
    me: () => r.state.players.get(r.sessionId),
    said: (frag) => ev.notice.some((t) => t.includes(frag)),
    q: (id) => ev.quests?.quests?.find((q) => q.id === id),
    estado: (id) => P.q(id)?.estado ?? "nenhuma",
    inv: () => ev.inv?.inv ?? [],
    contar: (id) => P.inv().reduce((a, s) => a + (s && s.id === id ? s.qty : 0), 0),
    indiceBolsa: (id) => P.inv().findIndex((s) => s && s.id === id),
    async walk(x, y) { r.send("move_to", { x, y }); await until(() => Math.hypot(P.me().x - x, P.me().y - y) < 0.6, 12000); },
    async sair() { ev.left = false; r.leave(); await until(() => ev.left, 3000); await sleep(400); },
  };
  r.send("inv_sync", {});
  r.send("quest_sync", {});
  await until(() => ev.quests && ev.inv && ev.defs, 5000);
  return P;
}

// o Garrick da cidade (ver packages/shared/src/economy.ts): perto dele aceita e entrega
const GARRICK = { x: 20.5, y: 24 };
const FLAG = { x: 24, y: 22 };

async function rodar(cls) {
  console.log(`\n== Tutorial: ${cls} ==`);
  const acc = await conta(cls);
  let P = await entrar(acc);
  const pre = `[${cls}]`;

  check(`${pre} começa sem quests`, P.ev.quests.quests.length === 0);
  check(`${pre} as definições do tutorial chegam ao cliente`, T.every((id) => P.ev.defs.defs.some((d) => d.id === id)));

  // 1. andar até a bandeira: só aceita perto do Garrick, e a segunda quest não abre antes da primeira
  P.r.send("quest_aceitar", { id: T[0] });
  await until(() => P.said("Chegue mais perto"));
  check(`${pre} aceitar longe do NPC é recusado`, P.estado(T[0]) === "nenhuma");
  await P.walk(GARRICK.x, GARRICK.y);
  P.r.send("quest_aceitar", { id: T[1] });
  await until(() => P.said("Antes, conclua"));
  check(`${pre} a quest 2 não abre antes da 1 entregue`, P.estado(T[1]) === "nenhuma" && P.said("Antes, conclua"));
  P.r.send("quest_aceitar", { id: T[0] });
  check(`${pre} perto do Garrick, a quest 1 é aceita`, await until(() => P.estado(T[0]) === "ativa"), JSON.stringify(P.q(T[0])));
  await P.walk(FLAG.x, FLAG.y);
  check(`${pre} chegar à bandeira completa o objetivo (pronta)`, await until(() => P.estado(T[0]) === "pronta"), JSON.stringify(P.q(T[0])));
  await P.walk(GARRICK.x, GARRICK.y);
  const xp0 = P.me().xp ?? 0, lv0 = P.me().level ?? 1;
  P.r.send("quest_entregar", { id: T[0] });
  check(`${pre} entregar a 1 (no Garrick) a marca como entregue`, await until(() => P.estado(T[0]) === "entregue"), JSON.stringify(P.q(T[0])));
  check(`${pre} a recompensa da 1 dá XP`, await until(() => (P.me().xp ?? 0) > xp0 || (P.me().level ?? 1) > lv0));

  // 2. abater 1 esqueleto (atalho de teste: a progressão é a mesma do combate)
  P.r.send("quest_aceitar", { id: T[1] });
  check(`${pre} a quest 2 abre depois da 1`, await until(() => P.estado(T[1]) === "ativa"), JSON.stringify(P.q(T[1])));
  P.r.send("quest_teste_abate", { kind: "skeleton", zona: 1 });
  check(`${pre} um esqueleto da zona 1 completa a 2`, await until(() => P.estado(T[1]) === "pronta"), JSON.stringify(P.q(T[1])));
  await P.walk(GARRICK.x, GARRICK.y); // volta ao Garrick para entregar
  P.r.send("quest_entregar", { id: T[1] });
  check(`${pre} entregar a 2`, await until(() => P.estado(T[1]) === "entregue"));

  // 3. usar a habilidade 1 (conta quando ela dispara)
  await P.walk(GARRICK.x, GARRICK.y);
  P.r.send("quest_aceitar", { id: T[2] });
  check(`${pre} a quest 3 abre depois da 2`, await until(() => P.estado(T[2]) === "ativa"), JSON.stringify(P.q(T[2])));
  const meu = P.me();
  P.r.send("act", { a: "skill1", ax: meu.x + 1, ay: meu.y });
  check(`${pre} usar a habilidade 1 completa o objetivo (pronta)`, await until(() => P.estado(T[2]) === "pronta"), JSON.stringify(P.q(T[2])));
  P.r.send("quest_entregar", { id: T[2] });
  check(`${pre} entregar a 3 dá a poção`, await until(() => P.estado(T[2]) === "entregue") && P.contar("pocao_de_vida") >= 1, `pocoes=${P.contar("pocao_de_vida")}`);

  // reconectar no meio do tutorial: quests entregues e a ativa seguem como estavam
  await P.sair();
  P = await entrar(acc);
  check(`${pre} depois de reconectar, as 3 primeiras seguem entregues`, await until(() => [T[0], T[1], T[2]].every((id) => P.estado(id) === "entregue")), JSON.stringify(P.ev.quests));

  // 4. coletar a poção (já está na mochila): fica pronta sem andar mais
  await P.walk(GARRICK.x, GARRICK.y);
  P.r.send("quest_aceitar", { id: T[3] });
  check(`${pre} a quest 4 abre depois da 3`, await until(() => P.estado(T[3]) !== "nenhuma"), JSON.stringify(P.q(T[3])));
  check(`${pre} a poção na mochila já cumpre o objetivo de coletar (pronta)`, await until(() => P.estado(T[3]) === "pronta"), JSON.stringify(P.q(T[3])));
  P.r.send("quest_entregar", { id: T[3] });
  check(`${pre} entregar a 4 consome a poção e dá a armadura da classe`, await until(() => P.estado(T[3]) === "entregue") && P.contar("pocao_de_vida") === 0 && P.contar(`${cls}_armor_common`) === 1,
    `pocoes=${P.contar("pocao_de_vida")} armadura=${P.contar(cls + "_armor_common")}`);

  // 5. equipar a armadura recebida
  P.r.send("quest_aceitar", { id: T[4] });
  check(`${pre} a quest 5 abre depois da 4`, await until(() => P.estado(T[4]) === "ativa"), JSON.stringify(P.q(T[4])));
  P.r.send("quest_entregar", { id: T[4] });
  check(`${pre} sem equipar, a 5 não entrega`, await until(() => P.said("ainda não está pronta")) && P.estado(T[4]) === "ativa");
  P.r.send("inv_equip", { slot: P.indiceBolsa(`${cls}_armor_common`) });
  check(`${pre} equipar a armadura deixa a 5 pronta`, await until(() => P.estado(T[4]) === "pronta"), JSON.stringify(P.q(T[4])));
  P.r.send("quest_entregar", { id: T[4] });
  check(`${pre} entregar a 5 conclui o tutorial`, await until(() => P.estado(T[4]) === "entregue") && P.contar("pocao_de_vida") === 2, `pocoes=${P.contar("pocao_de_vida")}`);

  // persistência final: tudo entregue depois de reconectar
  await P.sair();
  P = await entrar(acc);
  check(`${pre} depois de reconectar, o tutorial inteiro segue concluído`, await until(() => T.every((id) => P.estado(id) === "entregue")), JSON.stringify(P.ev.quests));
  check(`${pre} a armadura continua equipada`, !!P.ev.inv?.equip?.armor || P.contar(`${cls}_armor_common`) === 0, JSON.stringify(P.ev.inv?.equip));
  await P.sair();
}

for (const cls of CLASSES) await rodar(cls);

const falhas = results.filter((r) => !r).length;
console.log(`\n${results.length - falhas}/${results.length} verificações passaram`);
process.exit(falhas ? 1 : 0);
