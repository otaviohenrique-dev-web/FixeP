import { ITEMS, INV_SLOTS, EQUIP_SLOTS, CLASS_DEFS, rarityIndex, migrateItemId, gearBonuses, afixosValidos, sortearAfixos, KINDS_EQUIPAVEIS, refinoValido, gemasValidas, type GearBonuses, type CharClass, type InvStack, type EquipSlot, type InventorySnapshot } from "@frixep/shared";

/** Inventário de um jogador (só existe no servidor; o cliente recebe fotografias). Funções puras e testáveis. */
export interface Inventory {
  slots: (InvStack | null)[];
  equip: Record<EquipSlot, string | null>;
  iron: number; // Tostões de Ferro (gravados junto com o inventário, na mesma transação)
  obols: number; // Óbolos de Sangue
  equipAf?: Partial<Record<EquipSlot, string[]>>; // afixos do equipamento (ausente = sem afixos; itens antigos)
  equipRf?: Partial<Record<EquipSlot, number>>; // nível de refino do equipamento (ausente = +0; ver refino.ts)
  equipGm?: Partial<Record<EquipSlot, string[]>>; // gemas engastadas no equipamento vestido (ausente = nenhuma; ver engaste.ts)
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
  inv: inv.slots.map((s) => (s ? { id: s.id, qty: s.qty, ...(s.af?.length ? { af: [...s.af] } : {}), ...(s.rf ? { rf: s.rf } : {}), ...(s.gm?.length ? { gm: [...s.gm] } : {}) } : null)),
  equip: { ...inv.equip },
  equipAf: Object.fromEntries(Object.entries(inv.equipAf ?? {}).filter(([, v]) => v?.length)) as Partial<Record<EquipSlot, string[]>>,
  equipRf: Object.fromEntries(Object.entries(inv.equipRf ?? {}).filter(([, v]) => v)) as Partial<Record<EquipSlot, number>>,
  equipGm: Object.fromEntries(Object.entries(inv.equipGm ?? {}).filter(([, v]) => v?.length)) as Partial<Record<EquipSlot, string[]>>,
  iron: inv.iron,
  obols: inv.obols,
});

export const validSlot = (i: unknown): i is number => Number.isInteger(i) && (i as number) >= 0 && (i as number) < INV_SLOTS;

/**
 * Adiciona `qty` do item (completa pilhas antes de ocupar espaços vazios). Devolve quanto NÃO coube.
 * `af`: afixos do item (só faz diferença para equipamento, que tem pilha de 1 e nunca se funde). Afixos inválidos são descartados.
 */
export function addItem(inv: Inventory, id: string, qty: number, af?: string[], rf?: number, gm?: string[]): number {
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
      const ok = af?.length ? afixosValidos(af, def.kind, def.rarity) : [];
      const nivel = refinoValido(rf); // refino vai junto com o item (equipamento de pilha 1)
      const gemas = def.kind && take === 1 ? gemasValidas(gm, def.kind, def.rarity) : []; // gemas vão com o item de pilha 1 (equipamento)
      inv.slots[i] = { id, qty: take, ...(ok.length ? { af: ok } : {}), ...(nivel ? { rf: nivel } : {}), ...(gemas.length ? { gm: gemas } : {}) };
      left -= take;
    }
  }
  return left;
}

/**
 * Item NOVO (loja, recompensa de quest, fusão do ferreiro): equipamento sai com afixos sorteados, um sorteio por unidade.
 * Não use para mover item que já existe (venda entre jogadores, mercado, cofre): esses carregam os afixos que já tinham.
 */
