import {
  ITEMS, MAX_COINS, TRADE_MAX_ITEMS, MERGE_COUNT, BREAK_CONFIRM_FROM, rarityIndex, buyPrice, sellPrice, breakValue, canBreak, shopStock, checkMerge, coinName,
  type CharClass, type CoinKind,
} from "@frixep/shared";
import { addItem, canFit, validSlot, type Inventory, type Result } from "./inventory.js";

/**
 * Regras da economia, em funções puras sobre o inventário (o ZoneRoom só valida distância e chama aqui).
 * Cada operação ou muda TUDO ou não muda NADA: valida antes, confirma depois (nunca deixa item ou moeda "no meio").
 */
export type Rng = () => number;

/** Soma moedas respeitando o teto; devolve quanto entrou de fato. */
export function addCoins(inv: Inventory, kind: CoinKind, n: number): number {
  if (!Number.isFinite(n) || n <= 0) return 0;
  const add = Math.min(Math.floor(n), MAX_COINS - inv[kind]);
  inv[kind] += Math.max(0, add);
  return Math.max(0, add);
}

const wholeQty = (q: unknown, max: number): number | null => (typeof q === "number" && Number.isInteger(q) && q >= 1 && q <= max ? q : null);

/** Compra do comerciante: o item tem que estar no estoque da classe; confere saldo e espaço antes de cobrar. */
export function buyItem(inv: Inventory, cls: CharClass, id: unknown, qty: unknown): Result & { cost?: number } {
  if (typeof id !== "string" || !ITEMS[id]) return { ok: false, error: "Item inválido." };
  if (!shopStock(cls).includes(id)) return { ok: false, error: "O comerciante não vende isso." };
  const q = wholeQty(qty, ITEMS[id].stack);
  if (!q) return { ok: false, error: "Quantidade inválida." };
  const cost = buyPrice(id) * q;
  if (inv.iron < cost) return { ok: false, error: `Tostões insuficientes (precisa de ${cost}).` };
  if (!canFit(inv, id, q)) return { ok: false, error: "Mochila cheia." };
  inv.iron -= cost;
  addItem(inv, id, q);
  return { ok: true, cost };
}

/** Venda ao comerciante: só o que está na mochila (equipado não vende). Qualquer item tem valor. */
export function sellSlot(inv: Inventory, slot: unknown, qty: unknown): Result & { gain?: number; name?: string } {
  if (!validSlot(slot)) return { ok: false, error: "Espaço inválido." };
  const st = inv.slots[slot];
  if (!st || !ITEMS[st.id]) return { ok: false, error: "Espaço vazio." };
  const q = wholeQty(qty, st.qty);
  if (!q) return { ok: false, error: "Quantidade inválida." };
  const gain = sellPrice(st.id) * q;
  if (inv.iron + gain > MAX_COINS) return { ok: false, error: "Saldo cheio de tostões." };
  const name = ITEMS[st.id].name;
  st.qty -= q;
  if (st.qty <= 0) inv.slots[slot] = null;
  inv.iron += gain;
  return { ok: true, gain, name };
}

/** Quebrar (desmanchar) um equipamento: rende uma pequena quantia. De raridade rara em diante exige `confirm === true` (a confirmação forte fica no cliente). */
export function breakSlot(inv: Inventory, slot: unknown, confirm: unknown): Result & { gain?: number; name?: string } {
  if (!validSlot(slot)) return { ok: false, error: "Espaço inválido." };
  const st = inv.slots[slot];
  if (!st || !ITEMS[st.id]) return { ok: false, error: "Espaço vazio." };
  const def = ITEMS[st.id];
  if (!canBreak(st.id)) return { ok: false, error: "Só equipamentos podem ser quebrados (poções se vendem)." };
  if (rarityIndex(def.rarity) >= BREAK_CONFIRM_FROM && confirm !== true) return { ok: false, error: "Confirme para quebrar um item raro." };
  const gain = breakValue(st.id) * st.qty;
  if (inv.iron + gain > MAX_COINS) return { ok: false, error: "Saldo cheio de tostões." };
  inv.slots[slot] = null;
  inv.iron += gain;
  return { ok: true, gain, name: def.name };
}

export type MergeResult = { ok: false; error: string } | { ok: true; success: boolean; id: string; lost?: string; fee: number; chance: number };
/**
 * Fusão da ferreira: MERGE_COUNT equipamentos iguais (mesmo tipo, raridade e classe) + tostões => 1 de raridade superior.
 * Falhou: perde-se a taxa e UM dos itens (sorteado); os outros voltam. A raridade nunca passa do teto da zona.
 */
