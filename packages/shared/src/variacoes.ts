import type { ActionModifier, ActionSlot, CharClass } from "./index";

/**
 * Variações de habilidade (C2.2). Cada uma das 4 habilidades de cada classe (Q, W, E e R) tem 3 variações,
 * que são modificadores sobre a ação base (ver resolveAction). O jogador escolhe UMA por habilidade, ou a base.
 *
 * Regra de desbloqueio (a escolha só existe quando a habilidade chega ao nível):
 *   Q (skill1) no nível 10 · W (skill2) no nível 20 · E (skill3) no nível 30 · R (ultimate) no nível 40.
 * Troca livre, sem custo e sem recarga, só dentro da cidade (zona segura). O servidor decide e grava.
 * Balanceamento: nenhuma variação muda o dano base mais que 25% (o teste variacoes.unit.ts confere).
 * Os textos ficam em skilltips.ts (VARIACAO_TEXT).
 */
export const VARIACAO_SLOTS = ["skill1", "skill2", "skill3", "ultimate"] as const;
export type VariacaoSlot = (typeof VARIACAO_SLOTS)[number];
export const VARIACAO_NIVEL: Record<VariacaoSlot, number> = { skill1: 10, skill2: 20, skill3: 30, ultimate: 40 };

export interface Variacao { id: string; classe: CharClass; slot: VariacaoSlot; nome: string; mods: ActionModifier[] }
/** Escolha do personagem: habilidade -> id da variação. Sem a chave = base. */
export type EscolhasVariacao = Partial<Record<VariacaoSlot, string>>;

/** Uma variação = um modificador (só para o próprio slot) com o id da variação. */
const vr = (id: string, classe: CharClass, slot: VariacaoSlot, nome: string, add: ActionModifier["add"]): Variacao =>
  ({ id, classe, slot, nome, mods: [{ id, slot: slot as ActionSlot, add }] });

