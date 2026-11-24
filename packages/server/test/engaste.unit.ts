// ENGASTE (unitário, sem servidor): espaços por raridade e tipo, gemas válidas, bônus somado ao stat,
// engastarGema e removerGema (tudo ou nada), e as gemas que viajam com o item (mochila, equipar, desequipar, snapshot).
// Uso: npx tsx test/engaste.unit.ts  (a partir de packages/server)
import { ITEMS, familiasArma, espacosDe, gemasValidas, bonusGemas, custoEngaste, gearBonuses, MAX_ESPACOS, type CharClass } from "@frixep/shared";
import { emptyInventory, addItem, equipFromSlot, unequip, bonuses, snapshot } from "../src/game/inventory.js";
import { engastarGema, removerGema } from "../src/game/engaste.js";

let falhas = 0;
let total = 0;
const check = (nome: string, ok: boolean, detalhe = "") => {
  total++;
  if (!ok) falhas++;
  console.log(`${ok ? "PASS" : "FAIL"}  ${nome}${detalhe ? "  -> " + detalhe : ""}`);
};

const CLS: CharClass = "warrior";
const ARMA = `${familiasArma(CLS)[0]}_rare`; // arma rara: 1 + 1 (arma) = 2 espaços
const PECA = "warrior_armor_rare"; // armadura rara: 1 espaço
const ELMO_EPIC = "warrior_helmet_epic"; // elmo épico: 2 espaços
const COMUM = "warrior_armor_common"; // comum: não engastável

console.log("== Espaços por raridade e tipo");
check("comum não tem espaço", espacosDe("armor", "common") === 0);
check("armadura rara tem 1 espaço", espacosDe("armor", "rare") === 1);
check("arma rara tem 2 (um a mais que a defesa)", espacosDe("weapon", "rare") === 2);
check("elmo épico tem 2", espacosDe("helmet", "epic") === 2);
check("arma mítica é limitada a MAX_ESPACOS", espacosDe("weapon", "mythic") === Math.min(MAX_ESPACOS, 4) && MAX_ESPACOS === 4);
check("poção e material não têm espaço", espacosDe("potion", "epic") === 0 && espacosDe("material", "mythic") === 0);

console.log("\n== Gemas válidas e tipo");
check("gema de vida em arma é descartada", gemasValidas(["vida"], "weapon", "rare").length === 0);
check("gema de força em armadura é descartada", gemasValidas(["forca"], "armor", "rare").length === 0);
check("id desconhecido é descartado", gemasValidas(["nao_existe", 7, null], "armor", "rare").length === 0);
check("gemas válidas acima do espaço são cortadas", gemasValidas(["vida", "vida", "vida"], "armor", "rare").length === 1);
check("não-lista vira nenhuma gema", gemasValidas("vida", "armor", "rare").length === 0);

console.log("\n== Bônus das gemas");
check("gema de força numa arma soma +3 de dano %", bonusGemas(["forca"], "weapon").dmgPct === 3 && bonusGemas(["forca"], "weapon").hp === 0);
check("duas gemas de vida numa armadura somam 24 de vida", bonusGemas(["vida", "vida"], "armor").hp === 24);
check("sem gema não soma nada", bonusGemas(undefined, "armor").hp === 0 && bonusGemas([], "weapon").dmgPct === 0);
const base = gearBonuses({ weapon: null, offhand: null, helmet: null, armor: PECA as string, boots: null, cape: null }, CLS);
const com = gearBonuses({ weapon: null, offhand: null, helmet: null, armor: PECA as string, boots: null, cape: null }, CLS, {}, {}, { armor: ["vida"] });
check("gearBonuses soma a gema ao stat de vida do equipamento", com.hp - base.hp === 12, `${base.hp} -> ${com.hp}`);
check("custo da gema em Óbolos é 1 (versão crua)", custoEngaste("vida") === 1 && custoEngaste("forca") === 1 && custoEngaste("nope") === 0);

