-- FrixeP: balanceamento ao vivo (painel admin). Só os valores ALTERADOS ficam em balance_ajustes;
-- sem linha, vale o padrão do código. Cada mudança (inclusive voltar ao padrão e desfazer) entra em balance_historico.
create table if not exists balance_ajustes (
  chave text primary key,
  valor integer not null,
  conta text not null,
  atualizado_em timestamptz not null default now()
);
create table if not exists balance_historico (
  id bigserial primary key,
  chave text not null,
  antes integer not null,
  depois integer not null,
  motivo text not null,
  conta text not null,
  criado_em timestamptz not null default now()
);
create index if not exists balance_historico_chave on balance_historico (chave, id);
