import type { CharClass } from "./index";

/** Itens do jogo. Definições compartilhadas: o servidor decide tudo; o cliente só exibe. */
export type ItemKind = "weapon" | "armor" | "potion";
export type Rarity = "common" | "uncommon" | "rare";

export interface ItemDef {
  id: string;
  name: string;
  kind: ItemKind;
  rarity: Rarity;
  minLevel: number; // nível mínimo para equipar
  cls?: CharClass; // arma exclusiva de uma classe (armaduras e poções servem a todas)
  dmgPct?: number; // arma: bônus de dano (%)
  hp?: number; // armadura: bônus de vida
  heal?: number; // poção: cura
  stack: number; // quantidade máxima por espaço
  desc: string;
}

export const ITEMS: Record<string, ItemDef> = {
  espada_enferrujada: { id: "espada_enferrujada", name: "Espada Enferrujada", kind: "weapon", rarity: "common", minLevel: 1, cls: "warrior", dmgPct: 10, stack: 1, desc: "Lâmina gasta, mas ainda corta." },
  espada_de_ferro: { id: "espada_de_ferro", name: "Espada de Ferro", kind: "weapon", rarity: "uncommon", minLevel: 3, cls: "warrior", dmgPct: 20, stack: 1, desc: "Forjada nas ruínas do norte." },
  lamina_da_geada: { id: "lamina_da_geada", name: "Lâmina da Geada", kind: "weapon", rarity: "rare", minLevel: 6, cls: "warrior", dmgPct: 35, stack: 1, desc: "Fria ao toque; nunca derrete." },
  arco_curto: { id: "arco_curto", name: "Arco Curto", kind: "weapon", rarity: "common", minLevel: 1, cls: "archer", dmgPct: 10, stack: 1, desc: "Madeira simples, corda firme." },
  arco_composto: { id: "arco_composto", name: "Arco Composto", kind: "weapon", rarity: "uncommon", minLevel: 3, cls: "archer", dmgPct: 20, stack: 1, desc: "Camadas de chifre e nervo." },
  arco_da_geada: { id: "arco_da_geada", name: "Arco da Geada", kind: "weapon", rarity: "rare", minLevel: 6, cls: "archer", dmgPct: 35, stack: 1, desc: "Suas flechas deixam um rastro de gelo." },
  cajado_de_galho: { id: "cajado_de_galho", name: "Cajado de Galho", kind: "weapon", rarity: "common", minLevel: 1, cls: "cleric", dmgPct: 10, stack: 1, desc: "Um galho abençoado pelas cinzas." },
  cajado_de_cinzas: { id: "cajado_de_cinzas", name: "Cajado de Cinzas", kind: "weapon", rarity: "uncommon", minLevel: 3, cls: "cleric", dmgPct: 20, stack: 1, desc: "Ainda morno depois de tantos invernos." },
  cajado_da_brasa: { id: "cajado_da_brasa", name: "Cajado da Brasa", kind: "weapon", rarity: "rare", minLevel: 6, cls: "cleric", dmgPct: 35, stack: 1, desc: "Guarda uma chama que não se apaga." },
  cajado_de_aprendiz: { id: "cajado_de_aprendiz", name: "Cajado de Aprendiz", kind: "weapon", rarity: "common", minLevel: 1, cls: "mage", dmgPct: 10, stack: 1, desc: "Um cristal opaco preso à haste." },
  cajado_de_cristal: { id: "cajado_de_cristal", name: "Cajado de Cristal", kind: "weapon", rarity: "uncommon", minLevel: 3, cls: "mage", dmgPct: 20, stack: 1, desc: "O cristal vibra perto de magia." },
  cajado_do_vazio: { id: "cajado_do_vazio", name: "Cajado do Vazio", kind: "weapon", rarity: "rare", minLevel: 6, cls: "mage", dmgPct: 35, stack: 1, desc: "Dizem que ele escuta o que você pensa." },
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
