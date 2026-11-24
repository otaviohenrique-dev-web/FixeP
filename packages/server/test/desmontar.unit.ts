// DESMONTAR (C3.5, unitário, sem servidor): regra padrão por raridade, bônus de refino, confirmação a partir de raro,
// NENHUM lucro infinito (craft -> desmontar devolve menos do que o craft gastou), e troca atômica (tudo ou nada).
// Uso: npx tsx test/desmontar.unit.ts  (a partir de packages/server)
import {
  RARITIES, MAT_FERRO, MAT_COURO, MAT_ESSENCIA, familiasArma, receitaArma, receitaPeca, materiaisDesmonte, precisaConfirmarDesmonte,
  DESMONTAR_CONFIRM_FROM, PECAS_SET, type CharClass, type Rarity,
} from "@frixep/shared";
import { emptyInventory, addItem, canFit } from "../src/game/inventory.js";
import { desmontarItem } from "../src/game/desmontar.js";

let falhas = 0;
let total = 0;
const check = (nome: string, ok: boolean, detalhe = "") => {
  total++;
  if (!ok) falhas++;
  console.log(`${ok ? "PASS" : "FAIL"}  ${nome}${detalhe ? "  -> " + detalhe : ""}`);
};
const soma = (m: Record<string, number>) => Object.values(m).reduce((a, b) => a + b, 0);

const CLS: CharClass = "warrior";
const ARMA_FAM = familiasArma(CLS)[0];

console.log("== Regra por raridade");
const comum = materiaisDesmonte(`${ARMA_FAM}_common`, 0)!;
check("comum rende 1 Ferro Bruto e nada mais", comum[MAT_FERRO] === 1 && !(MAT_COURO in comum) && !(MAT_ESSENCIA in comum), JSON.stringify(comum));
check("Essência só aparece a partir do raro", !(MAT_ESSENCIA in (materiaisDesmonte(`${ARMA_FAM}_uncommon`, 0) ?? {})) && MAT_ESSENCIA in materiaisDesmonte(`${ARMA_FAM}_rare`, 0)!);
const totais = RARITIES.map((r) => soma(materiaisDesmonte(`${ARMA_FAM}_${r}`, 0) ?? {}));
check("quantidade cresce com a raridade (estritamente)", totais.every((t, i) => i === 0 || t > totais[i - 1]), totais.join(" < "));
check("junk/poção/material não desmontam", materiaisDesmonte("pocao_de_vida", 0) === null && materiaisDesmonte("mat_ferro_bruto", 0) === null && materiaisDesmonte("nao_existe", 0) === null);

console.log("\n== Refino devolve um pouco mais");
const base = materiaisDesmonte(`${ARMA_FAM}_epic`, 0)![MAT_FERRO];
const refinado = materiaisDesmonte(`${ARMA_FAM}_epic`, 5)![MAT_FERRO];
check("+5 devolve +2 Ferro Bruto a mais que o +0", refinado - base === 2, `${base} -> ${refinado}`);
check("refino inválido (negativo, NaN) conta como +0", materiaisDesmonte(`${ARMA_FAM}_epic`, -3)![MAT_FERRO] === base && materiaisDesmonte(`${ARMA_FAM}_epic`, NaN)![MAT_FERRO] === base);

console.log("\n== Confirmação a partir de raro");
check("confirma a partir do raro, não antes", DESMONTAR_CONFIRM_FROM === 2 && !precisaConfirmarDesmonte("uncommon" as Rarity) && precisaConfirmarDesmonte("rare") && precisaConfirmarDesmonte("mythic"));

console.log("\n== Sem lucro infinito: craft -> desmontar nunca devolve o que o craft gastou");
let todosMenores = true;
const piorCaso: string[] = [];
for (const r of RARITIES) {
  const receitas = [
    ...familiasArma(CLS).map((f) => receitaArma(f, r)),
    ...PECAS_SET.map((p) => receitaPeca(p, r, CLS)),
  ].filter((x): x is NonNullable<typeof x> => !!x);
  for (const rc of receitas) {
    const gastou = soma(rc.mats);
    const volta = soma(materiaisDesmonte(rc.item, 0) ?? {});
    if (!(volta < gastou)) { todosMenores = false; piorCaso.push(`${rc.item} gasta ${gastou} e volta ${volta}`); }
  }
}
check("para toda receita de arma e de peça de set, desmontar rende menos que o craft gasta", todosMenores, piorCaso.join("; "));
const totalRefinoMax = (r: Rarity) => soma(materiaisDesmonte(`${ARMA_FAM}_${r}`, 5) ?? {});
check("mesmo +5 não passa do custo de craft da mesma raridade", RARITIES.every((r) => {
  const rc = receitaArma(ARMA_FAM, r)!;
  return totalRefinoMax(r) < soma(rc.mats);
}));

console.log("\n== Troca atômica no servidor");
const inv = emptyInventory();
addItem(inv, `${ARMA_FAM}_rare`, 1, undefined, 0);
const slot = inv.slots.findIndex((s) => s?.id === `${ARMA_FAM}_rare`);
const exige = desmontarItem(inv, { slot });
check("raro sem confirmação é recusado e o item fica", !exige.ok && inv.slots[slot]?.id === `${ARMA_FAM}_rare`, !exige.ok ? exige.error : "");
const ok = desmontarItem(inv, { slot, confirm: true });
check("raro com confirmação sai da mochila e entrega os materiais", ok.ok && !inv.slots.some((s) => s?.id === `${ARMA_FAM}_rare`) && inv.slots.some((s) => s?.id === MAT_ESSENCIA), ok.ok ? ok.msg : "");

// raro rende 3 materiais diferentes (ferro, couro, essência): com só o espaço que ele libera, não cabe
const cheio = emptyInventory();
for (let i = 0; i < cheio.slots.length; i++) cheio.slots[i] = { id: "pocao_de_vida", qty: 1 } as any;
const pos = 0;
cheio.slots[pos] = { id: `${ARMA_FAM}_rare`, qty: 1 } as any;
const antes = JSON.stringify(cheio.slots);
const semEspaco = desmontarItem(cheio, { slot: pos });
check("mochila sem espaço para os 3 materiais: recusa e NÃO perde o item", !semEspaco.ok && JSON.stringify(cheio.slots) === antes, !semEspaco.ok ? semEspaco.error : "");
check("canFit confirma que a mochila lotada não cabe material novo", !canFit(cheio, MAT_FERRO, 1));

const espacoPlus = emptyInventory();
espacoPlus.slots[0] = { id: `${ARMA_FAM}_common`, qty: 1 } as any;
const libera = desmontarItem(espacoPlus, { slot: 0 });
check("item comum com espaço: troca o item por 1 Ferro Bruto", libera.ok && !espacoPlus.slots.some((s) => s?.id === `${ARMA_FAM}_common`) && espacoPlus.slots.some((s) => s?.id === MAT_FERRO && s.qty === 1), libera.ok ? libera.msg : "");

console.log(`\n${total - falhas}/${total} passaram`);
process.exit(falhas ? 1 : 0);
