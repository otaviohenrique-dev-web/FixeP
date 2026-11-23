-- FrixeP: auto-poção com limiar escolhido pelo jogador (0 = desligada; passo 5; máximo 90). Padrão 0: quem já joga continua sem auto-poção.
-- O servidor valida o valor (clampAutoPot em packages/shared) e a coluna tem o mesmo limite como rede de segurança.
alter table characters add column if not exists auto_pot_at integer not null default 0 check (auto_pot_at between 0 and 90);
