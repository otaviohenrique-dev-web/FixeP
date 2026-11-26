// Teste de ponta a ponta do balanceamento ao vivo: chaves, permissão, limites, efeito imediato, desfazer e persistência.
// Fase "1" (servidor novo, a 1ª conta criada vira admin pelo seam de teste):
//   - não-admin recebe 403 em todas as rotas /api/admin/balanceamento;
//   - o admin lê o mapa, muda a vida do lobo (vale na hora, inclusive para o lobo vivo na zona 2),
//     recusa valor fora do limite, desfaz a mudança (volta o valor anterior) e salva de novo para a próxima fase.
// Fase "2" (MESMO banco em arquivo, servidor reiniciado): o ajuste salvo continua valendo; voltar ao padrão funciona.
// Uso (a partir de packages/server, com o servidor da fase certa de pé na porta SERVER):
//   BALANCE_FASE=1 node test/balanceamento.mjs
//   BALANCE_FASE=2 node test/balanceamento.mjs
import { Client } from "colyseus.js";

const HTTP = process.env.SERVER ?? "http://localhost:2999";
const WS = HTTP.replace(/^http/, "ws");
const FASE = process.env.BALANCE_FASE ?? "1";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const until = async (fn, ms = 4000) => {
  const t0 = Date.now();
  while (Date.now() - t0 < ms) { if (await fn()) return true; await sleep(50); }
  return !!(await fn());
};
let fails = 0;
const check = (name, ok, detail = "") => {
  if (!ok) fails++;
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? "  -> " + detail : ""}`);
};
const rnd = () => Math.random().toString(10).slice(2, 8);

async function conta(prefixo) {
  const { token } = await (await fetch(`${HTTP}/auth/guest`, { method: "POST" })).json();
  const name = prefixo + rnd();
  const cr = await fetch(`${HTTP}/api/character`, { method: "POST", headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" }, body: JSON.stringify({ name, class: "warrior" }) });
  if (!cr.ok) throw new Error(`criar personagem: ${cr.status}`);
  return token;
}
const api = (token, metodo, caminho, corpo) =>
  fetch(`${HTTP}${caminho}`, {
    method: metodo,
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: corpo === undefined ? undefined : JSON.stringify(corpo),
  });
const listar = async (token) => {
  const r = await api(token, "GET", "/api/admin/balanceamento");
  const j = await r.json();
  if (!j.ajustes) throw new Error(`listar o balanceamento: status ${r.status} ${JSON.stringify(j)}`);
  return j.ajustes;
};
const ajuste = (lista, chave) => lista.find((a) => a.chave === chave);

// vida do lobo de nível 10 (zona 2): padrão = round(60 x 0,8 x 3,7) = 178; com o ajuste 90 = round(60 x 1,5 x 3,7) = 333
const VIDA_PADRAO = 178, VIDA_NOVA = 333;
// lobos vivos na zona 2 (Floresta Gélida), pela sala: a vida máxima mostra o valor efetivo
async function lobosDaZona(token) {
  const room = await new Client(WS).joinOrCreate("zone2", { token });
  const ev = { balance: null };
  room.onMessage("balance", (m) => (ev.balance = m));
  await new Promise((r) => (room.state?.enemies ? r() : room.onStateChange.once(r)));
  await until(() => ev.balance !== null);
  // o lobo de nível 10 (único lobo desse nível na zona 2): o teste não depende da ordem dos lobos nem da posição
  const lobos = () => { const out = []; room.state.enemies.forEach((e) => { if (e.kind === "wolf" && e.level === 10) out.push(e); }); return out; };
  return { room, ev, lobos };
}

if (FASE === "1") {
  const ADM = await conta("Adm");
  const N = await conta("Nao");

  console.log("\n== não-admin recebe 403 ==");
  const r1 = await api(N, "GET", "/api/admin/balanceamento");
  check("não-admin lê o mapa: 403", r1.status === 403, `status ${r1.status}`);
  const r2 = await api(N, "PUT", "/api/admin/balanceamento/inimigo.wolf.hp", { valor: 90, motivo: "tentativa" });
  check("não-admin não altera: 403", r2.status === 403, `status ${r2.status}`);
  const r3 = await api(N, "GET", "/api/admin/balanceamento/historico");
  check("não-admin não vê o histórico: 403", r3.status === 403, `status ${r3.status}`);

  console.log("\n== mapa gerado das definições ==");
  const lista = await listar(ADM);
  const lobo = ajuste(lista, "inimigo.wolf.hp");
  check("chave do lobo existe, com padrão 48 (60 x 0,8)", !!lobo && lobo.padrao === 48, JSON.stringify(lobo));
  check("chave de vida base do guerreiro (120)", ajuste(lista, "classe.warrior.vidaBase")?.padrao === 120);
  check("chave de dano da Investida (14)", ajuste(lista, "habilidade.warrior.skill1.dano")?.padrao === 14);
  check("cada chave traz nome em português e limites", lista.every((a) => a.nome && a.min >= 1 && a.max > a.padrao));
  const { room: lobosRoom, ev, lobos } = await lobosDaZona(ADM);
  check("o cliente recebe os valores efetivos ao entrar", ev.balance && ev.balance.valores["inimigo.wolf.hp"] === 48, JSON.stringify(ev.balance?.valores?.["inimigo.wolf.hp"]));
  const vidaAntes = lobos()[0]?.maxHp;
  check("lobo vivo com a vida padrão (178 no nível 10)", vidaAntes === VIDA_PADRAO, `maxHp ${vidaAntes}`);

  console.log("\n== admin muda a vida do lobo: vale na hora ==");
  const mudou = await api(ADM, "PUT", "/api/admin/balanceamento/inimigo.wolf.hp", { valor: 90, motivo: "lobo apanhando demais" });
  check("alteração aceita (200)", mudou.status === 200, `status ${mudou.status}`);
  const novaVida = VIDA_NOVA;
  check("lobo vivo recebe a vida nova (333)", await until(() => lobos()[0]?.maxHp === novaVida), `maxHp ${lobos()[0]?.maxHp}`);
  check("o cliente recebe a mudança sem reentrar", await until(() => ev.balance?.valores?.["inimigo.wolf.hp"] === 90), JSON.stringify(ev.balance?.valores?.["inimigo.wolf.hp"]));
  const depois = ajuste(await listar(ADM), "inimigo.wolf.hp");
  check("o painel mostra o valor atual e que foi alterado", depois.atual === 90 && depois.alterado === true, JSON.stringify(depois));

  console.log("\n== limites de segurança ==");
  const acima = await api(ADM, "PUT", "/api/admin/balanceamento/inimigo.wolf.hp", { valor: 999999, motivo: "teste" });
  check("valor acima do máximo é recusado (400)", acima.status === 400, `status ${acima.status}`);
  const abaixo = await api(ADM, "PUT", "/api/admin/balanceamento/inimigo.wolf.hp", { valor: 1, motivo: "teste" });
  check("valor abaixo do mínimo é recusado (400)", abaixo.status === 400, `status ${abaixo.status}`);
  const semMotivo = await api(ADM, "PUT", "/api/admin/balanceamento/inimigo.wolf.hp", { valor: 80, motivo: "  " });
  check("sem motivo é recusado (400)", semMotivo.status === 400, `status ${semMotivo.status}`);
  check("valor recusado não muda o lobo", lobos()[0]?.maxHp === novaVida);

  console.log("\n== desfazer volta o valor anterior ==");
  const hist = await (await api(ADM, "GET", "/api/admin/balanceamento/historico?chave=inimigo.wolf.hp")).json();
  const ultima = hist.historico[0];
  check("histórico guarda antes, depois, motivo e conta", ultima && ultima.antes === 48 && ultima.depois === 90 && ultima.motivo === "lobo apanhando demais" && !!ultima.conta && !!ultima.criadoEm, JSON.stringify(ultima));
  const desf = await api(ADM, "POST", `/api/admin/balanceamento/desfazer/${ultima.id}`, {});
  check("desfazer aceito (200)", desf.status === 200, `status ${desf.status}`);
  check("lobo volta à vida anterior (178)", await until(() => lobos()[0]?.maxHp === VIDA_PADRAO), `maxHp ${lobos()[0]?.maxHp}`);
  check("o painel volta ao padrão (48, não alterado)", await until(async () => { const a = ajuste(await listar(ADM), "inimigo.wolf.hp"); return a.atual === 48 && a.alterado === false; }));

  console.log("\n== salvo de novo para a fase 2 (reinício) ==");
  const de = await api(ADM, "PUT", "/api/admin/balanceamento/inimigo.wolf.hp", { valor: 90, motivo: "para a fase 2" });
  check("alteração salva para o reinício (200)", de.status === 200);
  lobosRoom.leave(true);
  await sleep(200);
} else if (FASE === "2") {
  const ADM = await conta("Adm2");
  console.log("\n== depois do reinício ==");
  const lista = await listar(ADM);
  const lobo = ajuste(lista, "inimigo.wolf.hp");
  check("o ajuste salvo continua valendo (90)", lobo?.atual === 90 && lobo?.alterado === true, JSON.stringify(lobo));
  const { room, lobos } = await lobosDaZona(ADM);
  check("lobo nasce/está com a vida salva (333 no nível 10)", await until(() => lobos()[0]?.maxHp === VIDA_NOVA), `maxHp ${lobos()[0]?.maxHp}`);
  const hist = await (await api(ADM, "GET", "/api/admin/balanceamento/historico?chave=inimigo.wolf.hp")).json();
  check("o histórico também sobrevive ao reinício", hist.historico.length >= 3, `entradas ${hist.historico.length}`);

  console.log("\n== voltar ao padrão ==");
  const pad = await api(ADM, "POST", "/api/admin/balanceamento/inimigo.wolf.hp/padrao", { motivo: "fim do teste" });
  check("voltar ao padrão aceito (200)", pad.status === 200, `status ${pad.status}`);
  check("lobo volta à vida padrão (178)", await until(() => lobos()[0]?.maxHp === VIDA_PADRAO), `maxHp ${lobos()[0]?.maxHp}`);
  const final = ajuste(await listar(ADM), "inimigo.wolf.hp");
  check("o painel mostra o padrão de novo", final.atual === 48 && final.alterado === false);
  room.leave(true);
}

console.log(fails ? `\n${fails} falha(s)` : "\nTudo certo.");
process.exit(fails ? 1 : 0);
