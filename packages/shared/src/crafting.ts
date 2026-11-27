import { ITEMS, RARITIES, RARIDADES_CRAFT, SUFIXO_RARIDADE, WEAPON_TYPES, rarityIndex, type ItemDef, type Rarity } from "./items";
import type { CharClass } from "./index";
import { COIN_IRON, COIN_OBOL } from "./economy";

/**
 * CRAFT (Ferreira, aba "Craftar"). Itens épicos, lendários e míticos NÃO dropam: só saem por craft.
 * Toda receita sai DESTE arquivo (funções puras, sem sorteio): o servidor cobra e gera o item; o cliente só mostra.
 *
 *  - ARMA: uma receita padrão para TODAS as armas (qualquer família, qualquer raridade): 3 ingredientes + Tostões,
 *    e Óbolos de Sangue a partir do épico.
 *  - PEÇA DE SET (armadura, elmo, botas, capa) e SECUNDÁRIA (escudo, adaga, aljava, relicário, tomo, orbe): outra
 *    receita padrão, igual para todas. Um set = as 4 peças de set da classe na mesma raridade (= 4 × peça).
 *
 * Quantidade de ingrediente = base × MULT[raridade] (a mesma fórmula para todos os itens do mesmo tipo).
 * Óbolos vêm de uma tabela por raridade (épico poucos, mítico muitos).
 */

// ------------------------------------------------------------ ingredientes
export const MAT_FERRO = "mat_ferro_bruto";
export const MAT_COURO = "mat_couro_curtido";
export const MAT_ESSENCIA = "mat_essencia_arcana";
export const CRAFT_MATERIAIS: readonly string[] = [MAT_FERRO, MAT_COURO, MAT_ESSENCIA];

// Se a outra frente (drops/economia) já declarou os ingredientes em items.ts, vale a definição de lá (não duplica).
const MATERIAL_DEFS: Record<string, { name: string; desc: string }> = {
  [MAT_FERRO]: { name: "Ferro Bruto", desc: "Minério de ferro sem lavar. Ingrediente de craft." },
  [MAT_COURO]: { name: "Couro Curtido", desc: "Couro tratado com sal e casca. Ingrediente de craft." },
  [MAT_ESSENCIA]: { name: "Essência Arcana", desc: "Brilho frio colhido de runas quebradas. Ingrediente de craft." },
};
for (const [id, m] of Object.entries(MATERIAL_DEFS)) {
  if (!ITEMS[id]) ITEMS[id] = { id, name: m.name, kind: "material", rarity: "common", minLevel: 1, stack: 50, desc: m.desc } as ItemDef;
}

// ------------------------------------------------------------ tabelas (uma fórmula para cada tipo)
/** multiplicador por raridade (na ordem de RARITIES: lixo, comum, incomum, raro, épico, lendário, mítico, ancestral). Também pesa no custo do refino */
export const CRAFT_MULT = [1, 1, 2, 4, 7, 11, 16, 24];

/** base da receita de ARMA (multiplicada pela raridade) e Óbolos por raridade (fixos, não multiplicam) */
export const ARMA_BASE = { ferro: 3, couro: 2, essencia: 2, tostoes: 40 };
export const ARMA_OBOLOS = [0, 0, 0, 0, 2, 4, 8, 16];

/** base da receita de PEÇA (vale para armadura, elmo, botas, capa e secundária) e Óbolos por raridade */
export const PECA_BASE = { ferro: 2, couro: 2, essencia: 1, tostoes: 25 };
export const PECA_OBOLOS = [0, 0, 0, 0, 1, 2, 4, 8];

/** peças que formam um set (uma por slot de armadura da classe) */
export const PECAS_SET = ["armor", "helmet", "boots", "cape"] as const;
export type PecaSet = (typeof PECAS_SET)[number];
export type PecaCraft = PecaSet | "secundaria";
export const PECA_NOME: Record<PecaCraft, string> = { armor: "Armadura", helmet: "Elmo", boots: "Botas", cape: "Capa", secundaria: "Secundária" };
export const PECAS_CRAFT: readonly PecaCraft[] = [...PECAS_SET, "secundaria"];

// ------------------------------------------------------------ receitas
export interface Receita {
  item: string; // id do item que sai
  raridade: Rarity;
  minLevel: number; // nível mínimo do item
  mats: Record<string, number>; // ingrediente -> quantidade
  tostoes: number;
  obolos: number;
}

const multiplicador = (r: Rarity) => CRAFT_MULT[rarityIndex(r)];

function montar(item: string, r: Rarity, base: { ferro: number; couro: number; essencia: number; tostoes: number }, obolos: number[]): Receita {
  const m = multiplicador(r);
  return {
    item, raridade: r, minLevel: ITEMS[item].minLevel,
    mats: { [MAT_FERRO]: base.ferro * m, [MAT_COURO]: base.couro * m, [MAT_ESSENCIA]: base.essencia * m },
    tostoes: base.tostoes * m,
    obolos: obolos[rarityIndex(r)],
  };
}

