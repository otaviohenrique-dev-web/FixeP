// Poder total (sem servidor): função pura de packages/shared/src/poder.ts.
// Uso (em packages/server): npx tsx test/poder.unit.ts
import { ITEMS, EQUIP_SLOTS, poderTotal, poderDoEquipamento, statsDoPersonagem, gearBonuses, type EquipSlot, type ItemDef } from "@frixep/shared";

const results: boolean[] = [];
const check = (name: string, ok: boolean, detail = "") => {
  results.push(ok);
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? "  -> " + detail : ""}`);
};

const vazio = (): Record<EquipSlot, string | null> => Object.fromEntries(EQUIP_SLOTS.map((s) => [s, null])) as Record<EquipSlot, string | null>;
const com = (slot: EquipSlot, id: string | null) => ({ ...vazio(), [slot]: id });
const porNome = (kind: string, cls: string, ordena: (d: ItemDef) => number): ItemDef[] =>
  Object.values(ITEMS).filter((d) => d.kind === kind && d.cls === cls).sort((a, b) => ordena(a) - ordena(b));

console.log("== Poder total: função pura (shared) ==");

// 1. item melhor sobe o poder, pior desce, remover desce
const armaduras = porNome("armor", "warrior", (d) => d.hp ?? 0);
const piorArm = armaduras[0];
const melhorArm = armaduras[armaduras.length - 1];
const p0 = poderDoEquipamento("warrior", 1, vazio());
const pPior = poderDoEquipamento("warrior", 1, com("armor", piorArm.id));
const pMelhor = poderDoEquipamento("warrior", 1, com("armor", melhorArm.id));
check("sem equipamento o Guerreiro nível 1 tem poder positivo", p0 > 0, `poder ${p0}`);
check("equipar uma armadura sobe o poder", pPior > p0, `${p0} -> ${pPior}`);
check("uma armadura melhor sobe mais que a pior", pMelhor > pPior, `${pPior} -> ${pMelhor} (${melhorArm.id})`);
check("trocar a melhor pela pior desce o poder", poderDoEquipamento("warrior", 1, com("armor", piorArm.id)) < pMelhor);
check("remover a armadura desce o poder", poderDoEquipamento("warrior", 1, vazio()) < pPior, `${pPior} -> ${p0}`);

const armasEsp = porNome("weapon", "warrior", (d) => d.dmgPct ?? 0).filter((d) => d.wtype === "espada_1m" || d.wtype === "espada_larga");
const armaFraca = armasEsp[0];
const armaForte = armasEsp[armasEsp.length - 1];
check("há armas de Guerreiro para comparar", !!armaFraca && !!armaForte && armaForte.id !== armaFraca.id);
const pFraca = poderDoEquipamento("warrior", 1, com("weapon", armaFraca.id));
const pForte = poderDoEquipamento("warrior", 1, com("weapon", armaForte.id));
check("arma de mais dano dá mais poder que a de menos dano", pForte > pFraca, `${armaFraca.id}=${pFraca} ${armaForte.id}=${pForte}`);
check("arma equipada sobe o poder sobre o nada", pFraca > p0, `${p0} -> ${pFraca}`);

// 2. item de outra classe não conta (o servidor também não aplica)
const outraClasse = Object.values(ITEMS).find((d) => d.kind === "armor" && d.cls && d.cls !== "warrior");
check("item de outra classe não muda o poder", !!outraClasse && poderDoEquipamento("warrior", 1, com("armor", outraClasse!.id)) === p0);

// 3. determinístico e inteiro
const a = poderDoEquipamento("warrior", 7, com("armor", melhorArm.id));
const b = poderDoEquipamento("warrior", 7, com("armor", melhorArm.id));
check("mesma entrada, mesmo poder (determinístico)", a === b && Number.isInteger(a), `${a}`);
check("poderTotal soma os pesos e arredonda", poderTotal({ dano: 10, vida: 0, recurso: 0 }) === 20 && poderTotal({ dano: 0, vida: 10, recurso: 0 }) === 3);
check("statsDoPersonagem usa o bônus de equipamento (vida sobe com armadura)", statsDoPersonagem("warrior", 1, gearBonuses(com("armor", melhorArm.id), "warrior")).vida > statsDoPersonagem("warrior", 1, gearBonuses(vazio(), "warrior")).vida);

// 4. cresce com o nível
check("o poder cresce com o nível", poderDoEquipamento("warrior", 10, vazio()) > p0);

const ok = results.every(Boolean);
console.log(`\n${results.filter(Boolean).length}/${results.length} verificações passaram`);
process.exit(ok ? 0 : 1);
