-- FrixeP: afixos de item (atributos de drop). Lista JSON de ids de afixo por item; NULL = sem afixos (itens antigos continuam válidos).
alter table inventory_items add column if not exists af text;
alter table equipment add column if not exists af text;
