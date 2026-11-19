import type { ActionDef, ActionId, CharClass } from "./index";

/**
 * Itens do jogo. Definições compartilhadas: o servidor decide tudo; o cliente só exibe.
 *
 * Qualquer classe pode DROPAR item de qualquer classe, mas só a classe do item pode EQUIPAR (e só então valem os bônus).
 * Quase tudo é gerado por tabelas (famílias x raridades): o id de um item é `<familia>_<raridade>` (ex.: "montante_epic").
 */
export type ItemKind = "weapon" | "offhand" | "helmet" | "armor" | "boots" | "cape" | "potion";
export type Rarity = "common" | "uncommon" | "rare" | "epic" | "legendary" | "mythic";
export const RARITIES: readonly Rarity[] = ["common", "uncommon", "rare", "epic", "legendary", "mythic"];
export const rarityIndex = (r: Rarity) => RARITIES.indexOf(r);

export type EquipSlot = "weapon" | "offhand" | "helmet" | "armor" | "boots" | "cape";
export const EQUIP_SLOTS: readonly EquipSlot[] = ["weapon", "offhand", "helmet", "armor", "boots", "cape"];
export const EQUIP_SLOT_NAME: Record<EquipSlot, string> = { weapon: "Arma", offhand: "Mão secundária", helmet: "Elmo", armor: "Armadura", boots: "Botas", cape: "Capa" };

/** Modificadores de um tipo de arma (o "kit"): multiplicadores (1 = igual) e pontos de crítico. Valem para o personagem enquanto a arma está equipada. */
export interface ActionMod { dmg?: number; cd?: number; radius?: number; range?: number; cost?: number; heal?: number }
export interface WeaponKit extends ActionMod {
  crit?: number; // pontos percentuais de chance de crítico
  act?: Partial<Record<ActionId, ActionMod>>; // ajustes só de uma ação
}
export interface WeaponTypeDef {
  id: string; cls: CharClass; name: string; hands: 1 | 2;
  focus: string; // frase curta para a mochila
  minLevelAdd: number; // tipos mais exigentes pedem mais nível
  kit: WeaponKit;
}

export const WEAPON_TYPES: Record<string, WeaponTypeDef> = {};
const wt = (d: WeaponTypeDef) => { WEAPON_TYPES[d.id] = d; return d; };
// Guerreiro: 3 espadas de duas mãos OU a espada de uma mão com mão secundária (escudo ou adaga)
wt({ id: "montante", cls: "warrior", name: "Montante", hands: 2, focus: "Golpes lentos e devastadores; Queda do Colosso maior e mais forte.", minLevelAdd: 2, kit: { dmg: 1.15, cd: 1.2, act: { ultimate: { dmg: 1.25, radius: 1.15 } } } });
wt({ id: "espada_larga", cls: "warrior", name: "Espada Larga", hands: 2, focus: "Equilíbrio: golpes mais rápidos e chance de crítico.", minLevelAdd: 1, kit: { dmg: 1.05, cd: 0.9, crit: 4 } });
wt({ id: "lamina_runica", cls: "warrior", name: "Lâmina Rúnica", hands: 2, focus: "Investida e Correntes mais fortes, e habilidades gastam menos Fúria.", minLevelAdd: 3, kit: { cost: 0.8, act: { skill1: { dmg: 1.2, radius: 1.15 }, skill2: { dmg: 1.2 } } } });
wt({ id: "espada_1m", cls: "warrior", name: "Espada de Uma Mão", hands: 1, focus: "Rápida; libera a mão secundária (escudo ou adaga).", minLevelAdd: 0, kit: { cd: 0.85, crit: 3 } });
// Arqueiro
wt({ id: "arco_longo", cls: "archer", name: "Arco Longo", hands: 2, focus: "Alcance maior e tiros mais fortes, porém mais lentos.", minLevelAdd: 2, kit: { dmg: 1.05, cd: 1.1, range: 1.3 } });
wt({ id: "arco_curto", cls: "archer", name: "Arco Curto", hands: 1, focus: "Disparos rápidos de curto alcance; aceita aljava.", minLevelAdd: 0, kit: { dmg: 0.95, cd: 0.8, range: 0.85 } });
wt({ id: "besta", cls: "archer", name: "Besta", hands: 1, focus: "Virotes pesados e críticos; Perfurar mais forte; aceita aljava.", minLevelAdd: 3, kit: { dmg: 1.15, cd: 1.35, crit: 6, act: { skill1: { dmg: 1.1 } } } });
// Clérigo
wt({ id: "cajado_sagrado", cls: "cleric", name: "Cajado Sagrado", hands: 2, focus: "Curas mais fortes e habilidades mais baratas.", minLevelAdd: 1, kit: { heal: 1.25, cost: 0.9 } });
wt({ id: "cetro", cls: "cleric", name: "Cetro", hands: 1, focus: "Mais dano e mais velocidade; aceita escudo ou relicário.", minLevelAdd: 0, kit: { dmg: 1.2, cd: 0.9 } });
wt({ id: "maca", cls: "cleric", name: "Maça", hands: 1, focus: "Misto de dano e cura; aceita escudo ou relicário.", minLevelAdd: 2, kit: { dmg: 1.1, heal: 1.1 } });
// Mago
wt({ id: "cajado_arcano", cls: "mage", name: "Cajado Arcano", hands: 2, focus: "Explosões maiores e mais fortes, em troca de recarga.", minLevelAdd: 2, kit: { dmg: 1.1, cd: 1.1, radius: 1.15 } });
wt({ id: "varinha", cls: "mage", name: "Varinha", hands: 1, focus: "Conjuração rápida e barata; aceita tomo ou orbe.", minLevelAdd: 0, kit: { dmg: 0.95, cd: 0.8, cost: 0.85 } });
wt({ id: "orbe_instavel", cls: "mage", name: "Orbe Instável", hands: 2, focus: "Bola de Fogo e Meteoro devastadores; o resto mais lento.", minLevelAdd: 3, kit: { cd: 1.15, act: { skill1: { dmg: 1.2, radius: 1.2 }, ultimate: { dmg: 1.15 } } } });

