-- FrixeP: o baú e o mercado guardam os extras do item (PD-16). Antes só id e quantidade: um item com afixos,
-- refino ou gemas voltava do baú/mercado SEM eles. Mesmo formato da mochila (inventory_items):
-- af = afixos em JSON ("[]" = sem afixos; NULL = linha antiga), rf = refino, gm = gemas "forca,vida", gmv = gema do Modo Deus.
alter table vault_items add column if not exists af text;
alter table vault_items add column if not exists rf integer;
alter table vault_items add column if not exists gm text;
alter table vault_items add column if not exists gmv boolean not null default false;
alter table market_listings add column if not exists af text;
alter table market_listings add column if not exists rf integer;
alter table market_listings add column if not exists gm text;
alter table market_listings add column if not exists gmv boolean not null default false;
