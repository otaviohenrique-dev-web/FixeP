// Quests (C1.1): tipos e validação de formato das definições em JSON (packages/server/data/quests/*.json).
// Este arquivo só confere a FORMA do dado. A conferência contra o jogo (itens, inimigos, zonas, NPCs) fica no servidor.

export type EstadoQuest = "ativa" | "pronta" | "entregue";

/** Objetivos. `progresso` de cada objetivo fica no mesmo índice do array `objetivos` da quest. */
export interface ObjetivoAbater { tipo: "abater"; kind: string; qtd: number; zona?: number }
export interface ObjetivoColetar { tipo: "coletar"; itemId: string; qtd: number }
export interface ObjetivoFalar { tipo: "falar"; npc: string }
export interface ObjetivoChegar { tipo: "chegar"; zona: number; x: number; y: number; raio: number }
export type Objetivo = ObjetivoAbater | ObjetivoColetar | ObjetivoFalar | ObjetivoChegar;

export interface RecompensaQuest { xp: number; ferro: number; itens: { id: string; qtd: number }[] }

export interface QuestDef {
  id: string;
  nome: string;
  texto: string; // texto curto (até 200 caracteres)
  nivelMin: number;
  npc: string | null; // quem dá e recebe a quest (id do NPC da zona); null = sem NPC
  preRequisitos: string[]; // ids de quests que precisam estar entregues antes
  objetivos: Objetivo[];
  recompensa: RecompensaQuest;
}

/** Estado de uma quest de um personagem, como o servidor envia ao cliente. */
export interface QuestEstado { id: string; estado: EstadoQuest; progresso: number[] }
/** Mensagem Evt.Quests: o estado COMPLETO das quests do personagem (ao entrar e a cada mudança). */
export interface QuestEvent { quests: QuestEstado[] }

/** Mensagem Evt.QuestDefs: definições (nome, texto, objetivos, recompensa) das quests, para o cliente mostrar. Vai ao pedir quest_sync. */
export interface QuestDefsEvent { defs: QuestDef[] }

export const QUEST_ID_RE = /^[a-z][a-z0-9_]{1,59}$/;
export const QUEST_TEXTO_MAX = 200;
export const QUEST_NIVEL_MAX = 50;
export const QUEST_QTD_MAX = 999;
export const QUEST_OBJETIVOS_MAX = 5;

const erro = (origem: string, msg: string): never => {
  throw new Error(`quest "${origem}": ${msg}`);
};

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);
const isInt = (v: unknown, min: number, max: number): v is number => typeof v === "number" && Number.isInteger(v) && v >= min && v <= max;
const isStr = (v: unknown): v is string => typeof v === "string" && v.trim().length > 0;

/**
 * Valida o formato de uma quest vinda de JSON. Lança Error com mensagem clara (arquivo + campo) se estiver errada.
 * `origem` é o nome do arquivo, usado nas mensagens. Não confere IDs de item, inimigo, zona ou NPC (isso é do servidor).
 */
