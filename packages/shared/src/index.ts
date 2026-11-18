// Simulação em grade ortogonal (servidor). Isométrico é só projeção no cliente.
export const MAP_W = 40;
export const MAP_H = 40;
export const TICK_RATE = 20; // Hz
export const MOVE_SPEED = 4; // tiles/s (igual para todas as classes)
export const MAX_CLIENTS_PER_ZONE = 50;
export const SPAWN = { x: 20, y: 20 };

export const Msg = {
  MoveTo: "move_to",
  Act: "act", // ação de combate: { a, ax, ay }
  InvEquip: "inv_equip", // { slot }
  InvUnequip: "inv_unequip", // { slot: "weapon" | "armor" }
  InvUse: "inv_use", // { slot }
  InvDrop: "inv_drop", // { slot }
  InvSync: "inv_sync", // pede a fotografia do inventário (o cliente pede depois de registrar os receptores)
  Ping: "ping", // { t }: o servidor devolve o mesmo t em Evt.Pong (o cliente mede a ida e volta)
} as const;

/** Eventos enviados pelo servidor. */
export const Evt = {
  Swing: "swing", // alguém executou uma ação (visual)
  Telegraph: "telegraph", // área que vai ser atingida (inimigo ou chuva de flechas)
  Hit: "hit", // dano aplicado
  Died: "died",
  LevelUp: "levelup",
  Heal: "heal", // cura aplicada (ou ressurreição)
  Proj: "proj", // projétil criado (o cliente anima o voo)
  ProjEnd: "projend", // projétil terminou (acertou ou acabou o alcance)
  Trap: "trap", // armadilha: colocada, disparou ou sumiu
  Pong: "pong", // resposta ao ping, só para quem perguntou
  Inv: "inv", // fotografia completa do inventário (só para o dono)
  Loot: "loot", // item recebido
  Notice: "notice", // aviso de texto para o dono
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
export interface TelegraphEvent { id: string; x: number; y: number; r: number; ms: number; friendly?: boolean }
export interface HitEvent { k: "e" | "p"; id: string; dmg: number; crit: boolean; x: number; y: number; by?: string }
export interface DiedEvent { k: "e" | "p"; id: string }
export interface LevelUpEvent { id: string; level: number }
export interface HealEvent { id: string; amount: number; x: number; y: number; revive?: boolean }
export interface ProjEvent { id: string; x: number; y: number; dir: number; speed: number; range: number; look: "arrow" | "pierce" | "bolt" }
export interface ProjEndEvent { id: string; x: number; y: number; hit: boolean }
export interface TrapEvent { id: string; s: "set" | "boom" | "gone"; x: number; y: number; r: number }

export const clamp = (v: number, min: number, max: number) => Math.min(max, Math.max(min, v));

// ------------------------------------------------------------ regras de combate
// Todas as distâncias em tiles, tempos em segundos.
export const PLAYER_RADIUS = 0.4;
export const CRIT = { chance: 0.1, mult: 1.5 } as const;
export const DAMAGE_VARIANCE = 0.1; // +-10%
export const RESPAWN_S = 8; // tempo caído; dá tempo de um Clérigo ressuscitar
export const SHARE_RADIUS = 14; // quem estiver a até 14 tiles de um abate divide XP e loot

export type CharClass = "warrior" | "archer" | "cleric";

/** Tipo de efeito de cada ação: o servidor decide o resultado, o cliente escolhe o visual. */
export type ActionKind =
  | "melee" // golpe em círculo à frente
  | "ring" // golpe em círculo ao redor
  | "dashHit" // avanço que machuca no caminho
  | "tauntBuff" // reduz dano recebido e provoca inimigos
  | "dodge" // deslocamento com invulnerabilidade
  | "projectile" // projétil em linha reta
  | "trap" // armadilha no chão
  | "rain" // área atingida depois de um atraso (telegrafada)
  | "healAoe" // cura aliados em volta
  | "emberBuff" // aliados causam mais dano por um tempo
  | "revive"; // levanta um aliado caído

export interface ActionDef {
  kind: ActionKind;
  name: string;
  key: string; // tecla padrão (dica na HUD)
  cd: number;
  cost?: number; // gasto do recurso da classe (Fúria, Foco ou Mana); sem custo = 0
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
  // projétil
  speed?: number;
  range?: number;
  pierce?: boolean;
  // armadilha / chuva
  placeRange?: number; // até onde o jogador pode colocar
  armS?: number; // tempo para armar
  lifeS?: number; // duração da armadilha
  delayS?: number; // atraso da chuva
  maxActive?: number; // limite de armadilhas ativas
  // cura / buff / ressurreição
  heal?: number;
  dmgPct?: number; // bônus de dano da Brasa (%)
  hpPct?: number; // vida com que o aliado volta
}

export interface ClassDef {
  id: CharClass;
  name: string;
  role: string;
  maxHp: number;
  color: number; // cor provisória do personagem (até a arte chegar)
  resource: ResourceDef;
  actions: Record<ActionId, ActionDef>;
}

/** Recurso gasto pelas habilidades: cada classe tem o seu (a Esquiva e o ataque básico quase não gastam). */
export interface ResourceDef {
  name: string;
  icon: "flame" | "eye" | "drop"; // ícone da barra na HUD
  color: number;
  max: number;
  regen: number; // pontos por segundo
  perLevel: number; // máximo extra por nível
}

const dodge = (dash: number, cd: number): ActionDef => ({ kind: "dodge", name: "Esquiva", key: "SHIFT", cd, dash, dashTime: 0.25, invulnS: 0.3 });

export const CLASS_DEFS: Record<CharClass, ClassDef> = {
  warrior: {
    id: "warrior", name: "Guerreiro", role: "Tanque", maxHp: 120, color: 0xff8a3d,
    resource: { name: "Fúria", icon: "flame", color: 0xe0742a, max: 100, regen: 5, perLevel: 3 },
    actions: {
      attack: { kind: "melee", name: "Golpe", key: "ESPAÇO", cd: 0.55, dmg: 12, offset: 1.0, radius: 1.25 },
      skill1: { kind: "ring", name: "Giro", key: "1", cd: 4, cost: 25, dmg: 20, offset: 0, radius: 2.3 },
      skill2: { kind: "dashHit", name: "Carga", key: "2", cd: 6, cost: 30, dmg: 16, dash: 4.5, dashTime: 0.25, radius: 1.1 },
      skill3: { kind: "tauntBuff", name: "Grito", key: "3", cd: 12, cost: 35, buffS: 4, reduction: 0.5, tauntRadius: 6, tauntS: 3 },
      dodge: dodge(3, 1.4),
    },
  },
  archer: {
    id: "archer", name: "Arqueiro", role: "Dano à distância", maxHp: 90, color: 0x6fcf6f,
    resource: { name: "Foco", icon: "eye", color: 0x6fcf6f, max: 100, regen: 6, perLevel: 3 },
    actions: {
      attack: { kind: "projectile", name: "Flecha", key: "ESPAÇO", cd: 0.5, dmg: 10, speed: 15, range: 9, radius: 0.35 },
      skill1: { kind: "projectile", name: "Perfurar", key: "1", cd: 4, cost: 20, dmg: 18, speed: 20, range: 12, radius: 0.5, pierce: true },
      skill2: { kind: "trap", name: "Cilada", key: "2", cd: 8, cost: 25, dmg: 28, radius: 1.6, placeRange: 6, armS: 0.6, lifeS: 20, maxActive: 3 },
      skill3: { kind: "rain", name: "Chuva", key: "3", cd: 10, cost: 35, dmg: 15, radius: 2.4, placeRange: 8, delayS: 0.8 },
      dodge: dodge(5, 1.6), // rolamento longo
    },
  },
  cleric: {
    id: "cleric", name: "Clérigo", role: "Suporte", maxHp: 100, color: 0xf2e6a0,
    resource: { name: "Mana", icon: "drop", color: 0x4aa8ff, max: 120, regen: 6, perLevel: 4 },
    actions: {
      attack: { kind: "projectile", name: "Raio", key: "ESPAÇO", cd: 0.7, cost: 4, dmg: 8, speed: 12, range: 8, radius: 0.4 },
      skill1: { kind: "healAoe", name: "Cura", key: "1", cd: 5, cost: 30, heal: 30, radius: 4 },
      skill2: { kind: "emberBuff", name: "Brasa", key: "2", cd: 12, cost: 25, buffS: 6, dmgPct: 25, radius: 5 },
      skill3: { kind: "revive", name: "Reviver", key: "3", cd: 20, cost: 50, radius: 8, hpPct: 50 },
      dodge: dodge(3, 1.4),
    },
  },
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
/** Vida máxima: base da classe + 10 por nível + bônus de armadura. */
export const maxHpFor = (cls: CharClass, level: number, armorHp = 0) => CLASS_DEFS[cls].maxHp + 10 * (level - 1) + armorHp;
/** Máximo do recurso (Fúria/Foco/Mana): base da classe + bônus por nível. */
export const maxManaFor = (cls: CharClass, level: number) => CLASS_DEFS[cls].resource.max + CLASS_DEFS[cls].resource.perLevel * (level - 1);
/** Multiplicador de poder (dano e cura): +5% por nível, multiplicado pelo bônus percentual da arma. */
export const dmgMult = (level: number, weaponPct = 0) => (1 + 0.05 * (level - 1)) * (1 + weaponPct / 100);

// ------------------------------------------------------------ personagem
/** Classes jogáveis. */
export const PLAYABLE_CLASSES: readonly CharClass[] = ["warrior", "archer", "cleric"];
export const NAME_MIN = 3;
export const NAME_MAX = 16;
export interface CharacterInfo { name: string; class: CharClass; level: number; xp: number }

export * from "./items";
