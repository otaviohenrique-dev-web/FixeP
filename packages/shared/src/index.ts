import { ZONES, type EnemyKind } from "./zones";
import type { Rarity } from "./items";
// Simulação em grade ortogonal (servidor). Isométrico é só projeção no cliente.
// MAP_W/MAP_H/SPAWN são os da zona 1; cada zona tem os seus em ZONES (zones.ts).
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
  InvDrop: "inv_drop", // { slot }: solta o item no chão (qualquer um pode pegar; quem soltou não o pega sozinho por alguns segundos)
  InvBreak: "inv_break", // { slot, confirm: true }: quebra (desmancha) um equipamento por tostões; de raro para cima o servidor exige confirm
  InvSort: "inv_sort", // {}: organiza a mochila (junta pilhas e ordena por tipo e raridade)
  Pickup: "pickup", // { id }: pega um item do chão (o servidor valida distância, dono e tempo de reserva; andar até o item também pega)
  InvSync: "inv_sync", // pede a fotografia do inventário (o cliente pede depois de registrar os receptores)
  Chat: "chat", // { text }: mensagem para toda a zona (o servidor limpa o texto e usa o nome do personagem)
  Pvp: "pvp", // { on: boolean }: pede para entrar (true) ou sair (false) do modo PvP; o servidor canaliza e decide
  Travel: "travel", // { to }: pede para atravessar o portal da zona `to` (o servidor valida a distância; andar até o portal já basta)
  Ping: "ping", // { t }: o servidor devolve o mesmo t em Evt.Pong (o cliente mede a ida e volta)
  PartyInvite: "party_invite", // { name }: convida o jogador (pelo nome do personagem) para o seu grupo; quem convida sem grupo vira líder
  PartyJoin: "party_join", // { name }: pede para entrar no grupo desse jogador; se ele não tem grupo, quem aceitar vira líder
  PartyAccept: "party_accept", // {}: aceita o convite/pedido pendente
  PartyDecline: "party_decline", // {}: recusa o convite/pedido pendente
  PartyLeave: "party_leave", // {}: sai do grupo
  PartyKick: "party_kick", // { name }: o líder expulsa um membro
  PartyLead: "party_lead", // { name }: o líder passa a liderança
  PartyChat: "party_chat", // { text }: mensagem só para o grupo (comando /g)
  PartySync: "party_sync", // {}: pede o estado do grupo e o convite pendente (o cliente pede depois de registrar os receptores)
  ShopBuy: "shop_buy", // { npc, id, qty }: compra do comerciante (valida distância, estoque, saldo e espaço)
  ShopSell: "shop_sell", // { npc, slot, qty }: vende ao comerciante
  SmithMerge: "smith_merge", // { npc, slots: [a, b, c] }: funde 3 equipamentos iguais num de raridade superior (custa tostões; pode falhar)
  TradeInvite: "trade_invite", // { name }: convida um jogador da zona, por perto, para uma troca
  TradeAccept: "trade_accept", // {}: aceita o convite de troca
  TradeDecline: "trade_decline", // {}: recusa o convite
  TradeOffer: "trade_offer", // { items: [{ slot, qty }], iron, obols, seq }: define a minha oferta (reinicia as confirmações dos dois lados); seq = contador do cliente, devolvido em mine.seq
  TradeReady: "trade_ready", // { ready: boolean, rev }: aceita a versão `rev` da oferta (ou retira o aceite); executa quando os dois aceitaram a MESMA versão
  TradeCancel: "trade_cancel", // {}: cancela a troca
  QMode: "q_mode", // { mode: 0 | 1 }: o Clérigo escolhe o Q (0 = cura em área, 1 = cura focada); só fora de combate
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
  Travel: "travel", // { zone }: travessia aprovada; o cliente sai da sala e entra na da nova zona
  Pong: "pong", // resposta ao ping, só para quem perguntou
  Inv: "inv", // fotografia completa do inventário (só para o dono)
  Loot: "loot", // item recebido
  Xp: "xp", // XP ganho num abate (só para quem recebeu)
  Chest: "chest", // ChestEvent: o baú do chefe abriu (animação) naquele ponto
  Notice: "notice", // aviso de texto para o dono
  Chat: "chat", // { id, name, text }: mensagem de chat de um jogador, para toda a zona
  Pvp: "pvp", // { s: "start" | "cancel" | "stop" | "on" | "off" }: andamento do modo PvP, só para o dono
  Party: "party", // PartyEvent: estado do grupo (lista vazia = sem grupo); enviado só aos membros, de qualquer zona
  PartyInvite: "party_invite", // PartyInviteEvent: convite ou pedido recebido (expira em PARTY_INVITE_S)
  PartyInviteEnd: "party_invite_end", // {}: o convite pendente acabou (aceito, recusado ou expirado)
  PartyChat: "party_chat", // { name, text }: mensagem do chat de grupo
  Coins: "coins", // CoinsEvent: tostões/óbolos ganhos num abate (só para quem recebeu)
  Trade: "trade", // TradeEvent: estado da janela de troca (aberta, ofertas, confirmações) ou fechamento
  TradeInvite: "trade_invite", // { from }: convite de troca recebido (expira em TRADE_INVITE_S)
  TradeInviteEnd: "trade_invite_end", // {}: o convite acabou
} as const;

