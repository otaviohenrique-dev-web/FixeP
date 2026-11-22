// Teste de ponta a ponta do chat da zona: entrega, limite de tamanho, flood, HTML, nome forjado.
// Uso: SERVER=http://localhost:2999 node test/chat.mjs   (servidor de teste sem carregar o .env)
import { Client } from "colyseus.js";

const HTTP = process.env.SERVER ?? "http://localhost:2999";
const WS = HTTP.replace(/^http/, "ws");
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let fails = 0;
const check = (name, ok, detail = "") => {
  if (!ok) fails++;
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? "  -> " + detail : ""}`);
};

async function spawn(prefix) {
  const { token } = await (await fetch(`${HTTP}/auth/guest`, { method: "POST" })).json();
  const name = prefix + Math.random().toString(10).slice(2, 7);
  const cr = await fetch(`${HTTP}/api/character`, { method: "POST", headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" }, body: JSON.stringify({ name, class: "warrior" }) });
  if (!cr.ok) throw new Error(`criar personagem: ${cr.status}`);
  const room = await new Client(WS).joinOrCreate("zone", { token });
  await new Promise((r) => (room.state?.players ? r() : room.onStateChange.once(r)));
  const ev = { chat: [], notice: [], left: null };
  room.onMessage("chat", (m) => ev.chat.push(m));
  room.onMessage("notice", (m) => ev.notice.push(String(m.text)));
  room.onLeave((c) => (ev.left = c));
  return { room, ev, name };
}

const A = await spawn("Ca");
const B = await spawn("Cb");
await sleep(300);

console.log("\n== entrega ==");
A.room.send("chat", { text: "  Olá,   mundo!  " });
await sleep(300);
const got = B.ev.chat.at(-1);
check("outro jogador recebe a mensagem (espaços normalizados)", got?.text === "Olá, mundo!", JSON.stringify(got));
check("o nome vem do personagem", got?.name === A.name, got?.name);
check("o remetente também recebe (eco)", A.ev.chat.at(-1)?.text === "Olá, mundo!");

console.log("\n== nome forjado ==");
A.room.send("chat", { text: "eu sou outro", name: "Admin", id: B.room.sessionId });
await sleep(300);
const forged = B.ev.chat.at(-1);
check("o nome/id enviados pelo cliente são ignorados", forged?.text === "eu sou outro" && forged.name === A.name && forged.id === A.room.sessionId, JSON.stringify(forged));

console.log("\n== tamanho ==");
const n0 = B.ev.chat.length;
A.room.send("chat", { text: "x".repeat(200) });
await sleep(250);
check("200 caracteres passam", B.ev.chat.length === n0 + 1 && B.ev.chat.at(-1).text.length === 200);
A.room.send("chat", { text: "x".repeat(201) });
await sleep(250);
check("201 caracteres são recusados (com aviso)", B.ev.chat.length === n0 + 1 && A.ev.notice.some((t) => /longa/i.test(t)));
A.room.send("chat", { text: "   " });
A.room.send("chat", { text: "" });
A.room.send("chat", { text: 123 });
A.room.send("chat", {});
await sleep(250);
check("vazio, só espaços e tipos errados são descartados", B.ev.chat.length === n0 + 1);
check("a conexão continua de pé", A.ev.left === null);

console.log("\n== HTML e caracteres de controle ==");
await sleep(8200); // zera a janela anti-spam
A.room.send("chat", { text: '<img src=x onerror=alert(1)>oi<script>alert(2)</script>' });
await sleep(250);
const html = B.ev.chat.at(-1)?.text ?? "";
check("tags HTML removidas (sem < nem >)", !/[<>]/.test(html) && html.includes("oi"), JSON.stringify(html));
A.room.send("chat", { text: "a\u0000b\u0007c‮d\r\ne" });
await sleep(250);
const ctl = B.ev.chat.at(-1)?.text ?? "";
check("caracteres de controle removidos", !/[\u0000-\u001f‮]/.test(ctl) && ctl.startsWith("a"), JSON.stringify(ctl));

console.log("\n== flood ==");
await sleep(8200);
const f0 = B.ev.chat.length;
for (let i = 0; i < 12; i++) A.room.send("chat", { text: `spam ${i}` });
await sleep(500);
const delivered = B.ev.chat.length - f0;
check("no máximo 5 mensagens por janela", delivered === 5, `entregues ${delivered}`);
check("excesso gera aviso, sem derrubar a conexão", A.ev.notice.some((t) => /rápido/i.test(t)) && A.ev.left === null);
await sleep(8200);
A.room.send("chat", { text: "voltei" });
await sleep(250);
check("depois da janela volta a funcionar", B.ev.chat.at(-1)?.text === "voltei");

console.log("\n== tipo desconhecido continua desconectando ==");
for (let i = 0; i < 3; i++) B.room.send("tipo_inexistente", {});
await sleep(500);
check("mensagem de tipo desconhecido derruba o cliente", B.ev.left !== null, `código ${B.ev.left}`);

A.room.leave();
console.log(fails ? `\n${fails} FALHA(S)` : "\nTudo certo.");
process.exit(fails ? 1 : 0);
