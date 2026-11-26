-- FrixeP: painel de administração (F1). E-mail da conta (código do painel e máscara na lista), banimento com prazo
-- e auditoria de tudo o que o painel faz. RLS ligado e SEM políticas (igual às outras tabelas): o servidor do jogo
-- conecta como dono e ignora o RLS.

-- e-mail da conta: vem do provedor no login (Google/Discord com o escopo de e-mail). Convidado não tem e-mail.
alter table accounts add column if not exists email text;

-- banimento com prazo: banido_ate vazio = permanente (também vale para o banimento do chat, que é sempre permanente)
alter table sancoes add column if not exists banido_ate timestamptz;

-- auditoria: quem fez o quê, quando, sobre quem, e o valor antes e depois. Nunca guarda o e-mail completo.
create table if not exists painel_auditoria (
  id              bigint generated always as identity primary key,
  criado_em       timestamptz not null default now(),
  admin_conta_id  uuid,
  acao            text not null,
  alvo_conta_id   uuid,
  alvo_personagem_id uuid,
  alvo_nome       text,
  antes           jsonb,
  depois          jsonb,
  detalhes        jsonb not null default '{}'::jsonb
);
create index if not exists painel_auditoria_criado_idx on painel_auditoria (criado_em);
create index if not exists painel_auditoria_alvo_idx on painel_auditoria (alvo_conta_id, criado_em);

alter table painel_auditoria enable row level security;
