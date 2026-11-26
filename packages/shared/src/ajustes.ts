import { CLASS_DEFS, CLASS_SPECS, ENEMY_KINDS, ITEMS, SKELETON, type ActionId, type ActionSpec, type CharClass, type EnemyKind } from "./index";

/**
 * Balanceamento ao vivo: o MAPA de valores ajustáveis. É GERADO das definições (CLASS_SPECS e ENEMY_KINDS):
 * classe ou inimigo novo entra sozinho. Sem nenhum ajuste salvo, todo valor é o padrão do código e nada muda.
 *
 * Chaves do mapa:
 *  - classe.<id>.vidaBase              vida base da classe (antes de nível e equipamento)
 *  - habilidade.<classe>.<slot>.dano   dano base da habilidade (slot: attack, skill1, skill2, skill3, ultimate, skill1Alt)
 *  - inimigo.<tipo>.hp                 vida do tipo no nível 1 (o nível sobe pela fórmula de enemyHp)
 *  - inimigo.<tipo>.dano               dano base do tipo no nível 1 (o nível sobe pela fórmula de enemyDmg)
 *  - inimigo.<tipo>.xp                 XP ao morrer, em % do padrão
 *  - inimigo.<tipo>.velocidade         velocidade de movimento, em centésimos de tile/s (escala 100)
 *  - inimigo.<tipo>.ataque             pausa depois de cada golpe, em centésimos de segundo (escala 100)
 *  - inimigo.<tipo>.aggro              alcance de agressão, em tiles
 *  - inimigo.<tipo>.respawn            tempo para renascer, em segundos
 *  - inimigo.<tipo>.grupo              tamanho do grupo nos pontos de caça, em % do padrão
 *  - inimigo.<tipo>.tostoes            tostões que o tipo solta, em % do padrão
 *  - global.xp | global.drop | global.tostoes   multiplicadores gerais (% do padrão; base para eventos tipo "XP em dobro")
 *
 * Tabela de drops (dinâmica, uma linha por item x inimigo): drop.<tipo>.<item>.chance | .min | .max
 *  chance = % por abate (0 = fora da tabela); min/max = quantidade por drop. Padrão: chance 0 (não cai), min/max 1.
 *
 * Os valores que mudam comportamento de forma contínua são aplicados IN PLACE nas definições do código
 * (ENEMY_KINDS, CLASS_SPECS, CLASS_DEFS); XP, grupo, tostões, drops e globais são lidos na hora de usar.
 */

export interface AjusteDef { chave: string; nome: string; grupo: string; padrao: number; min: number; max: number; unidade?: string; escala?: number }
/** Evento enviado aos clientes: valores efetivos de todas as chaves do mapa. */
export interface BalanceEvent { valores: Record<string, number> }
export interface EntradaTabela { item: string; chance: number; min: number; max: number }

interface Entrada { def: AjusteDef; /** v = valor do ajuste, ou null para voltar ao padrão original do código */ aplicar: (v: number | null) => void }

/** limites de segurança: de 30% a 300% do padrão (nunca abaixo de 1) */
const limitesDe = (padrao: number) => ({ min: Math.max(1, Math.floor(padrao * 0.3)), max: Math.max(1, Math.ceil(padrao * 3)) });

// montado na primeira vez que é preciso (e ANTES de qualquer aplicação), para guardar os valores originais do código
let entradas: Entrada[] | null = null;
let porChave = new Map<string, Entrada>();
/** só os valores que diferem do padrão (o que o admin salvou), inclusive as linhas da tabela de drops */
const ativos = new Map<string, number>();
/** tabela de drops efetiva: inimigo -> itens com chance acima de zero */
let tabelas = new Map<string, Map<string, EntradaTabela>>();

const CAMPOS_DROP = { chance: { padrao: 0, min: 0, max: 100 }, min: { padrao: 1, min: 1, max: 50 }, max: { padrao: 1, min: 1, max: 50 } } as const;
type CampoDrop = keyof typeof CAMPOS_DROP;

