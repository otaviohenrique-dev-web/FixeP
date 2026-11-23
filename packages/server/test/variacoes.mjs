// Teste de ponta a ponta das variações de habilidade (C2.2).
// Modo "cidade" (padrão, personagem nasce na cidade, nível 10 pelo VARIACAO_TEST_LEVEL):
//   - a escolha de Q (nível 10) vale; W (nível 20) e variação de outra classe são recusadas;
//   - a escolha persiste ao reconectar; a base (id null) volta;
//   - a variação muda o efeito: Flecha Veloz (Perfurar com recarga de 2,5 s) libera o 2º uso em 3 s; sem ela (base, 4 s) não libera.
// Modo "zona" (VARIACAO_MODO=zona, personagem nasce numa zona de combate: sala zone1, com TEST_START_ZONE=1): a escolha é recusada fora da cidade.
// Uso: SERVER=http://localhost:2999 VARIACAO_TEST_LEVEL=10 node test/variacoes.mjs
import { Client } from "colyseus.js";

const HTTP = process.env.SERVER ?? "http://localhost:2999";
const WS = HTTP.replace(/^http/, "ws");
const MODO = process.env.VARIACAO_MODO ?? "cidade";
const SALA = MODO === "zona" ? "zone" : "zone4"; // "zone" = zona 1 (DEFAULT_ZONE, de combate); "zone4" = cidade (START_ZONE)
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const results = [];
const check = (name, ok, detail = "") => {
  results.push(ok);
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? "  -> " + detail : ""}`);
};

async function criar(cls) {
  const { token } = await (await fetch(`${HTTP}/auth/guest`, { method: "POST" })).json();
  const name = "Va" + Math.random().toString(10).slice(2, 8);
  const cr = await fetch(`${HTTP}/api/character`, { method: "POST", headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" }, body: JSON.stringify({ name, class: cls }) });
  if (!cr.ok) throw new Error("criar personagem de teste falhou " + cr.status);
  return token;
}
async function entrar(token) {
  const room = await new Client(WS).joinOrCreate(SALA, { token }); 
  await new Promise((r) => (room.state?.players ? r() : room.onStateChange.once(r)));
  const st = { denied: 0 };
  room.onMessage("act_denied", () => st.denied++);
  await sleep(300);
  return { room, st, me: () => room.state.players.get(room.sessionId) };
}
const escolhas = (s) => { try { return JSON.parse(s.me().variacoes || "{}"); } catch { return {}; } };

if (MODO === "zona") {
  console.log("\n== Fora da cidade: a escolha é recusada");
  const s = await entrar(await criar("archer"));
  s.room.send("variacao", { slot: "skill1", id: "a_per_veloz" });
  await sleep(400);
  check("fora da cidade a variação não é gravada", escolhas(s).skill1 === undefined, JSON.stringify(escolhas(s)));
  s.room.leave();
} else {
  console.log("\n== Nível e classe");
  const token = await criar("archer");
  let s = await entrar(token);
  check("personagem está no nível de teste (10)", s.me().level === 10, `nível ${s.me().level}`);
  s.room.send("variacao", { slot: "skill1", id: "w_inv_pesada" });
  await sleep(300);
  check("variação de outra classe é recusada", escolhas(s).skill1 === undefined, JSON.stringify(escolhas(s)));
  s.room.send("variacao", { slot: "skill2", id: "a_cil_dupla" });
  await sleep(300);
  check("W (nível 20) é recusado no nível 10", escolhas(s).skill2 === undefined, JSON.stringify(escolhas(s)));
  s.room.send("variacao", { slot: "skill1", id: "a_per_veloz" });
  await sleep(300);
  check("Q (nível 10) aceita a variação da própria classe", escolhas(s).skill1 === "a_per_veloz", JSON.stringify(escolhas(s)));

  console.log("\n== Persistência");
  s.room.leave();
  await sleep(800);
  s = await entrar(token);
  check("ao reconectar, a variação escolhida volta", escolhas(s).skill1 === "a_per_veloz", JSON.stringify(escolhas(s)));
  s.room.send("variacao", { slot: "skill1", id: null });
  await sleep(300);
  check("voltar à base (id null) limpa a escolha", escolhas(s).skill1 === undefined, JSON.stringify(escolhas(s)));
  s.room.send("variacao", { slot: "skill1", id: "a_per_veloz" });
  await sleep(300);
  s.room.leave();
  await sleep(800);

  console.log("\n== A variação muda o efeito (recarga de Perfurar)");
  // com Flecha Veloz a recarga cai de 4 s para 2,5 s: o 2º uso em 3 s é aceito
  s = await entrar(token);
  s.st.denied = 0;
  s.room.send("act", { a: "skill1", ax: s.me().x + 2, ay: s.me().y });
  await sleep(3000);
  const antes = s.st.denied;
  s.room.send("act", { a: "skill1", ax: s.me().x + 2, ay: s.me().y });
  await sleep(300);
  check("com Flecha Veloz, Perfurar liberada em 3 s (2º uso aceito)", s.st.denied === antes, `recusas ${s.st.denied - antes}`);
  s.room.leave();
  await sleep(800);

  // sem a variação (base): o mesmo teste é recusado
  const outro = await entrar(await criar("archer"));
  outro.st.denied = 0;
  outro.room.send("act", { a: "skill1", ax: outro.me().x + 2, ay: outro.me().y });
  await sleep(3000);
  const antes2 = outro.st.denied;
  outro.room.send("act", { a: "skill1", ax: outro.me().x + 2, ay: outro.me().y });
  await sleep(300);
  check("sem variação (base 4 s), o 2º uso em 3 s é recusado", outro.st.denied > antes2, `recusas ${outro.st.denied - antes2}`);
  outro.room.leave();
}

const falhas = results.filter((r) => !r).length;
console.log(`\n${results.length - falhas}/${results.length} verificações passaram`);
await sleep(200);
if (falhas) process.exit(1);
