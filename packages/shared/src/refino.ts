// REFINO (Ferreira, aba "Refinar", C3.2 da Trilha Cru): +1 a +N num equipamento, com Tostões e material.
// NUNCA quebra o item: não há sorteio nem chance de falha. Funções PURAS: o servidor cobra e grava; o cliente só mostra.
// Nível máximo e bônus de stat: refino_stats.ts (módulo folha, usado por items.ts).
//
//  - Custo do passo para o nível d (de d-1 para d), por raridade:
//      Tostões = REFINO_TOSTOES_BASE × d × CRAFT_MULT[raridade]
//      Ferro Bruto = d
//      Essência Arcana = d, só a partir do épico
import { rarityIndex, type ItemKind, type Rarity } from "./items";
import { CRAFT_MULT, MAT_FERRO, MAT_ESSENCIA, faltasReceita, type Falta, type Receita } from "./crafting";
import { MAX_REFINO, refinoValido } from "./refino_stats";

export const REFINO_TOSTOES_BASE = 20;
/** a partir desta raridade (índice em RARITIES: épico = 4) o passo também pede Essência Arcana */
const REFINO_ESSENCIA_A_PARTIR = 4;

/** Tipos de item que podem ser refinados: todo equipamento (arma, mão secundária, elmo, armadura, botas, capa). */
const REFINAVEIS: readonly ItemKind[] = ["weapon", "offhand", "helmet", "armor", "boots", "cape"];

export interface CustoRefino { tostoes: number; mats: Record<string, number> }

/** Pode refinar este item? (só equipamento; poção e material não). */
export function isRefinavel(kind: ItemKind, rarity: Rarity): boolean {
  return REFINAVEIS.includes(kind) && rarityIndex(rarity) >= 0;
}

/** Custo para subir o item do nível atual para o próximo. null = já está no máximo ou o item não é refinável. */
export function custoRefino(nivelAtual: number, kind: ItemKind, rarity: Rarity): CustoRefino | null {
  if (!isRefinavel(kind, rarity)) return null;
  const atual = refinoValido(nivelAtual);
  if (atual >= MAX_REFINO) return null;
  const d = atual + 1;
  const idx = rarityIndex(rarity);
  const mats: Record<string, number> = { [MAT_FERRO]: d };
  if (idx >= REFINO_ESSENCIA_A_PARTIR) mats[MAT_ESSENCIA] = d;
  return { tostoes: REFINO_TOSTOES_BASE * d * CRAFT_MULT[idx], mats };
}

/** Faltas para pagar o custo (reusa a conferência de receitas do craft: ingredientes e Tostões). */
export function faltasRefino(c: CustoRefino, tem: (id: string) => number, tostoes: number): Falta[] {
  const r: Receita = { item: "", raridade: "common", minLevel: 0, mats: c.mats, tostoes: c.tostoes, obolos: 0 };
  return faltasReceita(r, tem, tostoes, 0);
}

/** Rótulo do nível para o tooltip e a lista: "+3", ou "" se não refinado. */
export const rotuloRefino = (nivel: number): string => (refinoValido(nivel) > 0 ? `+${refinoValido(nivel)}` : "");