export function mergeItems(inv: Inventory, slots: unknown, zoneId: number, rng: Rng = Math.random): MergeResult {
  if (!Array.isArray(slots) || slots.length !== MERGE_COUNT || !slots.every(validSlot) || new Set(slots).size !== MERGE_COUNT) return { ok: false, error: `Escolha ${MERGE_COUNT} itens diferentes da mochila.` };
  const stacks = slots.map((i) => inv.slots[i as number]);
  if (stacks.some((s) => !s || s.qty !== 1)) return { ok: false, error: "Itens inválidos." };
  const ids = stacks.map((s) => s!.id);
  const chk = checkMerge(ids, zoneId);
  if (!chk.ok) return chk;
  if (inv.iron < chk.fee) return { ok: false, error: `Tostões insuficientes (a fusão custa ${chk.fee}).` };
  // os itens saem e o resultado entra: sempre cabe (saem 3 espaços, entra no máximo 1)
  for (const i of slots as number[]) inv.slots[i] = null;
  inv.iron -= chk.fee;
  if (rng() < chk.chance) {
    const fam = chk.families[Math.floor(rng() * chk.families.length)];
    const id = `${fam}_${chk.to}`;
    addItem(inv, id, 1);
    return { ok: true, success: true, id, fee: chk.fee, chance: chk.chance };
  }
  const lostIdx = Math.floor(rng() * MERGE_COUNT);
  ids.forEach((id, k) => { if (k !== lostIdx) addItem(inv, id, 1); });
  return { ok: true, success: false, id: ids[lostIdx], lost: ids[lostIdx], fee: chk.fee, chance: chk.chance };
}

// ------------------------------------------------------------ troca entre jogadores
export interface TradeOffer { items: { slot: number; id: string; qty: number }[]; iron: number; obols: number }
export const sameOffer = (a: TradeOffer, b: TradeOffer) => a.iron === b.iron && a.obols === b.obols && a.items.length === b.items.length && a.items.every((x, i) => x.slot === b.items[i].slot && x.id === b.items[i].id && x.qty === b.items[i].qty);
export const emptyOffer = (): TradeOffer => ({ items: [], iron: 0, obols: 0 });

/** Valida e normaliza o que o cliente mandou como oferta (nunca confia no id: o id vem do que está no espaço). */
export function parseOffer(inv: Inventory, raw: unknown): { ok: true; offer: TradeOffer } | { ok: false; error: string } {
  const r = raw as { items?: unknown; iron?: unknown; obols?: unknown } | null;
  if (!r || typeof r !== "object") return { ok: false, error: "Oferta inválida." };
  const num = (v: unknown) => (v === undefined ? 0 : typeof v === "number" && Number.isInteger(v) && v >= 0 && v <= MAX_COINS ? v : -1);
  const iron = num(r.iron), obols = num(r.obols);
  if (iron < 0 || obols < 0) return { ok: false, error: "Valor inválido." };
  if (iron > inv.iron || obols > inv.obols) return { ok: false, error: "Você não tem essa quantia." };
  const list = r.items === undefined ? [] : r.items;
  if (!Array.isArray(list) || list.length > TRADE_MAX_ITEMS) return { ok: false, error: "Oferta inválida." };
  const seen = new Set<number>();
  const items: TradeOffer["items"] = [];
  for (const e of list) {
    const slot = (e as { slot?: unknown })?.slot, qty = (e as { qty?: unknown })?.qty;
    if (!validSlot(slot) || seen.has(slot)) return { ok: false, error: "Item inválido na oferta." };
    const st = inv.slots[slot];
    if (!st || typeof qty !== "number" || !Number.isInteger(qty) || qty < 1 || qty > st.qty) return { ok: false, error: "Item inválido na oferta." };
    seen.add(slot);
    items.push({ slot, id: st.id, qty });
  }
  items.sort((x, y) => x.slot - y.slot);
  return { ok: true, offer: { items, iron, obols } };
}

const clone = (inv: Inventory): Inventory => ({ ...inv, slots: inv.slots.map((s) => (s ? { ...s } : null)), equip: { ...inv.equip } });

/** Tira da mochila o que foi oferecido; falha se o espaço mudou (outro item no lugar ou quantidade menor). */
function takeOffer(inv: Inventory, o: TradeOffer): boolean {
  if (o.iron > inv.iron || o.obols > inv.obols) return false;
  for (const it of o.items) {
    const st = inv.slots[it.slot];
    if (!st || st.id !== it.id || st.qty < it.qty) return false;
    st.qty -= it.qty;
    if (st.qty <= 0) inv.slots[it.slot] = null;
  }
  inv.iron -= o.iron;
  inv.obols -= o.obols;
  return true;
}

/**
 * Executa a troca de forma atômica: trabalha em CÓPIAS dos dois inventários e só então substitui os originais.
 * Confere tudo de novo no momento da execução (o que está no espaço, saldos, espaço livre e teto de moedas).
 */
export function executeTrade(a: Inventory, offA: TradeOffer, b: Inventory, offB: TradeOffer): Result {
  const ca = clone(a), cb = clone(b);
  if (!takeOffer(ca, offA) || !takeOffer(cb, offB)) return { ok: false, error: "A oferta mudou. Confira os itens." };
  for (const [dst, off] of [[ca, offB], [cb, offA]] as const) {
    for (const it of off.items) if (addItem(dst, it.id, it.qty) > 0) return { ok: false, error: "Mochila cheia: não cabe tudo." };
    if (dst.iron + off.iron > MAX_COINS || dst.obols + off.obols > MAX_COINS) return { ok: false, error: "Saldo de moedas cheio." };
    dst.iron += off.iron;
    dst.obols += off.obols;
  }
  a.slots = ca.slots; a.iron = ca.iron; a.obols = ca.obols;
  b.slots = cb.slots; b.iron = cb.iron; b.obols = cb.obols;
  return { ok: true };
}

export const describeCoins = (iron: number, obols: number) => [iron ? coinName("coin_iron", iron) : "", obols ? coinName("coin_obol", obols) : ""].filter(Boolean).join(" e ");
