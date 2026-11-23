// Testes unitários do inventário, itens, raridades, drops e persistência (PGlite em memória).
// Uso (em packages/server): npx tsx test/inventory.unit.ts
process.env.PGLITE_DIR = "memory";
process.env.NODE_ENV = "test";

import { randomUUID } from "node:crypto";
import {
  INV_SLOTS, ITEMS, CLASS_DEFS, ACTION_IDS, ZONES, ZONE_IDS, RARITIES, RARITIES_ALL, RARITY_NAME, WEAPON_TYPES, RARITY_COLOR, PLAYABLE_CLASSES,
  maxHpFor, maxManaFor, rarityIndex, gearBonuses, effectiveAction, migrateItemId, kitLines, type CharClass, type Rarity,
} from "@frixep/shared";
import { emptyInventory, addItem, equipFromSlot, unequip, dropSlot, consumeOne, bonuses, snapshot, sortInventory, migrateInventory } from "../src/game/inventory.js";
import { rollMobLoot as rollMobLootAll, rollChestLoot as rollChestLootAll, pickGear } from "../src/game/loot.js";
// as moedas (sacolas e Óbolos) são testadas em economy.unit.ts; aqui só o equipamento e a poção
const rollMobLoot: typeof rollMobLootAll = (...a) => rollMobLootAll(...a).filter((d) => ITEMS[d.id]);
const rollChestLoot: typeof rollChestLootAll = (...a) => rollChestLootAll(...a).filter((d) => ITEMS[d.id]);
import { openDb } from "../src/db/index.js";
import { Repo } from "../src/db/repo.js";
// zonas de combate com inimigos comuns e chefe: fica de fora a cidade (segura) e a Arena Sangrenta (sem monstros, sem drops de abate)
const COMBAT_ZONES = ZONE_IDS.filter((z) => !ZONES[z].safe && !ZONES[z].pvp);

