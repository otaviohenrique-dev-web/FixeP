import { ITEMS, INV_SLOTS, EQUIP_SLOTS, CLASS_DEFS, type CharClass, type InvStack, type EquipSlot, type InventorySnapshot } from "@frixep/shared";

/** Inventário de um jogador (só existe no servidor; o cliente recebe fotografias). Funções puras e testáveis. */
export interface Inventory {
  slots: (InvStack | null)[];
  equip: Record<EquipSlot, string | null>;
}
export type Result = { ok: true } | { ok: false; error: string };

export const emptyInventory = (): Inventory => ({
  slots: Array.from({ length: INV_SLOTS }, () => null),
  equip: { weapon: null, armor: null },
});

export const snapshot = (inv: Inventory): InventorySnapshot => ({
  inv: inv.slots.map((s) => (s ? { id: s.id, qty: s.qty } : null)),
  equip: { weapon: inv.equip.weapon, armor: inv.equip.armor },
});

export const validSlot = (i: unknown): i is number => Number.isInteger(i) && (i as number) >= 0 && (i as number) < INV_SLOTS;

/** Adiciona `qty` do item (completa pilhas antes de ocupar espaços vazios). Devolve quanto NÃO coube. */
export function addItem(inv: Inventory, id: string, qty: number): number {
  const def = ITEMS[id];
  if (!def || !Number.isInteger(qty) || qty <= 0) return Math.max(0, Number.isFinite(qty) ? Math.trunc(qty) : 0);
  let left = qty;
  for (const s of inv.slots) {
    if (left <= 0) break;
    if (s && s.id === id && s.qty < def.stack) {
      const take = Math.min(def.stack - s.qty, left);
      s.qty += take;
      left -= take;
    }
  }
  for (let i = 0; i < inv.slots.length && left > 0; i++) {
    if (inv.slots[i] === null) {
      const take = Math.min(def.stack, left);
      inv.slots[i] = { id, qty: take };
      left -= take;
    }
  }
  return left;
}

export function equipFromSlot(inv: Inventory, idx: unknown, level: number, cls: CharClass): Result {
  if (!validSlot(idx)) return { ok: false, error: "Espaço inválido." };
  const stack = inv.slots[idx];
  if (!stack) return { ok: false, error: "Espaço vazio." };
  const def = ITEMS[stack.id];
  if (!def || (def.kind !== "weapon" && def.kind !== "armor")) return { ok: false, error: "Esse item não pode ser equipado." };
  if (def.cls && def.cls !== cls) return { ok: false, error: `Só ${CLASS_DEFS[def.cls].name} pode usar.` };
  if (level < def.minLevel) return { ok: false, error: `Requer nível ${def.minLevel}.` };
  const prev = inv.equip[def.kind];
  inv.equip[def.kind] = stack.id;
  inv.slots[idx] = prev ? { id: prev, qty: 1 } : null; // troca: o item antigo ocupa o espaço liberado
  return { ok: true };
}

export function unequip(inv: Inventory, slot: unknown): Result {
  if (typeof slot !== "string" || !(EQUIP_SLOTS as readonly string[]).includes(slot)) return { ok: false, error: "Espaço inválido." };
  const s = slot as EquipSlot;
  const id = inv.equip[s];
  if (!id) return { ok: false, error: "Nada equipado." };
  if (addItem(inv, id, 1) > 0) return { ok: false, error: "Mochila cheia." };
  inv.equip[s] = null;
  return { ok: true };
}

export function dropSlot(inv: Inventory, idx: unknown): Result {
  if (!validSlot(idx)) return { ok: false, error: "Espaço inválido." };
  if (!inv.slots[idx]) return { ok: false, error: "Espaço vazio." };
  inv.slots[idx] = null;
  return { ok: true };
}

/** Consome 1 unidade do espaço (já validado pelo chamador). */
export function consumeOne(inv: Inventory, idx: number) {
  const s = inv.slots[idx];
  if (!s) return;
  if (--s.qty <= 0) inv.slots[idx] = null;
}

export function bonuses(inv: Inventory): { dmgPct: number; hp: number } {
  return {
    dmgPct: (inv.equip.weapon && ITEMS[inv.equip.weapon]?.dmgPct) || 0,
    hp: (inv.equip.armor && ITEMS[inv.equip.armor]?.hp) || 0,
  };
}