// ------------------------------------------------------------ troca entre jogadores
export const TRADE_INVITE_S = 20; // validade do convite
export const TRADE_RANGE = 8; // distância máxima (tiles) entre os dois, no convite e na execução
export const TRADE_MAX_ITEMS = 8; // espaços de item por oferta
/** `slot` só vem no meu lado (para o cliente reconciliar a seleção); `seq` é o número do último pedido de oferta meu que o servidor processou. */
export interface TradeOfferSide { items: { id: string; qty: number; slot?: number }[]; iron: number; obols: number; ready: boolean; seq?: number }
/** Estado da janela de troca. `open: false` = fechou (reason explica). */
export interface TradeEvent { open: boolean; with?: string; mine?: TradeOfferSide; theirs?: TradeOfferSide; reason?: string; done?: boolean; /** versão da oferta (sobe a cada mudança de qualquer lado): o aceite só vale para a versão que o jogador viu */ rev?: number }
export interface CoinsEvent { iron: number; obols: number; x: number; y: number }

// ------------------------------------------------------------ grupo (party)
export const PARTY_MAX = 4; // membros por grupo
export const PARTY_INVITE_S = 30; // validade do convite
export const PARTY_XP_BONUS = 0.25; // o XP do abate cresce +25% por membro elegível além do primeiro e é DIVIDIDO igualmente entre eles
/** Multiplicador de XP para quem abate com `near` membros do mesmo grupo por perto (contando a si mesmo). */
export const partyXpMult = (near: number) => 1 + PARTY_XP_BONUS * Math.max(0, Math.min(PARTY_MAX, near) - 1);
export interface PartyMemberInfo {
  name: string; cls: string; level: number;
  hp: number; maxHp: number; mana: number; maxMana: number;
  zone: number; // 0 = fora do jogo no momento (offline ou viajando entre zonas)
  dead: boolean; leader: boolean;
}
export interface PartyEvent { members: PartyMemberInfo[] }
export interface PartyInviteEvent { kind: "invite" | "join"; from: string; ms: number } // invite: "X convida você"; join: "X pede para entrar no seu grupo"
export interface PartyChatEvent { name: string; text: string }

/** PvP: canalização (entrar ou sair) em segundos. Só começa PARADO e sem ter tomado dano nos últimos PVP_NO_DAMAGE_S; mover-se, agir ou tomar dano a cancela. */
export const PVP_CHANNEL_S = 5;
export const PVP_NO_DAMAGE_S = 5;
/** Trocar o Q do Clérigo exige ficar sem causar nem receber dano por este tempo (s). */
export const QMODE_SWAP_S = 4;
/** Estado da canalização sincronizado no jogador: 0 nenhuma, 1 entrando, 2 saindo. */
export type PvpChannel = 0 | 1 | 2;
export interface PvpEvent { s: "start" | "cancel" | "stop" | "on" | "off"; why?: "move" | "act" | "damage" }

/** Limites do chat (valem no servidor; o cliente só os repete para avisar cedo). */
export const CHAT_MAX_LEN = 200;
export interface ChatEvent { id: string; name: string; text: string }

