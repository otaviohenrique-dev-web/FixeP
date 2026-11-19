// Baú de armazenamento da cidade: fixo no chão, pessoal (por personagem), com muitos espaços em páginas.
import type { InvStack } from "./items";

export const VAULT_PAGE = 30; // espaços por página (6 x 5)
export const VAULT_PAGES = 6;
export const VAULT_SLOTS = VAULT_PAGE * VAULT_PAGES; // 180
export const VAULT_REACH = 3.5; // distância (tiles) até o baú para abrir e para cada operação (o servidor confere sempre)
export const VAULT_COIN_MAX = 999_999_999; // mesmo teto da bolsa
export interface VaultSnapshot { slots: (InvStack | null)[]; iron: number; obols: number }
