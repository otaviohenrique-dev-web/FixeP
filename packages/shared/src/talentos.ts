import type { CharClass } from "./index";
import { MAX_CDR, MAX_DR, type GearBonuses } from "./items";

/**
 * TALENTOS (C2.3). Um ponto por nível a partir do nível 6 (nível 6 = 1 ponto, nível 50 = 45 pontos).
 * Cada classe tem 3 ramos, cada ramo é uma LISTA de 4 talentos (sem árvore gráfica): 2 de nível 1, 1 de nível 2 e 1 de nível 3.
 * Só passivas NUMÉRICAS simples que somam aos status do personagem (dano, vida, recurso, recarga, cura, redução de dano, crítico).
 * Nada de efeito exclusivo de item (roubo de vida, queimadura, etc.: isso é afixo de item, afixos.ts).
 *
 * Regras:
 *  - cada talento tem até `max` ranks; cada rank custa `custo` pontos (1, ou 2 nos de nível 3) e soma `porRank` ao stat;
 *  - talento de nível 2 exige 3 pontos gastos no ramo; de nível 3 exige 6 (o nível do talento é a "porta" do ramo);
 *  - gastar é livre (em qualquer lugar); RESET (zerar todos os ranks) só na cidade e pagando tostões: 50 × (resets + 1).
 * Função pura, compartilhada: o servidor decide e grava; o cliente só mostra (pontos livres, o que pode subir).
 */

export const TALENTO_NIVEL_INICIAL = 6; // o primeiro ponto vem no nível 6
export const TALENTO_RESET_BASE = 50; // tostões do primeiro reset; cada reset custa mais 50
export const TALENTO_PORTA = { 1: 0, 2: 3, 3: 6 } as const; // pontos gastos no ramo para liberar cada nível de talento

export type TalentoStat = "dano" | "vida" | "mana" | "recarga" | "cura" | "armadura" | "critico";
export type RamoIdx = 0 | 1 | 2;
export type Tier = 1 | 2 | 3;

export interface TalentoDef {
  id: string;
  classe: CharClass;
  ramo: RamoIdx;
  tier: Tier;
  nome: string;
  stat: TalentoStat;
  porRank: number; // quanto cada rank soma (% para dano, cura, armadura, recarga e crítico; valor fixo para vida e recurso)
  max: number; // ranks máximos
  custo: 1 | 2; // pontos por rank
}
export interface RamoDef { nome: string; descricao: string }
/** Escolhas do personagem: id do talento -> ranks gastos. Sem a chave = 0. */
export type EscolhasTalentos = Record<string, number>;

export const TALENTO_STAT_LABEL: Record<TalentoStat, string> = {
  dano: "dano", vida: "vida máxima", mana: "recurso máximo", recarga: "recarga", cura: "cura", armadura: "redução de dano", critico: "chance de crítico",
};

const tl = (classe: CharClass, ramo: RamoIdx, tier: Tier, id: string, nome: string, stat: TalentoStat, porRank: number, max: number): TalentoDef =>
  ({ id, classe, ramo, tier, nome, stat, porRank, max, custo: tier === 3 ? 2 : 1 });

export const TALENTO_RAMOS: Record<CharClass, [RamoDef, RamoDef, RamoDef]> = {
  warrior: [
    { nome: "Couraça", descricao: "Aguentar golpes e curar-se na linha de frente." },
    { nome: "Fúria", descricao: "Golpes mais fortes e mais frequentes." },
    { nome: "Disciplina", descricao: "Fôlego, ritmo e resistência." },
  ],
  archer: [
    { nome: "Precisão", descricao: "Acertar o alvo certo, na hora certa." },
    { nome: "Caçada", descricao: "Passo leve, armadilhas e tiros certeiros." },
    { nome: "Sobrevivência", descricao: "Couro, fôlego e abrigo na mata." },
  ],
  cleric: [
    { nome: "Devoção", descricao: "Curar mais e manter o recurso cheio." },
    { nome: "Proteção", descricao: "Escudo da fé e carne abençoada." },
    { nome: "Luz", descricao: "Chama sagrada, olhar justo e julgamento." },
  ],
  mage: [
    { nome: "Arcano", descricao: "Mais poder nas magias e reservatório maior." },
    { nome: "Concentração", descricao: "Recarga menor e mente clara." },
    { nome: "Barreira", descricao: "Pele mágica e véu de runas." },
  ],
};

