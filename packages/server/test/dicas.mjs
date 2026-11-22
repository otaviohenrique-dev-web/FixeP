// Teste de ponta a ponta das dicas contextuais (C1.6): grava a dica vista, reenvia ao reentrar, ignora id inválido
// e não grava repetidos. Usa a sala da cidade (zona 4), como o teste de quests.
// Uso: servidor com API_RATE_MULT=100 (sem TEST_START_ZONE: nasce na cidade)
//      SERVER=http://localhost:2999 node test/dicas.mjs
import { Client } from "colyseus.js";

const HTTP = process.env.SERVER ?? "http://localhost:2999";
const WS = HTTP.replace(/^http/, "ws");
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const until = async (fn, ms = 5000) => { const t0 = Date.now(); while (Date.now() - t0 < ms) { if (fn()) return true; await sleep(50); } return !!fn(); };
const results = [];
const check = (name, ok, detail = "") => { results.push(ok); console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? "  -> " + detail : ""}`); };

async function conta() {
  const { token } = await (await fetch(`${HTTP}/auth/guest`, { method: "POST" })).json();
  const name = "Dc" + Math.random().toString(10).slice(2, 8);
  const cr = await fetch(`${HTTP}/api/character`, { method: "POST", headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" }, body: JSON.stringify({ name, class: "warrior" }) });
  if (!cr.ok) throw new Error(`criar personagem: ${cr.status}`);
  return { token };
}

// entra na cidade; o ev guarda a última lista de dicas que o servidor mandou
async function entrar(acc) {
  const r = await new Client(WS).joinOrCreate("zone4", { token: acc.token });
  await new Promise((ok) => (r.state?.players ? ok() : r.onStateChange.once(ok)));
  const ev = { dicas: null, left: false };
  r.onMessage("dicas_vistas", (m) => (ev.dicas = m));
  r.onMessage("inv", () => {}); // o jogo real também recebe estas; aqui só nos interessa a lista de dicas
  r.onMessage("quest_estado", () => {});
  r.onLeave(() => (ev.left = true));
  // as mensagens enviadas ao entrar podem chegar antes dos receptores (CI lento): pede de novo, como faz o cliente
  const P = {
    r, ev,
    ids: () => ev.dicas?.ids ?? null,
    // pede a lista até o servidor devolver o que se espera (o gravar é assíncrono no servidor)
    async sincronizar(esperado) { return until(() => { r.send("dicas_sync", {}); return esperado(P.ids()); }, 5000); },
    async sair() { ev.left = false; r.leave(); await until(() => ev.left, 3000); },
  };
  await until(() => ev.dicas, 5000);
  return P;
}

const acc = await conta();

console.log("\n== Dicas contextuais (C1.6) ==");
let P = await entrar(acc);
check("ao entrar, o servidor manda a lista de dicas vistas (vazia)", Array.isArray(P.ids()) && P.ids().length === 0, JSON.stringify(P.ids()));

P.r.send("dica_vista", { id: "primeiro_ataque" });
check("dica válida gravada: reenvio pede a lista e ela traz a dica", await P.sincronizar((ids) => ids?.includes("primeiro_ataque")), JSON.stringify(P.ids()));

P.r.send("dica_vista", { id: "nao_existe" });
P.r.send("dica_vista", { id: "primeiro_ataque" }); // repetida: não duplica
P.r.send("dica_vista", { id: 42 });
P.r.send("dica_vista", { id: "vida_baixa" }); // esta é válida: serve de marco, já que as mensagens são processadas em ordem
check("id inválido não é gravado e a repetida não duplica", await P.sincronizar((ids) => ids?.includes("vida_baixa")), JSON.stringify(P.ids()));
check("depois do marco, a lista só tem as 2 válidas, sem repetir", P.ids().length === 2 && !P.ids().includes("nao_existe") && P.ids().filter((x) => x === "primeiro_ataque").length === 1, JSON.stringify(P.ids()));

await P.sair();
P = await entrar(acc);
check("ao reentrar, o servidor reenvia as dicas já vistas", await P.sincronizar((ids) => ids?.includes("primeiro_ataque") && ids?.includes("vida_baixa")), JSON.stringify(P.ids()));
check("ao reentrar, não voltam as que não foram vistas", !P.ids().includes("primeira_pocao") && !P.ids().includes("nao_existe"), JSON.stringify(P.ids()));

P.r.send("dica_vista", { id: "primeira_pocao" });
check("depois de reentrar, grava outra dica e ela aparece", await P.sincronizar((ids) => ids?.includes("primeira_pocao")), JSON.stringify(P.ids()));
await P.sair();

const falhas = results.filter((r) => !r).length;
console.log(`\n${results.length - falhas}/${results.length} verificações passaram`);
process.exit(falhas ? 1 : 0);
