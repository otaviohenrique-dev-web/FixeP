-- Novos espaços de equipamento (mão secundária, elmo, botas e capa, além de arma e armadura).
-- Os ids dos itens antigos são traduzidos pelo servidor ao carregar o inventário (shared/src/items.ts: migrateItemId).
alter table equipment drop constraint if exists equipment_slot_check;
alter table equipment add constraint equipment_slot_check check (slot in ('weapon', 'offhand', 'helmet', 'armor', 'boots', 'cape'));
