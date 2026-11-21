-- FrixeP: moderação mínima (card C0.6). Sanções por conta (silêncio temporário e banimento) e denúncias de jogadores.
-- RLS ligado e SEM políticas (igual às outras tabelas): o Supabase expõe o schema public pela API REST.
-- O servidor do jogo conecta como dono e ignora o RLS.
create table if not exists sancoes (
  conta_id        uuid primary key references accounts(id) on delete cascade,
  silenciado_ate  timestamptz,
  banido          boolean not null default false,
  motivo          text,
  atualizado_em   timestamptz not null default now()
);

-- sem FK para contas/personagens: a denúncia continua no histórico mesmo se a conta ou o personagem for apagado
create table if not exists denuncias (
  id                       bigint generated always as identity primary key,
  criado_em                timestamptz not null default now(),
  denunciante_conta_id     uuid,
  denunciado_personagem_id uuid,
  denunciado_nome          text not null,
  motivo                   text not null check (char_length(motivo) between 1 and 200),
  resolvida                boolean not null default false
);
create index if not exists denuncias_denunciante_idx on denuncias (denunciante_conta_id, criado_em);
create index if not exists denuncias_aberta_idx on denuncias (resolvida, criado_em);

alter table sancoes enable row level security;
alter table denuncias enable row level security;

-- telemetria (C0.5): novos tipos de evento de moderação
alter table eventos drop constraint if exists eventos_tipo_check;
alter table eventos add constraint eventos_tipo_check check (tipo in (
  'login', 'criacao_personagem', 'passo_tutorial', 'primeiro_abate', 'nivel_5', 'saida', 'denuncia', 'silenciado', 'banido'));