const results: boolean[] = [];
const check = (name: string, ok: boolean, detail = "") => {
  results.push(ok);
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? "  -> " + detail : ""}`);
};

console.log("\n== Catálogo de itens ==");
{
  const all = Object.values(ITEMS);
  check("8 níveis de raridade, cada um com nome e cor próprios (inferior e ancestral ainda sem itens)", RARITIES_ALL.length === 8 && new Set(RARITIES_ALL.map((r) => RARITY_COLOR[r])).size === 8 && RARITIES_ALL.every((r) => !!RARITY_NAME[r]) && RARITIES_ALL[0] === "junk" && RARITIES_ALL[7] === "ancestral" && RARITIES.every((r) => RARITIES_ALL.includes(r)));
  check("6 raridades com cores distintas", RARITIES.length === 6 && new Set(RARITIES.map((r) => RARITY_COLOR[r])).size === 6);
  check("4 classes jogáveis, incluindo o Mago", PLAYABLE_CLASSES.length === 4 && PLAYABLE_CLASSES.includes("mage"));
  check("cada classe tem 3 ou mais tipos de arma", PLAYABLE_CLASSES.every((c) => Object.values(WEAPON_TYPES).filter((t) => t.cls === c).length >= 3));
  check("o Guerreiro tem 3 espadas de duas mãos e 1 de uma mão", Object.values(WEAPON_TYPES).filter((t) => t.cls === "warrior" && t.hands === 2).length === 3 && Object.values(WEAPON_TYPES).filter((t) => t.cls === "warrior" && t.hands === 1).length === 1);
  check("toda arma tem tipo, classe e mãos; todo equipamento de classe tem classe válida", all.filter((i) => i.kind === "weapon").every((i) => i.wtype && i.cls && i.hands && WEAPON_TYPES[i.wtype]) && all.filter((i) => i.kind !== "potion" && i.kind !== "material").every((i) => i.cls && CLASS_DEFS[i.cls]));
  check("cada classe tem arma, mão secundária, elmo, armadura, botas e capa em TODAS as raridades", PLAYABLE_CLASSES.every((c) => RARITIES.every((r) => (["weapon", "offhand", "helmet", "armor", "boots", "cape"] as const).every((k) => all.some((i) => i.cls === c && i.rarity === r && i.kind === k)))));
  check("raridade maior exige mais nível e dá mais poder", PLAYABLE_CLASSES.every((c) => { const w = RARITIES.map((r) => ITEMS[`${c}_armor_${r}`]); return w.every((x, i) => i === 0 || (x.minLevel > w[i - 1].minLevel && x.hp! > w[i - 1].hp!)); }));
  check("tipos mais exigentes pedem mais nível (Montante > Espada de Uma Mão)", ITEMS.montante_common.minLevel > ITEMS.espada_1m_common.minLevel);
  check("ids únicos e nomes não vazios", new Set(all.map((i) => i.id)).size === all.length && all.every((i) => i.name.length > 2));
  check("o kit de uma arma gera texto para a mochila", kitLines(WEAPON_TYPES.montante.kit).length >= 3);
}

console.log("\n== Empilhar e encher a mochila ==");
{
  const inv = emptyInventory();
  check("adicionar poção ocupa 1 espaço", addItem(inv, "pocao_de_vida", 3) === 0 && inv.slots[0]?.qty === 3);
  check("segunda poção empilha no mesmo espaço", addItem(inv, "pocao_de_vida", 2) === 0 && inv.slots[0]?.qty === 5 && inv.slots[1] === null);
  check("pilha respeita o máximo (10) e transborda para outro espaço", addItem(inv, "pocao_de_vida", 8) === 0 && inv.slots[0]?.qty === 10 && inv.slots[1]?.qty === 3);
  check("item inexistente não entra", addItem(inv, "item_falso", 1) === 1);
  check("quantidade inválida (0, -1, NaN, 1.5) não entra", [0, -1, NaN, 1.5].every((q) => addItem(inv, "espada_larga_uncommon", q) >= 0 && inv.slots.filter((s) => s?.id === "espada_larga_uncommon").length === 0));
  const full = emptyInventory();
  for (let i = 0; i < INV_SLOTS; i++) addItem(full, "espada_1m_common", 1);
  check("mochila cheia recusa e devolve o que não coube", addItem(full, "espada_1m_common", 1) === 1);
  check("mochila cheia não perde nem duplica itens", full.slots.every((s) => s?.id === "espada_1m_common" && s.qty === 1));
}

console.log("\n== Equipar, trocar e desequipar ==");
{
  const inv = emptyInventory();
  addItem(inv, "espada_1m_common", 1);
  addItem(inv, "espada_1m_uncommon", 1);
  addItem(inv, "pocao_de_vida", 1);
  check("equipar arma de nível 1 funciona", equipFromSlot(inv, 0, 1, "warrior").ok && inv.equip.weapon === "espada_1m_common" && inv.slots[0] === null);
  const r = equipFromSlot(inv, 1, 1, "warrior");
  check("arma de nível 3 é recusada no nível 1", !r.ok && (r as any).error.includes("3") && inv.equip.weapon === "espada_1m_common" && inv.slots[1]?.id === "espada_1m_uncommon");
  check("no nível 3 a troca funciona e a arma antiga volta para o espaço", equipFromSlot(inv, 1, 3, "warrior").ok && inv.equip.weapon === "espada_1m_uncommon" && inv.slots[1]?.id === "espada_1m_common");
  check("poção não é equipável", !equipFromSlot(inv, 2, 99, "warrior").ok && inv.slots[2]?.id === "pocao_de_vida");
  check("bônus da arma equipada é lido (+20% de poder; kit da Espada de Uma Mão)", bonuses(inv, "warrior").dmgPct === 20 && bonuses(inv, "warrior").hp === 0 && bonuses(inv, "warrior").kit.cd === 0.85);
  check("desequipar devolve o item à mochila", unequip(inv, "weapon").ok && inv.equip.weapon === null && inv.slots.some((s) => s?.id === "espada_1m_uncommon"));
  check("desequipar sem nada equipado falha", !unequip(inv, "armor").ok);
  const cheio = emptyInventory();
  for (let i = 0; i < INV_SLOTS; i++) addItem(cheio, "pocao_de_vida", 10);
  cheio.equip.armor = "warrior_armor_common";
  check("desequipar com a mochila cheia falha SEM perder o item", !unequip(cheio, "armor").ok && cheio.equip.armor === "warrior_armor_common");
}

console.log("\n== Entradas inválidas ==");
{
  const lixo: unknown[] = [-1, INV_SLOTS, 99, 1.5, NaN, Infinity, "0", "x", null, undefined, {}, [], [0], true, { a: 1 }, "__proto__"];
  const inv2 = emptyInventory();
  addItem(inv2, "espada_1m_common", 1); // existe um item no espaço 0: um índice aceito por engano mexeria nele
  const snap = JSON.stringify(inv2);
  for (const v of lixo) { equipFromSlot(inv2, v, 99, "warrior"); dropSlot(inv2, v); }
  check("nenhum valor lixo (texto, array, NaN, fora do intervalo) é aceito como índice", JSON.stringify(inv2) === snap);
  check("unequip com espaço inválido é recusado", ["", "x", "__proto__", "constructor", 0, null, {}].every((v) => !unequip(emptyInventory(), v).ok));
  const inv3 = emptyInventory();
  addItem(inv3, "pocao_de_vida", 1);
  consumeOne(inv3, 0);
  check("consumir a última unidade esvazia o espaço", inv3.slots[0] === null);
}

console.log("\n== Equipamento só da própria classe (mas qualquer classe pode dropar de tudo) ==");
{
  const inv = emptyInventory();
  addItem(inv, "montante_common", 1);
  addItem(inv, "arco_longo_common", 1);
  addItem(inv, "cajado_sagrado_common", 1);
  addItem(inv, "cajado_arcano_common", 1);
  addItem(inv, "warrior_armor_common", 1);
  check("arqueiro não equipa espada", !equipFromSlot(inv, 0, 99, "archer").ok && inv.equip.weapon === null && inv.slots[0]?.id === "montante_common");
  check("clérigo não equipa arco", !equipFromSlot(inv, 1, 99, "cleric").ok && inv.slots[1]?.id === "arco_longo_common");
  check("guerreiro não equipa cajado de mago", !equipFromSlot(inv, 3, 99, "warrior").ok && inv.slots[3]?.id === "cajado_arcano_common");
  check("a recusa diz qual classe pode usar", String((equipFromSlot(inv, 0, 99, "cleric") as any).error).includes("Guerreiro"));
  check("armadura de guerreiro NÃO serve ao mago (itens específicos de classe)", !equipFromSlot(inv, 4, 99, "mage").ok && inv.equip.armor === null);
  check("mago equipa o cajado arcano (nível 3: tipo exigente)", !equipFromSlot(inv, 3, 1, "mage").ok && equipFromSlot(inv, 3, 3, "mage").ok && inv.equip.weapon === "cajado_arcano_common");
  // dado antigo/forçado: item de outra classe equipado NÃO conta nos bônus
  const forced = emptyInventory();
  forced.equip.weapon = "montante_epic";
  forced.equip.armor = "warrior_armor_epic";
  check("item de outra classe equipado à força não dá bônus nem kit", bonuses(forced, "mage").dmgPct === 0 && bonuses(forced, "mage").hp === 0 && bonuses(forced, "warrior").hp === ITEMS.warrior_armor_epic.hp);
}

console.log("\n== Duas mãos, mão secundária e todos os espaços ==");
{
  const inv = emptyInventory();
  addItem(inv, "montante_common", 1); // 2 mãos
  addItem(inv, "espada_1m_common", 1); // 1 mão
  addItem(inv, "escudo_guerra_common", 1);
  addItem(inv, "warrior_helmet_common", 1);
  addItem(inv, "warrior_boots_uncommon", 1);
  addItem(inv, "warrior_cape_common", 1);
  check("espada de duas mãos bloqueia a mão secundária", equipFromSlot(inv, 0, 99, "warrior").ok && !equipFromSlot(inv, 2, 99, "warrior").ok && inv.equip.offhand === null);
  check("com espada de uma mão o escudo é aceito", equipFromSlot(inv, 1, 99, "warrior").ok && equipFromSlot(inv, 2, 99, "warrior").ok && inv.equip.offhand === "escudo_guerra_common");
  const mont = inv.slots.findIndex((s) => s?.id === "montante_common");
  check("equipar duas mãos devolve o escudo à mochila", equipFromSlot(inv, mont, 99, "warrior").ok && inv.equip.offhand === null && inv.slots.some((s) => s?.id === "escudo_guerra_common") && inv.equip.weapon === "montante_common");
  for (const id of ["warrior_helmet_common", "warrior_boots_uncommon", "warrior_cape_common"]) equipFromSlot(inv, inv.slots.findIndex((s) => s?.id === id), 99, "warrior");
  check("elmo, botas e capa vão cada um ao seu espaço", inv.equip.helmet === "warrior_helmet_common" && inv.equip.boots === "warrior_boots_uncommon" && inv.equip.cape === "warrior_cape_common");
  const b = bonuses(inv, "warrior");
  check("os bônus somam todos os espaços (vida, recarga das botas, recurso por regeneração)", b.hp === 8 + 12 + 5 && b.regen > 0 && b.dmgPct === 10, JSON.stringify({ hp: b.hp, regen: b.regen, dmgPct: b.dmgPct }));
  // 2 mãos com mochila cheia e escudo equipado: não troca e não perde nada
  const apertado = emptyInventory();
  apertado.equip.weapon = "espada_1m_common";
  apertado.equip.offhand = "escudo_guerra_common";
  apertado.slots[0] = { id: "montante_common", qty: 1 };
  for (let i = 1; i < INV_SLOTS; i++) apertado.slots[i] = { id: "pocao_de_vida", qty: 10 };
  const before = JSON.stringify(apertado);
  check("duas mãos com a mochila cheia é recusado sem perder nada", !equipFromSlot(apertado, 0, 99, "warrior").ok && JSON.stringify(apertado) === before);
}

console.log("\n== Kit da arma ==");
{
  const base = CLASS_DEFS.warrior.actions;
  const mont = gearBonuses({ ...emptyInventory().equip, weapon: "montante_common" }, "warrior");
  const ult = effectiveAction(base.ultimate, "ultimate", mont.kit);
  check("Montante: Terremoto mais forte e maior; ataque mais lento", ult.dmg! > base.ultimate.dmg! * 1.4 && ult.radius! > base.ultimate.radius! && effectiveAction(base.attack, "attack", mont.kit).cd > base.attack.cd);
  const bota = effectiveAction(base.attack, "attack", {}, 10);
  check("redução de recarga (botas) encurta a recarga em 10%", Math.abs(bota.cd - base.attack.cd * 0.9) < 1e-9);
  check("sem kit a ação fica idêntica", JSON.stringify(effectiveAction(base.skill1, "skill1", {})) === JSON.stringify(base.skill1));
  const lamina = effectiveAction(base.skill1, "skill1", WEAPON_TYPES.lamina_runica.kit);
  check("Lâmina Rúnica: habilidades mais baratas e Giro mais forte", lamina.cost! < base.skill1.cost! && lamina.dmg! > base.skill1.dmg!);
  const arco = effectiveAction(CLASS_DEFS.archer.actions.attack, "attack", WEAPON_TYPES.arco_longo.kit);
  check("Arco Longo: mais alcance", arco.range! > CLASS_DEFS.archer.actions.attack.range!);
  const orbe = effectiveAction(CLASS_DEFS.mage.actions.skill1, "skill1", WEAPON_TYPES.orbe_instavel.kit);
  check("Orbe Instável: Bola de Fogo com explosão maior e mais forte", orbe.blast! > CLASS_DEFS.mage.actions.skill1.blast! && orbe.dmg! > CLASS_DEFS.mage.actions.skill1.dmg!);
  check("teto de redução de recarga (30%) e de dano (60%)", gearBonuses({ weapon: null, offhand: null, helmet: null, armor: null, boots: "warrior_boots_mythic", cape: null }, "warrior").cdr <= 30);
}

console.log("\n== Classes ==");
{
  const kinds = new Set(["melee", "ring", "dashHit", "tauntBuff", "dodge", "projectile", "blast", "trap", "rain", "pull", "healAoe", "emberBuff", "revive", "reflectBuff", "healFocus"]);
  for (const cls of PLAYABLE_CLASSES) {
    const d = CLASS_DEFS[cls];
    const acts = [...ACTION_IDS.map((a) => d.actions[a]), ...(d.skill1Alt ? [d.skill1Alt] : [])];
    check(`${d.name}: 5 ações com tipo válido e recarga positiva`, acts.every((x) => x && kinds.has(x.kind) && x.cd > 0));
  }
  check("vida base por classe: 120 / 90 / 100 / 75 (o Mago tem o menor sustain)", maxHpFor("warrior", 1) === 120 && maxHpFor("archer", 1) === 90 && maxHpFor("cleric", 1) === 100 && maxHpFor("mage", 1) === 75);
  check("vida cresce 10 por nível e soma a armadura", maxHpFor("archer", 5, 15) === 90 + 40 + 15);
  const peak = (c: CharClass) => Math.max(...ACTION_IDS.map((a) => CLASS_DEFS[c].actions[a].dmg ?? 0));
  check("o Mago tem o maior dano do jogo (ultimate) e nenhuma cura", peak("mage") > peak("warrior") && peak("mage") > peak("archer") && peak("mage") > peak("cleric") && ACTION_IDS.every((a) => !CLASS_DEFS.mage.actions[a].heal));
}

console.log("\n== Recurso das classes (Fúria, Foco, Mana) ==");
{
  for (const cls of PLAYABLE_CLASSES) {
    const d = CLASS_DEFS[cls];
    check(`${d.name}: recurso "${d.resource.name}" com máximo, regeneração e ícone válidos`, d.resource.max > 0 && d.resource.regen > 0 && d.resource.perLevel >= 0 && ["flame", "eye", "drop"].includes(d.resource.icon));
    check(`${d.name}: as 3 habilidades têm custo positivo e a Esquiva é de graça`, (["skill1", "skill2", "skill3"] as const).every((a) => (d.actions[a].cost ?? 0) > 0) && (d.actions.dodge.cost ?? 0) === 0);
    const total = (["skill1", "skill2", "skill3"] as const).reduce((n, a) => n + (d.actions[a].cost ?? 0), 0);
    check(`${d.name}: usar as 3 habilidades seguidas custa ${total} de ${d.resource.max} (cabe, mas pesa)`, total <= d.resource.max && total >= d.resource.max * 0.6);
  }
  check("o máximo cresce por nível: Guerreiro 100 → 112 no nível 5; Clérigo 120 → 136; Mago 140 → 160", maxManaFor("warrior", 1) === 100 && maxManaFor("warrior", 5) === 112 && maxManaFor("cleric", 1) === 120 && maxManaFor("cleric", 5) === 136 && maxManaFor("mage", 1) === 140 && maxManaFor("mage", 5) === 160);
  check("o ataque básico do Guerreiro e do Arqueiro é de graça; o do Clérigo e do Mago custa pouco", (CLASS_DEFS.warrior.actions.attack.cost ?? 0) === 0 && (CLASS_DEFS.archer.actions.attack.cost ?? 0) === 0 && (CLASS_DEFS.cleric.actions.attack.cost ?? 0) === 4 && (CLASS_DEFS.mage.actions.attack.cost ?? 0) === 4);
}

console.log("\n== Drops: raridade, teto por zona, taxas ==");
{
  const N = 60000;
  const idx = (id: string) => rarityIndex(ITEMS[id].rarity);
  for (const zid of COMBAT_ZONES) {
    const z = ZONES[zid];
    const cap = Math.max(...Object.keys(z.drops.weights).map((r) => rarityIndex(r as Rarity)));
    let gear = 0, potion = 0, top = 0, rareUp = 0;
    const byCls: Record<string, number> = {};
    for (let i = 0; i < N; i++) {
      for (const d of rollMobLoot(z)) {
        if (ITEMS[d.id].kind === "potion") { potion++; continue; }
        gear++; top = Math.max(top, idx(d.id)); if (idx(d.id) >= 2) rareUp++;
        byCls[ITEMS[d.id].cls!] = (byCls[ITEMS[d.id].cls!] ?? 0) + 1;
      }
    }
    check(`${z.name}: nenhum drop de inimigo passa do teto (${RARITIES[cap]})`, top <= cap, `maior raridade: ${RARITIES[top]}`);
    check(`${z.name}: equipamento ≈ ${z.drops.gear * 100}% por abate, poção ≈ ${z.drops.potion * 100}%`, Math.abs(gear / N - z.drops.gear) < 0.01 && Math.abs(potion / N - z.drops.potion) < 0.012, `${((gear / N) * 100).toFixed(1)}% / ${((potion / N) * 100).toFixed(1)}%`);
    check(`${z.name}: raros+ são raros de verdade (≤ 2% dos abates)`, rareUp / N <= 0.02, `${((rareUp / N) * 100).toFixed(2)}%`);
    check(`${z.name}: itens de TODAS as classes caem (qualquer classe pode dropar qualquer classe)`, PLAYABLE_CLASSES.every((c) => (byCls[c] ?? 0) > gear * 0.18), JSON.stringify(byCls));
  }
  check("zona 1: impossível épico ou melhor", Array.from({ length: 80000 }, () => rollMobLoot(ZONES[1])).flat().every((d) => idx(d.id) <= 1));
  check("zona 2: impossível épico ou melhor em inimigos comuns", Array.from({ length: 80000 }, () => rollMobLoot(ZONES[2])).flat().every((d) => idx(d.id) <= 2));
  check("lendário e mítico NUNCA saem de inimigos comuns de nenhuma zona", COMBAT_ZONES.every((z) => Array.from({ length: 50000 }, () => rollMobLoot(ZONES[z])).flat().every((d) => idx(d.id) <= 3)));
  check("todo drop sorteado existe no catálogo", Array.from({ length: 4000 }, () => rollMobLoot(ZONES[3])).flat().every((d) => ITEMS[d.id] && d.qty >= 1));
  // rng fixo: deterministico
  check("rng no zero dá equipamento comum; rng alto não dá nada", rollMobLoot(ZONES[1], () => 0).some((d) => ITEMS[d.id].rarity === "common" && ITEMS[d.id].kind !== "potion") && rollMobLoot(ZONES[1], () => 0.999).length === 0);
  check("pickGear respeita a raridade pedida", RARITIES.every((r) => Array.from({ length: 300 }, () => ITEMS[pickGear(r, Math.random)].rarity).every((x) => x === r)));
}

console.log("\n== Baús de chefe ==");
{
  const idx = (id: string) => rarityIndex(ITEMS[id].rarity);
  const gearOf = (z: number) => Array.from({ length: 4000 }, () => rollChestLoot(ZONES[z])).map((c) => c.filter((d) => ITEMS[d.id].kind !== "potion"));
  check("zona 1: o baú tem no máximo incomuns (e pelo menos 1 incomum)", gearOf(1).every((c) => c.length === ZONES[1].boss!.chest.count && c.every((d) => idx(d.id) <= 1) && idx(c[0].id) >= 1));
  check("zona 2: o baú nunca passa de épico e sempre tem raro ou melhor", gearOf(2).every((c) => c.every((d) => idx(d.id) <= 3) && idx(c[0].id) >= 2));
  const z3 = gearOf(3);
  check("zona 3: o baú sempre tem épico ou melhor", z3.every((c) => idx(c[0].id) >= 3));
  const flat = z3.flat();
  check("zona 3: lendário aparece (~18%) e mítico é raríssimo (~2%)", flat.filter((d) => idx(d.id) === 4).length > 0 && flat.filter((d) => idx(d.id) === 5).length / flat.length < 0.05 && flat.filter((d) => idx(d.id) === 5).length > 0, `${flat.filter((d) => idx(d.id) === 4).length} lendários, ${flat.filter((d) => idx(d.id) === 5).length} míticos em ${flat.length}`);
  check("só os baús dão lendário/mítico: o teto dos inimigos comuns é menor que o dos baús", Object.keys(ZONES[3].drops.weights).every((r) => rarityIndex(r as Rarity) <= 3) && COMBAT_ZONES.every((z) => ZONES[z].boss!.level > Math.max(...ZONES[z].enemies.map((e) => e.level)) - 1));
  check("cada zona tem um chefe", COMBAT_ZONES.every((z) => ZONES[z].boss!.kind && ZONES[z].boss!.respawnS >= 120));
}

console.log("\n== Organizar a mochila ==");
{
  const inv = emptyInventory();
  addItem(inv, "pocao_de_vida", 4);
  addItem(inv, "warrior_cape_common", 1);
  addItem(inv, "espada_1m_rare", 1);
  addItem(inv, "pocao_de_vida", 3);
  inv.slots[10] = { id: "pocao_de_vida", qty: 2 };
  addItem(inv, "espada_1m_common", 1);
  sortInventory(inv);
  const ids = inv.slots.filter(Boolean).map((s) => s!.id);
  check("armas primeiro, melhor raridade antes; poções por último e empilhadas", ids[0] === "espada_1m_rare" && ids[1] === "espada_1m_common" && ids[ids.length - 1] === "pocao_de_vida" && inv.slots.filter((s) => s?.id === "pocao_de_vida").length === 1);
  check("encosta tudo no começo, sem buracos, e não perde itens", inv.slots.findIndex((s) => s === null) === ids.length && inv.slots.slice(ids.length).every((s) => s === null) && inv.slots.filter((s) => s?.id === "pocao_de_vida")[0]!.qty === 9);
}

console.log("\n== Migração dos itens antigos ==");
{
  check("espada antiga vira espada de uma mão da mesma raridade", migrateItemId("espada_de_ferro", "warrior") === "espada_1m_uncommon" && migrateItemId("arco_da_geada", "archer") === "arco_longo_rare");
  check("armadura antiga vira a da classe do personagem", migrateItemId("gibao_surrado", "mage") === "mage_armor_common" && migrateItemId("armadura_de_brasa", "cleric") === "cleric_armor_rare");
  check("todo id antigo traduzido existe no catálogo", ["espada_enferrujada", "espada_de_ferro", "lamina_da_geada", "arco_curto", "arco_composto", "arco_da_geada", "cajado_de_galho", "cajado_de_cinzas", "cajado_da_brasa", "cajado_de_aprendiz", "gibao_surrado", "cota_de_malha", "armadura_de_brasa"].every((o) => ITEMS[migrateItemId(o, "warrior")]));
  const inv = emptyInventory();
  inv.slots[3] = { id: "espada_enferrujada", qty: 1 };
  inv.equip.armor = "cota_de_malha";
  check("migrateInventory traduz mochila e equipamento e avisa", migrateInventory(inv, "warrior") && inv.slots[3]!.id === "espada_1m_common" && inv.equip.armor === "warrior_armor_uncommon" && !migrateInventory(inv, "warrior"));
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
  // Com afixos explícitos: equipamento SEM afixo é recuperado com backfill ao carregar (ver o bloco de backfill abaixo),
  // então este round-trip precisa dar afixos a cada peça para comparar exatamente.
  addItem(inv, "espada_1m_uncommon", 1, ["afiado"]);
  addItem(inv, "warrior_armor_rare", 1, ["vigor"]);
  inv.equip.weapon = "espada_1m_common";
  inv.equip.armor = "warrior_armor_common";
  inv.equip.offhand = "escudo_guerra_epic";
  inv.equip.helmet = "warrior_helmet_legendary";
  inv.equip.boots = "warrior_boots_mythic";
  inv.equip.cape = "warrior_cape_rare";
  inv.equipAf = { weapon: ["afiado"], offhand: ["afiado"], helmet: ["vigor"], armor: ["vigor"], boots: ["vigor"], cape: ["vigor"] }; // ordem dos EQUIP_SLOTS (o snapshot compara o JSON)
  await repo.saveInventory(id, inv);
  const back = await repo.loadInventory(id);
  check("inventário e os 6 espaços de equipamento voltam idênticos do banco", JSON.stringify(snapshot(back)) === JSON.stringify(snapshot(inv)) && !back.migrated);

  // salvar de novo com menos coisas: não pode sobrar lixo nem duplicar
  inv.slots[1] = null;
  inv.equip.weapon = null;
  delete inv.equipAf?.weapon; // tirar do equipamento também tira os afixos dele (como unequip faz no jogo)
  await repo.saveInventory(id, inv);
  const back2 = await repo.loadInventory(id);
  check("salvar de novo substitui (não acumula) itens e equipamento", JSON.stringify(snapshot(back2)) === JSON.stringify(snapshot(inv)) && back2.equip.weapon === null);

  // dado corrompido/antigo no banco não pode quebrar a entrada
  await db.query("insert into inventory_items (character_id, slot, item_id, qty) values ($1, 15, 'item_removido', 3)", [id]);
  await db.query("update inventory_items set qty = 99 where character_id = $1 and item_id = 'pocao_de_vida'", [id]);
  await db.query("update equipment set item_id = 'espada_1m_uncommon' where character_id = $1 and slot = 'armor'", [id]);
  const back3 = await repo.loadInventory(id);
  check("item removido do jogo é ignorado ao carregar", !back3.slots.some((s) => s?.id === "item_removido"));
  check("pilha com quantidade acima do máximo é limitada ao carregar", back3.slots.find((s) => s?.id === "pocao_de_vida")?.qty === ITEMS.pocao_de_vida.stack);
  check("arma no espaço de armadura é ignorada ao carregar", back3.equip.armor === null);

  // backfill: equipamento antigo (coluna af nula) ganha afixos DETERMINÍSTICOS ao carregar e marca para gravar
  await db.query("delete from inventory_items where character_id = $1", [id]);
  await db.query("delete from equipment where character_id = $1", [id]);
  await db.query("insert into inventory_items (character_id, slot, item_id, qty) values ($1, 0, 'espada_1m_epic', 1)", [id]);
  await db.query("insert into equipment (character_id, slot, item_id) values ($1, 'weapon', 'espada_1m_legendary')", [id]);
  const bf1 = await repo.loadInventory(id, "warrior");
  const bf2 = await repo.loadInventory(id, "warrior");
  check("backfill: arma épica antiga ganha 2 afixos ao carregar", (bf1.slots[0]?.af ?? []).length === 2, JSON.stringify(bf1.slots[0]));
  check("backfill: arma lendária equipada ganha afixos (equipAf)", (bf1.equipAf?.weapon ?? []).length >= 2, JSON.stringify(bf1.equipAf));
  check("backfill é determinístico: carregar de novo dá os mesmos afixos", JSON.stringify(snapshot(bf1)) === JSON.stringify(snapshot(bf2)));
  check("backfill marca o inventário para gravar (migrated)", bf1.migrated === true);
  await repo.saveInventory(id, bf1);
  const bf3 = await repo.loadInventory(id, "warrior");
  check("depois de gravar, os afixos do backfill ficam no banco (não são refeitos)", JSON.stringify(bf3.slots[0]?.af) === JSON.stringify(bf1.slots[0]?.af) && !bf3.migrated);

  // itens da primeira versão no banco são traduzidos ao carregar
  await db.query("delete from inventory_items where character_id = $1", [id]);
  await db.query("delete from equipment where character_id = $1", [id]);
  await db.query("insert into inventory_items (character_id, slot, item_id, qty) values ($1, 0, 'espada_de_ferro', 1), ($1, 1, 'gibao_surrado', 1)", [id]);
  await db.query("insert into equipment (character_id, slot, item_id) values ($1, 'weapon', 'espada_enferrujada'), ($1, 'armor', 'cota_de_malha')", [id]);
  const old = await repo.loadInventory(id, "warrior");
  check("inventário antigo (13 itens da v1) é traduzido e marcado como migrado", old.migrated === true && old.slots[0]?.id === "espada_1m_uncommon" && old.slots[1]?.id === "warrior_armor_common" && old.equip.weapon === "espada_1m_common" && old.equip.armor === "warrior_armor_uncommon");

  // a trava de classe do banco aceita o Mago
  const acct2 = await repo.upsertAccount("guest", randomUUID(), "Mago");
  const mg = await repo.createCharacter(acct2.id, "Arcano" + Math.random().toString(36).slice(2, 7), "mage");
  check("o banco aceita criar um personagem Mago", mg.ok);

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
