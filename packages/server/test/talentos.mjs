// Teste de ponta a ponta dos talentos (C2.3).
// Modo "cidade" (padrão; personagem nasce na cidade, nível 10 pelo VARIACAO_TEST_LEVEL = 5 pontos; ECON_TEST=1 dá tostões):
//   - gasta pontos e respeita o máximo do talento e o limite de pontos do nível;
//   - a porta do ramo (nível 2 do ramo) é recusada sem os pontos do ramo;
//   - os bônus entram nos status: vida máxima e poder sobem ao gastar;
//   - reconectar mantém os ranks; reset na cidade zera tudo e cobra tostões; reconectar mantém o reset.
// Modo "zona" (TALENTO_MODO=zona; personagem nasce numa zona de combate, TEST_START_ZONE=1): gastar vale, reset é recusado.
// Uso: SERVER=http://localhost:2999 node test/talentos.mjs
import { Client } from "colyseus.js";

const HTTP = process.env.SERVER ?? "http://localhost:2999";
const WS = HTTP.replace(/^http/, "ws");
const MODO = process.env.TALENTO_MODO ?? "cidade";
const SALA = MODO === "zona" ? "zone" : "zone4"; // "zone" = zona 1 (combate); "zone4" = cidade (START_ZONE)
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const results = [];
const check = (name, ok, detail = "") => {
  results.push(ok);
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? "  -> " + detail : ""}`);
};

async function criar(cls) {
  const { token } = await (await fetch(`${HTTP}/auth/guest`, { method: "POST" })).json();
  const name = "Ta" + Math.random().toString(10).slice(2, 8);
  const cr = await fetch(`${HTTP}/api/character`, { method: "POST", headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" }, body: JSON.stringify({ name, class: cls }) });
  if (!cr.ok) throw new Error("criar personagem de teste falhou " + cr.status);
  return token;
}
async function entrar(token) {
  const room = await new Client(WS).joinOrCreate(SALA, { token });
  await new Promise((r) => (room.state?.players ? r() : room.onStateChange.once(r)));
  await sleep(300);
  return { room, me: () => room.state.players.get(room.sessionId) };
}
const esc = (s) => { try { return JSON.parse(s.me().talentos || "{}"); } catch { return {}; } };
const soma = (o) => Object.values(o).reduce((a, b) => a + b, 0);

if (MODO === "zona") {
  console.log("\n== Fora da cidade: gastar vale, reset é recusado");
  const token = await criar("warrior");
  const s = await entrar(token);
  s.room.send("talento", { id: "g_cou_vida" });
  await sleep(400);
  check("gastar ponto funciona fora da cidade", esc(s).g_cou_vida === 1, JSON.stringify(esc(s)));
  s.room.send("talento_resetar", {});
  await sleep(400);
  check("reset fora da cidade é recusado", esc(s).g_cou_vida === 1 && s.me().talentosResets === 0, `resets ${s.me().talentosResets}`);
  s.room.leave();
} else {
  console.log("\n== Pontos, máximo e porta do ramo (nível 10 = 5 pontos)");
  const token = await criar("warrior");
  let s = await entrar(token);
  check("personagem está no nível de teste (10)", s.me().level === 10, `nível ${s.me().level}`);
  const vidaInicial = s.me().maxHp;
  const poderInicial = s.me().poder;
  s.room.send("talento", { id: "g_fur_recarga" });
  await sleep(300);
  check("talento de nível 2 é recusado sem 3 pontos no ramo", (esc(s).g_fur_recarga ?? 0) === 0, JSON.stringify(esc(s)));
  for (let i = 0; i < 5; i++) s.room.send("talento", { id: "g_cou_vida" });
  await sleep(500);
  check("máximo do talento: 5 ranks, não mais", esc(s).g_cou_vida === 5, JSON.stringify(esc(s)));
  s.room.send("talento", { id: "g_cou_arm" });
  await sleep(300);
  check("sem pontos livres o próximo é recusado (5 de 5 gastos)", (esc(s).g_cou_arm ?? 0) === 0, JSON.stringify(esc(s)));
  check("bônus de vida entra no status (+10 por rank: 50)", s.me().maxHp === vidaInicial + 50, `maxHp ${vidaInicial} -> ${s.me().maxHp}`);
  check("poder total sobe com a vida", s.me().poder > poderInicial, `poder ${poderInicial} -> ${s.me().poder}`);

  console.log("\n== Reconectar mantém o estado");
  s.room.leave();
  await sleep(800);
  s = await entrar(token);
  check("ao reconectar, os ranks voltam", esc(s).g_cou_vida === 5, JSON.stringify(esc(s)));
  check("ao reconectar, o bônus continua no status", s.me().maxHp === vidaInicial + 50, `maxHp ${s.me().maxHp}`);

  console.log("\n== Reset na cidade (paga tostões: 50, depois 100)");
  let iron = null;
  s.room.onMessage("inv", (m) => { iron = m.iron; });
  s.room.send("inv_sync", {}); // pede a fotografia da mochila (o saldo: ECON_TEST dá 50000 ao personagem novo)
  await sleep(300);
  const saldoAntes = iron;
  s.room.send("talento_resetar", {});
  await sleep(500);
  check("reset zera todos os talentos", soma(esc(s)) === 0, JSON.stringify(esc(s)));
  check("reset conta 1 reset pago", s.me().talentosResets === 1, `resets ${s.me().talentosResets}`);
  check("reset devolve o status (vida volta ao base)", s.me().maxHp === vidaInicial, `maxHp ${s.me().maxHp}`);
  check("reset cobra 50 tostões", saldoAntes !== null && iron === saldoAntes - 50, `tostões ${saldoAntes} -> ${iron}`);
  s.room.send("talento", { id: "g_cou_vida" });
  await sleep(300);
  check("depois do reset dá para gastar de novo", esc(s).g_cou_vida === 1, JSON.stringify(esc(s)));
  s.room.send("talento_resetar", {});
  await sleep(500);
  check("2º reset cobra 100 tostões", iron === saldoAntes - 150, `tostões ${iron}`);
  check("2º reset conta (resets = 2)", s.me().talentosResets === 2, `resets ${s.me().talentosResets}`);
  s.room.send("talento_resetar", {});
  await sleep(400);
  check("reset sem talento gasto é recusado e não cobra", s.me().talentosResets === 2 && iron === saldoAntes - 150, `resets ${s.me().talentosResets}, tostões ${iron}`);

  console.log("\n== Reconectar depois do reset");
  s.room.send("talento", { id: "g_fur_dano" });
  await sleep(300);
  s.room.leave();
  await sleep(800);
  s = await entrar(token);
  check("gasto novo sobrevive a reconectar (g_fur_dano = 1)", esc(s).g_fur_dano === 1 && (esc(s).g_cou_vida ?? 0) === 0, JSON.stringify(esc(s)));
  check("contagem de resets volta ao reconectar (2)", s.me().talentosResets === 2, `resets ${s.me().talentosResets}`);
  s.room.leave();
}

const ok = results.filter(Boolean).length;
console.log(`\n${ok}/${results.length} verificações passaram.`);
process.exit(ok === results.length ? 0 : 1);
