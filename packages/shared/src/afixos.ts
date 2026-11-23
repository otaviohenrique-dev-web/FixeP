// AFIXOS: atributos de ITEM (não de classe). Um item dropado de inimigo pode trazer de 0 a 3 afixos, sorteados
// pelo servidor na hora do drop (rng injetável para teste). Funções PURAS e dados: o servidor decide e grava; o cliente só mostra.
//
// Regras de design (pedido do dono do projeto):
//  - roubo de vida, queimadura e efeitos de proc (ao acertar / ao abater) são de item raro para cima;
//  - common e uncommon só recebem afixos simples e fracos;
//  - um item nunca tem o mesmo afixo duas vezes e nunca passa de MAX_AFIXOS (3);
//  - a faixa de valor é uma tabela por raridade (valores[0] = comum ... valores[5] = mítico): nada é sorteado no valor.
import type { ItemKind, Rarity } from "./items"; // só tipo: items.ts importa daqui (sem ciclo em tempo de execução)

/** Ordem das raridades que recebem equipamento (cópia de RARITIES de items.ts, para não criar import circular). */
const ORDEM: readonly Rarity[] = ["common", "uncommon", "rare", "epic", "legendary", "mythic"];
const rarityIndex = (r: Rarity) => ORDEM.indexOf(r);

export const MAX_AFIXOS = 3;

/** Tipos de item que podem receber cada afixo: "arma" (arma e mão secundária), "defesa" (armadura, elmo, botas, capa), "qualquer". */
export type AfixoAlvo = "arma" | "defesa" | "qualquer";

/**
 * Como o afixo age:
 *  - "stat": soma num campo de AfixoStats (valor fixo por raridade, aplicado no cálculo de status).
 *  - "proc": efeito que dispara em combate (ao acertar, ao abater, ao receber dano...): ver ZoneRoom.
 *  - pendente: o afixo existe no catálogo (drop, tooltip, persistência), mas o efeito ainda não está ligado no combate.
 */
export type AfixoStatKey =
  | "hp" | "dmgPct" | "crit" | "critDmg" | "dr" | "cdr" | "mana" | "regen" | "hpRegen" | "dodge" | "reflect" | "atkSpeed"
  | "goldPct" | "xpPct" | "healPct" | "bossPct" | "lifesteal" | "burnChance" | "hpOnKill" | "manaOnKill" | "execute";

export interface Afixo {
  id: string;
  nome: string; // PT-BR, como aparece no tooltip
  descricao: string; // o que faz, com o número da raridade mais baixa que o libera (o tooltip mostra o valor real)
  alvo: AfixoAlvo;
  minRaridade: Rarity; // a menor raridade que pode receber o afixo
  /** valor por raridade (índice = RARITIES: comum, incomum, raro, épico, lendário, mítico). Para efeitos de chance/pct é %. */
  valores: number[];
  /** campo que recebe o valor (stat) ou nome do proc (proc). `null` = ainda sem efeito no combate. */
  efeito: { tipo: "stat"; campo: AfixoStatKey } | { tipo: "proc"; nome: "lifesteal" | "burn" | "execute" } | null;
  unidade: "" | "%" | "/s" | " de vida" | " de mana";
}

const ALVO_KINDS: Record<AfixoAlvo, ItemKind[]> = {
  arma: ["weapon", "offhand"],
  defesa: ["helmet", "armor", "boots", "cape"],
  qualquer: ["weapon", "offhand", "helmet", "armor", "boots", "cape"],
};

const A = (a: Afixo): Afixo => a;

