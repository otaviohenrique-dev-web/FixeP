/**
 * Dicas contextuais (C1.6): cada dica aparece UMA vez por personagem. Esta lista é fixa: o servidor só grava ids daqui
 * (qualquer outro id é ignorado). O texto e o gatilho ficam no cliente (packages/client/src/dicas.ts).
 */
export const DICAS = [
  "primeiro_ataque",
  "primeira_skill",
  "vida_baixa",
  "primeira_pocao",
  "item_no_chao",
  "mochila_cheia",
  "recurso_insuficiente",
] as const;

export type DicaId = (typeof DICAS)[number];

/** Diz se o valor é um id de dica conhecido. */
export function dicaValida(id: unknown): id is DicaId {
  return typeof id === "string" && (DICAS as readonly string[]).includes(id);
}

/** Só os ids válidos, sem repetir, na ordem da lista fixa (descarta lixo vindo do banco ou do cliente). */
export function dicasValidas(ids: unknown): DicaId[] {
  if (!Array.isArray(ids)) return [];
  const set = new Set<string>(ids.filter((x): x is string => typeof x === "string"));
  return DICAS.filter((d) => set.has(d));
}

/** Evento Evt.DicasVistas: ids já vistos pelo personagem (vai ao entrar na sala e ao pedir dicas_sync). */
export interface DicasVistasEvent { ids: DicaId[] }
