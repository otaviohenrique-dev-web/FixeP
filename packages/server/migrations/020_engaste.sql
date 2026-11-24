-- FrixeP: engaste de gemas (C3.3). Coluna = gemas engastadas em texto ("forca,vida"); NULL = sem gema.
-- Equipamento antigo continua válido (NULL = nenhuma gema).
alter table inventory_items add column if not exists gm text;
alter table equipment add column if not exists gm text;
