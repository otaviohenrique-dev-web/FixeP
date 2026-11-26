import type { Db } from "../db/index.js";

/**
 * Auditoria do painel: uma linha por ação (quem, quando, sobre quem, antes e depois).
 * Não grava o e-mail completo nem o código de acesso. Ações conhecidas: entrar_painel, revelar_email,
 * silenciar, banir, desbanir, expulsar, resolver_denuncia (novas abas acrescentam as suas).
 */
export interface RegistroAuditoria {
  adminContaId: string;
  acao: string;
  alvoContaId?: string | null;
  alvoPersonagemId?: string | null;
  alvoNome?: string | null;
  antes?: unknown;
  depois?: unknown;
  detalhes?: Record<string, unknown>;
}

export async function registrarAuditoria(db: Db, r: RegistroAuditoria): Promise<void> {
  await db.query(
    `insert into painel_auditoria (admin_conta_id, acao, alvo_conta_id, alvo_personagem_id, alvo_nome, antes, depois, detalhes)
     values ($1, $2, $3, $4, $5, $6, $7, $8)`,
    [
      r.adminContaId,
      r.acao,
      r.alvoContaId ?? null,
      r.alvoPersonagemId ?? null,
      r.alvoNome ?? null,
      r.antes === undefined ? null : JSON.stringify(r.antes),
      r.depois === undefined ? null : JSON.stringify(r.depois),
      JSON.stringify(r.detalhes ?? {}),
    ],
  );
}

export interface LinhaAuditoria {
  id: number;
  criado_em: string;
  admin: string | null;
  acao: string;
  alvo_nome: string | null;
  alvo_personagem_id: string | null;
  antes: unknown;
  depois: unknown;
  detalhes: Record<string, unknown>;
}

/** últimas ações (mais novas primeiro); `alvoContaId` filtra o histórico de uma conta */
export async function listarAuditoria(db: Db, limite: number, alvoContaId?: string): Promise<LinhaAuditoria[]> {
  const { rows } = await db.query<LinhaAuditoria & { id: string }>(
    `select a.id, a.criado_em::text as criado_em, adm.name as admin, a.acao, a.alvo_nome, a.alvo_personagem_id, a.antes, a.depois, a.detalhes
       from painel_auditoria a left join accounts adm on adm.id = a.admin_conta_id
      where ($2::text is null or a.alvo_conta_id::text = $2)
      order by a.criado_em desc, a.id desc limit $1`,
    [limite, alvoContaId ?? null],
  );
  return rows.map((r) => ({ ...r, id: Number(r.id) }));
}
