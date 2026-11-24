import { ITEMS, EQUIP_SLOTS, custoRefino, faltasRefino, nomeIngrediente, refinoValido, MAX_REFINO, type EquipSlot } from "@frixep/shared";
import { consumir } from "./craft.js";
import { validSlot, setEquipRf, type Inventory } from "./inventory.js";

export type RefinoResult = { ok: true; msg: string } | { ok: false; error: string };

const countMat = (inv: Inventory, id: string) => inv.slots.reduce((n, s) => n + (s?.id === id ? s.qty : 0), 0);

/**
 * Refino (autoritativo, C3.2). Sobe +1 um equipamento da mochila ("mochila", slot) ou vestido ("equip", slot).
 * NUNCA quebra o item e não cria item novo (por isso não precisa de espaço). Tudo ou nada: confere o pedido,
 * o nível máximo e o custo (material e Tostões) ANTES de mexer em qualquer coisa.
 */
export function refinarItem(inv: Inventory, pedido: { origem?: unknown; slot?: unknown }): RefinoResult {
  let id: string, nivel: number;
  if (pedido?.origem === "mochila") {
    if (!validSlot(pedido.slot)) return { ok: false, error: "Espaço inválido." };
    const st = inv.slots[pedido.slot];
    if (!st) return { ok: false, error: "Espaço vazio." };
    id = st.id; nivel = refinoValido(st.rf);
  } else if (pedido?.origem === "equip") {
    if (typeof pedido.slot !== "string" || !(EQUIP_SLOTS as readonly string[]).includes(pedido.slot)) return { ok: false, error: "Espaço inválido." };
    const eqId = inv.equip[pedido.slot as EquipSlot];
    if (!eqId) return { ok: false, error: "Nada vestido nesse espaço." };
    id = eqId; nivel = refinoValido(inv.equipRf?.[pedido.slot as EquipSlot]);
  } else return { ok: false, error: "Escolha um equipamento para refinar." };

  const def = ITEMS[id];
  const nome = def.name;
  const c = custoRefino(nivel, def.kind, def.rarity);
  if (!c) return { ok: false, error: nivel >= MAX_REFINO ? `${nome} já está no refino máximo (+${MAX_REFINO}).` : "Esse item não pode ser refinado." };
  const falta = faltasRefino(c, (m) => countMat(inv, m), inv.iron);
  if (falta.length) return { ok: false, error: `Faltam para refinar ${nome} para +${nivel + 1}: ${falta.map((f) => `${nomeIngrediente(f.id)} ${f.tem}/${f.precisa}`).join("; ")}.` };

  // pagamento: já está tudo conferido, então daqui para baixo nada pode falhar
  for (const [m, n] of Object.entries(c.mats)) consumir(inv, m, n);
  inv.iron -= c.tostoes;
  if (pedido.origem === "mochila") inv.slots[pedido.slot as number]!.rf = nivel + 1;
  else setEquipRf(inv, pedido.slot as EquipSlot, nivel + 1);
  const gasto = [...Object.entries(c.mats).map(([m, n]) => `${n} ${nomeIngrediente(m)}`), `${c.tostoes} Tostões`];
  return { ok: true, msg: `${nome} refinado para +${nivel + 1}! Gastou ${gasto.join(", ")}.` };
}