export const isRaridadeCraft = (r: unknown): r is Rarity => typeof r === "string" && (RARIDADES_CRAFT as readonly string[]).includes(r);

/** Familias de arma de uma classe (ids de WEAPON_TYPES). */
export const familiasArma = (cls: CharClass): string[] => Object.values(WEAPON_TYPES).filter((t) => t.cls === cls).map((t) => t.id);

/** Familias de mão secundária de uma classe (derivadas dos itens: o id sem o sufixo de raridade). */
export function familiasSecundaria(cls: CharClass): string[] {
  const out = new Set<string>();
  for (const d of Object.values(ITEMS)) if (d.kind === "offhand" && d.cls === cls) out.add(familiaDoItem(d));
  return [...out];
}
const familiaDoItem = (d: ItemDef) => d.id.slice(0, d.id.length - d.rarity.length - 1);

/** Nome da família sem o sufixo de raridade ("Espada de Uma Mão Simples" -> "Espada de Uma Mão"). */
export function nomeFamilia(familia: string): string {
  const d = ITEMS[`${familia}_${RARITIES[0]}`];
  if (WEAPON_TYPES[familia]) return WEAPON_TYPES[familia].name;
  return d ? d.name.replace(new RegExp(` (${SUFIXO_RARIDADE.join("|")})$`), "") : familia;
}

/** Receita de UMA arma (qualquer família e raridade). null se a família ou a raridade não existem. */
export function receitaArma(familia: string, raridade: Rarity): Receita | null {
  if (!WEAPON_TYPES[familia] || !isRaridadeCraft(raridade)) return null;
  const item = `${familia}_${raridade}`;
  if (!ITEMS[item]) return null;
  return montar(item, raridade, ARMA_BASE, ARMA_OBOLOS);
}

/**
 * Receita de UMA peça de set (armadura, elmo, botas, capa) ou secundária (familia obrigatória).
 * Peças de set são do próprio `cls`; a secundária usa a família da classe.
 */
export function receitaPeca(peca: PecaCraft, raridade: Rarity, cls: CharClass, familia?: string): Receita | null {
  if (!isRaridadeCraft(raridade)) return null;
  let item: string;
  if (peca === "secundaria") {
    if (!familia || !familiasSecundaria(cls).includes(familia)) return null;
    item = `${familia}_${raridade}`;
  } else {
    if (!(PECAS_SET as readonly string[]).includes(peca)) return null;
    item = `${cls}_${peca}_${raridade}`;
  }
  if (!ITEMS[item]) return null;
  return montar(item, raridade, PECA_BASE, PECA_OBOLOS);
}

/** Um set completo (as 4 peças de set da classe, na mesma raridade). A soma das peças. */
export function receitaSet(cls: CharClass, raridade: Rarity): Receita[] {
  return PECAS_SET.map((p) => receitaPeca(p, raridade, cls)).filter((r): r is Receita => !!r);
}

// ------------------------------------------------------------ validações
/** Uma falta: o que a receita pede, o que o jogador tem. `id` é ingrediente ou moeda. */
export interface Falta { id: string; tem: number; precisa: number }

/**
 * Confere a receita contra o que o jogador tem. `tem(id)` devolve a quantidade de ingrediente na mochila.
 * Devolve só o que falta (lista vazia = pode craftar, falta só espaço, que o servidor confere).
 */
export function faltasReceita(r: Receita, tem: (id: string) => number, tostoes: number, obolos: number): Falta[] {
  const out: Falta[] = [];
  for (const [id, precisa] of Object.entries(r.mats)) {
    const t = tem(id);
    if (t < precisa) out.push({ id, tem: t, precisa });
  }
  if (tostoes < r.tostoes) out.push({ id: COIN_IRON.id, tem: tostoes, precisa: r.tostoes });
  if (obolos < r.obolos) out.push({ id: COIN_OBOL.id, tem: obolos, precisa: r.obolos });
  return out;
}

/** Progresso de um set: quantas das 4 peças o jogador já tem (na mochila ou equipadas). */
export function progressoSet(cls: CharClass, raridade: Rarity, possui: (itemId: string) => boolean) {
  const pecas = receitaSet(cls, raridade).map((r) => ({ item: r.item, nome: ITEMS[r.item].name, tem: possui(r.item) }));
  return { total: pecas.length, tem: pecas.filter((p) => p.tem).length, pecas };
}

/** Texto curto da receita para a mensagem de erro (PT-BR). */
export function nomeIngrediente(id: string): string {
  if (id === COIN_IRON.id) return "Tostões";
  if (id === COIN_OBOL.id) return "Óbolos de Sangue";
  return ITEMS[id]?.name ?? id;
}
