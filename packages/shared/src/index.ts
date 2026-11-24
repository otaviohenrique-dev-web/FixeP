import { ZONES, type EnemyKind } from "./zones";
import type { Rarity } from "./items";
export * from "./quests";
export * from "./diario";
export * from "./dicas";
export * from "./poder";
export * from "./sets";
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
  Report: "report", // { name, motivo }: denúncia de um jogador (1 por minuto por conta; denúncia de si mesmo é ignorada)
  PartySync: "party_sync", // {}: pede o estado do grupo e o convite pendente (o cliente pede depois de registrar os receptores)
  ShopBuy: "shop_buy", // { npc, id, qty }: compra do comerciante (valida distância, estoque, saldo e espaço)
  ShopSell: "shop_sell", // { npc, slot, qty }: vende ao comerciante
  SmithMerge: "smith_merge", // { npc, slots: [a, b, c] }: funde 3 equipamentos iguais num de raridade superior (custa tostões; pode falhar)
  Craft: "craft", // { npc, tipo: "arma"|"peca", familia?, peca?, raridade }: craft de arma ou peça (Ferreira, aba Craftar); consome ingredientes/moedas e gera o item (ver crafting.ts)
  Socket: "socket", // { npc, origem: "mochila" | "equip", slot, gema }: engasta uma gema num espaço livre do equipamento (Ferreira, aba Engastar); custa Óbolos (ver engaste.ts)
  Unsocket: "unsocket", // { npc, origem, slot, idx }: remove a gema do espaço (o espaço volta; a gema é perdida)
  Refine: "refine", // { npc, origem: "mochila" | "equip", slot }: sobe +1 o refino de um equipamento (Ferreira, aba Refinar); custa Tostões e material; nunca quebra o item (ver refino.ts)
  Dismantle: "dismantle", // { npc, slot, confirm }: desmonta um equipamento da mochila em materiais (Ferreira, aba Desmontar); troca atômica (ver desmontar.ts)
  TradeInvite: "trade_invite", // { name }: convida um jogador da zona, por perto, para uma troca
  TradeAccept: "trade_accept", // {}: aceita o convite de troca
  TradeDecline: "trade_decline", // {}: recusa o convite
  TradeOffer: "trade_offer", // { items: [{ slot, qty }], iron, obols, seq }: define a minha oferta (reinicia as confirmações dos dois lados); seq = contador do cliente, devolvido em mine.seq
  TradeReady: "trade_ready", // { ready: boolean, rev }: aceita a versão `rev` da oferta (ou retira o aceite); executa quando os dois aceitaram a MESMA versão
  TradeCancel: "trade_cancel", // {}: cancela a troca
  TradeChat: "trade_chat", // { text }: sussurro só para o parceiro da troca ativa (mesmos limites do chat; some ao fechar)
  VaultOpen: "vault_open", // {}: abre o baú da cidade (o servidor valida a distância e envia Evt.Vault)
  VaultDeposit: "vault_deposit", // { slot, qty?, to? }: bolsa -> baú (to = espaço do baú, opcional)
  VaultWithdraw: "vault_withdraw", // { slot, qty?, to? }: baú -> bolsa (to = espaço da bolsa, opcional)
  VaultMove: "vault_move", // { from, to }: dentro do baú (troca de lugar ou junta pilhas)
  VaultCoins: "vault_coins", // { coin: "iron" | "obols", amount, dir: "in" | "out" }: deposita ou retira moedas
  MarketBrowse: "market_browse", // { npc, filter }: pede uma página de listagens (Evt.MarketPage)
  MarketMy: "market_my", // { npc }: pede as minhas listagens e vendas a recolher (Evt.MarketMine)
  MarketList: "market_list", // { npc, slot, qty, price, currency: "iron" | "obols" }: põe um item da mochila à venda (cobra a taxa de listagem)
  MarketBuy: "market_buy", // { npc, id }: compra uma listagem
  MarketCancel: "market_cancel", // { npc, id }: cancela uma listagem ativa (o item volta; a taxa não)
  MarketClaim: "market_claim", // { npc, id }: recolhe o dinheiro de uma venda ou o item de uma listagem vencida; id "all" recolhe tudo
  Ready: "ready", // {}: o cliente terminou de carregar a zona e o jogador já pode agir: só então começa a contar a bolha de chegada
  Variacao: "variacao", // { slot, id }: escolhe a variação de uma habilidade (id null = volta à base); só na cidade e a partir do nível do slot (C2.2)
  Talento: "talento", // { id }: gasta 1 ponto (1 rank) num talento do ramo; o servidor confere pontos, máximo e porta do ramo (C2.3)
  TalentoResetar: "talento_resetar", // {}: zera todos os talentos; só na cidade e pagando tostões (50 × (resets + 1)) (C2.3)
  LoadoutSalvar: "loadout_salvar", // { slot }: grava as variações e os talentos atuais no slot (0-2); só na cidade e fora de combate (C2.4)
  LoadoutAplicar: "loadout_aplicar", // { slot }: aplica o build do slot de uma vez (sem custo); valida contra o nível atual; só na cidade e fora de combate (C2.4)
  LoadoutNome: "loadout_nome", // { slot, nome }: renomeia o slot (máx. 16 caracteres, sanitizado); vale em qualquer lugar (C2.4)
  AutoPot: "auto_pot", // { at }: limiar da auto-poção em % de vida (0 = desligada); o servidor limita a 0..90, grava e sincroniza
  QMode: "q_mode",// { mode: 0 | 1 }: o Clérigo escolhe o Q (0 = cura em área, 1 = cura focada); só fora de combate
  QuestAccept: "quest_aceitar", // { id }: aceita uma quest (o servidor valida nível, pré-requisitos e se já aceitou)
  QuestDeliver: "quest_entregar", // { id }: entrega uma quest pronta (perto do NPC dela, se houver); a recompensa sai na mesma transação
  QuestTalk: "quest_falar", // { npc }: conversa com um NPC da zona (conta para objetivos "falar"; o servidor confere a distância)
  QuestSync: "quest_sync", // {}: pede o estado das quests (o cliente pede depois de registrar os receptores)
  DicaVista: "dica_vista", // { id }: o personagem viu esta dica (C1.6); o servidor valida o id e grava (uma vez por personagem)
  DicasSync: "dicas_sync", // {}: pede a lista de dicas já vistas (o cliente pede depois de registrar os receptores)
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
  ActDenied: "act_denied", // { a }: o servidor não executou a ação (recurso, recarga, atordoado...): o cliente devolve a recarga que mostrou
  TravelDenied: "travel_denied", // {}: o servidor recusou a travessia (em combate): o cliente tira a tela de load que mostrou ao pisar no portão
  Shield: "shield", // { ms }: a bolha de chegada começou a contar (só para o dono; o cliente mostra o tempo restante)
  Buffs: "buffs", // BuffsEvent { list }: buffs positivos ativos do próprio jogador (só para o dono; ver buffs.ts)
  WorldMap: "world_map", // {}: o jogador pisou no portão da cidade: o cliente abre o mapa-mundo (escolher a zona); a escolha volta em Msg.Travel { to }
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
  TradeChat: "trade_chat", // { name, text }: mensagem do chat privado da troca (vai só aos dois da troca)
  Vault: "vault", // VaultSnapshot: o conteúdo do baú pessoal (só para o dono, depois de abrir ou de qualquer operação)
  MarketPage: "market_page", // MarketPage: resposta a MarketBrowse
  MarketMine: "market_mine", // MarketMineEvent: minhas listagens e vendas
  MarketDone: "market_done", // MarketDoneEvent: resultado de listar, comprar, cancelar ou recolher
  Quests: "quest_estado", // QuestEvent: estado completo das quests do personagem (ao entrar e a cada mudança)
  QuestDefs: "quest_defs", // QuestDefsEvent: definições das quests (nome, texto, objetivos, recompensa); vai ao pedir quest_sync
  DicasVistas: "dicas_vistas", // DicasVistasEvent: ids de dicas já vistas pelo personagem (ao entrar e a cada dicas_sync)
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
export interface TradeChatEvent { name: string; text: string }
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
export const TRADE_CHAT_MAX_LEN = 120; // chat privado da troca: mensagens curtas
export interface ChatEvent { id: string; name: string; text: string }

