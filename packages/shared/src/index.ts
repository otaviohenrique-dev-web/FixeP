// Simulação em grade ortogonal (servidor). Isométrico é só projeção no cliente.
export const MAP_W = 40;
export const MAP_H = 40;
export const TICK_RATE = 20; // Hz
export const MOVE_SPEED = 4; // tiles/s
export const MAX_CLIENTS_PER_ZONE = 50;
export const SPAWN = { x: 20, y: 20 };

export const Msg = {
  MoveTo: "move_to",
  Act: "act", // ação de combate: { a, ax, ay }
} as const;

/** Eventos de combate enviados pelo servidor (broadcast). */
export const Evt = {
  Swing: "swing", // alguém executou uma ação (visual)
  Telegraph: "telegraph", // inimigo vai atacar numa área
  Hit: "hit", // dano aplicado
  Died: "died",
  LevelUp: "levelup",
} as const;

export interface MoveToPayload {
  x: number; // tile
  y: number;
}

export type ActionId = "attack" | "skill1" | "skill2" | "skill3" | "dodge";
export const ACTION_IDS: readonly ActionId[] = ["attack", "skill1", "skill2", "skill3", "dodge"];

/** O cliente manda INTENÇÃO: qual ação e para onde mira (ponto em tiles). */
export interface ActPayload {
  a: ActionId;
  ax: number;
  ay: number;
}

export interface SwingEvent { id: string; a: ActionId; x: number; y: number; dir: number }
export interface TelegraphEvent { id: string; x: number; y: number; r: number; ms: number }
export interface HitEvent { k: "e" | "p"; id: string; dmg: number; crit: boolean; x: number; y: number; by?: string }
export interface DiedEvent { k: "e" | "p"; id: string }
export interface LevelUpEvent { id: string; level: number }

export const clamp = (v: number, min: number, max: number) => Math.min(max, Math.max(min, v));

// ------------------------------------------------------------ regras de combate
// Todas as distâncias em tiles, tempos em segundos.
export const PLAYER_RADIUS = 0.4;
export const CRIT = { chance: 0.1, mult: 1.5 } as const;
export const DAMAGE_VARIANCE = 0.1; // +-10%

export interface ActionDef {
  name: string;
  key: string; // tecla padrão (dica na HUD)
  cd: number;
  dmg?: number;
  offset?: number; // centro do golpe à frente do jogador
  radius?: number;
  dash?: number; // distância do deslocamento
  dashTime?: number;
  invulnS?: number;
  buffS?: number;
  reduction?: number;
  tauntRadius?: number;
  tauntS?: number;
}

export const WARRIOR = {
  maxHp: 120,
  speed: MOVE_SPEED,
  respawnS: 3,
  actions: {
    attack: { name: "Golpe", key: "ESPAÇO", cd: 0.55, dmg: 12, offset: 1.0, radius: 1.25 },
    skill1: { name: "Giro", key: "1", cd: 4, dmg: 20, offset: 0, radius: 2.3 },
    skill2: { name: "Carga", key: "2", cd: 6, dmg: 16, dash: 4.5, dashTime: 0.25, radius: 1.1 },
    skill3: { name: "Grito", key: "3", cd: 12, buffS: 4, reduction: 0.5, tauntRadius: 6, tauntS: 3 },
    dodge: { name: "Esquiva", key: "SHIFT", cd: 1.4, dash: 3, dashTime: 0.25, invulnS: 0.3 },
  } satisfies Record<ActionId, ActionDef>,
};

export const SKELETON = {
  name: "Esqueleto",
  maxHp: 60,
  speed: 2.4,
  aggro: 7,
  leash: 14,
  engage: 1.7, // distância para iniciar o ataque
  windupS: 0.7, // tempo do telégrafo (dá para esquivar)
  strikeOffset: 1.0,
  strikeRadius: 1.3,
  dmg: 14,
  recoverS: 1.0,
  respawnS: 8,
  radius: 0.45,
};

export const ENEMY_SPAWNS: readonly { x: number; y: number }[] = [
  // todos a mais de 10 tiles do spawn do jogador (aggro = 7): o jogador nasce em segurança
  { x: 30, y: 16 },
  { x: 31, y: 24 },
  { x: 26, y: 30 },
  { x: 10, y: 26 },
  { x: 11, y: 12 },
];

// ------------------------------------------------------------ progressão
export const LEVEL_CAP = 20;
export const XP_PER_KILL = 20;
/** XP necessário para sair do nível `level` para o próximo (0 no nível máximo). */
export const xpToNext = (level: number) => (level >= LEVEL_CAP ? 0 : 40 + 30 * level);
export const maxHpFor = (level: number) => WARRIOR.maxHp + 10 * (level - 1);
export const dmgMult = (level: number) => 1 + 0.05 * (level - 1);

// ------------------------------------------------------------ personagem
export type CharClass = "warrior" | "archer" | "cleric";
/** Classes jogáveis hoje (as outras aparecem como "em breve" na criação). */
export const PLAYABLE_CLASSES: readonly CharClass[] = ["warrior"];
export const NAME_MIN = 3;
export const NAME_MAX = 16;
export interface CharacterInfo { name: string; class: CharClass; level: number; xp: number }
