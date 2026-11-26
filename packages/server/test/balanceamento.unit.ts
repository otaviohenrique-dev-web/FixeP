// Balanceamento ao vivo, regras puras (sem servidor): XP do tipo, tabela de drops (100%, remover, quantidade) e limites.
// Uso (em packages/server): npx tsx test/balanceamento.unit.ts
import { aplicarAjustes, validarAjuste, valorEfetivo, enemyXp, mulXp, ZONES, tabelaDrops } from "@frixep/shared";
import { rollMobLoot } from "../src/game/loot.js";

const results: boolean[] = [];
const check = (name: string, ok: boolean, detail = "") => {
  results.push(ok);
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? "  -> " + detail : ""}`);
};
const MAT = "mat_ferro_bruto";
const zona2 = ZONES[2];
const sempreUm = () => 0.99; // rolagens todas "altas": só cai o que a tabela garante

// sem nenhum ajuste: padrão do código
aplicarAjustes(new Map());
check("sem ajuste, XP do lobo é o padrão (x1)", mulXp("wolf") === 1 && valorEfetivo("inimigo.wolf.xp") === 100);
const xpBase = enemyXp(6);

// 1) XP do lobo: 300% => o abate dá o triplo do padrão
aplicarAjustes(new Map([["inimigo.wolf.xp", 300]]));
check("XP do lobo a 300%: multiplicador 3", mulXp("wolf") === 3, `mul ${mulXp("wolf")}`);
check("XP do lobo a 300%: abate de nível 6 dá o triplo", Math.round(xpBase * 3) === Math.round(enemyXp(6) * mulXp("wolf")), `base ${xpBase}`);
check("XP de outro inimigo continua no padrão", mulXp("skeleton") === 1);

// 2) chance 100% garante o drop; quantidade min..max
aplicarAjustes(new Map([[`drop.wolf.${MAT}.chance`, 100], [`drop.wolf.${MAT}.min`, 2], [`drop.wolf.${MAT}.max`, 3]]));
const garantido = rollMobLoot(zona2, sempreUm, "warrior", 6, "wolf").filter((d) => d.id === MAT);
check("chance 100% garante o drop", garantido.length >= 2, `itens ${garantido.length}`);
check("quantidade do drop fica entre min e max (2 a 3)", garantido.length >= 2 && garantido.length <= 3 + 1, `itens ${garantido.length}`);

// 3) tirar o item da tabela: ele não aparece mais na tabela nem cai
aplicarAjustes(new Map([[`drop.wolf.${MAT}.chance`, 0]]));
check("item tirado (chance 0) sai da tabela do lobo", !tabelaDrops("wolf").some((e) => e.item === MAT));
const semItem = rollMobLoot(zona2, sempreUm, "warrior", 6, "wolf").filter((d) => d.id === MAT);
check("item tirado não cai mais do lobo", semItem.length === 0, `itens ${semItem.length}`);

// 4) limites: fora do intervalo é recusado
check("XP a 1000% é recusado", validarAjuste("inimigo.wolf.xp", 1000) !== null);
check("XP a 300% é aceito", validarAjuste("inimigo.wolf.xp", 300) === null);
check("XP a 29% é recusado", validarAjuste("inimigo.wolf.xp", 29) !== null);
check("chance acima de 100% é recusada", validarAjuste(`drop.wolf.${MAT}.chance`, 101) !== null);
check("chance negativa é recusada", validarAjuste(`drop.wolf.${MAT}.chance`, -1) !== null);
check("item inexistente é recusado", validarAjuste("drop.wolf.item_que_nao_existe.chance", 10) !== null);
check("inimigo inexistente é recusado", validarAjuste(`drop.dragao.${MAT}.chance`, 10) !== null);
aplicarAjustes(new Map([[`drop.wolf.${MAT}.max`, 2]]));
check("quantidade mínima acima da máxima é recusada", validarAjuste(`drop.wolf.${MAT}.min`, 5) !== null);

// 5) limpar os ajustes volta tudo ao padrão do código
aplicarAjustes(new Map());
check("sem ajustes, XP volta ao padrão", mulXp("wolf") === 1);
check("sem ajustes, a tabela do lobo fica vazia", tabelaDrops("wolf").length === 0);

const falhas = results.filter((r) => !r).length;
console.log(falhas ? `\n${falhas} falha(s)` : "\nTudo certo.");
process.exit(falhas ? 1 : 0);
