-- Economia: saldo de moedas do personagem (Tostões de Ferro e Óbolos de Sangue). Gravado junto com o inventário, na mesma transação.
alter table characters add column if not exists iron  integer not null default 0 check (iron  between 0 and 999999999);
alter table characters add column if not exists obols integer not null default 0 check (obols between 0 and 999999999);
