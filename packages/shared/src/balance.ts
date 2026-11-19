import { CLASS_DEFS, classAction, type ActionDef, type ActionId, type CharClass } from "./index";

/**
 * Estimativa de DPS por classe (nível 1, sem equipamento), usada nos testes e na tabela do README.
 * Simula `seconds` de luta com a rotação "gananciosa": a cada passo usa a ação mais forte pronta (R, E, W, Q) se o recurso paga;
 * o ataque básico sai sempre que está pronto. Considera a regeneração do recurso da classe.
 * Alvo único = 1 inimigo; área = `AOE_TARGETS` inimigos agrupados (cada tipo de ação acerta uma parte deles, veja `hitsFor`).
 */
export const AOE_TARGETS = 5;
const PRIORITY: ActionId[] = ["ultimate", "skill3", "skill2", "skill1", "attack"];

/** quantos dos alvos agrupados uma ação acerta: área total, linha (3), golpe curto (2) ou um só */
export function hitsFor(d: ActionDef, targets: number): number {
  if (targets <= 1) return 1;
  switch (d.kind) {
    case "ring": case "rain": case "blast": case "trap": return targets;
    case "dashHit": return Math.min(3, targets);
    case "projectile": return d.pierce ? Math.min(3, targets) : 1;
    case "melee": return Math.min(2, targets);
    default: return 1;
  }
}

export interface DpsEstimate { single: number; aoe: number }

export function estimateDps(cls: CharClass, seconds = 120, dt = 0.05): DpsEstimate {
  const c = CLASS_DEFS[cls];
  const run = (targets: number) => {
    let res = c.resource.max, total = 0;
    const next: Partial<Record<ActionId, number>> = {};
    for (let t = 0; t < seconds; t += dt) {
      res = Math.min(c.resource.max, res + c.resource.regen * dt);
      for (const a of PRIORITY) {
        const d = classAction(cls, a, 0);
        if (!d.dmg || t < (next[a] ?? 0)) continue;
        const cost = d.cost ?? 0;
        if (res < cost) continue;
        res -= cost;
        next[a] = t + d.cd;
        total += d.dmg * hitsFor(d, targets);
      }
    }
    return total / seconds;
  };
  return { single: run(1), aoe: run(AOE_TARGETS) };
}