export interface MoveToPayload {
  x: number; // tile
  y: number;
}

export type ActionId = "attack" | "skill1" | "skill2" | "skill3" | "ultimate" | "dodge";
export const ACTION_IDS: readonly ActionId[] = ["attack", "skill1", "skill2", "skill3", "ultimate", "dodge"];

/** O cliente manda INTENÇÃO: qual ação e para onde mira (ponto em tiles). */
export interface ActPayload {
  a: ActionId;
  ax: number;
  ay: number;
}

export interface SwingEvent { id: string; a: ActionId; x: number; y: number; dir: number }
export interface TelegraphEvent { id: string; x: number; y: number; r: number; ms: number; friendly?: boolean; fx?: SkillFx }
export interface HitEvent { k: "e" | "p"; id: string; dmg: number; crit: boolean; x: number; y: number; by?: string; refl?: boolean } // refl: dano devolvido pelo Escudo Refletor
export interface DiedEvent { k: "e" | "p"; id: string }
export interface ChestEvent { x: number; y: number; rarity: Rarity; boss: string }
export interface XpEvent { amount: number; x: number; y: number }
export interface LevelUpEvent { id: string; level: number }
export interface HealEvent { id: string; amount: number; x: number; y: number; revive?: boolean; from?: string } // from: quem curou (a cura focada desenha o raio até o alvo)
export interface ProjEvent { id: string; x: number; y: number; dir: number; speed: number; range: number; look: "arrow" | "pierce" | "bolt" | "fire" | "arcane"; blast?: number }
export interface ProjEndEvent { id: string; x: number; y: number; hit: boolean }
export interface TrapEvent { id: string; s: "set" | "boom" | "gone"; x: number; y: number; r: number }

export const clamp = (v: number, min: number, max: number) => Math.min(max, Math.max(min, v));

// ------------------------------------------------------------ regras de combate
// Todas as distâncias em tiles, tempos em segundos.
export const PLAYER_RADIUS = 0.4;
export const CRIT = { chance: 0.1, mult: 1.5 } as const;
export const DAMAGE_VARIANCE = 0.1; // +-10%
export const RESPAWN_S = 8; // tempo caído; dá tempo de um Clérigo ressuscitar
export const SHARE_RADIUS = 14; // colegas de grupo (vivos) a até 14 tiles do abate entram na divisão de XP e loot
export const ELIGIBLE_DMG_PCT = 0.1; // fora de grupo, só recebe XP/loot quem causou pelo menos 10% da vida máxima do alvo
export const PLAYER_REGEN_DELAY_S = 6; // sem causar nem receber dano por 6 s, o personagem começa a recuperar vida
export const PLAYER_REGEN_PCT_S = 0.02; // ...a 2% da vida máxima por segundo (vida cheia em ~50 s)
/** Regeneração dos inimigos: só parados em casa ou voltando para ela, e só depois de ficarem sem receber dano. */
export const ENEMY_REGEN = { delayS: 5, pctS: 0.1, bossDelayS: 8, bossPctS: 0.03 } as const;

// ------------------------------------------------------------ chefes: exigem grupo
export const BOSS_GROUP_MIN = 3; // tanque + curandeiro + dano
export const BOSS_ENRAGE_S = 150; // depois de 150 s de luta o chefe enfurece (dano cresce +50% a cada 30 s, até x4)
export const BOSS_COUNT_RADIUS = 24; // jogadores elegíveis vivos a até 24 tiles do chefe contam para o tamanho do grupo
/** Multiplicador do dano do chefe (golpe, pancada e pulso) pelo nº de jogadores elegíveis: solo x2,5, dupla x1,75, trio ou mais x1. */
export const bossDmgMult = (n: number) => 1 + 0.75 * Math.max(0, BOSS_GROUP_MIN - Math.max(1, n));
/** Fúria por tempo de luta (s): x1 até BOSS_ENRAGE_S, depois +0,5 a cada 30 s, teto x4. */
export const bossEnrageMult = (fightS: number) => Math.min(4, 1 + 0.5 * Math.max(0, (fightS - BOSS_ENRAGE_S) / 30));

