-- FrixeP: motor de quests (card C1.1). Estado de cada quest por personagem.
-- estado: 'ativa' (aceita, em andamento), 'pronta' (todos os objetivos cumpridos, falta entregar), 'entregue' (recompensa paga).
-- progresso: array jsonb alinhado aos objetivos da quest (ver packages/server/data/quests/*.json).
-- RLS ligado e SEM políticas (igual às outras tabelas): o Supabase expõe o schema public pela API REST.
-- O servidor do jogo conecta como dono e ignora o RLS.
create table if not exists quest_estado (
  personagem_id  uuid not null references characters(id) on delete cascade,
  quest_id       text not null check (char_length(quest_id) between 2 and 60),
  estado         text not null check (estado in ('ativa', 'pronta', 'entregue')),
  progresso      jsonb not null default '[]'::jsonb,
  atualizado_em  timestamptz not null default now(),
  primary key (personagem_id, quest_id)
);

alter table quest_estado enable row level security;

-- telemetria (C1.1): novos tipos de evento de quest
alter table eventos drop constraint if exists eventos_tipo_check;
alter table eventos add constraint eventos_tipo_check check (tipo in (
  'login', 'criacao_personagem', 'passo_tutorial', 'primeiro_abate', 'nivel_5', 'saida', 'denuncia', 'silenciado', 'banido',
  'quest_aceita', 'quest_entregue'));
