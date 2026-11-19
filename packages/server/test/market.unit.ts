// Testes do mercado dos jogadores (PGlite em memória, relógio falso): listar, comprar, cancelar, expirar, taxa, limites, filtros e concorrência.
// Uso (em packages/server): npx tsx test/market.unit.ts
process.env.PGLITE_DIR = "memory";
process.env.NODE_ENV = "test";

import { randomUUID } from "node:crypto";
import { MARKET_FEE_PCT, MARKET_MAX_ACTIVE, MARKET_MAX_OPEN, MARKET_PAGE, MARKET_MIN_PRICE, MARKET_MAX_PRICE, MAX_COINS, listingFee, minListingPrice, ITEMS } from "@frixep/shared";
import { emptyInventory, addItem, type Inventory } from "../src/game/inventory.js";
import { Market, type MarketActor } from "../src/game/market.js";
import { openDb } from "../src/db/index.js";
import { Repo } from "../src/db/repo.js";

const results: boolean[] = [];
const check = (name: string, ok: boolean, detail = "") => {
  results.push(ok);
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? "  -> " + detail : ""}`);
};
const count = (i: Inventory, id: string) => i.slots.filter((s) => s?.id === id).reduce((n, s) => n + s!.qty, 0);
const slotOf = (i: Inventory, id: string) => i.slots.findIndex((s) => s?.id === id);

const db = await openDb();
const repo = new Repo(db);
let clock = 1_800_000_000_000;
const TTL = 7 * 86_400_000;
const market = new Market(db, repo, () => clock, TTL);

const mk = async (iron: number, items: [string, number][] = []): Promise<MarketActor> => {
  const name = "Mk" + Math.random().toString(36).slice(2, 8);
  const acc = await repo.upsertAccount("guest", randomUUID(), name);
  const r = await repo.createCharacter(acc.id, name, "warrior");
  if (!r.ok) throw new Error("personagem");
  const inv = emptyInventory();
  inv.iron = iron;
  for (const [id, q] of items) addItem(inv, id, q);
  await repo.saveInventory(r.character.id, inv);
  return { charId: r.character.id, name, inv };
};
const browse = (f: unknown = {}, v = "") => market.browse(f, v);

console.log("\n== Listar: custódia e taxa ==");
const seller = await mk(1000, [["warrior_armor_rare", 1], ["pocao_de_vida", 5], ["warrior_helmet_epic", 1]]);
{
  const slot = slotOf(seller.inv, "warrior_armor_rare");
  check("a taxa é uma porcentagem pequena do preço, no mínimo 1", listingFee(1000) === 40 && listingFee(25) === 1 && [25, 100, 777, 5000, 123456].every((p) => Math.abs(listingFee(p) / p - MARKET_FEE_PCT / 100) < 0.017) && MARKET_FEE_PCT <= 8, `fee(25)=${listingFee(25)}`);
  check("o preço mínimo do item é metade do valor médio (x quantidade) e nunca abaixo do piso de 25", minListingPrice("warrior_armor_rare", 1) > 100 && minListingPrice("pocao_de_vida", 1) === MARKET_MIN_PRICE && minListingPrice("pocao_de_vida", 99) > MARKET_MIN_PRICE && minListingPrice("warrior_armor_epic", 1) > minListingPrice("warrior_armor_rare", 1));
  const bad = [await market.list(seller, slot, 1, MARKET_MIN_PRICE - 1), await market.list(seller, slot, 1, MARKET_MAX_PRICE + 1), await market.list(seller, slot, 1, 1000.5), await market.list(seller, slot, 2, 1000), await market.list(seller, slot, 0, 1000), await market.list(seller, 99, 1, 1000), await market.list(seller, slot, 1, "1000" as any), await market.list(seller, slot, 1.5, 1000)];
  check("preço fora dos limites, quantidade inválida ou espaço errado são recusados", bad.every((r) => !r.ok) && count(seller.inv, "warrior_armor_rare") === 1 && seller.inv.iron === 1000);
  const tooLow = await market.list(seller, slot, 1, minListingPrice("warrior_armor_rare", 1) - 1);
  check("abaixo do preço mínimo do item é recusado com a mensagem do mínimo (nada muda)", !tooLow.ok && /mínimo/i.test((tooLow as any).error) && count(seller.inv, "warrior_armor_rare") === 1 && seller.inv.iron === 1000);
  const r = await market.list(seller, slot, 1, 1000);
  check("listar tira o item da mochila e cobra a taxa", r.ok && count(seller.inv, "warrior_armor_rare") === 0 && seller.inv.iron === 1000 - listingFee(1000), JSON.stringify(r));
  const p = await browse({}, "");
  check("a listagem aparece para os outros jogadores", p.total === 1 && p.items[0].itemId === "warrior_armor_rare" && p.items[0].price === 1000 && p.items[0].seller === seller.name);
  // custódia persistida: recarregar o vendedor NÃO devolve o item (sem duplicar)
  const re = await repo.loadInventory(seller.charId);
  check("a mochila gravada já está sem o item e sem a taxa (nada de duplicar ao recarregar)", count(re, "warrior_armor_rare") === 0 && re.iron === seller.inv.iron);
  const poor = await mk(0, [["warrior_armor_common", 1]]);
  check("sem tostões para a taxa não lista", !(await market.list(poor, slotOf(poor.inv, "warrior_armor_common"), 1, 1000)).ok && count(poor.inv, "warrior_armor_common") === 1);
  const pot = await market.list(seller, slotOf(seller.inv, "pocao_de_vida"), 3, 90);
  check("lista parte de uma pilha (3 de 5 poções)", pot.ok && count(seller.inv, "pocao_de_vida") === 2);
  check("o equipado não está na mochila, então não dá para listá-lo (só espaços da mochila)", !(await market.list(seller, "weapon" as any, 1, 1000)).ok);
}

console.log("\n== Comprar: preço cheio ao vendedor, sem duplicar ==");
const buyer = await mk(5000);
{
  const own = await browse({}, seller.charId);
  check("o vendedor vê a própria listagem marcada como sua", own.items.every((i) => i.mine));
  const id = (await browse({ kind: "armor" })).items[0].id;
  check("o vendedor não compra a própria listagem", !(await market.buy(seller, id)).ok);
  const mid = await mk(10);
  const rp = await market.buy(mid, id);
  check("sem saldo suficiente não compra e a listagem continua à venda", !rp.ok && (await browse({ kind: "armor" })).total === 1 && mid.inv.iron === 10);
  const full = await mk(5000);
  for (let i = 0; i < full.inv.slots.length; i++) full.inv.slots[i] = { id: "warrior_armor_common", qty: 1 };
  const rf = await market.buy(full, id);
  check("mochila cheia não compra, desfaz a reivindicação e o dinheiro não sai", !rf.ok && /cheia/i.test((rf as any).error) && full.inv.iron === 5000 && (await browse({ kind: "armor" })).total === 1);
  const rb = await market.buy(buyer, id);
  check("comprar cobra o preço e entrega o item", rb.ok && buyer.inv.iron === 4000 && count(buyer.inv, "warrior_armor_rare") === 1, JSON.stringify(rb));
  check("depois de vendida a listagem sai do mercado", (await browse({ kind: "armor" })).total === 0 && !(await market.buy(buyer, id)).ok);
  const lb = await repo.loadInventory(buyer.charId);
  check("o comprador recarregado tem o item e o saldo (gravado na mesma transação)", count(lb, "warrior_armor_rare") === 1 && lb.iron === 4000);
  const mine = await market.mine(seller.charId);
  const sold = mine.find((m) => m.id === id);
  check("o vendedor vê a venda pendente de recolher, com o nome do comprador", sold?.status === "sold" && sold.buyer === buyer.name && sold.price === 1000);
  const before = seller.inv.iron;
  const c1 = await market.claim(seller, id);
  check("recolher paga o preço INTEIRO (sem taxa de venda)", c1.ok && seller.inv.iron === before + 1000);
  check("não dá para recolher duas vezes (sem duplicar tostões)", !(await market.claim(seller, id)).ok && seller.inv.iron === before + 1000);
  check("quem não é o vendedor não recolhe", !(await market.claim(buyer, id)).ok);
  const lsel = await repo.loadInventory(seller.charId);
  check("o saldo recolhido foi gravado", lsel.iron === before + 1000);
  // conservação: tostões do vendedor + comprador mudam só pela taxa de listagem (a de 400 e a da pilha de poções)
  check("os tostões se conservam: só a taxa de listagem some do jogo", seller.inv.iron + buyer.inv.iron === 1000 + 5000 - listingFee(1000) - listingFee(90), `${seller.inv.iron + buyer.inv.iron}`);
}

console.log("\n== Concorrência: duas compras do mesmo item ==");
{
  const s2 = await mk(500, [["warrior_helmet_rare", 1]]);
  await market.list(s2, slotOf(s2.inv, "warrior_helmet_rare"), 1, 300);
  const id = (await browse({ kind: "helmet", rarity: "rare" })).items[0].id;
  const b1 = await mk(1000), b2 = await mk(1000), b3 = await mk(1000);
  const rs = await Promise.all([market.buy(b1, id), market.buy(b2, id), market.buy(b3, id)]);
  const wins = rs.filter((r) => r.ok).length;
  const owners = [b1, b2, b3].filter((b) => count(b.inv, "warrior_helmet_rare") === 1).length;
  check("só UMA das três compras simultâneas vence", wins === 1 && owners === 1, JSON.stringify(rs.map((r) => r.ok)));
  const spent = [b1, b2, b3].map((b) => 1000 - b.inv.iron);
  check("só quem ganhou pagou (os outros mantêm os tostões)", spent.filter((x) => x === 300).length === 1 && spent.filter((x) => x === 0).length === 2, spent.join(","));
  const loser = rs.findIndex((r) => !r.ok);
  check("quem perdeu recebe a mensagem de que alguém foi mais rápido", /mais rápido/i.test((rs[loser] as any).error));
  const rows = (await db.query<{ n: string }>("select count(*)::text as n from market_listings where id = $1 and status = 'sold'", [id])).rows[0].n;
  check("a listagem foi vendida exatamente uma vez", rows === "1");
  // o vendedor tenta cancelar uma listagem já vendida
  check("cancelar uma listagem já vendida é recusado (o item não volta, não duplica)", !(await market.cancel(s2, id)).ok && count(s2.inv, "warrior_helmet_rare") === 0);
}

console.log("\n== Cancelar e expirar ==");
{
  const s3 = await mk(1000, [["warrior_armor_uncommon", 2]]);
  await market.list(s3, 0, 1, 200);
  const fee = listingFee(200);
  const l = (await market.mine(s3.charId))[0];
  check("a listagem está ativa", l.status === "active" && l.fee === fee);
  const c = await market.cancel(s3, l.id);
  check("cancelar devolve o item mas NÃO a taxa", c.ok && count(s3.inv, "warrior_armor_uncommon") === 2 && s3.inv.iron === 1000 - fee);
  check("cancelada, sai do mercado e some das minhas listagens", (await market.mine(s3.charId)).length === 0 && (await browse({ rarity: "uncommon", kind: "armor" })).total === 0);
  check("cancelar de novo é recusado", !(await market.cancel(s3, l.id)).ok && count(s3.inv, "warrior_armor_uncommon") === 2);
  const other = await mk(1000);
  await market.list(s3, 0, 1, 200);
  const l2 = (await market.mine(s3.charId))[0];
  check("outro jogador não cancela a minha listagem", !(await market.cancel(other, l2.id)).ok);
  clock += TTL + 1000;
  check("vencida, a listagem sai da busca", (await browse({ rarity: "uncommon", kind: "armor" })).total === 0);
  const late = await mk(1000);
  const rl = await market.buy(late, l2.id);
  check("não dá para comprar uma listagem vencida", !rl.ok && /expir/i.test((rl as any).error) && late.inv.iron === 1000);
  check("para o vendedor ela aparece como vencida", (await market.mine(s3.charId))[0].status === "expired");
  const rc = await market.claimAll(s3);
  check("recolher tudo devolve o item da listagem vencida", rc.ok && count(s3.inv, "warrior_armor_uncommon") === 2 && (await market.mine(s3.charId)).length === 0, JSON.stringify(rc));
  const lr = await repo.loadInventory(s3.charId);
  check("o item devolvido foi gravado", count(lr, "warrior_armor_uncommon") === 2);
}

console.log("\n== Devolução com mochila cheia ==");
{
  const s4 = await mk(100, [["warrior_armor_common", 1]]);
  await market.list(s4, 0, 1, 50);
  for (let i = 0; i < s4.inv.slots.length; i++) s4.inv.slots[i] = { id: "warrior_boots_common", qty: 1 };
  const l = (await market.mine(s4.charId))[0];
  const r = await market.cancel(s4, l.id);
  check("mochila cheia: o item continua em custódia (não se perde nem duplica)", !r.ok && (await market.mine(s4.charId)).length === 1 && count(s4.inv, "warrior_armor_common") === 0);
}

console.log("\n== Limites ==");
{
  const s5 = await mk(1_000_000, [["pocao_de_vida", 99]]);
  let ok = 0;
  for (let i = 0; i < MARKET_MAX_ACTIVE + 3; i++) {
    if (!s5.inv.slots[0]) s5.inv.slots[0] = { id: "pocao_de_vida", qty: 99 };
    if ((await market.list(s5, 0, 1, 25)).ok) ok++;
  }
  check(`no máximo ${MARKET_MAX_ACTIVE} listagens ativas por jogador`, ok === MARKET_MAX_ACTIVE, `${ok}`);
  check("há também um teto de listagens + vendas não recolhidas", MARKET_MAX_OPEN > MARKET_MAX_ACTIVE);
  const s9 = await mk(1000, [["warrior_armor_common", 1]]);
  await market.list(s9, 0, 1, 100);
  const id = (await market.mine(s9.charId))[0].id;
  await market.buy(await mk(500), id);
  s9.inv.iron = MAX_COINS - 10;
  const rc = await market.claim(s9, id);
  check("recolher não ultrapassa o teto de tostões: a venda fica guardada", !rc.ok && (await market.mine(s9.charId))[0]?.status === "sold" && s9.inv.iron === MAX_COINS - 10);
}

console.log("\n== Falha de gravação desfaz tudo ==");
{
  const s6 = await mk(500, [["warrior_armor_epic", 1]]);
  const orig = repo.writeInventoryTx.bind(repo);
  (repo as any).writeInventoryTx = async () => { throw new Error("falha simulada"); };
  const r = await market.list(s6, 0, 1, 2100);
  (repo as any).writeInventoryTx = orig;
  const n = (await db.query<{ n: string }>("select count(*)::text as n from market_listings where seller_id = $1", [s6.charId])).rows[0].n;
  check("se a gravação da mochila falha, a listagem não é criada e o item/taxa voltam", !r.ok && n === "0" && count(s6.inv, "warrior_armor_epic") === 1 && s6.inv.iron === 500, JSON.stringify(r));
  await market.list(s6, 0, 1, 2100);
  const id = (await market.mine(s6.charId))[0].id;
  const b = await mk(5000);
  (repo as any).writeInventoryTx = async () => { throw new Error("falha simulada"); };
  const rb = await market.buy(b, id);
  (repo as any).writeInventoryTx = orig;
  const st = (await db.query<{ status: string }>("select status from market_listings where id = $1", [id])).rows[0].status;
  check("se a gravação da compra falha, a listagem volta a ficar à venda e o comprador não paga", !rb.ok && st === "active" && b.inv.iron === 5000 && count(b.inv, "warrior_armor_epic") === 0);
}

console.log("\n== Busca, filtros, ordenação e páginas ==");
{
  const s7 = await mk(10_000_000);
  const setup: [string, number][] = [["warrior_armor_common", 30], ["warrior_armor_rare", 900], ["mage_armor_rare", 800], ["archer_helmet_epic", 5000], ["pocao_de_vida", 25]];
  for (const [id, price] of setup) { s7.inv.slots[0] = { id, qty: 1 }; await market.list(s7, 0, 1, price); }
  const all = await browse({ sort: "price_asc" });
  const prices = all.items.map((i) => i.price);
  check("ordena por menor preço", prices.every((p, i) => !i || prices[i - 1] <= p));
  check("ordena por maior preço", (await browse({ sort: "price_desc" })).items.map((i) => i.price).every((p, i, a) => !i || a[i - 1] >= p));
  check("filtra por classe", (await browse({ cls: "mage" })).items.every((i) => ITEMS[i.itemId].cls === "mage") && (await browse({ cls: "mage" })).total === 1);
  check("filtra por tipo", (await browse({ kind: "potion" })).items.every((i) => ITEMS[i.itemId].kind === "potion") && (await browse({ kind: "helmet" })).total === 1);
  const rare = await browse({ rarity: "rare", sort: "price_asc" });
  check("filtra por raridade", rare.total === 2 && rare.items.every((i) => ITEMS[i.itemId].rarity === "rare"));
  check("filtra por faixa de preço", (await browse({ minPrice: 100, maxPrice: 1000 })).items.every((i) => i.price >= 100 && i.price <= 1000));
  check("busca por parte do nome (sem acento nem maiúsculas)", (await browse({ q: "couraca" })).items.every((i) => ITEMS[i.itemId].name.toLowerCase().includes("coura")) && (await browse({ q: "xyzxyz" })).total === 0);
  check("ordena por raridade (mais raros primeiro)", ITEMS[(await browse({ sort: "rarity" })).items[0].itemId].rarity === "epic");
  check("filtro malicioso é ignorado (valores desconhecidos viram padrão)", (await browse({ cls: "'; drop table x;--", sort: "zzz", page: -5, minPrice: "a" })).page === 0);
  // páginas
  for (let i = 0; i < MARKET_PAGE + 3; i++) { s7.inv.slots[0] = { id: "pocao_de_vida", qty: 1 }; await market.list(s7, 0, 1, 25 + i); }
  const p0 = await browse({ kind: "potion", sort: "price_asc", page: 0 }), p1 = await browse({ kind: "potion", sort: "price_asc", page: 1 });
  check("pagina os resultados", p0.items.length === MARKET_PAGE && p1.items.length === Math.min(MARKET_PAGE, p0.total - MARKET_PAGE) && p0.pages === Math.ceil(p0.total / MARKET_PAGE), `${p0.total} itens, ${p0.pages} páginas`);
  check("uma página além do fim volta para a última", (await browse({ kind: "potion", page: 99 })).page === p0.pages - 1);
}

console.log("\n== Óbolos de Sangue: qualquer item pode ser vendido na moeda rara ==");
{
  const so = await mk(10, [["warrior_armor_epic", 1]]);
  so.inv.obols = 5;
  so.inv.slots[0] = { id: "warrior_armor_epic", qty: 1 };
  const buyerO = await mk(1000); buyerO.inv.obols = 50;
  const poorO = await mk(1000);
  check("moeda inválida é recusada", !(await market.list(so, 0, 1, 10, "ouro" as any)).ok);
  check("preço em óbolos tem limite próprio (máx. 99.999)", !(await market.list(so, 0, 1, 100_000, "obols")).ok && !(await market.list(so, 0, 1, 24, "obols")).ok);
  check("a taxa em óbolos é cobrada em óbolos (mínimo 1) e não mexe nos tostões", (await market.list(so, 0, 1, 30, "obols")).ok && so.inv.obols === 5 - listingFee(30) && so.inv.iron === 10 && count(so.inv, "warrior_armor_epic") === 0, `${so.inv.obols}`);
  const f = await browse({ currency: "obols" }), g = await browse({ currency: "iron", kind: "armor", rarity: "epic" });
  check("o filtro de moeda separa as listagens", f.items.some((i) => i.itemId === "warrior_armor_epic" && i.currency === "obols") && g.items.every((i) => i.currency === "iron"));
  const id = f.items.find((i) => i.itemId === "warrior_armor_epic")!.id;
  check("sem óbolos suficientes não compra (tostões não valem)", !(await market.buy(poorO, id)).ok && poorO.inv.iron === 1000);
  check("comprar cobra óbolos, não tostões", (await market.buy(buyerO, id)).ok && buyerO.inv.obols === 20 && buyerO.inv.iron === 1000 && count(buyerO.inv, "warrior_armor_epic") === 1);
  const ob0 = so.inv.obols;
  check("o vendedor recolhe os óbolos inteiros", (await market.claim(so, id)).ok && so.inv.obols === ob0 + 30 && so.inv.iron === 10);
  const rl = await repo.loadInventory(so.charId);
  check("os óbolos recolhidos foram gravados", rl.obols === so.inv.obols);
}

console.log("\n== Limpeza ==");
{
  const s8 = await mk(100, [["warrior_armor_common", 1]]);
  await market.list(s8, 0, 1, 25);
  const id = (await market.mine(s8.charId))[0].id;
  await market.cancel(s8, id);
  clock += 4 * 86_400_000;
  const m2 = new Market(db, repo, () => clock, TTL);
  await m2.sweep();
  const n = (await db.query<{ n: string }>("select count(*)::text as n from market_listings where id = $1", [id])).rows[0].n;
  check("listagens encerradas há mais de 3 dias são apagadas", n === "0");
}

await db.close();
const failed = results.filter((r) => !r).length;
console.log(`\n${results.length - failed}/${results.length} passaram`);
process.exit(failed ? 1 : 0);
