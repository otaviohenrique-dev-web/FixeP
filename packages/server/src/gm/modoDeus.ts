import { ITEMS, GM_VEL_MIN, GM_VEL_MAX, MAX_REFINO, GM_VINCULO_MSG, type InvStack } from "@frixep/shared";
import { afixosValidos } from "@frixep/shared";

/**
 * Modo Deus (ferramenta de admin). Regras puras, sem banco e sem sala: testáveis e reutilizadas pelo servidor de jogo.
 * Nada aqui dá vantagem a jogador comum: quem usa é sempre conta admin (ver painel/rotas.ts).
 */

/**
 * Travas da economia do personagem com Modo Deus. Em produção estão SEMPRE ligadas.
 * Fora de produção podem ser desligadas com GM_SEM_TRAVAS=1 (testes livres). Nunca desligue em produção.
 */
export function travasAtivas(env: NodeJS.ProcessEnv = process.env): boolean {
  return env.NODE_ENV === "production" || env.GM_SEM_TRAVAS !== "1";
}

/** velocidade válida (multiplicador de 1 a 4, uma casa decimal); null = inválida */
export function velocidadeValida(v: unknown): number | null {
  if (typeof v !== "number" || !Number.isFinite(v) || v < GM_VEL_MIN || v > GM_VEL_MAX) return null;
  return Math.round(v * 10) / 10;
}

/** bloqueio de um item criado pelo GM numa operação de economia; null = pode seguir */
export function bloqueioGm(stack: Pick<InvStack, "gmv"> | null | undefined): string | null {
  return stack?.gmv && travasAtivas() ? GM_VINCULO_MSG : null;
}

/** confere um pedido de item do criador: id existente, quantidade, refino e afixos. Erro em texto, ou os valores limpos. */
export function validarItemGm(raw: { id?: unknown; qtd?: unknown; refino?: unknown; afixos?: unknown }):
  { ok: true; id: string; qtd: number; refino: number; af: string[] } | { ok: false; error: string } {
  const id = typeof raw.id === "string" ? raw.id : "";
  const def = ITEMS[id];
  if (!def) return { ok: false, error: "Item inexistente." };
  const qtd = raw.qtd === undefined ? 1 : raw.qtd;
  if (typeof qtd !== "number" || !Number.isInteger(qtd) || qtd < 1 || qtd > def.stack) return { ok: false, error: `Quantidade de 1 a ${def.stack}.` };
  const refino = raw.refino === undefined ? 0 : raw.refino;
  if (typeof refino !== "number" || !Number.isInteger(refino) || refino < 0 || refino > MAX_REFINO) return { ok: false, error: `Refino de +0 a +${MAX_REFINO}.` };
  if (refino > 0 && !["weapon", "offhand", "helmet", "armor", "boots", "cape"].includes(def.kind)) return { ok: false, error: "Só equipamento tem refino." };
  const afRaw = raw.afixos === undefined ? [] : raw.afixos;
  if (!Array.isArray(afRaw) || afRaw.some((x) => typeof x !== "string")) return { ok: false, error: "Afixos inválidos." };
  const af = afixosValidos(afRaw as string[], def.kind, def.rarity);
  if (af.length !== afRaw.length) return { ok: false, error: "Afixo não existe para este item." };
  if (af.length && qtd !== 1) return { ok: false, error: "Item com afixo é criado um por vez." };
  return { ok: true, id, qtd, refino, af };
}

/** busca de itens para o criador (nome ou id, sem acento e sem caixa), limitada */
export function buscarItens(q: string, limite = 40): { id: string; nome: string; tipo: string; raridade: string; empilha: number }[] {
  const alvo = q.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();
  const out: { id: string; nome: string; tipo: string; raridade: string; empilha: number }[] = [];
  for (const [id, d] of Object.entries(ITEMS)) {
    if (out.length >= limite) break;
    const nome = d.name.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
    if (alvo && !nome.includes(alvo) && !id.includes(alvo)) continue;
    out.push({ id, nome: d.name, tipo: d.kind, raridade: d.rarity, empilha: d.stack });
  }
  return out;
}