/** O catálogo. Ordem = ordem de exibição no tooltip. Valores: [comum, incomum, raro, épico, lendário, mítico]. */
export const AFIXOS: readonly Afixo[] = [
  // --- comuns e incomuns: simples e fracos
  A({ id: "vigor", nome: "Vigor", descricao: "Aumenta a vida máxima.", alvo: "defesa", minRaridade: "common", valores: [5, 10, 18, 28, 40, 55], efeito: { tipo: "stat", campo: "hp" }, unidade: "" }),
  A({ id: "afiado", nome: "Afiado", descricao: "Aumenta o dano de todas as habilidades.", alvo: "arma", minRaridade: "common", valores: [2, 4, 7, 10, 14, 18], efeito: { tipo: "stat", campo: "dmgPct" }, unidade: "%" }),
  A({ id: "couro_reforcado", nome: "Couro Reforçado", descricao: "Reduz o dano que você recebe.", alvo: "defesa", minRaridade: "common", valores: [1, 1, 2, 3, 4, 5], efeito: { tipo: "stat", campo: "dr" }, unidade: "%" }),
  A({ id: "olho_certeiro", nome: "Olho Certeiro", descricao: "Aumenta a chance de acerto crítico.", alvo: "arma", minRaridade: "common", valores: [1, 2, 3, 4, 6, 8], efeito: { tipo: "stat", campo: "crit" }, unidade: "%" }),
  A({ id: "folego", nome: "Fôlego", descricao: "Recupera mais recurso da classe por segundo.", alvo: "qualquer", minRaridade: "common", valores: [0.1, 0.2, 0.3, 0.5, 0.7, 1], efeito: { tipo: "stat", campo: "regen" }, unidade: "/s" }),
  A({ id: "passo_agil", nome: "Passo Ágil", descricao: "Reduz a recarga das habilidades.", alvo: "defesa", minRaridade: "uncommon", valores: [1, 2, 3, 4, 6, 8], efeito: { tipo: "stat", campo: "cdr" }, unidade: "%" }),
  A({ id: "reserva_arcana", nome: "Reserva Arcana", descricao: "Aumenta o máximo do recurso da classe (mana, fúria ou foco).", alvo: "qualquer", minRaridade: "uncommon", valores: [4, 8, 12, 18, 25, 35], efeito: { tipo: "stat", campo: "mana" }, unidade: "" }),
  A({ id: "vitalidade", nome: "Vitalidade", descricao: "Regenera vida por segundo.", alvo: "defesa", minRaridade: "uncommon", valores: [0.1, 0.2, 0.3, 0.5, 0.8, 1.2], efeito: { tipo: "stat", campo: "hpRegen" }, unidade: "/s" }),
  A({ id: "punhos_rapidos", nome: "Punhos Rápidos", descricao: "O ataque básico fica mais rápido.", alvo: "arma", minRaridade: "uncommon", valores: [2, 4, 6, 8, 10, 12], efeito: { tipo: "stat", campo: "atkSpeed" }, unidade: "%" }),
  A({ id: "mao_gananciosa", nome: "Mão Gananciosa", descricao: "Aumenta as moedas de tostões que você recolhe.", alvo: "qualquer", minRaridade: "uncommon", valores: [3, 5, 8, 12, 16, 20], efeito: { tipo: "stat", campo: "goldPct" }, unidade: "%" }),
  A({ id: "sabedoria", nome: "Sabedoria", descricao: "Aumenta o XP dos abates.", alvo: "qualquer", minRaridade: "uncommon", valores: [2, 4, 6, 9, 12, 15], efeito: { tipo: "stat", campo: "xpPct" }, unidade: "%" }),
  A({ id: "bencao", nome: "Bênção", descricao: "Você recebe mais cura de qualquer fonte.", alvo: "defesa", minRaridade: "uncommon", valores: [3, 5, 8, 11, 15, 20], efeito: { tipo: "stat", campo: "healPct" }, unidade: "%" }),
  // --- raros e épicos: efeitos moderados
  A({ id: "passo_fantasma", nome: "Passo Fantasma", descricao: "Chance de esquivar um golpe inimigo.", alvo: "defesa", minRaridade: "rare", valores: [1, 2, 3, 4, 6, 8], efeito: { tipo: "stat", campo: "dodge" }, unidade: "%" }),
  A({ id: "espinhos", nome: "Espinhos", descricao: "Devolve uma parte do dano recebido ao atacante.", alvo: "defesa", minRaridade: "rare", valores: [5, 8, 10, 15, 20, 25], efeito: { tipo: "stat", campo: "reflect" }, unidade: "%" }),
  A({ id: "essencia_drenada", nome: "Essência Drenada", descricao: "Ao abater um inimigo, recupera mana (ou o recurso da classe).", alvo: "arma", minRaridade: "rare", valores: [0, 0, 3, 5, 8, 12], efeito: { tipo: "stat", campo: "manaOnKill" }, unidade: " de mana" }),
  A({ id: "colheita_de_almas", nome: "Colheita de Almas", descricao: "Ao abater um inimigo, recupera vida.", alvo: "arma", minRaridade: "rare", valores: [0, 0, 2, 4, 6, 9], efeito: { tipo: "stat", campo: "hpOnKill" }, unidade: " de vida" }),
  A({ id: "cacador_de_chefes", nome: "Caçador de Chefes", descricao: "Causa mais dano a chefes.", alvo: "arma", minRaridade: "rare", valores: [0, 0, 5, 8, 12, 16], efeito: { tipo: "stat", campo: "bossPct" }, unidade: "%" }),
  A({ id: "golpe_brutal", nome: "Golpe Brutal", descricao: "Os golpes críticos causam mais dano.", alvo: "arma", minRaridade: "epic", valores: [0, 0, 0, 10, 15, 20], efeito: { tipo: "stat", campo: "critDmg" }, unidade: "%" }),
  A({ id: "barreira_de_brasa", nome: "Barreira de Brasa", descricao: "Aumenta o dano que você causa com habilidades de área.", alvo: "arma", minRaridade: "epic", valores: [0, 0, 0, 6, 9, 12], efeito: { tipo: "stat", campo: "dmgPct" }, unidade: "%" }),
  A({ id: "recuperacao_rapida", nome: "Recuperação Rápida", descricao: "Reduz mais a recarga das habilidades.", alvo: "defesa", minRaridade: "epic", valores: [0, 0, 0, 4, 6, 9], efeito: { tipo: "stat", campo: "cdr" }, unidade: "%" }),
  A({ id: "vida_extra_epica", nome: "Couraça Viva", descricao: "Aumenta bastante a vida máxima.", alvo: "defesa", minRaridade: "epic", valores: [0, 0, 0, 30, 45, 60], efeito: { tipo: "stat", campo: "hp" }, unidade: "" }),
  A({ id: "sorte_do_saque", nome: "Sorte do Saque", descricao: "Aumenta a chance de cair equipamento dos inimigos.", alvo: "qualquer", minRaridade: "rare", valores: [0, 0, 3, 5, 8, 12], efeito: null, unidade: "%" }),
  A({ id: "vontade_de_ferro", nome: "Vontade de Ferro", descricao: "Atordoamento e lentidão duram menos em você.", alvo: "defesa", minRaridade: "rare", valores: [0, 0, 5, 10, 15, 20], efeito: null, unidade: "%" }),
  A({ id: "perfuracao", nome: "Perfuração", descricao: "Ignora parte da defesa do inimigo nos golpes.", alvo: "arma", minRaridade: "epic", valores: [0, 0, 0, 5, 8, 12], efeito: null, unidade: "%" }),
  A({ id: "barreira_inicial", nome: "Barreira Inicial", descricao: "Cria um escudo ao entrar em combate.", alvo: "defesa", minRaridade: "epic", valores: [0, 0, 0, 15, 25, 40], efeito: null, unidade: " de vida" }),
  A({ id: "pes_leves", nome: "Pés Leves", descricao: "Você anda mais depressa.", alvo: "defesa", minRaridade: "common", valores: [2, 4, 6, 8, 10, 14], efeito: null, unidade: "%" }),
  // --- lendários e míticos: os poderosos (roubo de vida, queimadura, execução)
  A({ id: "roubo_de_vida", nome: "Roubo de Vida", descricao: "Cada golpe que acerta cura você por uma parte do dano causado.", alvo: "arma", minRaridade: "legendary", valores: [0, 0, 0, 0, 3, 5], efeito: { tipo: "proc", nome: "lifesteal" }, unidade: "%" }),
  A({ id: "queimadura_ao_acertar", nome: "Queimadura ao Acertar", descricao: "Golpes podem deixar o inimigo em chamas (dano ao longo do tempo).", alvo: "arma", minRaridade: "legendary", valores: [0, 0, 0, 0, 20, 30], efeito: { tipo: "proc", nome: "burn" }, unidade: "%" }),
  A({ id: "execucao", nome: "Execução", descricao: "Golpes causam mais dano a inimigos com pouca vida.", alvo: "arma", minRaridade: "legendary", valores: [0, 0, 0, 0, 25, 40], efeito: { tipo: "proc", nome: "execute" }, unidade: "%" }),
  A({ id: "dano_de_mito", nome: "Ira Mítica", descricao: "Aumenta muito o dano de todas as habilidades.", alvo: "arma", minRaridade: "mythic", valores: [0, 0, 0, 0, 0, 12], efeito: { tipo: "stat", campo: "dmgPct" }, unidade: "%" }),
];

