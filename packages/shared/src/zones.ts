// Zonas do mundo: cada uma é uma sala própria no servidor. Os dados ficam aqui para servidor e cliente concordarem.
// Não há faixa de nível: qualquer jogador pode atravessar quando quiser; as zonas mais fundas são MUITO mais punitivas
// (inimigos de nível alto) e, em troca, concentram mais recursos (`lootMult` maior = mais itens e raridades melhores).

import type { Rarity } from "./items";

export type EnemyKind = "skeleton" | "wolf" | "wraith" | "bone_king" | "frost_alpha" | "crypt_lord";
export type ZoneTheme = "ash" | "frost" | "crypt" | "town";

/** Destino especial de um portal: o PORTÃO da cidade. Pisar nele abre o mapa-mundo (o jogador escolhe a zona de combate); não leva a uma zona fixa. */
export const WORLD_GATE = 0;
export interface PortalDef { x: number; y: number; r: number; to: number }
/** Ponto de caça (estilo MU): `count` inimigos espalhados num círculo de raio `spread` em volta de (x, y). Sem `count` é um inimigo só, exatamente em (x, y).
 *  `levelMax` faz o nível subir ao longo do grupo, de `level` até `levelMax`. A ordem da lista define os ids (e1, e2...): pontos novos vão sempre no FIM. */
export interface EnemySpawn { kind: EnemyKind; x: number; y: number; level: number; count?: number; spread?: number; levelMax?: number }
/** Um inimigo já posicionado (resultado de `expandSpawns`). */
export interface EnemyPlacement { kind: EnemyKind; x: number; y: number; level: number }
export interface ZoneDef {
  id: number;
  name: string;
  theme: ZoneTheme;
  w: number;
  h: number;
  spawn: { x: number; y: number }; // ponto de nascimento padrão (entrada, reconexão e renascimento)
  arrive: Record<number, { x: number; y: number }>; // onde se chega vindo de cada zona (fora do raio dos portais)
  portals: readonly PortalDef[]; // basta pisar neles: o servidor decide a travessia
  enemies: readonly EnemySpawn[]; // pontos de caça; use `expandSpawns(zone)` para a lista final de inimigos
  lootMult: number; // dificuldade relativa da zona (informativo; os números reais ficam em `drops` e `boss`)
  drops: ZoneDrops; // o que os inimigos comuns soltam
  boss?: ZoneBoss; // o chefe da zona (um por zona) e o baú que ele solta; a cidade não tem
  safe?: boolean; // zona segura (cidade): sem inimigos, sem dano e sem PvP, nem por habilidade de área ou armadilha
  pvp?: boolean; // arena: o PvP vale SÓ aqui (jogadores ferem uns aos outros, sem fogo amigo de grupo); morrer renasce na arena, sem perda
  vault?: { x: number; y: number }; // baú de armazenamento fixo (só na cidade)
}

/** Drops de inimigos comuns: chance de equipamento/poção por abate e pesos das raridades. Raridade que não está na tabela NUNCA cai aqui (teto da zona). */
export interface ZoneDrops { gear: number; potion: number; weights: Partial<Record<Rarity, number>> }
/** Chefe: aparece sempre; ao cair, volta depois de `respawnS`. O baú dá `count` itens (o primeiro, no mínimo `min`) e a tabela é o teto da zona. */
export interface ZoneBoss {
  kind: EnemyKind; x: number; y: number; level: number; respawnS: number; name: string;
  chest: { count: number; min: Rarity; weights: Partial<Record<Rarity, number>> };
}

export const PORTAL_RADIUS = 1.6;

/** A cidade segura: onde todo personagem novo nasce, onde se renasce depois de morrer e onde ficam os NPCs de ofício e o baú. */
export const HUB_ZONE = 4;

