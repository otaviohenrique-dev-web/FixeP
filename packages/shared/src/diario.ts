// Diário e rastreador de quests (C1.3): funções PURAS (sem DOM, sem rede). O cliente só mostra o resultado daqui;
// a regra de progresso, de escolha da quest do rastreador e de agrupamento do diário fica testada em packages/server/test/diario.unit.ts.
import type { Objetivo, QuestDef, QuestEstado } from "./quests";

/** Nome curto para o rastreador (linha de uma HUD pequena). */
export const RASTREADOR_NOME_MAX = 28;

/** "2/3" para objetivos com quantidade (abater, coletar); "feito" ou "falta" para os de sim/não (falar, chegar). */
export function formatarProgresso(o: Objetivo, valor: number): string {
  if (o.tipo === "abater" || o.tipo === "coletar") return `${Math.min(Math.max(0, valor), o.qtd)}/${o.qtd}`;
  return valor >= 1 ? "feito" : "falta";
}

/** Índice do primeiro objetivo ainda não cumprido; -1 se todos estão cumpridos. */
export function objetivoAtual(def: QuestDef, progresso: number[]): number {
  return def.objetivos.findIndex((o, i) => (progresso[i] ?? 0) < (o.tipo === "abater" || o.tipo === "coletar" ? o.qtd : 1));
}

/** Encurta um texto com reticências, sem cortar no meio de uma palavra quando dá. */
export function encurtar(texto: string, max = RASTREADOR_NOME_MAX): string {
  if (texto.length <= max) return texto;
  const corte = texto.slice(0, max - 1);
  const espaco = corte.lastIndexOf(" ");
  return (espaco > max * 0.6 ? corte.slice(0, espaco) : corte).trimEnd() + "…";
}

/**
 * Linha do rastreador de uma quest:
 * - pronta: "Pronta: entregar a Garrick" (ou "Pronta: <nome>" se a quest não tem NPC);
 * - ativa: "Caça aos Ossos 2/3" (progresso do objetivo atual; "feito"/"falta" nos de sim/não).
 */
export function linhaRastreador(def: QuestDef, est: QuestEstado, nomeNpc: (id: string) => string): string {
  if (est.estado === "pronta") {
    return def.npc ? `Pronta: entregar a ${nomeNpc(def.npc)}` : `Pronta: ${encurtar(def.nome)}`;
  }
  const i = objetivoAtual(def, est.progresso);
  const nome = encurtar(def.nome);
  if (i < 0) return nome;
  const o = def.objetivos[i];
  const prog = formatarProgresso(o, est.progresso[i] ?? 0);
  return o.tipo === "abater" || o.tipo === "coletar" ? `${nome} ${prog}` : `${nome}: ${prog}`;
}

/**
 * Mantém a ordem em que o cliente viu cada quest entrar (a mais nova vai para o fim).
 * O servidor manda as quests ordenadas pelo id, então a ordem de chegada é guardada aqui.
 * Quests que já sumiram da lista saem; as novas (exceto entregues) entram no fim, por id.
 */
export function atualizarOrdem(ordem: string[], estados: QuestEstado[]): string[] {
  const ids = new Set(estados.map((e) => e.id));
  const mantidos = ordem.filter((id) => ids.has(id));
  const novos = estados
    .filter((e) => e.estado !== "entregue" && !mantidos.includes(e.id))
    .map((e) => e.id)
    .sort();
  return [...mantidos, ...novos];
}

/** Quest escolhida para o rastreador. */
export interface RastreioQuest { questId: string; pronta: boolean; linha: string }

/**
 * Escolhe a quest do rastreador: primeiro uma PRONTA (é ação imediata), senão a ATIVA mais recente.
 * "Mais recente" = a última na `ordem` (ver atualizarOrdem). Sem quest ativa nem pronta, devolve null (o rastreador some).
 * Quests sem definição (`defs` ainda não chegou) são ignoradas.
 */
export function escolherRastreada(
  defs: QuestDef[],
  estados: QuestEstado[],
  ordem: string[],
  nomeNpc: (id: string) => string,
): RastreioQuest | null {
  const porId = new Map(defs.map((d) => [d.id, d]));
  const rank = (id: string) => ordem.indexOf(id); // -1 = ainda sem ordem (é a mais antiga)
  const maisRecente = (lista: QuestEstado[]) =>
    lista.reduce<QuestEstado | null>((melhor, e) => (melhor === null || rank(e.id) >= rank(melhor.id) ? e : melhor), null);

  const comDef = estados.filter((e) => porId.has(e.id));
  const pronta = maisRecente(comDef.filter((e) => e.estado === "pronta"));
  if (pronta) {
    const def = porId.get(pronta.id)!;
    return { questId: def.id, pronta: true, linha: linhaRastreador(def, pronta, nomeNpc) };
  }
  const ativa = maisRecente(comDef.filter((e) => e.estado === "ativa"));
  if (ativa) {
    const def = porId.get(ativa.id)!;
    return { questId: def.id, pronta: false, linha: linhaRastreador(def, ativa, nomeNpc) };
  }
  return null;
}

/** Uma entrada do diário: a definição (texto, objetivos, recompensa) e o estado do personagem. */
export interface EntradaDiario { def: QuestDef; est: QuestEstado }
/** Seções do diário. Só entram quests que o personagem já aceitou (quem não aceitou ainda não aparece). */
export interface Diario { ativas: EntradaDiario[]; prontas: EntradaDiario[]; entregues: EntradaDiario[] }

/** Agrupa as quests aceitas por seção, na ordem das definições. */
export function agruparDiario(defs: QuestDef[], estados: QuestEstado[]): Diario {
  const porId = new Map(estados.map((e) => [e.id, e]));
  const diario: Diario = { ativas: [], prontas: [], entregues: [] };
  for (const def of defs) {
    const est = porId.get(def.id);
    if (!est) continue;
    const entrada = { def, est };
    if (est.estado === "ativa") diario.ativas.push(entrada);
    else if (est.estado === "pronta") diario.prontas.push(entrada);
    else diario.entregues.push(entrada);
  }
  return diario;
}

/** Nome de NPC para o rastreador, com o id como reserva. */
export function nomeNpcPorId(id: string, npcs: { id: string; name: string }[]): string {
  return npcs.find((n) => n.id === id)?.name ?? id;
}
