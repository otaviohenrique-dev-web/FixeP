/**
 * Balanceamento ao vivo (servidor): carrega os ajustes salvos, aplica no código compartilhado e grava cada mudança
 * no histórico. Toda escrita passa por uma fila: a memória e o banco andam sempre juntos.
 */
import { aplicarAjustes, mapaAjustes, valoresEfetivos, validarAjuste, valorEfetivo, valorPadrao, listarTabelas, mulXp, ZONES, expandSpawns, enemyHp, enemyXp, dmgMult, classAction, ENEMY_KINDS, PLAYABLE_CLASSES, type EnemyKind } from "@frixep/shared";
import { MOTIVO_MAX } from "./moderacao.js";
import { registrarAuditoria } from "./painel/auditoria.js";
import type { Db } from "./db/index.js";

export interface HistoricoItem { id: number; chave: string; antes: number; depois: number; motivo: string; conta: string; criadoEm: string }
export type Resultado = { ok: true } | { ok: false; erro: string; status?: number };

/** nível de referência de um tipo: o menor nível em que ele aparece nas zonas (ou no chefe) */
function nivelEZonas(kind: string): { nivel: number; zonas: { id: number; nome: string }[] } {
  let nivel: number | undefined;
  const zonas: { id: number; nome: string }[] = [];
  const ver = (n: number) => { nivel = nivel === undefined ? n : Math.min(nivel, n); };
  for (const z of Object.values(ZONES)) {
    let aqui = false;
    for (const p of expandSpawns(z)) if (p.kind === kind) { ver(p.level); aqui = true; }
    if (z.boss?.kind === kind) { ver(z.boss.level); aqui = true; }
    if (aqui) zonas.push({ id: z.id, nome: z.name });
  }
  return { nivel: nivel ?? 1, zonas };
}

/** Estimativa APROXIMADA por tipo: um jogador batendo sem parar no nível do tipo (sem contar o tempo de andar).
 *  golpes = ataque básico necessário para matar; XP/min = XP do abate pelo ciclo (golpes x cadência + tempo de renascimento). */
export function estimativas() {
  return Object.keys(ENEMY_KINDS).map((tipo) => {
    const K = ENEMY_KINDS[tipo as EnemyKind];
    const { nivel, zonas } = nivelEZonas(tipo);
    const vida = enemyHp(nivel, tipo);
    const xp = Math.max(0, Math.round(enemyXp(nivel) * (K.boss?.xpMul ?? 1) * mulXp(tipo)));
    const golpes: Record<string, number> = {};
    const xpPorMinuto: Record<string, number> = {};
    for (const cls of PLAYABLE_CLASSES) {
      const a = classAction(cls, "attack", 0);
      const dano = Math.max(1, (a.dmg ?? 0) * dmgMult(nivel));
      const n = Math.max(1, Math.ceil(vida / dano));
      golpes[cls] = n;
      const cicloS = n * a.cd + K.respawnS;
      xpPorMinuto[cls] = Math.round((xp * 60 / cicloS) * 10) / 10;
    }
    return { tipo, nome: K.name, nivel, zonas, vida, xp, respawnS: K.respawnS, golpes, xpPorMinuto };
  });
}

export class Balanceamento {
  private ajustes = new Map<string, number>(); // só os alterados (espelho da tabela balance_ajustes)
  private fila: Promise<unknown> = Promise.resolve();
  private ouvintes = new Set<(mudou: string[]) => void>();

  constructor(private db: Db) {}

  /** ao iniciar o servidor: lê os ajustes salvos e aplica tudo (o que não está salvo fica no padrão) */
  async carregar(): Promise<void> {
    const { rows } = await this.db.query<{ chave: string; valor: number }>("select chave, valor from balance_ajustes");
    this.ajustes = new Map(rows.map((r) => [r.chave, Number(r.valor)]));
    aplicarAjustes(this.ajustes);
  }

  /** quem precisa saber das mudanças (salas de jogo) se inscreve; devolve a função para cancelar */
  ouvir(fn: (mudou: string[]) => void): () => void {
    this.ouvintes.add(fn);
    return () => this.ouvintes.delete(fn);
  }

  /** a lista para o painel: padrão, valor atual, limites e se foi alterado */
  listar() {
    const ef = valoresEfetivos();
    return mapaAjustes().map((a) => ({ ...a, atual: ef[a.chave], alterado: ef[a.chave] !== a.padrao }));
  }

  /** tabelas de drop por tipo de inimigo (chance, quantidade) e estimativas para o painel (golpes por classe e XP/min) */
  tabelas() {
    return { drops: listarTabelas(), estimativas: estimativas() };
  }