export interface ItemDef {
  id: string;
  name: string;
  kind: ItemKind;
  rarity: Rarity;
  minLevel: number; // nível mínimo para equipar
  cls?: CharClass; // equipamento exclusivo de uma classe (poções servem a todas)
  wtype?: string; // arma: tipo (WEAPON_TYPES)
  hands?: 1 | 2; // arma: 2 = ocupa a mão secundária também
  dmgPct?: number; // bônus de dano e cura (%)
  hp?: number; // bônus de vida
  crit?: number; // pontos de chance de crítico
  dr?: number; // redução de dano (%)
  cdr?: number; // redução de recarga das habilidades (%)
  mana?: number; // máximo do recurso da classe
  regen?: number; // regeneração do recurso (por segundo)
  heal?: number; // poção: cura
  stack: number; // quantidade máxima por espaço
  desc: string;
}

export const RARITY_COLOR: Record<Rarity, string> = { common: "#9ea7b3", uncommon: "#5fd17a", rare: "#2f8bff", epic: "#ffc83d", legendary: "#ff3b30", mythic: "#b44dff" };
export const RARITY_NAME: Record<Rarity, string> = { common: "Comum", uncommon: "Incomum", rare: "Raro", epic: "Épico", legendary: "Lendário", mythic: "Mítico" };
export const RARITY_HEX: Record<Rarity, number> = { common: 0x9ea7b3, uncommon: 0x5fd17a, rare: 0x2f8bff, epic: 0xffc83d, legendary: 0xff3b30, mythic: 0xb44dff };

// ------------------------------------------------------------ geração das tabelas
const SUFFIX = ["Simples", "de Ferro", "da Geada", "Solar", "Carmesim", "do Abismo"]; // sem gênero: servem a qualquer nome
const LEVEL_BY_RARITY = [1, 3, 6, 14, 26, 40];
const WEAPON_PCT = [10, 20, 35, 55, 80, 115];
const ARMOR_HP = [15, 30, 55, 90, 140, 210];
const ARMOR_DR = [0, 1, 2, 3, 5, 7];
const BOOT_CDR = [0, 0, 2, 4, 6, 9];
const HELM_MANA = [0, 0, 5, 10, 18, 30];
const CAPE_REGEN = [0.2, 0.4, 0.7, 1, 1.4, 2];
const OFF_PCT = [1, 2, 3, 5, 7, 10];
/** Quanto do bônus percentual de arma cada classe recebe: as de dano em área (Arqueiro e Mago) ganham menos, para não passarem dos outros. */
const WEAPON_PCT_SCALE: Record<CharClass, number> = { warrior: 1, cleric: 1, archer: 0.75, mage: 0.7 };

