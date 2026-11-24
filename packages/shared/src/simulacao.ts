import { CRIT, CLASS_DEFS, classAction, defenseMult, dmgMult, enemyHp, maxHpFor, PLAYABLE_CLASSES, type ActionDef, type ActionId, type CharClass } from "./index";
import { effectiveAction, emptyBonuses } from "./items";
import { aplicarTalentos, podeSubirTalento, pontosTotais, subirTalento, talentosDaClasse, TALENTO_RAMOS, type EscolhasTalentos } from "./talentos";
import { modificadoresDaEscolha, variacaoDesbloqueada, variacoesDaClasse, VARIACAO_SLOTS, type EscolhasVariacao } from "./variacoes";

/**
 * SIMULAÇÃO DE BALANCEAMENTO (C2.5). Pura e determinística: sem servidor, banco, rede nem aleatoriedade.
 * Usa SEMPRE os dados reais do jogo (resolveAction/classAction, variações, talentos, dmgMult, defenseMult, enemyHp, CRIT):
 * nenhum número é copiado aqui, salvo as premissas marcadas como tais (ALVO_ARMADURA_PCT, SIM_JANELA_S, SIM_BURST_S).
 *
 * Por build (classe + nível + variações + talentos), o alvo é o inimigo de referência do nível (Esqueleto: vida de enemyHp).
 * - dps: dano sustentado por segundo numa janela de SIM_JANELA_S (rotação gananciosa, como em balance.ts).
 * - burst: dano nos primeiros SIM_BURST_S segundos (abertura, com todas as recargas prontas).
 * - hpEf: vida efetiva contra dano constante (vida x defesa do nível / (1 - redução), redução = equipamento + escudo ativo).
 * - cura: cura por segundo (Clérigo; zero para as outras classes).
 * - atordoado / lento / enraizado: segundos sob cada controle, por alvo, na janela (sobreposição não soma).
 * - ttk: segundos para derrubar o alvo de referência com o dps.
 * Simplificações (todas iguais para todas as builds, então a comparação entre builds continua justa): alvo único; sem
 * esquiva, sem aleatoriedade (crítico entra como valor esperado); atrasos de telegrafo de área ignorados; sem equipamento
 * (só talentos e variações, como pede o card); afixos de item fora do escopo.
 */

export const SIM_NIVEIS = [10, 20, 30, 40, 50] as const;
/** Premissa: tempo de luta simulado (s). Controle e dano são medidos nesta janela. */
export const SIM_JANELA_S = 30;
/** Premissa: janela do burst (s). */
export const SIM_BURST_S = 3;
/** Passo de tempo da simulação (s). */
const DT = 0.05;
/** Mesma prioridade de balance.ts: a ação mais forte pronta é usada primeiro; o ataque básico sai sempre que está pronto. */
const PRIORIDADE: ActionId[] = ["ultimate", "skill3", "skill2", "skill1", "attack"];
const IDS: ActionId[] = ["attack", "skill1", "skill2", "skill3", "ultimate", "dodge"];

/**
 * Premissa: o inimigo de referência tem armadura (% de dano bloqueado) que cresce com o nível. Os inimigos do jogo hoje
 * não têm armadura; esta tabela modela a dureza de um alvo de referência. Ajuste aqui se a premissa mudar.
 */
export const ALVO_ARMADURA_PCT: Record<(typeof SIM_NIVEIS)[number], number> = { 10: 0, 20: 10, 30: 20, 40: 30, 50: 40 };

/** Papel de cada classe (o do CLASS_DEFS.role). A checagem de "fora da mediana do papel" compara a métrica do papel. */
export type MetricaSim = "dps" | "burst" | "hpEf" | "cura" | "atordoado" | "lento" | "enraizado" | "ttk";
export const METRICA_DO_PAPEL: Record<CharClass, MetricaSim> = { warrior: "hpEf", archer: "dps", mage: "dps", cleric: "cura" };

/** Limites de outlier (razão sobre a mediana). Também usados pelo teste unit (simulacao.unit.ts). */
export const SIM_OUTLIER = { teto: 1.25, piso: 0.75, desvioClasse: 0.3 } as const;

export interface BuildSim { id: string; cls: CharClass; nivel: number; variacoes: EscolhasVariacao; talentos: EscolhasTalentos; rotulo: string }
export interface Metricas { dps: number; burst: number; hpEf: number; cura: number; atordoado: number; lento: number; enraizado: number; ttk: number }
export interface ResultadoBuild { build: BuildSim; m: Metricas }

const rotuloVariacoes = (v: EscolhasVariacao): string => {
  const partes = VARIACAO_SLOTS.filter((s) => v[s]).map((s) => `${s}=${v[s]}`);
  return partes.length ? partes.join(";") : "base";
};

