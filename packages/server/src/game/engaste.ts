import { ITEMS, EQUIP_SLOTS, GEMA_BY_ID, espacosDe, gemasValidas, custoEngaste, type EquipSlot } from "@frixep/shared";
import { validSlot, setEquipGm, type Inventory } from "./inventory.js";

export type EngasteResult = { ok: true; msg: string } | { ok: false; error: string };

/** Localiza o equipamento alvo (mochila ou vestido) e devolve id, gemas atuais e como gravar a nova lista. */
function alvo(inv: Inventory, pedido: { origem?: unknown; slot?: unknown }): { ok: true; id: string; gemas: string[]; grava: (g: string[]) => void } | { ok: false; error: string } {
  if (pedido?.origem === "mochila") {
    if (!validSlot(pedido.slot)) return { ok: false, error: "Espaço inválido." };
    const st = inv.slots[pedido.slot];
    if (!st) return { ok: false, error: "Espaço vazio." };
    const slot = pedido.slot;
    return { ok: true, id: st.id, gemas: [...(st.gm ?? [])], grava: (g) => { const dono = inv.slots[slot]!; if (g.length) dono.gm = g; else delete dono.gm; } };
  }
  if (pedido?.origem === "equip") {
    if (typeof pedido.slot !== "string" || !(EQUIP_SLOTS as readonly string[]).includes(pedido.slot)) return { ok: false, error: "Espaço inválido." };
    const s = pedido.slot as EquipSlot;
    const id = inv.equip[s];
    if (!id) return { ok: false, error: "Nada vestido nesse espaço." };
    return { ok: true, id, gemas: [...(inv.equipGm?.[s] ?? [])], grava: (g) => setEquipGm(inv, s, g) };
  }
  return { ok: false, error: "Escolha um equipamento para engastar." };
}

/**
 * Engastar (autoritativo, C3.3): põe uma gema num espaço livre de um equipamento, pagando Óbolos.
 * Tudo ou nada: confere o equipamento, o tipo da gema, o espaço livre e o saldo ANTES de gastar qualquer coisa.
 */
export function engastarGema(inv: Inventory, pedido: { origem?: unknown; slot?: unknown; gema?: unknown }): EngasteResult {
  const a = alvo(inv, pedido);
  if (!a.ok) return a;
  const def = ITEMS[a.id];
  const nome = def.name;
  const g = typeof pedido.gema === "string" ? GEMA_BY_ID[pedido.gema] : undefined;
  if (!g) return { ok: false, error: "Gema desconhecida." };
  if (!g.kinds.includes(def.kind)) return { ok: false, error: `${g.nome} não serve em ${nome}.` };
  const espacos = espacosDe(def.kind, def.rarity);
  if (!espacos) return { ok: false, error: `${nome} não tem espaço para gema.` };
  const atuais = gemasValidas(a.gemas, def.kind, def.rarity);
  if (atuais.length >= espacos) return { ok: false, error: `${nome} não tem espaço livre (${atuais.length}/${espacos}).` };
  const custo = custoEngaste(g.id);
  if (inv.obols < custo) return { ok: false, error: `Faltam Óbolos de Sangue: ${g.nome} custa ${custo}, você tem ${inv.obols}.` };

  // pagamento: já está tudo conferido
  inv.obols -= custo;
  a.grava([...atuais, g.id]);
  return { ok: true, msg: `${g.nome} engastada em ${nome} (${atuais.length + 1}/${espacos}). Custou ${custo} Óbolo(s).` };
}

/**
 * Remover gema (autoritativo, C3.3): tira a gema de um espaço e o espaço volta a ficar livre. Versão simples: a gema
 * é PERDIDA (não volta para a mochila) e remover não custa nada. Confere o índice antes de mexer.
 */
export function removerGema(inv: Inventory, pedido: { origem?: unknown; slot?: unknown; idx?: unknown }): EngasteResult {
  const a = alvo(inv, pedido);
  if (!a.ok) return a;
  const def = ITEMS[a.id];
  const atuais = gemasValidas(a.gemas, def.kind, def.rarity);
  const i = pedido.idx;
  if (!Number.isInteger(i) || (i as number) < 0 || (i as number) >= atuais.length) return { ok: false, error: "Esse espaço já está vazio." };
  const nome = GEMA_BY_ID[atuais[i as number]!]!.nome;
  a.grava(atuais.filter((_, k) => k !== i));
  return { ok: true, msg: `${nome} removida de ${def.name}. O espaço voltou a ficar livre; a gema foi perdida.` };
}