export const AFIXO_BY_ID: Record<string, Afixo> = Object.fromEntries(AFIXOS.map((a) => [a.id, a]));

/** Quantos afixos um drop de cada raridade recebe: [mínimo, máximo] (sorteado com o rng). Comum pode sair sem nenhum. */
export const AFIXOS_POR_RARIDADE: Record<Rarity, [number, number]> = {
  junk: [0, 0], common: [0, 1], uncommon: [1, 1], rare: [1, 2], epic: [2, 2], legendary: [2, 3], mythic: [3, 3], ancestral: [3, 3],
};

/** Tipos de item que recebem afixos: toda arma, mão secundária e peça de defesa (todo equipamento). */
export const KINDS_EQUIPAVEIS: readonly ItemKind[] = ["weapon", "offhand", "helmet", "armor", "boots", "cape"];

/**
 * O afixo é possível para este tipo de item e esta raridade? Afixos sem efeito no combate (efeito null) NÃO saem:
 * um item não pode trazer uma linha que não faz nada (ficam no catálogo até ganharem efeito).
 */
export function afixoElegivel(a: Afixo, kind: ItemKind, rarity: Rarity): boolean {
  return a.efeito !== null && ALVO_KINDS[a.alvo].includes(kind) && rarityIndex(rarity) >= rarityIndex(a.minRaridade);
}