export function validarFormatoQuest(raw: unknown, origem: string): QuestDef {
  if (!isObj(raw)) erro(origem, "o conteúdo precisa ser um objeto JSON");
  const q = raw as Record<string, unknown>;
  if (!isStr(q.id) || !QUEST_ID_RE.test(q.id as string)) erro(origem, `"id" deve usar minúsculas, números e _ (ex.: caca_aos_ossos)`);
  if (q.id !== origem.replace(/\.json$/, "")) erro(origem, `"id" (${q.id}) deve ser igual ao nome do arquivo`);
  if (!isStr(q.nome)) erro(origem, `"nome" é obrigatório (texto)`);
  if (!isStr(q.texto) || (q.texto as string).length > QUEST_TEXTO_MAX) erro(origem, `"texto" é obrigatório e tem no máximo ${QUEST_TEXTO_MAX} caracteres`);
  if (!isInt(q.nivelMin, 1, QUEST_NIVEL_MAX)) erro(origem, `"nivelMin" deve ser um inteiro de 1 a ${QUEST_NIVEL_MAX}`);
  if (q.npc !== null && !isStr(q.npc)) erro(origem, `"npc" deve ser o id de um NPC ou null`);

  const pre = q.preRequisitos ?? [];
  if (!Array.isArray(pre) || !pre.every((p) => isStr(p) && QUEST_ID_RE.test(p))) erro(origem, `"preRequisitos" deve ser uma lista de ids de quest (ou ausente)`);
  if ((pre as string[]).includes(q.id as string)) erro(origem, `"preRequisitos" não pode conter a própria quest`);

  if (!Array.isArray(q.objetivos) || q.objetivos.length < 1 || q.objetivos.length > QUEST_OBJETIVOS_MAX) erro(origem, `"objetivos" deve ser uma lista de 1 a ${QUEST_OBJETIVOS_MAX} itens`);
  const objetivos = (q.objetivos as unknown[]).map((o, i): Objetivo => validarObjetivo(o, origem, i));

  const r = q.recompensa;
  if (!isObj(r)) erro(origem, `"recompensa" é obrigatória (objeto com xp, ferro e itens)`);
  const rec = r as Record<string, unknown>;
  if (!isInt(rec.xp, 0, 1_000_000_000)) erro(origem, `"recompensa.xp" deve ser um inteiro não negativo`);
  if (!isInt(rec.ferro, 0, 1_000_000_000)) erro(origem, `"recompensa.ferro" deve ser um inteiro não negativo`);
  const itensRec = rec.itens ?? [];
  if (!Array.isArray(itensRec)) erro(origem, `"recompensa.itens" deve ser uma lista (ou ausente)`);
  const itens = (itensRec as unknown[]).map((it: unknown, i: number) => {
    if (!isObj(it) || !isStr(it.id) || !isInt(it.qtd, 1, QUEST_QTD_MAX)) erro(origem, `"recompensa.itens[${i}]" deve ter "id" (texto) e "qtd" (inteiro de 1 a ${QUEST_QTD_MAX})`);
    const o = it as { id: string; qtd: number };
    return { id: o.id, qtd: o.qtd };
  });

  return {
    id: q.id as string,
    nome: q.nome as string,
    texto: q.texto as string,
    nivelMin: q.nivelMin as number,
    npc: (q.npc as string | null) ?? null,
    preRequisitos: pre as string[],
    objetivos,
    recompensa: { xp: rec.xp as number, ferro: rec.ferro as number, itens },
  };
}

function validarObjetivo(o: unknown, origem: string, i: number): Objetivo {
  const where = `"objetivos[${i}]"`;
  if (!isObj(o)) erro(origem, `${where} deve ser um objeto`);
  const b = o as Record<string, unknown>;
  switch (b.tipo) {
    case "abater":
      if (!isStr(b.kind)) erro(origem, `${where}: "kind" (tipo de inimigo) é obrigatório`);
      if (!isInt(b.qtd, 1, QUEST_QTD_MAX)) erro(origem, `${where}: "qtd" deve ser inteiro de 1 a ${QUEST_QTD_MAX}`);
      if (b.zona !== undefined && !isInt(b.zona, 1, 999)) erro(origem, `${where}: "zona" deve ser um número de zona (ou ausente)`);
      return { tipo: "abater", kind: b.kind as string, qtd: b.qtd as number, ...(b.zona !== undefined ? { zona: b.zona as number } : {}) };
    case "coletar":
      if (!isStr(b.itemId)) erro(origem, `${where}: "itemId" é obrigatório`);
      if (!isInt(b.qtd, 1, QUEST_QTD_MAX)) erro(origem, `${where}: "qtd" deve ser inteiro de 1 a ${QUEST_QTD_MAX}`);
      return { tipo: "coletar", itemId: b.itemId as string, qtd: b.qtd as number };
    case "falar":
      if (!isStr(b.npc)) erro(origem, `${where}: "npc" (id do NPC) é obrigatório`);
      return { tipo: "falar", npc: b.npc as string };
    case "chegar":
      if (!isInt(b.zona, 1, 999)) erro(origem, `${where}: "zona" deve ser um número de zona`);
      if (typeof b.x !== "number" || !Number.isFinite(b.x)) erro(origem, `${where}: "x" deve ser número (tile)`);
      if (typeof b.y !== "number" || !Number.isFinite(b.y)) erro(origem, `${where}: "y" deve ser número (tile)`);
      if (typeof b.raio !== "number" || !(b.raio > 0 && b.raio <= 50)) erro(origem, `${where}: "raio" deve ser número maior que 0 (até 50 tiles)`);
      return { tipo: "chegar", zona: b.zona as number, x: b.x as number, y: b.y as number, raio: b.raio as number };
    default:
      return erro(origem, `${where}: "tipo" deve ser "abater", "coletar", "falar" ou "chegar" (recebido: ${JSON.stringify(b.tipo)})`);
  }
}