export const TALENTOS: TalentoDef[] = [
  // Guerreiro
  tl("warrior", 0, 1, "g_cou_vida", "Couraça Viva", "vida", 10, 5),
  tl("warrior", 0, 1, "g_cou_arm", "Pele de Ferro", "armadura", 2, 5),
  tl("warrior", 0, 2, "g_cou_cura", "Vigor Bélico", "cura", 5, 5),
  tl("warrior", 0, 3, "g_cou_muralha", "Muralha", "armadura", 3, 3),
  tl("warrior", 1, 1, "g_fur_dano", "Golpe Firme", "dano", 3, 5),
  tl("warrior", 1, 1, "g_fur_crit", "Sangue Quente", "critico", 1, 5),
  tl("warrior", 1, 2, "g_fur_recarga", "Ímpeto", "recarga", 2, 5),
  tl("warrior", 1, 3, "g_fur_carnif", "Carnificina", "dano", 4, 3),
  tl("warrior", 2, 1, "g_dis_mana", "Fôlego", "mana", 5, 5),
  tl("warrior", 2, 1, "g_dis_vida", "Resistência", "vida", 10, 5),
  tl("warrior", 2, 2, "g_dis_recarga", "Ritmo Constante", "recarga", 2, 5),
  tl("warrior", 2, 3, "g_dis_tenac", "Tenacidade", "cura", 8, 3),
  // Arqueiro
  tl("archer", 0, 1, "a_pre_dano", "Mira Firme", "dano", 3, 5),
  tl("archer", 0, 1, "a_pre_crit", "Olho de Águia", "critico", 1, 5),
  tl("archer", 0, 2, "a_pre_recarga", "Disparo Ágil", "recarga", 2, 5),
  tl("archer", 0, 3, "a_pre_ponta", "Ponta Mortal", "dano", 4, 3),
  tl("archer", 1, 1, "a_cac_vida", "Passo Leve", "vida", 10, 5),
  tl("archer", 1, 1, "a_cac_recarga", "Armadilheiro", "recarga", 2, 5),
  tl("archer", 1, 2, "a_cac_dano", "Rastro", "dano", 3, 5),
  tl("archer", 1, 3, "a_cac_presa", "Presa", "critico", 2, 3),
  tl("archer", 2, 1, "a_sob_arm", "Couro Curtido", "armadura", 2, 5),
  tl("archer", 2, 1, "a_sob_mana", "Fôlego Largo", "mana", 5, 5),
  tl("archer", 2, 2, "a_sob_cura", "Vigília", "cura", 5, 5),
  tl("archer", 2, 3, "a_sob_abrigo", "Abrigo", "armadura", 3, 3),
  // Clérigo
  tl("cleric", 0, 1, "c_dev_cura", "Bênção Fervorosa", "cura", 4, 5),
  tl("cleric", 0, 1, "c_dev_mana", "Oração Constante", "mana", 5, 5),
  tl("cleric", 0, 2, "c_dev_cura2", "Fluxo Sagrado", "cura", 5, 5),
  tl("cleric", 0, 3, "c_dev_graca", "Graça Plena", "cura", 8, 3),
  tl("cleric", 1, 1, "c_pro_arm", "Escudo da Fé", "armadura", 2, 5),
  tl("cleric", 1, 1, "c_pro_vida", "Carne Abençoada", "vida", 10, 5),
  tl("cleric", 1, 2, "c_pro_arm2", "Guardião", "armadura", 2, 5),
  tl("cleric", 1, 3, "c_pro_aegis", "Égide", "armadura", 3, 3),
  tl("cleric", 2, 1, "c_luz_dano", "Chama Sagrada", "dano", 3, 5),
  tl("cleric", 2, 1, "c_luz_crit", "Olhar Justo", "critico", 1, 5),
  tl("cleric", 2, 2, "c_luz_recarga", "Rito Ágil", "recarga", 2, 5),
  tl("cleric", 2, 3, "c_luz_julg", "Julgamento Pleno", "dano", 4, 3),
  // Mago
  tl("mage", 0, 1, "m_arc_dano", "Poder Arcano", "dano", 3, 5),
  tl("mage", 0, 1, "m_arc_mana", "Reservatório", "mana", 5, 5),
  tl("mage", 0, 2, "m_arc_crit", "Ressonância", "critico", 1, 5),
  tl("mage", 0, 3, "m_arc_tempest", "Tempestade Arcana", "dano", 4, 3),
  tl("mage", 1, 1, "m_con_recarga", "Foco Cristalino", "recarga", 2, 5),
  tl("mage", 1, 1, "m_con_mana", "Mente Clara", "mana", 5, 5),
  tl("mage", 1, 2, "m_con_cura", "Fluxo Vital", "cura", 5, 5),
  tl("mage", 1, 3, "m_con_ciclo", "Ciclo Eterno", "recarga", 3, 3),
  tl("mage", 2, 1, "m_bar_vida", "Pele Mágica", "vida", 10, 5),
  tl("mage", 2, 1, "m_bar_arm", "Véu Arcano", "armadura", 2, 5),
  tl("mage", 2, 2, "m_bar_arm2", "Escudo Rúnico", "armadura", 2, 5),
  tl("mage", 2, 3, "m_bar_fort", "Fortaleza Interior", "vida", 15, 3),
];

export const talentosDaClasse = (cls: CharClass): TalentoDef[] => TALENTOS.filter((t) => t.classe === cls);
export const talentoPorId = (id: string): TalentoDef | undefined => TALENTOS.find((t) => t.id === id);

