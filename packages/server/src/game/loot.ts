import { ITEMS, type CharClass, type Rarity } from "@frixep/shared";

export interface Drop { id: string; qty: number }

// LOOT_TEST=1 (só fora de produção) faz todo esqueleto soltar sempre os mesmos itens: usado nos testes automatizados.
const testMode = () => process.env.LOOT_TEST === "1" && process.env.NODE_ENV !== "production";

const RARITY_WEIGHTS: [Rarity, number][] = [["common", 70], ["uncommon", 25], ["rare", 5]];
export const GEAR_CHANCE = 0.3;
export const POTION_CHANCE = 0.35;

function pickRarity(rng: () => number, mult = 1): Rarity {
  const w = RARITY_WEIGHTS.map(([rar, x]) => [rar, x * (rar === "common" ? 1 : rar === "uncommon" ? mult : mult * mult)] as [Rarity, number]);
  let r = rng() * w.reduce((a, [, x]) => a + x, 0);
  for (const [rar, x] of w) if ((r -= x) < 0) return rar;
  return "common";
}

/** Sorteia o que um esqueleto solta. */
const TEST_WEAPON: Record<CharClass, string> = { warrior: "espada_enferrujada", archer: "arco_curto", cleric: "cajado_de_galho", mage: "cajado_de_aprendiz" };

/** Sorteia o que um esqueleto solta para um jogador. Armas saem só da classe dele; armaduras e poções servem a todos. */
/** `lootMult` (da zona): zonas mais perigosas dão mais itens, raridades melhores e, nas mais fundas, poções em dobro. */
export function rollLoot(cls: CharClass = "warrior", rng: () => number = Math.random, lootMult = 1): Drop[] {
  if (testMode()) return [{ id: TEST_WEAPON[cls], qty: 1 }, { id: "gibao_surrado", qty: 1 }, { id: "pocao_de_vida", qty: 2 }];
  const out: Drop[] = [];
  if (rng() < Math.min(0.9, GEAR_CHANCE * lootMult)) {
    const rar = pickRarity(rng, lootMult);
    const pool = Object.values(ITEMS).filter(
      (i) => (i.kind === "weapon" || i.kind === "armor") && i.rarity === rar && (!i.cls || i.cls === cls),
    );
    if (pool.length) out.push({ id: pool[Math.floor(rng() * pool.length)].id, qty: 1 });
  }
  if (rng() < Math.min(0.9, POTION_CHANCE * lootMult)) out.push({ id: "pocao_de_vida", qty: lootMult >= 2 ? 2 : 1 });
  return out;
}
