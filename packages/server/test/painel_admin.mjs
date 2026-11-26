// Teste do painel de administração (F1): 403/401, código de 2FA (uso único, tentativas e pedidos), e-mail mascarado,
// revelação registrada na auditoria e banimento pelo painel que derruba a conexão.
// Uso: SERVER=http://localhost:2999 PAINEL_CODIGO_FILE=../../.data/painel-test-codigo.txt node test/painel_admin.mjs
// (servidor de teste com ADMIN_TEST_FIRST_GUEST=1 e PAINEL_CODIGO_ARQUIVO com o mesmo arquivo; ver run-all.sh)
import { Client } from "colyseus.js";
import { readFile, rm } from "node:fs/promises";

const HTTP = process.env.SERVER ?? "http://localhost:2999";
const WS = HTTP.replace(/^http/, "ws");
const ARQ = process.env.PAINEL_CODIGO_FILE;
if (!ARQ) throw new Error("defina PAINEL_CODIGO_FILE (o mesmo arquivo que o servidor de teste grava)");
const EMAIL_TESTE = "teste-painel@example.com"; // o servidor de teste dá este e-mail às contas de teste
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const until = async (fn, ms = 3000) => {
  const t0 = Date.now();
  while (Date.now() - t0 < ms) { if (await fn()) return true; await sleep(40); }
  return !!(await fn());
};
let fails = 0;
const check = (name, ok, detail = "") => {
  if (!ok) fails++;
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? "  -> " + detail : ""}`);
};
const rnd = () => Math.random().toString(10).slice(2, 7);

// chamada à API do painel: token do jogo sempre; token do painel quando houver
async function api(metodo, caminho, { token, painel, corpo } = {}) {
  const cab = { Authorization: `Bearer ${token}` };
  if (corpo !== undefined) cab["Content-Type"] = "application/json";
  if (painel) cab["X-Painel-Token"] = painel;
  const res = await fetch(`${HTTP}/api/admin${caminho}`, { method: metodo, headers: cab, body: corpo === undefined ? undefined : JSON.stringify(corpo) });
  const body = await res.json().catch(() => ({}));
  return { status: res.status, body };
}

// conta + personagem + sala da zona; o primeiro convidado criado no servidor de teste vira admin
async function jogador(prefix) {
  const { token } = await (await fetch(`${HTTP}/auth/guest`, { method: "POST" })).json();
  const name = prefix + rnd().replace(/[^a-z0-9]/g, "x");
  const cr = await fetch(`${HTTP}/api/character`, { method: "POST", headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" }, body: JSON.stringify({ name, class: "warrior" }) });
  if (!cr.ok) throw new Error(`criar personagem: ${cr.status}`);
  const { character } = await cr.json();
  const room = await new Client(WS).joinOrCreate("zone", { token });
  await new Promise((r) => (room.state?.players ? r() : room.onStateChange.once(r)));
  const ev = { left: null };
  room.onLeave((c) => (ev.left = c));
  return { room, ev, name, token, charId: character.id };
}

// código do painel: lê a última linha do arquivo que o servidor de teste grava, esperando uma linha nova
async function linhasCodigo() {
  return (await readFile(ARQ, "utf8").catch(() => "")).split("\n").filter(Boolean);
}
async function pedirCodigo(token) {
  const antes = (await linhasCodigo()).length;
  const r = await api("POST", "/codigo", { token });
  if (r.status !== 200) return { status: r.status, codigo: null, body: r.body };
  await until(async () => (await linhasCodigo()).length > antes);
  return { status: 200, codigo: (await linhasCodigo()).at(-1), body: r.body };
}
const sessao = (token, codigo) => api("POST", "/sessao", { token, corpo: { codigo } });
const diferente = (c) => (c === "000001" ? "000002" : "000001");

const ADM = await jogador("Adm"); // o 1º convidado do servidor de teste é o admin
const B = await jogador("Bea"); // conta comum
const T = await jogador("Tia"); // alvo da lista, da revelação e do banimento
await rm(ARQ, { force: true });
await sleep(150);

console.log("\n== não-admin recebe 403");
check("GET /visao sem ser admin => 403", (await api("GET", "/visao", { token: B.token })).status === 403);
check("POST /codigo sem ser admin => 403", (await api("POST", "/codigo", { token: B.token })).status === 403);
check("POST /sessao sem ser admin => 403", (await sessao(B.token, "123456")).status === 403);

console.log("\n== admin sem código recebe 401");
check("admin sem token do painel => 401", (await api("GET", "/visao", { token: ADM.token })).status === 401);
check("admin com token do painel inventado => 401", (await api("GET", "/visao", { token: ADM.token, painel: "x.y.z" })).status === 401);
check("sem sessão de jogo => 401", (await api("GET", "/visao", {})).status === 401);

console.log("\n== fluxo do código (pelo log de teste)");
const c1 = await pedirCodigo(ADM.token);
check("pedido de código => 200 e o código foi gravado", c1.status === 200 && /^\d{6}$/.test(c1.codigo ?? ""), c1.codigo ? "(6 dígitos gravados)" : JSON.stringify(c1.body));
const errado1 = await sessao(ADM.token, diferente(c1.codigo));
check("código errado => 401", errado1.status === 401);
const ok1 = await sessao(ADM.token, c1.codigo);
check("código certo => 200 com token do painel", ok1.status === 200 && typeof ok1.body.token === "string", JSON.stringify(ok1.body).slice(0, 80));
const PAINEL = ok1.body.token;
check("com o token do painel, /visao => 200", (await api("GET", "/visao", { token: ADM.token, painel: PAINEL })).status === 200);
check("o token do painel não serve como sessão do jogo", (await fetch(`${HTTP}/api/me`, { headers: { Authorization: `Bearer ${PAINEL}` } })).status === 401);

console.log("\n== código vale uma única vez");
const reuso = await sessao(ADM.token, c1.codigo);
check("reenviar o mesmo código => 401", reuso.status === 401, reuso.body.error);

console.log("\n== limite de tentativas (5 por código)");
const c2 = await pedirCodigo(ADM.token);
let erros = 0;
for (let i = 0; i < 5; i++) if ((await sessao(ADM.token, diferente(c2.codigo))).status === 401) erros++;
check("5 tentativas erradas => todas 401", erros === 5, `${erros}/5`);
const certoDepois = await sessao(ADM.token, c2.codigo);
check("depois de 5 erros, o código certo já não vale", certoDepois.status === 401, certoDepois.body.error);

console.log("\n== limite de pedidos de código (3 a cada 10 min)");
const p3 = await pedirCodigo(ADM.token);
check("3º pedido => 200", p3.status === 200);
const p4 = await api("POST", "/codigo", { token: ADM.token });
check("4º pedido => 429", p4.status === 429, p4.body.error);

// a partir daqui, o admin usa o token do painel obtido acima
const CP = { token: ADM.token, painel: PAINEL };

console.log("\n== lista mascara o e-mail");
const busca = await api("GET", `/jogadores?q=${encodeURIComponent(T.name)}`, CP);
const itemT = busca.body.itens?.find((i) => i.nome === T.name);
check("busca encontra o jogador", !!itemT);
check("e-mail aparece mascarado na lista", itemT?.emailMascarado === "te***@example.com", itemT?.emailMascarado);
check("o e-mail completo não aparece na resposta da lista", !JSON.stringify(busca.body).includes(EMAIL_TESTE));

console.log("\n== revelar grava a auditoria");
const rev = await api("POST", `/jogadores/${T.charId}/revelar`, CP);
check("revelar devolve o e-mail completo", rev.status === 200 && rev.body.email === EMAIL_TESTE);
const aud = await api("GET", "/auditoria?limite=50", CP);
const reg = aud.body.itens?.find((a) => a.acao === "revelar_email" && a.alvo_nome === T.name);
check("a revelação ficou no log de auditoria", !!reg, reg ? `por ${reg.admin}` : "sem registro");
check("a auditoria não guarda o e-mail completo", !JSON.stringify(aud.body).includes(EMAIL_TESTE));

console.log("\n== banir pelo painel derruba a conexão");
const ban = await api("POST", `/jogadores/${T.charId}/sancao`, { ...CP, corpo: { acao: "banir", permanente: true, motivo: "teste F1" } });
check("banir => 200", ban.status === 200, ban.body.error);
const caiu = await until(() => T.ev.left !== null, 3000);
check("a conexão do banido cai", caiu, `código ${T.ev.left}`);
check("a queda usa o código de banimento (4003)", T.ev.left === 4003);
let entrou = true;
try { await new Client(WS).joinOrCreate("zone", { token: T.token }); } catch { entrou = false; }
check("o banido não consegue entrar de novo", !entrou);
const aud2 = await api("GET", "/auditoria?limite=50", CP);
check("o banimento ficou na auditoria", aud2.body.itens?.some((a) => a.acao === "banir" && a.alvo_nome === T.name));
const desban = await api("POST", `/jogadores/${T.charId}/sancao`, { ...CP, corpo: { acao: "desbanir" } });
check("desbanir => 200", desban.status === 200);

console.log(`\n${fails === 0 ? "TUDO OK" : `${fails} FALHA(S)`}`);
process.exit(fails ? 1 : 0);