function montar(): Entrada[] {
  const out: Entrada[] = [];
  const add = (chave: string, nome: string, grupo: string, padrao: number, aplicar: Entrada["aplicar"], extra: Partial<AjusteDef> = {}) => {
    out.push({ def: { chave, nome, grupo, padrao, ...limitesDe(padrao), ...extra }, aplicar });
  };
  const noop = () => {};
  for (const cls of Object.keys(CLASS_SPECS) as CharClass[]) {
    const spec = CLASS_SPECS[cls];
    const def = CLASS_DEFS[cls];
    const vida0 = spec.maxHp;
    add(`classe.${cls}.vidaBase`, `Vida base de ${spec.name}`, `Classe: ${spec.name}`, vida0, (v) => {
      const val = v ?? vida0;
      spec.maxHp = val;
      def.maxHp = val;
    });
    const slots: [string, ActionSpec][] = Object.entries(spec.actions) as [string, ActionSpec][];
    if (spec.skill1Alt) slots.push(["skill1Alt", spec.skill1Alt]);
    for (const [slot, a] of slots) {
      const eff = a.effects?.find((e) => e.t === "damage");
      if (!eff || eff.t !== "damage") continue; // habilidade sem dano (cura, buff...): fora do mapa de dano
      const dano0 = eff.amount;
      const alvo = slot === "skill1Alt" ? def.skill1Alt : def.actions[slot as ActionId];
      add(`habilidade.${cls}.${slot}.dano`, `Dano de ${a.name} (${spec.name})`, `Habilidade: ${spec.name}`, dano0, (v) => {
        const val = v ?? dano0;
        eff.amount = val;
        if (alvo) alvo.dmg = val;
      });
    }
  }
  for (const k of Object.keys(ENEMY_KINDS) as EnemyKind[]) {
    const K = ENEMY_KINDS[k];
    const g = `Inimigo: ${K.name}`;
    const hpMul0 = K.hpMul, dmgMul0 = K.dmgMul, speed0 = K.speed, recover0 = K.recoverS, aggro0 = K.aggro, respawn0 = K.respawnS;
    add(`inimigo.${k}.hp`, `Vida de ${K.name}`, g, Math.round(SKELETON.maxHp * hpMul0), (v) => {
      K.hpMul = v == null ? hpMul0 : v / SKELETON.maxHp;
    });
    add(`inimigo.${k}.dano`, `Dano de ${K.name}`, g, Math.round(SKELETON.dmg * dmgMul0), (v) => {
      K.dmgMul = v == null ? dmgMul0 : v / SKELETON.dmg;
    });
    add(`inimigo.${k}.xp`, `XP ao morrer: ${K.name}`, g, 100, noop, { unidade: "% do padrão" });
    add(`inimigo.${k}.velocidade`, `Velocidade: ${K.name}`, g, Math.round(speed0 * 100), (v) => { K.speed = v == null ? speed0 : v / 100; }, { unidade: "tiles/s", escala: 100 });
    add(`inimigo.${k}.ataque`, `Pausa depois do golpe: ${K.name}`, g, Math.round(recover0 * 100), (v) => { K.recoverS = v == null ? recover0 : v / 100; }, { unidade: "s", escala: 100 });
    add(`inimigo.${k}.aggro`, `Alcance de agressão: ${K.name}`, g, aggro0, (v) => { K.aggro = v ?? aggro0; }, { unidade: "tiles" });
    add(`inimigo.${k}.respawn`, `Tempo de renascimento: ${K.name}`, g, respawn0, (v) => { K.respawnS = v ?? respawn0; }, { unidade: "s" });
    add(`inimigo.${k}.grupo`, `Tamanho do grupo nos pontos de caça: ${K.name}`, g, 100, noop, { unidade: "% do padrão" });
    add(`inimigo.${k}.tostoes`, `Tostões que solta: ${K.name}`, g, 100, noop, { unidade: "% do padrão" });
  }
  add("global.xp", "XP geral (todos os inimigos)", "Global", 100, noop, { unidade: "% do padrão" });
  add("global.drop", "Chance de drop geral (equipamento, poção, material e tabela)", "Global", 100, noop, { unidade: "% do padrão" });
  add("global.tostoes", "Tostões gerais (todos os inimigos)", "Global", 100, noop, { unidade: "% do padrão" });
  porChave = new Map(out.map((e) => [e.def.chave, e]));
  return out;
}

const mapa = (): Entrada[] => (entradas ??= montar());
const entrada = (chave: string): Entrada | undefined => (mapa(), porChave.get(chave));

/** "drop.<tipo>.<item>.<campo>" -> partes; null se não for chave de drop */
function parseDrop(chave: string): { kind: string; item: string; campo: CampoDrop } | null {
  const p = chave.split(".");
  if (p.length !== 4 || p[0] !== "drop") return null;
  if (p[3] !== "chance" && p[3] !== "min" && p[3] !== "max") return null;
  return { kind: p[1], item: p[2], campo: p[3] };
}
function dropValido(kind: string, item: string): string | null {
  if (!(kind in ENEMY_KINDS)) return "Inimigo desconhecido.";
  if (!(item in ITEMS)) return "Item desconhecido.";
  return null;
}
/** valor de um campo da linha de drop, com padrão quando não há ajuste */
function campoDrop(kind: string, item: string, campo: CampoDrop): number {
  return ativos.get(`drop.${kind}.${item}.${campo}`) ?? CAMPOS_DROP[campo].padrao;
}

/** mapa completo: chave, nome em português, grupo, padrão e limites (para o painel) */
export function mapaAjustes(): AjusteDef[] {
  return mapa().map((e) => e.def);
}

/** valor efetivo de uma chave (o salvo, ou o padrão); undefined se a chave não existe */
export function valorEfetivo(chave: string): number | undefined {
  const d = parseDrop(chave);
  if (d) return dropValido(d.kind, d.item) ? undefined : campoDrop(d.kind, d.item, d.campo);
  const e = entrada(chave);
  if (!e) return undefined;
  return ativos.get(chave) ?? e.def.padrao;
}

