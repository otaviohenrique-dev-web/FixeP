// PODER TOTAL do personagem: um número único que resume o quanto ele causa e aguenta.
// Função PURA, compartilhada por servidor (decide e envia o valor) e cliente (só previsualiza ao equipar).
// Usa as MESMAS fontes do combate: ataque básico da classe (classAction), kit e recarga da arma (effectiveAction),
// crítico (CRIT + bônus de equipamento), poder por nível (dmgMult), defesa por nível e redução de dano (defenseMult, gear.dr),
// vida máxima (maxHpFor) e recurso máximo (maxManaFor). Buffs temporários (Chuva, Brasa...) NÃO entram: o número é estável.
import { CRIT, classAction, dmgMult, defenseMult, maxHpFor, maxManaFor, type CharClass } from "./index";
import { gearBonuses, effectiveAction, type GearBonuses, type EquipSlot } from "./items";

/**
 * Pesos do poder total (pontos por unidade):
 * - dano: cada 1 de DPS esperado (ataque básico, com crítico médio) vale 2 pontos.
 * - vida: cada 1 de vida EFETIVA vale 0,3 ponto. Vida efetiva = vida máxima × defesa do nível ÷ (1 − redução de dano).
 * - recurso: cada 1 de Fúria/Foco/Mana máximo vale 0,05 ponto.
 * - afixos: vida, dano, crítico, redução e recarga já entram pelos campos do equipamento; roubo de vida, queimadura,
 *   execução e dano crítico extra entram como um fator sobre o dano (ver statsDoPersonagem).
 * Com equipamento vazio, um Guerreiro nível 1 fica perto de 79 (≈38 de dano + ≈36 de vida + ≈5 de Fúria).
 */
export const PODER_PESOS = { dano: 2, vida: 0.3, recurso: 0.05 } as const;

export interface PoderStats { dano: number; vida: number; recurso: number }

/** Soma ponderada dos stats efetivos. Inteiro e determinístico (mesma entrada, mesmo número). */
export function poderTotal(s: PoderStats): number {
  return Math.round(s.dano * PODER_PESOS.dano + s.vida * PODER_PESOS.vida + s.recurso * PODER_PESOS.recurso);
}

/** Stats efetivos de um personagem com estes bônus de equipamento (o mesmo cálculo de gearBonuses + refreshStats). */
export function statsDoPersonagem(cls: CharClass, level: number, gear: GearBonuses): PoderStats {
  const lv = Math.max(1, level);
  // ataque básico como o servidor executa: kit da arma e recarga do equipamento ajustam a ação
  const act = effectiveAction(classAction(cls, "attack", 0), "attack", gear.kit, gear.cdr);
  const chance = Math.min(1, CRIT.chance + (gear.crit + (gear.kit.crit ?? 0)) / 100);
  const critMedio = 1 + chance * (CRIT.mult - 1);
  // afixos de dano por proc (roubo de vida, queimadura, execução, dano crítico extra): um fator simples sobre o dano
  const procs = 1 + (gear.af.lifesteal * 0.5 + gear.af.burnChance * 0.2 + gear.af.execute * 0.2 + gear.af.critDmg * 0.3 * chance) / 100;
  const dps = act.cd > 0 ? ((act.dmg ?? 0) * dmgMult(lv, gear.dmgPct) * critMedio * procs) / act.cd : 0;
  const vida = maxHpFor(cls, lv, gear.hp) * defenseMult(lv) / (1 - gear.dr / 100);
  const recurso = maxManaFor(cls, lv) + gear.mana;
  return { dano: dps, vida, recurso };
}

/** Poder total a partir do equipamento (mapa de slot → id do item). Item de outra classe não conta. */
export function poderDoEquipamento(cls: CharClass, level: number, equip: Record<EquipSlot, string | null>): number {
  return poderTotal(statsDoPersonagem(cls, level, gearBonuses(equip, cls)));
}
