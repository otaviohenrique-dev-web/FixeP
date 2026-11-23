// CRAFT (unitário, sem servidor): uma fórmula para TODAS as armas, outra para TODAS as peças/secundárias,
// escalonamento monotônico por raridade, Óbolos só do épico para cima, set = 4 peças, e craftItem (tudo ou nada,
// com rng injetado). Uso: npx tsx test/crafting.unit.ts  (a partir de packages/server)
import {
  ITEMS, WEAPON_TYPES, RARITIES, GEAR_CLASSES, COIN_IRON, COIN_OBOL, MAT_FERRO, MAT_COURO, MAT_ESSENCIA, CRAFT_MULT, ARMA_BASE, ARMA_OBOLOS, PECA_BASE, PECA_OBOLOS,
  receitaArma, receitaPeca, receitaSet, familiasArma, familiasSecundaria, faltasReceita, progressoSet, nomeFamilia, type CharClass, type Rarity, type PecaCraft,
} from "@frixep/shared";
import { emptyInventory, addItem } from "../src/game/inventory.js";
import { craftItem } from "../src/game/craft.js";

let falhas = 0;
let total = 0;
const check = (nome: string, ok: boolean, detalhe = "") => {
  total++;
  if (!ok) falhas++;
  console.log(`${ok ? "PASS" : "FAIL"}  ${nome}${detalhe ? "  -> " + detalhe : ""}`);
};
const CLASSES: CharClass[] = ["warrior", "archer", "cleric", "mage"];
const PECAS: PecaCraft[] = ["armor", "helmet", "boots", "cape", "secundaria"];
const forma = (r: { mats: Record<string, number>; tostoes: number; obolos: number } | null) => (r ? JSON.stringify([r.mats, r.tostoes, r.obolos]) : "null");

console.log("== Ingredientes e tabelas");
check("os 3 ingredientes existem no catálogo, como material", [MAT_FERRO, MAT_COURO, MAT_ESSENCIA].every((id) => ITEMS[id]?.kind === "material"));
check("multiplicador por raridade é crescente (6 níveis de equipamento)", CRAFT_MULT.length === RARITIES.length && CRAFT_MULT.every((m, i) => i === 0 || m > CRAFT_MULT[i - 1]));

console.log("\n== Armas: uma receita padrão para todas");
let armasOk = 0, armasTotal = 0, formulaUnica = true, ratioUnico = true;
for (const cls of CLASSES) for (const fam of familiasArma(cls)) {
  RARITIES.forEach((r, i) => {
    armasTotal++;
    const x = receitaArma(fam, r);
    if (x) armasOk++;
    if (!x) return;
    const m = CRAFT_MULT[i];
    if (x.mats[MAT_FERRO] !== ARMA_BASE.ferro * m || x.mats[MAT_COURO] !== ARMA_BASE.couro * m || x.mats[MAT_ESSENCIA] !== ARMA_BASE.essencia * m || x.tostoes !== ARMA_BASE.tostoes * m || x.obolos !== ARMA_OBOLOS[i]) formulaUnica = false;
    // mesma fórmula: a receita de qualquer família na mesma raridade é igual (só o item muda)
    const ref = receitaArma(familiasArma(cls)[0], r)!;
    if (x.tostoes !== ref.tostoes || x.obolos !== ref.obolos || JSON.stringify(x.mats) !== JSON.stringify(ref.mats)) ratioUnico = false;
  });
}
check(`toda arma de toda classe tem receita (${armasOk}/${armasTotal})`, armasOk === armasTotal);
check("a quantidade de cada ingrediente é base × multiplicador da raridade", formulaUnica);
check("armas de famílias diferentes têm a mesma receita na mesma raridade", ratioUnico);
check("arma com família ou raridade inválida não tem receita", receitaArma("nao_existe", "common") === null && receitaArma("besta", "ancestral") === null && receitaArma("besta", "junk") === null);

