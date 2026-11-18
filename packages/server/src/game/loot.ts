import { ITEMS, RARITIES, GEAR_CLASSES, type CharClass, type Rarity, type ZoneDef, type ItemKind } from "@frixep/shared";

export interface Drop { id: string; qty: number }
export type Rng = () => number;

// LOOT_TEST=1 (só fora de produção) faz todo abate soltar sempre os mesmos itens: usado nos testes automatizados.
const testMode = () => process.env.LOOT_TEST === "1" && process.env.NODE_ENV !== "production";

/** Peso de cada tipo de equipamento num drop: armas saem pouco, o resto divide o restante. */
const SLOT_WEIGHTS: [ItemKind, number][] = [["weapon", 18], ["offhand", 10], ["armor", 22], ["helmet", 17], ["boots", 17], ["cape", 16]];

const TEST_WEAPON: Record<CharClass, string> = { warrior: "espada_1m_common", archer: "arco_curto_common", cleric: "cetro_common", mage: "varinha_common" };

const pickWeighted = <T,>(entries: [T, number][], rng: Rng): T | null => {
  const total = entries.reduce((a, [, w]) => a + w, 0);
  if (total <= 0) return null;
  let r = rng() * total;
  for (const [v, w] of entries) if ((r -= w) < 0) return v;
  return entries[entries.length - 1][0];
};

/** Sorteia a raridade pela tabela da zona (raridade fora da tabela nunca sai: é o teto da zona). */
export function pickRarity(weights: Partial<Record<Rarity, number>>, rng: Rng): Rarity {
  return pickWeighted(RARITIES.flatMap((r) => (weights[r] ? [[r, weights[r]!] as [Rarity, number]] : [])), rng) ?? "common";
}

/** Sorteia um equipamento da raridade dada. Qualquer classe pode cair (a do jogador é só 1 entre 4): valoriza os drops da própria classe. */
export function pickGear(rarity: Rarity, rng: Rng): string {
  const kind = pickWeighted(SLOT_WEIGHTS, rng)!;
  const cls = GEAR_CLASSES[Math.floor(rng() * GEAR_CLASSES.length)];
  const pool = Object.values(ITEMS).filter((i) => i.kind === kind && i.rarity === rarity && i.cls === cls);
  return pool[Math.floor(rng() * pool.length)].id;
}

/** O que um inimigo comum solta (chance de equipamento e de poção baixas; a raridade respeita o teto da zona). `cls` só vale no modo de teste. */
export function rollMobLoot(zone: ZoneDef, rng: Rng = Math.random, cls: CharClass = "warrior"): Drop[] {
  if (testMode()) return [{ id: TEST_WEAPON[cls], qty: 1 }, { id: `${cls}_armor_common`, qty: 1 }, { id: "pocao_de_vida", qty: 2 }];
  const out: Drop[] = [];
  if (rng() < zone.drops.gear) out.push({ id: pickGear(pickRarity(zone.drops.weights, rng), rng), qty: 1 });
  if (rng() < zone.drops.potion) out.push({ id: "pocao_de_vida", qty: 1 });
  return out;
}

/** Baú do chefe: `count` equipamentos; o primeiro é no mínimo da raridade `min`. Só aqui saem as raridades mais altas da zona. */
export function rollChestLoot(zone: ZoneDef, rng: Rng = Math.random, cls: CharClass = "warrior"): Drop[] {
  const c = zone.boss.chest;
  if (testMode()) return [{ id: `${cls}_helmet_${c.min}`, qty: 1 }, { id: "pocao_de_vida", qty: 2 }];
  const out: Drop[] = [];
  for (let i = 0; i < c.count; i++) {
    let rar = pickRarity(c.weights, rng);
    if (i === 0 && RARITIES.indexOf(rar) < RARITIES.indexOf(c.min)) rar = c.min;
    out.push({ id: pickGear(rar, rng), qty: 1 });
  }
  out.push({ id: "pocao_de_vida", qty: 2 });
  return out;
}
