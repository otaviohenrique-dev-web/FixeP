// DESMONTAR (Ferreira, aba "Desmontar", C3.5 da Trilha Cru): transforma um equipamento da mochila em materiais de craft.
// Regra PADRÃO e ÚNICA por raridade (sem sorteio): quanto mais rara, mais material. Funções PURAS: o servidor
// confere e troca o item; o cliente só mostra.
//
//  - Quantidade por raridade (ferro, couro, essência), de comum a mítico. Sempre MENOR que o custo de craft do
//    mesmo tipo (ver crafting.ts: craft gasta base × CRAFT_MULT[raridade]), então craft → desmontar nunca dá lucro.
//  - Item refinado (+N) devolve um pouco mais de Ferro Bruto: floor(N / 2). Refinar já custa material, então o bônus é pequeno.
//  - Só equipamento refinável (arma, mão secundária, elmo, armadura, botas, capa). Poção e material não desmontam.
//  - Raridade rara ou maior pede confirmação (o cliente mostra o aviso; o servidor exige `confirm: true`).
import { ITEMS, rarityIndex, type Rarity } from "./items";
import { MAT_FERRO, MAT_COURO, MAT_ESSENCIA } from "./crafting";
import { isRefinavel } from "./refino";
import { refinoValido } from "./refino_stats";

/** índice (em RARITIES) a partir do qual desmontar pede confirmação: raro = 2 */
export const DESMONTAR_CONFIRM_FROM = 2;

/** material devolvido por raridade, na ordem de RARITIES: comum, incomum, raro, épico, lendário, mítico */
export const DESMONTAR_MATS: readonly { ferro: number; couro: number; essencia: number }[] = [
  { ferro: 1, couro: 0, essencia: 0 }, // comum
  { ferro: 1, couro: 1, essencia: 0 }, // incomum
  { ferro: 2, couro: 1, essencia: 1 }, // raro
  { ferro: 3, couro: 2, essencia: 1 }, // épico
  { ferro: 4, couro: 3, essencia: 2 }, // lendário
  { ferro: 6, couro: 4, essencia: 2 }, // mítico
];

/** Bônus de Ferro Bruto de um item refinado: +1 a cada 2 níveis de refino. */
export const bonusDesmonteRefino = (rf: number): number => Math.floor(refinoValido(rf) / 2);

/** Materiais que um item rende ao ser desmontado. null = item não desmontável (não é equipamento ou não existe). */
export function materiaisDesmonte(itemId: string, rf = 0): Record<string, number> | null {
  const def = ITEMS[itemId];
  if (!def || !isRefinavel(def.kind, def.rarity)) return null;
  const base = DESMONTAR_MATS[rarityIndex(def.rarity)];
  if (!base) return null;
  const out: Record<string, number> = { [MAT_FERRO]: base.ferro + bonusDesmonteRefino(rf) };
  if (base.couro > 0) out[MAT_COURO] = base.couro;
  if (base.essencia > 0) out[MAT_ESSENCIA] = base.essencia;
  return out;
}

/** Pede confirmação ao desmontar? (raridade rara ou maior) */
export const precisaConfirmarDesmonte = (raridade: Rarity): boolean => rarityIndex(raridade) >= DESMONTAR_CONFIRM_FROM;