// ------------------------------------------------------------ itens no chão
export const LOOT_LOCK_S = 30; // só quem abateu (ou o grupo dele) pega nesse tempo; depois, qualquer um
export const CHEST_LOCK_S = 60; // o mesmo para os itens do baú do chefe
export const GROUND_TTL_S = 180; // quanto tempo o item fica no chão antes de sumir
export const PICKUP_AUTO = 1.0; // passar a este alcance (tiles) pega o item sozinho
export const PICKUP_REACH = 2.6; // alcance do pedido explícito de pegar
export const GROUND_MAX = 120; // limite de itens no chão por zona (os mais antigos somem primeiro)

export type CharClass = "warrior" | "archer" | "cleric" | "mage";

/** Visual de skills que "caem do céu" (eixo Z): o servidor só diz qual; o cliente anima (meteoro, raio, chuva de fogo...). */
export type SkillFx = "meteor" | "lightning" | "firerain" | "holy" | "arrows" | "chains" | "colossus";

/** Tipo de efeito de cada ação: o servidor decide o resultado, o cliente escolhe o visual. */
export type ActionKind =
  | "melee" // golpe em círculo à frente
  | "ring" // golpe em círculo ao redor
  | "dashHit" // avanço que machuca no caminho
  | "tauntBuff" // reduz dano recebido e provoca inimigos
  | "reflectBuff" // como tauntBuff, e devolve parte do dano dos inimigos a quem os golpeia
  | "dodge" // deslocamento com invulnerabilidade
  | "projectile" // projétil em linha reta
  | "blast" // projétil que explode ao acertar (ou no fim do alcance), ferindo uma área
  | "trap" // armadilha no chão
  | "rain" // área atingida depois de um atraso (telegrafada)
  | "pull" // puxa os inimigos de uma área para o centro (controle)
  | "healAoe" // cura aliados em volta
  | "healFocus" // cura UM aliado (o mais próximo da mira, o selecionado ou o próprio)
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
  pullS?: number; // tempo da puxada (Compressor de Ar)
  stunS?: number; // tempo que os inimigos ficam atordoados depois de puxados
  maxActive?: number; // limite de armadilhas ativas
  blast?: number; // raio da explosão (kind "blast")
  fx?: SkillFx; // visual vindo de cima (kind "rain")
  // cura / buff / ressurreição
  heal?: number;
  dmgPct?: number; // bônus de dano da Brasa (%)
  hpPct?: number; // vida com que o aliado volta
  // controle e reflexão (inimigos; os chefes resistem: BOSS_CC_RESIST)
  rootS?: number; // enraíza (não anda, mas ainda ataca de perto)
  reflect?: number; // fração do dano recebido de inimigos que volta a eles (kind "reflectBuff")
  icon?: string; // ícone da habilidade na HUD
}

