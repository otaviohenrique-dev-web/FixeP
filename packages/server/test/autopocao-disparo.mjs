// Teste de integração do DISPARO da auto-poção (PD-14): com o limiar ligado e poções na bolsa, o Guerreiro apanha de um
// esqueleto de verdade e o SERVIDOR bebe a poção sozinho (este teste nunca manda inv_use). Depois, sem nenhuma poção,
// o combate segue e nada quebra (a sala continua viva, sem poção nova do nada).
// Exige ECON_TEST=1 (kit com poções) e TEST_START_ZONE=1 (nasce na zona 1, onde está o esqueleto e2).
// Uso: SERVER=http://localhost:2986 node test/autopocao-disparo.mjs
import { Client } from "colyseus.js";

const HTTP = process.env.SERVER ?? "http://localhost:2986";
const WS = HTTP.replace(/^http/, "ws");
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const results = [];
const check = (name, ok, detail = "") => {
  results.push(ok);
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? "  -> " + detail : ""}`);
};
async function until(cond, ms = 15000, step = 100) {
  const t0 = Date.now();
  while (Date.now() - t0 < ms) { if (cond()) return true; await sleep(step); }
  return cond();
}

const { token } = await (await fetch(`${HTTP}/auth/guest`, { method: "POST" })).json();
const name = "Ad" + Math.random().toString(10).slice(2, 8);
const cr = await fetch(`${HTTP}/api/character`, { method: "POST", headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" }, body: JSON.stringify({ name, class: "warrior" }) });
if (!cr.ok) throw new Error("criar personagem de teste falhou " + cr.status);

const room = await new Client(WS).joinOrCreate("zone", { token });
await new Promise((r) => (room.state?.players ? r() : room.onStateChange.once(r)));
// a bolsa chega pela mensagem "inv" (fotografia completa); o dano chega pela mensagem "hit"
const st = { inv: null, hits: 0, left: false };
room.onMessage("inv", (snap) => (st.inv = snap));
room.onMessage("hit", (m) => { if (m.k === "p" && m.id === room.sessionId) st.hits++; });
room.onLeave(() => (st.left = true));
const me = () => room.state.players.get(room.sessionId);
const potSlots = () => (st.inv?.inv ?? []).map((x, i) => (x?.id === "pocao_de_vida" ? i : -1)).filter((i) => i >= 0);
const pots = () => (st.inv?.inv ?? []).reduce((n, x) => (x?.id === "pocao_de_vida" ? n + x.qty : n), 0);
const sincronizar = async () => { room.send("inv_sync", {}); await sleep(300); };
await sincronizar();

console.log("\n== 1. Disparo: a poção é bebida sozinha ao apanhar ==");
const antes0 = pots();
check("o personagem tem poções na bolsa (kit de ECON_TEST)", antes0 > 0, `poções ${antes0}`);
room.send("auto_pot", { at: 90 }); // limiar máximo: qualquer golpe que deixe a vida em 90% ou menos dispara
await sleep(300);
check("o limiar de 90% ficou gravado", me().autoPotAt === 90, `autoPotAt ${me().autoPotAt}`);

const sk = room.state.enemies.get("e2"); // esqueleto nível 1 da zona 1
check("o esqueleto de teste (e2) existe na zona 1", !!sk);
let minHp = me().hp;
const watch = setInterval(() => { minHp = Math.min(minHp, me().hp); }, 50);
room.send("move_to", { x: sk.x - 2.2, y: sk.y }); // entra no alcance; ele reage e bate (o Guerreiro não ataca)
const bebeu = await until(() => pots() < antes0, 30000, 100);
clearInterval(watch);
// a fotografia da bolsa pode chegar antes da vida no estado: espera a vida subir (a poção cura 40)
const subiu = bebeu && (await until(() => me().hp > minHp, 5000, 50));
check("apanhou do esqueleto (recebeu dano de verdade)", st.hits > 0, `acertos ${st.hits}`);
check("uma poção saiu da bolsa sem nenhum inv_use do cliente", bebeu, `poções ${antes0} -> ${pots()}`);
check("a vida voltou a subir depois de beber (acima do ponto mais baixo)", subiu, `mínimo ${minHp.toFixed(0)}, agora ${me().hp.toFixed(0)}`);
check("sala continua ativa e o personagem vivo", !st.left && !me().dead, `hp ${me().hp}/${me().maxHp}`);

console.log("\n== 2. Sem nenhuma poção: nada quebra ==");
for (const slot of potSlots()) room.send("inv_drop", { slot }); // solta todas as poções no chão
await sleep(400);
await sincronizar();
check("a bolsa ficou sem poções", pots() === 0, `poções ${pots()}`);
const hitsAntes = st.hits;
const apanhou = await until(() => st.hits > hitsAntes, 20000, 100);
await sleep(1500); // tempo para a auto-poção tentar agir sem poção (ela não deve fazer nada)
await sincronizar();
check("continua apanhando sem poção (combate segue)", apanhou, `acertos ${st.hits - hitsAntes}`);
check("a auto-poção ligada não cria poção do nada", pots() === 0, `poções ${pots()}`);
check("sem poção o servidor segue vivo (sala ativa, vida número finito)", !st.left && Number.isFinite(me().hp), `hp ${me().hp}/${me().maxHp}`);

const falhas = results.filter((r) => !r).length;
console.log(`\n${results.length - falhas}/${results.length} verificações passaram`);
room.send("move_to", { x: 14, y: 20 }); // sai do alcance do esqueleto
room.leave();
await sleep(200);
if (falhas) process.exit(1);
