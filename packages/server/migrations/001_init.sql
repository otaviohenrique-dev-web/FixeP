-- FrixeP: contas e personagens.
-- RLS ligado e SEM políticas: o Supabase expõe o schema public via API REST (chave anon pública);
-- sem políticas, essa API não lê nem escreve nada. O servidor do jogo conecta como dono e ignora o RLS.
create table if not exists accounts (
  id          uuid primary key,
  provider    text not null,
  provider_id text not null,
  name        text not null,
  created_at  timestamptz not null default now(),
  unique (provider, provider_id)
);

create table if not exists characters (
  id         uuid primary key,
  account_id uuid not null references accounts(id) on delete cascade,
  name       text not null,
  name_key   text not null unique,          -- nome normalizado: garante unicidade sem diferenciar maiúsculas/acentos
  class      text not null check (class in ('warrior', 'archer', 'cleric')),
  level      int  not null default 1 check (level between 1 and 20),
  xp         int  not null default 0 check (xp >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists characters_account_idx on characters (account_id);

alter table accounts   enable row level security;
alter table characters enable row level security;
