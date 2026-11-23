-- FrixeP: talentos (C2.3). Ranks gastos por personagem (JSON: id do talento -> ranks; '{}' = nenhum) e quantos resets já foram pagos.
alter table characters add column if not exists talentos text not null default '{}';
alter table characters add column if not exists talentos_resets integer not null default 0;
