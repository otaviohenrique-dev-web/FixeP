// Testes unitários do inventário + ciclo de persistência (PGlite em memória).
// Uso (em packages/server): npx tsx test/inventory.unit.ts
process.env.PGLITE_DIR = "memory";
process.env.NODE_ENV = "test";

import { randomUUID } from "node:crypto";
import { INV_SLOTS, ITEMS, CLASS_DEFS, ACTION_IDS, maxHpFor } from "@frixep/shared";
import { emptyInventory, addItem, equipFromSlot, unequip, dropSlot, consumeOne, bonuses, snapshot } from "../src/game/inventory.js";
import { rollLoot, GEAR_CHANCE, POTION_CHANCE } from "../src/game/loot.js";
import { openDb } from "../src/db/index.js";
import { Repo } from "../src/db/repo.js";

const results: boolean[] = [];
const check = (name: string, ok: boolean, detail = "") => {
  results.push(ok);
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? "  -> " + detail : ""}`);
};

console.log("\n== Empilhar e encher a mochila ==");
{
  const inv = emptyInventory();
  check("adicionar poção ocupa 1 espaço", addItem(inv, "pocao_de_vida", 3) === 0 && inv.slots[0]?.qty === 3);
  check("segunda poção empilha no mesmo espaço", addItem(inv, "pocao_de_vida", 2) === 0 && inv.slots[0]?.qty === 5 && inv.slots[1] === null);
  check("pilha respeita o máximo (10) e transborda para outro espaço", addItem(inv, "pocao_de_vida", 8) === 0 && inv.slots[0]?.qty === 10 && inv.slots[1]?.qty === 3);
  check("item inexistente não entra", addItem(inv, "item_falso", 1) === 1);
  check("quantidade inválida (0, -1, NaN, 1.5) não entra", [0, -1, NaN, 1.5].every((q) => addItem(inv, "espada_de_ferro", q) >= 0 && inv.slots.filter((s) => s?.id === "espada_de_ferro").length === 0));
  const full = emptyInventory();
  for (let i = 0; i < INV_SLOTS; i++) addItem(full, "espada_enferrujada", 1);
  check("mochila cheia recusa e devolve o que não coube", addItem(full, "espada_enferrujada", 1) === 1);
  check("mochila cheia não perde nem duplica itens", full.slots.every((s) => s?.id === "espada_enferrujada" && s.qty === 1));
}

console.log("\n== Equipar, trocar e desequipar ==");
{
  const inv = emptyInventory();
  addItem(inv, "espada_enferrujada", 1);
  addItem(inv, "espada_de_ferro", 1);
  addItem(inv, "pocao_de_vida", 1);
  check("equipar arma de nível 1 funciona", equipFromSlot(inv, 0, 1, "warrior").ok && inv.equip.weapon === "espada_enferrujada" && inv.slots[0] === null);
  const r = equipFromSlot(inv, 1, 1, "warrior");
  check("arma de nível 3 é recusada no nível 1", !r.ok && (r as any).error.includes("3") && inv.equip.weapon === "espada_enferrujada" && inv.slots[1]?.id === "espada_de_ferro");
  check("no nível 3 a troca funciona e a arma antiga volta para o espaço", equipFromSlot(inv, 1, 3, "warrior").ok && inv.equip.weapon === "espada_de_ferro" && inv.slots[1]?.id === "espada_enferrujada");
  check("poção não é equipável", !equipFromSlot(inv, 2, 99, "warrior").ok && inv.slots[2]?.id === "pocao_de_vida");
  check("bônus da arma equipada é lido", bonuses(inv).dmgPct === 20 && bonuses(inv).hp === 0);
  check("desequipar devolve o item à mochila", unequip(inv, "weapon").ok && inv.equip.weapon === null && inv.slots.some((s) => s?.id === "espada_de_ferro"));
  check("desequipar sem nada equipado falha", !unequip(inv, "armor").ok);
  const cheio = emptyInventory();
  for (let i = 0; i < INV_SLOTS; i++) addItem(cheio, "pocao_de_vida", 10);
  cheio.equip.armor = "gibao_surrado";
  check("desequipar com a mochila cheia falha SEM perder o item", !unequip(cheio, "armor").ok && cheio.equip.armor === "gibao_surrado");
}

console.log("\n== Entradas inválidas ==");
{
  const lixo: unknown[] = [-1, INV_SLOTS, 99, 1.5, NaN, Infinity, "0", "x", null, undefined, {}, [], [0], true, { a: 1 }, "__proto__"];
  const inv2 = emptyInventory();
  addItem(inv2, "espada_enferrujada", 1); // existe um item no espaço 0: um índice aceito por engano mexeria nele
  const snap = JSON.stringify(inv2);
  for (const v of lixo) { equipFromSlot(inv2, v, 99, "warrior"); dropSlot(inv2, v); }
  check("nenhum valor lixo (texto, array, NaN, fora do intervalo) é aceito como índice", JSON.stringify(inv2) === snap);
  check("unequip com espaço inválido é recusado", ["", "x", "__proto__", "constructor", 0, null, {}].every((v) => !unequip(emptyInventory(), v).ok));
  const inv3 = emptyInventory();
  addItem(inv3, "pocao_de_vida", 1);
  consumeOne(inv3, 0);
  check("consumir a última unidade esvazia o espaço", inv3.slots[0] === null);
}

console.log("\n== Armas por classe ==");
{
  const inv = emptyInventory();
  addItem(inv, "espada_enferrujada", 1);
  addItem(inv, "arco_curto", 1);
  addItem(inv, "cajado_de_galho", 1);
  addItem(inv, "gibao_surrado", 1);
  check("arqueiro não equipa espada", !equipFromSlot(inv, 0, 99, "archer").ok && inv.equip.weapon === null && inv.slots[0]?.id === "espada_enferrujada");
  check("clérigo não equipa arco", !equipFromSlot(inv, 1, 99, "cleric").ok && inv.slots[1]?.id === "arco_curto");
  check("guerreiro não equipa cajado", !equipFromSlot(inv, 2, 99, "warrior").ok && inv.slots[2]?.id === "cajado_de_galho");
  check("a recusa diz qual classe pode usar", String((equipFromSlot(inv, 0, 99, "cleric") as any).error).includes("Guerreiro"));
  check("arqueiro equipa o arco", equipFromSlot(inv, 1, 99, "archer").ok && inv.equip.weapon === "arco_curto");
  check("armadura serve a qualquer classe", equipFromSlot(inv, 3, 99, "cleric").ok && inv.equip.armor === "gibao_surrado");
}

console.log("\n== Definições das classes ==");
{
  const kinds = new Set(["melee", "ring", "dashHit", "tauntBuff", "dodge", "projectile", "trap", "rain", "healAoe", "emberBuff", "revive"]);
  for (const cls of ["warrior", "archer", "cleric"] as const) {
    const d = CLASS_DEFS[cls];
    const acts = ACTION_IDS.map((a) => d.actions[a]);
    check(`${d.name}: 5 ações com tipo válido e recarga positiva`, acts.every((x) => x && kinds.has(x.kind) && x.cd > 0));
  }
  check("vida base por classe: 120 / 90 / 100", maxHpFor("warrior", 1) === 120 && maxHpFor("archer", 1) === 90 && maxHpFor("cleric", 1) === 100);
  check("vida cresce 10 por nível e soma a armadura", maxHpFor("archer", 5, 15) === 90 + 40 + 15);
  check("toda arma tem classe e todo item de classe existe nas definições", Object.values(ITEMS).filter((i) => i.kind === "weapon").every((i) => i.cls && CLASS_DEFS[i.cls]));
  check("cada classe tem uma arma de cada raridade", (["warrior", "archer", "cleric"] as const).every((c) => (["common", "uncommon", "rare"] as const).every((r) => Object.values(ITEMS).some((i) => i.kind === "weapon" && i.cls === c && i.rarity === r))));
}

console.log("\n== Sorteio de loot ==");
{
  const N = 20000;
  let gear = 0, potion = 0, rare = 0, gearTotal = 0;
  for (let i = 0; i < N; i++) {
    for (const d of rollLoot()) {
      if (ITEMS[d.id].kind === "potion") potion++;
      else { gear++; gearTotal++; if (ITEMS[d.id].rarity === "rare") rare++; }
    }
  }
  const near = (got: number, exp: number, tol: number) => Math.abs(got - exp) <= tol;
  check(`chance de equipamento ≈ ${GEAR_CHANCE * 100}%`, near(gear / N, GEAR_CHANCE, 0.02), `${((gear / N) * 100).toFixed(1)}%`);
  check(`chance de poção ≈ ${POTION_CHANCE * 100}%`, near(potion / N, POTION_CHANCE, 0.02), `${((potion / N) * 100).toFixed(1)}%`);
  check("itens raros são ≈ 5% dos equipamentos", near(rare / gearTotal, 0.05, 0.02), `${((rare / gearTotal) * 100).toFixed(1)}%`);
  const stray = (["warrior", "archer", "cleric"] as const).flatMap((c) => Array.from({ length: 4000 }, () => rollLoot(c)).flat().filter((d) => ITEMS[d.id].cls && ITEMS[d.id].cls !== c));
  check("ninguém recebe arma de outra classe como loot", stray.length === 0, `${stray.length} indevidos`);
  check("todo drop sorteado existe no catálogo", Array.from({ length: 2000 }, () => rollLoot()).flat().every((d) => ITEMS[d.id] && d.qty >= 1));
}

console.log("\n== Persistência no banco ==");
{
  const db = await openDb();
  const repo = new Repo(db);
  const acct = await repo.upsertAccount("guest", randomUUID(), "Teste");
  const created = await repo.createCharacter(acct.id, "Inventor" + Math.random().toString(36).slice(2, 7), "warrior");
  if (!created.ok) throw new Error("não criou personagem de teste");
  const id = created.character.id;

  check("personagem novo tem inventário vazio", (await repo.loadInventory(id)).slots.every((s) => s === null));
  const inv = emptyInventory();
  addItem(inv, "pocao_de_vida", 7);
  addItem(inv, "espada_de_ferro", 1);
  addItem(inv, "armadura_de_brasa", 1);
  inv.equip.weapon = "espada_enferrujada";
  inv.equip.armor = "gibao_surrado";
  await repo.saveInventory(id, inv);
  const back = await repo.loadInventory(id);
  check("inventário e equipamento voltam idênticos do banco", JSON.stringify(snapshot(back)) === JSON.stringify(snapshot(inv)));

  // salvar de novo com menos coisas: não pode sobrar lixo nem duplicar
  inv.slots[1] = null;
  inv.equip.weapon = null;
  await repo.saveInventory(id, inv);
  const back2 = await repo.loadInventory(id);
  check("salvar de novo substitui (não acumula) itens e equipamento", JSON.stringify(snapshot(back2)) === JSON.stringify(snapshot(inv)) && back2.equip.weapon === null);

  // dado corrompido/antigo no banco não pode quebrar a entrada
  await db.query("insert into inventory_items (character_id, slot, item_id, qty) values ($1, 15, 'item_removido', 3)", [id]);
  await db.query("update inventory_items set qty = 99 where character_id = $1 and item_id = 'pocao_de_vida'", [id]);
  await db.query("update equipment set item_id = 'espada_de_ferro' where character_id = $1 and slot = 'armor'", [id]);
  const back3 = await repo.loadInventory(id);
  check("item removido do jogo é ignorado ao carregar", !back3.slots.some((s) => s?.id === "item_removido"));
  check("pilha com quantidade acima do máximo é limitada ao carregar", back3.slots.find((s) => s?.id === "pocao_de_vida")?.qty === ITEMS.pocao_de_vida.stack);
  check("arma no espaço de armadura é ignorada ao carregar", back3.equip.armor === null);

  // salvamentos simultâneos do mesmo personagem não corrompem (lock + transação)
  const invA = emptyInventory(); addItem(invA, "pocao_de_vida", 1);
  const invB = emptyInventory(); addItem(invB, "pocao_de_vida", 5);
  await Promise.all([repo.saveInventory(id, invA), repo.saveInventory(id, invB)]);
  const fin = await repo.loadInventory(id);
  const qtd = fin.slots.filter((s) => s?.id === "pocao_de_vida");
  check("dois salvamentos simultâneos terminam num estado consistente (nunca misturado)", qtd.length === 1 && (qtd[0]!.qty === 1 || qtd[0]!.qty === 5), `qtd ${qtd.map((q) => q!.qty)}`);

  // apagar o personagem apaga o inventário (cascade)
  await db.query("delete from characters where id = $1", [id]);
  const orfaos = (await db.query("select count(*)::int as n from inventory_items where character_id = $1", [id])).rows[0].n;
  check("apagar o personagem apaga o inventário junto (sem órfãos)", orfaos === 0);
  await db.close();
}

const failed = results.filter((r) => !r).length;
console.log(`\n${results.length - failed}/${results.length} verificações passaram`);
process.exit(failed ? 1 : 0);
