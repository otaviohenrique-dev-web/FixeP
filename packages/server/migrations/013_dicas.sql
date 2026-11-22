-- FrixeP: dicas contextuais (card C1.6). Cada dica aparece uma vez por personagem; aqui fica o que já foi visto.
-- dica_id é validado contra a lista fixa em packages/shared/src/dicas.ts (o servidor ignora ids desconhecidos).
-- RLS ligado e SEM políticas (igual às outras tabelas): o Supabase expõe o schema public pela API REST.
create table if not exists dicas_vistas (
  personagem_id  uuid not null references characters(id) on delete cascade,
  dica_id        text not null check (char_length(dica_id) between 2 and 40),
  visto_em       timestamptz not null default now(),
  primary key (personagem_id, dica_id)
);

alter table dicas_vistas enable row level security;
