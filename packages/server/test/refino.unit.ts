// REFINO (unitário, sem servidor): nível máximo, custo por nível e raridade, bônus de stat, refinarItem
// (tudo ou nada, nunca quebra), e o nível que viaja com o item (mochila, equipar, desequipar, snapshot).
// Uso: npx tsx test/refino.unit.ts  (a partir de packages/server)
import {
  RARITIES, MAX_REFINO, MAT_FERRO, MAT_ESSENCIA, COIN_IRON, familiasArma, custoRefino, faltasRefino, bonusRefino, refinoValido, isRefinavel, gearBonuses, type CharClass, type Rarity,
} from "@frixep/shared";
import { emptyInventory, addItem, equipFromSlot, unequip, bonuses, snapshot } from "../src/game/inventory.js";
import { refinarItem } from "../src/game/refino.js";

let falhas = 0;
let total = 0;
const check = (nome: string, ok: boolean, detalhe = "") => {
  total++;
  if (!ok) falhas++;
  console.log(`${ok ? "PASS" : "FAIL"}  ${nome}${detalhe ? "  -> " + detalhe : ""}`);
};

const CLS: CharClass = "warrior";
const ARMA = `${familiasArma(CLS)[0]}_common`; // id de uma arma comum da classe
const ARMA_EPIC = familiasArma(CLS)[0] + "_epic";
const PECA = "warrior_armor_common";

console.log("== Nível e elegibilidade");
check("refinoValido: não número, negativo ou fracionário vira +0", [undefined, null, -1, 1.5, "x", NaN].every((v) => refinoValido(v) === 0));
check("refinoValido: acima do máximo é limitado a MAX_REFINO", refinoValido(99) === MAX_REFINO && refinoValido(3) === 3);
check("equipamento é refinável; poção e material não", isRefinavel("weapon", "common") && isRefinavel("armor", "mythic") && !isRefinavel("potion", "common") && !isRefinavel("material", "common"));

console.log("\n== Custo por nível e raridade");
const c0 = custoRefino(0, "weapon", "common");
check("comum, de +0 para +1: 20 Tostões e 1 Ferro (sem Essência)", !!c0 && c0.tostoes === 20 && c0.mats[MAT_FERRO] === 1 && !(MAT_ESSENCIA in c0.mats), JSON.stringify(c0));
const c1e = custoRefino(0, "weapon", "epic");
check("épico pede Essência Arcana a partir do passo 1", !!c1e && c1e.mats[MAT_ESSENCIA] === 1 && c1e.tostoes === 140, JSON.stringify(c1e));
check("no nível máximo não há custo (null)", custoRefino(MAX_REFINO, "weapon", "common") === null);
check("item não refinável não tem custo (null)", custoRefino(0, "potion", "common") === null);
let crescente = true;
for (const r of RARITIES) {
  let antes = 0;
  for (let n = 0; n < MAX_REFINO; n++) {
    const c = custoRefino(n, "armor", r as Rarity)!;
    if (c.tostoes <= antes) crescente = false;
    antes = c.tostoes;
  }
}
check("custo em Tostões cresce a cada nível, em toda raridade", crescente);
const mitico = custoRefino(MAX_REFINO - 1, "weapon", "mythic")!;
check("o último passo do mítico custa 1600 Tostões (20 × 5 × 16)", mitico.tostoes === 1600, String(mitico.tostoes));

console.log("\n== Bônus de stat por nível");
check("sem refino, bônus zero", bonusRefino(0, "weapon", "common").dmgPct === 0 && bonusRefino(0, "armor", "common").hp === 0);
check("arma comum +1: +1% de dano", bonusRefino(1, "weapon", "common").dmgPct === 1);
check("arma mítica +1: +6% de dano (1 + índice 5)", bonusRefino(1, "weapon", "mythic").dmgPct === 6);
check("defesa comum +1: +3 de vida (sem dano)", bonusRefino(1, "armor", "common").hp === 3 && bonusRefino(1, "armor", "common").dmgPct === 0);
let monotono = true;
for (const k of ["weapon", "armor"] as const) for (let n = 1; n <= MAX_REFINO; n++) {
  const a = bonusRefino(n - 1, k, "rare"), b = bonusRefino(n, k, "rare");
  if (b.dmgPct + b.hp <= a.dmgPct + a.hp) monotono = false;
}
check("o bônus cresce a cada nível", monotono);

console.log("\n== Faltas (o que o custo pede x o que tem)");
const semNada = faltasRefino(c0!, () => 0, 0);
check("sem material e sem Tostões: falta Ferro e Tostões", semNada.length === 2 && semNada.some((f) => f.id === COIN_IRON.id), JSON.stringify(semNada));
check("com o suficiente: sem faltas", faltasRefino(c0!, (id) => (id === MAT_FERRO ? 1 : 0), 20).length === 0);