console.log("\n== engastarGema (mochila)");
const inv = emptyInventory();
inv.obols = 2;
const pos = addItem(inv, PECA, 1);
check("armadura rara entrou na mochila", pos === 0);
const slot = inv.slots.findIndex((s) => s?.id === PECA);
const r1 = engastarGema(inv, { origem: "mochila", slot, gema: "vida" });
check("engasta gema de vida num espaço livre", r1.ok, r1.ok ? r1.msg : r1.error);
check("gema fica no item e custa 1 Óbolo", inv.slots[slot]?.gm?.join() === "vida" && inv.obols === 1);
const antes = JSON.stringify(inv);
const r2 = engastarGema(inv, { origem: "mochila", slot, gema: "vida" });
check("espaço cheio é recusado", !r2.ok && JSON.stringify(inv) === antes, !r2.ok ? r2.error : "");
const invSemObolo = emptyInventory();
addItem(invSemObolo, ARMA, 1);
const sArma = invSemObolo.slots.findIndex((s) => s?.id === ARMA);
const r3 = engastarGema(invSemObolo, { origem: "mochila", slot: sArma, gema: "forca" });
check("sem Óbolos: recusa e nada muda", !r3.ok && invSemObolo.obols === 0 && !invSemObolo.slots[sArma]?.gm, !r3.ok ? r3.error : "");
const inv2 = emptyInventory();
inv2.obols = 5;
addItem(inv2, PECA, 1);
const s2 = inv2.slots.findIndex((s) => s?.id === PECA);
const antes2 = JSON.stringify(inv2);
const r4 = engastarGema(inv2, { origem: "mochila", slot: s2, gema: "forca" });
check("gema de força em armadura é recusada sem gastar", !r4.ok && JSON.stringify(inv2) === antes2, !r4.ok ? r4.error : "");
check("comum (sem espaço) é recusado", !engastarGema((() => { const i = emptyInventory(); i.obols = 9; addItem(i, COMUM, 1); return i; })(), { origem: "mochila", slot: 0, gema: "vida" }).ok);
check("origem inválida é recusada", !engastarGema(inv2, { origem: "bau", slot: 0, gema: "vida" }).ok);
check("espaço vazio é recusado", !engastarGema(inv2, { origem: "mochila", slot: 40, gema: "vida" }).ok);

console.log("\n== removerGema devolve o espaço");
const r5 = removerGema(inv, { origem: "mochila", slot, idx: 0 });
check("remover tira a gema e o espaço volta", r5.ok && !inv.slots[slot]?.gm, r5.ok ? r5.msg : r5.error);
check("remover não gasta Óbolos", inv.obols === 1);
check("índice inexistente é recusado", !removerGema(inv, { origem: "mochila", slot, idx: 0 }).ok);
check("com o espaço livre, engasta de novo", engastarGema(inv, { origem: "mochila", slot, gema: "vida" }).ok);

console.log("\n== gemas viajam com o equipamento vestido");
const inv3 = emptyInventory();
inv3.obols = 3;
addItem(inv3, ELMO_EPIC, 1);
const sE = inv3.slots.findIndex((s) => s?.id === ELMO_EPIC);
engastarGema(inv3, { origem: "mochila", slot: sE, gema: "vida" });
engastarGema(inv3, { origem: "mochila", slot: sE, gema: "vida" });
check("elmo épico recebe 2 gemas de vida", inv3.slots[sE]?.gm?.length === 2);
const eq = equipFromSlot(inv3, sE, 99, CLS);
check("equipar leva as gemas para o equipamento", eq.ok && inv3.equipGm?.helmet?.length === 2 && !inv3.slots[sE]?.gm);
const hpVestido = bonuses(inv3, CLS).hp;
const semGema = (() => { const i = emptyInventory(); addItem(i, ELMO_EPIC, 1); equipFromSlot(i, 0, 99, CLS); return bonuses(i, CLS).hp; })();
check("o bônus de vida do elmo sobe com as 2 gemas (+24)", hpVestido - semGema === 24, `${semGema} -> ${hpVestido}`);
const snap = snapshot(inv3);
check("snapshot leva equipGm", snap.equipGm?.helmet?.join() === "vida,vida");
const nao = unequip(inv3, "helmet");
check("desequipar devolve o item com as gemas para a mochila", nao.ok && inv3.slots.some((s) => s?.id === ELMO_EPIC && s.gm?.length === 2) && !inv3.equipGm?.helmet);
check("gemas vão embora com o equipamento, sem gerar gema extra", !inv3.equipGm?.helmet && inv3.obols === 1);

console.log(`\n${total - falhas}/${total} passaram`);
if (falhas) process.exit(1);
