// Testes de contas, criação de personagem e persistência (usa o servidor de teste, PGlite em memória).
// Uso: SERVER=http://localhost:2999 node test/persistence.mjs
import { Client } from "colyseus.js";

const HTTP = process.env.SERVER ?? "http://localhost:2999";
const WS = HTTP.replace(/^http/, "ws");
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const results = [];
const check = (name, ok, detail = "") => {
  results.push({ name, ok });
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? "  -> " + detail : ""}`);
};
const rnd = () => Math.random().toString(36).slice(2, 8);
const guest = async () => (await (await fetch(`${HTTP}/auth/guest`, { method: "POST" })).json()).token;
const api = (token, path, body) =>
  fetch(`${HTTP}/api${path}`, {
    method: body === undefined ? "GET" : "POST",
    headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}), "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
const joinOk = async (token) => {
  try {
    const room = await new Client(WS).joinOrCreate("zone", { token });
    await new Promise((r) => (room.state?.players ? r() : room.onStateChange.once(r)));
    return room;
  } catch { return null; }
};

console.log("\n== 1. Sem personagem ==");
const tk = await guest();
let r = await api(tk, "/me");
let body = await r.json();
check("conta nova não tem personagem", r.ok && body.character === null);
check("entrar na sala sem personagem é recusado", (await joinOk(tk)) === null);
check("/me sem token → 401", (await api(null, "/me")).status === 401);
check("/me com token falso → 401", (await api("lixo", "/me")).status === 401);
check("criar personagem sem token → 401", (await api(null, "/character", { name: "Abc" + rnd(), class: "warrior" })).status === 401);

console.log("\n== 2. Validação do nome e da classe ==");
const bad = [
  ["curto demais", { name: "ab", class: "warrior" }],
  ["longo demais", { name: "A".repeat(17), class: "warrior" }],
  ["símbolos (<script>)", { name: "<script>1</script>", class: "warrior" }],
  ["SQL injection", { name: "x'; drop table characters;--", class: "warrior" }],
  ["emoji", { name: "Heroi🔥🔥", class: "warrior" }],
  ["nome reservado", { name: "Admin", class: "warrior" }],
  ["nome reservado disfarçado", { name: "ÁdMin Real", class: "warrior" }],
  ["nome não é texto", { name: 12345, class: "warrior" }],
  ["nome é objeto", { name: { $ne: "" }, class: "warrior" }],
  ["sem nome", { class: "warrior" }],
  ["classe inexistente", { name: "Valido" + rnd(), class: "deus" }],
  ["classe __proto__", { name: "Valido" + rnd(), class: "__proto__" }],
  ["sem classe", { name: "Valido" + rnd() }],
];
for (const [label, payload] of bad) {
  const res = await api(tk, "/character", payload);
  check(`recusa: ${label}`, res.status === 400, `status ${res.status}`);
}
const meAfterBad = await (await api(tk, "/me")).json();
check("nenhuma tentativa inválida criou personagem", meAfterBad.character === null);

console.log("\n== 3. Criação e unicidade ==");
const base = rnd();
const name = `Zé${base}`;
r = await api(tk, "/character", { name, class: "warrior" });
body = await r.json();
check("criação válida → 201", r.status === 201 && body.character?.name === name && body.character.level === 1 && body.character.xp === 0, JSON.stringify(body.character));
r = await api(tk, "/character", { name: `Outro${rnd()}`, class: "warrior" });
check("segundo personagem na mesma conta → 409", r.status === 409);
const tk2 = await guest();
r = await api(tk2, "/character", { name: `ze${base}`, class: "warrior" }); // sem acento e minúsculo
check("nome repetido (ignora maiúsculas e acentos) → 409", r.status === 409);
r = await api(tk2, "/character", { name: `  ${name.toUpperCase()}  `, class: "warrior" });
check("nome repetido com espaços/caixa alta → 409", r.status === 409);
body = await (await api(tk, "/me")).json();
check("/me devolve o personagem criado", body.character?.name === name);

console.log("\n== 3a. As três classes são jogáveis ==");
for (const cls of ["warrior", "archer", "cleric"]) {
  const t = await guest();
  const res = await api(t, "/character", { name: `Cls${cls.slice(0, 3)}${rnd()}`, class: cls });
  const me2 = await (await api(t, "/me")).json();
  check(`criar personagem da classe ${cls} → 201 e a classe fica salva`, res.status === 201 && me2.character?.class === cls, `status ${res.status}, classe ${me2.character?.class}`);
}

console.log("\n== 3b. Corrida: pedidos simultâneos ==");
{
  const tkR = await guest();
  const outs = await Promise.all(Array.from({ length: 12 }, (_, i) => api(tkR, "/character", { name: `Race${i}${rnd()}`, class: "warrior" })));
  const created = outs.filter((o) => o.status === 201).length;
  check("12 criações simultâneas na mesma conta geram exatamente 1 personagem", created === 1, `${created} criados`);
}

console.log("\n== 4. Entrar no jogo e ganhar XP ==");
let room = await joinOk(tk);
check("conta com personagem entra na sala", room !== null);
if (room) {
  const me = () => room.state.players.get(room.sessionId);
  check("o jogador entra com o nome do personagem", me()?.name === name, me()?.name);
  check("o nível e o XP vêm do banco", me()?.level === 1 && me()?.xp === 0);
  const e1 = room.state.enemies.get("e1");
  room.send("move_to", { x: e1.x - 1.2, y: e1.y });
  await sleep(4000);
  const t0 = Date.now();
  while (e1.st !== "dead" && Date.now() - t0 < 40000 && !me().dead) {
    room.send("act", { a: Math.random() < 0.5 ? "attack" : "skill1", ax: e1.x, ay: e1.y });
    await sleep(700);
  }
  await sleep(300);
  check("matar um esqueleto dá XP no servidor", e1.st === "dead" && me().xp + (me().level - 1) * 70 >= 20, `nível ${me()?.level} xp ${me()?.xp}`);
  const xpNow = me().xp, lvNow = me().level;
  room.leave();
  await sleep(800);
  body = await (await api(tk, "/me")).json();
  check("o progresso foi salvo no banco ao sair", body.character?.xp === xpNow && body.character?.level === lvNow, `banco: nível ${body.character?.level} xp ${body.character?.xp}`);
  room = await joinOk(tk);
  check("ao voltar, o jogador retoma o XP salvo", room && room.state.players.get(room.sessionId)?.xp === xpNow, `xp ${room?.state.players.get(room.sessionId)?.xp}`);
  room?.leave();
}

const failed = results.filter((x) => !x.ok);
console.log(`\n${results.length - failed.length}/${results.length} verificações passaram`);
process.exit(failed.length ? 1 : 0);
