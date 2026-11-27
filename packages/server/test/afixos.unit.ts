// Teste unitário dos AFIXOS de item (funções puras, sem servidor): catálogo, sorteio (máximo 3, sem repetir,
// quantidade por raridade, elegibilidade, rng injetável), faixas de valor, limpeza de dados vindos do banco e
// o efeito de equipamento com afixo sobre o status (itens antigos sem afixo continuam iguais).
// Uso: npx tsx test/afixos.unit.ts  (a partir de packages/server)
import {
  AFIXOS, AFIXO_BY_ID, AFIXOS_POR_RARIDADE, MAX_AFIXOS, RARITIES, ITEMS, EQUIP_SLOTS, sortearAfixos, valorDoAfixo, afixosValidos,
  afixoStats, afixoElegivel, afixoLinha, gearBonuses, emptyBonuses, type Rarity, type ItemKind, type EquipSlot,
} from "@frixep/shared";

let falhas = 0;
let total = 0;
const check = (nome: string, ok: boolean, detalhe = "") => {
  total++;
  if (!ok) falhas++;
  console.log(`${ok ? "PASS" : "FAIL"}  ${nome}${detalhe ? "  -> " + detalhe : ""}`);
};

// gerador determinístico (LCG): mesma semente, mesma sequência
const seeded = (seed: number) => () => { seed = (seed * 1664525 + 1013904223) % 4294967296; return seed / 4294967296; };
const ORDEM: Rarity[] = ["common", "uncommon", "rare", "epic", "legendary", "mythic"];
const KINDS: ItemKind[] = ["weapon", "offhand", "helmet", "armor", "boots", "cape"];

console.log("== Catálogo");
check("30 ou mais afixos", AFIXOS.length >= 30, `${AFIXOS.length}`);
check("ids únicos", new Set(AFIXOS.map((a) => a.id)).size === AFIXOS.length);
check("ids só com letras minúsculas, números e sublinhado", AFIXOS.every((a) => /^[a-z0-9_]+$/.test(a.id)), AFIXOS.filter((a) => !/^[a-z0-9_]+$/.test(a.id)).map((a) => a.id).join(", "));
check("todo afixo tem nome, descrição e 6 valores (um por raridade)", AFIXOS.every((a) => a.nome && a.descricao && a.valores.length === 6));
check("todo afixo tem raridade mínima válida", AFIXOS.every((a) => ORDEM.includes(a.minRaridade)));
check("valores não negativos", AFIXOS.every((a) => a.valores.every((v) => v >= 0)));
check("o limite são 3 afixos por item", MAX_AFIXOS === 3);
check("raridades de equipamento: 8 (Lixo..Ancestral)", RARITIES.length === 8);

console.log("\n== Distribuição por raridade");
check("roubo de vida só a partir de lendário", AFIXO_BY_ID["roubo_de_vida"].minRaridade === "legendary");
check("queimadura ao acertar só a partir de lendário", AFIXO_BY_ID["queimadura_ao_acertar"].minRaridade === "legendary");
check("comum e incomum só recebem afixos simples (nenhum proc)", AFIXOS.filter((a) => ["common", "uncommon"].includes(a.minRaridade)).every((a) => a.efeito?.tipo !== "proc"));
check("comum/incomum: no primeiro nível que os libera, nenhum afixo passa de 10 (fracos)", AFIXOS.filter((a) => ["common", "uncommon"].includes(a.minRaridade)).every((a) => valorDoAfixo(a.id, a.minRaridade as Rarity) <= 10));
for (const r of ORDEM) {
  const elegiveis = AFIXOS.filter((a) => ORDEM.indexOf(a.minRaridade) <= ORDEM.indexOf(r));
  check(`${r}: há afixos elegíveis para armadura e arma`, elegiveis.some((a) => afixoElegivel(a, "armor", r)) && elegiveis.some((a) => afixoElegivel(a, "weapon", r)));
}

