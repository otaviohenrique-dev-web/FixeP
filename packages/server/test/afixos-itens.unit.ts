// Afixos em TODO equipamento (unitário, sem servidor): o backfill de itens antigos é determinístico (mesma semente,
// mesmo resultado), item NOVO (loja, quest, fusão) sai com afixos, afixo sem efeito nunca é sorteado, e arma de
// raridade alta sai só com afixo ofensivo e variado.
// Uso: npx tsx test/afixos-itens.unit.ts  (a partir de packages/server)
import { ITEMS, AFIXOS, AFIXO_BY_ID, sortearAfixos, afixosDaSemente, afixoElegivel, type Rarity, type ItemKind } from "@frixep/shared";
import { emptyInventory, addItemNovo } from "../src/game/inventory.js";

let falhas = 0;
let total = 0;
const check = (nome: string, ok: boolean, detalhe = "") => {
  total++;
  if (!ok) falhas++;
  console.log(`${ok ? "PASS" : "FAIL"}  ${nome}${detalhe ? "  -> " + detalhe : ""}`);
};

// gerador determinístico (LCG): mesma semente, mesma sequência
const seeded = (seed: number) => () => { seed = (seed * 1664525 + 1013904223) % 4294967296; return seed / 4294967296; };
// Afixos ofensivos (ataque, crítico, velocidade, procs de dano e de vida ao abater). Arma de raridade alta só sai com estes.
const OFENSIVOS = new Set(["afiado", "olho_certeiro", "punhos_rapidos", "essencia_drenada", "colheita_de_almas", "cacador_de_chefes", "golpe_brutal", "barreira_de_brasa", "roubo_de_vida", "queimadura_ao_acertar", "execucao", "dano_de_mito"]);

console.log("== Backfill (itens antigos, sem afixos): semente fixa");
const s1 = afixosDaSemente("char1:0:espada_1m_epic", "weapon", "epic");
check("mesma semente dá sempre os mesmos afixos", JSON.stringify(s1) === JSON.stringify(afixosDaSemente("char1:0:espada_1m_epic", "weapon", "epic")), JSON.stringify(s1));
check("épico recebe exatamente 2 afixos no backfill", s1.length === 2, JSON.stringify(s1));
const sementes = Array.from({ length: 200 }, (_, i) => afixosDaSemente(`char${i}:0:espada_1m_legendary`, "weapon", "legendary").join("|"));
check("sementes diferentes geram combinações variadas (≥ 40 combinações distintas em 200 itens)", new Set(sementes).size >= 40, `${new Set(sementes).size}`);
check("backfill de armadura usa só afixos de defesa ou de qualquer item", afixosDaSemente("c:1:armor", "armor", "legendary").every((id) => AFIXO_BY_ID[id].alvo !== "arma"));

console.log("\n== Afixos sem efeito no combate nunca são sorteados");
const pendentes = AFIXOS.filter((a) => a.efeito === null).map((a) => a.id);
const todos = Array.from({ length: 800 }, (_, i) => sortearAfixos(["weapon", "armor", "boots", "helmet", "cape", "offhand"][i % 6] as ItemKind, (["common", "uncommon", "rare", "epic", "legendary", "mythic"] as Rarity[])[i % 6], seeded(i + 1))).flat();
check("nenhum afixo pendente (sem efeito) sai no sorteio", !todos.some((id) => pendentes.includes(id)), pendentes.join(", "));
check("pendente não é elegível para nenhum item", AFIXOS.filter((a) => a.efeito === null).every((a) => !afixoElegivel(a, "weapon", "mythic") && !afixoElegivel(a, "armor", "mythic")));

console.log("\n== Arma de raridade alta: ofensiva e variada");
for (const r of ["rare", "epic", "legendary", "mythic"] as Rarity[]) {
  const rolls = Array.from({ length: 400 }, (_, i) => sortearAfixos("weapon", r, seeded(1000 + i))).flat();
  check(`arma ${r}: todo afixo sorteado é ofensivo`, rolls.every((id) => OFENSIVOS.has(id)), [...new Set(rolls.filter((id) => !OFENSIVOS.has(id)))].join(", "));
  // "Variada": pelo menos 5 afixos diferentes saem em 400 armas dessa raridade (nenhum afixo domina o sorteio)
  const distintos = new Set(rolls).size;
  check(`arma ${r}: pelo menos 5 afixos diferentes em 400 armas`, distintos >= 5, `${distintos}`);
}
check("arma lendária tem proc de vida ou de queimadura ao menos uma vez em 500", Array.from({ length: 500 }, (_, i) => sortearAfixos("weapon", "legendary", seeded(5000 + i))).flat().some((id) => id === "roubo_de_vida" || id === "queimadura_ao_acertar"));

console.log("\n== Item NOVO (loja, quest, fusão): addItemNovo sorteia por unidade");
const inv = emptyInventory();
const arma = Object.values(ITEMS).find((i) => i.kind === "weapon" && i.rarity === "epic")!;
const sobra = addItemNovo(inv, arma.id, 3);
const nosSlots = inv.slots.filter((s) => s && s.id === arma.id);
check("três armas épicas novas cabem em três espaços e não sobra nada", sobra === 0 && nosSlots.length === 3, `sobra ${sobra}, espaços ${nosSlots.length}`);
check("cada arma nova sai com 2 afixos (épico)", nosSlots.every((s) => (s!.af ?? []).length === 2), JSON.stringify(nosSlots.map((s) => s!.af)));
const pocao = addItemNovo(inv, "pocao_de_vida", 2);
check("poção (não é equipamento) entra sem afixos", pocao === 0 && inv.slots.filter((s) => s?.id === "pocao_de_vida").every((s) => !s!.af));
const comum = Object.values(ITEMS).find((i) => i.kind === "armor" && i.rarity === "common")!;
addItemNovo(inv, comum.id, 1);
check("armadura comum nova sai com 0 ou 1 afixo", (inv.slots.find((s) => s?.id === comum.id)?.af ?? []).length <= 1);

console.log(`\n${total - falhas}/${total} verificações passaram`);
if (falhas > 0) process.exit(1);
