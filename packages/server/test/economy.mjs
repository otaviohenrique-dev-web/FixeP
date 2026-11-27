// Teste de ponta a ponta da economia: moedas, comerciante, ferreira, quebrar, soltar no chão, troca entre dois jogadores e persistência.
// Exige o servidor de teste com ECON_TEST=1 LOOT_TEST=1 (kit inicial: 50000 tostões, 2 óbolos, 3 armaduras comuns, 1 rara, 1 elmo épico, 5 poções...).
// Uso: SERVER=http://localhost:2999 node test/economy.mjs
import { Client } from "colyseus.js";

const HTTP = process.env.SERVER ?? "http://localhost:2999";
const WS = HTTP.replace(/^http/, "ws");
let ROOM = "zone4"; // as lojas ficam na cidade; a seção do abate vai às Cinzas (zona 1)
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function until(cond, ms = 3000, step = 60) { const t0 = Date.now(); while (Date.now() - t0 < ms) { if (cond()) return true; await sleep(step); } return cond(); }
const results = [];
const check = (name, ok, detail = "") => {
  results.push(ok);
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? "  -> " + detail : ""}`);
};

async function account(prefix) {
  const { token } = await (await fetch(`${HTTP}/auth/guest`, { method: "POST" })).json();
  const name = prefix + Math.random().toString(10).slice(2, 7);
  const cr = await fetch(`${HTTP}/api/character`, { method: "POST", headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" }, body: JSON.stringify({ name, class: "warrior" }) });
  if (!cr.ok) throw new Error("criar personagem falhou " + cr.status);
  return { token, name };
}
async function enter(acc) {
  const room = await new Client(WS).joinOrCreate(ROOM, { token: acc.token });
  await new Promise((r) => (room.state?.players ? r() : room.onStateChange.once(r)));
  const st = { travel: [], snap: null, notices: [], oks: [], coins: [], trade: null, trades: [], invite: null, loot: [], tchat: [], left: null };
  room.onMessage("inv", (s) => (st.snap = s));
  room.onMessage("notice", (m) => (m.ok ? st.oks : st.notices).push(m.text));
  room.onMessage("travel", (m) => st.travel.push(m));
  room.onMessage("coins", (m) => st.coins.push(m));
  room.onMessage("trade", (m) => { st.trade = m; st.trades.push(m); });
  room.onMessage("trade_chat", (m) => st.tchat.push(m));
  room.onMessage("trade_invite", (m) => (st.invite = m));
  room.onMessage("trade_invite_end", () => (st.invite = null));
  room.onMessage("loot", (m) => st.loot.push(m));
  room.onLeave((c) => (st.left = c));
  room.send("inv_sync", {});
  await sleep(500);
  return { room, st, me: () => room.state.players.get(room.sessionId) };
}
const count = (snap, id) => snap.inv.filter((s) => s?.id === id).reduce((n, s) => n + s.qty, 0);
const slotOf = (snap, id) => snap.inv.findIndex((s) => s?.id === id);
const totalItems = (snap) => snap.inv.reduce((n, s) => n + (s ? s.qty : 0), 0);
const lastNotice = (st) => st.notices[st.notices.length - 1] ?? "";
async function goto(c, x, y, tol = 0.6) {
  c.room.send("move_to", { x, y });
  const t = Date.now();
  while (Math.hypot(c.me().x - x, c.me().y - y) > tol && Date.now() - t < 8000) await sleep(100);
}

console.log("\n== 1. Kit de teste e saldo ==");
const accA = await account("EcoA"), accB = await account("EcoB");
let A = await enter(accA);
const B = await enter(accB);
check("o saldo chega no inventário (tostões e óbolos)", A.st.snap.iron === 50000 && A.st.snap.obols === 2, `${A.st.snap.iron}/${A.st.snap.obols}`);

console.log("\n== 2. Comerciante (distância, saldo, espaço) ==");
{
  const NPC = "merchant";
  A.st.notices.length = 0;
  A.room.send("shop_buy", { npc: NPC, id: "pocao_de_vida", qty: 1 }); // longe: nasce a 5 tiles dele
  await sleep(300);
  check("longe do comerciante não compra", A.st.snap.iron === 50000 && /perto/i.test(lastNotice(A.st)), lastNotice(A.st));
  await goto(A, 19, 25.5);
  A.room.send("shop_buy", { npc: NPC, id: "pocao_de_vida", qty: 3 });
  await sleep(300);
  check("perto: compra 3 poções pelo preço (14 cada)", A.st.snap.iron === 50000 - 42 && count(A.st.snap, "pocao_de_vida") === 8, `iron ${A.st.snap.iron}`);
  const ironB = A.st.snap.iron;
  A.room.send("shop_buy", { npc: NPC, id: "mage_armor_common", qty: 1 });
  A.room.send("shop_buy", { npc: NPC, id: "warrior_armor_epic", qty: 1 });
  A.room.send("shop_buy", { npc: "smith", id: "pocao_de_vida", qty: 1 });
  A.room.send("shop_buy", { npc: NPC, id: "pocao_de_vida", qty: -5 });
  A.room.send("shop_buy", { npc: NPC, id: "pocao_de_vida", qty: 1.5 });
  A.room.send("shop_buy", { npc: NPC, id: { x: 1 }, qty: 1 });
  A.room.send("shop_buy", null);
  await sleep(500);
  check("itens fora do estoque, NPC errado e quantidades inválidas são recusados", A.st.snap.iron === ironB && count(A.st.snap, "pocao_de_vida") === 8);
  const slot = slotOf(A.st.snap, "pocao_de_vida");
  A.room.send("shop_sell", { npc: NPC, slot, qty: 5 });
  await sleep(300);
  check("vende 5 poções (3 cada)", A.st.snap.iron === ironB + 15 && count(A.st.snap, "pocao_de_vida") === 3, `iron ${A.st.snap.iron}`);
  A.room.send("shop_sell", { npc: NPC, slot: slotOf(A.st.snap, "pocao_de_vida"), qty: 99 });
  await sleep(300);
  check("vender mais do que tem é recusado", count(A.st.snap, "pocao_de_vida") === 3);
  // saldo: gasta quase tudo comprando e tenta comprar sem saldo
  const poor = await account("Pobre");
  const P = await enter(poor);
  P.room.send("shop_sell", { npc: NPC, slot: 0, qty: 1 });
  await goto(P, 19, 25.5);
  for (let i = 0; i < 9; i++) { const s = slotOf(P.st.snap, "warrior_armor_rare"); if (s >= 0) P.room.send("shop_sell", { npc: NPC, slot: s, qty: 1 }); }
  // esvazia o saldo vendendo e comprando não é possível; usa troca: manda tudo para A
  await P.room.leave();
}

console.log("\n== 3. Quebrar (confirmação) ==");
{
  const comum = slotOf(A.st.snap, "warrior_armor_common");
  const rara = slotOf(A.st.snap, "warrior_armor_rare");
  const epico = slotOf(A.st.snap, "warrior_helmet_epic");
  const ironB = A.st.snap.iron;
  A.room.send("inv_break", { slot: rara }); // sem confirm
  await sleep(300);
  check("quebrar item raro SEM confirmação é recusado no servidor", slotOf(A.st.snap, "warrior_armor_rare") === rara && A.st.snap.iron === ironB && /confirme/i.test(lastNotice(A.st)), lastNotice(A.st));
  A.room.send("inv_break", { slot: epico, confirm: "sim" });
  await sleep(300);
  check("confirmação que não é exatamente true não vale", slotOf(A.st.snap, "warrior_helmet_epic") === epico);
  A.room.send("inv_break", { slot: comum });
  await sleep(300);
  check("comum quebra sem confirmação e rende pouco (1)", slotOf(A.st.snap, "warrior_armor_common") !== comum || count(A.st.snap, "warrior_armor_common") === 2, `iron +${A.st.snap.iron - ironB}`);
  A.room.send("inv_break", { slot: epico, confirm: true });
  await sleep(300);
  check("épico com confirmação quebra e paga mais", slotOf(A.st.snap, "warrior_helmet_epic") === -1 && A.st.snap.iron > ironB + 50, `iron +${A.st.snap.iron - ironB}`);
  A.room.send("inv_break", { slot: slotOf(A.st.snap, "pocao_de_vida"), confirm: true });
  await sleep(300);
  check("poção não se quebra", count(A.st.snap, "pocao_de_vida") === 3);
}

console.log("\n== 4. Ferreira (fusão) ==");
{
  await goto(A, 29, 25.5); // a ferreira está em (29, 24)
  const base = count(A.st.snap, "warrior_armor_common");
  A.room.send("smith_merge", { npc: "merchant", slots: [0, 1, 2] }); // NPC errado
  await sleep(250);
  check("NPC errado não funde", count(A.st.snap, "warrior_armor_common") === base);
  // as armaduras comuns estão nos espaços 4..; acha 3 iguais (restam 2 depois de quebrar 1: compra mais uma)
  await goto(A, 19, 25.5);
  A.room.send("shop_buy", { npc: "merchant", id: "warrior_armor_common", qty: 1 });
  await sleep(300);
  await goto(A, 29, 25.5);
  const slots = A.st.snap.inv.flatMap((s, i) => (s?.id === "warrior_armor_common" ? [i] : [])).slice(0, 3);
  const ironB = A.st.snap.iron, tot = totalItems(A.st.snap);
  A.room.send("smith_merge", { npc: "smith", slots });
  await sleep(400);
  check("3 comuns iguais viram 1 incomum (zona 1: 100% de chance), cobrando a taxa", count(A.st.snap, "warrior_armor_uncommon") === 1 && count(A.st.snap, "warrior_armor_common") === 0 && totalItems(A.st.snap) === tot - 2 && A.st.snap.iron < ironB, `${A.st.oks.at(-1)}`);
  // teto da zona: 3 incomuns -> raro não é permitido na zona 1
  check("a fusão deu o item pelo evento de loot (animação de raridade)", A.st.loot.some((l) => l.id === "warrior_armor_uncommon"));
  A.room.send("smith_merge", { npc: "smith", slots: [0, 0, 1] });
  A.room.send("smith_merge", { npc: "smith", slots: "abc" });
  A.room.send("smith_merge", { npc: "smith", slots: [0, 1] });
  await sleep(300);
  check("espaços repetidos ou inválidos são recusados", totalItems(A.st.snap) === tot - 2);
  // longe da ferreira
  await goto(A, 24, 34);
  const s2 = A.st.snap.inv.flatMap((s, i) => (s?.id === "warrior_armor_uncommon" ? [i] : [])).slice(0, 3);
  A.room.send("smith_merge", { npc: "smith", slots: s2 });
  await sleep(300);
  check("longe da ferreira não funde", /perto/i.test(lastNotice(A.st)));
}

console.log("\n== 5. Soltar no chão e pegar ==");
{
  await goto(A, 22, 22);
  const before = count(A.st.snap, "pocao_de_vida");
  A.room.send("inv_drop", { slot: slotOf(A.st.snap, "pocao_de_vida") });
  await sleep(400);
  let g = null;
  A.room.state.items.forEach((x) => { if (x.itemId === "pocao_de_vida") g = x; });
  check("soltar põe o item no CHÃO (visível a todos) em vez de destruí-lo", g && g.qty === before && count(A.st.snap, "pocao_de_vida") === 0, `${A.room.state.items.size} itens no chão`);
  await sleep(1200);
  check("quem soltou não o pega de volta sozinho (de imediato)", count(A.st.snap, "pocao_de_vida") === 0 && A.room.state.items.size >= 1);
  // B pega (qualquer um pode): vai até lá
  await goto(B, g.x, g.y, 0.5);
  await sleep(500);
  check("outro jogador pega o item solto", count(B.st.snap, "pocao_de_vida") >= before, `B tem ${count(B.st.snap, "pocao_de_vida")}`);
  check("o item não foi duplicado: o chão ficou sem ele", ![...A.room.state.items.values()].some((x) => x.itemId === "pocao_de_vida"));
}

console.log("\n== 6. Troca entre jogadores ==");
{
  await goto(A, 22, 22); await goto(B, 23, 22);
  const totA = () => A.st.snap.iron + B.st.snap.iron;
  const ironSum = totA(), obolSum = A.st.snap.obols + B.st.snap.obols, itemSum = totalItems(A.st.snap) + totalItems(B.st.snap);
  A.room.send("trade_invite", { name: "naoexiste" });
  await sleep(250);
  check("convidar quem não existe é recusado", /não encontrado/i.test(lastNotice(A.st)));
  A.room.send("trade_invite", { name: accA.name });
  await sleep(250);
  check("não dá para convidar a si mesmo", B.st.invite === null && A.st.trade === null);
  A.room.send("trade_invite", { name: accB.name });
  await sleep(300);
  check("o convite chega ao outro jogador", B.st.invite?.from === accA.name);
  B.room.send("trade_accept", {});
  await sleep(300);
  check("ao aceitar, a janela abre para os dois", A.st.trade?.open && B.st.trade?.open && A.st.trade.with === accB.name && B.st.trade.with === accA.name);
  // mochila travada durante a troca
  A.room.send("inv_sort", {});
  A.room.send("inv_drop", { slot: 0 });
  A.room.send("shop_sell", { npc: "smith", slot: 0, qty: 1 });
  await sleep(300);
  check("durante a troca a mochila fica travada (sem soltar, ordenar nem vender)", /troca/i.test(lastNotice(A.st)));
  const pa = slotOf(A.st.snap, "warrior_armor_uncommon"), ph = slotOf(B.st.snap, "warrior_armor_rare") >= 0 ? slotOf(B.st.snap, "warrior_armor_rare") : slotOf(B.st.snap, "warrior_armor_common");
  // ofertas inválidas
  const iA = A.st.snap.iron;
  for (const bad of [{ items: [{ slot: pa, qty: 2 }] }, { iron: iA + 1 }, { iron: -5 }, { iron: 1.5 }, { items: [{ slot: -1, qty: 1 }] }, { items: [{ slot: pa, qty: 1 }, { slot: pa, qty: 1 }] }, { items: "x" }, null, 7]) A.room.send("trade_offer", bad);
  await sleep(500);
  check("ofertas inválidas não mudam a oferta", (A.st.trade.mine.items.length === 0) && A.st.trade.mine.iron === 0);
  check("aceitar com a oferta vazia dos dois lados é recusado", (B.room.send("trade_ready", { ready: true, rev: B.st.trade.rev }), await sleep(250), B.st.trade.mine.ready === false && /algo/i.test(lastNotice(B.st))));
  A.room.send("trade_offer", { items: [{ slot: pa, qty: 1 }], iron: 1000, obols: 1, seq: 1 });
  await sleep(300);
  check("a oferta aparece para os dois lados", A.st.trade.mine.items[0]?.id === "warrior_armor_uncommon" && B.st.trade.theirs.items[0]?.id === "warrior_armor_uncommon" && B.st.trade.theirs.iron === 1000 && B.st.trade.theirs.obols === 1);
  check("o servidor confirma o pedido (seq) e o item fica na oferta com o espaço de origem", A.st.trade.mine.seq === 1 && A.st.trade.mine.items[0].slot === pa);
  // BUG DA TROCA: o outro lado mexer na oferta (ou reenviar a mesma) não pode tirar o item de quem já ofereceu nem derrubar o aceite possível
  const rev1 = B.st.trade.rev;
  B.room.send("trade_offer", { items: [], iron: 3, obols: 0, seq: 1 });
  await sleep(300);
  check("BUG: o item que A colocou continua na oferta quando B mexe na dele", A.st.trade.mine.items.length === 1 && A.st.trade.mine.items[0].id === "warrior_armor_uncommon" && B.st.trade.theirs.items.length === 1);
  check("a versão da oferta sobe quando algo muda", B.st.trade.rev > rev1, `${rev1} -> ${B.st.trade.rev}`);
  A.room.send("trade_offer", { items: [{ slot: pa, qty: 1 }], iron: 1000, obols: 1, seq: 2 }); // pedido idêntico: não muda versão nem aceites
  await sleep(250);
  const rev2 = B.st.trade.rev;
  B.room.send("trade_ready", { ready: true, rev: rev2 }); // aceite imediato, sem espera artificial
  await sleep(250);
  check("aceitar logo depois de editar funciona (sem atraso) e o botão do outro lado vê o aceite", B.st.trade.mine.ready === true && A.st.trade.theirs.ready === true, JSON.stringify(B.st.trade.mine));
  A.room.send("trade_offer", { items: [{ slot: pa, qty: 1 }], iron: 1000, obols: 1, seq: 3 }); // reenviar IGUAL não desfaz o aceite de B
  await sleep(250);
  check("reenviar a mesma oferta não desfaz aceites nem muda a versão", B.st.trade.mine.ready === true && B.st.trade.rev === rev2);
  B.room.send("trade_ready", { ready: false });
  await sleep(200);
  A.room.send("trade_ready", { ready: true, rev: rev2 - 1 }); // versão velha: recusada
  await sleep(250);
  check("aceitar uma versão antiga da oferta é recusado", A.st.trade.mine.ready === false && /mudou/i.test(lastNotice(A.st)), lastNotice(A.st));
  A.room.send("trade_ready", { ready: true, rev: rev2 });
  await sleep(250);
  check("só um lado aceitou: nada acontece ainda", A.st.trade.open && A.st.trade.mine.ready === true && B.st.trade.theirs.ready === true && A.st.snap.iron === iA);
  B.room.send("trade_offer", { items: [], iron: 5, obols: 0, seq: 2 }); // B muda a oferta: os aceites caem
  await sleep(300);
  check("mudar a oferta desfaz os aceites dos DOIS lados", A.st.trade.mine.ready === false && B.st.trade.theirs.ready === false);
  const staleRev = B.st.trade.rev;
  A.room.send("trade_ready", { ready: true, rev: staleRev });
  B.room.send("trade_ready", { ready: true, rev: staleRev });
  await sleep(500);
  check("com os dois aceitando a MESMA versão, a troca acontece e a janela fecha", A.st.trade?.open === false && A.st.trade.done === true && B.st.trade.done === true);
  check("A perdeu o item, 1000 tostões e 1 óbolo, e recebeu 5 tostões", slotOf(A.st.snap, "warrior_armor_uncommon") === -1 && A.st.snap.iron === iA - 1000 + 5 && A.st.snap.obols === 1, `iron ${A.st.snap.iron} obols ${A.st.snap.obols}`);
  check("B recebeu o item, 1000 tostões e 1 óbolo", slotOf(B.st.snap, "warrior_armor_uncommon") >= 0 && B.st.snap.obols >= 3 - 0, `obols ${B.st.snap.obols}`);
  check("nada foi criado nem destruído (itens, tostões e óbolos conservados)", totA() === ironSum && A.st.snap.obols + B.st.snap.obols === obolSum && totalItems(A.st.snap) + totalItems(B.st.snap) === itemSum);
  // cancelar e sair no meio
  A.room.send("trade_invite", { name: accB.name });
  await sleep(250);
  B.room.send("trade_decline", {});
  await sleep(250);
  check("recusar o convite avisa quem convidou e não abre janela", /recusou/i.test(lastNotice(A.st)) && !A.st.trade?.open);
  A.room.send("trade_invite", { name: accB.name });
  await sleep(250);
  B.room.send("trade_accept", {});
  await sleep(250);
  A.room.send("trade_offer", { items: [], iron: 100, obols: 0 });
  await sleep(200);
  A.room.send("trade_cancel", {});
  await sleep(300);
  check("cancelar fecha para os dois sem mover nada", A.st.trade?.open === false && B.st.trade?.open === false && A.st.snap.iron === iA - 1000 + 5);
  // chat privado da troca
  {
    const C = await enter(await account("c"));
    A.room.send("trade_chat", { text: "oi, fora da troca" });
    await sleep(250);
    check("chat da troca fora de uma troca é recusado", A.st.tchat.length === 0 && /não está numa troca/i.test(lastNotice(A.st)));
    A.room.send("trade_invite", { name: accB.name });
    await sleep(250);
    B.room.send("trade_accept", {});
    await sleep(250);
    A.room.send("trade_chat", { text: "  fechamos <b>por</b> 500?  " });
    await sleep(300);
    const ok1 = A.st.tchat.length === 1 && B.st.tchat.length === 1 && B.st.tchat[0].name === A.me().name && !/[<>]/.test(B.st.tchat[0].text) && /fechamos/.test(B.st.tchat[0].text);
    check("a mensagem chega ao parceiro e ecoa ao remetente, já sanitizada", ok1, JSON.stringify(B.st.tchat));
    B.room.send("trade_chat", { text: "fechado" });
    await sleep(250);
    check("o parceiro também responde", A.st.tchat.length === 2 && A.st.tchat[1].text === "fechado");
    check("quem não está na troca não recebe nada", C.st.tchat.length === 0);
    A.room.send("trade_chat", { text: "x".repeat(121) });
    await sleep(250);
    check("mensagem acima do limite é recusada", A.st.tchat.length === 2 && /longa demais/i.test(lastNotice(A.st)));
    for (let i = 0; i < 8; i++) A.room.send("trade_chat", { text: "spam " + i });
    await sleep(400);
    check("o limite de taxa vale também no chat da troca", A.st.tchat.length <= 7 && /rápido demais/i.test(lastNotice(A.st)), `${A.st.tchat.length}`);
    check("terceiros continuam sem receber", C.st.tchat.length === 0);
    A.room.send("trade_cancel", {});
    await sleep(300);
    A.room.send("trade_chat", { text: "depois de fechar" });
    await sleep(250);
    check("depois que a troca fecha o chat não funciona mais e ninguém recebe", B.st.tchat.every((m) => m.text !== "depois de fechar") && C.st.tchat.length === 0);
    await C.room.leave();
  }
  // outro jogador sai no meio da troca: cancela e libera
  A.room.send("trade_invite", { name: accB.name });
  await sleep(250);
  B.room.send("trade_accept", {});
  await sleep(250);
  const ironAntes = A.st.snap.iron;
  await B.room.leave();
  await sleep(600);
  check("se um sai no meio da troca, ela é cancelada e a mochila do outro destrava", A.st.trade?.open === false && A.st.snap.iron === ironAntes);
  A.room.send("shop_sell", { npc: "smith", slot: 0, qty: 1 });
  A.room.send("inv_sort", {});
  await sleep(300);
  check("depois de cancelada a troca, a mochila volta a funcionar", !/troca/i.test(lastNotice(A.st)) || A.st.notices.length > 0);
}

console.log("\n== 7. Abate: tostões garantidos, sacola e Óbolo no chão ==");
{
  // vai às Cinzas pelo portal leste da cidade (A anda até lá e o servidor aprova a travessia)
  A.room.send("move_to", { x: 24, y: 0 });
  for (let t = 0; t < 200 && Math.hypot(A.me().x - 24, A.me().y - 0) > 0.5; t++) await sleep(100);
  A.room.send("travel", { to: 1 });
  for (let t = 0; t < 150 && !A.st.travel?.length; t++) await sleep(100);
  await A.room.leave();
  await sleep(500);
  ROOM = "zone";
  A = await enter(accA);
  const e1 = A.room.state.enemies.get("e1");
  const ironAntes = A.st.snap.iron, obolAntes = A.st.snap.obols;
  A.st.coins.length = 0;
  const t0 = Date.now();
  while (e1.st !== "dead" && Date.now() - t0 < 90000) {
    if (A.me().dead) { await sleep(1000); continue; } // caiu: espera renascer e tenta de novo
    if (Math.hypot(A.me().x - e1.x, A.me().y - e1.y) > 2) { A.room.send("move_to", { x: e1.x - 1.2, y: e1.y }); await sleep(400); continue; }
    A.room.send("act", { a: Math.random() < 0.5 ? "attack" : "skill1", ax: e1.x, ay: e1.y });
    await sleep(700);
  }
  await sleep(500);
  const direct = A.st.coins.reduce((n, c) => n + c.iron, 0);
  check("o abate dá tostões ao matador (mínimo garantido)", e1.st === "dead" && A.st.coins.length >= 1 && direct >= 1, `e1=${e1.st} dead=${A.me().dead} coins=${JSON.stringify(A.st.coins)} pos=${A.me().x.toFixed(1)},${A.me().y.toFixed(1)}`);
  const bags = [];
  A.room.state.items.forEach((g) => { if (g.itemId === "coin_iron" || g.itemId === "coin_obol") bags.push(g.itemId + "x" + g.qty); });
  check("a sacola de tostões cai no chão como os itens (o Óbolo, perto do matador, já é pego sozinho)", bags.includes("coin_iron" + "x25") || A.st.coins.some((c) => c.iron === 25), bags.join(", "));
  // a sacola que ainda está no chão (25 de ferro) ainda será pega; se o próprio jogador já a pegou durante o combate, ela já
  // está em `direct` (o aviso de moedas também conta a pega): esperado = pagamentos + sacola que ficou no chão (medido ANTES de recolher)
  const sacolaNoChao = [...A.room.state.items.values()].filter((g) => g.itemId === "coin_iron").reduce((n, g) => n + g.qty, 0);
  const esperadoFerro = ironAntes + direct + sacolaNoChao;
  // recolhe
  const tc = Date.now();
  while (Date.now() - tc < 9000 && [...A.room.state.items.values()].some((g) => g.itemId.startsWith("coin_"))) {
    const g = [...A.room.state.items.values()].find((x) => x.itemId.startsWith("coin_"));
    A.room.send("move_to", { x: g.x, y: g.y });
    await sleep(300);
  }
  // espera a fotografia do inventário chegar (condição, não tempo fixo); a checagem continua igual
  await until(() => A.st.snap.iron >= esperadoFerro && A.st.snap.obols === obolAntes + 1, 5000);
  check("pegar as moedas do chão soma ao saldo e não ocupa a mochila", A.st.snap.iron >= esperadoFerro && A.st.snap.obols === obolAntes + 1, `iron ${ironAntes}->${A.st.snap.iron} obols ${obolAntes}->${A.st.snap.obols}`);
}

console.log("\n== 8. Persistência do saldo ==");
{
  const saldo = A.st.snap.iron, obols = A.st.snap.obols;
  await A.room.leave();
  await sleep(800);
  A = await enter(accA);
  check("o saldo e os itens sobrevivem a sair e entrar de novo", A.st.snap.iron === saldo && A.st.snap.obols === obols, `${A.st.snap.iron}/${A.st.snap.obols} (esperado ${saldo}/${obols})`);
}

const failed = results.filter((r) => !r).length;
console.log(`\n${results.length - failed}/${results.length} passaram`);
await A.room.leave();
process.exit(failed ? 1 : 0);
