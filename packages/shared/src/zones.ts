// Zonas do mundo: cada uma é uma sala própria no servidor. Os dados ficam aqui para servidor e cliente concordarem.
// Não há faixa de nível: qualquer jogador pode atravessar quando quiser; as zonas mais fundas são MUITO mais punitivas
// (inimigos de nível alto) e, em troca, concentram mais recursos (`lootMult` maior = mais itens e raridades melhores).

import type { Rarity } from "./items";

export type EnemyKind = "skeleton" | "wolf" | "wraith" | "bone_king" | "frost_alpha" | "crypt_lord";
export type ZoneTheme = "ash" | "frost" | "crypt";

export interface PortalDef { x: number; y: number; r: number; to: number }
export interface ZoneDef {
  id: number;
  name: string;
  theme: ZoneTheme;
  w: number;
  h: number;
  spawn: { x: number; y: number }; // ponto de nascimento padrão (entrada, reconexão e renascimento)
  arrive: Record<number, { x: number; y: number }>; // onde se chega vindo de cada zona (fora do raio dos portais)
  portals: readonly PortalDef[]; // basta pisar neles: o servidor decide a travessia
  enemies: readonly { kind: EnemyKind; x: number; y: number; level: number }[];
  lootMult: number; // dificuldade relativa da zona (informativo; os números reais ficam em `drops` e `boss`)
  drops: ZoneDrops; // o que os inimigos comuns soltam
  boss: ZoneBoss; // o chefe da zona (um por zona) e o baú que ele solta
}

/** Drops de inimigos comuns: chance de equipamento/poção por abate e pesos das raridades. Raridade que não está na tabela NUNCA cai aqui (teto da zona). */
export interface ZoneDrops { gear: number; potion: number; weights: Partial<Record<Rarity, number>> }
/** Chefe: aparece sempre; ao cair, volta depois de `respawnS`. O baú dá `count` itens (o primeiro, no mínimo `min`) e a tabela é o teto da zona. */
export interface ZoneBoss {
  kind: EnemyKind; x: number; y: number; level: number; respawnS: number; name: string;
  chest: { count: number; min: Rarity; weights: Partial<Record<Rarity, number>> };
}

export const PORTAL_RADIUS = 1.6;

export const ZONES: Record<number, ZoneDef> = {
  1: {
    id: 1, name: "Cinzas", theme: "ash", w: 40, h: 40,
    spawn: { x: 20, y: 20 },
    arrive: { 2: { x: 32, y: 32.5 } },
    portals: [{ x: 36, y: 36, r: PORTAL_RADIUS, to: 2 }],
    enemies: [
      // todos a mais de 10 tiles do spawn do jogador (aggro = 7): o jogador nasce em segurança.
      // Quanto mais longe do início, mais forte (e mais XP): o nível de cada ponto fica aqui.
      { kind: "skeleton", x: 30, y: 16, level: 1 },
      { kind: "skeleton", x: 31, y: 24, level: 1 },
      { kind: "skeleton", x: 26, y: 30, level: 1 },
      { kind: "skeleton", x: 10, y: 26, level: 2 },
      { kind: "skeleton", x: 11, y: 12, level: 3 },
    ],
    lootMult: 1,
    drops: { gear: 0.07, potion: 0.08, weights: { common: 85, uncommon: 15 } },
    boss: { kind: "bone_king", name: "Rei Ossudo", x: 33, y: 7, level: 6, respawnS: 300, chest: { count: 2, min: "uncommon", weights: { common: 45, uncommon: 55 } } },
  },
  2: {
    id: 2, name: "Floresta Gélida", theme: "frost", w: 44, h: 44,
    spawn: { x: 8, y: 8 },
    arrive: { 1: { x: 8, y: 8 }, 3: { x: 36, y: 36 } },
    portals: [
      { x: 4, y: 4, r: PORTAL_RADIUS, to: 1 },
      { x: 40, y: 40, r: PORTAL_RADIUS, to: 3 },
    ],
    enemies: [
      { kind: "wolf", x: 20, y: 10, level: 6 },
      { kind: "wolf", x: 12, y: 22, level: 6 },
      { kind: "skeleton", x: 28, y: 14, level: 6 },
      { kind: "skeleton", x: 22, y: 26, level: 7 },
      { kind: "wolf", x: 32, y: 24, level: 8 },
      { kind: "skeleton", x: 14, y: 34, level: 8 },
      { kind: "wolf", x: 28, y: 34, level: 9 },
      { kind: "wolf", x: 38, y: 28, level: 10 },
    ],
    lootMult: 1.6,
    drops: { gear: 0.09, potion: 0.1, weights: { common: 62, uncommon: 30, rare: 8 } },
    boss: { kind: "frost_alpha", name: "Lobo Alfa", x: 37, y: 10, level: 11, respawnS: 420, chest: { count: 3, min: "rare", weights: { uncommon: 30, rare: 52, epic: 18 } } },
  },
  3: {
    id: 3, name: "Catacumbas", theme: "crypt", w: 44, h: 44,
    spawn: { x: 8, y: 8 },
    arrive: { 2: { x: 8, y: 8 } },
    portals: [{ x: 4, y: 4, r: PORTAL_RADIUS, to: 2 }],
    enemies: [
      { kind: "skeleton", x: 20, y: 12, level: 12 },
      { kind: "wraith", x: 14, y: 22, level: 13 },
      { kind: "skeleton", x: 28, y: 18, level: 13 },
      { kind: "wraith", x: 26, y: 28, level: 15 },
      { kind: "skeleton", x: 12, y: 36, level: 15 },
      { kind: "wraith", x: 34, y: 14, level: 16 },
      { kind: "wraith", x: 36, y: 32, level: 18 },
      { kind: "wraith", x: 22, y: 38, level: 20 },
    ],
    lootMult: 2.4,
    drops: { gear: 0.11, potion: 0.12, weights: { common: 50, uncommon: 35, rare: 13, epic: 2 } },
    boss: { kind: "crypt_lord", name: "Soberano das Catacumbas", x: 36, y: 8, level: 21, respawnS: 600, chest: { count: 3, min: "epic", weights: { rare: 25, epic: 55, legendary: 18, mythic: 2 } } },
  },
};

export const ZONE_IDS: readonly number[] = Object.keys(ZONES).map(Number);
export const DEFAULT_ZONE = 1;
export const isZoneId = (z: unknown): z is number => typeof z === "number" && Number.isInteger(z) && z in ZONES;
/** Nome da sala do Colyseus de cada zona (a zona 1 mantém o nome antigo "zone"). */
export const zoneRoomName = (id: number) => (id === DEFAULT_ZONE ? "zone" : `zone${id}`);
