// Teste de ponta a ponta da moderação mínima (C0.6): admin silencia, bane, desbane, denúncia e limite de denúncia.
// Uso: SERVER=http://localhost:2999 node test/moderacao.mjs   (servidor de teste com ADMIN_TEST_FIRST_GUEST=1:
// a PRIMEIRA conta criada no servidor vira admin; ver test/moderacao.unit.ts para ADMIN_ACCOUNT_IDS)
import { Client } from "colyseus.js";

const HTTP = process.env.SERVER ?? "http://localhost:2999";
const WS = HTTP.replace(/^http/, "ws");
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
const rnd = () => Math.random().toString(36).slice(2, 7);

// conta + personagem + sala da zona; ev guarda o que chegou
async function jogador(prefix) {
  const { token } = await (await fetch(`${HTTP}/auth/guest`, { method: "POST" })).json();
  const name = prefix + rnd().replace(/[^a-z0-9]/g, "x");
  const cr = await fetch(`${HTTP}/api/character`, { method: "POST", headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" }, body: JSON.stringify({ name, class: "warrior" }) });
  if (!cr.ok) throw new Error(`criar personagem: ${cr.status}`);
  const room = await new Client(WS).joinOrCreate("zone", { token });
  await new Promise((r) => (room.state?.players ? r() : room.onStateChange.once(r)));
  const ev = { chat: [], notice: [], left: null };
  room.onMessage("chat", (m) => ev.chat.push(m));
  room.onMessage("notice", (m) => ev.notice.push(String(m.text)));
  room.onLeave((c) => (ev.left = c));
  return { room, ev, name, token };
}
const ultimoAviso = (p, re) => p.ev.notice.some((t) => re.test(t));

// 1º cadastrado = admin (seam de teste); os demais são jogadores comuns
const ADM = await jogador("Adm");
const B = await jogador("Bea");
const C = await jogador("Ceu");
const D = await jogador("Dan");
await sleep(200);

console.log("\n== não-admin não modera ==");
D.room.send("chat", { text: `/silenciar ${B.name} 5 teste` });
D.room.send("chat", { text: `/banir ${B.name} teste` });
D.room.send("chat", { text: "/denuncias" });
const negou = await until(() => ultimoAviso(D, /administrador/i));
check("não-admin recebe 'reservado a administradores'", negou);
B.room.send("chat", { text: "ainda falo" }); // B não foi silenciado pelo não-admin
check("não-admin não silencia: B continua falando", await until(() => D.ev.chat.some((m) => m.text === "ainda falo")));
check("não-admin não bane: B segue na sala", B.ev.left === null);
check("o comando de admin não vaza para o chat", !D.ev.chat.some((m) => /silenciar|banir/.test(m.text)) && !ADM.ev.chat.some((m) => /silenciar|banir/.test(m.text)));

console.log("\n== admin silencia ==");
ADM.room.send("chat", { text: `/silenciar ${B.name} 5 spam` });
await until(() => ultimoAviso(ADM, /silenciado por 5 min/));
check("admin recebe confirmação", ultimoAviso(ADM, /silenciado por 5 min/), JSON.stringify(ADM.ev.notice.at(-1)));
const avisoB = await until(() => ultimoAviso(B, /silenciado até/));
check("o silenciado recebe o aviso com a hora", avisoB, JSON.stringify(B.ev.notice.at(-1)));
B.room.send("chat", { text: "mensagem silenciada" });
C.room.send("chat", { text: "marcador do silêncio" }); // ordem do servidor: quando o marcador chega, a de B já foi processada
await until(() => D.ev.chat.some((m) => m.text === "marcador do silêncio"));
check("mensagem do silenciado não chega aos outros", !D.ev.chat.some((m) => m.text === "mensagem silenciada") && !ADM.ev.chat.some((m) => m.text === "mensagem silenciada") && !C.ev.chat.some((m) => m.text === "mensagem silenciada"));
check("o silenciado não recebe o próprio eco", !B.ev.chat.some((m) => m.text === "mensagem silenciada"));
check("o silenciado continua na sala (silêncio não derruba)", B.ev.left === null);

console.log("\n== denúncia ==");
D.room.send("report", { name: C.name, motivo: "  xingou no chat  " });
const reg = await until(() => ultimoAviso(D, /Denúncia registrada/));
check("denúncia registrada e confirmada", reg, JSON.stringify(D.ev.notice.at(-1)));
D.room.send("report", { name: C.name, motivo: "de novo" });
const lim = await until(() => ultimoAviso(D, /Aguarde 1 minuto/));
check("segunda denúncia em menos de 1 minuto é limitada", lim);
const antes = D.ev.notice.length;
D.room.send("report", { name: D.name, motivo: "eu mesmo" }); // ignorada: nenhum aviso, nem o de limite
C.room.send("report", { name: C.name, motivo: "" }); // motivo vazio é recusado (C ainda não denunciou)
await until(() => ultimoAviso(C, /Escreva o motivo/));
check("motivo vazio é recusado", ultimoAviso(C, /Escreva o motivo/));
await sleep(200);
check("denúncia de si mesmo é ignorada (sem aviso)", D.ev.notice.length === antes);
ADM.room.send("chat", { text: "/denuncias" });
const listou = await until(() => ultimoAviso(ADM, /Denúncia #\d+ contra .*xingou no chat/));
check("a denúncia aparece na lista do admin (/denuncias)", listou, JSON.stringify(ADM.ev.notice.filter((t) => /Denúncia/.test(t)).at(-1)));

console.log("\n== banimento ==");
ADM.room.send("chat", { text: `/banir ${C.name} golpe` });
const caiu = await until(() => C.ev.left !== null);
check("admin bane: a sessão online do banido é derrubada", caiu, `código ${C.ev.left}`);
let recusou = false, msg = "";
try { await new Client(WS).joinOrCreate("zone", { token: C.token }); } catch (e) { recusou = true; msg = String(e?.message ?? e); }
check("banido é recusado ao entrar de novo", recusou && /banid/i.test(msg), msg);

console.log("\n== desbanimento ==");
ADM.room.send("chat", { text: `/desbanir ${C.name}` });
await until(() => ultimoAviso(ADM, /desbanido/));
let entrou = false;
try { const r = await new Client(WS).joinOrCreate("zone", { token: C.token }); entrou = true; r.leave(); } catch { entrou = false; }
check("depois de desbanir, a conta volta a entrar", entrou);

console.log("\n== uso incorreto ==");
ADM.room.send("chat", { text: "/banir" });
const uso = await until(() => ultimoAviso(ADM, /Use: \/banir/));
check("comando sem argumentos mostra o uso", uso);

for (const p of [ADM, B, C, D]) p.room.leave();
console.log(`\n${fails ? `${fails} FALHA(S)` : "Todas as verificações passaram."}`);
if (fails) process.exit(1);