export interface MoveToPayload {
  stop?: boolean; // true: para no ponto onde o personagem está AGORA, no servidor (ignora x e y)
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
/** Regeneração automática em repouso fica bloqueada por este tempo depois de qualquer dano, e enquanto houver inimigo focando o jogador. Poções, habilidades de cura (clérigo) e aliados não são afetados. */
export const HEAL_BLOCK_AFTER_HIT_S = 8;
/** Regeneração dos inimigos: só parados em casa ou voltando para ela, e só depois de ficarem sem receber dano. */
/** Chefe sem NENHUM alvo vivo (todo mundo morreu, saiu ou fugiu) por tanto tempo: reseta a vida na hora e esquece a luta. */
export const BOSS_RESET_GRACE_S = 3;
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
  shredPct?: number; // quebra de armadura (Perfurar): inimigos atingidos recebem +% de dano de TODAS as fontes por shredS
  shredS?: number;
  slowPct?: number; // lentidão (Cilada): inimigos atingidos andam -% mais devagar por slowS (chefes resistem)
  slowS?: number;
  hasteAtkPct?: number; // Chuva: ao acertar ao menos um inimigo, o ataque básico do dono fica +% mais rápido por hasteS
  hasteS?: number;
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
  // suporte e controle extra (C-rebalance): cada campo vem de um efeito (ver ActionEffect)
  selfHeal?: number; // cura o próprio jogador ao usar
  hitHeal?: number; // cura o próprio jogador por golpe que acerta (ao menos um inimigo)
  manaGain?: number; // recurso recuperado ao conjurar a cura (Clérigo)
  guardPct?: number; // aliados curados recebem -guardPct% de dano por guardS
  guardS?: number;
  stackMax?: number; // acúmulos máximos no aliado (Cura Focada)
  stackPct?: number; // +% por acúmulo nas curas do Clérigo naquele aliado
  stackS?: number; // duração dos acúmulos, renovada a cada uso
  burnPct?: number; // queimadura: % do dano base por segundo
  burnS?: number; // duração da queimadura (renova, não acumula)
  cleanse?: boolean; // purifica: remove atordoamento e enraizamento dos aliados curados
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

/** Efeito: o que a habilidade FAZ. Cada efeito vira os campos planos da ActionDef (dano, cura, controle, quebra, lentidão, aceleração). */
export type ActionEffect =
  | { t: "damage"; amount: number } // dano base
  | { t: "heal"; amount: number } // cura
  | { t: "stun"; s: number } // atordoa (depois da puxada)
  | { t: "root"; s: number } // enraíza
  | { t: "pull"; s: number } // tempo da puxada (Compressor de Ar)
  | { t: "shred"; pct: number; s: number } // quebra armadura: +pct% de dano recebido por s
  | { t: "slow"; pct: number; s: number } // lentidão: -pct% de velocidade por s
  | { t: "hasteAttack"; pct: number; s: number } // ataque básico do dono +pct% mais rápido por s
  | { t: "selfHeal"; amount: number } // cura o próprio jogador ao usar
  | { t: "hitHeal"; amount: number } // cura o próprio jogador por golpe que acerta
  | { t: "mana"; amount: number } // recupera o recurso ao conjurar uma cura (Clérigo)
  | { t: "guard"; pct: number; s: number } // aliados curados recebem -pct% de dano por s
  | { t: "stacks"; max: number; pct: number; s: number } // cada uso no aliado soma 1 acúmulo (até max); cada acúmulo dá +pct% às curas do Clérigo nele por s desde o último uso
  | { t: "burn"; pct: number; s: number } // queimadura: pct% do dano base por segundo, por s (inimigos; renova, não acumula)
  | { t: "cleanse" }; // purifica: remove atordoamento e enraizamento dos aliados curados
/** Campos da ActionDef que vêm dos efeitos (nunca são escritos direto na spec). */
type EffectField = "dmg" | "heal" | "stunS" | "rootS" | "pullS" | "shredPct" | "shredS" | "slowPct" | "slowS" | "hasteAtkPct" | "hasteS"
  | "selfHeal" | "hitHeal" | "manaGain" | "guardPct" | "guardS" | "stackMax" | "stackPct" | "stackS" | "burnPct" | "burnS" | "cleanse";
/** Forma declarativa de uma habilidade: os dados fixos da ação (tecla, recarga, custo, visual...) + a lista de efeitos. */
export type ActionSpec = Omit<ActionDef, EffectField> & { effects?: ActionEffect[] };
type NumericActionKey = { [K in keyof ActionDef]-?: NonNullable<ActionDef[K]> extends number ? K : never }[keyof ActionDef];
/** Slot de habilidade: os 6 slots fixos e o Q alternativo do Clérigo. */
export type ActionSlot = ActionId | "skill1Alt";
/** Modificador de habilidade (lista vazia hoje; a C2.2 traz as variações por nível e a C2.3 os talentos).
 * `slot` limita a um slot; `set` troca campos; `add` soma em campos numéricos. Aplicados em ordem. */
export interface ActionModifier { id: string; slot?: ActionSlot; set?: Partial<ActionDef>; add?: Partial<Record<NumericActionKey, number>> }

const applyEffect = (out: ActionDef, e: ActionEffect) => {
  switch (e.t) {
    case "damage": out.dmg = e.amount; break;
    case "heal": out.heal = e.amount; break;
    case "stun": out.stunS = e.s; break;
    case "root": out.rootS = e.s; break;
    case "pull": out.pullS = e.s; break;
    case "shred": out.shredPct = e.pct; out.shredS = e.s; break;
    case "slow": out.slowPct = e.pct; out.slowS = e.s; break;
    case "hasteAttack": out.hasteAtkPct = e.pct; out.hasteS = e.s; break;
    case "selfHeal": out.selfHeal = e.amount; break;
    case "hitHeal": out.hitHeal = e.amount; break;
    case "mana": out.manaGain = e.amount; break;
    case "guard": out.guardPct = e.pct; out.guardS = e.s; break;
    case "stacks": out.stackMax = e.max; out.stackPct = e.pct; out.stackS = e.s; break;
    case "burn": out.burnPct = e.pct; out.burnS = e.s; break;
    case "cleanse": out.cleanse = true; break;
  }
};

const dodge = (dash: number, cd: number): ActionSpec => ({ kind: "dodge", name: "Esquiva", key: "SHIFT", cd, dash, dashTime: 0.25, invulnS: 0.3 });

interface ClassSpec extends Omit<ClassDef, "actions" | "skill1Alt"> { actions: Record<ActionId, ActionSpec>; skill1Alt?: ActionSpec }

/** Dados de todas as classes, em forma de efeitos. CLASS_DEFS é derivado daqui por resolveAction (sem modificadores). */
const CLASS_SPECS: Record<CharClass, ClassSpec> = {
  warrior: {
    id: "warrior", name: "Guerreiro", role: "Tanque", maxHp: 120, color: 0xff8a3d,
    resource: { name: "Fúria", icon: "flame", color: 0xe0742a, max: 100, regen: 5, perLevel: 3 },
    actions: {
      // ataque básico: dano baixo (sem cura por golpe: roubo de vida é atributo de item, ver afixos.ts)
      attack: { kind: "melee", name: "Golpe", key: "ESPAÇO", cd: 0.55, offset: 1.0, radius: 1.25, effects: [{ t: "damage", amount: 10 }] },
      // Q: avanço com o escudo à frente; quem estiver no caminho leva mais dano e fica ATORDOADO por pouco (sem cura: recuperação de vida é afixo de item, ver afixos.ts)
      skill1: { kind: "dashHit", name: "Investida", key: "Q", cd: 7, cost: 25, dash: 4.5, dashTime: 0.25, radius: 1.2, icon: "charge", effects: [{ t: "damage", amount: 14 }, { t: "stun", s: 1.2 }] },
      // W: correntes brotam do chão e ENRAIZAM os inimigos da área, que ainda ficam lentos
      skill2: { kind: "rain", name: "Correntes", key: "W", cd: 10, cost: 30, radius: 2.8, placeRange: 6, delayS: 0.45, fx: "chains", icon: "chains", effects: [{ t: "damage", amount: 10 }, { t: "root", s: 3.5 }, { t: "slow", pct: 30, s: 3 }] },
      // E: PROVOCA (inimigos próximos passam a mirar nele) e ergue o Escudo de Aço: menos dano recebido (sem reflexo: Espinhos é afixo de item)
      skill3: { kind: "reflectBuff", name: "Escudo de Aço", key: "E", cd: 14, cost: 35, buffS: 5, reduction: 0.5, tauntRadius: 7, tauntS: 4, icon: "shield" },
      // R: um colosso de aço desaba do céu (telegrafado): dano médio em área e atordoamento curto (ultimate de controle, não de dano)
      ultimate: { kind: "rain", name: "Queda do Colosso", key: "R", cd: 40, cost: 80, radius: 4.2, placeRange: 6, delayS: 1.5, fx: "colossus", icon: "hammer", effects: [{ t: "damage", amount: 40 }, { t: "stun", s: 1.8 }] },
      dodge: dodge(3, 1.4),
    },
  },
  archer: {
    id: "archer", name: "Arqueiro", role: "Dano à distância", maxHp: 90, color: 0x6fcf6f,
    resource: { name: "Foco", icon: "eye", color: 0x6fcf6f, max: 100, regen: 6, perLevel: 3 },
    actions: {
      attack: { kind: "projectile", name: "Flecha", key: "ESPAÇO", cd: 0.5, speed: 15, range: 9, radius: 0.35, effects: [{ t: "damage", amount: 9 }] },
      skill1: { kind: "projectile", name: "Perfurar", key: "Q", cd: 4, cost: 20, speed: 20, range: 12, radius: 0.5, pierce: true, effects: [{ t: "damage", amount: 15 }, { t: "shred", pct: 20, s: 6 }] },
      skill2: { kind: "trap", name: "Cilada", key: "W", cd: 8, cost: 25, radius: 1.6, placeRange: 6, armS: 0.6, lifeS: 20, maxActive: 3, effects: [{ t: "damage", amount: 10 }, { t: "slow", pct: 50, s: 5 }] },
      skill3: { kind: "rain", name: "Chuva", key: "E", cd: 10, cost: 35, radius: 2.4, placeRange: 8, delayS: 0.8, fx: "arrows", effects: [{ t: "damage", amount: 17 }, { t: "hasteAttack", pct: 60, s: 5 }] },
      ultimate: { kind: "rain", name: "Salva Final", key: "R", cd: 40, cost: 80, radius: 3.6, placeRange: 9, delayS: 1.0, fx: "arrows", effects: [{ t: "damage", amount: 26 }] },
      dodge: dodge(5, 1.6), // rolamento longo
    },
  },
  cleric: {
    id: "cleric", name: "Clérigo", role: "Suporte", maxHp: 100, color: 0xf2e6a0,
    resource: { name: "Mana", icon: "drop", color: 0x4aa8ff, max: 120, regen: 6, perLevel: 4 },
    actions: {
      attack: { kind: "projectile", name: "Raio", key: "ESPAÇO", cd: 0.7, cost: 4, speed: 12, range: 8, radius: 0.4, effects: [{ t: "damage", amount: 8 }] },
      // Q (A): cura todos em volta (mais que antes); cada uso devolve um pouco de mana ao Clérigo e dá um escudo leve (-15% de dano por 3 s) aos curados
      skill1: { kind: "healAoe", name: "Cura em Área", key: "Q", cd: 5, cost: 26, radius: 5, icon: "healAoe", effects: [{ t: "heal", amount: 26 }, { t: "mana", amount: 8 }, { t: "guard", pct: 15, s: 3 }] },
      // W: puxa o grupo para o centro e atordoa
      skill2: { kind: "pull", name: "Compressor de Ar", key: "W", cd: 12, cost: 30, radius: 4.5, placeRange: 6, effects: [{ t: "pull", s: 0.45 }, { t: "stun", s: 1.2 }] },
      skill3: { kind: "rain", name: "Julgamento", key: "E", cd: 7, cost: 30, radius: 3, placeRange: 7, delayS: 0.6, fx: "holy", effects: [{ t: "damage", amount: 26 }] },
      // R: cura em área grande, escudo curto (-25% de dano por 4 s) e purifica atordoamento e raízes dos aliados
      ultimate: { kind: "healAoe", name: "Luz Divina", key: "R", cd: 45, cost: 90, radius: 6, icon: "healAoe", effects: [{ t: "heal", amount: 80 }, { t: "guard", pct: 25, s: 4 }, { t: "cleanse" }] },
      dodge: dodge(3, 1.4),
    },
    // Q (B): cura focada em UM jogador (o selecionado, o mais próximo da mira ou o próprio). Cada uso no mesmo aliado soma um acúmulo (até 3, 8 s): cada acúmulo dá +10% às curas do Clérigo nele
    skill1Alt: { kind: "healFocus", name: "Cura Focada", key: "Q", cd: 4, cost: 30, range: 9, icon: "healFocus", effects: [{ t: "heal", amount: 30 }, { t: "stacks", max: 3, pct: 10, s: 8 }] },
  },
  mage: {
    id: "mage", name: "Mago", role: "Dano explosivo", maxHp: 75, color: 0xa070ff,
    resource: { name: "Mana", icon: "drop", color: 0xa070ff, max: 140, regen: 7, perLevel: 5 },
    actions: {
      attack: { kind: "projectile", name: "Dardo Arcano", key: "ESPAÇO", cd: 0.8, cost: 4, speed: 13, range: 9, radius: 0.4, effects: [{ t: "damage", amount: 13 }] },
      // Q (fogo): explode ao acertar, ferindo uma área, e LENTIFICA quem é atingido (controle básico; queimadura é afixo de item)
      skill1: { kind: "blast", name: "Bola de Fogo", key: "Q", cd: 5, cost: 30, speed: 11, range: 10, radius: 0.45, blast: 2.3, effects: [{ t: "damage", amount: 24 }, { t: "slow", pct: 30, s: 3 }] },
      // W (raio): dano em área menor e ATORDOA por pouco (garantido; chefes resistem)
      skill2: { kind: "rain", name: "Relâmpago", key: "W", cd: 7, cost: 28, radius: 1.7, placeRange: 9, delayS: 0.35, fx: "lightning", effects: [{ t: "damage", amount: 20 }, { t: "stun", s: 0.8 }] },
      // E (fogo): chuva de chamas em área ampla que ENRAIZA quem for atingido (controle de grupo)
      skill3: { kind: "rain", name: "Chuva de Fogo", key: "E", cd: 11, cost: 45, radius: 3.1, placeRange: 8, delayS: 0.9, fx: "firerain", effects: [{ t: "damage", amount: 36 }, { t: "root", s: 1.5 }] },
      // R: meteoro com dano médio-alto em área e ENRAIZA por mais tempo
      ultimate: { kind: "rain", name: "Meteoro", key: "R", cd: 45, cost: 100, radius: 4.2, placeRange: 9, delayS: 1.5, fx: "meteor", effects: [{ t: "damage", amount: 56 }, { t: "root", s: 2 }] },
      dodge: dodge(4, 1.5), // passo arcano curto: o Mago tem pouco sustain, depende de manter distância
    },
  },
};

/**
 * Função pura: a ação EFETIVA de uma classe num slot. Aplica os efeitos da spec sobre os campos planos e depois
 * os modificadores (em ordem). Sem modificadores devolve exatamente os valores de sempre.
 */
export function resolveAction(cls: CharClass, slot: ActionSlot, mods: readonly ActionModifier[] = []): ActionDef {
  const spec = CLASS_SPECS[cls] ?? CLASS_SPECS.warrior;
  const s = (slot === "skill1Alt" ? spec.skill1Alt : undefined) ?? spec.actions[slot as ActionId];
  const { effects, ...fixed } = s;
  const out = { ...fixed } as ActionDef;
  for (const e of effects ?? []) applyEffect(out, e);
  for (const m of mods) {
    if (m.slot && m.slot !== slot) continue;
    if (m.set) Object.assign(out, m.set);
    if (m.add) {
      const bag = out as unknown as Record<string, number | undefined>;
      for (const k of Object.keys(m.add) as NumericActionKey[]) bag[k] = (bag[k] ?? 0) + (m.add[k] as number);
    }
  }
  return out;
}

const deriveClass = (c: ClassSpec): ClassDef => {
  const { actions, skill1Alt, ...rest } = c;
  const out = {} as Record<ActionId, ActionDef>;
  for (const a of Object.keys(actions) as ActionId[]) out[a] = resolveAction(c.id, a);
  return { ...rest, actions: out, ...(skill1Alt ? { skill1Alt: resolveAction(c.id, "skill1Alt") } : {}) };
};

export const CLASS_DEFS: Record<CharClass, ClassDef> = {
  warrior: deriveClass(CLASS_SPECS.warrior),
  archer: deriveClass(CLASS_SPECS.archer),
  cleric: deriveClass(CLASS_SPECS.cleric),
  mage: deriveClass(CLASS_SPECS.mage),
};

/** Chefes resistem a atordoar e enraizar: a duração cai para esta fração. */
export const BOSS_CC_RESIST = 0.4;
/** Quem causou ou recebeu dano há menos de tantos segundos está em combate: não atravessa portais nem o portão (a morte leva à cidade normalmente). */
export const TRAVEL_COMBAT_LOCK_S = 8;
/** Bolha de proteção da chegada: imune a dano (inimigos, chefes, PvP) por tantos segundos, contados SÓ depois que a tela de carregamento acaba. Some na hora se o jogador atacar ou usar habilidade. */
export const ARRIVAL_SHIELD_S = 9;
/** Enquanto o cliente carrega (ainda não mandou Msg.Ready) o jogador já está protegido; se o aviso nunca vier, a contagem começa sozinha depois deste tempo. */
export const ARRIVAL_SHIELD_WAIT_S = 25;
/** Raio (tiles) em volta de todo ponto de chegada/nascimento sem nenhum inimigo (o aggro é de 7 a 11; sobra margem). */
export const ARRIVAL_SAFE_RADIUS = 14;
/** Distância (tiles) entre o centro do portão e o ponto em que se chega: fora do alcance de pisar nele. */
export const ARRIVAL_GATE_DIST = 5.5;

export const SKELETON = {
  name: "Esqueleto",
  maxHp: 60,
  speed: 2.4,
  aggro: 7,
  leash: 24, // até onde o inimigo persegue a partir do seu ponto de origem (maior alcance = grupos de caça maiores sem fugir do ponto)
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
  wraith: { ...base, name: "Espectro", hpMul: 1.3, dmgMul: 1.4, speed: 2.0, aggro: 9, leash: 26, engage: 2.2, windupS: 0.9, strikeOffset: 1.4, strikeRadius: 1.6, recoverS: 1.2, radius: 0.5, color: 0x9a7ad0 },
} as Record<EnemyKind, EnemyKindDef>;
// pulso sombrio: a cada pulseEveryS atinge TODOS a até pulseRadius (ignora esquiva) com pulsePct da vida máxima de cada um: sem curandeiro não se aguenta
const bossBase: Pick<BossDef, "slamWindupS" | "enrageAt" | "enrageSpeed" | "pulseEveryS" | "pulsePct" | "pulseRadius"> = { slamWindupS: 1.3, enrageAt: 0.3, enrageSpeed: 1.3, pulseEveryS: 6, pulsePct: 0.4, pulseRadius: 24 };
ENEMY_KINDS.bone_king = { ...base, name: "Rei Ossudo", hpMul: 18, dmgMul: 1.2, speed: 2.2, aggro: 9, leash: 18, engage: 2.0, strikeOffset: 1.3, strikeRadius: 1.8, radius: 0.7, respawnS: 300, color: 0xe8e0c8,
  scale: 1.7, boss: { xpMul: 2, slamEveryS: 9, slamRadius: 3.4, slamMul: 1.4, ...bossBase } }; // xpMul: o dev mudou a regra (antes 8; ver XP_MOB_MULT)
ENEMY_KINDS.frost_alpha = { ...base, name: "Lobo Alfa", hpMul: 15, dmgMul: 1.2, speed: 3.6, aggro: 10, leash: 18, engage: 2.0, windupS: 0.6, strikeOffset: 1.2, strikeRadius: 1.6, recoverS: 0.9, radius: 0.7, respawnS: 420, color: 0xbfd8f2,
  scale: 1.7, boss: { xpMul: 2, slamEveryS: 8, slamRadius: 3.2, slamMul: 1.4, ...bossBase } }; // xpMul: o dev mudou a regra (antes 8)
ENEMY_KINDS.crypt_lord = { ...base, name: "Soberano das Catacumbas", hpMul: 18, dmgMul: 1.3, speed: 2.3, aggro: 11, leash: 20, engage: 2.6, windupS: 0.9, strikeOffset: 1.6, strikeRadius: 2.0, recoverS: 1.1, radius: 0.8, respawnS: 600, color: 0xc9a8ff,
  scale: 1.8, boss: { xpMul: 2, slamEveryS: 8, slamRadius: 4, slamMul: 1.5, ...bossBase } }; // xpMul: o dev mudou a regra (antes 10)
export const enemyKind = (k: string): EnemyKindDef => ENEMY_KINDS[k as EnemyKind] ?? ENEMY_KINDS.skeleton;

/** Spawns da zona 1 (compatibilidade): os de cada zona ficam em ZONES. */
export const ENEMY_SPAWNS = ZONES[1].enemies;

/** Vida, dano e XP do inimigo por nível (o nível 1 é o Esqueleto base). Vida cresce 25% por nível (antes 40%). */
export const enemyHp = (level: number, kind: string = "skeleton") => Math.round(SKELETON.maxHp * enemyKind(kind).hpMul * (1 + ENEMY_HP_PER_LEVEL * (level - 1)));
export const enemyDmg = (level: number, kind: string = "skeleton") => Math.round(SKELETON.dmg * enemyKind(kind).dmgMul * (1 + 0.3 * (level - 1)));
/** o dev mudou a regra (design definitivo): XP de mob/chefe caiu forte; quem sobe de nível é a QUEST.
 *  Antes: XP_PER_KILL 20 sem multiplicador (nível 21 dava ~33.700 XP por abate; subir para 50 num dia era possível).
 *  Agora: XP_MOB_MULT = 0.03 (a base 20 vira 0,6). Nível 1 dá 1 XP; nível 6 dá 4; nível 12 dá 36; nível 21 dá 1.014.
 *  O chefe multiplica por `boss.xpMul` (ver ENEMY_KINDS: agora 2). */
export const XP_MOB_MULT = 0.03;
export const enemyXp = (level: number) => Math.round(XP_PER_KILL * XP_MOB_MULT * Math.pow(1.45, level - 1));

// ------------------------------------------------------------ progressão
export const LEVEL_CAP = 50;
export const XP_PER_KILL = 20;
/** XP necessário para sair do nível `level` para o próximo (0 no nível máximo). */
/** Cresce 25% a cada nível (100, 125, 156, 195, 244...; ~ 6,9 mil no nível 20; ~ 4,5 milhões no 49). */
export const xpToNext = (level: number) => (level >= LEVEL_CAP ? 0 : Math.round(100 * Math.pow(1.25, level - 1)));
/** Faixa de borda do nível: muda a cada 10 níveis (1-9, 10-19, 20-29, 30-39, 40-49, 50). */
export const levelTier = (level: number) => Math.min(5, Math.floor(Math.max(1, level) / 10));
export const LEVEL_TIER_COLORS = [0x9a8460, 0xc9d3df, 0xf0c34a, 0x4cc3ee, 0xb575f5, 0xff6a3d] as const; // bronze, prata, ouro, gelo, violeta, brasa
/** Título de cada faixa de nível (o nome épico que aparece na barra de progresso e no aviso de level up). */
export const LEVEL_TIER_TITLES = ["Andarilho das Cinzas", "Lâmina Sombria", "Juramentado do Abismo", "Ceifador Gélido", "Devoto das Trevas", "Arauto da Ruína"] as const;
/** Vida máxima: base da classe + 10 por nível + bônus de armadura. */
export const maxHpFor = (cls: CharClass, level: number, armorHp = 0) => CLASS_DEFS[cls].maxHp + 10 * (level - 1) + armorHp;
/** Máximo do recurso (Fúria/Foco/Mana): base da classe + bônus por nível. */
export const maxManaFor = (cls: CharClass, level: number) => CLASS_DEFS[cls].resource.max + CLASS_DEFS[cls].resource.perLevel * (level - 1);
/**
 * Atributos por nível (tabela única para servidor e cliente):
 * - Poder (dano e cura): +8% por nível (antes 5%), multiplicado pelo bônus percentual da arma.
 * - Defesa: divide o dano recebido por 1 + 6% por nível. Um nível 46 leva ~1/3,7 do dano bruto de um mob nível 13
 *   (antes levava o dano cheio); a vida já cresce 10 por nível.
 */
export const PLAYER_POWER_PER_LEVEL = 0.08;
export const PLAYER_DEFENSE_PER_LEVEL = 0.06;
export const ENEMY_HP_PER_LEVEL = 0.3;
export const dmgMult = (level: number, weaponPct = 0) => (1 + PLAYER_POWER_PER_LEVEL * (level - 1)) * (1 + weaponPct / 100);
/** Divisor do dano recebido pelo jogador (>= 1): cresce com o nível. */
export const defenseMult = (level: number) => 1 + PLAYER_DEFENSE_PER_LEVEL * (Math.max(1, level) - 1);

// ------------------------------------------------------------ personagem
/** Classes jogáveis. */
export const PLAYABLE_CLASSES: readonly CharClass[] = ["warrior", "archer", "cleric", "mage"];
export const NAME_MIN = 3;
export const NAME_MAX = 16;
/** personagens por conta: a tela de seleção mostra até este número de slots */
export const MAX_CHARACTERS_PER_ACCOUNT = 4;
export interface CharacterInfo { id: string; name: string; class: CharClass; level: number; xp: number; zone?: number }
export interface TravelEvent { zone: number }

/** A ação como a classe a tem agora: o Clérigo troca o Q conforme a escolha (0 = cura em área, 1 = cura focada). */
export function classAction(cls: CharClass, a: ActionId, qMode = 0, mods: readonly ActionModifier[] = []): ActionDef {
  // a ação efetiva vem de resolveAction (servidor e cliente usam esta função; sem modificadores = valores de CLASS_DEFS)
  const alt = a === "skill1" && qMode === 1 && CLASS_SPECS[cls]?.skill1Alt;
  return resolveAction(cls, alt ? "skill1Alt" : a, mods);
}

export * from "./items";
export * from "./afixos";
export * from "./balance";
export * from "./economy";
export * from "./market";
export * from "./zones";
export * from "./vault";
export * from "./skilltips";
export * from "./variacoes";
export * from "./talentos";
export * from "./loadouts";
export * from "./buffs";
export * from "./crafting";
export * from "./refino";
export * from "./desmontar";
export * from "./engaste";
export * from "./refino_stats";
export * from "./simulacao";
