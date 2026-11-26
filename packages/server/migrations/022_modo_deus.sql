-- FrixeP: Modo Deus (ferramenta de admin). Estado no próprio personagem e marca de "criado pelo GM" nos itens.
-- O modo fica gravado no personagem (volta ao entrar de novo). O item criado pelo GM fica vinculado ao personagem:
-- não pode ser vendido, negociado, guardado no baú nem largado no chão (ver shared/modo_deus e game/inventory.ts).
alter table characters add column if not exists gm_modo boolean not null default false;
alter table characters add column if not exists gm_invis boolean not null default false;
alter table characters add column if not exists gm_invuln boolean not null default false;
alter table characters add column if not exists gm_vel real not null default 1;
alter table inventory_items add column if not exists gmv boolean not null default false;
alter table equipment add column if not exists gmv boolean not null default false;