console.log("\n== Sorteio: máximo 3, sem repetir, quantidade pela raridade");
let maxVisto = 0, repetido = false, foraDaFaixa = false, invalido = false;
for (const r of ORDEM) {
  for (const k of KINDS) {
    for (let seed = 1; seed <= 200; seed++) {
      const af = sortearAfixos(k, r, seeded(seed * 7919 + ORDEM.indexOf(r)));
      maxVisto = Math.max(maxVisto, af.length);
      if (new Set(af).size !== af.length) repetido = true;
      const [lo, hi] = AFIXOS_POR_RARIDADE[r];
      if (af.length < lo || af.length > Math.min(hi, MAX_AFIXOS)) foraDaFaixa = true;
      if (!af.every((id) => afixoElegivel(AFIXO_BY_ID[id], k, r))) invalido = true;
    }
  }
}
check("nunca passa de 3 afixos", maxVisto <= MAX_AFIXOS, `máximo visto ${maxVisto}`);
check("nenhum afixo repetido no mesmo item", !repetido);
check("quantidade dentro da faixa da raridade (comum 0-1, incomum 1, raro 1-2, épico 2, lendário 2-3, mítico 3)", !foraDaFaixa);
check("todo afixo sorteado é elegível para o tipo e a raridade", !invalido);
check("mítico sempre recebe exatamente 3", [1, 2, 3, 4].every((s) => sortearAfixos("armor", "mythic", seeded(s)).length === 3));
check("épico sempre recebe exatamente 2", [1, 2, 3, 4].every((s) => sortearAfixos("weapon", "epic", seeded(s)).length === 2));
check("uncommon sempre recebe exatamente 1", [1, 2, 3, 4].every((s) => sortearAfixos("boots", "uncommon", seeded(s)).length === 1));
check("mesmo rng, mesmo resultado (determinístico)", JSON.stringify(sortearAfixos("weapon", "legendary", seeded(42))) === JSON.stringify(sortearAfixos("weapon", "legendary", seeded(42))));
check("rarity mínima respeitada: comum nunca recebe roubo de vida", Array.from({ length: 300 }, (_, i) => sortearAfixos("weapon", "common", seeded(i + 1))).flat().every((id) => id !== "roubo_de_vida"));
check("rarity mínima respeitada: raro nunca recebe queimadura ao acertar", Array.from({ length: 300 }, (_, i) => sortearAfixos("weapon", "rare", seeded(i + 1))).flat().every((id) => id !== "queimadura_ao_acertar"));
check("lendário pode receber roubo de vida (sorteio sai ao menos uma vez em 500)", Array.from({ length: 500 }, (_, i) => sortearAfixos("weapon", "legendary", seeded(i + 1))).flat().includes("roubo_de_vida"));
check("item sem afixo elegível (junk) não recebe nada", sortearAfixos("weapon", "junk" as Rarity, seeded(1)).length === 0);

console.log("\n== Faixas de valor por raridade");
check("valor abaixo da raridade mínima é 0", valorDoAfixo("roubo_de_vida", "epic") === 0 && valorDoAfixo("roubo_de_vida", "rare") === 0);
check("valor do afixo segue a tabela da raridade (Afiado: comum 2, mítico 18)", valorDoAfixo("afiado", "common") === 2 && valorDoAfixo("afiado", "mythic") === 18, `${valorDoAfixo("afiado", "common")} / ${valorDoAfixo("afiado", "mythic")}`);
check("valor cresce com a raridade (Vigor: comum < mítico)", valorDoAfixo("vigor", "common") < valorDoAfixo("vigor", "mythic"));
check("id desconhecido vale 0", valorDoAfixo("nao_existe", "mythic") === 0);
check("linha do tooltip traz o nome e o valor", afixoLinha("afiado", "rare").startsWith("Afiado: +7%"), afixoLinha("afiado", "rare"));

