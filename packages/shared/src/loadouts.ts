import type { CharClass } from "./index";
import { VARIACAO_SLOTS, VARIACAO_NIVEL, variacaoPorId, variacaoDesbloqueada, type EscolhasVariacao, type VariacaoSlot } from "./variacoes";
import { limparTalentos, pontosGastos, pontosTotais, talentosDaClasse, type EscolhasTalentos } from "./talentos";
import { ITEMS, EQUIP_SLOTS, type EquipSlot } from "./items";
import { afixosValidos } from "./afixos";
import { refinoValido } from "./refino_stats";
import { gemasValidas } from "./engaste";

/**
 * LOADOUTS (C2.4). Cada personagem tem 3 slots de build. Cada slot guarda as variações escolhidas (C2.2)
 * e a distribuição de talentos (C2.3), com um nome editável (até 16 caracteres).
 *
 * Regras:
 *  - salvar e aplicar só na cidade (Brasalume) e fora de combate (o servidor decide; aqui fica a validação dos dados);
 *  - aplicar troca de uma vez as variações e os talentos, sem custo em tostões;
 *  - aplicar valida o build contra o nível ATUAL: variação de habilidade que ainda não libera e talentos acima dos pontos
 *    disponíveis (ou sem a porta do ramo) recusam o build com a mensagem daqui, em vez de cortar em silêncio;
 *  - o build ativo (último aplicado ou salvo) é guardado junto, e volta ao reconectar.
 * Função pura, compartilhada: o servidor valida e grava; o cliente mostra o resumo do slot.
 */

export const LOADOUT_SLOTS = 3;
export const LOADOUT_NOME_MAX = 16;
export const LOADOUT_COMBAT_LOCK_S = 8; // sem combate por este tempo antes de trocar de build (mesmo critério de atravessar portal)

/** Uma peça de equipamento como estava vestida: item, afixos, refino e gemas (C3.6 guarda o conjunto inteiro). */
export interface EquipSnap {
  id: string;
  af?: string[];
  rf?: number;
  gm?: string[];
}
/** Conjunto vestido por slot. Ausente = a peça não estava vestida ao salvar. */
export type EquipBuild = Partial<Record<EquipSlot, EquipSnap>>;

export interface LoadoutSlot {
  nome: string;
  salvo: boolean; // false = slot vazio (ainda não salvou nenhum build nele)
  variacoes: EscolhasVariacao;
  talentos: EscolhasTalentos;
  equipSalvo?: boolean; // C3.6: o slot tem um conjunto de equipamento salvo (independente dos talentos e variações)
  equip?: EquipBuild;
}
export interface Loadouts {
  ativo: number; // índice do build ativo (último aplicado ou salvo); -1 = nenhum
  slots: LoadoutSlot[];
}

const TECLA: Record<VariacaoSlot, string> = { skill1: "Q", skill2: "W", skill3: "E", ultimate: "Final" };

export const loadoutNomePadrao = (i: number): string => `Build ${i + 1}`;

/** Nome do slot: tira controle e marcação, colapsa espaços e corta em 16 caracteres. Vazio ou inválido vira o padrão. */
export function sanitizarNomeLoadout(raw: unknown, padrao: string): string {
  if (typeof raw !== "string") return padrao;
  const limpo = raw.replace(/[\u0000-\u001f\u007f<>]/g, "").replace(/\s+/g, " ").trim();
  const corte = Array.from(limpo).slice(0, LOADOUT_NOME_MAX).join("").trim();
  return corte || padrao;
}

export function loadoutsVazio(): Loadouts {
  return {
    ativo: -1,
    slots: Array.from({ length: LOADOUT_SLOTS }, (_, i) => ({ nome: loadoutNomePadrao(i), salvo: false, variacoes: {}, talentos: {}, equipSalvo: false, equip: {} })),
  };
}

/** Lê o JSON gravado (ou o que o cliente mandou). Só filtra o que não existe ou é de outra classe; NÃO corta por nível,
 *  para que validarLoadout possa recusar um build que o nível atual não comporta. */
export function limparLoadouts(raw: unknown, cls: CharClass): Loadouts {
  const o = lerObjeto(raw);
  const out = loadoutsVazio();
  const arr = Array.isArray(o.slots) ? o.slots : [];
  out.slots.forEach((s, i) => {
    const r = arr[i];
    if (!r || typeof r !== "object") return;
    const d = r as Record<string, unknown>;
    s.nome = sanitizarNomeLoadout(d.nome, s.nome);
    s.salvo = d.salvo === true;
    s.variacoes = variacoesBrutas(d.variacoes, cls);
    s.talentos = talentosBrutos(d.talentos, cls);
    s.equipSalvo = d.equipSalvo === true;
    s.equip = equipBruto(d.equip);
  });
  const a = typeof o.ativo === "number" ? Math.floor(o.ativo) : -1;
  out.ativo = a >= 0 && a < LOADOUT_SLOTS && out.slots[a].salvo ? a : -1;
  return out;
}

