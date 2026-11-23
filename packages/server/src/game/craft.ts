import { ITEMS, WEAPON_TYPES, RARITY_NAME, sortearAfixos, receitaArma, receitaPeca, faltasReceita, nomeIngrediente, isRaridadeCraft, familiasSecundaria, PECAS_CRAFT, type CharClass, type Receita, type PecaCraft, type Falta } from "@frixep/shared";
import { addItem, type Inventory } from "./inventory.js";

export type CraftResult = { ok: true; id: string; msg: string } | { ok: false; error: string };
type Rng = () => number;

const countMat = (inv: Inventory, id: string) => inv.slots.reduce((n, s) => n + (s?.id === id ? s.qty : 0), 0);

/** Tira `n` unidades de um ingrediente, de uma ou mais pilhas (esvazia o espaço quando zera). */
function consumir(inv: Inventory, id: string, n: number) {
  let left = n;
  for (let i = 0; i < inv.slots.length && left > 0; i++) {
    const s = inv.slots[i];
    if (!s || s.id !== id) continue;
    const take = Math.min(s.qty, left);
    s.qty -= take;
    left -= take;
    if (s.qty === 0) inv.slots[i] = null;
  }
}

/** Pedido de craft vindo do cliente (só o formato; quem decide é craftItem). */
export interface CraftPedido { tipo?: unknown; familia?: unknown; peca?: unknown; raridade?: unknown }

/** A receita pedida, ou a mensagem de erro (classe, nível, formato). */
function receitaDoPedido(p: CraftPedido, cls: CharClass, level: number): { ok: true; r: Receita } | { ok: false; error: string } {
  if (!isRaridadeCraft(p?.raridade)) return { ok: false, error: "Escolha uma raridade válida." };
  const raridade = p.raridade;
  let r: Receita | null = null;
  if (p.tipo === "arma") {
    if (typeof p.familia !== "string" || !WEAPON_TYPES[p.familia]) return { ok: false, error: "Escolha uma arma válida." };
    if (WEAPON_TYPES[p.familia].cls !== cls) return { ok: false, error: "Essa arma não é da sua classe." };
    r = receitaArma(p.familia, raridade);
  } else if (p.tipo === "peca") {
    const peca = p.peca as PecaCraft;
    if (!PECAS_CRAFT.includes(peca)) return { ok: false, error: "Escolha uma peça válida." };
    if (peca === "secundaria" && (typeof p.familia !== "string" || !familiasSecundaria(cls).includes(p.familia))) return { ok: false, error: "Essa mão secundária não é da sua classe." };
    r = receitaPeca(peca, raridade, cls, typeof p.familia === "string" ? p.familia : undefined);
  } else return { ok: false, error: "Escolha arma ou peça." };
  if (!r) return { ok: false, error: "Esse item não existe para craft." };
  if (level < r.minLevel) return { ok: false, error: `Requer nível ${r.minLevel} para craftar ${ITEMS[r.item].name}.` };
  return { ok: true, r };
}

/**
 * Craft (autoritativo). Tudo ou nada: confere ingredientes, Tostões, Óbolos e espaço ANTES de consumir;
 * consome numa cópia do inventário e só grava se o item couber. O item sai com afixos sorteados (`rng` injetável).
 * O craft não falha por sorte: se a receita está paga e cabe na mochila, o item sai.
 */
export function craftItem(inv: Inventory, cls: CharClass, level: number, pedido: CraftPedido, rng: Rng = Math.random): CraftResult {
  const q = receitaDoPedido(pedido, cls, level);
  if (!q.ok) return q;
  const r = q.r;
  const falta = faltasReceita(r, (id) => countMat(inv, id), inv.iron, inv.obols);
  if (falta.length) return { ok: false, error: `Faltam para craftar ${ITEMS[r.item].name}: ${falta.map(textoFalta).join("; ")}.` };

  // transação: trabalha numa cópia; só grava se o item couber
  const w: Inventory = { ...inv, slots: inv.slots.map((s) => (s ? { ...s } : null)) };
  for (const [id, n] of Object.entries(r.mats)) consumir(w, id, n);
  w.iron -= r.tostoes;
  w.obols -= r.obolos;
  const def = ITEMS[r.item];
  const left = addItem(w, r.item, 1, sortearAfixos(def.kind, def.rarity, rng));
  if (left > 0) return { ok: false, error: `Mochila cheia: libere um espaço para receber ${def.name}.` };
  inv.slots = w.slots;
  inv.iron = w.iron;
  inv.obols = w.obols;
  const gasto = [...Object.entries(r.mats).map(([id, n]) => `${n} ${ITEMS[id].name}`), `${r.tostoes} Tostões`, ...(r.obolos ? [`${r.obolos} Óbolos de Sangue`] : [])];
  return { ok: true, id: r.item, msg: `Craftado: ${def.name} (${RARITY_NAME[r.raridade]})! Gastou ${gasto.join(", ")}.` };
}

const textoFalta = (f: Falta) => `${nomeIngrediente(f.id)} ${f.tem}/${f.precisa}`;
