-- FrixeP: loadouts (C2.4). Até 3 slots de build por personagem (JSON: { ativo, slots: [{ nome, salvo, variacoes, talentos }] }); '{}' = nenhum slot salvo.
alter table characters add column if not exists loadouts text not null default '{}';