  definir(chave: string, valor: number, motivo: string, conta: string): Promise<Resultado> {
    return this.naFila(async () => {
      const erro = validarAjuste(chave, valor);
      if (erro) return { ok: false, erro, status: 400 } as const;
      const m = (motivo ?? "").trim();
      if (!m) return { ok: false, erro: "Escreva o motivo da mudança.", status: 400 } as const;
      if (m.length > MOTIVO_MAX) return { ok: false, erro: `O motivo passa de ${MOTIVO_MAX} caracteres.`, status: 400 } as const;
      return this.gravar(chave, valor, m, conta, "alterar_balanceamento");
    });
  }

  /** volta o valor ao padrão do código */
  padrao(chave: string, motivo: string, conta: string): Promise<Resultado> {
    return this.naFila(async () => {
      const p = valorPadrao(chave);
      if (p === undefined) return { ok: false, erro: "Chave de balanceamento desconhecida.", status: 400 } as const;
      const m = (motivo ?? "").trim();
      if (!m) return { ok: false, erro: "Escreva o motivo da mudança.", status: 400 } as const;
      if (m.length > MOTIVO_MAX) return { ok: false, erro: `O motivo passa de ${MOTIVO_MAX} caracteres.`, status: 400 } as const;
      return this.gravar(chave, p, m, conta, "voltar_padrao_balanceamento");
    });
  }

  /** desfaz uma mudança do histórico: volta ao valor "antes". Só vale se o valor ainda é o que ela deixou. */
  desfazer(id: number, conta: string): Promise<Resultado> {
    return this.naFila(async () => {
      const { rows } = await this.db.query<{ chave: string; antes: number; depois: number }>("select chave, antes, depois from balance_historico where id = $1", [id]);
      const h = rows[0];
      if (!h) return { ok: false, erro: "Mudança não encontrada no histórico.", status: 404 } as const;
      if (valorEfetivo(h.chave) !== Number(h.depois)) {
        return { ok: false, erro: "Esse valor mudou depois desta alteração: desfaça as mais recentes primeiro.", status: 409 } as const;
      }
      return this.gravar(h.chave, Number(h.antes), `Desfeito (alteração #${id})`, conta, "desfazer_balanceamento");
    });
  }

  async historico(chave?: string): Promise<HistoricoItem[]> {
    const { rows } = chave
      ? await this.db.query<any>("select id, chave, antes, depois, motivo, conta, criado_em from balance_historico where chave = $1 order by id desc limit 200", [chave])
      : await this.db.query<any>("select id, chave, antes, depois, motivo, conta, criado_em from balance_historico order by id desc limit 200");
    return rows.map((r) => ({ id: Number(r.id), chave: r.chave, antes: Number(r.antes), depois: Number(r.depois), motivo: r.motivo, conta: r.conta, criadoEm: new Date(r.criado_em).toISOString() }));
  }

  // ------------------------------------------------------------------ interno
  private naFila<T>(fn: () => Promise<T>): Promise<T> {
    const p = this.fila.then(fn, fn);
    this.fila = p.catch(() => {});
    return p;
  }

  /** grava no banco (ajuste + histórico, numa transação), depois aplica na memória e avisa as salas */
  private async gravar(chave: string, valor: number, motivo: string, conta: string, acao: string): Promise<Resultado> {
    const antes = valorEfetivo(chave)!;
    if (antes === valor) return { ok: false, erro: "O valor já é esse.", status: 400 };
    const padrao = valorPadrao(chave)!;
    const proximo = new Map(this.ajustes);
    if (valor === padrao) proximo.delete(chave);
    else proximo.set(chave, valor);
    await this.db.tx(async (t) => {
      if (valor === padrao) await t.query("delete from balance_ajustes where chave = $1", [chave]);
      else
        await t.query(
          "insert into balance_ajustes (chave, valor, conta) values ($1, $2, $3) on conflict (chave) do update set valor = excluded.valor, conta = excluded.conta, atualizado_em = now()",
          [chave, valor, conta],
        );
      await t.query("insert into balance_historico (chave, antes, depois, motivo, conta) values ($1, $2, $3, $4, $5)", [chave, antes, valor, motivo, conta]);
    });
    // auditoria do painel (quem, quando, o que mudou e o motivo); o histórico próprio continua em balance_historico
    await registrarAuditoria(this.db, { adminContaId: conta, acao, alvoNome: chave, antes, depois: valor, detalhes: { motivo } });
    this.ajustes = proximo;
    const mudou = aplicarAjustes(this.ajustes);
    for (const fn of this.ouvintes) {
      try { fn(mudou); } catch (e) { console.error("[balanceamento] sala não atualizada:", (e as Error).message); }
    }
    return { ok: true };
  }
}
