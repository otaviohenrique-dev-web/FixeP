// Teste de ponta a ponta dos loadouts (C2.4): 3 slots de build por personagem.
// Fase "1" (VARIACAO_TEST_LEVEL=10, cidade): salva o build atual em slot, aplica outro (troca variações e talentos de uma vez),
//   renomeia (16 caracteres, sanitizado), reconecta e confere que o build ativo e os nomes voltam.
// Fase "2" (mesmo banco persistido, VARIACAO_TEST_LEVEL=6): o build de 5 pontos NÃO aplica no nível 6 (recusa com a conta);
//   slot vazio também é recusado; renomear continua valendo.
// Fase "zona" (personagem nasce numa zona de combate, TEST_START_ZONE=1): salvar e aplicar são recusados fora da cidade; renomear vale.
// Uso (a partir de packages/server, com o servidor da fase certa já de pé na porta SERVER):
//   LOADOUT_FASE=1 LOADOUT_TOKEN_FILE=/tmp/t.txt node test/loadouts.mjs
import { readFileSync, writeFileSync } from "node:fs";
import { Client } from "colyseus.js";

const HTTP = process.env.SERVER ?? "http://localhost:2999";
const WS = HTTP.replace(/^http/, "ws");
const FASE = process.env.LOADOUT_FASE ?? "1";
const TOKEN_FILE = process.env.LOADOUT_TOKEN_FILE ?? "loadouts-token.txt";
const SALA = FASE === "zona" ? "zone" : "zone4"; // "zone" = zona 1 (combate); "zone4" = cidade (Brasalume)
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const results = [];
const check = (name, ok, detail = "") => {
  results.push(ok);
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? "  -> " + detail : ""}`);
};

async function criar(cls) {
  const { token } = await (await fetch(`${HTTP}/auth/guest`, { method: "POST" })).json();
  const name = "Lo" + Math.random().toString(10).slice(2, 8);
  const cr = await fetch(`${HTTP}/api/character`, { method: "POST", headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" }, body: JSON.stringify({ name, class: cls }) });
  if (!cr.ok) throw new Error("criar personagem de teste falhou " + cr.status);
  return token;
}
async function entrar(token) {
  const room = await new Client(WS).joinOrCreate(SALA, { token });
  await new Promise((r) => (room.state?.players ? r() : room.onStateChange.once(r)));
  const avisos = [];
  room.onMessage("notice", (m) => avisos.push(String(m.text)));
  await sleep(300);
  return { room, avisos, me: () => room.state.players.get(room.sessionId) };
}
const json = (s, fallback) => { try { return JSON.parse(s || "null") ?? fallback; } catch { return fallback; } };
const builds = (s) => json(s.me().loadouts, { ativo: -1, slots: [] });
const talentos = (s) => json(s.me().talentos, {});
const variacoes = (s) => json(s.me().variacoes, {});
const ultimoAviso = (s) => s.avisos[s.avisos.length - 1] ?? "";
const esperaGravar = () => sleep(800); // as gravações rodam em fila: espera antes de sair ou reconectar

if (FASE === "1") {
  console.log("\n== Montar dois builds na cidade (nível 10: 5 pontos de talento e Q liberada)");
  const token = await criar("archer");
  let s = await entrar(token);
  check("personagem está no nível de teste (10)", s.me().level === 10, `nível ${s.me().level}`);
  check("começa sem builds salvos e sem build em uso", builds(s).ativo === -1 && builds(s).slots.every((x) => !x.salvo));
  s.room.send("variacao", { slot: "skill1", id: "a_per_veloz" });
  s.room.send("talento", { id: "a_pre_dano" });
  s.room.send("talento", { id: "a_pre_dano" });
  s.room.send("talento", { id: "a_pre_dano" });
  s.room.send("talento", { id: "a_pre_crit" });
  s.room.send("talento", { id: "a_pre_crit" });
  await sleep(400);
  check("build atual: Q Flecha Veloz e 5 pontos gastos", variacoes(s).skill1 === "a_per_veloz" && talentos(s).a_pre_dano === 3 && talentos(s).a_pre_crit === 2, JSON.stringify({ v: variacoes(s), t: talentos(s) }));

  s.room.send("loadout_salvar", { slot: 0 });
  await sleep(400);
  check("salvar slot 0 grava o build e o torna o ativo", builds(s).slots[0]?.salvo === true && builds(s).ativo === 0, JSON.stringify(builds(s).slots[0]));
  check("salvar não mexe no nome padrão", builds(s).slots[0]?.nome === "Build 1");

  s.room.send("talento_resetar", {});
  await sleep(400);
  check("reset dos talentos (cidade, tostões) limpa os pontos", Object.keys(talentos(s)).length === 0, JSON.stringify(talentos(s)));
  s.room.send("variacao", { slot: "skill1", id: null });
  s.room.send("talento", { id: "a_cac_vida" });
  s.room.send("talento", { id: "a_cac_vida" });
  s.room.send("talento", { id: "a_cac_vida" });
  s.room.send("talento", { id: "a_cac_vida" });
  s.room.send("talento", { id: "a_cac_vida" });
  await sleep(400);
  s.room.send("loadout_salvar", { slot: 1 });
  await sleep(400);
  check("segundo build salvo no slot 1 e ativo", builds(s).slots[1]?.salvo === true && builds(s).ativo === 1);

  console.log("\n== Aplicar troca tudo de uma vez, sem custo");
  s.room.send("loadout_aplicar", { slot: 0 });
  await sleep(400);
  check("aplicar slot 0 devolve a variação Q e os talentos do build", variacoes(s).skill1 === "a_per_veloz" && talentos(s).a_pre_dano === 3 && talentos(s).a_pre_crit === 2 && talentos(s).a_cac_vida === undefined, JSON.stringify({ v: variacoes(s), t: talentos(s) }));
  check("aplicar marca o slot 0 como ativo", builds(s).ativo === 0);
  check("aviso de aplicado", ultimoAviso(s).includes("aplicado"), ultimoAviso(s));

  console.log("\n== Renomear (16 caracteres, sanitizado)");
  s.room.send("loadout_nome", { slot: 0, nome: "   Arqueiro   Veloz demais   " });
  await sleep(400);
  const nomeLongo = builds(s).slots[0]?.nome ?? "";
  check("nome aparado, espaços colapsados e no máximo de 16", nomeLongo.length <= 16 && nomeLongo.startsWith("Arqueiro Veloz"), `"${nomeLongo}" (${nomeLongo.length})`);
  s.room.send("loadout_nome", { slot: 2, nome: "<>\u0007" });
  await sleep(400);
  check("nome só com marcação vira o padrão do slot", builds(s).slots[2]?.nome === "Build 3", builds(s).slots[2]?.nome);

  console.log("\n== Persistência: reconectar mantém builds, nomes e o build ativo");
  await esperaGravar();
  s.room.leave();
  await sleep(800);
  s = await entrar(token);
  check("ao reconectar, o build ativo (slot 0) volta", builds(s).ativo === 0, JSON.stringify(builds(s).ativo));
  check("ao reconectar, o nome e o slot 1 voltam", builds(s).slots[0]?.nome === nomeLongo && builds(s).slots[1]?.salvo === true);
  check("ao reconectar, as variações e os talentos do build ativo voltam", variacoes(s).skill1 === "a_per_veloz" && talentos(s).a_pre_dano === 3);
  writeFileSync(TOKEN_FILE, token);
  s.room.leave();
  await esperaGravar();
} else if (FASE === "2") {
  console.log("\n== Mesmo personagem, agora no nível 6 (1 ponto de talento)");
  const token = readFileSync(TOKEN_FILE, "utf8").trim();
  let s = await entrar(token);
  check("nível caiu para 6 neste teste", s.me().level === 6, `nível ${s.me().level}`);
  check("builds salvos seguem no banco depois do reinício", builds(s).slots[0]?.salvo === true && builds(s).slots[1]?.salvo === true);

  console.log("\n== Nível insuficiente: o build de 5 pontos (slot 1, só talentos) é recusado");
  const antes = JSON.stringify(talentos(s));
  const ativoAntes = builds(s).ativo;
  s.room.send("loadout_aplicar", { slot: 1 });
  await sleep(400);
  check("aplicar recusado com a conta de pontos em PT-BR", ultimoAviso(s).includes("5 ponto") && ultimoAviso(s).includes("nível 6"), ultimoAviso(s));
  check("recusa não muda os talentos", JSON.stringify(talentos(s)) === antes, `${antes} -> ${JSON.stringify(talentos(s))}`);
  check("recusa não troca o build em uso", builds(s).ativo === ativoAntes);
  console.log("\n== Variação que o nível ainda não libera (slot 0: Q, nível 10) é recusada");
  s.room.send("loadout_aplicar", { slot: 0 });
  await sleep(400);
  check("aplicar recusado com o nível que a variação libera", ultimoAviso(s).includes("nível 10") && ultimoAviso(s).includes("nível 6"), ultimoAviso(s));

  console.log("\n== Slot vazio é recusado");
  s.room.send("loadout_aplicar", { slot: 2 });
  await sleep(400);
  check("aplicar slot vazio recusado com aviso", ultimoAviso(s).includes("vazio"), ultimoAviso(s));
  s.room.send("loadout_aplicar", { slot: 7 });
  await sleep(300);
  check("slot fora de 0 a 2 é ignorado sem quebrar", s.room.connection.isOpen === true);

  console.log("\n== Renomear continua valendo no nível 6");
  s.room.send("loadout_nome", { slot: 1, nome: "Cacador" });
  await sleep(400);
  check("renomeado no nível 6", builds(s).slots[1]?.nome === "Cacador", builds(s).slots[1]?.nome);
  await esperaGravar();
  s.room.leave();
  await sleep(500);
} else if (FASE === "zona") {
  console.log("\n== Em zona de combate: salvar e aplicar são recusados (renomear vale)");
  const token = await criar("archer");
  const s = await entrar(token);
  s.room.send("loadout_salvar", { slot: 0 });
  await sleep(400);
  check("salvar recusado fora da cidade com aviso", ultimoAviso(s).includes("cidade"), ultimoAviso(s));
  check("nenhum build foi gravado", builds(s).slots.every((x) => !x.salvo));
  s.room.send("loadout_aplicar", { slot: 0 });
  await sleep(400);
  check("aplicar recusado fora da cidade", ultimoAviso(s).includes("cidade"), ultimoAviso(s));
  s.room.send("loadout_nome", { slot: 0, nome: "Em combate" });
  await sleep(400);
  check("renomear vale fora da cidade", builds(s).slots[0]?.nome === "Em combate", builds(s).slots[0]?.nome);
  s.room.leave();
}

const falhas = results.filter((r) => !r).length;
console.log(`\n${results.length - falhas}/${results.length} verificações passaram.`);
if (falhas > 0) process.exit(1);
