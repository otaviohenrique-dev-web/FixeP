-- Mercado dos jogadores (leiloeiro). O item fica em custódia na própria listagem (sai da mochila ao listar).
--   active  = à venda (ou vencida: expires_at passou e o vendedor ainda não recolheu o item)
--   sold    = vendida; o vendedor ainda não recolheu os tostões
--   closed  = encerrada (tostões recolhidos, item devolvido ou listagem cancelada); só ocupa espaço até a limpeza
create table if not exists market_listings (
  id          uuid primary key,
  seller_id   uuid not null references characters(id) on delete cascade,
  seller_name text not null,
  item_id     text not null,
  qty         integer not null check (qty between 1 and 999),
  price       integer not null check (price between 1 and 999999999),
  fee         integer not null default 0 check (fee >= 0),
  status      text not null default 'active' check (status in ('active', 'sold', 'closed')),
  buyer_id    uuid references characters(id) on delete set null,
  buyer_name  text,
  created_at  timestamptz not null default now(),
  expires_at  timestamptz not null,
  sold_at     timestamptz,
  closed_at   timestamptz
);
create index if not exists market_listings_status_idx on market_listings (status, expires_at);
create index if not exists market_listings_seller_idx on market_listings (seller_id, status);
alter table market_listings enable row level security; -- como as demais tabelas: o Supabase não expõe nada pela API pública
