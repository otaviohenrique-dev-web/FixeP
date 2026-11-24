// ENGASTE (Ferreira, aba "Engastar", C3.3 da Trilha Cru): gemas encaixadas em espaços de um equipamento.
// Cada gema soma num stat principal do item (arma: dano; defesa: vida). Versão crua: 1 tipo de gema por stat principal.
// Custo em Óbolos de Sangue por gema engastada. Remover uma gema libera o espaço; a gema é PERDIDA (versão simples).
// Funções PURAS: o servidor confere e grava; o cliente só mostra.
import type { ItemKind, Rarity } from "./items"; // só tipo: items.ts importa daqui (sem ciclo em tempo de execução)

export interface GemaDef {
  id: string;
  nome: string; // PT-BR
  /** stat principal que a gema soma: "dmgPct" (armas) ou "hp" (peças de defesa) */
  stat: "dmgPct" | "hp";
  /** quanto cada gema soma no stat */
  valor: number;
  /** tipos de equipamento que aceitam esta gema */
  kinds: readonly ItemKind[];
  /** custo em Óbolos de Sangue para engastar uma gema */
  obolos: number;
}

const ARMAS: readonly ItemKind[] = ["weapon", "offhand"];
const DEFESA: readonly ItemKind[] = ["helmet", "armor", "boots", "cape"];

/** As gemas do jogo: uma por stat principal (versão crua; valores a balancear depois). */
export const GEMAS: readonly GemaDef[] = [
  { id: "forca", nome: "Gema de Força", stat: "dmgPct", valor: 3, kinds: ARMAS, obolos: 1 },
  { id: "vida", nome: "Gema de Vida", stat: "hp", valor: 12, kinds: DEFESA, obolos: 1 },
];

export const GEMA_BY_ID: Record<string, GemaDef> = Object.fromEntries(GEMAS.map((g) => [g.id, g]));

/** Espaço máximo de gemas num único item (mesmo com arma de raridade alta). */
export const MAX_ESPACOS = 4;

/** Espaços de um equipamento por raridade (comum não é engastável). Arma e mão secundária ganham +1 (até MAX_ESPACOS). */
const ESPACOS_RARIDADE: Partial<Record<Rarity, number>> = { uncommon: 1, rare: 1, epic: 2, legendary: 2, mythic: 3, ancestral: 3 };
const KINDS_ENGASTAVEIS: readonly ItemKind[] = [...ARMAS, ...DEFESA];

/** Quantos espaços de gema tem este item? 0 para o que não é equipamento ou para comum. */
export function espacosDe(kind: ItemKind, rarity: Rarity): number {
  if (!KINDS_ENGASTAVEIS.includes(kind)) return 0;
  const base = ESPACOS_RARIDADE[rarity] ?? 0;
  if (!base) return 0;
  return Math.min(MAX_ESPACOS, base + (ARMAS.includes(kind) ? 1 : 0));
}

/** Id de gema válido? */
export const gemaValida = (id: unknown): id is string => typeof id === "string" && !!GEMA_BY_ID[id];

/** Gemas válidas vindas do banco ou do cliente: só ids conhecidos, sem repetir o mesmo espaço além do que o item tem. */
export function gemasValidas(v: unknown, kind: ItemKind, rarity: Rarity): string[] {
  if (!Array.isArray(v)) return [];
  const espacos = espacosDe(kind, rarity);
  const out: string[] = [];
  for (const g of v) {
    if (out.length >= espacos) break;
    if (gemaValida(g) && GEMA_BY_ID[g].kinds.includes(kind)) out.push(g);
  }
  return out;
}

/** Soma o bônus das gemas engastadas no item (zero se não houver gema ou o tipo não aceitar). */
export function bonusGemas(gemas: readonly string[] | undefined, kind: ItemKind): { dmgPct: number; hp: number } {
  const b = { dmgPct: 0, hp: 0 };
  for (const id of gemas ?? []) {
    const g = GEMA_BY_ID[id];
    if (g && g.kinds.includes(kind)) b[g.stat] += g.valor;
  }
  return b;
}

/** Custo em Óbolos para engastar esta gema (0 se a gema não existe). */
export const custoEngaste = (gema: string): number => GEMA_BY_ID[gema]?.obolos ?? 0;
