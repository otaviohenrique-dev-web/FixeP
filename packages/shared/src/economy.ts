import { ITEMS, RARITIES, rarityIndex, type ItemDef, type Rarity, type ItemKind } from "./items";
import { ZONES } from "./zones";
import type { CharClass } from "./index";

/**
 * Economia (tema Submundo & Morte). Tudo aqui é definição compartilhada: o servidor decide e cobra; o cliente só mostra os mesmos números.
 *  - Tostões de Ferro: a moeda comum (disco de ferro escuro e fosco). Caem de inimigos, chefes e sacolas no chão.
 *  - Óbolos de Sangue: a moeda VIP (moeda antiga com runa vermelha). Raríssima: só chefes e um drop minúsculo de inimigos.
 */
export const COIN_IRON = { id: "coin_iron", name: "Tostões de Ferro", short: "Tostões", color: "#9aa0ab" } as const;
export const COIN_OBOL = { id: "coin_obol", name: "Óbolos de Sangue", short: "Óbolos", color: "#ff4a3a" } as const;
/** Teto de cada saldo (cabe no inteiro do banco). */
export const MAX_COINS = 999_999_999;
export type CoinKind = "iron" | "obols";
export const isCoinItem = (id: string) => id === COIN_IRON.id || id === COIN_OBOL.id;
export const coinName = (id: string, qty: number) => (id === COIN_OBOL.id ? `${qty} ${qty === 1 ? "Óbolo" : "Óbolos"} de Sangue` : `${qty} Tostões`);

// ------------------------------------------------------------ preço médio de mercado
const VALUE_BASE = [12, 45, 170, 650, 2800, 13000]; // por raridade (tostões)
const VALUE_KIND: Partial<Record<ItemKind, number>> = { weapon: 1.4, offhand: 0.8, helmet: 0.8, armor: 1.2, boots: 0.7, cape: 0.7 };
export const POTION_VALUE = 10;
/** Preço médio de mercado de um item: raridade x tipo x nível exigido. */
export function itemValue(def: ItemDef | string | undefined): number {
  const d = typeof def === "string" ? ITEMS[def] : def;
  if (!d) return 0;
  if (d.kind === "potion") return POTION_VALUE;
  return Math.max(1, Math.round(VALUE_BASE[rarityIndex(d.rarity)] * (VALUE_KIND[d.kind] ?? 1) * (1 + d.minLevel * 0.015)));
}
export const BUY_MULT = 1.4; // o comerciante vende acima do preço médio
export const SELL_MULT = 0.35; // e compra abaixo dele
export const BREAK_MULT = 0.12; // quebrar rende pouco (menos que vender)
export const buyPrice = (id: string) => Math.max(1, Math.ceil(itemValue(id) * BUY_MULT));
export const sellPrice = (id: string) => Math.max(1, Math.floor(itemValue(id) * SELL_MULT));
export const breakValue = (id: string) => Math.max(1, Math.floor(itemValue(id) * BREAK_MULT));
/** Itens que se pode quebrar: só equipamento (poção se vende). */
export const canBreak = (id: string) => !!ITEMS[id] && ITEMS[id].kind !== "potion";
/** Raridade a partir da qual o jogo exige confirmação ao quebrar (1 = incomum... 2 = rara em diante) e a "forte" (épico em diante). */
export const BREAK_CONFIRM_FROM = 2;
export const BREAK_STRONG_FROM = 3;

// ------------------------------------------------------------ recompensas de abate
/** Tostões que o abate de um inimigo de nível `level` dá (a todos que estavam por perto, como o XP). */
export const mobIron = (level: number, rng: () => number = Math.random) => Math.max(1, Math.round((2 + 1.5 * level) * (0.8 + 0.4 * rng())));
export const bossIron = (level: number, rng: () => number = Math.random) => Math.round((40 + 25 * level) * (0.9 + 0.2 * rng()));
/** Chances de moeda no chão por zona: sacola de tostões (por abate) e Óbolo de Sangue (inimigo comum / chefe). */
export const ZONE_COINS: Record<number, { bag: number; obol: number; bossObol: number }> = {
  1: { bag: 0.1, obol: 0.0004, bossObol: 0.08 },
  2: { bag: 0.12, obol: 0.0006, bossObol: 0.12 },
  3: { bag: 0.15, obol: 0.001, bossObol: 0.18 },
};
export const coinZone = (zoneId: number) => ZONE_COINS[zoneId] ?? ZONE_COINS[1];

