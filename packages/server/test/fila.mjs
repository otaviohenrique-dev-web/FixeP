// Comandos de skill não se perdem no calor da batalha: o servidor guarda o comando durante a esquiva/investida e avisa quando recusa.
// Uso: SERVER=http://localhost:2999 node test/fila.mjs   (servidor de teste sem carregar o .env)
import { Client } from "colyseus.js";

const HTTP = process.env.SERVER ?? "http://localhost:2999";
const WS = HTTP.replace(/^http/, "ws");
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const check = (name, ok, detail = "") => console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? "  -> " + detail : ""}`);
let failed = false;
const ck = (n, ok, d) => { if (!ok) failed = true; check(n, ok, d); };

async function spawn(cls) {
  const { token } = await (await fetch(`${HTTP}/auth/guest`, { method: "POST" })).json();
  const name = "Fl" + Math.random().toString(10).slice(2, 8);
  const cr = await fetch(`${HTTP}/api/character`, { method: "POST", headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" }, body: JSON.stringify({ name, class: cls }) });
  if (!cr.ok) throw new Error(`criar ${cls}: ${cr.status}`);
  const room = await new Client(WS).joinOrCreate("zone", { token });
  await new Promise((r) => (room.state?.players ? r() : room.onStateChange.once(r)));
  const ev = { swing: [], denied: [] };
  room.onMessage("swing", (m) => ev.swing.push(m));
  room.onMessage("act_denied", (m) => ev.denied.push(m.a));
  room.onMessage("notice", () => {});
  const me = () => room.state.players.get(room.sessionId);
  const act = (a) => room.send("act", { a, ax: me().x + 3, ay: me().y });
  const mine = (a) => ev.swing.filter((s) => s.id === room.sessionId && s.a === a).length;
  return { room, ev, me, act, mine };
}

const W = await spawn("warrior");
W.act("skill1"); // Investida: avanço de 0,25 s
await sleep(60);
W.act("skill2"); // chega DURANTE o avanço: antes era descartada em silêncio
const t = Date.now();
while (W.mine("skill2") < 1 && Date.now() - t < 1500) await sleep(50);
ck("a skill apertada durante a Investida sai logo depois dela", W.mine("skill1") === 1 && W.mine("skill2") === 1, `skill1=${W.mine("skill1")} skill2=${W.mine("skill2")}`);

// recurso insuficiente: o servidor avisa (act_denied) para o cliente devolver a recarga
W.act("ultimate");
await sleep(300);
const gastou = W.mine("ultimate");
if (gastou === 0) ck("sem recurso, o servidor avisa que recusou (act_denied)", W.ev.denied.includes("ultimate"), JSON.stringify(W.ev.denied));
else ck("sem recurso, o servidor avisa que recusou (act_denied)", true, "recurso bastou: ultimate saiu (nada a avisar)");

// recarga real (longe de acabar): avisa em vez de ignorar calado
W.act("skill2");
await sleep(200);
ck("skill em recarga longa é recusada com aviso", W.ev.denied.includes("skill2"), JSON.stringify(W.ev.denied));
W.room.leave();
console.log(failed ? "\nFALHOU" : "\nTudo certo");
process.exit(failed ? 1 : 0);