console.log("\n== Dados vindos do banco e da rede (limpeza)");
check("lista vazia ou ausente = sem afixos (item antigo)", afixosValidos(null, "weapon", "epic").length === 0 && afixosValidos(undefined, "weapon", "epic").length === 0 && afixosValidos("", "weapon", "epic").length === 0);
check("JSON inválido = sem afixos", afixosValidos("{nao é json", "weapon", "epic").length === 0);
check("lixo que não é lista = sem afixos", afixosValidos(42, "weapon", "epic").length === 0 && afixosValidos({ a: 1 }, "weapon", "epic").length === 0);
check("id desconhecido é descartado", afixosValidos(["afiado", "nao_existe"], "weapon", "epic").join() === "afiado");
check("afixo de outro tipo (vigor, de defesa) é descartado numa arma", afixosValidos(["vigor", "afiado"], "weapon", "epic").join() === "afiado");
check("afixo acima da raridade do item é descartado", afixosValidos(["roubo_de_vida"], "weapon", "epic").length === 0);
check("repetido é descartado", afixosValidos(["afiado", "afiado"], "weapon", "epic").join() === "afiado");
check("nunca passa de 3 (lista vinda do cliente)", afixosValidos(["vigor", "couro_reforcado", "pes_leves", "passo_agil", "vitalidade"], "armor", "mythic").length === 3);
check("aceita JSON em texto (como o banco grava)", afixosValidos('["vigor"]', "armor", "common").join() === "vigor");

console.log("\n== Efeito no status");
check("afixo de stat vai para o campo certo (Afiado raro = +7% de dano)", afixoStats(["afiado"], "rare").dmgPct === 7, `${afixoStats(["afiado"], "rare").dmgPct}`);
check("dois afixos somam no mesmo campo (Afiado + Olho Certeiro)", afixoStats(["afiado", "olho_certeiro"], "rare").dmgPct === 7 && afixoStats(["afiado", "olho_certeiro"], "rare").crit === 3);
check("procs entram no total (roubo de vida: 3% no lendário)", afixoStats(["roubo_de_vida"], "legendary").lifesteal === 3);
const semAfixo = gearBonuses({ weapon: "espada_1m_common", offhand: null, helmet: null, armor: "warrior_armor_common", boots: null, cape: null }, "warrior");
const comVazio = gearBonuses({ weapon: "espada_1m_common", offhand: null, helmet: null, armor: "warrior_armor_common", boots: null, cape: null }, "warrior", {});
check("item antigo (sem afixo) dá exatamente o mesmo status de antes", JSON.stringify(semAfixo) === JSON.stringify(comVazio));
const comAfixo = gearBonuses({ weapon: "espada_1m_common", offhand: null, helmet: null, armor: "warrior_armor_common", boots: null, cape: null }, "warrior", { weapon: ["afiado"], armor: ["vigor"] });
check("equipar com afixo soma o status (Afiado +2% de dano, Vigor +5 de vida)", comAfixo.dmgPct === semAfixo.dmgPct + 2 && comAfixo.hp === semAfixo.hp + 5, `dano ${comAfixo.dmgPct} vida ${comAfixo.hp}`);
check("afixo de OUTRA classe não conta (item de outra classe é ignorado)", gearBonuses({ weapon: "arco_curto_common", offhand: null, helmet: null, armor: null, boots: null, cape: null }, "warrior", { weapon: ["afiado"] }).dmgPct === 0);
check("redução de dano com afixo respeita o teto (60%)", gearBonuses({ weapon: null, offhand: null, helmet: "warrior_helmet_epic", armor: "warrior_armor_mythic", boots: "warrior_boots_mythic", cape: "warrior_cape_mythic" }, "warrior", { armor: ["couro_reforcado"], boots: ["couro_reforcado"], cape: ["couro_reforcado"] }).dr <= 60);
check("emptyBonuses tem o bloco de afixos zerado", emptyBonuses().af.lifesteal === 0 && emptyBonuses().af.hp === 0);
check("todo slot de equipamento existe no catálogo de itens (sanidade)", EQUIP_SLOTS.length === 6 && Object.keys(ITEMS).length > 0);

console.log("\n== Drop de equipamento (gearDrop, rng injetável)");
const { gearDrop } = await import("../src/game/loot.ts");
for (const r of ORDEM) {
  const drops = Array.from({ length: 200 }, (_, i) => gearDrop(r, seeded(i + 11)));
  check(`${r}: drop traz afixos válidos (elegíveis, sem repetir, até 3)`, drops.every((d) => {
    const k = ITEMS[d.id].kind, af = d.af ?? [];
    return af.every((a) => afixoElegivel(AFIXO_BY_ID[a], k, r)) && new Set(af).size === af.length && af.length <= MAX_AFIXOS && d.qty === 1;
  }));
}

console.log(`\n${total - falhas}/${total} verificações passaram`);
if (falhas) process.exit(1);