console.log("\n== Peças de set e secundárias: outra fórmula padrão, igual para todas");
let pecaUnica = true, pecaTotal = 0, pecaOk = 0;
for (const cls of CLASSES) RARITIES.forEach((r, i) => {
  const ref = receitaPeca("armor", r, cls)!;
  for (const p of PECAS) {
    if (p === "secundaria") continue;
    pecaTotal++;
    const x = receitaPeca(p, r, cls);
    if (x) pecaOk++;
    if (!x || forma(x) !== forma(ref)) pecaUnica = false;
    if (x && (x.mats[MAT_FERRO] !== PECA_BASE.ferro * CRAFT_MULT[i] || x.tostoes !== PECA_BASE.tostoes * CRAFT_MULT[i] || x.obolos !== PECA_OBOLOS[i])) pecaUnica = false;
  }
  for (const fam of familiasSecundaria(cls)) {
    pecaTotal++;
    const x = receitaPeca("secundaria", r, cls, fam);
    if (x) pecaOk++;
    if (!x || forma(x) !== forma(ref)) pecaUnica = false;
  }
});
check(`toda peça de set e secundária tem receita (${pecaOk}/${pecaTotal})`, pecaOk === pecaTotal);
check("peças usam a mesma fórmula (mesma quantidade de ingredientes, Tostões e Óbolos na raridade)", pecaUnica);
check("peça de set não aceita família de arma nem classe errada na secundária", receitaPeca("armor", "common", "warrior") !== null && receitaPeca("secundaria", "common", "warrior", "besta") === null && receitaPeca("secundaria", "common", "archer", "escudo_guerra") === null);
check("raridade inválida não tem receita de peça", receitaPeca("helmet", "junk", "mage") === null);
check("cada peça custa menos Tostões que a arma da mesma raridade", RARITIES.every((r) => receitaPeca("armor", r, "cleric")!.tostoes < receitaArma("espada_1m", r)!.tostoes));

console.log("\n== Escalonamento monotônico (por raridade, comum -> mítico)");
const monotono = (get: (r: Rarity) => number) => RARITIES.every((r, i) => i === 0 || get(r) >= get(RARITIES[i - 1]));
const armaRef = "montante", peça = (r: Rarity) => receitaPeca("cape", r, "mage")!;
check("arma: ferro, couro, essência e Tostões sobem a cada raridade", ["mat_ferro_bruto", "mat_couro_curtido", "mat_essencia_arcana"].every((m) => monotono((r) => receitaArma(armaRef, r)!.mats[m])) && monotono((r) => receitaArma(armaRef, r)!.tostoes));
check("arma: Óbolos nunca diminuem e o mítico pede mais que o épico", monotono((r) => receitaArma(armaRef, r)!.obolos) && receitaArma(armaRef, "mythic")!.obolos > receitaArma(armaRef, "epic")!.obolos);
check("peça: ingredientes e Tostões sobem a cada raridade", monotono((r) => peça(r).tostoes) && monotono((r) => peça(r).mats[MAT_FERRO]));
check("nível mínimo do item sobe com a raridade", monotono((r) => receitaArma(armaRef, r)!.minLevel));

console.log("\n== Óbolos de Sangue: só do épico para cima (ingrediente raro)");
check("comum, incomum e raro não pedem Óbolos (arma e peça)", ["common", "uncommon", "rare"].every((r) => receitaArma(armaRef, r as Rarity)!.obolos === 0 && peça(r as Rarity).obolos === 0));
check("épico, lendário e mítico pedem Óbolos (arma e peça)", ["epic", "legendary", "mythic"].every((r) => receitaArma(armaRef, r as Rarity)!.obolos > 0 && peça(r as Rarity).obolos > 0));

console.log("\n== Set = 4 peças de set da classe na mesma raridade");
for (const cls of GEAR_CLASSES) {
  const r: Rarity = "legendary";
  const set = receitaSet(cls, r);
  const soma = set.reduce((n, x) => n + x.tostoes, 0);
  check(`set de ${cls} (lendário) tem 4 peças e custa 4 × a peça`, set.length === 4 && soma === 4 * receitaPeca("armor", r, cls)!.tostoes, `${set.length} peças, ${soma} Tostões`);
}

console.log("\n== Validações e progresso do set");
check("faltasReceita: sem falta, a lista vem vazia", faltasReceita(receitaArma("besta", "common")!, () => 99, 99999, 0).length === 0);
const falt = faltasReceita(receitaArma("besta", "epic")!, () => 0, 0, 0);
check("faltasReceita: epic sem nada lista todos os ingredientes, Tostões e Óbolos", falt.length === 5 && falt.some((f) => f.id === COIN_OBOL.id && f.precisa === 2) && falt.some((f) => f.id === COIN_IRON.id));
check("faltasReceita: Óbolo insuficiente aparece sozinho", faltasReceita(receitaArma("besta", "mythic")!, (id) => (id === COIN_IRON.id ? 0 : 999), 999999, 2).map((f) => f.id).join() === COIN_OBOL.id);
const prog = progressoSet("warrior", "rare", (id) => id === "warrior_helmet_rare" || id === "warrior_cape_rare");
check("progresso do set: 2 de 4 peças (elmo e capa)", prog.tem === 2 && prog.total === 4 && prog.pecas.filter((p) => p.tem).map((p) => p.item).join() === "warrior_helmet_rare,warrior_cape_rare", `${prog.tem}/${prog.total}`);
check("nome da família tira o sufixo de raridade", nomeFamilia("espada_1m") === "Espada de Uma Mão" && nomeFamilia("escudo_guerra") === "Escudo de Guerra", `${nomeFamilia("espada_1m")} | ${nomeFamilia("escudo_guerra")}`);

