-- FrixeP: telemetria mínima (card C0.5). Uma linha por evento de jogo: login, criação, 1º abate, nível 5, saída.
-- Não guarda senha, token, e-mail nem IP. conta_id e personagem_id são só identificadores internos, sem FK:
-- o histórico sobrevive se a conta ou o personagem for apagado.
-- RLS ligado e SEM políticas (igual às outras tabelas): o Supabase expõe o schema public pela API REST.
create table if not exists eventos (
  id           bigint generated always as identity primary key,
  criado_em    timestamptz not null default now(),
  tipo         text not null check (tipo in ('login', 'criacao_personagem', 'passo_tutorial', 'primeiro_abate', 'nivel_5', 'saida')),
  conta_id     uuid,
  personagem_id uuid,
  dados        jsonb not null default '{}'::jsonb
);
create index if not exists eventos_tipo_criado_idx on eventos (tipo, criado_em);
create index if not exists eventos_personagem_tipo_idx on eventos (personagem_id, tipo);

alter table eventos enable row level security;
