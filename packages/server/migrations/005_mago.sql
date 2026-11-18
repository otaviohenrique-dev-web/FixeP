-- 4ª classe jogável: Mago. A trava de classes da 001 passa a aceitar 'mage'.
alter table characters drop constraint if exists characters_class_check;
alter table characters add constraint characters_class_check check (class in ('warrior', 'archer', 'cleric', 'mage'));
