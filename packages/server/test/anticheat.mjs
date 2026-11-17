// Suíte anti-trapaça: age como um CLIENTE MALICIOSO e verifica que o servidor não cede.
// Uso: SERVER=http://localhost:2999 node test/anticheat.mjs   (servidor de teste rodando)
// Sai com código 1 se qualquer verificação falhar.
import { Client } from "colyseus.js";
import { SignJWT } from "jose";

const HTTP = process.env.SERVER ?? "http://localhost:2999";
const WS = HTTP.replace(/^http/, "ws");
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const results = [];
const check = (name, ok, detail = "") => {
  results.push({ name, ok });
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? "  -> " + detail : ""}`);
};

async function guest() {
  const r = await fetch(`${HTTP}/auth/guest`, { method: "POST" });
  const token = (await r.json()).token;
  // desde a F2 é preciso ter personagem para entrar na sala
  const name = "Bot" + Math.random().toString(36).slice(2, 8);
  const c = await fetch(`${HTTP}/api/character`, { method: "POST", headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" }, body: JSON.stringify({ name, class: "warrior" }) });
  if (!c.ok) throw new Error(`criar personagem de teste falhou: ${c.status}`);
  return token;
}
async function join(token) {
  const room = await new Client(WS).joinOrCreate("zone", { token: token ?? (await guest()) });
  await new Promise((r) => (room.state?.players ? r() : room.onStateChange.once(r)));
  const log = { swing: [], hit: [], left: null };
  room.onMessage("swing", (m) => log.swing.push(m));
  room.onMessage("hit", (m) => log.hit.push(m));
  room.onLeave((c) => (log.left = c));
  return { room, log, me: () => room.state.players.get(room.sessionId) };
}
const rejected = async (opts) => {
  try {
    const r = await new Client(WS).joinOrCreate("zone", opts);
    r.leave();
    return false;
  } catch {
    return true;
  }
};
const alive = async () => {
  try { return (await fetch(`${HTTP}/health`, { signal: AbortSignal.timeout(2000) })).ok; } catch { return false; }
};
const b64 = (o) => Buffer.from(JSON.stringify(o)).toString("base64url");

// ------------------------------------------------------------------ 1. autenticação
console.log("\n== 1. Autenticação ==");
check("sem token é recusado", await rejected({}));
check("token lixo é recusado", await rejected({ token: "lixo" }));
check("token de outro tipo (objeto) é recusado", await rejected({ token: { a: 1 } }));
const forged = await new SignJWT({ name: "hacker" }).setProtectedHeader({ alg: "HS256" }).setSubject("x").setExpirationTime("1h").sign(new TextEncoder().encode("segredo-errado-0123456789abcdef!!"));
check("JWT assinado com outro segredo é recusado", await rejected({ token: forged }));
check("JWT com alg=none é recusado", await rejected({ token: `${b64({ alg: "none", typ: "JWT" })}.${b64({ sub: "x", name: "hax", exp: 9999999999 })}.` }));
const expired = await new SignJWT({ name: "velho" }).setProtectedHeader({ alg: "HS256" }).setSubject("y").setExpirationTime(Math.floor(Date.now() / 1000) - 60).sign(new TextEncoder().encode("dev-only-secret-change-me-32-chars!!"));
check("JWT expirado é recusado", await rejected({ token: expired }));

// ------------------------------------------------------------------ 2. sessão única
console.log("\n== 2. Sessão única por conta ==");
{
  const tk = await guest();
  const a = await join(tk);
  const b = await join(tk);
  await sleep(500);
  check("segunda conexão da mesma conta derruba a primeira", a.log.left === 4001, `código ${a.log.left}`);
  b.room.leave();
}

// ------------------------------------------------------------------ 3. movimento / velocidade
console.log("\n== 3. Movimento ==");
{
  const c = await join();
  const p0 = { x: c.me().x, y: c.me().y };
  // tenta "acelerar" com campos maliciosos, num ritmo abaixo do limite de taxa (25 msg/s) para testar só a física
  const tMove = performance.now();
  for (let i = 0; i < 50; i++) {
    c.room.send("move_to", { x: 39, y: 39, speed: 9999, teleport: true, dt: 100, vx: 500 });
    await sleep(40);
  }
  await sleep(100);
  const elapsed = (performance.now() - tMove) / 1000; // tempo REAL decorrido (sleep do Node atrasa um pouco)
  const d = Math.hypot(c.me().x - p0.x, c.me().y - p0.y);
  const maxD = 4 * elapsed + 0.5; // 4 tiles/s + folga de 1 tick de rede
  check("o jogador realmente se moveu (validade do teste)", d > 4, `andou ${d.toFixed(2)} tiles`);
  check("não passa da velocidade máxima de 4 tiles/s", d <= maxD, `andou ${d.toFixed(2)} tiles em ${elapsed.toFixed(2)} s (máx ${maxD.toFixed(2)})`);
  c.room.send("move_to", { x: NaN, y: Infinity });
  c.room.send("move_to", { x: 1e308, y: -1e308 });
  await sleep(300);
  const m = c.me();
  check("coordenadas absurdas não saem do mapa nem viram NaN", Number.isFinite(m.x) && Number.isFinite(m.y) && m.x >= 0 && m.x <= 39 && m.y >= 0 && m.y <= 39, `pos ${m.x.toFixed(1)},${m.y.toFixed(1)}`);
  c.room.leave();
}

// ------------------------------------------------------------------ 4. combate
console.log("\n== 4. Combate ==");
{
  const c = await join();
  // spam de ataque: cooldown de 0,55 s => em ~1,2 s no máximo 3 golpes
  const t0 = Date.now();
  while (Date.now() - t0 < 1200) { c.room.send("act", { a: "attack", ax: 21, ay: 20 }); await sleep(40); }
  await sleep(200);
  check("spam de ataque respeita o cooldown", c.log.swing.length <= 3, `${c.log.swing.length} golpes em 1,2 s (máx 3)`);

  // skills: cada uma só pode sair 1x dentro do cooldown
  c.log.swing.length = 0;
  await sleep(700); // deixa o cooldown do ataque e do teste anterior fechar
  for (let i = 0; i < 8; i++) { for (const a of ["skill1", "skill2", "skill3", "dodge"]) c.room.send("act", { a, ax: 25, ay: 25 }); await sleep(160); }
  await sleep(300);
  const counts = Object.fromEntries(["skill1", "skill2", "skill3", "dodge"].map((a) => [a, c.log.swing.filter((s) => s.a === a).length]));
  check("cada skill sai no máximo 1x dentro do cooldown", Object.values(counts).every((n) => n <= 1), JSON.stringify(counts));

  // dano injetado no payload é ignorado: vai até um esqueleto e bate com dmg falso
  const e = c.room.state.enemies.get("e1");
  c.room.send("move_to", { x: e.x - 1.2, y: e.y });
  await sleep(4200);
  let before = e.hp;
  const hitsBefore = c.log.hit.length;
  await sleep(600);
  for (let i = 0; i < 3; i++) { c.room.send("act", { a: "attack", ax: e.x, ay: e.y, dmg: 99999, damage: 99999, hp: 0, crit: true, target: "e1" }); await sleep(650); }
  const dealt = c.log.hit.slice(hitsBefore).filter((h) => h.k === "e");
  const maxHit = Math.max(0, ...dealt.map((h) => h.dmg));
  check("dano injetado pelo cliente é ignorado (máx legítimo 12*1.1*1.5=20)", maxHit <= 20, dealt.length ? `maior hit ${maxHit}` : "nenhum hit (sem alcance)");
  check("o teste chegou a acertar o inimigo (validade do teste)", dealt.length > 0, `${dealt.length} hits`);
  c.room.leave();
}

// ------------------------------------------------------------------ 5. payloads malformados
console.log("\n== 5. Payloads malformados ==");
{
  const c = await join();
  const junk = [
    null, 0, 1, -1, "", "x", true, [], [1, 2, 3], {}, { a: null }, { a: "attack" }, { a: "attack", ax: "1", ay: "2" },
    { a: "attack", ax: Infinity, ay: -Infinity }, { a: "attack", ax: 1e308, ay: 1e308 }, { a: "__proto__", ax: 1, ay: 1 },
    { a: "constructor", ax: 1, ay: 1 }, { a: "toString", ax: 1, ay: 1 }, { a: ["attack"], ax: 1, ay: 1 }, { a: { x: 1 }, ax: 1, ay: 1 },
    { __proto__: { a: "attack" } }, { a: "x".repeat(1500), ax: 1, ay: 1 }, { x: {}, y: [] },
  ];
  for (const j of junk) {
    try { c.room.send("act", j); c.room.send("move_to", j); } catch { /* não serializa: ok */ }
    await sleep(45); // abaixo do limite de taxa: aqui o alvo é a validação, não o limitador
  }
  await sleep(1500); // deixa o limite de taxa repor as fichas gastas pelo lixo acima
  check("servidor segue de pé após payloads malformados", await alive());
  check("lixo bem formado (dentro do limite de taxa) não derruba o cliente", c.log.left === null, `saiu=${c.log.left}`);
  if (c.log.left === null) {
    const p = { x: c.me().x, y: c.me().y };
    c.room.send("move_to", { x: p.x + 3, y: p.y });
    await sleep(1200);
    check("sala continua respondendo normalmente", Math.hypot(c.me().x - p.x, c.me().y - p.y) > 1.5);
  }
  c.room.leave();
}
{
  // jogador legítimo e intenso: ~15 movimentos/s + 5 ações/s durante 6 s não pode ser punido
  const c = await join();
  const t0 = Date.now();
  let n = 0;
  while (Date.now() - t0 < 6000) {
    c.room.send("move_to", { x: 20 + (n % 5), y: 20 });
    if (n % 3 === 0) c.room.send("act", { a: "attack", ax: 21, ay: 20 });
    n++;
    await sleep(66);
  }
  check("jogador legítimo e intenso (~20 msg/s por 6 s) não é punido", c.log.left === null, `saiu=${c.log.left}, ${n} ciclos`);
  c.room.leave();
}
{
  // tipo de mensagem que o servidor não conhece: o Colyseus derruba esse cliente
  const c = await join();
  c.room.send("set_position", { x: 0, y: 0 });
  c.room.send("admin_give_item", { id: "espada_lendaria" });
  await sleep(600);
  check("mensagem de tipo desconhecido derruba o cliente", c.log.left !== null, `código ${c.log.left}`);
  check("servidor segue de pé após tipo desconhecido", await alive());
}

// ------------------------------------------------------------------ 6. tamanho e flood
console.log("\n== 6. Mensagem gigante e flood ==");
{
  const c = await join();
  let closed = false;
  c.room.onLeave(() => (closed = true));
  try { c.room.send("move_to", { x: 1, y: 1, lixo: "A".repeat(300_000) }); } catch { /* ok */ }
  await sleep(800);
  check("mensagem de 300 KB é recusada (conexão encerrada)", closed);
  check("servidor segue de pé após mensagem gigante", await alive());
}
{
  const c = await join();
  let kicked = null;
  c.room.onLeave((code) => (kicked = code));
  const t0 = Date.now();
  for (let i = 0; i < 20000; i++) c.room.send(i % 2 ? "act" : "move_to", { a: "attack", ax: 20, ay: 20, x: 20, y: 20 });
  await sleep(1500);
  const ping = Date.now();
  const ok = await alive();
  check("flood de 20 mil mensagens: servidor continua responsivo", ok && Date.now() - ping < 1000, `${Date.now() - ping} ms`);
  check("flood é punido (cliente desconectado)", kicked !== null, kicked !== null ? `código ${kicked}` : "cliente continuou conectado");
}

// ------------------------------------------------------------------ 7. estado local adulterado
console.log("\n== 7. Adulterar o estado no cliente ==");
{
  const a = await join();
  const b = await join();
  await sleep(400);
  const mine = a.me();
  try { mine.hp = 99999; mine.x = 1; mine.y = 1; mine.maxHp = 99999; } catch { /* ok */ }
  await sleep(1200);
  const seen = b.room.state.players.get(a.room.sessionId);
  check("alterar hp/posição localmente não afeta o servidor", seen && seen.hp <= 120 && seen.x > 5, `outro cliente vê hp=${seen?.hp} x=${seen?.x?.toFixed(1)}`);
  a.room.leave();
  b.room.leave();
}

// ------------------------------------------------------------------ 8. ping
console.log("\n== 8. Ping ==");
{
  const c = await join();
  const pongs = [];
  c.room.onMessage("pong", (m) => pongs.push(m));
  c.room.send("ping", { t: 123.5, lixo: "ignorado" });
  await sleep(500);
  check("o servidor devolve o mesmo carimbo de tempo (pong)", pongs.length === 1 && pongs[0].t === 123.5 && Object.keys(pongs[0]).length === 1, JSON.stringify(pongs));
  for (const t of ["x", null, NaN, Infinity, {}, [], undefined]) { c.room.send("ping", { t }); await sleep(40); }
  c.room.send("ping", "texto");
  c.room.send("ping", null);
  await sleep(500);
  check("ping com valores inválidos não gera resposta nem derruba o cliente", pongs.length === 1 && c.log.left === null, `pongs=${pongs.length} saiu=${c.log.left}`);
  check("ping a cada 2 s (uso normal) nunca é punido", await (async () => { for (let i = 0; i < 5; i++) { c.room.send("ping", { t: i }); await sleep(250); } return c.log.left === null && pongs.length === 6; })());
  c.room.leave();
}

// ------------------------------------------------------------------ resumo
const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} verificações passaram`);
process.exit(failed.length ? 1 : 0);