export const ITEMS: Record<string, ItemDef> = {};
const add = (d: Omit<ItemDef, "stack"> & { stack?: number }) => { ITEMS[d.id] = { stack: 1, ...d }; };

for (const t of Object.values(WEAPON_TYPES)) {
  RARITIES.forEach((rarity, r) => add({
    id: `${t.id}_${rarity}`, name: `${t.name} ${SUFFIX[r]}`, kind: "weapon", rarity, minLevel: LEVEL_BY_RARITY[r] + t.minLevelAdd, cls: t.cls, wtype: t.id, hands: t.hands,
    dmgPct: Math.round(WEAPON_PCT[r] * WEAPON_PCT_SCALE[t.cls]), desc: t.focus,
  }));
}

/** Mãos secundárias: escudo (vida e defesa), adaga (crítico), aljava (crítico e dano), relicário/tomo (dano e mana), orbe (dano e crítico). */
interface OffFamily { id: string; cls: CharClass; name: string; desc: string; stats: (r: number) => Partial<ItemDef> }
const OFFHANDS: OffFamily[] = [
  { id: "escudo_guerra", cls: "warrior", name: "Escudo de Guerra", desc: "Mão secundária: vida e defesa.", stats: (r) => ({ hp: Math.round(ARMOR_HP[r] * 0.6), dr: OFF_PCT[r] }) },
  { id: "adaga_sombria", cls: "warrior", name: "Adaga", desc: "Mão secundária: golpes críticos.", stats: (r) => ({ crit: OFF_PCT[r], dmgPct: Math.round(WEAPON_PCT[r] * 0.2) }) },
  { id: "aljava", cls: "archer", name: "Aljava", desc: "Mão secundária: pontaria e dano.", stats: (r) => ({ crit: OFF_PCT[r], dmgPct: Math.round(WEAPON_PCT[r] * 0.18) }) },
  { id: "escudo_sagrado", cls: "cleric", name: "Escudo Sagrado", desc: "Mão secundária: vida e defesa.", stats: (r) => ({ hp: Math.round(ARMOR_HP[r] * 0.5), dr: OFF_PCT[r] }) },
  { id: "relicario", cls: "cleric", name: "Relicário", desc: "Mão secundária: poder e mana.", stats: (r) => ({ dmgPct: Math.round(WEAPON_PCT[r] * 0.35), mana: HELM_MANA[r] + 4 * r }) },
  { id: "tomo_arcano", cls: "mage", name: "Tomo Arcano", desc: "Mão secundária: poder e mana.", stats: (r) => ({ dmgPct: Math.round(WEAPON_PCT[r] * 0.28), mana: HELM_MANA[r] + 4 * r }) },
  { id: "orbe_flutuante", cls: "mage", name: "Orbe Flutuante", desc: "Mão secundária: poder explosivo (crítico).", stats: (r) => ({ dmgPct: Math.round(WEAPON_PCT[r] * 0.2), crit: OFF_PCT[r] }) },
];
for (const f of OFFHANDS) {
  RARITIES.forEach((rarity, r) => add({ id: `${f.id}_${rarity}`, name: `${f.name} ${SUFFIX[r]}`, kind: "offhand", rarity, minLevel: LEVEL_BY_RARITY[r] + 1, cls: f.cls, desc: f.desc, ...f.stats(r) }));
}