// ------------------------------------------------------------ NPCs
export type NpcKind = "merchant" | "smith" | "auctioneer";
export interface NpcDef { id: string; kind: NpcKind; name: string; title: string; x: number; y: number }
/** Distância (tiles) até o NPC para conversar, comprar, vender e fundir. O servidor valida a cada pedido. */
export const NPC_REACH = 3.5;
const npcPair = (mx: number, my: number, sx: number, sy: number, ax: number, ay: number): NpcDef[] => [
  { id: "merchant", kind: "merchant", name: "Garrick", title: "Comerciante", x: mx, y: my },
  { id: "smith", kind: "smith", name: "Brasa", title: "Ferreira", x: sx, y: sy },
  { id: "auctioneer", kind: "auctioneer", name: "Ossian", title: "Leiloeiro", x: ax, y: ay },
];
/** Os NPCs de ofício ficam só na cidade segura (zona 4), na praça: comerciante à esquerda da fonte, ferreira à direita. */
export const ZONE_NPCS: Record<number, NpcDef[]> = {
  4: npcPair(19, 24, 29, 24, 24, 18.5),
};
export const zoneNpcs = (zoneId: number): NpcDef[] => ZONE_NPCS[zoneId] ?? [];

// ------------------------------------------------------------ comerciante
/** O que o comerciante vende a uma classe: poção e o equipamento dela só COMUM e INCOMUM (raro para cima vem de drops, chefes, forja e mercado de jogadores: isso valoriza o drop). */
export const SHOP_MAX_RARITY: Rarity = "uncommon";
export function shopStock(cls: CharClass): string[] {
  const out = ["pocao_de_vida"];
  const cap = rarityIndex(SHOP_MAX_RARITY);
  const order: ItemKind[] = ["weapon", "offhand", "helmet", "armor", "boots", "cape"];
  const items = Object.values(ITEMS).filter((i) => i.cls === cls && rarityIndex(i.rarity) <= cap);
  items.sort((a, b) => order.indexOf(a.kind) - order.indexOf(b.kind) || rarityIndex(a.rarity) - rarityIndex(b.rarity) || a.name.localeCompare(b.name, "pt"));
  for (const i of items) out.push(i.id);
  return out;
}

// ------------------------------------------------------------ ferreira: fusão
export const MERGE_COUNT = 3; // itens iguais (mesmo tipo, raridade e classe) por fusão
/** Chance de sucesso ao subir DE cada raridade (comum->incomum ... lendário->mítico). */
export const MERGE_CHANCE = [1, 0.85, 0.65, 0.45, 0.25];
/** Família do item = id sem o sufixo da raridade (ex.: "montante_epic" -> "montante"). */
export const itemFamily = (id: string) => (ITEMS[id] ? id.slice(0, id.length - ITEMS[id].rarity.length - 1) : id);
export const nextRarity = (r: Rarity): Rarity | null => RARITIES[rarityIndex(r) + 1] ?? null;
/** Raridade máxima que a zona deixa existir (a maior da tabela do baú do chefe): é o teto da fusão na forja daquela zona. */
export function zoneRarityCap(zoneId: number): Rarity {
  // a forja agora fica na cidade segura (sem drops próprios): lá o teto é o do mundo inteiro
  const zs = ZONES[zoneId]?.safe ? Object.values(ZONES) : ZONES[zoneId] ? [ZONES[zoneId]] : [];
  let max = 0;
  for (const z of zs) for (const w of [z.drops.weights, ...(z.boss ? [z.boss.chest.weights] : [])]) for (const r of Object.keys(w) as Rarity[]) max = Math.max(max, rarityIndex(r));
  return RARITIES[max];
}
/** Custo em tostões da fusão que produz um item de raridade `to` do tipo `kind`. */
export const mergeFee = (kind: ItemKind, to: Rarity) => Math.round(VALUE_BASE[rarityIndex(to)] * (VALUE_KIND[kind] ?? 1) * 0.3);
export const mergeChance = (from: Rarity) => MERGE_CHANCE[rarityIndex(from)] ?? 0;

export type MergeCheck = { ok: true; kind: ItemKind; cls: CharClass; from: Rarity; to: Rarity; fee: number; chance: number; families: string[] } | { ok: false; error: string };
/** Valida um conjunto de ids para fundir (usado pelo servidor e pelo cliente, que só mostra o resultado). */
export function checkMerge(ids: string[], zoneId: number): MergeCheck {
  if (ids.length !== MERGE_COUNT) return { ok: false, error: `Escolha ${MERGE_COUNT} itens.` };
  const defs = ids.map((i) => ITEMS[i]);
  if (defs.some((d) => !d || d.kind === "potion")) return { ok: false, error: "Só equipamentos podem ser fundidos." };
  const a = defs[0];
  if (defs.some((d) => d.kind !== a.kind || d.rarity !== a.rarity || d.cls !== a.cls)) return { ok: false, error: "Os itens precisam ser do mesmo tipo, raridade e classe." };
  const to = nextRarity(a.rarity);
  if (!to) return { ok: false, error: "Esse item já está na raridade máxima." };
  if (rarityIndex(to) > rarityIndex(zoneRarityCap(zoneId))) return { ok: false, error: "A forja desta zona não alcança essa raridade (teto da zona)." };
  const families = [...new Set(ids.map(itemFamily))].filter((f) => !!ITEMS[`${f}_${to}`]);
  if (!families.length) return { ok: false, error: "Não há resultado para esses itens." };
  return { ok: true, kind: a.kind, cls: a.cls!, from: a.rarity, to, fee: mergeFee(a.kind, to), chance: mergeChance(a.rarity), families };
}
