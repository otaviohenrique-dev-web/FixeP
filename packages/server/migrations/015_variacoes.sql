-- FrixeP: variações de habilidade (C2.2). Guarda a escolha por personagem como JSON (habilidade -> id da variação); '{}' = todas na base.
alter table characters add column if not exists variacoes text not null default '{}';