/** Valor do afixo para esta raridade (0 se ela não o libera). */
export function valorDoAfixo(id: string, rarity: Rarity): number {
  const a = AFIXO_BY_ID[id];
  const i = ORDEM.indexOf(rarity);
  if (!a || i < 0 || rarityIndex(rarity) < rarityIndex(a.minRaridade)) return 0;
  return a.valores[i] ?? 0;
}

/** Afixos de ARMA (arma e mão secundária) que são ofensivos: são os únicos que saem em arma de raridade rara ou acima. */
export const AFIXOS_OFENSIVOS_ARMA: ReadonlySet<string> = new Set([
  "afiado", "olho_certeiro", "punhos_rapidos", "essencia_drenada", "colheita_de_almas", "cacador_de_chefes",
  "golpe_brutal", "barreira_de_brasa", "roubo_de_vida", "queimadura_ao_acertar", "execucao", "dano_de_mito",
]);

/**
 * Sorteia os afixos de um drop: quantidade pela raridade (AFIXOS_POR_RARIDADE), sem repetir e só entre os elegíveis.
 * Arma (ou mão secundária) de raridade rara ou acima sorteia SÓ afixos ofensivos (AFIXOS_OFENSIVOS_ARMA).
 * Função pura: mesmo rng, mesmo resultado. Nunca passa de MAX_AFIXOS.
 */
export function sortearAfixos(kind: ItemKind, rarity: Rarity, rng: () => number = Math.random): string[] {
  const [lo, hi] = AFIXOS_POR_RARIDADE[rarity] ?? [0, 0];
  const quantos = Math.min(MAX_AFIXOS, lo + Math.floor(rng() * (hi - lo + 1)));
  const armaAlta = (kind === "weapon" || kind === "offhand") && rarityIndex(rarity) >= rarityIndex("rare");
  const pool = AFIXOS.filter((a) => afixoElegivel(a, kind, rarity) && (!armaAlta || AFIXOS_OFENSIVOS_ARMA.has(a.id))).map((a) => a.id);
  const out: string[] = [];
  while (out.length < quantos && pool.length > 0) {
    const i = Math.floor(rng() * pool.length);
    out.push(pool.splice(i, 1)[0]);
  }
  return out;
}

