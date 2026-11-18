-- Zona atual do personagem (1 = Cinzas, 2 = Floresta Gélida, 3 = Catacumbas). O servidor é quem muda este valor.
alter table characters add column if not exists zone integer not null default 1;
