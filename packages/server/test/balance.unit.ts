// Balanceamento das classes (sem servidor): DPS estimado com as constantes REAIS do jogo (nível 1, sem equipamento) e regras do kit novo.
// Uso (em packages/server): npx tsx test/balance.unit.ts   (a mesma tabela vai no README)
import { estimateDps, CLASS_DEFS, PLAYABLE_CLASSES, ITEMS, WEAPON_TYPES, classAction, BOSS_CC_RESIST, PVP_CHANNEL_S, PVP_NO_DAMAGE_S, QMODE_SWAP_S, AOE_TARGETS, type CharClass } from "@frixep/shared";

const results: boolean[] = [];
const check = (name: string, ok: boolean, detail = "") => {
  results.push(ok);
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? "  -> " + detail : ""}`);
};

// DPS ANTES do balanceamento (medido com este mesmo simulador nos números antigos: Mago/Arqueiro com 15/44/40/62/230 e 10/18/28/15/40 de dano)
const BEFORE: Record<CharClass, { single: number; aoe: number }> = {
  warrior: { single: 24.9, aoe: 63.3 }, archer: { single: 24.9, aoe: 43.4 }, cleric: { single: 12.0, aoe: 17.2 }, mage: { single: 23.0, aoe: 45.3 },
};
const now = Object.fromEntries(PLAYABLE_CLASSES.map((c) => [c, estimateDps(c)])) as Record<CharClass, { single: number; aoe: number }>;

console.log(`\n== DPS estimado (nível 1, sem equipamento; área = ${AOE_TARGETS} inimigos agrupados) ==`);
console.log("Classe      | alvo único antes → depois | área antes → depois");
for (const c of PLAYABLE_CLASSES) {
  const pct = (a: number, b: number) => `${b >= a ? "+" : ""}${Math.round(((b - a) / a) * 100)}%`;
  console.log(`${CLASS_DEFS[c].name.padEnd(11)} | ${BEFORE[c].single.toFixed(1).padStart(5)} → ${now[c].single.toFixed(1).padStart(5)} (${pct(BEFORE[c].single, now[c].single).padStart(4)})     | ${BEFORE[c].aoe.toFixed(1).padStart(5)} → ${now[c].aoe.toFixed(1).padStart(5)} (${pct(BEFORE[c].aoe, now[c].aoe).padStart(4)})`);
}

console.log("\n== Mago e Arqueiro: dano reduzido, mas ainda classes de dano ==");
for (const c of ["mage", "archer"] as const) {
  const n = CLASS_DEFS[c].name;
  check(`${n}: DPS de alvo único caiu pelo menos 12%`, now[c].single <= BEFORE[c].single * 0.88, `${BEFORE[c].single} → ${now[c].single.toFixed(1)}`);
  check(`${n}: DPS em área caiu pelo menos 20%`, now[c].aoe <= BEFORE[c].aoe * 0.8, `${BEFORE[c].aoe} → ${now[c].aoe.toFixed(1)}`);
  // Rebalance de design (Guerreiro = tanque, com R de 120 para 40): o Guerreiro agora tem DPS único menor, então
  // o limite do Mago/Arqueiro passa de "não passa do Guerreiro" para "no máximo 1,15x do Guerreiro".
  check(`${n}: alvo único no máximo 1,15x o do Guerreiro (tanque)`, now[c].single <= now.warrior.single * 1.15, `${now[c].single.toFixed(1)} vs ${now.warrior.single.toFixed(1)}`);
  check(`${n}: ainda é classe de dano (≥ 70% do alvo único do Guerreiro e ≥ 1,5x o Clérigo em área)`, now[c].single >= now.warrior.single * 0.7 && now[c].aoe >= now.cleric.aoe * 1.5, `área ${now[c].aoe.toFixed(1)} vs clérigo ${now.cleric.aoe.toFixed(1)}`);
  check(`${n}: nenhuma habilidade de dano passa de 150 (antes o Meteoro do Mago tinha 230)`, Object.values(CLASS_DEFS[c].actions).every((a) => (a.dmg ?? 0) <= 150));
}
// Guerreiro (tanque): DPS cai com o rebalance (R de 120 para 40, golpes 12 → 10) e continua na faixa de dano baixo/médio.
check("Guerreiro: DPS de alvo único cai e fica na faixa de tanque (15 a 22)", now.warrior.single < BEFORE.warrior.single && now.warrior.single >= 15 && now.warrior.single <= 22, `guerreiro ${BEFORE.warrior.single} → ${now.warrior.single.toFixed(1)}`);
check("Clérigo segue como suporte: menos dano que o Guerreiro", now.cleric.single < now.warrior.single, `clérigo ${now.cleric.single.toFixed(1)} vs guerreiro ${now.warrior.single.toFixed(1)}`);

console.log("\n== Armas e itens que dão dano percentual ==");
const rar = ["common", "uncommon", "rare", "epic", "legendary", "mythic"];
const pctOf = (id: string) => ITEMS[id].dmgPct ?? 0;
for (const r of rar) {
  const w = pctOf(`espada_larga_${r}`);
  check(`arma de Mago (${r}) dá no máximo 75% do bônus da arma de Guerreiro`, pctOf(`cajado_arcano_${r}`) <= Math.round(w * 0.75), `${pctOf(`cajado_arcano_${r}`)}% vs ${w}%`);
  check(`arma de Arqueiro (${r}) dá no máximo 80% do bônus da arma de Guerreiro`, pctOf(`arco_longo_${r}`) <= Math.round(w * 0.8), `${pctOf(`arco_longo_${r}`)}% vs ${w}%`);
}
check("mão secundária de Mago/Arqueiro com bônus menor que a do Clérigo (relicário) e Guerreiro (adaga) acompanhando", pctOf("tomo_arcano_epic") <= pctOf("relicario_epic") && pctOf("aljava_epic") <= pctOf("relicario_epic"), `tomo ${pctOf("tomo_arcano_epic")}, aljava ${pctOf("aljava_epic")}, relicário ${pctOf("relicario_epic")}`);
const mult = (c: CharClass, a: "dmg") => Object.values(WEAPON_TYPES).filter((t) => t.cls === c).map((t) => (t.kit[a] ?? 1) * Math.max(1, ...Object.values(t.kit.act ?? {}).map((x) => x?.[a] ?? 1)));
check("kits de arma de Mago e Arqueiro com multiplicador de dano (kit x ação) ≤ 1,27 (antes até 1,5)", [...mult("mage", "dmg"), ...mult("archer", "dmg")].every((v) => v <= 1.27), JSON.stringify([...mult("mage", "dmg"), ...mult("archer", "dmg")].map((v) => +v.toFixed(2))));

console.log("\n== Guerreiro: kit novo (controle, reflexão, ultimate) mantendo o papel de tanque ==");
const W = CLASS_DEFS.warrior;
check("segue sendo o tanque: mais vida que as outras classes de dano e Fúria 100", W.maxHp > CLASS_DEFS.mage.maxHp && W.maxHp > CLASS_DEFS.archer.maxHp && W.maxHp >= CLASS_DEFS.cleric.maxHp && W.resource.max === 100);
check("Q Investida: avanço que ATORDOA", W.actions.skill1.kind === "dashHit" && (W.actions.skill1.stunS ?? 0) > 0);
check("W Correntes: área que ENRAÍZA, com visual 'chains'", W.actions.skill2.kind === "rain" && (W.actions.skill2.rootS ?? 0) > 0 && W.actions.skill2.fx === "chains");
// Escudo de Aço (antes "Escudo Refletor"): o reflexo saiu da classe (é o afixo Espinhos), fica provocar + redução de dano.
check("E Escudo de Aço: PROVOCA e reduz dano, sem reflexo de classe", W.actions.skill3.kind === "reflectBuff" && (W.actions.skill3.reflect ?? 0) === 0 && (W.actions.skill3.reduction ?? 0) > 0 && (W.actions.skill3.tauntRadius ?? 0) > 0);
check("R Queda do Colosso: do alto (fx colossus), grande e atordoa", W.actions.ultimate.fx === "colossus" && W.actions.ultimate.radius! >= 4 && (W.actions.ultimate.stunS ?? 0) > 0 && W.actions.ultimate.dmg! >= 3 * W.actions.attack.dmg! && W.actions.ultimate.dmg! <= 4 * W.actions.attack.dmg!); // R 120 → 40 (≈ 4x o golpe de 10): dano médio, controle é o papel
check("a ultimate é a mais forte do Guerreiro e tem telégrafo (atraso ≥ 1 s)", W.actions.ultimate.dmg! > Math.max(W.actions.skill1.dmg!, W.actions.skill2.dmg!) && (W.actions.ultimate.delayS ?? 0) >= 1);
check("os chefes resistem ao controle (duração × " + BOSS_CC_RESIST + ")", BOSS_CC_RESIST > 0 && BOSS_CC_RESIST < 1);
// Antes a Investida curava (selfHeal) e o E refletia: recuperação de vida e reflexo são afixos de item (Roubo/Colheita e Espinhos), então saíram das classes.
check("Guerreiro não cura nas habilidades (recuperação de vida é afixo de item); Investida dá mais dano e atordoa; Correntes deixa lento além de enraizar", (W.actions.attack.hitHeal ?? 0) === 0 && (W.actions.skill1.selfHeal ?? 0) === 0 && (W.actions.skill1.dmg ?? 0) >= 14 && (W.actions.skill1.stunS ?? 0) > 0 && (W.actions.skill2.slowPct ?? 0) >= 20 && (W.actions.skill2.rootS ?? 0) > 0);
check("Guerreiro: nenhuma habilidade passa de 40 de dano (tanque: a R é a maior e fica nesse teto)", Object.values(W.actions).every((a) => (a.dmg ?? 0) <= 40));

console.log("\n== Clérigo: acúmulos, mana e apoio ==");
const K = CLASS_DEFS.cleric.actions;
check("Cura em Área devolve mana, dá escudo leve e a Luz Divina purifica e dá escudo maior", K.skill1.manaGain! > 0 && (K.skill1.guardPct ?? 0) > 0 && K.ultimate.cleanse === true && (K.ultimate.guardPct ?? 0) > (K.skill1.guardPct ?? 0));

console.log("\n== Mago: queimadura e controle ==");
const M = CLASS_DEFS.mage.actions;
// Queimadura saiu do Mago (é afixo de item, "Queimadura ao Acertar"): o controle vira lentidão (Q), enraizamento (E, R) e o atordoamento curto do Relâmpago (W).
check("Mago sem queimadura: Q lentifica, E e R enraízam; Relâmpago (W) atordoa por pouco", (M.skill1.burnPct ?? 0) === 0 && (M.skill3.burnPct ?? 0) === 0 && (M.ultimate.burnPct ?? 0) === 0 && (M.skill1.slowPct ?? 0) > 0 && (M.skill3.rootS ?? 0) > 0 && (M.ultimate.rootS ?? 0) > 0 && (M.skill2.stunS ?? 0) > 0 && (M.skill2.stunS ?? 0) < 1.5);
check("Meteoro (R) passou a ter dano médio, abaixo de 60 (antes 140)", M.ultimate.dmg! <= 60 && M.ultimate.dmg! >= 40);

console.log("\n== Clérigo: dois Q ==");
const C = CLASS_DEFS.cleric;
// Rebalance de design: a cura em área subiu (16 → 26, raio 4 → 5) e a cura focada caiu (65 → 30), que agora compensa com acúmulos.
check("Q padrão: cura em área, forte o bastante para grupos (26)", C.actions.skill1.kind === "healAoe" && C.actions.skill1.heal! >= 22 && C.actions.skill1.heal! <= 30);
check("Q alternativo: cura focada ≤ 1,5x a de área (é de UM alvo), com alcance e acúmulos até 3", C.skill1Alt?.kind === "healFocus" && C.skill1Alt.heal! <= 1.5 * C.actions.skill1.heal! && (C.skill1Alt.range ?? 0) >= 8 && C.skill1Alt.stackMax === 3);
check("classAction troca o Q só do Clérigo e só no modo 1", classAction("cleric", "skill1", 1).kind === "healFocus" && classAction("cleric", "skill1", 0).kind === "healAoe" && classAction("warrior", "skill1", 1).kind === "dashHit" && classAction("mage", "skill1", 1).kind === "blast");

console.log("\n== PvP ==");
check("canalização de 5 s e janela sem dano de 5 s; troca do Q exige alguns segundos fora de combate", PVP_CHANNEL_S === 5 && PVP_NO_DAMAGE_S === 5 && QMODE_SWAP_S >= 3);

console.log("\n== Arqueiro: dano e quebra de armadura ==");
const R = CLASS_DEFS.archer.actions;
check("Q Perfurar: dano médio, atravessa e QUEBRA ARMADURA (bônus de dano recebido)", R.skill1.pierce === true && (R.skill1.shredPct ?? 0) >= 15 && (R.skill1.shredS ?? 0) >= 4 && R.skill1.dmg! >= 12);
check("W Cilada: dano BAIXO (menor que o do Perfurar) e lentidão considerável e longa", R.skill2.kind === "trap" && R.skill2.dmg! < R.skill1.dmg! && (R.skill2.slowPct ?? 0) >= 40 && (R.skill2.slowS ?? 0) >= 4);
check("E Chuva: dano significativo e ao acertar acelera o ataque básico", R.skill3.kind === "rain" && R.skill3.dmg! >= 15 && (R.skill3.hasteAtkPct ?? 0) >= 50 && (R.skill3.hasteS ?? 0) >= 3);
check("R Salva Final segue como a maior fonte de dano em área da classe", R.ultimate.dmg! > Math.max(R.skill1.dmg!, R.skill2.dmg!, R.skill3.dmg!) && R.ultimate.kind === "rain");

const failed = results.filter((x) => !x).length;
console.log(`\n${results.length - failed}/${results.length} verificações passaram`);
process.exit(failed ? 1 : 0);