/** Semente de texto -> número (FNV-1a): mesmo texto, mesmo número, em qualquer máquina. */
function hashSemente(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
  return h >>> 0;
}

/** Gerador pseudoaleatório pequeno (mulberry32): a mesma semente dá sempre a mesma sequência. */
function gerador(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Afixos DETERMINÍSTICOS para um item que já existia sem afixos (backfill): a semente é um texto fixo
 * (ex.: personagem + espaço + id do item), então o mesmo item sempre recebe os mesmos afixos.
 */
export function afixosDaSemente(semente: string, kind: ItemKind, rarity: Rarity): string[] {
  return sortearAfixos(kind, rarity, gerador(hashSemente(semente)));
}

/**
 * Limpa uma lista vinda do cliente ou do banco: só ids conhecidos, elegíveis para o item, sem repetição e até MAX_AFIXOS.
 * Lista vazia ou inválida = item sem afixos (itens antigos continuam válidos).
 */
export function afixosValidos(raw: unknown, kind: ItemKind, rarity: Rarity): string[] {
  let list: unknown = raw;
  if (typeof raw === "string") { try { list = JSON.parse(raw); } catch { list = null; } }
  if (!Array.isArray(list)) return [];
  const out: string[] = [];
  for (const id of list) {
    if (typeof id !== "string" || out.includes(id)) continue;
    const a = AFIXO_BY_ID[id];
    if (!a || !afixoElegivel(a, kind, rarity)) continue;
    out.push(id);
    if (out.length >= MAX_AFIXOS) break;
  }
  return out;
}

/** Soma dos efeitos de stat de uma lista de afixos (já válida) para o status. Campos sem afixo ficam em 0. */
export type AfixoStats = Record<AfixoStatKey, number>;
export const emptyAfixoStats = (): AfixoStats => ({
  hp: 0, dmgPct: 0, crit: 0, critDmg: 0, dr: 0, cdr: 0, mana: 0, regen: 0, hpRegen: 0, dodge: 0, reflect: 0, atkSpeed: 0,
  goldPct: 0, xpPct: 0, healPct: 0, bossPct: 0, lifesteal: 0, burnChance: 0, hpOnKill: 0, manaOnKill: 0, execute: 0,
});

/** Soma os efeitos de stat de um item (raridade dada) e, de carona, os procs (lifesteal, burn, execute). */
export function afixoStats(ids: readonly string[], rarity: Rarity): AfixoStats {
  const s = emptyAfixoStats();
  for (const id of ids) {
    const a = AFIXO_BY_ID[id];
    if (!a || !a.efeito) continue;
    const v = valorDoAfixo(id, rarity);
    if (a.efeito.tipo === "stat") s[a.efeito.campo] += v;
    else if (a.efeito.nome === "lifesteal") s.lifesteal += v;
    else if (a.efeito.nome === "burn") s.burnChance += v;
    else if (a.efeito.nome === "execute") s.execute += v;
  }
  return s;
}

/** Linha do tooltip para um afixo nesta raridade (ex.: "+5% de dano de todas as habilidades"). */
export function afixoLinha(id: string, rarity: Rarity): string {
  const a = AFIXO_BY_ID[id];
  if (!a) return id;
  const v = valorDoAfixo(id, rarity);
  const n = Number.isInteger(v) ? String(v) : String(v).replace(".", ",");
  return `${a.nome}: +${n}${a.unidade} — ${a.descricao}`;
}

/** Todos os afixos do catálogo que ainda não têm efeito no combate (para a PR e para testes). */
export const AFIXOS_PENDENTES: readonly string[] = AFIXOS.filter((a) => !a.efeito).map((a) => a.id);