/** Armadura, elmo, botas e capa de cada classe. */
const GEAR_NAMES: Record<CharClass, Record<"armor" | "helmet" | "boots" | "cape", string>> = {
  warrior: { armor: "Couraça", helmet: "Elmo", boots: "Grevas", cape: "Manto de Guerra" },
  archer: { armor: "Gibão", helmet: "Capuz", boots: "Botas de Caçador", cape: "Capa de Caçador" },
  cleric: { armor: "Vestes Sagradas", helmet: "Mitra", boots: "Sandálias", cape: "Manto Sagrado" },
  mage: { armor: "Túnica Arcana", helmet: "Chapéu Arcano", boots: "Botas Arcanas", cape: "Capa Arcana" },
};
export const GEAR_CLASSES: readonly CharClass[] = ["warrior", "archer", "cleric", "mage"];
for (const cls of GEAR_CLASSES) {
  RARITIES.forEach((rarity, r) => {
    const base = { rarity, minLevel: LEVEL_BY_RARITY[r], cls };
    add({ ...base, id: `${cls}_armor_${rarity}`, name: `${GEAR_NAMES[cls].armor} ${SUFFIX[r]}`, kind: "armor", hp: ARMOR_HP[r], dr: ARMOR_DR[r], desc: "Proteção para o corpo." });
    add({ ...base, id: `${cls}_helmet_${rarity}`, name: `${GEAR_NAMES[cls].helmet} ${SUFFIX[r]}`, kind: "helmet", hp: Math.round(ARMOR_HP[r] * 0.5), mana: HELM_MANA[r], desc: "Proteção para a cabeça." });
    add({ ...base, id: `${cls}_boots_${rarity}`, name: `${GEAR_NAMES[cls].boots} ${SUFFIX[r]}`, kind: "boots", hp: Math.round(ARMOR_HP[r] * 0.4), cdr: BOOT_CDR[r], desc: "Passos leves: habilidades voltam mais cedo." });
    add({ ...base, id: `${cls}_cape_${rarity}`, name: `${GEAR_NAMES[cls].cape} ${SUFFIX[r]}`, kind: "cape", hp: Math.round(ARMOR_HP[r] * 0.3), regen: CAPE_REGEN[r], dr: r >= 3 ? r - 2 : 0, desc: "Recupera o recurso da classe mais depressa." });
  });
}

add({ id: "pocao_de_vida", name: "Poção de Vida", kind: "potion", rarity: "common", minLevel: 1, heal: 40, stack: 10, desc: "Recupera 40 de vida." });

// ------------------------------------------------------------ itens antigos (migração)
// Os itens da primeira versão viram o equivalente nas novas tabelas (mesma raridade e classe) quando o inventário é carregado.
const LEGACY_WEAPON: Record<string, string> = {
  espada_enferrujada: "espada_1m_common", espada_de_ferro: "espada_1m_uncommon", lamina_da_geada: "espada_1m_rare",
  arco_curto: "arco_curto_common", arco_composto: "arco_longo_uncommon", arco_da_geada: "arco_longo_rare",
  cajado_de_galho: "cajado_sagrado_common", cajado_de_cinzas: "cajado_sagrado_uncommon", cajado_da_brasa: "cajado_sagrado_rare",
  cajado_de_aprendiz: "cajado_arcano_common", cajado_de_cristal: "cajado_arcano_uncommon", cajado_do_vazio: "cajado_arcano_rare",
};
const LEGACY_ARMOR: Record<string, Rarity> = { gibao_surrado: "common", cota_de_malha: "uncommon", armadura_de_brasa: "rare" };
/** id atual de um item (itens antigos são traduzidos; a armadura antiga servia a todos e vira a da classe do personagem). */
export function migrateItemId(id: string, cls: CharClass): string {
  if (LEGACY_WEAPON[id]) return LEGACY_WEAPON[id];
  if (LEGACY_ARMOR[id]) return `${cls}_armor_${LEGACY_ARMOR[id]}`;
  return id;
}

// ------------------------------------------------------------ inventário
export const INV_SLOTS = 20;
export const POTION_COOLDOWN_S = 6;

export interface InvStack { id: string; qty: number }
export interface InventorySnapshot {
  inv: (InvStack | null)[];
  equip: Record<EquipSlot, string | null>;
  iron: number; // saldo de Tostões de Ferro
  obols: number; // saldo de Óbolos de Sangue
}
export interface LootEvent { id: string; qty: number }
export interface NoticeEvent { text: string; ok?: boolean } // ok: aviso de sucesso (o cliente mostra em verde)

