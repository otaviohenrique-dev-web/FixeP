// Testes unitários das regras de chefe (exigem grupo): fórmulas e simulação de viabilidade, usando as constantes REAIS do jogo.
// Uso (em packages/server): npx tsx test/boss.unit.ts
import {
  ZONES, ZONE_IDS, ITEMS, CLASS_DEFS, PLAYABLE_CLASSES, ACTION_IDS, enemyHp, enemyDmg, enemyKind, maxHpFor, dmgMult, POTION_COOLDOWN_S,
  BOSS_GROUP_MIN, BOSS_ENRAGE_S, bossDmgMult, bossEnrageMult, type CharClass,
} from "@frixep/shared";

const results: boolean[] = [];
const check = (name: string, ok: boolean, detail = "") => {
  results.push(ok);
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? "  -> " + detail : ""}`);
};

console.log("\n== Fórmulas ==");
check("grupo mínimo é 3 (tanque, curandeiro e dano)", BOSS_GROUP_MIN === 3);
check("dano do chefe: solo x2,5, dupla x1,75, trio ou mais x1", bossDmgMult(1) === 2.5 && bossDmgMult(2) === 1.75 && bossDmgMult(3) === 1 && bossDmgMult(4) === 1 && bossDmgMult(0) === 2.5);
check("fúria por tempo: x1 até 150 s, +50% a cada 30 s, teto x4", bossEnrageMult(0) === 1 && bossEnrageMult(BOSS_ENRAGE_S) === 1 && bossEnrageMult(BOSS_ENRAGE_S + 30) === 1.5 && bossEnrageMult(BOSS_ENRAGE_S + 60) === 2 && bossEnrageMult(9999) === 4);

/** teto de dano sustentado de uma classe (todas as ações, ignorando custo de recurso e erros de mira: generoso com quem joga) */
const peakDps = (cls: CharClass, level: number) => {
  const acts = CLASS_DEFS[cls].actions;
  let sum = 0;
  for (const id of ACTION_IDS) { const a = acts[id]; if (a.dmg && a.cd > 0) sum += (a.dmg * dmgMult(level, 40)) / a.cd; } // 40% de bônus de arma: build bem acima do comum
  return sum;
};
const potion = ITEMS.pocao_de_vida;

for (const zid of ZONE_IDS) {
  const b = ZONES[zid].boss, K = enemyKind(b.kind), B = K.boss!;
  const hp = enemyHp(b.level, b.kind);
  console.log(`\n== Chefe da zona ${zid}: ${K.name} (nível ${b.level}, vida ${hp}) ==`);
  const soloBest = Math.max(...PLAYABLE_CLASSES.map((c) => peakDps(c, b.level)));
  const ttkSolo = hp / soloBest;

  // sobrevivência do solo: melhor caso = Guerreiro com Grito (50% menos dano em 4 s de cada 12 s: média de 17%) + 25% de redução de equipamento + poção sempre na recarga
  const maxHp = maxHpFor("warrior", b.level, 80); // armadura de bônus generosa
  const dr = 0.25 + 0.5 / 3; // redução média (o jogo limita em 80%)
  const pulse = maxHp * B.pulsePct * bossDmgMult(1) * (1 - Math.min(0.8, dr));
  const hit = enemyDmg(b.level, b.kind) * bossDmgMult(1) * (1 - Math.min(0.8, dr)); // um golpe que acerte (ele esquiva os telégrafos, por isso só conta 1 a cada 4)
  const perS = pulse / B.pulseEveryS + hit / (4 * 2.5);
  const potionPerS = (potion.heal ?? 0) / POTION_COOLDOWN_S;
  const survive = potionPerS >= perS ? Infinity : maxHp / (perS - potionPerS);
  check(`SOLO inviável: matar levaria ${ttkSolo.toFixed(0)} s (mesmo com todas as habilidades sem custo) e ele morre antes`, survive < ttkSolo, `solo mata em ${ttkSolo.toFixed(0)} s; sobrevive ~${survive === Infinity ? "∞" : survive.toFixed(0)} s; dano ${perS.toFixed(1)}/s vs poção ${potionPerS.toFixed(1)}/s`);
  check("SOLO: morre bem antes (menos da metade do tempo que precisaria para matar)", survive < ttkSolo / 2, `${survive.toFixed(0)} s < ${(ttkSolo / 2).toFixed(0)} s`);
  check("SOLO: poção sozinha não sustenta o pulso sombrio", potionPerS < pulse / B.pulseEveryS, `${potionPerS.toFixed(1)} < ${(pulse / B.pulseEveryS).toFixed(1)}`);

  // grupo de 3 (tanque + curandeiro + dano): dano somado dos três (teto, sem o tanque morrer) mata antes da fúria
  const dps3 = peakDps("warrior", b.level) * 0.6 + peakDps("cleric", b.level) * 0.4 + Math.max(peakDps("mage", b.level), peakDps("archer", b.level)); // tanque e curandeiro gastam tempo em Grito e Cura
  const realistic = dps3 * 0.5; // metade do teto: erros de mira, esquivas, recursos
  const ttk3 = hp / realistic;
  check(`TRIO possível: mata em ~${ttk3.toFixed(0)} s (dano real = 50% do teto), antes da fúria de ${BOSS_ENRAGE_S} s`, ttk3 < BOSS_ENRAGE_S, `teto ${dps3.toFixed(0)}/s`);

  // o pulso (dano x1 no trio) por segundo em cada um tem de caber na Cura do Clérigo (alcance 4: o grupo se junta)
  // o Clérigo escolhe o Q: cura em área (pouca, em todos) ou cura focada (forte, em um); para segurar o pulso em quem está em risco vale a melhor das duas
  const healer = [CLASS_DEFS.cleric.actions.skill1, CLASS_DEFS.cleric.skill1Alt!].reduce((best, q) => ((q.heal ?? 0) / q.cd > (best.heal ?? 0) / best.cd ? q : best));
  const cura = (healer.heal ?? 0) * dmgMult(b.level, 0) / healer.cd;
  const luz = (CLASS_DEFS.cleric.actions.ultimate.heal ?? 0) * dmgMult(b.level, 0) / CLASS_DEFS.cleric.actions.ultimate.cd;
  const pulseTrio = maxHpFor("archer", b.level, 0) * B.pulsePct / B.pulseEveryS; // alvo mais frágil, sem redução
  check(`TRIO com curandeiro aguenta o pulso: cura ${(cura + luz).toFixed(1)}/s + poção ${potionPerS.toFixed(1)}/s >= pulso ${pulseTrio.toFixed(1)}/s`, cura + luz + potionPerS >= pulseTrio);
  check(`TRIO SEM curandeiro não aguenta o pulso só com poções (${potionPerS.toFixed(1)}/s < ${pulseTrio.toFixed(1)}/s)`, potionPerS < pulseTrio);
}

const failed = results.filter((r) => !r).length;
console.log(`\n${results.length - failed}/${results.length} verificações passaram`);
process.exit(failed ? 1 : 0);