export function addItemNovo(inv: Inventory, id: string, qty: number): number {
  const def = ITEMS[id];
  if (!def || !KINDS_EQUIPAVEIS.includes(def.kind) || !Number.isInteger(qty) || qty <= 0) return addItem(inv, id, qty);
  let left = 0;
  for (let i = 0; i < qty; i++) left += addItem(inv, id, 1, sortearAfixos(def.kind, def.rarity));
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
  if (!def || !(EQUIP_SLOTS as readonly string[]).includes(def.kind)) return { ok: false, error: "Esse item não pode ser equipado." };
  const slot = def.kind as EquipSlot;
  if (def.cls && def.cls !== cls) return { ok: false, error: `Só ${CLASS_DEFS[def.cls].name} pode usar.` };
  if (level < def.minLevel) return { ok: false, error: `Requer nível ${def.minLevel}.` };
  const mainId = inv.equip.weapon;
  const main = mainId ? ITEMS[mainId] : undefined;
  if (slot === "offhand" && main?.hands === 2) return { ok: false, error: "A arma de duas mãos ocupa a mão secundária." };
  const prev = inv.equip[slot];
  // arma de duas mãos libera a mão secundária (o item vai para a mochila; sem espaço, não troca)
  const freeOff = slot === "weapon" && def.hands === 2 && !!inv.equip.offhand;
  const prevAf = inv.equipAf?.[slot];
  const prevRf = inv.equipRf?.[slot];
  const prevGm = inv.equipGm?.[slot];
  inv.equip[slot] = stack.id;
  setEquipAf(inv, slot, stack.af);
  setEquipRf(inv, slot, stack.rf);
  setEquipGm(inv, slot, stack.gm);
  inv.slots[idx] = prev ? { id: prev, qty: 1, ...(prevAf?.length ? { af: prevAf } : {}), ...(prevRf ? { rf: prevRf } : {}), ...(prevGm?.length ? { gm: prevGm } : {}) } : null; // troca: o item antigo ocupa o espaço liberado
  if (freeOff) {
    const off = inv.equip.offhand!;
    const offAf = inv.equipAf?.offhand;
    const offRf = inv.equipRf?.offhand;
    const offGm = inv.equipGm?.offhand;
    inv.equip.offhand = null;
    setEquipAf(inv, "offhand", undefined);
    setEquipRf(inv, "offhand", undefined);
    setEquipGm(inv, "offhand", undefined);
    if (addItem(inv, off, 1, offAf, offRf, offGm) > 0) { // sem espaço: desfaz tudo
      inv.equip.offhand = off;
      setEquipAf(inv, "offhand", offAf);
      setEquipRf(inv, "offhand", offRf);
      setEquipGm(inv, "offhand", offGm);
      inv.equip[slot] = prev;
      setEquipAf(inv, slot, prevAf);
      setEquipRf(inv, slot, prevRf);
      setEquipGm(inv, slot, prevGm);
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
  if (addItem(inv, id, 1, inv.equipAf?.[s], inv.equipRf?.[s], inv.equipGm?.[s]) > 0) return { ok: false, error: "Mochila cheia." };
  inv.equip[s] = null;
  setEquipAf(inv, s, undefined);
  setEquipRf(inv, s, undefined);
  setEquipGm(inv, s, undefined);
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
export const bonuses = (inv: Inventory, cls: CharClass): GearBonuses => gearBonuses(inv.equip, cls, inv.equipAf ?? {}, inv.equipRf ?? {}, inv.equipGm ?? {});

/** Guarda (ou tira) os afixos do que está num slot de equipamento. */
export function setEquipAf(inv: Inventory, slot: EquipSlot, af: string[] | undefined) {
  if (!af?.length && !inv.equipAf?.[slot]) return; // nada a mudar: não cria o campo (mantém a fotografia igual)
  const next = { ...(inv.equipAf ?? {}) };
  if (af?.length) next[slot] = [...af]; else delete next[slot];
  inv.equipAf = next;
}

/** Guarda (ou tira) o nível de refino do que está num slot de equipamento (0 ou ausente = +0). */
export function setEquipRf(inv: Inventory, slot: EquipSlot, rf: number | undefined) {
  const nivel = refinoValido(rf);
  if (!nivel && !inv.equipRf?.[slot]) return; // nada a mudar: não cria o campo
  const next = { ...(inv.equipRf ?? {}) };
  if (nivel) next[slot] = nivel; else delete next[slot];
  inv.equipRf = next;
}

/** Guarda (ou tira) as gemas engastadas do que está num slot de equipamento (ausente/vazio = nenhuma). */
export function setEquipGm(inv: Inventory, slot: EquipSlot, gm: string[] | undefined) {
  if (!gm?.length && !inv.equipGm?.[slot]) return; // nada a mudar: não cria o campo
  const next = { ...(inv.equipGm ?? {}) };
  if (gm?.length) next[slot] = [...gm]; else delete next[slot];
  inv.equipGm = next;
}

const KIND_ORDER = ["weapon", "offhand", "helmet", "armor", "boots", "cape", "potion", "material"];
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
    if (left > 0) merged.push({ id: s.id, qty: left, ...(s.af?.length ? { af: s.af } : {}), ...(s.rf ? { rf: s.rf } : {}) });
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
