-- Mercado: a listagem pode ser em Tostões de Ferro ou em Óbolos de Sangue (a taxa de listagem e o pagamento usam a mesma moeda).
alter table market_listings add column if not exists currency text not null default 'iron' check (currency in ('iron', 'obols'));
