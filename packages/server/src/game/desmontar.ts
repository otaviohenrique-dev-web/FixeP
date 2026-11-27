import { ITEMS, nomeIngrediente, precisaConfirmarDesmonte, materiaisDesmonte } from "@frixep/shared";
import { validSlot, addItem, type Inventory } from "./inventory.js";
import { bloqueioGm } from "../gm/modoDeus.js";

export type DesmontarResult = { ok: true; msg: string } | { ok: false; error: string };

/**
 * Desmontar (autoritativo, C3.5). Tira UM equipamento da mochila e devolve os materiais de craft.
 * Troca atômica: trabalha numa cópia do inventário; só grava se TODOS os materiais couberem (o próprio item
 * libera o espaço dele). Se não couber, o item continua na mochila e nada muda.
 */
export function desmontarItem(inv: Inventory, pedido: { slot?: unknown; confirm?: unknown }): DesmontarResult {
  if (!validSlot(pedido?.slot)) return { ok: false, error: "Espaço inválido." };
  const slot = pedido.slot as number;
  const st = inv.slots[slot];
  if (!st || !ITEMS[st.id]) return { ok: false, error: "Espaço vazio." };
  const travado = bloqueioGm(st);
  if (travado) return { ok: false, error: travado };
  const def = ITEMS[st.id];
  const mats = materiaisDesmonte(st.id, st.rf ?? 0);
  if (!mats) return { ok: false, error: "Esse item não pode ser desmontado." };
  if (precisaConfirmarDesmonte(def.rarity) && pedido.confirm !== true) return { ok: false, error: `Confirme para desmontar um item raro ou melhor.` };

  const w: Inventory = { ...inv, slots: inv.slots.map((s) => (s ? { ...s } : null)) };
  w.slots[slot] = null;
  for (const [id, n] of Object.entries(mats)) {
    if (addItem(w, id, n) > 0) return { ok: false, error: `Mochila sem espaço para os materiais de ${def.name}.` };
  }
  inv.slots = w.slots;
  const ganho = Object.entries(mats).map(([id, n]) => `${n} ${nomeIngrediente(id)}`).join(", ");
  return { ok: true, msg: `${def.name} desmontado: ${ganho}.` };
}
