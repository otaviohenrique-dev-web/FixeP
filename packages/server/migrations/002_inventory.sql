-- Inventário e equipamento. RLS ligado sem políticas (fecha a API pública do Supabase), como em 001.
create table if not exists inventory_items (
  character_id uuid not null references characters(id) on delete cascade,
  slot         int  not null check (slot between 0 and 19),
  item_id      text not null,
  qty          int  not null check (qty between 1 and 99),
  primary key (character_id, slot)
);

create table if not exists equipment (
  character_id uuid not null references characters(id) on delete cascade,
  slot         text not null check (slot in ('weapon', 'armor')),
  item_id      text not null,
  primary key (character_id, slot)
);

alter table inventory_items enable row level security;
alter table equipment       enable row level security;
