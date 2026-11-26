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
export const MARKET_MIN_PRICE = 25; // piso absoluto (nas duas moedas): com 4% a taxa é exatamente 1, então a % cobrada é fiel
export const MARKET_MAX_PRICE = 99_999_999; // preço total máximo (tostões)
export type MarketCurrency = "iron" | "obols";
/** Qualquer item pode ser vendido em Tostões ou em Óbolos de Sangue (a moeda rara: ideal para itens míticos e lendários). Limites de preço total por moeda. */
export const MARKET_PRICE: Record<MarketCurrency, { min: number; max: number }> = { iron: { min: MARKET_MIN_PRICE, max: MARKET_MAX_PRICE }, obols: { min: MARKET_MIN_PRICE, max: 99_999 } };
/** Preço mínimo de um item = metade do valor médio de mercado (x quantidade), nunca abaixo do piso: vender mais barato que isso nem cobriria a taxa e o comerciante já paga ~35%. */
export const MARKET_MIN_RATIO = 0.5;
export const minListingPrice = (id: string, qty: number, cur: MarketCurrency = "iron") =>
  cur === "obols" ? MARKET_PRICE.obols.min : Math.max(MARKET_PRICE.iron.min, Math.ceil(itemValue(id) * Math.max(1, qty) * MARKET_MIN_RATIO));
export const MARKET_CURRENCY_NAME: Record<MarketCurrency, string> = { iron: "Tostões", obols: "Óbolos" };
export const MARKET_PAGE = 8; // listagens por página
/** Taxa = MARKET_FEE_PCT % do preço, arredondada para o tostão (o piso de preço garante que nunca fica abaixo de 1 distorcendo a %). */
export const listingFee = (price: number) => Math.max(1, Math.round((price * MARKET_FEE_PCT) / 100));

export type MarketSort = "price_asc" | "price_desc" | "newest" | "rarity";
export const MARKET_SORTS: readonly MarketSort[] = ["price_asc", "price_desc", "newest", "rarity"];
export const MARKET_SORT_NAME: Record<MarketSort, string> = { price_asc: "Menor preço", price_desc: "Maior preço", newest: "Mais recentes", rarity: "Raridade" };

export interface MarketFilter {
  q?: string; // parte do nome
  cls?: CharClass | "all"; // classe do equipamento
  kind?: ItemKind | "all"; // tipo (arma, elmo, poção...)
  rarity?: Rarity | "all";
  currency?: MarketCurrency | "all"; // moeda do preço
  minPrice?: number;
  maxPrice?: number;
  sort?: MarketSort;
  page?: number; // 0, 1, 2...
}
export interface MarketListing { id: string; itemId: string; qty: number; price: number; currency: MarketCurrency; seller: string; expiresAt: number; mine: boolean; af?: string[]; rf?: number; gm?: string[]; gmv?: boolean } // extras do item (afixos, refino, gemas), para a ficha
export interface MarketPage { items: MarketListing[]; page: number; pages: number; total: number }
export type MyListingStatus = "active" | "sold" | "expired";
export interface MyListing { id: string; itemId: string; qty: number; price: number; currency: MarketCurrency; fee: number; status: MyListingStatus; expiresAt: number; buyer?: string; af?: string[]; rf?: number; gm?: string[]; gmv?: boolean }
export interface MarketMineEvent { listings: MyListing[]; open: number; max: number }
/** Uma listagem na janela de preços: só o necessário para comparar (sem dados privados do vendedor além do nome). */
export interface MarketPriceRow { id: string; qty: number; price: number; currency: MarketCurrency; unit: number; seller: string; mine: boolean }
/** Resposta a MarketPrices: as 30 listagens mais baratas (por unidade) e o mais caro, da moeda pedida. */
export interface MarketPricesEvent { itemId: string; currency: MarketCurrency; rows: MarketPriceRow[]; total: number; cheapest: number | null; dearest: number | null }
export interface MarketDoneEvent { ok: boolean; text: string; kind: "list" | "buy" | "cancel" | "claim" }

const norm = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

/** Limpa e limita um filtro vindo do cliente (nunca confia: o servidor refaz tudo). */
export function cleanFilter(raw: unknown): Required<Pick<MarketFilter, "cls" | "kind" | "rarity" | "currency" | "sort" | "page">> & { q: string; minPrice: number; maxPrice: number } {
  const r = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const pick = <T extends string>(v: unknown, ok: readonly T[], d: T): T => (typeof v === "string" && (ok as readonly string[]).includes(v) ? (v as T) : d);
  const price = (v: unknown, d: number) => (typeof v === "number" && Number.isFinite(v) ? Math.max(0, Math.min(MARKET_MAX_PRICE, Math.floor(v))) : d);
  const page = typeof r.page === "number" && Number.isFinite(r.page) ? Math.max(0, Math.min(500, Math.floor(r.page))) : 0;
  return {
    q: typeof r.q === "string" ? r.q.slice(0, 30) : "",
    cls: pick<CharClass | "all">(r.cls, ["all", "warrior", "archer", "cleric", "mage"], "all"),
    kind: pick<ItemKind | "all">(r.kind, ["all", "weapon", "offhand", "helmet", "armor", "boots", "cape", "potion"], "all"),
    rarity: pick<Rarity | "all">(r.rarity, ["all", ...RARITIES], "all"),
    currency: pick<MarketCurrency | "all">(r.currency, ["all", "iron", "obols"], "all"),
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
export const suggestedPrice = (id: string, qty: number) => Math.max(minListingPrice(id, qty), itemValue(id) * qty);
