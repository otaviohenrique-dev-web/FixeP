// Morte e renascer: o corpo fica no lugar onde caiu (NADA de aparecer no ponto de nascimento da zona), o servidor manda direto para
// a cidade (checkpoint), o personagem chega inteiro no ponto de chegada da cidade; e o chefe reseta a vida quando ninguém sobra lutando.
// Uso: SERVER=http://localhost:2999 node test/morte.mjs   (servidor de teste sem carregar o .env)
import { Client } from "colyseus.js";

const HTTP = process.env.SERVER ?? "http://localhost:2999";
const WS = HTTP.replace(/^http/, "ws");
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const results = [];
const check = (name, ok, detail = "") => { results.push(ok); console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? "  -> " + detail : ""}`); };
const until = async (fn, ms) => { for (let t = 0; t < ms; t += 100) { if (fn()) return true; await sleep(100); } return false; };

async function account(tag, cls = "warrior") {
  const { token } = await (await fetch(`${HTTP}/auth/guest`, { method: "POST" })).json();
  const name = tag + Math.random().toString(10).slice(2, 7);
  const cr = await fetch(`${HTTP}/api/character`, { method: "POST", headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" }, body: JSON.stringify({ name, class: cls }) });
  if (!cr.ok) throw new Error("criar personagem " + cr.status);
  return { token, name };
}
async function enter(acc, room) {
  const r = await new Client(WS).joinOrCreate(room, { token: acc.token });
  await new Promise((ok) => (r.state?.players ? ok() : r.onStateChange.once(ok)));
  const ev = { travel: [], died: 0 };
  r.onMessage("travel", (m) => ev.travel.push(m));
  r.onMessage("died", (m) => { if (m.k === "p") ev.died++; });
  r.onMessage("*", () => {});
  return { r, ev, me: () => r.state.players.get(r.sessionId), boss: () => r.state.enemies.get("boss") };
}

// ---- 1) morrer numa zona de combate: corpo parado no lugar da queda e ida direta à cidade
const acc = await account("Mt");
let Z = await enter(acc, "zone4");
Z.r.send("move_to", { x: 24, y: 2 });
await until(() => Math.hypot(Z.me().x - 24, Z.me().y - 2) < 1.5, 20000);
Z.r.send("travel", { to: 1 });
await until(() => Z.ev.travel.length > 0, 5000);
await Z.r.leave(true);
await sleep(400);
Z = await enter(acc, "zone");
const spawn = { x: 12, y: 31 }; // ponto de nascimento da zona 1 (clareira a sudoeste)
Z.r.send("move_to", { x: 30, y: 16 }); // direto para os esqueletos
check("morre numa zona de combate", await until(() => Z.me()?.dead, 90_000), `hp ${Z.me()?.hp}`);
const body = { x: Z.me().x, y: Z.me().y };
const samples = [];
const t0 = Date.now();
while (Date.now() - t0 < 14_000 && !Z.ev.travel.length) { if (Z.me()) samples.push({ x: Z.me().x, y: Z.me().y, dead: Z.me().dead }); await sleep(50); }
check("ao morrer o corpo FICA onde caiu até a travessia (nunca vai ao ponto de nascimento da zona)", samples.length > 5 && samples.every((p) => Math.hypot(p.x - body.x, p.y - body.y) < 0.5 && p.dead), `${samples.length} amostras, corpo ${body.x.toFixed(1)},${body.y.toFixed(1)}`);
check("e a ida à cidade (zona 4) é aprovada pelo servidor depois da contagem", Z.ev.travel.some((t) => t.zone === 4));
check("longe do ponto de nascimento da zona 1 durante todo o tempo", samples.every((p) => Math.hypot(p.x - spawn.x, p.y - spawn.y) > 2) || Math.hypot(body.x - spawn.x, body.y - spawn.y) <= 2);
await Z.r.leave(true);
await sleep(500);
const R = await enter(acc, "zone4");
check("chega na cidade vivo, com a vida cheia e no ponto de nascimento da cidade (24; 30)", !R.me().dead && R.me().hp === R.me().maxHp && Math.hypot(R.me().x - 24, R.me().y - 30) < 0.6, `hp ${R.me().hp}/${R.me().maxHp} (${R.me().x}, ${R.me().y})`);
await R.r.leave(true);

// ---- 2) o chefe reseta a vida quando ninguém sobra vivo lutando (depois de uma carência de poucos segundos)
console.log("\n== Chefe: reset sem ninguém lutando ==");
{
  const toZone1 = async (a) => {
    const H = await enter(a, "zone4");
    H.r.send("move_to", { x: 24, y: 2 });
    await until(() => Math.hypot(H.me().x - 24, H.me().y - 2) < 1.5, 20000);
    H.r.send("travel", { to: 1 });
    await until(() => H.ev.travel.length > 0, 5000);
    await H.r.leave(true);
    await sleep(400);
    return enter(a, "zone");
  };
  const go = async (P, via) => { for (const [x, y] of via) { P.r.send("move_to", { x, y }); await until(() => Math.hypot(P.me().x - x, P.me().y - y) < 0.8 || P.me().dead, 12_000); } };
  const obs = await toZone1(await account("Ob")); // observador: fica longe do chefe e dos esqueletos
  await go(obs, [[10, 19], [16, 18.5]]);
  const fighter = await toZone1(await account("Ft", "archer")); // de longe: o chefe mata um guerreiro nível 1 de uma pancada antes de ser ferido
  await go(fighter, [[10, 19], [18, 18], [24.5, 8.5]]); // contorna esqueletos e o portal de volta; para a ~8,5 tiles do chefe (33, 7), dentro do alcance da flecha (9)
  let wounded = false;
  for (let t = 0; t < 25_000 && !wounded; t += 300) {
    const bs = fighter.boss();
    if (bs) fighter.r.send("act", { a: "attack", ax: bs.x, ay: bs.y });
    await sleep(300);
    const ob = obs.boss();
    wounded = !!ob && ob.hp < ob.maxHp;
  }
  check("o chefe da zona 1 foi ferido", wounded, `${obs.boss()?.hp}/${obs.boss()?.maxHp}`);
  const tLeft = Date.now();
  await fighter.r.leave(true); // o único que lutava sai do jogo: ninguém sobra
  const reset = await until(() => obs.boss().hp === obs.boss().maxHp, 7000);
  const dt = (Date.now() - tLeft) / 1000;
  // sem o reset a regeneração só começaria 8 s depois do último golpe e levaria ~30 s para encher
  check("sem ninguém lutando, o chefe volta à vida cheia logo (carência de 3 s, bem antes da regeneração)", reset && dt < 7, `${dt.toFixed(1)} s`);
  await obs.r.leave(true);
}

const failed = results.filter((r) => !r).length;
console.log(`\n${results.length - failed}/${results.length} verificações passaram`);
process.exit(failed ? 1 : 0);