/** Preenche um ramo de talentos até não caber mais nada (porta e pontos respeitados pelo próprio podeSubirTalento). */
function encherRamo(cls: CharClass, nivel: number, ramo: 0 | 1 | 2): EscolhasTalentos {
  let esc: EscolhasTalentos = {};
  let mudou = true;
  while (mudou) {
    mudou = false;
    for (const t of talentosDaClasse(cls)) {
      if (t.ramo !== ramo) continue;
      while (podeSubirTalento(esc, cls, nivel, t.id).ok) { esc = subirTalento(esc, t.id); mudou = true; }
    }
  }
  return esc;
}

/** Builds relevantes de uma classe num nível: toda combinação de variações das habilidades já desbloqueadas (base ou uma das 3)
 *  x 4 opções de talento (nenhum, ou o ramo inteiro preenchido). Ordem fixa: resultado determinístico. */
export function buildsDaClasse(cls: CharClass, nivel: number): BuildSim[] {
  let combos: EscolhasVariacao[] = [{}];
  for (const s of VARIACAO_SLOTS) {
    if (!variacaoDesbloqueada(s, nivel)) continue;
    const opts: (string | undefined)[] = [undefined, ...variacoesDaClasse(cls).filter((v) => v.slot === s).map((v) => v.id)];
    combos = combos.flatMap((c) => opts.map((o) => (o ? { ...c, [s]: o } : c)));
  }
  const talentos: { rotulo: string; esc: EscolhasTalentos }[] = [{ rotulo: "sem talentos", esc: {} }];
  for (const r of [0, 1, 2] as const) talentos.push({ rotulo: `ramo ${TALENTO_RAMOS[cls][r].nome}`, esc: encherRamo(cls, nivel, r) });
  const out: BuildSim[] = [];
  for (const v of combos) for (const t of talentos) {
    const id = `${cls}|L${nivel}|${rotuloVariacoes(v)}|${t.rotulo}`;
    out.push({ id, cls, nivel, variacoes: v, talentos: t.esc, rotulo: `${rotuloVariacoes(v)} · ${t.rotulo}` });
  }
  return out;
}

/** Simula uma build contra o alvo de referência. Função pura: mesma entrada, mesma saída. */
export function simularBuild(b: BuildSim): Metricas {
  const { cls, nivel } = b;
  const c = CLASS_DEFS[cls];
  const gear = aplicarTalentos(emptyBonuses(), b.talentos, cls);
  const mods = modificadoresDaEscolha(b.variacoes);
  const acoes = {} as Record<ActionId, ActionDef>;
  for (const a of IDS) acoes[a] = effectiveAction(classAction(cls, a, 0, mods), a, gear.kit, gear.cdr);

  const poder = dmgMult(nivel, gear.dmgPct);
  const critMult = 1 + Math.min(1, CRIT.chance + gear.crit / 100) * (CRIT.mult - 1);
  const bloqueio = 1 - ALVO_ARMADURA_PCT[nivel as (typeof SIM_NIVEIS)[number]] / 100;
  const curaMult = poder * (1 + gear.af.healPct / 100);

  let res = c.resource.max;
  const pronto: Partial<Record<ActionId, number>> = {};
  let dano = 0, burst = 0, cura = 0, fimShred = 0, pctShred = 0;
  const ctrl = { atordoado: { fim: 0, tot: 0 }, lento: { fim: 0, tot: 0 }, enraizado: { fim: 0, tot: 0 } };
  const aplicaCtrl = (k: keyof typeof ctrl, t: number, s: number) => {
    if (s <= 0) return;
    const fim = t + s;
    ctrl[k].tot += Math.max(0, fim - Math.max(t, ctrl[k].fim));
    ctrl[k].fim = Math.max(ctrl[k].fim, fim);
  };

  for (let t = 0; t < SIM_JANELA_S - 1e-9; t += DT) {
    res = Math.min(c.resource.max, res + c.resource.regen * DT);
    for (const a of PRIORIDADE) {
      const d = acoes[a];
      if (t < (pronto[a] ?? 0)) continue;
      if (!d.dmg && !d.heal && !d.stunS && !d.rootS && !d.slowS) continue;
      const custo = d.cost ?? 0;
      if (res < custo) continue;
      res -= custo;
      pronto[a] = t + d.cd;
      if (d.dmg) {
        const quebra = t < fimShred ? 1 + pctShred / 100 : 1;
        const acerto = d.dmg * poder * critMult * bloqueio * quebra;
        dano += acerto;
        if (t < SIM_BURST_S) burst += acerto;
      }
      if (d.heal) cura += d.heal * curaMult;
      if (d.shredPct && d.shredS) { fimShred = t + d.shredS; pctShred = d.shredPct; }
      if (d.stunS) aplicaCtrl("atordoado", t, d.stunS);
      if (d.rootS) aplicaCtrl("enraizado", t, d.rootS);
      if (d.slowS) aplicaCtrl("lento", t, d.slowS);
    }
  }

  // Sobrevivência: redução do equipamento + escudo (ação com `reduction` e `buffS`) pela fração do tempo em que está ativo.
  let reducaoEscudo = 0;
  for (const a of IDS) {
    const d = acoes[a];
    if (d.reduction && d.buffS) reducaoEscudo += d.reduction * Math.min(1, d.buffS / Math.max(d.cd, d.buffS));
  }
  const reducao = Math.min(0.8, gear.dr / 100 + reducaoEscudo);
  const hpEf = maxHpFor(cls, nivel, 0) + gear.hp;
  const hpEfetivo = (hpEf * defenseMult(nivel)) / (1 - reducao);

  const dps = dano / SIM_JANELA_S;
  const hpAlvo = enemyHp(nivel);
  return {
    dps,
    burst,
    hpEf: hpEfetivo,
    cura: cura / SIM_JANELA_S,
    atordoado: ctrl.atordoado.tot,
    lento: ctrl.lento.tot,
    enraizado: ctrl.enraizado.tot,
    ttk: dps > 0 ? hpAlvo / dps : 0,
  };
}

