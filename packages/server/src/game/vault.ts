import { ITEMS, VAULT_SLOTS, VAULT_COIN_MAX, type InvStack, type VaultSnapshot } from "@frixep/shared";
import { addItem, validSlot, type Inventory, type Result } from "./inventory.js";
import { bloqueioGm } from "../gm/modoDeus.js";

/** Baú pessoal do jogador (só existe no servidor; o cliente recebe fotografias). Funções puras: mexem só em memória, o salvamento é feito pela sala. */
export interface Vault { slots: (InvStack | null)[]; iron: number; obols: number }

export const emptyVault = (): Vault => ({ slots: Array.from({ length: VAULT_SLOTS }, () => null), iron: 0, obols: 0 });
export const vaultSnapshot = (v: Vault): VaultSnapshot => ({ slots: v.slots.map((s) => (s ? { id: s.id, qty: s.qty } : null)), iron: v.iron, obols: v.obols });
export const validVaultSlot = (i: unknown): i is number => Number.isInteger(i) && (i as number) >= 0 && (i as number) < VAULT_SLOTS;

const qtyOf = (raw: unknown, max: number): number | null => {
  if (raw === undefined) return max;
  return Number.isInteger(raw) && (raw as number) >= 1 ? Math.min(raw as number, max) : null;
};

/** Põe `qty` de `id` em `slots` (junta com a pilha do alvo, ou ocupa vazio), a partir do espaço `to` se pedido; devolve quanto NÃO coube. */
function putInto(slots: (InvStack | null)[], id: string, qty: number, to: number | undefined): number {
  const def = ITEMS[id];
  let left = qty;
  const merge = (i: number) => { const s = slots[i]; if (s && s.id === id && s.qty < def.stack && left > 0) { const t = Math.min(def.stack - s.qty, left); s.qty += t; left -= t; } };
  const fill = (i: number) => { if (slots[i] === null && left > 0) { const t = Math.min(def.stack, left); slots[i] = { id, qty: t }; left -= t; } };
  if (to !== undefined) { merge(to); fill(to); } // o espaço escolhido primeiro
  for (let i = 0; i < slots.length && left > 0; i++) merge(i);
  for (let i = 0; i < slots.length && left > 0; i++) fill(i);
  return left;
}

/** Bolsa -> baú. Só item da bolsa (equipado não entra). Sem espaço no baú: nada muda. */
export function deposit(inv: Inventory, v: Vault, slot: unknown, qtyRaw: unknown, to?: unknown): Result {
  if (!validSlot(slot)) return { ok: false, error: "Espaço inválido." };
  const st = inv.slots[slot];
  if (!st || !ITEMS[st.id]) return { ok: false, error: "Espaço vazio." };
  const travado = bloqueioGm(st); // item do Modo Deus não entra no baú compartilhado
  if (travado) return { ok: false, error: travado };
  const qty = qtyOf(qtyRaw, st.qty);
  if (qty === null) return { ok: false, error: "Quantidade inválida." };
  if (to !== undefined && !validVaultSlot(to)) return { ok: false, error: "Espaço do baú inválido." };
  const before = v.slots.map((s) => (s ? { ...s } : null));
  const left = putInto(v.slots, st.id, qty, to as number | undefined);
  if (left > 0) { v.slots = before; return { ok: false, error: "O baú está cheio." }; }
  st.qty -= qty;
  if (st.qty <= 0) inv.slots[slot] = null;
  return { ok: true };
}

/** Baú -> bolsa. Sem espaço na bolsa: nada muda (nunca perde item). */
export function withdraw(inv: Inventory, v: Vault, slot: unknown, qtyRaw: unknown, to?: unknown): Result {
  if (!validVaultSlot(slot)) return { ok: false, error: "Espaço do baú inválido." };
  const st = v.slots[slot];
  if (!st || !ITEMS[st.id]) return { ok: false, error: "Espaço vazio." };
  const qty = qtyOf(qtyRaw, st.qty);
  if (qty === null) return { ok: false, error: "Quantidade inválida." };
  if (to !== undefined && !validSlot(to)) return { ok: false, error: "Espaço da bolsa inválido." };
  const before = inv.slots.map((s) => (s ? { ...s } : null));
  let left = qty;
  if (to !== undefined) { // espaço escolhido: usa só se vazio ou da mesma pilha
    const dst = inv.slots[to as number], def = ITEMS[st.id];
    if (dst === null) { const t = Math.min(def.stack, left); inv.slots[to as number] = { id: st.id, qty: t }; left -= t; }
    else if (dst.id === st.id && dst.qty < def.stack) { const t = Math.min(def.stack - dst.qty, left); dst.qty += t; left -= t; }
  }
  if (left > 0) left = addItem(inv, st.id, left);
  if (left > 0) { inv.slots = before; return { ok: false, error: "Mochila cheia." }; }
  st.qty -= qty;
  if (st.qty <= 0) v.slots[slot] = null;
  return { ok: true };
}

/** Dentro do baú: espaço vazio = move; mesmo item = junta pilhas; item diferente = troca de lugar. */
export function moveInVault(v: Vault, from: unknown, to: unknown): Result {
  if (!validVaultSlot(from) || !validVaultSlot(to)) return { ok: false, error: "Espaço do baú inválido." };
  if (from === to) return { ok: true };
  const a = v.slots[from], b = v.slots[to];
  if (!a) return { ok: false, error: "Espaço vazio." };
  if (b && b.id === a.id) {
    const t = Math.min(ITEMS[a.id].stack - b.qty, a.qty);
    if (t > 0) { b.qty += t; a.qty -= t; if (a.qty <= 0) v.slots[from] = null; return { ok: true }; }
  }
  v.slots[from] = b; v.slots[to] = a;
  return { ok: true };
}

/** Moedas: deposita (bolsa -> baú) ou retira. Respeita o teto dos dois lados. */
export function moveCoins(inv: Inventory, v: Vault, coin: unknown, amount: unknown, dir: unknown): Result {
  if (coin !== "iron" && coin !== "obols") return { ok: false, error: "Moeda inválida." };
  if (dir !== "in" && dir !== "out") return { ok: false, error: "Operação inválida." };
  if (!Number.isInteger(amount) || (amount as number) < 1 || (amount as number) > VAULT_COIN_MAX) return { ok: false, error: "Valor inválido." };
  const n = amount as number;
  const [from, to] = dir === "in" ? [inv, v] : [v, inv];
  if (from[coin] < n) return { ok: false, error: dir === "in" ? "Você não tem tanto." : "O baú não tem tanto." };
  if (to[coin] + n > VAULT_COIN_MAX) return { ok: false, error: "Limite de moedas atingido." };
  from[coin] -= n;
  to[coin] += n;
  return { ok: true };
}