export interface ClassDef {
  id: CharClass;
  name: string;
  role: string;
  maxHp: number;
  color: number; // cor provisória do personagem (até a arte chegar)
  resource: ResourceDef;
  actions: Record<ActionId, ActionDef>;
  skill1Alt?: ActionDef; // Q alternativo escolhido pelo jogador (hoje só o Clérigo)
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
      // Q: avanço com o escudo à frente; quem estiver no caminho leva dano e fica ATORDOADO
      skill1: { kind: "dashHit", name: "Investida", key: "Q", cd: 7, cost: 25, dmg: 18, dash: 4.5, dashTime: 0.25, radius: 1.2, stunS: 1.5, icon: "charge" },
      // W: correntes brotam do chão e ENRAIZAM os inimigos da área
      skill2: { kind: "rain", name: "Correntes", key: "W", cd: 10, cost: 30, dmg: 14, radius: 2.8, placeRange: 6, delayS: 0.45, rootS: 3.5, fx: "chains", icon: "chains" },
      // E: PROVOCA e ergue o Escudo Refletor: menos dano recebido e parte do que os inimigos causam volta a eles
      skill3: { kind: "reflectBuff", name: "Escudo Refletor", key: "E", cd: 14, cost: 35, buffS: 5, reduction: 0.5, reflect: 0.75, tauntRadius: 6, tauntS: 3, icon: "shield" },
      // R: um colosso de aço desaba do céu (telegrafado): dano enorme em área e atordoamento
      ultimate: { kind: "rain", name: "Queda do Colosso", key: "R", cd: 40, cost: 80, dmg: 120, radius: 4.2, placeRange: 6, delayS: 1.5, stunS: 2.2, fx: "colossus", icon: "hammer" },
      dodge: dodge(3, 1.4),
    },
  },
  archer: {
    id: "archer", name: "Arqueiro", role: "Dano à distância", maxHp: 90, color: 0x6fcf6f,
    resource: { name: "Foco", icon: "eye", color: 0x6fcf6f, max: 100, regen: 6, perLevel: 3 },
    actions: {
      attack: { kind: "projectile", name: "Flecha", key: "ESPAÇO", cd: 0.5, dmg: 9, speed: 15, range: 9, radius: 0.35 },
      skill1: { kind: "projectile", name: "Perfurar", key: "Q", cd: 4, cost: 20, dmg: 15, speed: 20, range: 12, radius: 0.5, pierce: true },
      skill2: { kind: "trap", name: "Cilada", key: "W", cd: 8, cost: 25, dmg: 18, radius: 1.6, placeRange: 6, armS: 0.6, lifeS: 20, maxActive: 3 },
      skill3: { kind: "rain", name: "Chuva", key: "E", cd: 10, cost: 35, dmg: 10, radius: 2.4, placeRange: 8, delayS: 0.8, fx: "arrows" },
      ultimate: { kind: "rain", name: "Salva Final", key: "R", cd: 40, cost: 80, dmg: 26, radius: 3.6, placeRange: 9, delayS: 1.0, fx: "arrows" },
      dodge: dodge(5, 1.6), // rolamento longo
    },
  },
  cleric: {
    id: "cleric", name: "Clérigo", role: "Suporte", maxHp: 100, color: 0xf2e6a0,
    resource: { name: "Mana", icon: "drop", color: 0x4aa8ff, max: 120, regen: 6, perLevel: 4 },
    actions: {
      attack: { kind: "projectile", name: "Raio", key: "ESPAÇO", cd: 0.7, cost: 4, dmg: 8, speed: 12, range: 8, radius: 0.4 },
      skill1: { kind: "healAoe", name: "Cura em Área", key: "Q", cd: 5, cost: 26, heal: 16, radius: 4, icon: "healAoe" }, // Q (A): cura todos em volta, mas pouco
      skill2: { kind: "pull", name: "Compressor de Ar", key: "W", cd: 12, cost: 30, radius: 4.5, placeRange: 6, pullS: 0.45, stunS: 1.2 },
      skill3: { kind: "rain", name: "Julgamento", key: "E", cd: 7, cost: 30, dmg: 26, radius: 3, placeRange: 7, delayS: 0.6, fx: "holy" },
      ultimate: { kind: "healAoe", name: "Luz Divina", key: "R", cd: 45, cost: 90, heal: 80, radius: 6 },
      dodge: dodge(3, 1.4),
    },
    // Q (B): cura focada em UM jogador (o selecionado, o mais próximo da mira ou o próprio): bem mais forte
    skill1Alt: { kind: "healFocus", name: "Cura Focada", key: "Q", cd: 4, cost: 30, heal: 65, range: 9, icon: "healFocus" },
  },
  mage: {
    id: "mage", name: "Mago", role: "Dano explosivo", maxHp: 75, color: 0xa070ff,
    resource: { name: "Mana", icon: "drop", color: 0xa070ff, max: 140, regen: 7, perLevel: 5 },
    actions: {
      attack: { kind: "projectile", name: "Dardo Arcano", key: "ESPAÇO", cd: 0.8, cost: 4, dmg: 13, speed: 13, range: 9, radius: 0.4 },
      skill1: { kind: "blast", name: "Bola de Fogo", key: "Q", cd: 5, cost: 30, dmg: 28, speed: 11, range: 10, radius: 0.45, blast: 2.3 },
      skill2: { kind: "rain", name: "Relâmpago", key: "W", cd: 7, cost: 28, dmg: 26, radius: 1.7, placeRange: 9, delayS: 0.35, fx: "lightning" },
      skill3: { kind: "rain", name: "Chuva de Fogo", key: "E", cd: 11, cost: 45, dmg: 38, radius: 3.1, placeRange: 8, delayS: 0.9, fx: "firerain" },
      ultimate: { kind: "rain", name: "Meteoro", key: "R", cd: 45, cost: 100, dmg: 140, radius: 4.2, placeRange: 9, delayS: 1.5, fx: "meteor" },
      dodge: dodge(4, 1.5), // passo arcano curto: o Mago tem pouco sustain, depende de manter distância
    },
  },
};