/** Roda todas as builds de todas as classes jogáveis nos níveis de referência, na ordem fixa do catálogo. */
export function simularTudo(classes: readonly CharClass[] = PLAYABLE_CLASSES, niveis: readonly number[] = SIM_NIVEIS): ResultadoBuild[] {
  const out: ResultadoBuild[] = [];
  for (const cls of classes) for (const nivel of niveis) for (const build of buildsDaClasse(cls, nivel)) out.push({ build, m: simularBuild(build) });
  return out;
}

export function mediana(xs: readonly number[]): number {
  if (xs.length === 0) return 0;
  const s = [...xs].sort((a, b) => a - b);
  const meio = Math.floor(s.length / 2);
  return s.length % 2 ? s[meio] : (s[meio - 1] + s[meio]) / 2;
}

export interface Outlier { build: BuildSim; metrica: MetricaSim; valor: number; med: number; razao: number; motivo: string }

/** Builds fora de [piso, teto] vezes a mediana das builds da MESMA classe e nível (uma métrica por vez). */
export function outliersDaClasse(res: readonly ResultadoBuild[], metrica: MetricaSim, teto: number = SIM_OUTLIER.teto, piso: number = SIM_OUTLIER.piso): Outlier[] {
  const grupos = new Map<string, ResultadoBuild[]>();
  for (const r of res) { const k = `${r.build.cls}|${r.build.nivel}`; grupos.set(k, [...(grupos.get(k) ?? []), r]); }
  const out: Outlier[] = [];
  for (const grupo of grupos.values()) {
    const med = mediana(grupo.map((r) => r.m[metrica]));
    if (med <= 0) continue;
    for (const r of grupo) {
      const razao = r.m[metrica] / med;
      if (razao > teto || razao < piso) out.push({ build: r.build, metrica, valor: r.m[metrica], med, razao, motivo: razao > teto ? "acima" : "abaixo" });
    }
  }
  return out;
}

/** Classe fora de SIM_OUTLIER.desvioClasse da mediana do próprio papel (só classes com o mesmo papel; sem par, não há comparação). */
export interface DesvioClasse { cls: CharClass; nivel: number; metrica: MetricaSim; valor: number; medPapel: number; razao: number }
export function desviosDePapel(res: readonly ResultadoBuild[], desvio: number = SIM_OUTLIER.desvioClasse): DesvioClasse[] {
  const out: DesvioClasse[] = [];
  for (const nivel of SIM_NIVEIS) {
    const medClasse = (cls: CharClass, m: MetricaSim) => mediana(res.filter((r) => r.build.cls === cls && r.build.nivel === nivel).map((r) => r.m[m]));
    for (const cls of PLAYABLE_CLASSES) {
      const m = METRICA_DO_PAPEL[cls];
      const pares = PLAYABLE_CLASSES.filter((o) => METRICA_DO_PAPEL[o] === m);
      if (pares.length < 2) continue;
      const medPapel = mediana(pares.map((o) => medClasse(o, m)));
      const valor = medClasse(cls, m);
      if (medPapel <= 0) continue;
      const razao = valor / medPapel;
      if (Math.abs(razao - 1) > desvio) out.push({ cls, nivel, metrica: m, valor, medPapel, razao });
    }
  }
  return out;
}