console.log("\n== refinarItem (tudo ou nada)");
const inv0 = () => {
  const inv = emptyInventory();
  inv.iron = 1000;
  addItem(inv, MAT_FERRO, 10);
  addItem(inv, ARMA, 1);
  return inv;
};
{
  const inv = inv0();
  const slot = inv.slots.findIndex((s) => s?.id === ARMA);
  const r = refinarItem(inv, { origem: "mochila", slot });
  check("refinar da mochila sobe +1 e gasta 20 Tostões e 1 Ferro", r.ok && inv.slots[slot]?.rf === 1 && inv.iron === 980 && inv.slots.find((s) => s?.id === MAT_FERRO)?.qty === 9, r.ok ? "" : r.error);
}
{
  const inv = inv0();
  inv.iron = 5;
  const slot = inv.slots.findIndex((s) => s?.id === ARMA);
  const r = refinarItem(inv, { origem: "mochila", slot });
  check("sem Tostões: recusa e não gasta nada", !r.ok && inv.iron === 5 && inv.slots[slot]?.rf === undefined && inv.slots.find((s) => s?.id === MAT_FERRO)?.qty === 10, r.ok ? "" : r.error);
}
{
  const inv = inv0();
  const slot = inv.slots.findIndex((s) => s?.id === ARMA);
  inv.slots[slot]!.rf = MAX_REFINO;
  const r = refinarItem(inv, { origem: "mochila", slot });
  check("no nível máximo: recusa e não gasta nada", !r.ok && inv.iron === 1000 && inv.slots[slot]?.rf === MAX_REFINO);
}
{
  const inv = inv0();
  const r = refinarItem(inv, { origem: "mochila", slot: 99 });
  const r2 = refinarItem(inv, { origem: "estranho", slot: 0 });
  check("espaço inválido ou origem desconhecida: recusa sem mexer", !r.ok && !r2.ok && inv.iron === 1000);
}
{
  const inv = inv0();
  const r = refinarItem(inv, { origem: "mochila", slot: inv.slots.findIndex((s) => s?.id === MAT_FERRO) });
  check("refinar um material: recusa (não é equipamento)", !r.ok && inv.iron === 1000);
}

console.log("\n== O nível viaja com o item");
{
  const inv = emptyInventory();
  inv.iron = 1000;
  addItem(inv, MAT_FERRO, 10);
  addItem(inv, ARMA, 1);
  const slot = inv.slots.findIndex((s) => s?.id === ARMA);
  refinarItem(inv, { origem: "mochila", slot });
  refinarItem(inv, { origem: "mochila", slot }); // +2
  const eq = equipFromSlot(inv, slot, 50, CLS);
  check("equipar leva o +2 para o slot de equipamento", eq.ok && inv.equipRf?.weapon === 2 && inv.equip.weapon === ARMA, eq.ok ? "" : eq.error);
  const sem = gearBonuses({ ...emptyInventory().equip, weapon: ARMA }, CLS, {}, {}).dmgPct;
  const com = bonuses(inv, CLS).dmgPct;
  check("o bônus do +2 entra no stat do equipamento", com - sem === bonusRefino(2, "weapon", "common").dmgPct, `${com} - ${sem}`);
  const r = refinarItem(inv, { origem: "equip", slot: "weapon" });
  check("refinar o equipamento vestido sobe para +3", r.ok && inv.equipRf?.weapon === 3, r.ok ? "" : r.error);
  const un = unequip(inv, "weapon");
  const volta = inv.slots.find((s) => s?.id === ARMA);
  check("desequipar devolve o item com o +3", un.ok && volta?.rf === 3 && inv.equipRf?.weapon === undefined, un.ok ? "" : un.error);
  const snap = snapshot(inv);
  check("a fotografia (snapshot) leva o +3 da mochila", snap.inv.find((s) => s?.id === ARMA)?.rf === 3);
}
{
  const inv = emptyInventory();
  inv.iron = 1000;
  addItem(inv, MAT_FERRO, 5);
  addItem(inv, PECA, 1);
  const slot = inv.slots.findIndex((s) => s?.id === PECA);
  const r = refinarItem(inv, { origem: "mochila", slot });
  check("peça de armadura refina e ganha vida (+3 no comum)", r.ok && inv.slots[slot]?.rf === 1 && bonusRefino(inv.slots[slot]!.rf!, "armor", "common").hp === 3, r.ok ? "" : r.error);
}
{
  const inv = emptyInventory();
  addItem(inv, ARMA_EPIC, 1);
  inv.iron = 10000;
  addItem(inv, MAT_FERRO, 5);
  addItem(inv, MAT_ESSENCIA, 5);
  const r = refinarItem(inv, { origem: "mochila", slot: inv.slots.findIndex((s) => s?.id === ARMA_EPIC) });
  check("épico gasta também a Essência Arcana", r.ok && inv.slots.find((s) => s?.id === MAT_ESSENCIA)?.qty === 4, r.ok ? "" : r.error);
}
console.log(`\n${total - falhas}/${total} passaram`);
if (falhas > 0) process.exit(1);
