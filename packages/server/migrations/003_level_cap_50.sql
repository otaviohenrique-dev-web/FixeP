-- Nível máximo passa de 20 para 50 (a trava antiga recusaria salvar do nível 21 em diante).
alter table characters drop constraint if exists characters_level_check;
alter table characters add constraint characters_level_check check (level between 1 and 50);
