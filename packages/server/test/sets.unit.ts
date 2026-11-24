// Teste unitário dos CONJUNTOS (C3.4, versão crua): catálogo, contagem de peças, liga/desliga ao trocar peça,
// sem soma dupla (2 peças = b2; 4 = só b4) e teto de redução. Uso: npx tsx test/sets.unit.ts  (a partir de packages/server)
import {
  SETS, setDaPeca, contarSet, setAtivo, aplicarSets, setBonusLinhas, gearBonuses, emptyBonuses, ITEMS, EQUIP_SLOTS, MAX_DR, GEAR_CLASSES,
  type EquipSlot, type CharClass,
} from "@frixep/shared";

let falhas = 0;
let total = 0;
const check = (nome: string, ok: boolean, detalhe = "") => {
  total++;
  if (!ok) falhas++;
  console.log(`${ok ? "PASS" : "FAIL"}  ${nome}${detalhe ? "  -> " + detalhe : ""}`);
};

type Equip = Record<EquipSlot, string | null>;
const vazio = (): Equip => ({ weapon: null, offhand: null, helmet: null, armor: null, boots: null, cape: null });
const pecasDe = (cls: CharClass, rar: string): Equip => ({ ...vazio(), armor: `${cls}_armor_${rar}`, helmet: `${cls}_helmet_${rar}`, boots: `${cls}_boots_${rar}`, cape: `${cls}_cape_${rar}` });

console.log("== Catálogo");
check("um conjunto por classe (4 classes)", GEAR_CLASSES.every((c) => SETS.filter((s) => s.classe === c).length === 1) && SETS.length === 4);
check("ids únicos", new Set(SETS.map((s) => s.id)).size === SETS.length);
check("cada conjunto tem as 4 peças de corpo", SETS.every((s) => ["armor", "helmet", "boots", "cape"].every((k) => s.pecas.includes(k as EquipSlot)) && s.pecas.length === 4));
check("bônus de 2 e de 4 não vazios", SETS.every((s) => Object.keys(s.b2).length > 0 && Object.keys(s.b4).length > 0));
check("bônus de 4 é pelo menos o de 2 em cada stat", SETS.every((s) => Object.keys(s.b2).every((k) => (s.b4[k as keyof typeof s.b4] ?? 0) >= (s.b2[k as keyof typeof s.b2] ?? 0))));

console.log("== Peça de conjunto");
check("peça de corpo da classe pertence ao conjunto", setDaPeca("warrior_armor_common")?.classe === "warrior");
check("elmo do arqueiro pertence ao conjunto do arqueiro", setDaPeca("archer_helmet_rare")?.classe === "archer");
check("arma não é peça de conjunto", setDaPeca("espada_1m_common") === null);
check("item sem classe não é peça", setDaPeca("pocao_de_vida") === null);
check("peça de outra classe não conta", setDaPeca("cleric_armor_epic")?.classe === "cleric");

console.log("== Contagem e bônus");
const muralha = SETS.find((s) => s.classe === "warrior")!;
check("sem peças: 0 e nenhum bônus", contarSet(vazio(), muralha) === 0 && setAtivo(vazio(), "warrior")!.bonus === null);
const duas: Equip = { ...vazio(), armor: "warrior_armor_rare", helmet: "warrior_helmet_rare" };
check("2 peças: conta 2 e liga o bônus de 2", contarSet(duas, muralha) === 2 && setAtivo(duas, "warrior")!.bonus === muralha.b2);
const tres: Equip = { ...duas, boots: "warrior_boots_rare" };
check("3 peças: ainda vale o bônus de 2", setAtivo(tres, "warrior")!.bonus === muralha.b2 && setAtivo(tres, "warrior")!.n === 3);
const quatro = pecasDe("warrior", "rare");
check("4 peças: vale o bônus de 4", setAtivo(quatro, "warrior")!.bonus === muralha.b4);
check("peça de outra classe não ativa o conjunto", setAtivo({ ...vazio(), armor: "archer_armor_rare", helmet: "archer_helmet_rare" }, "warrior")!.bonus === null);

console.log("== Liga e desliga ao trocar a peça");
const base = gearBonuses(vazio(), "warrior");
const com4 = aplicarSets(base, quatro, "warrior");
check("com 4 peças: hp soma exatamente o b4", com4.hp === base.hp + muralha.b4.hp!, `${com4.hp} vs ${base.hp + muralha.b4.hp!}`);
const sem1 = aplicarSets(base, { ...quatro, cape: null }, "warrior"); // tira a capa: cai para 3 peças => b2
check("tirar 1 peça (3 peças): cai para o bônus de 2", sem1.hp === base.hp + muralha.b2.hp! && sem1.dr === base.dr + muralha.b2.dr!);
const trocada = aplicarSets(base, { ...quatro, cape: "warrior_cape_epic" }, "warrior"); // trocar por outra peça da mesma classe não muda a contagem
check("trocar peça por outra do conjunto mantém o bônus de 4", trocada.hp === com4.hp);
const nenhum = aplicarSets(base, vazio(), "warrior");
check("sem peças o bônus desliga (igual ao base)", nenhum.hp === base.hp && nenhum.dr === base.dr && nenhum.dmgPct === base.dmgPct);

console.log("== Sem soma dupla");
const b2so = aplicarSets(base, duas, "warrior");
check("2 peças: soma só o b2 (não o b2 + b4)", b2so.hp === base.hp + muralha.b2.hp! && b2so.dmgPct === base.dmgPct);
check("função não muda o objeto original", base.hp === gearBonuses(vazio(), "warrior").hp && base.af !== com4.af);

console.log("== Teto e textos");
const arco = SETS.find((s) => s.classe === "archer")!;
const topo = { ...gearBonuses(vazio(), "archer"), dr: MAX_DR - 1 };
const comTeto = aplicarSets(topo, pecasDe("archer", "legendary"), "archer");
check("redução de dano não passa do teto", comTeto.dr <= MAX_DR, `${comTeto.dr}`);
check("conjunto do arqueiro dá crítico com 2 peças", setAtivo({ ...vazio(), armor: "archer_armor_common", helmet: "archer_helmet_common" }, "archer")!.bonus!.crit === arco.b2.crit);
check("textos do bônus listam cada stat", setBonusLinhas({ hp: 20, dr: 2 }).length === 2 && setBonusLinhas({ hp: 20 })[0].includes("+20"));
check("itens de corpo existem no catálogo", EQUIP_SLOTS.length === 6 && !!ITEMS["mage_cape_common"] && !!ITEMS["mage_boots_common"]);
check("bônus vazio é zero", Object.keys(emptyBonuses()).length > 0);

console.log(`\n${total - falhas}/${total} testes passaram`);
if (falhas) process.exit(1);
