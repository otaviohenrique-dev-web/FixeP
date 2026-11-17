import { ITEMS, type CharClass, type Rarity } from "@frixep/shared";

export interface Drop { id: string; qty: number }

// LOOT_TEST=1 (só fora de produção) faz todo esqueleto soltar sempre os mesmos itens: usado nos testes automatizados.
const testMode = () => process.env.LOOT_TEST === "1" && process.env.NODE_ENV !== "production";

const RARITY_WEIGHTS: [Rarity, number][] = [["common", 70], ["uncommon", 25], ["rare", 5]];
export const GEAR_CHANCE = 0.3;
export const POTION_CHANCE = 0.35;

function pickRarity(rng: () => number): Rarity {
  let r = rng() * 100;
  for (const [rar, w] of RARITY_WEIGHTS) if ((r -= w) < 0) return rar;
  return "common";
}

/** Sorteia o que um esqueleto solta. */
const TEST_WEAPON: Record<CharClass, string> = { warrior: "espada_enferrujada", archer: "arco_curto", cleric: "cajado_de_galho" };

/** Sorteia o que um esqueleto solta para um jogador. Armas saem só da classe dele; armaduras e poções servem a todos. */
export function rollLoot(cls: CharClass = "warrior", rng: () => number = Math.random): Drop[] {
  if (testMode()) return [{ id: TEST_WEAPON[cls], qty: 1 }, { id: "gibao_surrado", qty: 1 }, { id: "pocao_de_vida", qty: 2 }];
  const out: Drop[] = [];
  if (rng() < GEAR_CHANCE) {
    const rar = pickRarity(rng);
    const pool = Object.values(ITEMS).filter(
      (i) => (i.kind === "weapon" || i.kind === "armor") && i.rarity === rar && (!i.cls || i.cls === cls),
    );
    if (pool.length) out.push({ id: pool[Math.floor(rng() * pool.length)].id, qty: 1 });
  }
  if (rng() < POTION_CHANCE) out.push({ id: "pocao_de_vida", qty: 1 });
  return out;
}
