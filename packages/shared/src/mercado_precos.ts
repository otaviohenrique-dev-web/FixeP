import type { MarketCurrency } from "./market";

/**
 * Janela de preços do formulário de venda (estilo Albion Online): compara as listagens ativas do MESMO item pelo preço por unidade.
 * Regra: unidade = preço total / quantidade. Ordena do mais barato para o mais caro; empate desfeito pelo preço total (menor primeiro).
 * Moedas nunca se misturam: o resumo de uma moeda ignora as listagens da outra.
 */
export interface PriceRow { id: string; qty: number; price: number; currency: MarketCurrency }
export interface SortedPriceRow<T extends PriceRow = PriceRow> extends PriceRow { unit: number; row: T }
export interface PriceSummary<T extends PriceRow = PriceRow> {
  currency: MarketCurrency;
  rows: SortedPriceRow<T>[]; // só a moeda pedida, do mais barato ao mais caro
  cheapest: number | null; // menor preço por unidade
  dearest: number | null; // maior preço por unidade
}

/** Preço por unidade (sem arredondar: a comparação usa o valor exato). */
export const unitPrice = (price: number, qty: number): number => price / qty;

/** Ordena as listagens de UMA moeda pelo preço por unidade (novo array; não muda a entrada). */
export function sortByUnitPrice<T extends PriceRow>(rows: readonly T[], currency: MarketCurrency): SortedPriceRow<T>[] {
  return rows
    .filter((r) => r.currency === currency && r.qty > 0)
    .map((r) => ({ id: r.id, qty: r.qty, price: r.price, currency: r.currency, unit: unitPrice(r.price, r.qty), row: r }))
    .sort((a, b) => a.unit - b.unit || a.price - b.price || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
}

/** Resumo para a janela: lista ordenada e o mais barato e o mais caro por unidade (null sem listagens). */
export function summarizePrices<T extends PriceRow>(rows: readonly T[], currency: MarketCurrency): PriceSummary<T> {
  const sorted = sortByUnitPrice(rows, currency);
  return {
    currency,
    rows: sorted,
    cheapest: sorted.length ? sorted[0].unit : null,
    dearest: sorted.length ? sorted[sorted.length - 1].unit : null,
  };
}

/** Texto do topo da janela: "Mais barato: X · Mais caro: Y" (por unidade). */
export function priceHeadline(s: { cheapest: number | null; dearest: number | null }, cur: string): string {
  if (s.cheapest === null || s.dearest === null) return "Nenhuma listagem deste item agora: você define o preço";
  const f = (n: number) => n.toLocaleString("pt-BR", { maximumFractionDigits: 1 });
  return `Mais barato: ${f(s.cheapest)} ${cur} · Mais caro: ${f(s.dearest)} ${cur} (por unidade)`;
}