/** Chefes resistem a atordoar e enraizar: a duração cai para esta fração. */
export const BOSS_CC_RESIST = 0.4;

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

/** Tipos de inimigo: o Esqueleto é a base (SKELETON); os outros são variações (corpos provisórios até a arte chegar). */
export interface EnemyKindDef {
  name: string; hpMul: number; dmgMul: number; speed: number; aggro: number; leash: number; engage: number;
  windupS: number; strikeOffset: number; strikeRadius: number; recoverS: number; respawnS: number; radius: number; color: number;
  boss?: BossDef; // só os chefes
  scale?: number;
}
/** Mecânica dos chefes: golpe normal mais forte + "pancada" em área em volta dele a cada `slamEveryS`; abaixo de `enrageAt` da vida ele fica furioso. */
export interface BossDef { pulseEveryS: number; pulsePct: number; pulseRadius: number; xpMul: number; slamEveryS: number; slamRadius: number; slamMul: number; slamWindupS: number; enrageAt: number; enrageSpeed: number }
const base = { aggro: SKELETON.aggro, leash: SKELETON.leash, engage: SKELETON.engage, windupS: SKELETON.windupS, strikeOffset: SKELETON.strikeOffset,
  strikeRadius: SKELETON.strikeRadius, recoverS: SKELETON.recoverS, respawnS: SKELETON.respawnS, radius: SKELETON.radius, speed: SKELETON.speed };
export const ENEMY_KINDS = {
  skeleton: { ...base, name: SKELETON.name, hpMul: 1, dmgMul: 1, color: 0xd8d2c0 },
  wolf: { ...base, name: "Lobo Gélido", hpMul: 0.8, dmgMul: 0.9, speed: 3.6, aggro: 8, engage: 1.5, windupS: 0.5, strikeOffset: 0.9, strikeRadius: 1.1, recoverS: 0.8, radius: 0.4, color: 0x8fb3d9 },
  wraith: { ...base, name: "Espectro", hpMul: 1.3, dmgMul: 1.4, speed: 2.0, aggro: 9, leash: 16, engage: 2.2, windupS: 0.9, strikeOffset: 1.4, strikeRadius: 1.6, recoverS: 1.2, radius: 0.5, color: 0x9a7ad0 },
} as Record<EnemyKind, EnemyKindDef>;
// pulso sombrio: a cada pulseEveryS atinge TODOS a até pulseRadius (ignora esquiva) com pulsePct da vida máxima de cada um: sem curandeiro não se aguenta
const bossBase: Pick<BossDef, "slamWindupS" | "enrageAt" | "enrageSpeed" | "pulseEveryS" | "pulsePct" | "pulseRadius"> = { slamWindupS: 1.3, enrageAt: 0.3, enrageSpeed: 1.3, pulseEveryS: 6, pulsePct: 0.4, pulseRadius: 24 };
ENEMY_KINDS.bone_king = { ...base, name: "Rei Ossudo", hpMul: 18, dmgMul: 1.2, speed: 2.2, aggro: 9, leash: 18, engage: 2.0, strikeOffset: 1.3, strikeRadius: 1.8, radius: 0.7, respawnS: 300, color: 0xe8e0c8,
  scale: 1.7, boss: { xpMul: 8, slamEveryS: 9, slamRadius: 3.4, slamMul: 1.4, ...bossBase } };
ENEMY_KINDS.frost_alpha = { ...base, name: "Lobo Alfa", hpMul: 15, dmgMul: 1.2, speed: 3.6, aggro: 10, leash: 18, engage: 2.0, windupS: 0.6, strikeOffset: 1.2, strikeRadius: 1.6, recoverS: 0.9, radius: 0.7, respawnS: 420, color: 0xbfd8f2,
  scale: 1.7, boss: { xpMul: 8, slamEveryS: 8, slamRadius: 3.2, slamMul: 1.4, ...bossBase } };
