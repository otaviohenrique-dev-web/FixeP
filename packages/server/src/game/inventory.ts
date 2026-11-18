import { ITEMS, INV_SLOTS, EQUIP_SLOTS, CLASS_DEFS, rarityIndex, migrateItemId, gearBonuses, type GearBonuses, type CharClass, type InvStack, type EquipSlot, type InventorySnapshot } from "@frixep/shared";

/** Inventário de um jogador (só existe no servidor; o cliente recebe fotografias). Funções puras e testáveis. */
export interface Inventory {
  slots: (InvStack | null)[];
  equip: Record<EquipSlot, string | null>;
  iron: number; // Tostões de Ferro (gravados junto com o inventário, na mesma transação)
  obols: number; // Óbolos de Sangue
  migrated?: boolean; // itens antigos foram traduzidos ao carregar (o servidor grava de novo)
}
export type Result = { ok: true } | { ok: false; error: string };

export const emptyEquip = (): Record<EquipSlot, string | null> => ({ weapon: null, offhand: null, helmet: null, armor: null, boots: null, cape: null });
export const emptyInventory = (): Inventory => ({
  slots: Array.from({ length: INV_SLOTS }, () => null),
  equip: emptyEquip(),
  iron: 0,
  obols: 0,
});

export const snapshot = (inv: Inventory): InventorySnapshot => ({
  inv: inv.slots.map((s) => (s ? { id: s.id, qty: s.qty } : null)),
  equip: { ...inv.equip },
  iron: inv.iron,
  obols: inv.obols,
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

/** Cabe `qty` do item? (testa numa cópia; não altera o inventário) */
export function canFit(inv: Inventory, id: string, qty: number): boolean {
  const c: Inventory = { ...inv, slots: inv.slots.map((s) => (s ? { ...s } : null)) };
  return addItem(c, id, qty) === 0;
}

export function equipFromSlot(inv: Inventory, idx: unknown, level: number, cls: CharClass): Result {
  if (!validSlot(idx)) return { ok: false, error: "Espaço inválido." };
  const stack = inv.slots[idx];
  if (!stack) return { ok: false, error: "Espaço vazio." };
  const def = ITEMS[stack.id];
  if (!def || def.kind === "potion") return { ok: false, error: "Esse item não pode ser equipado." };
  const slot = def.kind as EquipSlot;
  if (def.cls && def.cls !== cls) return { ok: false, error: `Só ${CLASS_DEFS[def.cls].name} pode usar.` };
  if (level < def.minLevel) return { ok: false, error: `Requer nível ${def.minLevel}.` };
  const mainId = inv.equip.weapon;
  const main = mainId ? ITEMS[mainId] : undefined;
  if (slot === "offhand" && main?.hands === 2) return { ok: false, error: "A arma de duas mãos ocupa a mão secundária." };
  const prev = inv.equip[slot];
  // arma de duas mãos libera a mão secundária (o item vai para a mochila; sem espaço, não troca)
  const freeOff = slot === "weapon" && def.hands === 2 && !!inv.equip.offhand;
  inv.equip[slot] = stack.id;
  inv.slots[idx] = prev ? { id: prev, qty: 1 } : null; // troca: o item antigo ocupa o espaço liberado
  if (freeOff) {
    const off = inv.equip.offhand!;
    inv.equip.offhand = null;
    if (addItem(inv, off, 1) > 0) { // sem espaço: desfaz tudo
      inv.equip.offhand = off;
      inv.equip[slot] = prev;
      inv.slots[idx] = stack;
      return { ok: false, error: "Mochila cheia." };
    }
  }
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

/** Bônus e kit do que está equipado (só conta item da classe do jogador). */
export const bonuses = (inv: Inventory, cls: CharClass): GearBonuses => gearBonuses(inv.equip, cls);

const KIND_ORDER = ["weapon", "offhand", "helmet", "armor", "boots", "cape", "potion"];
/** Organiza a mochila: junta pilhas, ordena por tipo, raridade (maior primeiro) e nome, e encosta tudo no começo. */
export function sortInventory(inv: Inventory): void {
  const all: InvStack[] = [];
  for (const s of inv.slots) if (s) all.push({ ...s });
  const merged: InvStack[] = [];
  for (const s of all) {
    const def = ITEMS[s.id];
    let left = s.qty;
    for (const m of merged) {
      if (left <= 0) break;
      if (m.id === s.id && m.qty < def.stack) { const t = Math.min(def.stack - m.qty, left); m.qty += t; left -= t; }
    }
    if (left > 0) merged.push({ id: s.id, qty: left });
  }
  merged.sort((a, b) => {
    const da = ITEMS[a.id], db = ITEMS[b.id];
    return KIND_ORDER.indexOf(da.kind) - KIND_ORDER.indexOf(db.kind) || rarityIndex(db.rarity) - rarityIndex(da.rarity) || da.name.localeCompare(db.name, "pt") || b.qty - a.qty;
  });
  inv.slots = Array.from({ length: INV_SLOTS }, (_, i) => merged[i] ?? null);
}

/** Traduz itens antigos (equipados e na mochila) para os ids atuais. Devolve true se algo mudou. */
export function migrateInventory(inv: Inventory, cls: CharClass): boolean {
  let changed = false;
  for (const s of inv.slots) if (s) { const n = migrateItemId(s.id, cls); if (n !== s.id) { s.id = n; changed = true; } }
  for (const k of EQUIP_SLOTS) { const id = inv.equip[k]; if (id) { const n = migrateItemId(id, cls); if (n !== id) { inv.equip[k] = n; changed = true; } } }
  return changed;
}
