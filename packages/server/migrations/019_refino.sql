-- FrixeP: refino de equipamento (+N). Coluna = nível de refino (0 ou NULL = +0); equipamento antigo continua válido.
alter table inventory_items add column if not exists rf integer;
alter table equipment add column if not exists rf integer;
