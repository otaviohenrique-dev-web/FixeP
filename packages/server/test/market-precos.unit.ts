// Testes da janela de preços do mercado (consulta ao banco, PGlite em memória, relógio falso): ordem pelo preço por unidade,
// mais barato e mais caro por moeda, mine, item sem listagens, entrada inválida e listagens vencidas.
// Uso (em packages/server): npx tsx test/market-precos.unit.ts
process.env.PGLITE_DIR = "memory";
process.env.NODE_ENV = "test";

import { randomUUID } from "node:crypto";
import { ITEMS, MARKET_DAYS, minListingPrice } from "@frixep/shared";
import { emptyInventory, addItem, type Inventory } from "../src/game/inventory.js";
import { Market, type MarketActor } from "../src/game/market.js";
import { openDb } from "../src/db/index.js";
import { Repo } from "../src/db/repo.js";

const results: boolean[] = [];
const check = (name: string, ok: boolean, detail = "") => {
  results.push(ok);
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? "  -> " + detail : ""}`);
};
const slotOf = (i: Inventory, id: string) => i.slots.findIndex((s) => s?.id === id);

const db = await openDb();
const repo = new Repo(db);
let clock = 1_800_000_000_000;
const TTL = MARKET_DAYS * 86_400_000;
const market = new Market(db, repo, () => clock, TTL);

const mk = async (items: [string, number][]): Promise<MarketActor> => {
  const name = "Pr" + Math.random().toString(36).slice(2, 8);
  const acc = await repo.upsertAccount("guest", randomUUID(), name);
  const r = await repo.createCharacter(acc.id, name, "warrior");
  if (!r.ok) throw new Error("personagem");
  const inv = emptyInventory();
  inv.iron = 1_000_000;
  inv.obols = 1_000; // taxa de listagem em Óbolos
  for (const [id, q] of items) addItem(inv, id, q);
  await repo.saveInventory(r.character.id, inv);
  return { charId: r.character.id, name, inv };
};
const MAT = "mat_couro_curtido";
const OTHER = "mat_ferro_bruto";
if (!ITEMS[MAT] || !ITEMS[OTHER]) throw new Error("itens de craft ausentes");

console.log("\n== Preparo: listagens de Couro Curtido (Tostões e Óbolos) ==");
const s1 = await mk([[MAT, 30]]);
const s2 = await mk([[MAT, 30], [OTHER, 5]]);
const put = async (a: MarketActor, qty: number, price: number, cur: "iron" | "obols" = "iron") => {
  const r = await market.list(a, slotOf(a.inv, MAT), qty, price, cur);
  if (!r.ok) throw new Error("listar falhou: " + (r as any).error);
};
await put(s1, 1, 3000); // unidade 3000
await put(s1, 10, 20000); // unidade 2000 (pilha; preço total maior que o de 1 unidade)
await put(s2, 4, 4000); // unidade 1000 (a mais barata)
await put(s2, 2, 2400); // unidade 1200
const obolPrice = Math.max(minListingPrice(MAT, 2, "obols"), 200);
await put(s2, 2, obolPrice, "obols"); // Óbolos: unidade obolPrice/2, nunca comparada com Tostões

console.log("\n== Janela de preços (Tostões) ==");
const iron = await market.prices(MAT, "iron", s2.charId);
check("devolve as listagens da moeda pedida, com total", iron !== null && iron.total === 4 && iron.rows.length === 4, JSON.stringify(iron?.total));
check("ordem do mais barato por unidade (1000, 1200, 2000, 3000)", iron!.rows.map((r) => r.unit).join(",") === "1000,1200,2000,3000", iron!.rows.map((r) => r.unit).join(","));
check("mais barato e mais caro por unidade (Tostões)", iron!.cheapest === 1000 && iron!.dearest === 3000, `${iron!.cheapest}/${iron!.dearest}`);
check("Óbolos não entram na lista de Tostões", iron!.rows.every((r) => r.currency === "iron"));
check("a linha do próprio vendedor vem marcada como mine (e as outras não)", iron!.rows.filter((r) => r.mine).length === 2 && iron!.rows.every((r) => r.mine === (r.seller === s2.name)));
check("expõe só o nome do vendedor (sem id do personagem)", iron!.rows.every((r) => r.seller && !(r as any).seller_id && !(r as any).charId));

console.log("\n== Óbolos e casos vazios ==");
const obols = await market.prices(MAT, "obols", s1.charId);
check("Óbolos têm resumo próprio (uma só listagem: mais barato = mais caro)", obols !== null && obols.total === 1 && obols.cheapest === obolPrice / 2 && obols.dearest === obolPrice / 2, JSON.stringify(obols?.cheapest));
const none = await market.prices(OTHER, "iron", s1.charId);
check("item sem listagens: lista vazia e mais barato/mais caro nulos", none !== null && none.rows.length === 0 && none.total === 0 && none.cheapest === null && none.dearest === null);
check("item inexistente é recusado (null)", (await market.prices("nao_existe", "iron", s1.charId)) === null);
check("moeda inválida é recusada (null)", (await market.prices(MAT, "gold", s1.charId)) === null);
check("entrada que não é texto é recusada (null)", (await market.prices(42 as any, "iron", s1.charId)) === null);

console.log("\n== Listagens vencidas saem da janela ==");
clock += TTL + 1000;
const expired = await market.prices(MAT, "iron", s1.charId);
check("depois do prazo, nenhuma listagem aparece", expired !== null && expired.total === 0 && expired.rows.length === 0 && expired.cheapest === null);

const falhas = results.filter((r) => !r).length;
if (falhas) { console.log(`\n${falhas} verificação(ões) falharam`); process.exit(1); }
console.log("\nTodas as verificações passaram.");
process.exit(0);