export function valorPadrao(chave: string): number | undefined {
  const d = parseDrop(chave);
  if (d) return dropValido(d.kind, d.item) ? undefined : CAMPOS_DROP[d.campo].padrao;
  return entrada(chave)?.def.padrao;
}

/** todos os valores efetivos do mapa (o que o cliente recebe) */
export function valoresEfetivos(): Record<string, number> {
  const out: Record<string, number> = {};
  for (const e of mapa()) out[e.def.chave] = ativos.get(e.def.chave) ?? e.def.padrao;
  return out;
}

/** null = válido; senão, o motivo da recusa */
export function validarAjuste(chave: string, valor: unknown): string | null {
  const d = parseDrop(chave);
  if (d) {
    const erro = dropValido(d.kind, d.item);
    if (erro) return erro;
    if (typeof valor !== "number" || !Number.isInteger(valor)) return "O valor precisa ser um número inteiro.";
    const lim = CAMPOS_DROP[d.campo];
    if (valor < lim.min || valor > lim.max) return `Fora do limite de segurança: use de ${lim.min} a ${lim.max}.`;
    // a quantidade mínima nunca passa da máxima (e vice-versa), contando o valor que já está salvo
    if (d.campo === "min" && valor > campoDrop(d.kind, d.item, "max")) return "A quantidade mínima passa da máxima.";
    if (d.campo === "max" && valor < campoDrop(d.kind, d.item, "min")) return "A quantidade máxima fica abaixo da mínima.";
    return null;
  }
  const e = entrada(chave);
  if (!e) return "Chave de balanceamento desconhecida.";
  if (typeof valor !== "number" || !Number.isInteger(valor)) return "O valor precisa ser um número inteiro.";
  if (valor < e.def.min || valor > e.def.max) return `Fora do limite de segurança: use de ${e.def.min} a ${e.def.max}.`;
  return null;
}

/**
 * Aplica o conjunto INTEIRO de ajustes salvos (chaves ausentes voltam ao padrão). Devolve as chaves do mapa cujo valor
 * efetivo mudou, para o servidor avisar os clientes e ajustar o que já está em jogo.
 */
export function aplicarAjustes(salvos: ReadonlyMap<string, number>): string[] {
  const antes = valoresEfetivos();
  ativos.clear();
  for (const e of mapa()) {
    const v = salvos.get(e.def.chave);
    if (v !== undefined && v !== e.def.padrao) ativos.set(e.def.chave, v);
    e.aplicar(ativos.has(e.def.chave) ? ativos.get(e.def.chave)! : null);
  }
  for (const [chave, v] of salvos) {
    const d = parseDrop(chave);
    if (d && v !== CAMPOS_DROP[d.campo].padrao) ativos.set(chave, v);
  }
  // tabela de drops: só itens com chance acima de zero (chance 0 = tirado da tabela)
  tabelas = new Map();
  for (const chave of ativos.keys()) {
    const d = parseDrop(chave);
    if (!d || dropValido(d.kind, d.item)) continue;
    const porTipo = tabelas.get(d.kind) ?? new Map<string, EntradaTabela>();
    tabelas.set(d.kind, porTipo);
    if (porTipo.has(d.item)) continue;
    const chance = campoDrop(d.kind, d.item, "chance");
    if (chance > 0) porTipo.set(d.item, { item: d.item, chance, min: campoDrop(d.kind, d.item, "min"), max: campoDrop(d.kind, d.item, "max") });
  }
  const depois = valoresEfetivos();
  return Object.keys(depois).filter((k) => depois[k] !== antes[k]);
}

/** tabela de drops de um inimigo (só os itens que podem cair) */
export function tabelaDrops(kind: string): EntradaTabela[] {
  return [...(tabelas.get(kind)?.values() ?? [])];
}

/** todas as tabelas com algum item: tipo de inimigo -> itens */
export function listarTabelas(): Record<string, EntradaTabela[]> {
  const out: Record<string, EntradaTabela[]> = {};
  for (const [kind, itens] of tabelas) out[kind] = [...itens.values()];
  return out;
}

// multiplicadores lidos na hora de usar (1 = padrão, sem ajuste)
const pct = (chave: string) => (valorEfetivo(chave) ?? 100) / 100;
/** XP de um abate deste tipo (o do tipo x o geral) */
export const mulXp = (kind: string) => pct(`inimigo.${kind}.xp`) * pct("global.xp");
/** multiplicador geral de drop (equipamento, poção, material e a tabela) */
export const mulDrop = () => pct("global.drop");
/** tostões deste tipo (o do tipo x o geral): vale para a sacola do abate e para o ganho direto */
export const mulTostoes = (kind: string) => pct(`inimigo.${kind}.tostoes`) * pct("global.tostoes");
/** tamanho do grupo deste tipo nos pontos de caça */
export const mulGrupo = (kind: string) => pct(`inimigo.${kind}.grupo`);