console.log("\n== craftItem (servidor, rng injetado): tudo ou nada");
const cheio = (inv: ReturnType<typeof emptyInventory>, mats: [string, number][]) => { for (const [id, q] of mats) addItem(inv, id, q); return inv; };
{
  const inv = cheio(emptyInventory(), [[MAT_FERRO, 10], [MAT_COURO, 10], [MAT_ESSENCIA, 10]]);
  inv.iron = 100000;
  const r = craftItem(inv, "archer", 30, { tipo: "arma", familia: "besta", raridade: "common" }, () => 0.5);
  check("sucesso: craft de besta comum gasta os ingredientes e sai o item", r.ok && r.id === "besta_common" && inv.iron === 100000 - 40 && inv.slots.some((s) => s?.id === "besta_common"), r.ok ? r.msg : r.error);
  check("o ingrediente gasto sai da mochila (3 ferro, 2 couro, 2 essência)", (inv.slots.find((s) => s?.id === MAT_FERRO)?.qty ?? 0) === 7 && (inv.slots.find((s) => s?.id === MAT_COURO)?.qty ?? 0) === 8);
}
{
  const inv = cheio(emptyInventory(), [[MAT_FERRO, 2], [MAT_COURO, 10], [MAT_ESSENCIA, 10]]);
  inv.iron = 100000;
  const antes = JSON.stringify(inv);
  const r = craftItem(inv, "archer", 30, { tipo: "arma", familia: "besta", raridade: "common" });
  check("falta de material: recusa e NÃO consome nada", !r.ok && /Ferro Bruto/.test(r.error) && JSON.stringify(inv) === antes, r.ok ? "" : r.error);
}
{
  const inv = cheio(emptyInventory(), [[MAT_FERRO, 100], [MAT_COURO, 100], [MAT_ESSENCIA, 100]]);
  inv.iron = 1e6;
  inv.obols = 1;
  const r = craftItem(inv, "archer", 30, { tipo: "arma", familia: "besta", raridade: "epic" });
  check("falta de Óbolo (épico pede 2, tem 1): recusa", !r.ok && /Óbolos/.test(r.error) && inv.obols === 1, r.ok ? "" : r.error);
}
{
  const inv = cheio(emptyInventory(), [[MAT_FERRO, 100], [MAT_COURO, 100], [MAT_ESSENCIA, 100]]);
  inv.iron = 1e6;
  inv.obols = 2;
  const r = craftItem(inv, "archer", 30, { tipo: "arma", familia: "besta", raridade: "epic" });
  check("épico com Óbolos suficientes: sai, e gasta os 2 Óbolos", r.ok && inv.obols === 0, r.ok ? r.msg : r.error);
  check("épico sai com afixos (3 no máximo)", r.ok && (inv.slots.find((s) => s?.id === "besta_epic")?.af?.length ?? 0) <= 3);
}
{
  const inv = cheio(emptyInventory(), [[MAT_FERRO, 100], [MAT_COURO, 100], [MAT_ESSENCIA, 100]]);
  for (let i = 0; i < inv.slots.length; i++) if (!inv.slots[i]) inv.slots[i] = { id: "pocao_de_vida", qty: 10 };
  inv.iron = 1e6;
  const antes = JSON.stringify(inv);
  const r = craftItem(inv, "archer", 30, { tipo: "arma", familia: "besta", raridade: "common" });
  check("mochila cheia: recusa e NÃO consome ingredientes nem Tostões", !r.ok && /Mochila cheia/.test(r.error) && JSON.stringify(inv) === antes, r.ok ? "" : r.error);
}
{
  const inv = cheio(emptyInventory(), [[MAT_FERRO, 100], [MAT_COURO, 100], [MAT_ESSENCIA, 100]]);
  inv.iron = 1e6;
  const r = craftItem(inv, "archer", 1, { tipo: "arma", familia: "besta", raridade: "rare" });
  check("nível baixo: recusa com o nível exigido", !r.ok && /nível/.test(r.error), r.ok ? "" : r.error);
  const r2 = craftItem(inv, "archer", 30, { tipo: "arma", familia: "espada_1m", raridade: "common" });
  check("arma de outra classe: recusa", !r2.ok && /classe/.test(r2.error), r2.ok ? "" : r2.error);
  const r3 = craftItem(inv, "archer", 30, { tipo: "arma", familia: "besta", raridade: "ancestral" });
  check("raridade fora da tabela: recusa", !r3.ok, r3.ok ? "" : r3.error);
  const r4 = craftItem(inv, "archer", 30, { tipo: "peca", peca: "armor", raridade: "common" }, () => 0.3);
  check("peça de set (armadura) sai com a raridade pedida", r4.ok && r4.id === "archer_armor_common", r4.ok ? r4.msg : r4.error);
}

console.log(`\n${total - falhas}/${total} passaram`);
if (falhas) process.exit(1);
