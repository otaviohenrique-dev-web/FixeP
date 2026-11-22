import { readdirSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import {
  ITEMS, ENEMY_KINDS, ZONES, zoneNpcs, LEVEL_CAP, xpToNext, validarFormatoQuest, objetivoContavel, CLASSE_PLACEHOLDER,
  type QuestDef, type Objetivo, type EstadoQuest, type QuestEstado, type CharClass, type AcaoUsar,
} from "@frixep/shared";
import { addItem, type Inventory } from "./inventory.js";
import { addCoins } from "./economy.js";

/**
 * Motor de quests (C1.1). Funções puras sobre o estado da quest e sobre o inventário:
 * o ZoneRoom só confere distância, chama aqui e grava. Nada aqui fala com o banco nem com a rede.
 * O progresso é um array alinhado a `def.objetivos` (abater/coletar: quantidade; falar/chegar: 0 ou 1).
 */

/** Estado de UMA quest de um personagem (em memória e no banco). */
export interface QuestRt { id: string; estado: EstadoQuest; progresso: number[] }
export type QuestMap = Map<string, QuestRt>;
export type Defs = ReadonlyMap<string, QuestDef>;

// ------------------------------------------------------------------ dados (packages/server/data/quests)
export const QUESTS_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../data/quests");

/**
 * Lê e valida todas as quests de uma pasta. Falha com mensagem clara (arquivo + campo) se algum JSON estiver errado.
 * Confere também contra o jogo: item, inimigo, zona, NPC e pré-requisitos têm de existir.
 */
export function carregarQuests(dir: string = QUESTS_DIR): Map<string, QuestDef> {
  const out = new Map<string, QuestDef>();
  const arquivos = readdirSync(dir).filter((f) => f.endsWith(".json")).sort();
  for (const arq of arquivos) {
    let raw: unknown;
    try {
      raw = JSON.parse(readFileSync(path.join(dir, arq), "utf8"));
    } catch (e) {
      throw new Error(`quest "${arq}": JSON inválido (${(e as Error).message})`);
    }
    const def = validarFormatoQuest(raw, arq);
    if (out.has(def.id)) throw new Error(`quest "${arq}": id "${def.id}" repetido`);
    conferirContraJogo(def, arq);
    out.set(def.id, def);
  }
  for (const def of out.values()) {
    for (const p of def.preRequisitos) if (!out.has(p)) throw new Error(`quest "${def.id}": pré-requisito "${p}" não existe`);
  }
  return out;
}

function conferirContraJogo(def: QuestDef, arq: string): void {
  const npcs = new Set(Object.keys(ZONES).flatMap((z) => zoneNpcs(Number(z))).map((n) => n.id));
  if (def.npc !== null && !npcs.has(def.npc)) throw new Error(`quest "${arq}": npc "${def.npc}" não existe no jogo`);
  def.objetivos.forEach((o: Objetivo, i) => {
    const onde = `objetivos[${i}]`;
    if (o.tipo === "abater") {
      if (!ENEMY_KINDS[o.kind as keyof typeof ENEMY_KINDS]) throw new Error(`quest "${arq}": ${onde}.kind "${o.kind}" não existe`);
      if (o.zona !== undefined && !ZONES[o.zona]) throw new Error(`quest "${arq}": ${onde}.zona ${o.zona} não existe`);
    } else if (o.tipo === "coletar") {
      if (!ITEMS[o.itemId]) throw new Error(`quest "${arq}": ${onde}.itemId "${o.itemId}" não existe`);
    } else if (o.tipo === "falar") {
      if (!npcs.has(o.npc)) throw new Error(`quest "${arq}": ${onde}.npc "${o.npc}" não existe`);
    } else if (o.tipo === "chegar") {
      if (!ZONES[o.zona]) throw new Error(`quest "${arq}": ${onde}.zona ${o.zona} não existe`);
    }
  });
  // recompensa: id de item existente; "{classe}" vale para cada classe (o item de cada uma tem de existir)
  for (const r of def.recompensa.itens) {
    const ids = r.id.includes(CLASSE_PLACEHOLDER) ? CLASSES.map((c) => resolverItem(r.id, c)) : [r.id];
    for (const id of ids) if (!ITEMS[id]) throw new Error(`quest "${arq}": recompensa.itens com id "${id}" inexistente`);
  }
}

const CLASSES: readonly CharClass[] = ["warrior", "archer", "cleric", "mage"];

/** Item de recompensa para uma classe: troca "{classe}" pela classe ("{classe}_armor_common" -> "mage_armor_common"). */
export const resolverItem = (id: string, cls: CharClass | string): string => id.split(CLASSE_PLACEHOLDER).join(cls);

// ------------------------------------------------------------------ regras
const cumprido = (o: Objetivo, valor: number) => (objetivoContavel(o) && "qtd" in o ? valor >= o.qtd : valor >= 1);

/** Quantidade de um item na mochila (só a bolsa; equipamento não conta). */
export function contarItem(inv: Inventory, id: string): number {
  let n = 0;
  for (const s of inv.slots) if (s && s.id === id) n += s.qty;
  return n;
}

/** Recalcula o estado depois de qualquer mudança de progresso. Devolve true se o estado mudou. */
export function recomputar(rt: QuestRt, def: QuestDef): boolean {
  if (rt.estado === "entregue") return false;
  const tudo = def.objetivos.every((o, i) => cumprido(o, rt.progresso[i] ?? 0));
  const novo: EstadoQuest = tudo ? "pronta" : "ativa";
  if (rt.estado === novo) return false;
  rt.estado = novo;
  return true;
}

/**
 * Coletar e equipar são consultados no estado atual do personagem: a quantidade na bolsa (coletar) ou o slot ocupado (equipar).
 * Solta um item ou tira o equipamento, perde o objetivo.
 */
export function atualizarColetas(rt: QuestRt, def: QuestDef, inv: Inventory): boolean {
  if (rt.estado === "entregue") return false;
  def.objetivos.forEach((o, i) => {
    if (o.tipo === "coletar") rt.progresso[i] = Math.min(o.qtd, contarItem(inv, o.itemId));
    if (o.tipo === "equipar") rt.progresso[i] = inv.equip[o.slot] ? 1 : 0;
  });
  return recomputar(rt, def);
}

/** Uma habilidade disparou (só conta quando ela de fato acontece: recurso gasto e fora de recarga). Conta +1 nos objetivos "usar" dessa ação. */
export function progredirUso(qs: QuestMap, defs: Defs, acao: AcaoUsar): QuestRt[] {
  const mudou: QuestRt[] = [];
  for (const rt of qs.values()) {
    const def = defs.get(rt.id);
    if (!def || rt.estado !== "ativa") continue;
    let tocou = false;
    def.objetivos.forEach((o, i) => {
      if (o.tipo !== "usar" || o.acao !== acao || (rt.progresso[i] ?? 0) >= o.qtd) return;
      rt.progresso[i] = (rt.progresso[i] ?? 0) + 1;
      tocou = true;
    });
    if (tocou) { recomputar(rt, def); mudou.push(rt); }
  }
  return mudou;
}

/** Tenta aceitar a quest. Confere: existe, ainda não foi aceita/entregue, nível, pré-requisitos. */
export function aceitar(qs: QuestMap, defs: Defs, id: string, nivel: number, inv: Inventory): { ok: true; def: QuestDef } | { ok: false; error: string } {
  const def = defs.get(id);
  if (!def) return { ok: false, error: "Essa missão não existe." };
  const atual = qs.get(id);
  if (atual?.estado === "entregue") return { ok: false, error: "Você já concluiu essa missão." };
  if (atual) return { ok: false, error: "Você já aceitou essa missão." };
  if (nivel < def.nivelMin) return { ok: false, error: `Você precisa ser nível ${def.nivelMin} para aceitar essa missão.` };
  for (const p of def.preRequisitos) {
    if (qs.get(p)?.estado !== "entregue") return { ok: false, error: `Antes, conclua: ${defs.get(p)?.nome ?? p}.` };
  }
  const rt: QuestRt = { id, estado: "ativa", progresso: def.objetivos.map(() => 0) };
  qs.set(id, rt);
  atualizarColetas(rt, def, inv);
  return { ok: true, def };
}

/** Abate de um inimigo por um jogador elegível. Conta +1 em cada objetivo "abater" que combina (tipo e, se houver, zona). */
export function progredirAbate(qs: QuestMap, defs: Defs, kind: string, zona: number): QuestRt[] {
  const mudou: QuestRt[] = [];
  for (const rt of qs.values()) {
    const def = defs.get(rt.id);
    if (!def || rt.estado !== "ativa") continue;
    let tocou = false;
    def.objetivos.forEach((o, i) => {
      if (o.tipo !== "abater" || o.kind !== kind || (o.zona !== undefined && o.zona !== zona)) return;
      if ((rt.progresso[i] ?? 0) >= o.qtd) return;
      rt.progresso[i] = (rt.progresso[i] ?? 0) + 1;
      tocou = true;
    });
    if (tocou) { recomputar(rt, def); mudou.push(rt); }
  }
  return mudou;
}

/** Conversa com um NPC: conta os objetivos "falar" com esse NPC. */
export function progredirFala(qs: QuestMap, defs: Defs, npc: string): QuestRt[] {
  const mudou: QuestRt[] = [];
  for (const rt of qs.values()) {
    const def = defs.get(rt.id);
    if (!def || rt.estado !== "ativa") continue;
    let tocou = false;
    def.objetivos.forEach((o, i) => {
      if (o.tipo === "falar" && o.npc === npc && !rt.progresso[i]) { rt.progresso[i] = 1; tocou = true; }
    });
    if (tocou) { recomputar(rt, def); mudou.push(rt); }
  }
  return mudou;
}

/** Chegada a um ponto: marca os objetivos "chegar" da zona cujo raio o personagem está dentro. */
export function progredirChegada(qs: QuestMap, defs: Defs, zona: number, x: number, y: number): QuestRt[] {
  const mudou: QuestRt[] = [];
  for (const rt of qs.values()) {
    const def = defs.get(rt.id);
    if (!def || rt.estado !== "ativa") continue;
    let tocou = false;
    def.objetivos.forEach((o, i) => {
      if (o.tipo !== "chegar" || o.zona !== zona || rt.progresso[i]) return;
      if (Math.hypot(x - o.x, y - o.y) <= o.raio) { rt.progresso[i] = 1; tocou = true; }
    });
    if (tocou) { recomputar(rt, def); mudou.push(rt); }
  }
  return mudou;
}

/**
 * Entrega: calcula o inventário DEPOIS da entrega (itens de coletar saem, recompensa entra) numa cópia.
 * Se a recompensa não couber, recusa e o inventário original não muda. Quem chama grava a cópia e só então a aplica.
 */
export function aplicarRecompensa(inv: Inventory, def: QuestDef, cls: CharClass): { ok: true; inv: Inventory } | { ok: false; error: string } {
  const c: Inventory = { ...inv, equip: { ...inv.equip }, slots: inv.slots.map((s) => (s ? { ...s } : null)) };
  for (const o of def.objetivos) if (o.tipo === "coletar") removerItem(c, o.itemId, o.qtd);
  let sobra = 0;
  for (const r of def.recompensa.itens) sobra += addItem(c, resolverItem(r.id, cls), r.qtd);
  if (sobra > 0) return { ok: false, error: "Mochila cheia: libere espaço para receber a recompensa." };
  addCoins(c, "iron", def.recompensa.ferro);
  return { ok: true, inv: c };
}

/** Remove `qtd` do item da bolsa (pode vir de várias pilhas). Só é chamada com quantidade já conferida. */
export function removerItem(inv: Inventory, id: string, qtd: number): void {
  let falta = qtd;
  for (let i = 0; i < inv.slots.length && falta > 0; i++) {
    const s = inv.slots[i];
    if (!s || s.id !== id) continue;
    const tira = Math.min(s.qty, falta);
    s.qty -= tira;
    falta -= tira;
    if (s.qty <= 0) inv.slots[i] = null;
  }
}

/** XP depois de ganhar `amount` (mesma regra do ZoneRoom.addXp, sem efeitos colaterais). */
export function xpAposGanho(level: number, xp: number, amount: number): { level: number; xp: number } {
  if (level >= LEVEL_CAP) return { level, xp };
  let lv = level, x = xp + amount;
  while (lv < LEVEL_CAP && x >= xpToNext(lv)) { x -= xpToNext(lv); lv++; }
  if (lv >= LEVEL_CAP) x = 0;
  return { level: lv, xp: x };
}

/** Fotografia enviada ao cliente (ordenada pelo id, para o resultado ser estável). */
export function estadoParaCliente(qs: QuestMap): QuestEstado[] {
  return [...qs.values()].sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0)).map((rt) => ({ id: rt.id, estado: rt.estado, progresso: [...rt.progresso] }));
}
