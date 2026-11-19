-- Cidade segura: personagens novos nascem na cidade (zona 4). Quem já existe fica onde está (o default só vale para linhas novas).
alter table characters alter column zone set default 4;

-- Baú de armazenamento pessoal (por personagem: os itens são de classe e a conta tem 1 personagem; a troca e o mercado também são por personagem).
create table if not exists vault_items (
  character_id uuid not null references characters(id) on delete cascade,
  slot         int  not null check (slot between 0 and 999),
  item_id      text not null,
  qty          int  not null check (qty between 1 and 99),
  primary key (character_id, slot)
);
alter table vault_items enable row level security;

alter table characters add column if not exists vault_iron  integer not null default 0 check (vault_iron  between 0 and 999999999);
alter table characters add column if not exists vault_obols integer not null default 0 check (vault_obols between 0 and 999999999);
