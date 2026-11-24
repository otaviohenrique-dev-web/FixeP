// REFINO: nível máximo e bônus de stat por nível. MÓDULO FOLHA (sem import em tempo de execução): items.ts usa
// `bonusRefino` dentro de gearBonuses, e refino.ts importa crafting.ts (que lê ITEMS ao carregar). Por isso a
// ordem das raridades é copiada aqui, como em afixos.ts, e nada daqui volta para items.ts.
import type { ItemKind, Rarity } from "./items";

/** Ordem das raridades de equipamento (cópia de RARITIES de items.ts, para não criar ciclo). */
const ORDEM: readonly Rarity[] = ["common", "uncommon", "rare", "epic", "legendary", "mythic"];

/** Nível máximo de refino (+N), igual para todas as raridades. */
export const MAX_REFINO = 5;

/** Nível de refino válido vindo do banco ou do cliente: inteiro de 0 a MAX_REFINO (qualquer outro vira 0). */
export function refinoValido(n: unknown): number {
  const v = Number(n);
  return Number.isInteger(v) && v > 0 ? Math.min(MAX_REFINO, v) : 0;
}

/**
 * Bônus de stat de um item refinado até `nivel` (zero se não refinado):
 *  - arma e mão secundária: +dmgPct = nível × (1 + índice da raridade);
 *  - defesa (elmo, armadura, botas, capa): +hp = nível × (3 + 2 × índice da raridade).
 */
export function bonusRefino(nivel: number, kind: ItemKind, rarity: Rarity): { dmgPct: number; hp: number } {
  const n = refinoValido(nivel);
  const idx = Math.max(0, ORDEM.indexOf(rarity));
  if (n === 0) return { dmgPct: 0, hp: 0 };
  if (kind === "weapon" || kind === "offhand") return { dmgPct: n * (1 + idx), hp: 0 };
  if (kind === "helmet" || kind === "armor" || kind === "boots" || kind === "cape") return { dmgPct: 0, hp: n * (3 + 2 * idx) };
  return { dmgPct: 0, hp: 0 };
}
