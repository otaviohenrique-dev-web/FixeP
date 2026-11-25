import { ITEMS, EQUIP_SLOTS, chaveEquip, validarEquipBuild, type CharClass, type EquipBuild, type EquipSlot, type EquipSnap } from "@frixep/shared";
import type { Inventory } from "./inventory.js";

/**
 * Aplicar o conjunto de equipamento de um slot de loadout (C3.6). Função pura sobre o inventário (sem banco nem rede).
 *
 * Regras:
 *  - cada peça do build é procurada na mochila OU já vestida (mesmo item, afixos, refino e gemas); cada peça
 *    real é usada no máximo uma vez, então nada é duplicado;
 *  - peça que o jogador não tem mais é ignorada: o slot dela fica como está, sem perder nada;
 *  - slot que o build deixa vazio é desvestido (a peça vai para a mochila);
 *  - nível e classe são conferidos com validarEquipBuild (recusa com o motivo);
 *  - tudo ou nada: se a mochila não cabe as peças trocadas, nada muda.
 */

export type AplicarEquipResult = { ok: true; vestidas: number; faltando: EquipSlot[] } | { ok: false; error: string };

interface Peca {
  snap: EquipSnap;
  origem: { tipo: "slot"; idx: number } | { tipo: "equip"; slot: EquipSlot };
}

export function aplicarEquipBuild(inv: Inventory, alvo: EquipBuild, cls: CharClass, level: number): AplicarEquipResult {
  const valido = validarEquipBuild(alvo, cls, level);
  if (!valido.ok) return valido;

  // peças disponíveis: as de equipamento da mochila e as vestidas agora (cada uma conta uma vez)
  const pool: Peca[] = [];
  inv.slots.forEach((s, idx) => {
    if (s && s.qty === 1 && (EQUIP_SLOTS as readonly string[]).includes(ITEMS[s.id]?.kind ?? "")) {
      pool.push({ snap: { id: s.id, af: s.af, rf: s.rf, gm: s.gm }, origem: { tipo: "slot", idx } });
    }
  });
  for (const slot of EQUIP_SLOTS) {
    const id = inv.equip[slot];
    if (id) pool.push({ snap: { id, af: inv.equipAf?.[slot], rf: inv.equipRf?.[slot], gm: inv.equipGm?.[slot] }, origem: { tipo: "equip", slot } });
  }

  // 1) casa cada slot do build com uma peça real idêntica
  const usado = new Set<Peca>();
  const novo: Partial<Record<EquipSlot, Peca>> = {};
  const faltando: EquipSlot[] = [];
  for (const slot of EQUIP_SLOTS) {
    const alvoSlot = alvo[slot];
    if (!alvoSlot) continue;
    const k = chaveEquip(alvoSlot);
    const achou = pool.find((p) => !usado.has(p) && chaveEquip(p.snap) === k);
    if (achou) {
      usado.add(achou);
      novo[slot] = achou;
    } else {
      faltando.push(slot);
    }
  }
  // 2) peça ausente: o slot mantém o que já veste (se a peça atual não foi usada em outro slot)
  for (const slot of faltando) {
    const atual = pool.find((p) => p.origem.tipo === "equip" && p.origem.slot === slot);
    if (atual && !usado.has(atual)) {
      usado.add(atual);
      novo[slot] = atual;
    }
  }

  // 3) o que sobra das peças vestidas precisa de espaço na mochila (as usadas da mochila saem dela)
  const slots = inv.slots.map((s, idx) => {
    const p = pool.find((q) => q.origem.tipo === "slot" && q.origem.idx === idx);
    if (p && usado.has(p)) return null;
    return s ? { ...s } : null;
  });
  const sobra = pool.filter((p) => p.origem.tipo === "equip" && !usado.has(p));
  const livres: number[] = [];
  slots.forEach((s, i) => { if (!s) livres.push(i); });
  if (sobra.length > livres.length) return { ok: false, error: "Mochila cheia: não há espaço para guardar as peças trocadas." };
  sobra.forEach((p, i) => {
    const { id, af, rf, gm } = p.snap;
    slots[livres[i]] = { id, qty: 1, ...(af?.length ? { af: [...af] } : {}), ...(rf ? { rf } : {}), ...(gm?.length ? { gm: [...gm] } : {}) };
  });

  // 4) grava: a mochila e o equipamento vestido mudam juntos
  const equip: Record<EquipSlot, string | null> = { weapon: null, offhand: null, helmet: null, armor: null, boots: null, cape: null };
  const equipAf: Partial<Record<EquipSlot, string[]>> = {};
  const equipRf: Partial<Record<EquipSlot, number>> = {};
  const equipGm: Partial<Record<EquipSlot, string[]>> = {};
  let vestidas = 0;
  for (const slot of EQUIP_SLOTS) {
    const p = novo[slot];
    if (!p) continue;
    equip[slot] = p.snap.id;
    vestidas++;
    if (p.snap.af?.length) equipAf[slot] = [...p.snap.af];
    if (p.snap.rf) equipRf[slot] = p.snap.rf;
    if (p.snap.gm?.length) equipGm[slot] = [...p.snap.gm];
  }
  inv.slots = slots;
  inv.equip = equip;
  inv.equipAf = equipAf;
  inv.equipRf = equipRf;
  inv.equipGm = equipGm;
  return { ok: true, vestidas, faltando };
}
