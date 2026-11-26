import { CLASS_DEFS, CLASS_SPECS, ENEMY_KINDS, SKELETON, type ActionId, type ActionSpec, type CharClass, type EnemyKind } from "./index";

/**
 * Balanceamento ao vivo: o MAPA de valores ajustáveis (vida e dano de classes, habilidades e inimigos).
 * O mapa é GERADO das definições (CLASS_SPECS e ENEMY_KINDS): classe ou inimigo novo entra sozinho.
 * Sem nenhum ajuste salvo, todo valor é o padrão do código e nada muda.
 *
 * Chaves:
 *  - classe.<id>.vidaBase              vida base da classe (antes de nível e equipamento)
 *  - habilidade.<classe>.<slot>.dano   dano base da habilidade (slot: attack, skill1, skill2, skill3, ultimate, skill1Alt)
 *  - inimigo.<tipo>.hp                 vida do tipo no nível 1 (o nível sobe pela fórmula de enemyHp)
 *  - inimigo.<tipo>.dano               dano base do tipo no nível 1 (o nível sobe pela fórmula de enemyDmg)
 *
 * Os valores efetivos são aplicados IN PLACE nas definições do código (CLASS_SPECS, CLASS_DEFS, ENEMY_KINDS),
 * então todo ponto que já lê esses números passa a ler o valor novo sem mudar de função.
 */

export interface AjusteDef { chave: string; nome: string; grupo: string; padrao: number; min: number; max: number }
/** Evento enviado aos clientes: valores efetivos de todas as chaves. */
export interface BalanceEvent { valores: Record<string, number> }

interface Entrada { def: AjusteDef; /** v = valor do ajuste, ou null para voltar ao padrão original do código */ aplicar: (v: number | null) => void }

/** limites de segurança: de 30% a 300% do padrão (nunca abaixo de 1) */
const limitesDe = (padrao: number) => ({ min: Math.max(1, Math.floor(padrao * 0.3)), max: Math.max(1, Math.ceil(padrao * 3)) });

// montado na primeira vez que é preciso (e ANTES de qualquer aplicação), para guardar os valores originais do código
let entradas: Entrada[] | null = null;
let porChave = new Map<string, Entrada>();
/** só os valores que diferem do padrão (o que o admin salvou) */
const ativos = new Map<string, number>();

function montar(): Entrada[] {
  const out: Entrada[] = [];
  const add = (chave: string, nome: string, grupo: string, padrao: number, aplicar: Entrada["aplicar"]) => {
    out.push({ def: { chave, nome, grupo, padrao, ...limitesDe(padrao) }, aplicar });
  };
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
    const hpMul0 = K.hpMul, dmgMul0 = K.dmgMul;
    add(`inimigo.${k}.hp`, `Vida de ${K.name}`, `Inimigo: ${K.name}`, Math.round(SKELETON.maxHp * hpMul0), (v) => {
      K.hpMul = v == null ? hpMul0 : v / SKELETON.maxHp;
    });
    add(`inimigo.${k}.dano`, `Dano de ${K.name}`, `Inimigo: ${K.name}`, Math.round(SKELETON.dmg * dmgMul0), (v) => {
      K.dmgMul = v == null ? dmgMul0 : v / SKELETON.dmg;
    });
  }
  porChave = new Map(out.map((e) => [e.def.chave, e]));
  return out;
}

const mapa = (): Entrada[] => (entradas ??= montar());
const entrada = (chave: string): Entrada | undefined => (mapa(), porChave.get(chave));

/** o mapa completo: chave, nome em português, grupo, padrão e limites (para o painel) */
export function mapaAjustes(): AjusteDef[] {
  return mapa().map((e) => e.def);
}

/** valor efetivo de uma chave (o salvo, ou o padrão); undefined se a chave não existe */
export function valorEfetivo(chave: string): number | undefined {
  const e = entrada(chave);
  if (!e) return undefined;
  return ativos.get(chave) ?? e.def.padrao;
}

export function valorPadrao(chave: string): number | undefined {
  return entrada(chave)?.def.padrao;
}

/** todos os valores efetivos (o que o cliente recebe) */
export function valoresEfetivos(): Record<string, number> {
  const out: Record<string, number> = {};
  for (const e of mapa()) out[e.def.chave] = ativos.get(e.def.chave) ?? e.def.padrao;
  return out;
}

/** null = válido; senão, o motivo da recusa */
export function validarAjuste(chave: string, valor: unknown): string | null {
  const e = entrada(chave);
  if (!e) return "Chave de balanceamento desconhecida.";
  if (typeof valor !== "number" || !Number.isInteger(valor)) return "O valor precisa ser um número inteiro.";
  if (valor < e.def.min || valor > e.def.max) return `Fora do limite de segurança: use de ${e.def.min} a ${e.def.max}.`;
  return null;
}

/**
 * Aplica o conjunto INTEIRO de ajustes salvos (chaves ausentes voltam ao padrão). Devolve as chaves cujo valor
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
  const depois = valoresEfetivos();
  return Object.keys(depois).filter((k) => depois[k] !== antes[k]);
}
