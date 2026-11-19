// Testes unitários da economia: preços, compra/venda, quebrar, fusão, troca atômica, moedas e persistência (PGlite em memória).
// Uso (em packages/server): npx tsx test/economy.unit.ts
process.env.PGLITE_DIR = "memory";
process.env.NODE_ENV = "test";

import { randomUUID } from "node:crypto";
import {
  ITEMS, ZONES, HUB_ZONE, RARITIES, MAX_COINS, MERGE_COUNT, itemValue, buyPrice, sellPrice, breakValue, shopStock, zoneRarityCap, checkMerge, mergeChance,
  enemyKind, mobIron, bossIron, rarityIndex, zoneNpcs, NPC_REACH, PLAYABLE_CLASSES, INV_SLOTS,
} from "@frixep/shared";
import { emptyInventory, addItem, snapshot, type Inventory } from "../src/game/inventory.js";
import { addCoins, buyItem, sellSlot, breakSlot, mergeItems, parseOffer, executeTrade, emptyOffer } from "../src/game/economy.js";
import { rollMobLoot, rollChestLoot } from "../src/game/loot.js";
import { openDb } from "../src/db/index.js";
import { Repo } from "../src/db/repo.js";

const results: boolean[] = [];
const check = (name: string, ok: boolean, detail = "") => {
  results.push(ok);
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? "  -> " + detail : ""}`);
};
const seq = (...v: number[]) => { let i = 0; return () => v[i++ % v.length]; }; // sorteio determinístico
const inv = (iron = 0): Inventory => { const i = emptyInventory(); i.iron = iron; return i; };
const total = (i: Inventory) => i.slots.reduce((n, s) => n + (s ? s.qty : 0), 0);
const count = (i: Inventory, id: string) => i.slots.filter((s) => s?.id === id).reduce((n, s) => n + s!.qty, 0);

console.log("\n== Preços ==");
{
  const eq = Object.values(ITEMS).filter((i) => i.kind !== "potion");
  check("todo item tem preço positivo", Object.values(ITEMS).every((i) => itemValue(i) >= 1));
  check("o preço sobe com a raridade (mesmo tipo e classe)", PLAYABLE_CLASSES.every((c) => (["weapon", "armor", "boots"] as const).every((k) => {
    const v = RARITIES.map((r) => itemValue(eq.find((i) => i.cls === c && i.kind === k && i.rarity === r)));
    return v.every((x, i) => i === 0 || x > v[i - 1]);
  })));
  check("comprar custa mais que o preço médio; vender e quebrar rendem menos (quebrar < vender)", eq.every((i) => buyPrice(i.id) > itemValue(i) && sellPrice(i.id) < itemValue(i) && breakValue(i.id) < sellPrice(i.id) + 1 && breakValue(i.id) >= 1));
  check("não dá lucro comprar e revender", eq.every((i) => sellPrice(i.id) < buyPrice(i.id)));
  check("a poção vale 10; compra 14 e venda 3", itemValue("pocao_de_vida") === 10 && buyPrice("pocao_de_vida") === 14 && sellPrice("pocao_de_vida") === 3);
  check("tostões de um abate crescem com o nível; chefe rende bem mais", mobIron(1, () => 0.5) < mobIron(20, () => 0.5) && bossIron(6, () => 0.5) > 10 * mobIron(6, () => 0.5) / 4);
}

console.log("\n== Moedas ==");
{
  const i = inv(0);
  check("addCoins soma", addCoins(i, "iron", 50) === 50 && i.iron === 50);
  check("addCoins ignora negativo, NaN, zero e fração tratada", addCoins(i, "iron", -5) === 0 && addCoins(i, "iron", NaN) === 0 && addCoins(i, "iron", 0) === 0 && i.iron === 50);
  i.iron = MAX_COINS - 3;
  check("o saldo respeita o teto", addCoins(i, "iron", 100) === 3 && i.iron === MAX_COINS);
  check("os óbolos têm saldo próprio", addCoins(i, "obols", 2) === 2 && i.obols === 2 && i.iron === MAX_COINS);
}

console.log("\n== Compra ==");
{
  const i = inv(1000);
  const id = shopStock("warrior").find((x) => x === "espada_1m_common")!;
  const p = buyPrice(id);
  check("o comerciante vende poção e equipamento de até raro, da classe do jogador", shopStock("mage")[0] === "pocao_de_vida" && shopStock("mage").slice(1).every((x) => ITEMS[x].cls === "mage" && rarityIndex(ITEMS[x].rarity) <= 2) && shopStock("mage").length > 20);
  const r = buyItem(i, "warrior", id, 1);
  check("comprar cobra o preço e põe o item na mochila", r.ok && i.iron === 1000 - p && count(i, id) === 1, `iron ${i.iron}`);
  const before = JSON.stringify(snapshot(i));
  check("item de outra classe não está à venda", !buyItem(i, "warrior", "mago_x", 1).ok && !buyItem(i, "warrior", "mage_armor_common", 1).ok);
  check("item acima do teto da loja (épico) não está à venda", !buyItem(i, "warrior", "warrior_armor_epic", 1).ok);
  check("saldo insuficiente é recusado sem mudar nada", (() => { const j = inv(p - 1); const b = JSON.stringify(snapshot(j)); return !buyItem(j, "warrior", id, 1).ok && JSON.stringify(snapshot(j)) === b; })());
  check("quantidades inválidas são recusadas", [0, -1, 1.5, NaN, "2", null, 99, Infinity].every((q) => !buyItem(inv(1e6), "warrior", "pocao_de_vida", q).ok));
  check("recusas não alteram o inventário", JSON.stringify(snapshot(i)) === before);
  const full = inv(1e6);
  for (let k = 0; k < INV_SLOTS; k++) addItem(full, "warrior_armor_common", 1);
  const fb = JSON.stringify(snapshot(full));
  check("mochila cheia: não compra e não cobra", !buyItem(full, "warrior", id, 1).ok && JSON.stringify(snapshot(full)) === fb);
  const pots = inv(1000);
  check("poções compram em quantidade e empilham", buyItem(pots, "warrior", "pocao_de_vida", 5).ok && count(pots, "pocao_de_vida") === 5 && pots.iron === 1000 - 5 * buyPrice("pocao_de_vida"));
  check("itens inexistentes e tipos errados são recusados", !buyItem(inv(1e6), "warrior", "nao_existe", 1).ok && !buyItem(inv(1e6), "warrior", { a: 1 }, 1).ok && !buyItem(inv(1e6), "warrior", "__proto__", 1).ok);
}

console.log("\n== Venda ==");
{
  const i = inv(0);
  addItem(i, "pocao_de_vida", 4);
  addItem(i, "warrior_armor_rare", 1);
  const rs = sellSlot(i, 0, 3);
  check("vender 3 de 4 poções rende 3x e deixa 1", rs.ok && i.iron === 3 * sellPrice("pocao_de_vida") && i.slots[0]?.qty === 1);
  check("quantidade maior que a do espaço é recusada", !sellSlot(i, 0, 2).ok && i.slots[0]?.qty === 1);
  const rr = sellSlot(i, 1, 1);
  check("vender o equipamento esvazia o espaço e paga o preço de venda", rr.ok && i.slots[1] === null && i.iron === 3 * sellPrice("pocao_de_vida") + sellPrice("warrior_armor_rare"));
  check("espaço vazio, inválido ou tipos errados são recusados", [[5, 1], [-1, 1], [99, 1], [0, 0], ["0", 1], [0, "1"], [null, null]].every(([s, q]) => !sellSlot(i, s, q).ok));
  const e = inv(0); e.equip.armor = "warrior_armor_common";
  check("equipamento vestido não se vende (só o da mochila)", !sellSlot(e, 0, 1).ok && e.equip.armor === "warrior_armor_common");
  const cap = inv(MAX_COINS - 1); addItem(cap, "warrior_armor_rare", 1);
  check("saldo no teto: a venda é recusada e o item fica", !sellSlot(cap, 0, 1).ok && cap.slots[0]?.id === "warrior_armor_rare");
}

console.log("\n== Quebrar ==");
{
  const i = inv(0);
  addItem(i, "warrior_armor_common", 1); addItem(i, "warrior_armor_rare", 1); addItem(i, "warrior_armor_epic", 1); addItem(i, "pocao_de_vida", 2);
  const c = breakSlot(i, 0, undefined);
  check("quebrar um comum rende uma pequena quantia (menos que vender) e remove o item", c.ok && i.slots[0] === null && i.iron === breakValue("warrior_armor_common") && breakValue("warrior_armor_common") < sellPrice("warrior_armor_common") + 1);
  const b4 = JSON.stringify(snapshot(i));
  check("raro sem confirmação é recusado e nada muda", !breakSlot(i, 1, undefined).ok && !breakSlot(i, 1, false).ok && !breakSlot(i, 1, "true").ok && !breakSlot(i, 1, 1).ok && JSON.stringify(snapshot(i)) === b4);
  check("raro com confirmação quebra", breakSlot(i, 1, true).ok && i.slots[1] === null);
  check("épico também exige confirmação", !breakSlot(i, 2, undefined).ok && breakSlot(i, 2, true).ok);
  check("poção não se quebra (vende-se)", !breakSlot(i, 3, true).ok && i.slots[3]?.qty === 2);
  check("espaço inválido ou vazio é recusado", !breakSlot(i, 0, true).ok && !breakSlot(i, -1, true).ok && !breakSlot(i, "x", true).ok);
}

console.log("\n== Fusão (ferreira) ==");
{
  const mk = (ids: string[], iron = 100000) => { const i = inv(iron); ids.forEach((id) => addItem(i, id, 1)); return i; };
  const three = (id: string) => [id, id, id];
  // zona 3 tem teto mítico; zona 1 só até incomum
  check("teto de cada zona vem das tabelas de drop e do baú (1: incomum, 2: épico, 3: mítico)", zoneRarityCap(1) === "uncommon" && zoneRarityCap(2) === "epic" && zoneRarityCap(3) === "mythic");
  let i = mk(three("warrior_armor_common"));
  let r = mergeItems(i, [0, 1, 2], 1, seq(0.0, 0.0));
  check("3 comuns iguais viram 1 incomum (chance 100%) e cobram a taxa", r.ok && r.success && r.id === "warrior_armor_uncommon" && count(i, "warrior_armor_uncommon") === 1 && total(i) === 1 && i.iron < 100000, JSON.stringify(r));
  i = mk(three("warrior_armor_uncommon"));
  const noCap = mergeItems(i, [0, 1, 2], 1, seq(0));
  check("na zona 1 não se funde para raro (teto da zona): nada é consumido", !noCap.ok && total(i) === 3 && i.iron === 100000);
  r = mergeItems(i, [0, 1, 2], 2, seq(0.1, 0.0));
  check("na zona 2 o mesmo conjunto vira raro", r.ok && r.success && r.id === "warrior_armor_rare" && total(i) === 1);
  i = mk(three("warrior_armor_uncommon"));
  r = mergeItems(i, [0, 1, 2], 2, seq(0.99, 0.0));
  check("falha: perde a taxa e 1 dos 3 itens (os outros 2 voltam)", r.ok && !r.success && count(i, "warrior_armor_uncommon") === 2 && total(i) === 2 && i.iron < 100000, JSON.stringify(r));
  i = mk(["warrior_armor_common", "warrior_helmet_common", "warrior_armor_common"]);
  check("tipos diferentes não se fundem", !mergeItems(i, [0, 1, 2], 1).ok && total(i) === 3);
  i = mk(["warrior_armor_common", "warrior_armor_common", "warrior_armor_uncommon"]);
  check("raridades diferentes não se fundem", !mergeItems(i, [0, 1, 2], 1).ok);
  i = mk(["warrior_armor_common", "warrior_armor_common", "mage_armor_common"]);
  check("classes diferentes não se fundem", !mergeItems(i, [0, 1, 2], 1).ok);
  i = mk(three("warrior_armor_common"));
  check("espaços repetidos, quantidade errada e tipos inválidos são recusados", [[0, 0, 1], [0, 1], [0, 1, 2, 3], ["0", 1, 2], [0, 1, -1], [0, 1, 99], null, "abc", { a: 1 }].every((s) => !mergeItems(i, s, 1).ok) && total(i) === 3);
  i = mk(three("warrior_armor_common"), 0);
  check("sem tostões para a taxa, não funde (e nada é consumido)", !mergeItems(i, [0, 1, 2], 1).ok && total(i) === 3);
  i = mk(three("pocao_de_vida"));
  check("poções não se fundem", !mergeItems(i, [0, 1, 2], 3).ok);
  i = mk(three("warrior_armor_mythic"));
  check("o mítico é o fim da linha", !mergeItems(i, [0, 1, 2], 3).ok);
  i = mk(["montante_rare", "espada_larga_rare", "lamina_runica_rare"]);
  const ck = checkMerge(["montante_rare", "espada_larga_rare", "lamina_runica_rare"], 2);
  check("armas de famílias diferentes do mesmo tipo fundem e o resultado é de uma das famílias", ck.ok && ck.families.length === 3);
  const ids = new Set<string>();
  for (let k = 0; k < 30; k++) { const j = mk(["montante_rare", "espada_larga_rare", "lamina_runica_rare"]); const rr = mergeItems(j, [0, 1, 2], 2, seq(0, Math.random())); if (rr.ok && rr.success) ids.add(rr.id); }
  check("o resultado sai na raridade superior e na classe certa", [...ids].every((x) => ITEMS[x].rarity === "epic" && ITEMS[x].cls === "warrior" && ITEMS[x].kind === "weapon") && ids.size >= 1);
  check("a chance de sucesso cai com a raridade", [0, 1, 2, 3, 4].map((k) => mergeChance(RARITIES[k])).every((c, k, a) => k === 0 || c < a[k - 1]) && mergeChance("mythic") === 0);
  check("nunca sobram nem faltam itens: total conservado ou reduzido em 1", (() => { let ok = true; for (let k = 0; k < 40; k++) { const j = mk(three("warrior_armor_uncommon")); mergeItems(j, [0, 1, 2], 2); ok &&= total(j) === 1 || total(j) === 2; } return ok; })());
  check("MERGE_COUNT é 3", MERGE_COUNT === 3);
}

console.log("\n== Troca atômica ==");
{
  const a = inv(500), b = inv(100);
  addItem(a, "warrior_armor_rare", 1); addItem(a, "pocao_de_vida", 5);
  addItem(b, "warrior_helmet_common", 1);
  const pa = parseOffer(a, { items: [{ slot: 0, qty: 1 }, { slot: 1, qty: 3 }], iron: 200, obols: 0 });
  const pb = parseOffer(b, { items: [{ slot: 0, qty: 1 }], iron: 0 });
  check("ofertas válidas são aceitas e o id vem do espaço (não do cliente)", pa.ok && pb.ok && pa.offer.items[0].id === "warrior_armor_rare" && pa.offer.items[1].qty === 3);
  check("ofertas inválidas são recusadas", [{ items: [{ slot: 0, qty: 2 }] }, { items: [{ slot: 0, qty: 1 }, { slot: 0, qty: 1 }] }, { items: [{ slot: 9, qty: 1 }] }, { iron: 501 }, { iron: -1 }, { iron: 1.5 }, { obols: 1 }, { items: "x" }, { items: [{ slot: "0", qty: 1 }] }, null, 5, { items: Array.from({ length: 9 }, (_, k) => ({ slot: k, qty: 1 })) }].every((o) => !parseOffer(a, o).ok));
  const totalBefore = total(a) + total(b), ironBefore = a.iron + b.iron;
  const ex = executeTrade(a, (pa as any).offer, b, (pb as any).offer);
  check("a troca move itens e tostões dos dois lados", ex.ok && count(a, "warrior_helmet_common") === 1 && count(b, "warrior_armor_rare") === 1 && count(b, "pocao_de_vida") === 3 && count(a, "pocao_de_vida") === 2 && a.iron === 300 + 0 && b.iron === 300);
  check("nada foi criado nem destruído (itens e moedas conservados)", total(a) + total(b) === totalBefore && a.iron + b.iron === ironBefore);
  // espaço mudou entre a oferta e a execução
  const c = inv(0), d = inv(0);
  addItem(c, "warrior_armor_rare", 1);
  const oc = (parseOffer(c, { items: [{ slot: 0, qty: 1 }] }) as any).offer;
  c.slots[0] = { id: "warrior_armor_common", qty: 1 }; // outro item tomou o lugar
  const sc = JSON.stringify(snapshot(c)), sd = JSON.stringify(snapshot(d));
  check("se o espaço mudou depois da oferta, a troca falha sem mudar nada", !executeTrade(c, oc, d, emptyOffer()).ok && JSON.stringify(snapshot(c)) === sc && JSON.stringify(snapshot(d)) === sd);
  // mochila cheia do outro lado: nada muda dos dois lados
  const e = inv(0), f = inv(0);
  addItem(e, "warrior_armor_rare", 1);
  for (let k = 0; k < INV_SLOTS; k++) addItem(f, "warrior_armor_common", 1);
  const oe = (parseOffer(e, { items: [{ slot: 0, qty: 1 }], iron: 0 }) as any).offer;
  const se = JSON.stringify(snapshot(e)), sf = JSON.stringify(snapshot(f));
  check("mochila cheia do receptor: a troca falha e nada muda em nenhum dos lados", !executeTrade(e, oe, f, emptyOffer()).ok && JSON.stringify(snapshot(e)) === se && JSON.stringify(snapshot(f)) === sf);
  // saldo gasto entre a oferta e a execução
  const g = inv(100), h = inv(0);
  const og = (parseOffer(g, { iron: 100 }) as any).offer;
  g.iron = 40;
  check("saldo gasto depois da oferta: a troca falha (ninguém fica devendo)", !executeTrade(g, og, h, emptyOffer()).ok && g.iron === 40 && h.iron === 0);
  // teto de moedas do receptor
  const k = inv(10), l = inv(MAX_COINS);
  const ok = (parseOffer(k, { iron: 10 }) as any).offer;
  check("receptor no teto de moedas: a troca falha sem perder nada", !executeTrade(k, ok, l, emptyOffer()).ok && k.iron === 10 && l.iron === MAX_COINS);
  // só tostões, sem itens
  const m = inv(50), n = inv(0);
  const om = (parseOffer(m, { iron: 50 }) as any).offer;
  check("troca só de tostões funciona", executeTrade(m, om, n, emptyOffer()).ok && m.iron === 0 && n.iron === 50);
  // mesmo item oferecido de dois lados do mesmo espaço nunca duplica: troca A<->A consigo mesmo
  const s1 = inv(0); addItem(s1, "warrior_armor_rare", 1);
  const os = (parseOffer(s1, { items: [{ slot: 0, qty: 1 }] }) as any).offer;
  const before = total(s1);
  const self = executeTrade(s1, os, s1, os);
  check("trocar com a própria mochila nunca duplica item", !self.ok || total(s1) === before, `total ${total(s1)}`);
}

console.log("\n== Drops de moeda ==");
{
  process.env.LOOT_TEST = "";
  let bags = 0, obols = 0;
  const N = 20000;
  for (let k = 0; k < N; k++) for (const d of rollMobLoot(ZONES[3], Math.random, "warrior", 15)) { if (d.id === "coin_iron") bags++; if (d.id === "coin_obol") obols++; }
  check("a sacola de tostões cai em ~15% dos abates da zona 3", bags / N > 0.12 && bags / N < 0.18, `${(bags / N * 100).toFixed(1)}%`);
  check("o Óbolo de Sangue é raríssimo nos inimigos comuns (< 0,5%)", obols / N < 0.005, `${(obols / N * 100).toFixed(3)}%`);
  let chestBags = 0, chestObols = 0;
  for (let k = 0; k < 4000; k++) for (const d of rollChestLoot(ZONES[1], Math.random, "warrior")) { if (d.id === "coin_iron") chestBags++; if (d.id === "coin_obol") chestObols++; }
  check("todo baú de chefe traz uma sacola de tostões e o Óbolo cai só às vezes (zona 1: ~8%)", chestBags === 4000 && chestObols / 4000 > 0.05 && chestObols / 4000 < 0.12, `${(chestObols / 40).toFixed(1)}%`);
  check("as moedas não atrapalham o sorteio de equipamento (todos os ids existem ou são moeda)", rollChestLoot(ZONES[3]).every((d) => ITEMS[d.id] || d.id.startsWith("coin_")));
}

console.log("\n== NPCs ==");
{
  const hub = ZONES[HUB_ZONE];
  const inHub = zoneNpcs(HUB_ZONE);
  check("a cidade tem comerciante e ferreira, dentro do mapa", inHub.some((x) => x.kind === "merchant") && inHub.some((x) => x.kind === "smith") && inHub.every((x) => x.x >= 0 && x.y >= 0 && x.x < hub.w && x.y < hub.h));
  check("NENHUMA outra zona tem NPC de ofício (só a cidade)", Object.values(ZONES).filter((z) => z.id !== HUB_ZONE).every((z) => zoneNpcs(z.id).length === 0));
  check("a ferreira da cidade funde até o teto do mundo (a cidade não tem drops próprios)", zoneRarityCap(HUB_ZONE) === zoneRarityCap(3));
  check("o alcance de conversa é de alguns tiles", NPC_REACH >= 2 && NPC_REACH <= 6);
}

console.log("\n== Persistência do saldo e da troca ==");
{
  const db = await openDb();
  const repo = new Repo(db);
  const mkChar = async (name: string) => {
    const acc = await repo.upsertAccount("guest", randomUUID(), name);
    const r = await repo.createCharacter(acc.id, name, "warrior");
    if (!r.ok) throw new Error("personagem");
    return r.character;
  };
  const ca = await mkChar("EcoA" + Math.random().toString(36).slice(2, 7)), cb = await mkChar("EcoB" + Math.random().toString(36).slice(2, 7));
  const ia = await repo.loadInventory(ca.id);
  check("personagem novo começa com saldo zero", ia.iron === 0 && ia.obols === 0);
  ia.iron = 1234; ia.obols = 7; addItem(ia, "warrior_armor_rare", 1);
  await repo.saveInventory(ca.id, ia);
  const ra = await repo.loadInventory(ca.id);
  check("o saldo persiste junto com o inventário", ra.iron === 1234 && ra.obols === 7 && ra.slots[0]?.id === "warrior_armor_rare");
  // troca gravada nos dois lados numa transação
  const ib = await repo.loadInventory(cb.id);
  ib.iron = 10; addItem(ib, "warrior_helmet_common", 1);
  await repo.saveInventory(cb.id, ib);
  const offA = (parseOffer(ra, { items: [{ slot: 0, qty: 1 }], iron: 200, obols: 1 }) as any).offer;
  const offB = (parseOffer(ib, { items: [{ slot: 0, qty: 1 }] }) as any).offer;
  check("executa e grava os dois lados juntos", executeTrade(ra, offA, ib, offB).ok);
  await repo.saveInventoryPair([ca.id, repo.inventoryRows(ra)], [cb.id, repo.inventoryRows(ib)]);
  const la = await repo.loadInventory(ca.id), lb = await repo.loadInventory(cb.id);
  const has = (i: Inventory, id: string) => i.slots.some((s) => s?.id === id);
  check("depois de recarregar: o item mudou de dono uma única vez (sem duplicar nem sumir)", has(la, "warrior_helmet_common") && !has(la, "warrior_armor_rare") && has(lb, "warrior_armor_rare") && !has(lb, "warrior_helmet_common"));
  check("depois de recarregar: os saldos foram transferidos e conservados", la.iron === 1034 && la.obols === 6 && lb.iron === 210 && lb.obols === 1 && la.iron + lb.iron === 1244);
  // a transação é tudo-ou-nada: uma falha no meio não grava nenhum lado
  const bad = repo.inventoryRows(la);
  bad.items = [{ slot: 0, id: "x", qty: 1 }, { slot: 0, id: "y", qty: 1 }]; // chave primária duplicada: o banco recusa
  const good = repo.inventoryRows(lb);
  good.iron = 999999;
  let failed = false;
  try { await repo.saveInventoryPair([ca.id, bad], [cb.id, good]); } catch { failed = true; }
  const lb2 = await repo.loadInventory(cb.id);
  check("se um lado falha ao gravar, o outro lado também não grava (transação única)", failed && lb2.iron === 210);
  await db.close();
}

const failed = results.filter((r) => !r).length;
console.log(`\n${results.length - failed}/${results.length} passaram`);
process.exit(failed ? 1 : 0);