/** Pontos totais do personagem neste nível (sem contar o que já foi gasto). */
export const pontosTotais = (level: number): number => Math.max(0, Math.floor(level) - (TALENTO_NIVEL_INICIAL - 1));

/** Pontos gastos no total (ranks × custo). */
export function pontosGastos(esc: EscolhasTalentos, cls: CharClass): number {
  let n = 0;
  for (const t of talentosDaClasse(cls)) n += (esc[t.id] ?? 0) * t.custo;
  return n;
}

/** Pontos gastos num ramo (a porta de cada nível de talento usa este número). */
export function pontosNoRamo(esc: EscolhasTalentos, cls: CharClass, ramo: RamoIdx): number {
  let n = 0;
  for (const t of talentosDaClasse(cls)) if (t.ramo === ramo) n += (esc[t.id] ?? 0) * t.custo;
  return n;
}

export const pontosLivres = (esc: EscolhasTalentos, cls: CharClass, level: number): number => pontosTotais(level) - pontosGastos(esc, cls);

/**
 * Lê o JSON gravado (ou o que o cliente mandou) e devolve escolhas VÁLIDAS para a classe e o nível:
 * ids de outra classe somem, ranks passam do máximo são cortados e o que não cabe nos pontos ou na porta do ramo é descartado
 * (na ordem do catálogo, então é determinístico). Dado corrompido nunca vira bônus.
 */
export function limparTalentos(raw: unknown, cls: CharClass, level: number): EscolhasTalentos {
  let obj: Record<string, unknown> = {};
  if (typeof raw === "string") { try { obj = JSON.parse(raw) ?? {}; } catch { obj = {}; } } else if (raw && typeof raw === "object") obj = raw as Record<string, unknown>;
  const out: EscolhasTalentos = {};
  let budget = pontosTotais(level);
  for (const t of talentosDaClasse(cls)) {
    const want = typeof obj[t.id] === "number" ? Math.floor(obj[t.id] as number) : 0;
    let r = Math.max(0, Math.min(t.max, want));
    while (r > 0 && (r * t.custo > budget || pontosNoRamo(out, cls, t.ramo) < TALENTO_PORTA[t.tier])) r--;
    if (r > 0) { out[t.id] = r; budget -= r * t.custo; }
  }
  return out;
}

/** Pode subir um rank deste talento? Devolve o motivo quando não pode (o servidor manda o texto ao jogador). */
export function podeSubirTalento(esc: EscolhasTalentos, cls: CharClass, level: number, id: string): { ok: true } | { ok: false; error: string } {
  const t = talentoPorId(id);
  if (!t || t.classe !== cls) return { ok: false, error: "Talento desconhecido para esta classe." };
  if ((esc[t.id] ?? 0) >= t.max) return { ok: false, error: `${t.nome} já está no máximo.` };
  if (pontosLivres(esc, cls, level) < t.custo) return { ok: false, error: "Sem pontos de talento livres." };
  const falta = TALENTO_PORTA[t.tier] - pontosNoRamo(esc, cls, t.ramo);
  if (falta > 0) return { ok: false, error: `Faltam ${falta} ponto(s) neste ramo para liberar ${t.nome}.` };
  return { ok: true };
}

/** Escolhas com +1 rank no talento (só use depois de podeSubirTalento). */
export function subirTalento(esc: EscolhasTalentos, id: string): EscolhasTalentos {
  return { ...esc, [id]: (esc[id] ?? 0) + 1 };
}

/** Custo do reset em tostões, dado quantos resets o personagem já fez: 50, 100, 150... */
export const resetCusto = (resets: number): number => TALENTO_RESET_BASE * (Math.max(0, Math.floor(resets)) + 1);

/** Soma o efeito dos talentos escolhidos aos bônus de equipamento (sem mexer no original). Os tetos de recarga e redução de dano valem também aqui. */
export function aplicarTalentos(gear: GearBonuses, esc: EscolhasTalentos, cls: CharClass): GearBonuses {
  const g: GearBonuses = { ...gear, af: { ...gear.af } };
  for (const t of talentosDaClasse(cls)) {
    const r = esc[t.id] ?? 0;
    if (r <= 0) continue;
    const v = t.porRank * r;
    switch (t.stat) {
      case "dano": g.dmgPct += v; break;
      case "vida": g.hp += v; break;
      case "mana": g.mana += v; break;
      case "recarga": g.cdr += v; break;
      case "cura": g.af.healPct += v; break;
      case "armadura": g.dr += v; break;
      case "critico": g.crit += v; break;
    }
  }
  g.cdr = Math.min(MAX_CDR, g.cdr);
  g.dr = Math.min(MAX_DR, g.dr);
  return g;
}

/** Texto curto do efeito de um talento: "+3% de dano por rank" etc. */
export function talentoEfeitoTexto(t: TalentoDef): string {
  const sinal = t.stat === "recarga" ? "−" : "+";
  const pct = t.stat === "vida" || t.stat === "mana" ? "" : "%";
  return `${sinal}${t.porRank}${pct} de ${TALENTO_STAT_LABEL[t.stat]} por rank`;
}