ENEMY_KINDS.crypt_lord = { ...base, name: "Soberano das Catacumbas", hpMul: 18, dmgMul: 1.3, speed: 2.3, aggro: 11, leash: 20, engage: 2.6, windupS: 0.9, strikeOffset: 1.6, strikeRadius: 2.0, recoverS: 1.1, radius: 0.8, respawnS: 600, color: 0xc9a8ff,
  scale: 1.8, boss: { xpMul: 10, slamEveryS: 8, slamRadius: 4, slamMul: 1.5, ...bossBase } };
export const enemyKind = (k: string): EnemyKindDef => ENEMY_KINDS[k as EnemyKind] ?? ENEMY_KINDS.skeleton;

/** Spawns da zona 1 (compatibilidade): os de cada zona ficam em ZONES. */
export const ENEMY_SPAWNS = ZONES[1].enemies;

/** Vida, dano e XP do inimigo por nível (o nível 1 é o Esqueleto base). */
export const enemyHp = (level: number, kind: string = "skeleton") => Math.round(SKELETON.maxHp * enemyKind(kind).hpMul * (1 + 0.4 * (level - 1)));
export const enemyDmg = (level: number, kind: string = "skeleton") => Math.round(SKELETON.dmg * enemyKind(kind).dmgMul * (1 + 0.3 * (level - 1)));
export const enemyXp = (level: number) => Math.round(XP_PER_KILL * Math.pow(1.45, level - 1));

// ------------------------------------------------------------ progressão
export const LEVEL_CAP = 50;
export const XP_PER_KILL = 20;
/** XP necessário para sair do nível `level` para o próximo (0 no nível máximo). */
/** Cresce 20% a cada nível (100, 120, 144, 173, 207...; ~3,2 mil no nível 20; ~600 mil no 49). */
export const xpToNext = (level: number) => (level >= LEVEL_CAP ? 0 : Math.round(100 * Math.pow(1.2, level - 1)));
/** Faixa de borda do nível: muda a cada 10 níveis (1-9, 10-19, 20-29, 30-39, 40-49, 50). */
export const levelTier = (level: number) => Math.min(5, Math.floor(Math.max(1, level) / 10));
export const LEVEL_TIER_COLORS = [0x9a8460, 0xc9d3df, 0xf0c34a, 0x4cc3ee, 0xb575f5, 0xff6a3d] as const; // bronze, prata, ouro, gelo, violeta, brasa
/** Vida máxima: base da classe + 10 por nível + bônus de armadura. */
export const maxHpFor = (cls: CharClass, level: number, armorHp = 0) => CLASS_DEFS[cls].maxHp + 10 * (level - 1) + armorHp;
/** Máximo do recurso (Fúria/Foco/Mana): base da classe + bônus por nível. */
export const maxManaFor = (cls: CharClass, level: number) => CLASS_DEFS[cls].resource.max + CLASS_DEFS[cls].resource.perLevel * (level - 1);
/** Multiplicador de poder (dano e cura): +5% por nível, multiplicado pelo bônus percentual da arma. */
export const dmgMult = (level: number, weaponPct = 0) => (1 + 0.05 * (level - 1)) * (1 + weaponPct / 100);

// ------------------------------------------------------------ personagem
/** Classes jogáveis. */
export const PLAYABLE_CLASSES: readonly CharClass[] = ["warrior", "archer", "cleric", "mage"];
export const NAME_MIN = 3;
export const NAME_MAX = 16;
export interface CharacterInfo { name: string; class: CharClass; level: number; xp: number; zone?: number }
export interface TravelEvent { zone: number }

/** A ação como a classe a tem agora: o Clérigo troca o Q conforme a escolha (0 = cura em área, 1 = cura focada). */
export function classAction(cls: CharClass, a: ActionId, qMode = 0): ActionDef {
  const d = CLASS_DEFS[cls] ?? CLASS_DEFS.warrior;
  return a === "skill1" && qMode === 1 && d.skill1Alt ? d.skill1Alt : d.actions[a];
}

export * from "./items";
export * from "./balance";
export * from "./economy";
export * from "./zones";
