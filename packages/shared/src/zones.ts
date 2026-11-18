// Zonas do mundo: cada uma é uma sala própria no servidor. Os dados ficam aqui para servidor e cliente concordarem.
// Não há faixa de nível: qualquer jogador pode atravessar quando quiser; as zonas mais fundas são MUITO mais punitivas
// (inimigos de nível alto) e, em troca, concentram mais recursos (`lootMult` maior = mais itens e raridades melhores).

export type EnemyKind = "skeleton" | "wolf" | "wraith";
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
  lootMult: number; // multiplicador de chance de itens (e de raridade) ao abater inimigos da zona
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
  },
};

export const ZONE_IDS: readonly number[] = Object.keys(ZONES).map(Number);
export const DEFAULT_ZONE = 1;
export const isZoneId = (z: unknown): z is number => typeof z === "number" && Number.isInteger(z) && z in ZONES;
/** Nome da sala do Colyseus de cada zona (a zona 1 mantém o nome antigo "zone"). */
export const zoneRoomName = (id: number) => (id === DEFAULT_ZONE ? "zone" : `zone${id}`);