export const ZONES: Record<number, ZoneDef> = {
  1: {
    id: 1, name: "Cinzas", theme: "ash", w: 40, h: 40,
    // Os dois portões ficam na muralha oeste, no canto sudoeste, e quem chega aparece ARRIVAL_GATE_DIST tiles à frente deles, numa clareira sem inimigos (raio ARRIVAL_SAFE_RADIUS).
    spawn: { x: 12, y: 31 },
    arrive: { 2: { x: 9.5, y: 35 }, 4: { x: 9.5, y: 28 } },
    portals: [{ x: 4, y: 35, r: PORTAL_RADIUS, to: 2 }, { x: 4, y: 28, r: PORTAL_RADIUS, to: 4 }],
    enemies: [
      // todos a mais de ARRIVAL_SAFE_RADIUS (14) tiles do spawn e dos pontos de chegada (aggro de 7 a 11): o jogador nasce em segurança (teste: zones.mjs).
      // Quanto mais longe do início, mais forte (e mais XP): o nível de cada ponto fica aqui.
      { kind: "skeleton", x: 30, y: 16, level: 1 },
      { kind: "skeleton", x: 31, y: 24, level: 1 },
      { kind: "skeleton", x: 26, y: 30, level: 1 },
      { kind: "skeleton", x: 37, y: 5, level: 2 }, // (era 26,36: colado em (26,30) e (31,24) puxava 3 de uma vez no primeiro abate do tutorial; agora fica longe do bando)
      { kind: "skeleton", x: 11, y: 12, level: 3 },
      // pontos de caça (grupos): quanto mais fundo no mapa (para leste), mais nível. Fora do raio seguro dos pontos de chegada, contando o spread.
      { kind: "skeleton", x: 5, y: 4, level: 2, levelMax: 3, count: 5, spread: 2.5 },
      { kind: "skeleton", x: 33, y: 35, level: 3, levelMax: 4, count: 5, spread: 3 },
      { kind: "skeleton", x: 22, y: 6, level: 4, levelMax: 5, count: 6, spread: 4 },
    ],
    lootMult: 1,
    drops: { gear: 0.07, potion: 0.08, weights: { common: 85, uncommon: 15 } },
    boss: { kind: "bone_king", name: "Rei Ossudo", x: 33, y: 7, level: 6, respawnS: 300, chest: { count: 2, min: "uncommon", weights: { common: 45, uncommon: 55 } } },
  },
  2: {
    id: 2, name: "Floresta Gélida", theme: "frost", w: 44, h: 44,
    spawn: { x: 8, y: 8 },
    arrive: { 1: { x: 8.5, y: 8.5 }, 3: { x: 36, y: 36 }, 4: { x: 9.5, y: 14 } },
    portals: [
      { x: 4, y: 4, r: PORTAL_RADIUS, to: 1 },
      { x: 4, y: 14, r: PORTAL_RADIUS, to: 4 },
      { x: 40, y: 40, r: PORTAL_RADIUS, to: 3 },
    ],
    enemies: [
      { kind: "wolf", x: 24, y: 8, level: 6 },
      { kind: "wolf", x: 14, y: 31, level: 6 },
      { kind: "skeleton", x: 28, y: 14, level: 6 },
      { kind: "skeleton", x: 22, y: 26, level: 7 },
      { kind: "wolf", x: 30, y: 22, level: 8 },
      { kind: "skeleton", x: 14, y: 34, level: 8 },
      { kind: "wolf", x: 22, y: 38, level: 9 },
      { kind: "wolf", x: 41, y: 22, level: 10 },
      { kind: "wolf", x: 28, y: 19, level: 6, levelMax: 7, count: 5, spread: 3.5 },
      { kind: "skeleton", x: 34, y: 17, level: 8, levelMax: 9, count: 5, spread: 3 },
      { kind: "wolf", x: 10, y: 38, level: 8, levelMax: 9, count: 6, spread: 4 },
      { kind: "wolf", x: 22, y: 27, level: 9, levelMax: 10, count: 5, spread: 3 },
      { kind: "wolf", x: 30, y: 4, level: 10, levelMax: 11, count: 4, spread: 3 },
    ],
    lootMult: 1.6,
    drops: { gear: 0.09, potion: 0.1, weights: { common: 62, uncommon: 30, rare: 8 } },
    boss: { kind: "frost_alpha", name: "Lobo Alfa", x: 37, y: 10, level: 11, respawnS: 420, chest: { count: 3, min: "rare", weights: { uncommon: 28, rare: 50, epic: 18, legendary: 4 } } },
  },
  3: {
    id: 3, name: "Catacumbas", theme: "crypt", w: 44, h: 44,
    spawn: { x: 8, y: 8 },
    arrive: { 2: { x: 8.5, y: 8.5 }, 4: { x: 9.5, y: 14 } },
    portals: [{ x: 4, y: 4, r: PORTAL_RADIUS, to: 2 }, { x: 4, y: 14, r: PORTAL_RADIUS, to: 4 }],
    enemies: [
      { kind: "skeleton", x: 24, y: 12, level: 12 },
      { kind: "wraith", x: 16, y: 30, level: 13 },
      { kind: "skeleton", x: 28, y: 18, level: 13 },
      { kind: "wraith", x: 26, y: 28, level: 15 },
      { kind: "skeleton", x: 20, y: 34, level: 15 },
      { kind: "wraith", x: 34, y: 14, level: 16 },
      { kind: "wraith", x: 36, y: 32, level: 18 },
      { kind: "wraith", x: 22, y: 38, level: 20 },
      { kind: "wraith", x: 28, y: 23, level: 13, levelMax: 14, count: 4, spread: 3 },
      { kind: "skeleton", x: 10, y: 33, level: 12, levelMax: 13, count: 6, spread: 3.5 },
      { kind: "wraith", x: 36, y: 22, level: 16, levelMax: 17, count: 4, spread: 3 },
      { kind: "skeleton", x: 28, y: 5, level: 12, levelMax: 14, count: 5, spread: 3.5 },
      { kind: "wraith", x: 10, y: 40, level: 17, levelMax: 19, count: 5, spread: 4 },
      { kind: "skeleton", x: 40, y: 38, level: 18, levelMax: 19, count: 5, spread: 3 },
    ],
    lootMult: 2.4,
    drops: { gear: 0.11, potion: 0.12, weights: { common: 50, uncommon: 35, rare: 13, epic: 2 } },
    boss: { kind: "crypt_lord", name: "Soberano das Catacumbas", x: 36, y: 8, level: 21, respawnS: 600, chest: { count: 3, min: "epic", weights: { rare: 20, epic: 50, legendary: 24, mythic: 6 } } },
  },
  4: {
    id: 4, name: "Cidade de Brasalume", theme: "town", w: 48, h: 48,
    spawn: { x: 24, y: 30 },
    // a cidade tem UM só portão (norte, na muralha) e ele leva ao mapa-mundo: cada zona nova entra na lista do mapa, sem abrir portais novos na cidade.
    // chegando de qualquer zona de combate o jogador aparece logo dentro do portão (fora do raio dele)
    arrive: { 1: { x: 24, y: 7.5 }, 2: { x: 24, y: 7.5 }, 3: { x: 24, y: 7.5 }, 5: { x: 24, y: 7.5 } },
    portals: [{ x: 24, y: 2, r: PORTAL_RADIUS, to: WORLD_GATE }],
    enemies: [],
    lootMult: 0,
    drops: { gear: 0, potion: 0, weights: {} },
    safe: true,
    vault: { x: 31, y: 30 },
  },
  5: {
    // Arena Sangrenta: o único lugar com PvP. Sem monstros comuns nem chefe; sai-se pelo portal sul, de volta à cidade.
    // Acesso: pelo mapa-mundo do portão de Brasalume (a arena entra na lista como qualquer zona de combate).
    id: 5, name: "Arena Sangrenta", theme: "ash", w: 36, h: 36,
    spawn: { x: 30, y: 18 }, // renascer depois de morrer (dentro da arena, sem perda)
    arrive: { 4: { x: 18, y: 27.5 } }, // chegando de Brasalume: junto do portão sul que leva de volta (a 5,5 tiles, como nas outras zonas)
    portals: [{ x: 18, y: 33, r: PORTAL_RADIUS, to: 4 }],
    enemies: [],
    lootMult: 0,
    drops: { gear: 0, potion: 0, weights: {} },
    pvp: true,
  },
};