// ------------------------------------------------------------ bônus e kit do equipamento
export interface GearBonuses { dmgPct: number; hp: number; crit: number; dr: number; cdr: number; mana: number; regen: number; kit: WeaponKit }
export const NO_KIT: WeaponKit = {};
export const emptyBonuses = (): GearBonuses => ({ dmgPct: 0, hp: 0, crit: 0, dr: 0, cdr: 0, mana: 0, regen: 0, kit: NO_KIT });
export const MAX_CDR = 30; // redução de recarga: teto (%)
export const MAX_DR = 60; // redução de dano de equipamento: teto (%)

/** Soma os bônus do que está equipado e escolhe o kit da arma. Item de outra classe NÃO conta (equipar já recusa; isto protege dados antigos). */
export function gearBonuses(equip: Record<EquipSlot, string | null>, cls: CharClass): GearBonuses {
  const b = emptyBonuses();
  for (const s of EQUIP_SLOTS) {
    const d = equip[s] ? ITEMS[equip[s]!] : undefined;
    if (!d || (d.cls && d.cls !== cls)) continue;
    b.dmgPct += d.dmgPct ?? 0; b.hp += d.hp ?? 0; b.crit += d.crit ?? 0; b.dr += d.dr ?? 0; b.cdr += d.cdr ?? 0; b.mana += d.mana ?? 0; b.regen += d.regen ?? 0;
    if (s === "weapon" && d.wtype) b.kit = WEAPON_TYPES[d.wtype]?.kit ?? NO_KIT;
  }
  b.dr = Math.min(MAX_DR, b.dr);
  b.cdr = Math.min(MAX_CDR, b.cdr);
  return b;
}

/** A ação como o personagem a executa de fato: o kit da arma e a redução de recarga ajustam a definição da classe. */
export function effectiveAction(def: ActionDef, a: ActionId, kit: WeaponKit, cdr = 0): ActionDef {
  const m = (k: keyof ActionMod) => (kit[k] ?? 1) * (kit.act?.[a]?.[k] ?? 1);
  const out: ActionDef = { ...def, cd: def.cd * m("cd") * (1 - cdr / 100) };
  if (def.cost) out.cost = Math.round(def.cost * m("cost"));
  if (def.dmg) out.dmg = def.dmg * m("dmg");
  if (def.heal) out.heal = def.heal * m("heal");
  if (def.radius) out.radius = def.radius * m("radius");
  if (def.blast) out.blast = def.blast * m("radius");
  if (def.range) out.range = def.range * m("range");
  if (def.placeRange) out.placeRange = def.placeRange * m("range");
  return out;
}

const ACTION_LABEL: Record<ActionId, string> = { attack: "Ataque", skill1: "Q", skill2: "W", skill3: "E", ultimate: "R", dodge: "Esquiva" };
const FIELD_LABEL: Record<string, string> = { dmg: "dano", radius: "área", cost: "custo", cd: "recarga", range: "alcance", heal: "cura" };
/** Linhas de texto do kit de um tipo de arma (para a mochila). */
export function kitLines(k: WeaponKit): string[] {
  const out: string[] = [];
  const pct = (v: number) => `${v >= 1 ? "+" : "−"}${Math.round(Math.abs(v - 1) * 100)}%`;
  const labels: [keyof ActionMod, string][] = [["dmg", "Dano"], ["cd", "Recarga"], ["cost", "Custo"], ["radius", "Área"], ["range", "Alcance"], ["heal", "Cura"]];
  for (const [f, name] of labels) if (k[f] && k[f] !== 1) out.push(`${name} ${pct(k[f]!)}`);
  if (k.crit) out.push(`Crítico +${k.crit}%`);
  for (const [a, mod] of Object.entries(k.act ?? {})) {
    out.push(`${ACTION_LABEL[a as ActionId] ?? a}: ${Object.entries(mod).map(([f, v]) => `${FIELD_LABEL[f] ?? f} ${pct(v as number)}`).join(", ")}`);
  }
  return out;
}
