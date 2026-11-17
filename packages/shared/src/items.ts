/** Itens do jogo. Definições compartilhadas: o servidor decide tudo; o cliente só exibe. */
export type ItemKind = "weapon" | "armor" | "potion";
export type Rarity = "common" | "uncommon" | "rare";

export interface ItemDef {
  id: string;
  name: string;
  kind: ItemKind;
  rarity: Rarity;
  minLevel: number; // nível mínimo para equipar
  dmgPct?: number; // arma: bônus de dano (%)
  hp?: number; // armadura: bônus de vida
  heal?: number; // poção: cura
  stack: number; // quantidade máxima por espaço
  desc: string;
}

export const ITEMS: Record<string, ItemDef> = {
  espada_enferrujada: { id: "espada_enferrujada", name: "Espada Enferrujada", kind: "weapon", rarity: "common", minLevel: 1, dmgPct: 10, stack: 1, desc: "Lâmina gasta, mas ainda corta." },
  espada_de_ferro: { id: "espada_de_ferro", name: "Espada de Ferro", kind: "weapon", rarity: "uncommon", minLevel: 3, dmgPct: 20, stack: 1, desc: "Forjada nas ruínas do norte." },
  lamina_da_geada: { id: "lamina_da_geada", name: "Lâmina da Geada", kind: "weapon", rarity: "rare", minLevel: 6, dmgPct: 35, stack: 1, desc: "Fria ao toque; nunca derrete." },
  gibao_surrado: { id: "gibao_surrado", name: "Gibão Surrado", kind: "armor", rarity: "common", minLevel: 1, hp: 15, stack: 1, desc: "Couro remendado por muitos invernos." },
  cota_de_malha: { id: "cota_de_malha", name: "Cota de Malha", kind: "armor", rarity: "uncommon", minLevel: 3, hp: 30, stack: 1, desc: "Elos pesados, proteção firme." },
  armadura_de_brasa: { id: "armadura_de_brasa", name: "Armadura de Brasa", kind: "armor", rarity: "rare", minLevel: 6, hp: 55, stack: 1, desc: "Guarda o calor da última fogueira." },
  pocao_de_vida: { id: "pocao_de_vida", name: "Poção de Vida", kind: "potion", rarity: "common", minLevel: 1, heal: 40, stack: 10, desc: "Recupera 40 de vida." },
};

export const INV_SLOTS = 20;
export const POTION_COOLDOWN_S = 6;
export type EquipSlot = "weapon" | "armor";
export const EQUIP_SLOTS: readonly EquipSlot[] = ["weapon", "armor"];

export interface InvStack { id: string; qty: number }
export interface InventorySnapshot {
  inv: (InvStack | null)[];
  equip: { weapon: string | null; armor: string | null };
}
export interface LootEvent { id: string; qty: number }
export interface NoticeEvent { text: string }

export const RARITY_COLOR: Record<Rarity, string> = { common: "#b8c4d0", uncommon: "#5fd17a", rare: "#5aa8ff" };
export const RARITY_NAME: Record<Rarity, string> = { common: "Comum", uncommon: "Incomum", rare: "Raro" };