/** Lista final de inimigos da zona: cada ponto de caça vira `count` inimigos espalhados (posições determinísticas: servidor e cliente concordam, sem sorteio).
 *  Os pontos de 1 inimigo ficam exatamente onde estão, então os ids antigos (e1, e2...) não mudam. */
export function expandSpawns(zone: Pick<ZoneDef, "enemies" | "w" | "h">): EnemyPlacement[] {
  const out: EnemyPlacement[] = [];
  for (const s of zone.enemies) {
    const n = Math.max(1, Math.floor(s.count ?? 1));
    for (let i = 0; i < n; i++) {
      if (n === 1) { out.push({ kind: s.kind, x: s.x, y: s.y, level: s.level }); continue; }
      const ang = i * 2.399963; // ângulo áureo: espalha sem formar fileira
      const rad = (s.spread ?? 3) * Math.sqrt((i + 0.5) / n); // raio crescente: preenche o círculo por igual
      const x = Math.min(zone.w - 2, Math.max(1, s.x + Math.cos(ang) * rad));
      const y = Math.min(zone.h - 2, Math.max(1, s.y + Math.sin(ang) * rad));
      const level = s.levelMax && n > 1 ? Math.round(s.level + ((s.levelMax - s.level) * i) / (n - 1)) : s.level;
      out.push({ kind: s.kind, x: Math.round(x * 100) / 100, y: Math.round(y * 100) / 100, level });
    }
  }
  return out;
}

export const ZONE_IDS: readonly number[] = Object.keys(ZONES).map(Number);
/** Sala antiga "zone" (zona 1). A zona inicial dos personagens novos é HUB_ZONE. */
export const DEFAULT_ZONE = 1;
export const START_ZONE = HUB_ZONE;
export const isZoneId = (z: unknown): z is number => typeof z === "number" && Number.isInteger(z) && z in ZONES;
/** Nome da sala do Colyseus de cada zona (a zona 1 mantém o nome antigo "zone"). */
export const zoneRoomName = (id: number) => (id === DEFAULT_ZONE ? "zone" : `zone${id}`);
