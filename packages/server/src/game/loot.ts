import { ITEMS, RARITIES, GEAR_CLASSES, COIN_IRON, COIN_OBOL, coinZone, mobIron, bossIron, sortearAfixos, rarityLiberada, mulDrop, mulTostoes, tabelaDrops, type CharClass, type Rarity, type ZoneDef, type ItemKind, type MaterialId } from "@frixep/shared";

export interface Drop { id: string; qty: number; af?: string[] } // af: afixos sorteados no drop (só equipamento)
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

/** Sorteia a raridade pela tabela da zona (raridade fora da tabela nunca sai: é o teto da zona).
 *  `origem` (`{ chefe: nível }` quando vem de baú de chefe): épico+ só é sorteado se `rarityLiberada` deixar (o dev mudou a regra: ver EPIC_PLUS_MIN_BOSS_LEVEL). */
export function pickRarity(weights: Partial<Record<Rarity, number>>, rng: Rng, origem: { chefe?: number } = {}): Rarity {
  return pickWeighted(RARITIES.flatMap((r) => (weights[r] && rarityLiberada(r, origem) ? [[r, weights[r]!] as [Rarity, number]] : [])), rng) ?? "common";
}

/** Sorteia um material de craft pela tabela da zona (pesos por material). */
export function pickMaterial(weights: Partial<Record<MaterialId, number>>, rng: Rng): MaterialId | null {
  return pickWeighted(Object.entries(weights).filter(([, w]) => (w ?? 0) > 0) as [MaterialId, number][], rng);
}

/** Sorteia um equipamento da raridade dada. Qualquer classe pode cair (a do jogador é só 1 entre 4): valoriza os drops da própria classe. */
export function pickGear(rarity: Rarity, rng: Rng): string {
  const kind = pickWeighted(SLOT_WEIGHTS, rng)!;
  const cls = GEAR_CLASSES[Math.floor(rng() * GEAR_CLASSES.length)];
  const pool = Object.values(ITEMS).filter((i) => i.kind === kind && i.rarity === rarity && i.cls === cls);
  return pool[Math.floor(rng() * pool.length)].id;
}

/** Um equipamento sorteado da raridade, já com os seus afixos (0 a 3, pela raridade; o servidor decide tudo). */
export function gearDrop(rarity: Rarity, rng: Rng): Drop {
  const id = pickGear(rarity, rng);
  return { id, qty: 1, af: sortearAfixos(ITEMS[id].kind, rarity, rng) };
}

/** Modo de teste da economia (ECON_TEST=1, só fora de produção): todo abate solta também uma sacola de tostões e um Óbolo. */
export const econTest = () => process.env.ECON_TEST === "1" && process.env.NODE_ENV !== "production";

/** O que um inimigo comum solta (chance de equipamento, poção e moedas baixas; a raridade respeita o teto da zona). `cls` só vale no modo de teste. */
export function rollMobLoot(zone: ZoneDef, rng: Rng = Math.random, cls: CharClass = "warrior", level = 1, kind = "skeleton"): Drop[] {
  if (testMode()) {
    // AFIXO_TEST=1 (só fora de produção): a arma de teste traz "afiado" e a armadura traz "vigor" (testa o caminho dos afixos)
    const afixoTest = process.env.AFIXO_TEST === "1";
    const t: Drop[] = [{ id: TEST_WEAPON[cls], qty: 1, ...(afixoTest ? { af: ["afiado"] } : {}) }, { id: `${cls}_armor_common`, qty: 1, ...(afixoTest ? { af: ["vigor"] } : {}) }, { id: "pocao_de_vida", qty: 2 }];
    if (econTest()) t.push({ id: COIN_IRON.id, qty: 25 }, { id: COIN_OBOL.id, qty: 1 });
    return t;
  }
  const out: Drop[] = [];
  const c = coinZone(zone.id);
  const dm = mulDrop(); // balanceamento ao vivo: multiplicador geral de drop (1 = padrão)
  const tm = mulTostoes(kind); // tostões deste tipo x geral (1 = padrão)
  if (rng() < c.bag) out.push({ id: COIN_IRON.id, qty: Math.max(1, Math.round(mobIron(level, rng) * (4 + rng() * 4) * tm)) }); // sacola de tostões
  if (rng() < c.obol) out.push({ id: COIN_OBOL.id, qty: 1 }); // Óbolo de Sangue: raríssimo
  if (rng() < Math.min(1, zone.drops.gear * dm)) out.push(gearDrop(pickRarity(zone.drops.weights, rng), rng));
  if (rng() < Math.min(1, zone.drops.potion * dm)) out.push({ id: "pocao_de_vida", qty: 1 });
  if (rng() < Math.min(1, zone.drops.material * dm)) { const m = pickMaterial(zone.drops.materials, rng); if (m) out.push({ id: m, qty: 1 }); } // material de craft: frequente
  // tabela de drops do tipo (balanceamento ao vivo): cada item tem a sua chance (%), quantidade min..max
  for (const e of tabelaDrops(kind)) {
    if (rng() * 100 >= Math.min(100, e.chance * dm)) continue;
    const qtd = e.min + Math.floor(rng() * (e.max - e.min + 1));
    const def = ITEMS[e.item];
    for (let i = 0; i < qtd; i++) {
      if (SLOT_WEIGHTS.some(([k]) => k === def.kind)) out.push({ id: e.item, qty: 1, af: sortearAfixos(def.kind, def.rarity, rng) });
      else out.push({ id: e.item, qty: 1 });
    }
  }
  return out;
}

/** Baú do chefe: `count` equipamentos; o primeiro é no mínimo da raridade `min`. Só aqui saem as raridades mais altas da zona. */
export function rollChestLoot(zone: ZoneDef, rng: Rng = Math.random, cls: CharClass = "warrior"): Drop[] {
  if (!zone.boss) return []; // a cidade segura não tem chefe
  const c = zone.boss.chest;
  if (testMode()) return [{ id: `${cls}_helmet_${c.min}`, qty: 1 }, { id: "pocao_de_vida", qty: 2 }, ...(econTest() ? [{ id: COIN_OBOL.id, qty: 1 }] : [])];
  const out: Drop[] = [{ id: COIN_IRON.id, qty: Math.round(bossIron(zone.boss.level, rng) * (1.5 + rng()) * mulTostoes(zone.boss.kind)) }]; // sacola grande do chefe
  if (rng() < coinZone(zone.id).bossObol) out.push({ id: COIN_OBOL.id, qty: 1 });
  for (let i = 0; i < c.count; i++) {
    let rar = pickRarity(c.weights, rng, { chefe: zone.boss.level });
    if (i === 0 && RARITIES.indexOf(rar) < RARITIES.indexOf(c.min)) rar = c.min;
    out.push(gearDrop(rar, rng));
  }
  out.push({ id: "pocao_de_vida", qty: 2 });
  return out;
}