export const VARIACOES: Variacao[] = [
  // Guerreiro
  vr("w_inv_pesada", "warrior", "skill1", "Investida Pesada", { dmg: 2 }),
  vr("w_inv_veloz", "warrior", "skill1", "Investida Veloz", { cd: -2 }),
  vr("w_inv_atord", "warrior", "skill1", "Investida Atordoante", { stunS: 0.6 }),
  vr("w_cor_gelo", "warrior", "skill2", "Correntes de Gelo", { slowPct: 20, slowS: 2 }),
  vr("w_cor_pesada", "warrior", "skill2", "Correntes Pesadas", { dmg: 2 }),
  vr("w_cor_longa", "warrior", "skill2", "Correntes Longas", { rootS: 1.5 }),
  vr("w_esc_espinhos", "warrior", "skill3", "Escudo de Espinhos", { reflect: 0.25 }),
  vr("w_esc_ferro", "warrior", "skill3", "Escudo de Ferro", { reduction: 0.15 }),
  vr("w_esc_provoca", "warrior", "skill3", "Escudo Provocador", { tauntS: 3, tauntRadius: 3 }),
  vr("w_col_sismo", "warrior", "ultimate", "Colosso Sísmico", { radius: 1.2 }),
  vr("w_col_pesado", "warrior", "ultimate", "Colosso Pesado", { dmg: 8 }),
  vr("w_col_agil", "warrior", "ultimate", "Colosso Ágil", { cd: -10 }),
  // Arqueiro
  vr("a_per_gelada", "archer", "skill1", "Flecha Gelada", { slowPct: 25, slowS: 3 }),
  vr("a_per_pesada", "archer", "skill1", "Flecha Pesada", { dmg: 3 }),
  vr("a_per_veloz", "archer", "skill1", "Flecha Veloz", { cd: -1.5 }),
  vr("a_cil_explosiva", "archer", "skill2", "Cilada Explosiva", { dmg: 2, radius: 0.5 }),
  vr("a_cil_duradoura", "archer", "skill2", "Cilada Duradoura", { lifeS: 15 }),
  vr("a_cil_dupla", "archer", "skill2", "Cilada Dupla", { maxActive: 1 }),
  vr("a_chu_densa", "archer", "skill3", "Chuva Densa", { radius: 0.8 }),
  vr("a_chu_certeira", "archer", "skill3", "Chuva Certeira", { dmg: 3 }),
  vr("a_chu_frenetica", "archer", "skill3", "Chuva Frenética", { hasteAtkPct: 30, hasteS: 3 }),
  vr("a_sal_pesada", "archer", "ultimate", "Salva Pesada", { dmg: 5 }),
  vr("a_sal_ampla", "archer", "ultimate", "Salva Ampla", { radius: 1 }),
  vr("a_sal_rapida", "archer", "ultimate", "Salva Rápida", { cd: -10 }),
  // Clérigo (o Q aqui é a Cura em Área: com a Cura Focada escolhida, a variação do Q não se aplica)
  vr("c_cur_abencoada", "cleric", "skill1", "Cura Abençoada", { heal: 4 }),
  vr("c_cur_serena", "cleric", "skill1", "Cura Serena", { guardPct: 10, guardS: 2 }),
  vr("c_cur_ampla", "cleric", "skill1", "Cura Ampla", { radius: 1.5 }),
  vr("c_com_firme", "cleric", "skill2", "Compressor Firme", { radius: 1 }),
  vr("c_com_atord", "cleric", "skill2", "Compressor Atordoante", { stunS: 0.6 }),
  vr("c_com_rapido", "cleric", "skill2", "Compressor Rápido", { cd: -4 }),
  vr("c_jul_sagrado", "cleric", "skill3", "Julgamento Sagrado", { dmg: 5 }),
  vr("c_jul_amplo", "cleric", "skill3", "Julgamento Amplo", { radius: 1 }),
  vr("c_jul_veloz", "cleric", "skill3", "Julgamento Veloz", { cd: -2 }),
  vr("c_luz_abundante", "cleric", "ultimate", "Luz Abundante", { heal: 16 }),
  vr("c_luz_protetora", "cleric", "ultimate", "Luz Protetora", { guardPct: 15, guardS: 3 }),
  vr("c_luz_breve", "cleric", "ultimate", "Luz Breve", { cd: -15 }),
  // Mago
  vr("m_bol_chama", "mage", "skill1", "Chama Intensa", { burnPct: 15 }),
  vr("m_bol_pesada", "mage", "skill1", "Bola Pesada", { dmg: 4 }),
  vr("m_bol_veloz", "mage", "skill1", "Bola Veloz", { cd: -1.5 }),
  vr("m_rel_longo", "mage", "skill2", "Relâmpago Longo", { stunS: 0.4 }),
  vr("m_rel_concentrado", "mage", "skill2", "Raio Concentrado", { dmg: 4 }),
  vr("m_rel_veloz", "mage", "skill2", "Raio Veloz", { cd: -2 }),
  vr("m_chu_persistente", "mage", "skill3", "Fogo Persistente", { burnS: 3 }),
  vr("m_chu_ampla", "mage", "skill3", "Chuva Ampla", { radius: 0.8 }),
  vr("m_chu_ardente", "mage", "skill3", "Chuva Ardente", { dmg: 5 }),
  vr("m_met_pesado", "mage", "ultimate", "Meteoro Pesado", { dmg: 10 }),
  vr("m_met_gelido", "mage", "ultimate", "Meteoro Gélido", { rootS: 1.5 }),
  vr("m_met_veloz", "mage", "ultimate", "Meteoro Veloz", { cd: -10 }),
];

/** Variações de uma classe (as 3 de cada habilidade, na ordem do catálogo). */
export const variacoesDaClasse = (cls: CharClass): Variacao[] => VARIACOES.filter((v) => v.classe === cls);
export const variacaoPorId = (id: string): Variacao | undefined => VARIACOES.find((v) => v.id === id);
/** A habilidade já tem a escolha liberada neste nível? */
export const variacaoDesbloqueada = (slot: VariacaoSlot, level: number): boolean => level >= VARIACAO_NIVEL[slot];

/**
 * Lê a escolha guardada (JSON ou objeto) e fica só com o que vale para esta classe, esta habilidade e este nível.
 * O que não vale vira base: nada quebra se o banco tiver lixo.
 */
export function limparEscolhas(raw: unknown, cls: CharClass, level: number): EscolhasVariacao {
  let o: unknown = raw;
  if (typeof raw === "string") { try { o = JSON.parse(raw); } catch { o = null; } }
  const out: EscolhasVariacao = {};
  if (!o || typeof o !== "object") return out;
  for (const s of VARIACAO_SLOTS) {
    const id = (o as Record<string, unknown>)[s];
    if (typeof id !== "string") continue;
    const v = variacaoPorId(id);
    if (v && v.classe === cls && v.slot === s && variacaoDesbloqueada(s, level)) out[s] = id;
  }
  return out;
}

/** Modificadores para resolveAction a partir das escolhas (já limpas por limparEscolhas). */
export function modificadoresDaEscolha(escolhas: EscolhasVariacao): ActionModifier[] {
  const mods: ActionModifier[] = [];
  for (const s of VARIACAO_SLOTS) {
    const v = escolhas[s] ? variacaoPorId(escolhas[s] as string) : undefined;
    if (v) mods.push(...v.mods);
  }
  return mods;
}
