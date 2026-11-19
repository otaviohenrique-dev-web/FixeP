import { ITEMS, RARITIES, rarityIndex, type ItemKind, type Rarity } from "./items";
import { itemValue } from "./economy";
import type { CharClass } from "./index";

/**
 * Mercado dos jogadores (o leiloeiro). Inspirado no mercado do Albion Online:
 *  - o vendedor põe o item (ou uma pilha) à venda por um preço em Tostões de Ferro; o item sai da mochila e fica em CUSTÓDIA no servidor;
 *  - cobra-se só uma TAXA DE LISTAGEM (percentual do preço, não reembolsável); o resto do lucro é todo do vendedor (sem taxa de venda);
 *  - a listagem expira e o item volta; o dinheiro das vendas fica guardado até o vendedor recolher (mesmo que estivesse offline).
 */
export const MARKET_FEE_PCT = 4; // % do preço, cobrado ao listar e nunca devolvido (também desencoraja listagens-fantasma)
export const MARKET_DAYS = 7; // duração de uma listagem
export const MARKET_MAX_ACTIVE = 20; // listagens ativas por jogador
export const MARKET_MAX_OPEN = 40; // ativas + vendas ainda não recolhidas por jogador
export const MARKET_MIN_PRICE = 5; // preço total mínimo (tostões)
export const MARKET_MAX_PRICE = 99_999_999; // preço total máximo (tostões)
export const MARKET_PAGE = 8; // listagens por página
export const listingFee = (price: number) => Math.max(1, Math.ceil((price * MARKET_FEE_PCT) / 100));

export type MarketSort = "price_asc" | "price_desc" | "newest" | "rarity";
export const MARKET_SORTS: readonly MarketSort[] = ["price_asc", "price_desc", "newest", "rarity"];
export const MARKET_SORT_NAME: Record<MarketSort, string> = { price_asc: "Menor preço", price_desc: "Maior preço", newest: "Mais recentes", rarity: "Raridade" };

export interface MarketFilter {
  q?: string; // parte do nome
  cls?: CharClass | "all"; // classe do equipamento
  kind?: ItemKind | "all"; // tipo (arma, elmo, poção...)
  rarity?: Rarity | "all";
  minPrice?: number;
  maxPrice?: number;
  sort?: MarketSort;
  page?: number; // 0, 1, 2...
}
export interface MarketListing { id: string; itemId: string; qty: number; price: number; seller: string; expiresAt: number; mine: boolean }
export interface MarketPage { items: MarketListing[]; page: number; pages: number; total: number }
export type MyListingStatus = "active" | "sold" | "expired";
export interface MyListing { id: string; itemId: string; qty: number; price: number; fee: number; status: MyListingStatus; expiresAt: number; buyer?: string }
export interface MarketMineEvent { listings: MyListing[]; open: number; max: number }
export interface MarketDoneEvent { ok: boolean; text: string; kind: "list" | "buy" | "cancel" | "claim" }

const norm = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

/** Limpa e limita um filtro vindo do cliente (nunca confia: o servidor refaz tudo). */
export function cleanFilter(raw: unknown): Required<Pick<MarketFilter, "cls" | "kind" | "rarity" | "sort" | "page">> & { q: string; minPrice: number; maxPrice: number } {
  const r = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const pick = <T extends string>(v: unknown, ok: readonly T[], d: T): T => (typeof v === "string" && (ok as readonly string[]).includes(v) ? (v as T) : d);
  const price = (v: unknown, d: number) => (typeof v === "number" && Number.isFinite(v) ? Math.max(0, Math.min(MARKET_MAX_PRICE, Math.floor(v))) : d);
  const page = typeof r.page === "number" && Number.isFinite(r.page) ? Math.max(0, Math.min(500, Math.floor(r.page))) : 0;
  return {
    q: typeof r.q === "string" ? r.q.slice(0, 30) : "",
    cls: pick<CharClass | "all">(r.cls, ["all", "warrior", "archer", "cleric", "mage"], "all"),
    kind: pick<ItemKind | "all">(r.kind, ["all", "weapon", "offhand", "helmet", "armor", "boots", "cape", "potion"], "all"),
    rarity: pick<Rarity | "all">(r.rarity, ["all", ...RARITIES], "all"),
    minPrice: price(r.minPrice, 0),
    maxPrice: price(r.maxPrice, MARKET_MAX_PRICE),
    sort: pick(r.sort, MARKET_SORTS, "newest"),
    page,
  };
}

/** Ids de item que combinam com o filtro (o servidor consulta só esses; ordenados do mais raro ao mais comum para a ordenação por raridade). */
export function filterItemIds(f: ReturnType<typeof cleanFilter>): string[] {
  const q = norm(f.q.trim());
  return Object.values(ITEMS)
    .filter((d) => (f.cls === "all" || d.cls === f.cls) && (f.kind === "all" || d.kind === f.kind) && (f.rarity === "all" || d.rarity === f.rarity) && (!q || norm(d.name).includes(q)))
    .sort((a, b) => rarityIndex(b.rarity) - rarityIndex(a.rarity) || a.name.localeCompare(b.name, "pt"))
    .map((d) => d.id);
}

/** Preço de referência (valor médio x quantidade) que a UI sugere ao listar. */
export const suggestedPrice = (id: string, qty: number) => Math.max(MARKET_MIN_PRICE, itemValue(id) * qty);