/** Diz por que um build não pode ser aplicado agora, ou ok. Usa o nível ATUAL do personagem. */
export function validarLoadout(slot: LoadoutSlot, cls: CharClass, level: number): { ok: true } | { ok: false; error: string } {
  if (!slot.salvo) return { ok: false, error: "Este slot está vazio: salve um build nele primeiro." };
  for (const s of VARIACAO_SLOTS) {
    const id = slot.variacoes[s];
    if (!id) continue;
    const v = variacaoPorId(id);
    if (!v || v.classe !== cls || v.slot !== s) return { ok: false, error: "Este build tem uma variação que não existe para esta classe." };
    if (!variacaoDesbloqueada(s, level)) return { ok: false, error: `A variação de ${TECLA[s]} libera no nível ${VARIACAO_NIVEL[s]} (você está no nível ${level}).` };
  }
  const gastos = pontosGastos(slot.talentos, cls);
  const totais = pontosTotais(level);
  if (gastos > totais) return { ok: false, error: `Este build usa ${gastos} ponto(s) de talento, e no nível ${level} você tem ${totais}.` };
  const aceitos = limparTalentos(slot.talentos, cls, level);
  for (const t of talentosDaClasse(cls)) {
    if ((slot.talentos[t.id] ?? 0) !== (aceitos[t.id] ?? 0)) return { ok: false, error: `Este build tem o talento ${t.nome} que o nível ${level} ainda não libera (falta ponto no ramo).` };
  }
  return { ok: true };
}

/** Chave de comparação de uma peça: mesmo item, mesmos afixos, refino e gemas (ordem não importa). */
export function chaveEquip(e: EquipSnap): string {
  return [e.id, [...(e.af ?? [])].sort().join(","), e.rf ?? 0, [...(e.gm ?? [])].sort().join(",")].join("|");
}

/** Diz se o conjunto de equipamento pode ser vestido neste nível e classe. Recusa com o motivo; não corta em silêncio. */
export function validarEquipBuild(build: EquipBuild, cls: CharClass, level: number): { ok: true } | { ok: false; error: string } {
  for (const s of EQUIP_SLOTS) {
    const e = build[s];
    if (!e) continue;
    const def = ITEMS[e.id];
    if (!def || def.kind !== s) return { ok: false, error: "Este build tem uma peça que não existe mais para este slot." };
    if (def.cls && def.cls !== cls) return { ok: false, error: `${def.name} só pode ser usado por outra classe.` };
    if (level < def.minLevel) return { ok: false, error: `${def.name} requer nível ${def.minLevel} (você está no nível ${level}).` };
  }
  const arma = build.weapon ? ITEMS[build.weapon.id] : undefined;
  if (arma?.hands === 2 && build.offhand) return { ok: false, error: "Este build tem arma de duas mãos e escudo: não combinam." };
  return { ok: true };
}

/** Nomes das peças salvas no slot (para o painel Builds). Vazio se não há equipamento salvo. */
export function resumoEquip(slot: LoadoutSlot): string[] {
  if (!slot.equipSalvo) return [];
  const pecas = EQUIP_SLOTS.filter((s) => slot.equip?.[s]).map((s) => ITEMS[slot.equip![s]!.id]?.name ?? "?");
  return pecas.length ? pecas : ["Sem peças vestidas"];
}

export interface ResumoLoadout {
  variacoes: string[]; // uma linha por habilidade: "Q: Flecha Veloz", "W: base"...
  talentos: string[]; // só os talentos com rank: "Golpe Firme 2/3"
  pontos: number; // pontos de talento gastos
}

/** Resumo curto do slot, para o cartão do painel Builds. */
export function resumoLoadout(slot: LoadoutSlot, cls: CharClass): ResumoLoadout {
  const variacoes = VARIACAO_SLOTS.map((s) => {
    const id = slot.variacoes[s];
    return `${TECLA[s]}: ${(id && variacaoPorId(id)?.nome) || "base"}`;
  });
  const talentos = talentosDaClasse(cls)
    .filter((t) => (slot.talentos[t.id] ?? 0) > 0)
    .map((t) => `${t.nome} ${slot.talentos[t.id]}/${t.max}`);
  return { variacoes, talentos, pontos: pontosGastos(slot.talentos, cls) };
}

// ---- helpers internos ----

function equipBruto(raw: unknown): EquipBuild {
  const o = lerObjeto(raw);
  const out: EquipBuild = {};
  for (const s of EQUIP_SLOTS) {
    const r = o[s];
    if (!r || typeof r !== "object") continue;
    const d = r as Record<string, unknown>;
    const def = typeof d.id === "string" ? ITEMS[d.id] : undefined;
    if (!def || def.kind !== s) continue;
    const af = afixosValidos(d.af, def.kind, def.rarity);
    const rf = refinoValido(d.rf);
    const gm = gemasValidas(d.gm, def.kind, def.rarity);
    out[s] = { id: def.id, ...(af.length ? { af } : {}), ...(rf ? { rf } : {}), ...(gm.length ? { gm } : {}) };
  }
  return out;
}

function lerObjeto(raw: unknown): Record<string, unknown> {
  let o: unknown = raw;
  if (typeof raw === "string") { try { o = JSON.parse(raw); } catch { o = null; } }
  return o && typeof o === "object" && !Array.isArray(o) ? (o as Record<string, unknown>) : {};
}

function variacoesBrutas(raw: unknown, cls: CharClass): EscolhasVariacao {
  const o = lerObjeto(raw);
  const out: EscolhasVariacao = {};
  for (const s of VARIACAO_SLOTS) {
    const id = o[s];
    if (typeof id !== "string") continue;
    const v = variacaoPorId(id);
    if (v && v.classe === cls && v.slot === s) out[s] = id;
  }
  return out;
}

function talentosBrutos(raw: unknown, cls: CharClass): EscolhasTalentos {
  const o = lerObjeto(raw);
  const out: EscolhasTalentos = {};
  for (const t of talentosDaClasse(cls)) {
    const n = typeof o[t.id] === "number" ? Math.floor(o[t.id] as number) : 0;
    if (n > 0) out[t.id] = Math.min(t.max, n);
  }
  return out;
}
