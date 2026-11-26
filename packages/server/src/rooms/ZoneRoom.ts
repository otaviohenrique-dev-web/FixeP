import { Room, Client, ServerError } from "colyseus";
import {
  Msg, Evt, MoveToPayload, ActPayload, ActionId, ACTION_IDS, ActionDef,
  TICK_RATE, MAX_CLIENTS_PER_ZONE, CHAT_MAX_LEN, TRADE_CHAT_MAX_LEN, ZONES, ZONE_IDS, WORLD_GATE, zoneRoomName, enemyKind, type ZoneDef, type PortalDef,
  CLASS_DEFS, type ClassDef, type CharClass, MOVE_SPEED, RESPAWN_S, SHARE_RADIUS,
  PLAYER_RADIUS, PVP_CHANNEL_S, PVP_NO_DAMAGE_S, QMODE_SWAP_S, BOSS_CC_RESIST, classAction, CRIT, DAMAGE_VARIANCE, clamp, partyXpMult,
  LEVEL_CAP, poderTotal, statsDoPersonagem, xpToNext, enemyHp, enemyDmg, enemyXp, maxHpFor, maxManaFor, dmgMult, defenseMult, HEAL_BLOCK_AFTER_HIT_S, ITEMS, POTION_COOLDOWN_S, effectiveAction, rarityIndex, clampAutoPot, autoPotDispara,
  LOOT_LOCK_S, CHEST_LOCK_S, GROUND_TTL_S, PICKUP_AUTO, PICKUP_REACH, GROUND_MAX, type Rarity,
  COIN_OBOL, isCoinItem, mobIron, bossIron, zoneNpcs, NPC_REACH,
  ELIGIBLE_DMG_PCT, PLAYER_REGEN_DELAY_S, PLAYER_REGEN_PCT_S, ENEMY_REGEN, BOSS_RESET_GRACE_S, BOSS_GROUP_MIN, BOSS_COUNT_RADIUS, bossDmgMult, bossEnrageMult,
  START_ZONE, HUB_ZONE, TRAVEL_COMBAT_LOCK_S, ARRIVAL_SHIELD_S, ARRIVAL_SHIELD_WAIT_S, expandSpawns, mulGrupo, mulXp, mulTostoes, VAULT_REACH, TRADE_INVITE_S, TRADE_RANGE, MARKET_MAX_OPEN, type MarketMineEvent, type MarketDoneEvent, type NpcKind, type TradeEvent, type TradeOfferSide,
  VARIACAO_SLOTS, VARIACAO_NIVEL, type VariacaoSlot, variacaoDesbloqueada, limparEscolhas, modificadoresDaEscolha, variacaoPorId, type EscolhasVariacao,
  limparTalentos, podeSubirTalento, subirTalento, aplicarTalentos, resetCusto, talentoPorId, aplicarSets,
  limparLoadouts, validarLoadout, sanitizarNomeLoadout, loadoutNomePadrao, LOADOUT_SLOTS, LOADOUT_COMBAT_LOCK_S, type Loadouts,
  EQUIP_SLOTS, type EquipBuild,
} from "@frixep/shared";
import { aplicarEquipBuild } from "../game/loadoutEquip.js";
import { verifySession, type AuthUser } from "../auth.js";

/** Salas de zona vivas (para contar os jogadores online do jogo inteiro). */
const liveRooms = new Set<ZoneRoom>();
/** Jogadores online em todas as zonas (o cliente mostra no painel de FPS/ping). */
export const onlineCount = () => { let n = 0; for (const r of liveRooms) n += r.state.players.size; return n; };

/** jogadores online agora, por zona (painel de administração: visão geral) */
export function jogadoresPorZona(): { zona: number; nome: string; jogadores: number }[] {
  const porZona = new Map<number, { zona: number; nome: string; jogadores: number }>();
  for (const r of liveRooms) {
    const z = r.infoZona();
    const acc = porZona.get(z.zona) ?? { ...z, jogadores: 0 };
    acc.jogadores += z.jogadores;
    porZona.set(z.zona, acc);
  }
  return [...porZona.values()].sort((a, b) => a.zona - b.zona);
}

/** a conta está online agora (em alguma zona)? */
export const contaOnline = (contaId: string): boolean => active.has(contaId);

/** derruba a sessão da conta, se estiver online. Código de saída: 4003 banido, 4005 expulso pelo painel. */
export function derrubarConta(contaId: string, codigo: number): boolean {
  const s = active.get(contaId);
  if (!s) return false;
  s.room.clients.getById(s.sid)?.leave(codigo);
  return true;
}

/** aviso para a conta, se ela estiver online em alguma zona (usado pelo painel) */
export function avisarContaOnline(contaId: string, text: string): void {
  const s = active.get(contaId);
  if (s) s.room.notificarSessao(s.sid, text);
}
import { Player, Enemy, GroundItem, ZoneState } from "./entities.js";
import type { Repo, CharacterRow } from "../db/repo.js";
import { registrarEvento } from "../telemetria.js";
import { isAdmin, parseComandoAdmin, type ComandoAdmin, sancaoEmCache, guardarSancao, silenciadoAte, horaLegivel, MOTIVO_MAX } from "../moderacao.js";
import { travasAtivas, velocidadeValida, validarItemGm, bloqueioGm } from "../gm/modoDeus.js";
import { GM_VEL_MIN, GM_VEL_MAX, MAX_COINS } from "@frixep/shared";
import { Market } from "../game/market.js";
import { snapshot, addItem, equipFromSlot, unequip, dropSlot, consumeOne, bonuses, validSlot, sortInventory, type Inventory } from "../game/inventory.js";
import { rollMobLoot, rollChestLoot, econTest, type Drop } from "../game/loot.js";
import { craftItem } from "../game/craft.js";
import { refinarItem } from "../game/refino.js";
import { desmontarItem } from "../game/desmontar.js";
import { engastarGema, removerGema } from "../game/engaste.js";
import { addCoins, buyItem, sellSlot, breakSlot, mergeItems, parseOffer, executeTrade, emptyOffer, sameOffer, describeCoins, type TradeOffer } from "../game/economy.js";
import { parties, type Result } from "../game/party.js";
import { carregarQuests, questsDoServidor, aceitar, progredirAbate, progredirFala, progredirChegada, progredirUso, atualizarColetas, aplicarRecompensa, xpAposGanho, estadoParaCliente, type QuestMap, type QuestRt } from "../game/quests.js";
import type { QuestEvent, QuestDefsEvent, QuestDef, AcaoUsar, DicasVistasEvent } from "@frixep/shared";
import { dicaValida, dicasValidas } from "@frixep/shared";
import { valoresEfetivos, type BalanceEvent } from "@frixep/shared";
import type { Balanceamento } from "../balanceamento.js";
import type { ActiveBuff, BuffsEvent } from "@frixep/shared";

/** Quests carregadas dos JSON em packages/server/data/quests. Se algum estiver errado, o servidor nem sobe (mensagem diz o arquivo). */
const DEFS = carregarQuests(questsDoServidor());
import { deposit, withdraw, moveInVault, moveCoins, vaultSnapshot, type Vault } from "../game/vault.js";

interface Proj { id: string; owner: string; x: number; y: number; dx: number; dy: number; speed: number; left: number; radius: number; dmg: number; pierce: boolean; blast: number; hit: Set<string>; shredPct?: number; shredS?: number; burnDmg?: number; burnS?: number; slowPct?: number; slowS?: number }
interface Trap { id: string; owner: string; x: number; y: number; r: number; dmg: number; armAt: number; expireAt: number; slowPct?: number; slowS?: number }
interface Trade { a: string; b: string; offer: Record<string, TradeOffer>; ready: Record<string, boolean>; rev: number; seq: Record<string, number> }
interface JoinAuth { user: AuthUser; character: CharacterRow; inventory: Inventory; quests: QuestMap }

// uma sessão por conta em TODAS as zonas: conta -> (sala, sessão) atual; a chegada de uma travessia guarda de onde veio
const active = new Map<string, { room: ZoneRoom; sid: string }>();
/** Modo Deus: destino de uma teleporte entre zonas, consumido na próxima entrada do personagem */
const gmDestino = new Map<string, { x: number; y: number }>();
/** sala e sessão onde a conta joga agora (painel do Modo Deus); undefined = fora do jogo */
export const salaDaConta = (contaId: string) => active.get(contaId);
/** resultado de uma ação do Modo Deus (a rota grava a auditoria com antes e depois) */
export type GmResultado =
  | { ok: true; resumo: string; antes?: unknown; depois?: unknown; detalhes?: Record<string, unknown> }
  | { ok: false; status: 400 | 403 | 404 | 409; erro: string };
const arrivals = new Map<string, number>(); // personagem -> zona de origem da travessia (consumido ao entrar)

const dist = (ax: number, ay: number, bx: number, by: number) => Math.hypot(ax - bx, ay - by);
/** DANO_FIXO_TEST=1 (só fora de produção): sem crítico e sem variação de dano, para os testes de números exatos não sortearem. */
const danoFixo = () => process.env.DANO_FIXO_TEST === "1" && process.env.NODE_ENV !== "production";
const QUEST_CHEGADA_CHECK_S = 0.5; // intervalo (s) em que os objetivos "chegar" são conferidos

/** distância do ponto (px,py) ao segmento (x1,y1)-(x2,y2) */
function distToSegment(px: number, py: number, x1: number, y1: number, x2: number, y2: number) {
  const dx = x2 - x1, dy = y2 - y1;
  const l2 = dx * dx + dy * dy;
  const t = l2 === 0 ? 0 : clamp(((px - x1) * dx + (py - y1) * dy) / l2, 0, 1);
  return dist(px, py, x1 + t * dx, y1 + t * dy);
}

/** Texto de chat seguro: sem caracteres de controle, sem tags HTML, espaços normalizados, no máximo CHAT_MAX_LEN. "" = descartar. */
export function cleanChat(raw: string): string {
  return raw
    .replace(/[\u0000-\u001f\u007f-\u009f\u200b-\u200f\u2028-\u202e\u2066-\u2069\ufeff]/g, " ") // controle, invisíveis e inversão de texto
    .replace(/<[^>]*>?/g, "") // tags HTML (inclusive incompletas)
    .replace(/[<>]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, CHAT_MAX_LEN)
    .trim();
}

// última denúncia de cada conta (ms): limite de 1 por minuto, válido entre as zonas
const ultimaDenuncia = new Map<string, number>();

export class ZoneRoom extends Room<ZoneState> {
  maxClients = MAX_CLIENTS_PER_ZONE;
  private userIds = new Map<string, string>(); // sessionId -> accountId
  private t = 0; // relógio da simulação (s)
  private repo!: Repo;
  private balance!: Balanceamento;
  private soltarBalance?: () => void;
  private market!: Market;
  private saver?: ReturnType<typeof setInterval>;
  private zone!: ZoneDef;

  onCreate(options: { repo: Repo; balance: Balanceamento }) {
    this.repo = options.repo;
    this.balance = options.balance;
    this.soltarBalance = this.balance.ouvir((mudou) => this.aplicarBalanceamento(mudou)); // ajuste do admin: vale já, nesta sala também
    liveRooms.add(this);
    const ttl = Number(process.env.MARKET_TTL_S); // só para testes (fora de produção): listagens que vencem em segundos
    this.market = new Market(options.repo.db, options.repo, Date.now, process.env.NODE_ENV !== "production" && ttl > 0 ? ttl * 1000 : undefined);
    // a zona vem do NOME da sala (definido no servidor), nunca de opções que o cliente mande
    const zid = ZONE_IDS.find((id) => zoneRoomName(id) === this.roomName) ?? 1;
    this.zone = ZONES[zid];
    this.setState(new ZoneState());
    this.state.zoneId = zid;
    // salva o progresso pendente a cada 30 s (além de ao sair e ao subir de nível)
    this.saver = setInterval(() => void this.saveAll(), 30_000);
    this.setPatchRate(1000 / TICK_RATE);

    expandSpawns(this.zone, mulGrupo).forEach((s, i) => {
      const e = new Enemy();
      e.kind = s.kind;
      e.x = e.sx = s.x;
      e.y = e.sy = s.y;
      e.level = s.level;
      e.maxHp = e.hp = enemyHp(s.level, s.kind);
      this.state.enemies.set(`e${i + 1}`, e);
    });

    const b = this.zone.boss; // o chefe da zona (um só): volta sozinho depois de respawnS; a cidade segura não tem
    if (b) {
      const boss = new Enemy();
      boss.kind = b.kind; boss.x = boss.sx = b.x; boss.y = boss.sy = b.y; boss.level = b.level;
      boss.maxHp = boss.hp = enemyHp(b.level, b.kind);
      boss.nextSlam = 6;
      if (process.env.BOSS_TEST === "1" && process.env.NODE_ENV !== "production") { // só nos testes: chefe de 1 de vida, num canto livre da zona 1
        boss.x = boss.sx = this.zone.w - 4; boss.y = boss.sy = 4;
        boss.maxHp = boss.hp = 1;
      }
      this.state.enemies.set("boss", boss);
    }

    // Cliente envia INTENÇÃO (alvo / ação), nunca posição nem dano. Servidor valida e simula.
    this.onMessage(Msg.MoveTo, (client, p: MoveToPayload) => {
      if (!this.allow(client)) return;
      const pl = this.state.players.get(client.sessionId);
      if (!pl || pl.dead || pl.traveling) return;
      if (p?.stop === true) { pl.tx = pl.x; pl.ty = pl.y; return; } // soltar o joystick: para onde ele está de fato, não onde o cliente achava que estava
      if (!Number.isFinite(p?.x) || !Number.isFinite(p?.y)) return;
      pl.tx = clamp(p.x, 0, this.zone.w - 1);
      pl.ty = clamp(p.y, 0, this.zone.h - 1);
    });

    // O cliente terminou de carregar e o jogador já controla o personagem: a bolha de chegada começa a contar agora (não durante o load).
    // Também solta qualquer destino/deslocamento preso, para o personagem nascer sempre móvel.
    this.onMessage(Msg.Ready, (client) => {
      const pl = this.state.players.get(client.sessionId);
      if (!pl || pl.traveling) return;
      pl.tx = pl.x; pl.ty = pl.y; pl.dashLeft = 0;
      if (pl.shieldPending) this.startShield(client.sessionId, pl);
    });

    // Travessia: basta pisar no portal (checado a cada tick); este pedido explícito passa pela MESMA validação de distância
    this.onMessage(Msg.Travel, (client, p: { to?: unknown }) => {
      if (!this.allow(client)) return void client.send(Evt.TravelDenied, {});
      const pl = this.state.players.get(client.sessionId);
      if (!pl || pl.dead || typeof p?.to !== "number") return void client.send(Evt.TravelDenied, {});
      if (pl.traveling) return; // já atravessando: a resposta Travel está a caminho
      if (this.zone.safe) { // cidade: o pedido vem do mapa-mundo do portão; vale qualquer zona de combate, mas só junto do portão
        const gate = this.zone.portals.find((q) => q.to === WORLD_GATE);
        const dest = ZONES[p.to as number];
        if (!gate || !dest || dest.safe) return void client.send(Evt.TravelDenied, {});
        if (dist(pl.x, pl.y, gate.x, gate.y) > gate.r + 0.5) { client.send(Evt.TravelDenied, {}); return this.notify(client.sessionId, "Você está longe demais do portão."); }
        return void this.travel(client.sessionId, pl, { to: dest.id });
      }
      const portal = this.zone.portals.find((q) => q.to === p.to);
      if (!portal || dist(pl.x, pl.y, portal.x, portal.y) > portal.r + 0.5) { client.send(Evt.TravelDenied, {}); return this.notify(client.sessionId, "Você está longe demais do portal."); }
      void this.travel(client.sessionId, pl, portal);
    });

    this.onMessage(Msg.Act, (client, p: ActPayload) => {
      if (!this.allow(client)) return;
      const pl = this.state.players.get(client.sessionId);
      if (!pl || pl.dead || pl.traveling) return;
      if (!ACTION_IDS.includes(p?.a) || !Number.isFinite(p?.ax) || !Number.isFinite(p?.ay)) return;
      // a mira é só uma direção: limita a valores sensatos (evita overflow em contas)
      this.doAction(client.sessionId, pl, p.a, clamp(p.ax, -100, 140), clamp(p.ay, -100, 140));
    });

    // Inventário: o cliente pede, o servidor valida e devolve a fotografia completa.
    this.onMessage(Msg.InvEquip, (client, p: { slot?: unknown }) => this.invOp(client, (pl) => equipFromSlot(pl.inv, p?.slot, pl.level, pl.cls as CharClass)));
    this.onMessage(Msg.InvUnequip, (client, p: { slot?: unknown }) => this.invOp(client, (pl) => unequip(pl.inv, p?.slot)));
    this.onMessage(Msg.InvSort, (client) => this.invOp(client, (pl) => { sortInventory(pl.inv); return { ok: true }; }));
    this.onMessage(Msg.Pickup, (client, p: { id?: unknown }) => {
      if (!this.allow(client)) return;
      const pl = this.state.players.get(client.sessionId);
      if (!pl || pl.dead || pl.traveling || typeof p?.id !== "string") return;
      const g = this.state.items.get(p.id);
      if (!g) return;
      if (dist(pl.x, pl.y, g.x, g.y) > PICKUP_REACH) return this.notify(client.sessionId, "Chegue mais perto do item.");
      if (!this.canPickup(client.sessionId, pl, g)) return this.notify(client.sessionId, `Reservado para outro jogador (${Math.ceil(g.unlockAt - this.t)}s).`);
      this.tryPickup(client.sessionId, pl, p.id, g);
    });
    this.onMessage(Msg.InvDrop, (client, p: { slot?: unknown }) => this.invOp(client, (pl) => this.dropToGround(client.sessionId, pl, p?.slot)));
    this.onMessage(Msg.InvBreak, (client, p: { slot?: unknown; confirm?: unknown }) => this.econOp(client, null, null, (pl) => {
      const r = breakSlot(pl.inv, p?.slot, p?.confirm);
      return r.ok ? { ok: true, msg: `${r.name} desmanchado: +${r.gain} Tostões.` } : r;
    }));
    // comerciante e ferreira: o servidor confere a distância até o NPC, o saldo e o espaço; o cliente só pede
    this.onMessage(Msg.ShopBuy, (client, p: { npc?: unknown; id?: unknown; qty?: unknown }) => this.econOp(client, p?.npc, "merchant", (pl) => {
      const r = buyItem(pl.inv, pl.cls as CharClass, p?.id, p?.qty);
      return r.ok ? { ok: true, msg: `Comprou ${ITEMS[p.id as string].name}${(p.qty as number) > 1 ? ` x${p.qty}` : ""} por ${r.cost} Tostões.` } : r;
    }));
    this.onMessage(Msg.ShopSell, (client, p: { npc?: unknown; slot?: unknown; qty?: unknown }) => this.econOp(client, p?.npc, "merchant", (pl) => {
      const r = sellSlot(pl.inv, p?.slot, p?.qty);
      return r.ok ? { ok: true, msg: `Vendeu ${r.name} por ${r.gain} Tostões.` } : r;
    }));
    this.onMessage(Msg.SmithMerge, (client, p: { npc?: unknown; slots?: unknown }) => this.econOp(client, p?.npc, "smith", (pl) => {
      const r = mergeItems(pl.inv, p?.slots, this.zone.id);
      if (!r.ok) return r;
      if (r.success) { client.send(Evt.Loot, { id: r.id, qty: 1 }); return { ok: true, msg: `A fusão deu certo: ${ITEMS[r.id].name}! (−${r.fee} Tostões)` }; }
      return { ok: true, msg: `A fusão falhou (${Math.round(r.chance * 100)}% de chance): ${ITEMS[r.lost!].name} se perdeu. (−${r.fee} Tostões)` };
    }));
    // craft na Ferreira (aba Craftar): o servidor confere NPC, nível, ingredientes, moedas e espaço; tudo ou nada
    this.onMessage(Msg.Craft, (client, p: { npc?: unknown; tipo?: unknown; familia?: unknown; peca?: unknown; raridade?: unknown }) => this.econOp(client, p?.npc, "smith", (pl) => craftItem(pl.inv, pl.cls as CharClass, pl.level, p)));
    // refino na Ferreira (aba Refinar): +1 por vez, custa Tostões e material; nunca quebra o item (ver game/refino.ts)
    this.onMessage(Msg.Refine, (client, p: { npc?: unknown; origem?: unknown; slot?: unknown }) => this.econOp(client, p?.npc, "smith", (pl) => refinarItem(pl.inv, p)));
    // desmontar na Ferreira (aba Desmontar, C3.5): equipamento da mochila vira materiais de craft; troca atômica (ver game/desmontar.ts)
    this.onMessage(Msg.Dismantle, (client, p: { npc?: unknown; slot?: unknown; confirm?: unknown }) => this.econOp(client, p?.npc, "smith", (pl) => desmontarItem(pl.inv, p)));
    // engaste na Ferreira (aba Engastar, C3.3): gema num espaço livre, paga em Óbolos; remover libera o espaço (gema perdida)
    this.onMessage(Msg.Socket, (client, p: { npc?: unknown; origem?: unknown; slot?: unknown; gema?: unknown }) => this.econOp(client, p?.npc, "smith", (pl) => engastarGema(pl.inv, p)));
    this.onMessage(Msg.Unsocket, (client, p: { npc?: unknown; origem?: unknown; slot?: unknown; idx?: unknown }) => this.econOp(client, p?.npc, "smith", (pl) => removerGema(pl.inv, p)));
    // troca entre jogadores (janela com confirmação dos dois lados)
    this.onMessage(Msg.TradeInvite, (client, p: { name?: unknown }) => this.tradeInvite(client, p?.name));
    this.onMessage(Msg.TradeAccept, (client) => this.tradeAccept(client));
    this.onMessage(Msg.TradeDecline, (client) => this.tradeDecline(client));
    this.onMessage(Msg.TradeOffer, (client, p: unknown) => this.tradeOffer(client, p));
    this.onMessage(Msg.TradeReady, (client, p: { ready?: unknown; rev?: unknown }) => this.tradeReady(client, p?.ready === true, p?.rev));
    this.onMessage(Msg.TradeCancel, (client) => { const tr = this.trades.get(client.sessionId); if (tr && this.allow(client)) this.closeTrade(tr, "Troca cancelada."); });
    // chat privado da troca: só entre os dois da troca ativa; nada é guardado
    this.onMessage(Msg.TradeChat, (client, p: { text?: unknown }) => {
      if (!this.allow(client)) return;
      const tr = this.trades.get(client.sessionId), pl = this.state.players.get(client.sessionId);
      if (!tr || !pl) return this.notify(client.sessionId, "Você não está numa troca.");
      const text = this.chatText(client, p?.text, TRADE_CHAT_MAX_LEN);
      if (!text) return;
      for (const id of [tr.a, tr.b]) this.clients.getById(id)?.send(Evt.TradeChat, { name: pl.name, text });
    });
    // mercado dos jogadores (leiloeiro)
    this.onMessage(Msg.MarketBrowse, (client, p: { npc?: unknown; filter?: unknown }) => this.marketRead(client, p?.npc, async (pl) => client.send(Evt.MarketPage, await this.market.browse(p?.filter, pl.charId))));
    this.onMessage(Msg.MarketMy, (client, p: { npc?: unknown }) => this.marketRead(client, p?.npc, (pl) => this.sendMarketMine(client.sessionId, pl)));
    this.onMessage(Msg.MarketPrices, (client, p: { npc?: unknown; itemId?: unknown; currency?: unknown }) => this.marketRead(client, p?.npc, async (pl) => { const r = await this.market.prices(p?.itemId, p?.currency, pl.charId); if (r) client.send(Evt.MarketPrices, r); }));
    this.onMessage(Msg.MarketList, (client, p: { npc?: unknown; slot?: unknown; qty?: unknown; price?: unknown; currency?: unknown }) => this.marketOp(client, p?.npc, "list", (pl) => this.market.list(pl, p?.slot, p?.qty, p?.price, p?.currency)));
    this.onMessage(Msg.MarketBuy, (client, p: { npc?: unknown; id?: unknown }) => this.marketOp(client, p?.npc, "buy", (pl) => this.market.buy(pl, p?.id)));
    this.onMessage(Msg.MarketCancel, (client, p: { npc?: unknown; id?: unknown }) => this.marketOp(client, p?.npc, "cancel", (pl) => this.market.cancel(pl, p?.id)));
    this.onMessage(Msg.MarketClaim, (client, p: { npc?: unknown; id?: unknown }) => this.marketOp(client, p?.npc, "claim", (pl) => (p?.id === "all" ? this.market.claimAll(pl) : this.market.claim(pl, p?.id))));
    // ping: devolve o mesmo carimbo de tempo para o cliente medir a ida e volta. Só ecoa números (nada é interpretado).
    this.onMessage(Msg.Ping, (client, p: { t?: unknown }) => {
      if (!this.allow(client)) return;
      if (typeof p?.t === "number" && Number.isFinite(p.t)) client.send(Evt.Pong, { t: p.t, online: onlineCount() });
    });
    // chat da zona: o servidor limpa o texto, limita a taxa e usa o NOME DO PERSONAGEM (o cliente não manda nome)
    this.onMessage(Msg.Chat, (client, p: { text?: unknown }) => {
      if (!this.allow(client)) return;
      // comandos de moderação (/silenciar, /banir, /desbanir, /denuncias) nunca vão ao chat
      if (typeof p?.text === "string" && parseComandoAdmin(p.text)) { void this.comandoAdmin(client, p.text); return; }
      const pl = this.state.players.get(client.sessionId);
      const text = pl && this.chatText(client, p?.text);
      if (pl && text) this.broadcast(Evt.Chat, { id: client.sessionId, name: pl.name, text });
    });
    // denúncia de jogador (menu do jogador): grava na tabela `denuncias`
    this.onMessage(Msg.Report, (client, p: { name?: unknown; motivo?: unknown }) => void this.denunciar(client, p));
    // chat do grupo (/g): mesmas regras de limite, taxa e sanitização; vai só aos membros, em qualquer zona
    this.onMessage(Msg.PartyChat, (client, p: { text?: unknown }) => {
      if (!this.allow(client)) return;
      const pl = this.state.players.get(client.sessionId);
      if (!pl || !pl.party) return this.notify(client.sessionId, "Você não está em um grupo.");
      const text = this.chatText(client, p?.text);
      if (text) parties.sendToParty(pl.charId, Evt.PartyChat, { name: pl.name, text });
    });
    // grupo: o cliente só PEDE (por nome de personagem); o servidor valida tudo em game/party.ts
    const partyOp = (type: string, op: (charId: string, name: unknown) => Result) =>
      this.onMessage(type, (client, p: { name?: unknown }) => {
        if (!this.allow(client)) return;
        const pl = this.state.players.get(client.sessionId);
        if (!pl || pl.traveling) return;
        const r = op(pl.charId, p?.name);
        if (!r.ok) this.notify(client.sessionId, r.error);
      });
    partyOp(Msg.PartyInvite, (id, name) => parties.invite(id, name));
    partyOp(Msg.PartyJoin, (id, name) => parties.requestJoin(id, name));
    partyOp(Msg.PartyKick, (id, name) => parties.kick(id, name));
    partyOp(Msg.PartyLead, (id, name) => parties.lead(id, name));
    partyOp(Msg.PartyAccept, (id) => parties.accept(id));
    partyOp(Msg.PartyDecline, (id) => parties.decline(id));
    partyOp(Msg.PartyLeave, (id) => parties.leave(id));
    this.onMessage(Msg.PartySync, (client) => {
      if (!this.allow(client)) return;
      const pl = this.state.players.get(client.sessionId);
      if (pl) parties.resync(pl.charId);
    });
    // PvP: { on: boolean }. Entrar/sair exige canalizar PVP_CHANNEL_S sem receber dano (o servidor conta e cancela)
    this.onMessage(Msg.Pvp, (client, p: { on?: unknown }) => {
      if (!this.allow(client)) return;
      const pl = this.state.players.get(client.sessionId);
      if (!pl || pl.dead || typeof p?.on !== "boolean") return;
      this.requestPvp(client.sessionId, pl, p.on);
    });
    // Clérigo: escolhe o Q (0 = cura em área, 1 = cura focada). Só fora de combate; o servidor decide.
    // auto-poção: o limiar (0..90, passo 5) é limitado aqui e gravado; 0 desliga. O cliente só pede.
    this.onMessage(Msg.AutoPot, (client, p: { at?: unknown }) => {
      if (!this.allow(client)) return;
      const pl = this.state.players.get(client.sessionId);
      if (!pl || typeof p?.at !== "number") return;
      const at = clampAutoPot(p.at);
      if (pl.autoPotAt === at) return;
      pl.autoPotAt = at;
      if (pl.charId) this.repo.setAutoPot(pl.charId, at).catch((e) => console.error("[db] falha ao gravar a auto-poção:", (e as Error).message));
    });
    // variações de habilidade (C2.2): só na cidade; o servidor confere nível, classe e slot, grava e sincroniza
    this.onMessage(Msg.Variacao, (client, p: { slot?: unknown; id?: unknown }) => {
      if (!this.allow(client)) return;
      const pl = this.state.players.get(client.sessionId);
      if (pl) this.escolherVariacao(client.sessionId, pl, p);
    });
    // talentos (C2.3): gastar é livre; o servidor confere pontos, máximo e porta do ramo. Reset só na cidade (ver resetarTalentos).
    this.onMessage(Msg.Talento, (client, p: { id?: unknown }) => {
      if (!this.allow(client)) return;
      const pl = this.state.players.get(client.sessionId);
      if (pl) this.escolherTalento(client.sessionId, pl, p);
    });
    this.onMessage(Msg.TalentoResetar, (client) => {
      if (!this.allow(client)) return;
      this.resetarTalentos(client);
    });
    // builds (C2.4): salvar e aplicar só na cidade e fora de combate (o servidor recusa com o motivo); renomear vale em qualquer lugar
    this.onMessage(Msg.LoadoutSalvar, (client, p: { slot?: unknown }) => {
      if (!this.allow(client)) return;
      const pl = this.state.players.get(client.sessionId);
      if (pl) this.salvarLoadout(client.sessionId, pl, p);
    });
    this.onMessage(Msg.LoadoutAplicar, (client, p: { slot?: unknown }) => {
      if (!this.allow(client)) return;
      const pl = this.state.players.get(client.sessionId);
      if (pl) this.aplicarLoadout(client.sessionId, pl, p);
    });
    this.onMessage(Msg.LoadoutNome, (client, p: { slot?: unknown; nome?: unknown }) => {
      if (!this.allow(client)) return;
      const pl = this.state.players.get(client.sessionId);
      if (pl) this.renomearLoadout(pl, p);
    });
    // equipamento do build (C3.6): mesma regra de cidade e sem combate recente; o conjunto vestido vai para o slot e volta com um clique
    this.onMessage(Msg.LoadoutEquipSalvar, (client, p: { slot?: unknown }) => {
      if (!this.allow(client)) return;
      const pl = this.state.players.get(client.sessionId);
      if (pl) this.salvarEquipLoadout(client.sessionId, pl, p);
    });
    this.onMessage(Msg.LoadoutEquipAplicar, (client, p: { slot?: unknown }) => {
      if (!this.allow(client)) return;
      const pl = this.state.players.get(client.sessionId);
      if (pl) this.aplicarEquipLoadout(client.sessionId, pl, p);
    });
    this.onMessage(Msg.QMode, (client, p: { mode?: unknown }) => {
      if (!this.allow(client)) return;
      const pl = this.state.players.get(client.sessionId);
      if (!pl || pl.dead || pl.traveling || (p?.mode !== 0 && p?.mode !== 1)) return;
      if (pl.cls !== "cleric") return this.notify(client.sessionId, "Só o Clérigo escolhe o tipo de Q.");
      if (pl.qMode === p.mode) return;
      const wait = QMODE_SWAP_S - (this.t - pl.combatAt);
      if (wait > 0) return this.notify(client.sessionId, `Troque o Q fora de combate (${Math.ceil(wait)}s).`);
      pl.qMode = p.mode;
      this.notifyOk(client.sessionId, p.mode === 1 ? "Q: Cura Focada (um aliado, mais forte)" : "Q: Cura em Área (todos em volta, mais fraca)");
    });
    // quests (C1.1): o servidor decide tudo; o cliente só pede
    this.onMessage(Msg.QuestAccept, (client, p: { id?: unknown }) => { if (this.allow(client)) this.questAceitar(client.sessionId, p?.id); });
    this.onMessage(Msg.QuestDeliver, (client, p: { id?: unknown }) => { if (this.allow(client)) this.questEntregar(client.sessionId, p?.id); });
    this.onMessage(Msg.QuestTalk, (client, p: { npc?: unknown }) => { if (this.allow(client)) this.questFalar(client.sessionId, p?.npc); });
    // dicas contextuais (C1.6): o servidor só grava ids da lista fixa do shared; cada dica fica uma vez por personagem
    this.onMessage(Msg.DicaVista, (client, p: { id?: unknown }) => { if (this.allow(client)) this.dicaVista(client.sessionId, p?.id); });
    this.onMessage(Msg.DicasSync, (client) => { void this.sendDicas(client.sessionId); });
    this.onMessage(Msg.QuestSync, (client) => {
      const pl = this.state.players.get(client.sessionId);
      if (!pl) return;
      this.sendQuests(client.sessionId, pl);
      client.send(Evt.QuestDefs, { defs: [...DEFS.values()] } satisfies QuestDefsEvent);
    });
    if (process.env.QUEST_TEST === "1" && process.env.NODE_ENV !== "production") {
      // só nos testes automatizados (QUEST_TEST=1, nunca em produção): simula abates de um tipo numa zona, para testar a progressão sem combate longo
      this.onMessage("quest_teste_abate", (client, p: { kind?: unknown; zona?: unknown }) => {
        const pl = this.state.players.get(client.sessionId);
        if (pl && typeof p?.kind === "string" && typeof p?.zona === "number") this.questAbate(client.sessionId, pl, p.kind, p.zona);
      });
    }
    this.onMessage(Msg.InvSync, (client) => {
      if (!this.allow(client)) return;
      const p = this.state.players.get(client.sessionId);
      if (p) this.sendInv(client.sessionId, p);
    });
    this.onMessage(Msg.InvUse, (client, p: { slot?: unknown }) => this.invOp(client, (pl) => this.usePotion(client.sessionId, pl, p?.slot)));

    // Baú da cidade: o servidor confere a distância a CADA pedido, valida os espaços e grava bolsa+baú numa transação só
    this.onMessage(Msg.VaultOpen, (client) => void this.vaultOp(client, () => ({ ok: true })));
    this.onMessage(Msg.VaultDeposit, (client, p: { slot?: unknown; qty?: unknown; to?: unknown }) => void this.vaultOp(client, (pl, v) => deposit(pl.inv, v, p?.slot, p?.qty, p?.to ?? undefined)));
    this.onMessage(Msg.VaultWithdraw, (client, p: { slot?: unknown; qty?: unknown; to?: unknown }) => void this.vaultOp(client, (pl, v) => withdraw(pl.inv, v, p?.slot, p?.qty, p?.to ?? undefined)));
    this.onMessage(Msg.VaultMove, (client, p: { from?: unknown; to?: unknown }) => void this.vaultOp(client, (_pl, v) => moveInVault(v, p?.from, p?.to)));
    this.onMessage(Msg.VaultCoins, (client, p: { coin?: unknown; amount?: unknown; dir?: unknown }) => void this.vaultOp(client, (pl, v) => moveCoins(pl.inv, v, p?.coin, p?.amount, p?.dir)));

    this.setSimulationInterval((dtMs) => this.tick(dtMs / 1000), 1000 / TICK_RATE);
  }

  // ------------------------------------------------------------------ travessia entre zonas
  /** Aprova a travessia: congela o jogador, grava progresso E a nova zona no banco e só então avisa o cliente (que entra na sala nova). */
  // ------------------------------------------------------------------ baú da cidade
  /** Operação no baú pessoal: abre/lê do banco na 1ª vez, valida distância e estado, aplica, grava (bolsa+baú juntos) e devolve as fotografias. */
  private async vaultOp(client: Client, op: (p: Player, v: Vault) => { ok: true } | { ok: false; error: string }) {
    if (!this.allow(client)) return;
    if (this.gmTravado(client.sessionId)) return;
    const p = this.state.players.get(client.sessionId);
    const at = this.zone.vault;
    if (!p || p.dead || p.traveling || p.vaultBusy) return;
    if (!at || dist(p.x, p.y, at.x, at.y) > VAULT_REACH) return this.notify(client.sessionId, "Chegue mais perto do baú.");
    if (p.trading) return this.notify(client.sessionId, "Termine ou cancele a troca primeiro.");
    p.vaultBusy = true; // uma operação por vez por jogador (a carga do banco é assíncrona)
    try {
      if (!p.vault) p.vault = await this.repo.loadVault(p.charId);
      if (!this.state.players.has(client.sessionId) || p.dead || p.traveling) return;
      const r = op(p, p.vault);
      if (!r.ok) this.notify(client.sessionId, r.error);
      else {
        p.invDirty = p.vaultDirty = true;
        this.refreshStats(p);
        void this.save(p); // grava bolsa e baú na mesma transação (na fila do jogador)
        this.sendInv(client.sessionId, p);
      }
      client.send(Evt.Vault, vaultSnapshot(p.vault));
    } catch (e) {
      console.error("[baú] falha:", (e as Error).message);
      this.notify(client.sessionId, "O baú não respondeu. Tente de novo.");
    } finally {
      p.vaultBusy = false;
    }
  }

  /** Ponto de nascimento. Só nos testes (TEST_START_ZONE, fora de produção) os bots antigos (sem `load: true`) nascem nas Cinzas no ponto de antes da clareira segura, (20, 20),
   *  de onde as suítes de combate andam até os esqueletos e1..e3 com tempos fixos; o cliente de verdade e os testes de chegada usam sempre o `spawn` real da zona. */
  private spawnPoint(bot: boolean): { x: number; y: number } {
    if (bot && this.zone.id === 1 && process.env.TEST_START_ZONE && process.env.NODE_ENV !== "production") return { x: 20, y: 20 };
    return this.zone.spawn;
  }

  /** começa a contar a bolha de chegada (o dono é avisado para mostrar o tempo restante) */
  private startShield(id: string, p: Player, s = ARRIVAL_SHIELD_S) {
    p.shield = true;
    p.shieldPending = false;
    p.shieldUntil = this.t + s;
    this.clients.getById(id)?.send(Evt.Shield, { ms: s * 1000 });
  }

  /** a bolha estoura na hora: o jogador agiu (atacou, usou habilidade, causou dano) */
  private breakShield(p: Player) {
    if (!p.shield) return;
    p.shield = false;
    p.shieldPending = false;
    p.shieldUntil = 0;
  }

  private async travel(id: string, p: Player, portal: Pick<PortalDef, "to">, fromDeath = false) {
    if (p.traveling || !ZONES[portal.to]) return;
    if (!fromDeath) { // em combate não se atravessa nem se usa o portão (a morte leva à cidade normalmente)
      const wait = TRAVEL_COMBAT_LOCK_S - (this.t - p.combatAt);
      if (wait > 0) {
        if (this.t - p.travelNoteAt > 2) { p.travelNoteAt = this.t; this.notify(id, `Em combate: espere ${Math.ceil(wait)}s para atravessar.`); this.clients.getById(id)?.send(Evt.TravelDenied, {}); }
        return;
      }
    }
    p.traveling = true;
    p.tx = p.x;
    p.ty = p.y;
    p.invulnUntil = this.t + 30;
    this.interruptPvp(id, p);
    try {
      await this.save(p);
      await this.repo.setZone(p.charId, portal.to);
    } catch (e) {
      console.error("[zona] falha ao gravar a travessia:", (e as Error).message);
      p.traveling = false; // não atravessa sem gravar: tenta de novo quando pisar no portal outra vez
      p.invulnUntil = 0;
      if (fromDeath) p.deadUntil = this.t + 2; // morto: tenta de novo em 2 s
      this.clients.getById(id)?.send(Evt.TravelDenied, {}); // o cliente tira a tela de load
      return this.notify(id, "A passagem falhou. Tente de novo.");
    }
    arrivals.set(p.charId, fromDeath ? 0 : this.zone.id); // 0 = sem portal de origem: nasce no ponto de nascimento da cidade
    this.clients.getById(id)?.send(Evt.Travel, { zone: portal.to });
    setTimeout(() => this.clients.getById(id)?.leave(4010), 3000); // se o cliente não sair sozinho, o servidor o solta
  }

  // ------------------------------------------------------------------ PvP
  private pvpEvt(id: string, s: "start" | "cancel" | "stop" | "on" | "off", why?: "move" | "act" | "damage") {
    this.clients.getById(id)?.send(Evt.Pvp, { s, why });
  }

  /** parado de verdade: sem destino pendente e sem deslocamento (avanço/esquiva) em curso */
  private standingStill(p: Player) {
    return p.dashLeft <= 0 && Math.hypot(p.tx - p.x, p.ty - p.y) < 0.05;
  }

  /** liga/desliga o modo. Já estar no estado pedido não faz nada; pedir o contrário no meio da canalização a cancela. */
  private requestPvp(id: string, p: Player, on: boolean) {
    // o PvP agora vale SÓ na Arena Sangrenta (zona com `pvp`), e lá ele já está ligado o tempo todo: o pedido manual não existe mais
    if (this.zone.safe) return this.notify(id, "A cidade é um lugar de paz: o PvP não existe aqui.");
    if (!p.pvp || !this.zone.pvp) return this.notify(id, "O PvP só existe na Arena Sangrenta.");
    if (!on) this.notify(id, "Na arena o PvP vale o tempo todo: não há como sair dele.");
  }

  /** dano, movimento ou ação interrompem a canalização na hora (`why` diz o motivo ao jogador) */
  private interruptPvp(id: string, p: Player, why?: "move" | "act" | "damage") {
    if (p.pvpChan === 0) return;
    p.pvpChan = 0;
    this.pvpEvt(id, "cancel", why);
  }

  private updatePvp(id: string, p: Player) {
    if (p.pvpChan !== 0 && !this.standingStill(p)) return this.interruptPvp(id, p, "move");
    if (p.pvpChan === 0 || this.t < p.pvpChanUntil) return;
    p.pvp = p.pvpChan === 1;
    p.pvpChan = 0;
    this.pvpEvt(id, p.pvp ? "on" : "off");
  }

  /** dano de jogador em jogador: só se AMBOS estão em PvP (quem não está nunca é alvo) */
  private canPvpHit(by: string, o: Player, oid: string): boolean {
    if (!this.zone.pvp || oid === by || o.dead || !o.pvp || o.shield || this.t < o.invulnUntil || o.gmInvuln || (o.gm && o.gmInvis)) return false; // PvP só na arena (Modo Deus: invisível ou invulnerável não é alvo)
    const a = this.state.players.get(by);
    if (!a || a.dead || !a.pvp) return false;
    return !(a.party && a.party === o.party); // membros do mesmo grupo nunca se ferem
  }

  /** inimigo de quem agiu no PvP (os dois em PvP e de grupos diferentes): curas, bônus e área de apoio só valem para aliados */
  private hostile(byId: string, by: Player, oid: string, o: Player): boolean {
    if (oid === byId || !by.pvp || !o.pvp) return false;
    return !(by.party && by.party === o.party);
  }

  /** controle de jogador (PvP), com as mesmas regras dos inimigos: atordoa (não age nem anda), enraíza e puxa. Cancela a canalização de quem é afetado. */
  private stunPlayer(oid: string, o: Player, s: number) {
    if (o.dead) return;
    o.stunUntil = Math.max(o.stunUntil, this.t + s);
    o.dashLeft = 0; // corta a esquiva ou investida no meio
    this.interruptPvp(oid, o, "damage");
  }

  private rootPlayer(oid: string, o: Player, s: number) {
    if (o.dead) return;
    o.rootUntil = Math.max(o.rootUntil, this.t + s);
    this.interruptPvp(oid, o, "damage");
  }

  private hitPlayers(by: string, baseDmg: number, inArea: (o: Player) => boolean, cc?: { stunS?: number; rootS?: number }) {
    this.state.players.forEach((o, oid) => {
      if (!this.canPvpHit(by, o, oid) || !inArea(o)) return;
      this.damagePvp(by, oid, o, baseDmg);
      if (cc?.stunS) this.stunPlayer(oid, o, cc.stunS);
      if (cc?.rootS) this.rootPlayer(oid, o, cc.rootS);
    });
  }

  /** chance de crítico de quem atacou: base + equipamento + kit da arma */
  private critChance(by: string): number {
    const g = this.state.players.get(by)?.gear;
    return CRIT.chance + (g ? g.crit + (g.kit.crit ?? 0) : 0) / 100;
  }

  private damagePvp(by: string, oid: string, o: Player, baseDmg: number) {
    const fixo = danoFixo();
    const crit = !fixo && Math.random() < this.critChance(by);
    const variance = fixo ? 1 : 1 + (Math.random() * 2 - 1) * DAMAGE_VARIANCE;
    this.damagePlayer(oid, o, Math.max(1, baseDmg * variance * (crit ? CRIT.mult : 1)), by, crit);
  }

  /** valida, limpa e aplica a taxa do chat (zona e grupo dividem o mesmo limite); "" = descartar */
  private chatText(client: Client, raw: unknown, max = CHAT_MAX_LEN): string {
    if (typeof raw !== "string") return "";
    const ate = silenciadoAte(this.userIds.get(client.sessionId));
    if (ate && ate > Date.now()) { this.notify(client.sessionId, `Você está silenciado até ${horaLegivel(ate)}.`); return ""; }
    if (raw.length > max) { this.notify(client.sessionId, `Mensagem longa demais (máx. ${max} caracteres).`); return ""; }
    const text = cleanChat(raw);
    if (!text) return "";
    const now = Date.now();
    const recent = (this.chatAt.get(client.sessionId) ?? []).filter((t) => now - t < ZoneRoom.CHAT_WINDOW_MS);
    if (recent.length >= ZoneRoom.CHAT_MAX_IN_WINDOW) {
      this.chatAt.set(client.sessionId, recent);
      this.notify(client.sessionId, "Calma! Você está falando rápido demais.");
      return "";
    }
    recent.push(now);
    this.chatAt.set(client.sessionId, recent);
    return text;
  }

  // ------------------------------------------------------------------ moderação (C0.6)
  /** aviso para a conta, se ela estiver online em alguma zona */
  private avisarConta(contaId: string, text: string) {
    const s = active.get(contaId);
    if (s) s.room.notify(s.sid, text);
  }

  /** comandos de admin (já reconhecidos como comando): só para contas em ADMIN_ACCOUNT_IDS */
  private async comandoAdmin(client: Client, texto: string) {
    const cmd = parseComandoAdmin(texto) as ComandoAdmin;
    if (!isAdmin(this.userIds.get(client.sessionId))) return this.notify(client.sessionId, "Comando reservado a administradores.");
    try {
      if (cmd.tipo === "uso") return this.notify(client.sessionId, cmd.texto);
      if (cmd.tipo === "denuncias") {
        const lista = await this.repo.denunciasAbertas();
        if (!lista.length) return this.notify(client.sessionId, "Nenhuma denúncia aberta.");
        for (const d of lista) this.notify(client.sessionId, `Denúncia #${d.id} contra ${d.nome}: ${d.motivo}`);
        return;
      }
      const alvo = await this.repo.findCharacterByName(cmd.nome);
      if (!alvo) return this.notify(client.sessionId, `Jogador "${cmd.nome}" não encontrado.`);
      if (cmd.tipo === "silenciar") {
        const ate = Date.now() + cmd.minutos * 60_000;
        await this.repo.setSilencio(alvo.account_id, ate, cmd.motivo);
        guardarSancao(alvo.account_id, { ...sancaoEmCache(alvo.account_id), silenciadoAte: ate });
        void registrarEvento(this.repo.db, "silenciado", { contaId: alvo.account_id, personagemId: alvo.id, dados: { minutos: cmd.minutos } });
        this.avisarConta(alvo.account_id, `Você foi silenciado até ${horaLegivel(ate)}${cmd.motivo ? `: ${cmd.motivo}` : ""}.`);
        return this.notify(client.sessionId, `${alvo.name} silenciado por ${cmd.minutos} min.`);
      }
      if (cmd.tipo === "banir") {
        await this.repo.setBanido(alvo.account_id, true, cmd.motivo);
        guardarSancao(alvo.account_id, { ...sancaoEmCache(alvo.account_id), banido: true });
        void registrarEvento(this.repo.db, "banido", { contaId: alvo.account_id, personagemId: alvo.id });
        const s = active.get(alvo.account_id); // derruba a sessão atual, se estiver online
        s?.room.clients.getById(s.sid)?.leave(4003);
        return this.notify(client.sessionId, `${alvo.name} banido.`);
      }
      // desbanir
      await this.repo.setBanido(alvo.account_id, false, "");
      guardarSancao(alvo.account_id, { ...sancaoEmCache(alvo.account_id), banido: false });
      return this.notify(client.sessionId, `${alvo.name} desbanido.`);
    } catch (e) {
      console.error("[moderacao] comando:", (e as Error).message);
      this.notify(client.sessionId, "Erro ao executar o comando.");
    }
  }

  /** denúncia: valida; 1 por minuto por conta (checagem e marca síncronas, sem corrida); grava na tabela */
  private async denunciar(client: Client, p: { name?: unknown; motivo?: unknown }) {
    if (!this.allow(client)) return;
    const pl = this.state.players.get(client.sessionId);
    const uid = this.userIds.get(client.sessionId);
    if (!pl || !uid) return;
    const nome = typeof p?.name === "string" ? p.name.trim().slice(0, 40) : "";
    const motivo = typeof p?.motivo === "string" ? cleanChat(p.motivo).slice(0, MOTIVO_MAX).trim() : "";
    if (!nome || !motivo) return this.notify(client.sessionId, "Escreva o motivo da denúncia (até 200 caracteres).");
    try {
      const alvo = await this.repo.findCharacterByName(nome);
      if (!alvo) return this.notify(client.sessionId, "Jogador não encontrado.");
      if (alvo.id === pl.charId || alvo.account_id === uid) return; // denunciar a si mesmo é ignorado (nem conta no limite)
      // checagem e marca no mesmo passo síncrono: duas denúncias seguidas não passam juntas
      const agora = Date.now();
      if (agora - (ultimaDenuncia.get(uid) ?? -Infinity) < 60_000) return this.notify(client.sessionId, "Aguarde 1 minuto entre denúncias.");
      ultimaDenuncia.set(uid, agora);
      const id = await this.repo.addDenuncia(uid, alvo.id, alvo.name, motivo);
      void registrarEvento(this.repo.db, "denuncia", { contaId: uid, personagemId: alvo.id, dados: { denuncia: id } });
      this.notify(client.sessionId, "Denúncia registrada. Obrigado.");
    } catch (e) {
      console.error("[moderacao] denúncia:", (e as Error).message);
      this.notify(client.sessionId, "Erro ao registrar a denúncia.");
    }
  }

  // ------------------------------------------------------------------ inventário
  private notify(id: string, text: string) {
    this.clients.getById(id)?.send(Evt.Notice, { text });
  }

  private sendInv(id: string, p: Player) {
    this.questsDaMochila(id, p); // objetivos "coletar" acompanham a mochila (também é o caminho de todo item novo)
    this.clients.getById(id)?.send(Evt.Inv, snapshot(p.inv));
  }

  /** vida máxima e dano dependem do nível E do equipamento */
  private refreshStats(p: Player, fill = false) {
    // talentos (C2.3) somam aos bônus do equipamento: vida, dano, recurso, recarga, cura, redução e crítico
    // conjuntos (C3.4) somam por último: 2 ou 4 peças do mesmo conjunto equipadas agora (tirar uma desliga)
    p.gear = aplicarSets(aplicarTalentos(bonuses(p.inv, this.classOf(p).id), limparTalentos(p.talentos, this.classOf(p).id, p.level), this.classOf(p).id), p.inv.equip, this.classOf(p).id);
    const wId = p.inv.equip.weapon;
    p.weaponRarity = (wId ? ITEMS[wId]?.rarity : undefined) ?? "";
    p.maxHp = maxHpFor(this.classOf(p).id, p.level, p.gear.hp);
    p.hp = fill ? p.maxHp : Math.min(p.hp, p.maxHp);
    p.maxMana = maxManaFor(this.classOf(p).id, p.level) + p.gear.mana;
    p.manaF = fill ? p.maxMana : Math.min(p.manaF, p.maxMana);
    p.mana = Math.floor(p.manaF);
    p.poder = poderTotal(statsDoPersonagem(this.classOf(p).id, p.level, p.gear)); // poder total: o servidor decide; o cliente só mostra
  }

  private notifyOk(id: string, text: string) {
    this.clients.getById(id)?.send(Evt.Notice, { text, ok: true });
  }

  /** NPC da zona (comerciante/ferreira) ao alcance do jogador, ou null. A distância é do SERVIDOR: o cliente não escolhe onde está. */
  private npcNear(p: Player, id: unknown, kind: NpcKind) {
    const n = typeof id === "string" ? zoneNpcs(this.zone.id).find((q) => q.id === id && q.kind === kind) : undefined;
    return n && dist(p.x, p.y, n.x, n.y) <= NPC_REACH ? n : null;
  }

  // ------------------------------------------------------------------ mercado
  private marketActor(p: Player) { return { charId: p.charId, name: p.name, inv: p.inv }; }

  /** consultas do mercado: só pedem proximidade do leiloeiro e limite de taxa (não mudam nada) */
  private marketRead(client: Client, npcId: unknown, fn: (p: Player) => unknown) {
    if (!this.allow(client)) return;
    const p = this.state.players.get(client.sessionId);
    if (!p || p.dead || p.traveling || !p.charId) return;
    if (!this.npcNear(p, npcId, "auctioneer")) return this.notify(client.sessionId, "Chegue mais perto do leiloeiro.");
    Promise.resolve(fn(p)).catch((e) => console.error("[mercado] consulta falhou:", (e as Error).message));
  }

  private async sendMarketMine(sid: string, p: Player) {
    const listings = await this.market.mine(p.charId);
    this.clients.getById(sid)?.send(Evt.MarketMine, { listings, open: listings.length, max: MARKET_MAX_OPEN } satisfies MarketMineEvent);
  }

  /**
   * Operação do mercado que mexe na mochila: roda na FILA DE SALVAMENTO do jogador (nada grava por cima) e com a mochila travada
   * para os outros caminhos enquanto o banco decide. O resultado volta por Evt.MarketDone, mais a mochila e as minhas listagens.
   */
  private marketOp(client: Client, npcId: unknown, kind: MarketDoneEvent["kind"], op: (a: { charId: string; name: string; inv: Player["inv"] }) => Promise<{ ok: true; msg: string } | { ok: false; error: string }>) {
    if (!this.allow(client)) return;
    if (this.gmTravado(client.sessionId)) return;
    const sid = client.sessionId;
    const p = this.state.players.get(sid);
    if (!p || p.dead || p.traveling || !p.charId) return;
    if (p.trading) return this.notify(sid, "Termine ou cancele a troca primeiro.");
    if (p.marketBusy) return this.notify(sid, "Aguarde a operação anterior do mercado.");
    if (!this.npcNear(p, npcId, "auctioneer")) return this.notify(sid, "Chegue mais perto do leiloeiro.");
    p.marketBusy = true;
    const res = p.saveChain.then(async () => {
      if (!this.state.players.has(sid)) return; // saiu no meio: a operação não começa (nada mudou)
      const r = await op(this.marketActor(p));
      p.invDirty = true;
      this.refreshStats(p);
      this.sendInv(sid, p);
      const c = this.clients.getById(sid);
      c?.send(Evt.MarketDone, { ok: r.ok, text: r.ok ? r.msg : r.error, kind } satisfies MarketDoneEvent);
      await this.sendMarketMine(sid, p);
    }).catch((e) => console.error("[mercado] operação falhou:", (e as Error).message)).finally(() => { p.marketBusy = false; });
    p.saveChain = res;
  }

  /** Operação de economia: valida taxa, vida, viagem, troca em andamento e (se houver NPC) a distância; depois grava e devolve a fotografia. */
  private econOp(client: Client, npcId: unknown, kind: NpcKind | null, op: (p: Player) => { ok: true; msg: string } | { ok: false; error: string }) {
    if (!this.allow(client)) return;
    const p = this.state.players.get(client.sessionId);
    if (!p || p.dead || p.traveling) return;
    if (p.trading) return this.notify(client.sessionId, "Termine ou cancele a troca primeiro.");
    if (p.marketBusy) return this.notify(client.sessionId, "Aguarde a operação do mercado.");
    if (kind && !this.npcNear(p, npcId, kind)) return this.notify(client.sessionId, "Chegue mais perto do NPC.");
    const r = op(p);
    if (!r.ok) return this.notify(client.sessionId, r.error);
    p.invDirty = true;
    this.refreshStats(p);
    this.sendInv(client.sessionId, p);
    this.notifyOk(client.sessionId, r.msg);
  }

  /** Solta o item do espaço no chão, à frente do jogador: qualquer um pode pegar; quem soltou só o pega sozinho de novo depois de alguns segundos. */
  private dropToGround(sid: string, p: Player, slot: unknown): { ok: true } | { ok: false; error: string } {
    if (!validSlot(slot)) return { ok: false, error: "Espaço inválido." };
    const st = p.inv.slots[slot];
    if (!st) return { ok: false, error: "Espaço vazio." };
    const travado = bloqueioGm(st);
    if (travado) return { ok: false, error: travado };
    if (this.t < p.dropAt + 0.3) return { ok: false, error: "Calma! Solte um item por vez." };
    const item = { id: st.id, qty: st.qty };
    dropSlot(p.inv, slot);
    p.dropAt = this.t;
    const x = clamp(p.x + Math.cos(p.face) * 1.3, 0, this.zone.w - 1), y = clamp(p.y + Math.sin(p.face) * 1.3, 0, this.zone.h - 1);
    for (const g of this.spawnGround([item], x, y, "", 0)) { g.noAutoSid = sid; g.noAutoUntil = this.t + 4; }
    return { ok: true };
  }

  // ------------------------------------------------------------------ troca entre jogadores
  private trades = new Map<string, Trade>(); // sessão -> troca (as duas pontas apontam para a mesma)
  private tradeInvites = new Map<string, { from: string; until: number }>(); // sessão convidada -> convite pendente

  private side(tr: Trade, id: string, mine: boolean): TradeOfferSide {
    const o = tr.offer[id] ?? emptyOffer();
    return { items: o.items.map((i) => (mine ? { id: i.id, qty: i.qty, slot: i.slot } : { id: i.id, qty: i.qty })), iron: o.iron, obols: o.obols, ready: !!tr.ready[id], ...(mine ? { seq: tr.seq[id] ?? 0 } : {}) };
  }

  private sendTrade(tr: Trade) {
    for (const [me, other] of [[tr.a, tr.b], [tr.b, tr.a]] as const) {
      const ev: TradeEvent = { open: true, with: this.state.players.get(other)?.name ?? "", mine: this.side(tr, me, true), theirs: this.side(tr, other, false), rev: tr.rev };
      this.clients.getById(me)?.send(Evt.Trade, ev);
    }
  }

  private closeTrade(tr: Trade, reason: string, done = false) {
    for (const id of [tr.a, tr.b]) {
      this.trades.delete(id);
      const p = this.state.players.get(id);
      if (p) p.trading = false;
      this.clients.getById(id)?.send(Evt.Trade, { open: false, reason, done } satisfies TradeEvent);
    }
  }

  private tradeBusy(id: string) { return this.trades.has(id) || this.tradeInvites.has(id); }

  private tradeInvite(client: Client, rawName: unknown) {
    if (!this.allow(client)) return;
    const me = this.state.players.get(client.sessionId);
    if (!me || me.dead || me.traveling || typeof rawName !== "string") return;
    if (me.marketBusy) return this.notify(client.sessionId, "Aguarde a operação do mercado.");
    if (this.gmTravado(client.sessionId)) return;
    if (this.trades.has(client.sessionId)) return this.notify(client.sessionId, "Você já está numa troca.");
    const want = rawName.normalize("NFC").trim().toLowerCase();
    let tid = "", target: Player | undefined;
    this.state.players.forEach((o, oid) => { if (o.name.toLowerCase() === want) { tid = oid; target = o; } });
    if (!target || tid === client.sessionId) return this.notify(client.sessionId, "Jogador não encontrado nesta zona.");
    if ((target.gm || target.gmUsado) && travasAtivas()) return this.notify(client.sessionId, `${target.name} usou o Modo Deus e não negocia.`);
    if (target.dead || target.traveling || this.tradeBusy(tid)) return this.notify(client.sessionId, `${target.name} está ocupado.`);
    if (dist(me.x, me.y, target.x, target.y) > TRADE_RANGE) return this.notify(client.sessionId, "Chegue mais perto para trocar.");
    this.tradeInvites.set(tid, { from: client.sessionId, until: this.t + TRADE_INVITE_S });
    this.clients.getById(tid)?.send(Evt.TradeInvite, { from: me.name });
    this.notifyOk(client.sessionId, `Convite de troca enviado a ${target.name}.`);
  }

  private tradeAccept(client: Client) {
    if (!this.allow(client)) return;
    if (this.gmTravado(client.sessionId)) return;
    const inv = this.tradeInvites.get(client.sessionId);
    if (!inv) return;
    this.tradeInvites.delete(client.sessionId);
    client.send(Evt.TradeInviteEnd, {});
    const a = this.state.players.get(inv.from), b = this.state.players.get(client.sessionId);
    if (!a || !b || a.dead || b.dead || a.traveling || b.traveling || a.marketBusy || b.marketBusy || this.trades.has(inv.from) || this.trades.has(client.sessionId)) return this.notify(client.sessionId, "A troca não está mais disponível.");
    if (dist(a.x, a.y, b.x, b.y) > TRADE_RANGE) return this.notify(client.sessionId, "Longe demais para trocar.");
    const tr: Trade = { a: inv.from, b: client.sessionId, offer: { [inv.from]: emptyOffer(), [client.sessionId]: emptyOffer() }, ready: {}, rev: 1, seq: {} };
    this.trades.set(tr.a, tr);
    this.trades.set(tr.b, tr);
    a.trading = b.trading = true;
    this.sendTrade(tr);
  }

  private tradeDecline(client: Client) {
    if (!this.allow(client)) return;
    const inv = this.tradeInvites.get(client.sessionId);
    if (!inv) return;
    this.tradeInvites.delete(client.sessionId);
    client.send(Evt.TradeInviteEnd, {});
    this.notify(inv.from, `${this.state.players.get(client.sessionId)?.name ?? "O jogador"} recusou a troca.`);
  }

  private tradeOffer(client: Client, raw: unknown) {
    if (!this.allow(client)) return;
    if (this.gmTravado(client.sessionId)) return;
    const tr = this.trades.get(client.sessionId), p = this.state.players.get(client.sessionId);
    if (!tr || !p) return;
    const seq = (raw as { seq?: unknown } | null)?.seq;
    if (typeof seq === "number" && Number.isInteger(seq) && seq > (tr.seq[client.sessionId] ?? 0)) tr.seq[client.sessionId] = seq;
    const r = parseOffer(p.inv, raw);
    if (!r.ok) { this.notify(client.sessionId, r.error); return this.sendTrade(tr); } // devolve o estado: o cliente volta à oferta real
    if (!sameOffer(tr.offer[client.sessionId], r.offer)) {
      tr.offer[client.sessionId] = r.offer;
      tr.ready = {}; // qualquer mudança desfaz os aceites dos DOIS lados
      tr.rev++;
    }
    this.sendTrade(tr);
  }

  /** `rev` = a versão da oferta que quem aceita estava vendo: se mudou no meio do caminho, o aceite é recusado. */
  private tradeReady(client: Client, ready: boolean, rev: unknown) {
    if (!this.allow(client)) return;
    const tr = this.trades.get(client.sessionId);
    if (!tr) return;
    if (!ready) { delete tr.ready[client.sessionId]; return this.sendTrade(tr); }
    if (rev !== tr.rev) { this.notify(client.sessionId, "A oferta mudou. Confira de novo antes de aceitar."); return this.sendTrade(tr); }
    if (!tr.offer[tr.a].items.length && !tr.offer[tr.b].items.length && !tr.offer[tr.a].iron && !tr.offer[tr.b].iron && !tr.offer[tr.a].obols && !tr.offer[tr.b].obols) { this.notify(client.sessionId, "Ponha algo na oferta antes de aceitar."); return this.sendTrade(tr); }
    tr.ready[client.sessionId] = true;
    if (!(tr.ready[tr.a] && tr.ready[tr.b])) return this.sendTrade(tr);
    this.executeTradeNow(tr);
  }

  /** Os dois confirmaram: confere tudo de novo, troca em memória (atômico) e grava os DOIS personagens na mesma transação. */
  private executeTradeNow(tr: Trade) {
    const a = this.state.players.get(tr.a), b = this.state.players.get(tr.b);
    if (!a || !b || a.dead || b.dead || a.traveling || b.traveling) return this.closeTrade(tr, "A troca foi cancelada.");
    if (dist(a.x, a.y, b.x, b.y) > TRADE_RANGE + 2) return this.closeTrade(tr, "Vocês se afastaram demais.");
    const r = executeTrade(a.inv, tr.offer[tr.a], b.inv, tr.offer[tr.b]);
    if (!r.ok) {
      tr.ready = {}; tr.rev++;
      for (const id of [tr.a, tr.b]) this.notify(id, r.error);
      return this.sendTrade(tr);
    }
    // grava: a fotografia dos dois é tirada AGORA; a gravação espera as filas de salvamento de cada um e vai numa transação só
    const ra = this.repo.inventoryRows(a.inv), rb = this.repo.inventoryRows(b.inv);
    a.invDirty = b.invDirty = false;
    const pr = Promise.all([a.saveChain, b.saveChain]).then(() => this.repo.saveInventoryPair([a.charId, ra], [b.charId, rb]))
      .catch((e) => { a.invDirty = b.invDirty = true; console.error("[db] falha ao gravar a troca:", (e as Error).message); });
    a.saveChain = b.saveChain = pr;
    this.refreshStats(a);
    this.refreshStats(b);
    this.sendInv(tr.a, a);
    this.sendInv(tr.b, b);
    const gave = (o: TradeOffer) => [...o.items.map((i) => `${ITEMS[i.id].name}${i.qty > 1 ? ` x${i.qty}` : ""}`), describeCoins(o.iron, o.obols)].filter(Boolean).join(", ") || "nada";
    this.notifyOk(tr.a, `Troca feita! Recebeu: ${gave(tr.offer[tr.b])}.`);
    this.notifyOk(tr.b, `Troca feita! Recebeu: ${gave(tr.offer[tr.a])}.`);
    this.closeTrade(tr, "Troca concluída.", true);
  }

  /** a cada tick: expira convites e cancela trocas de quem se afastou, morreu ou viajou */
  private updateTrades() {
    for (const [id, inv] of this.tradeInvites) {
      if (this.t >= inv.until || !this.state.players.has(inv.from)) { this.tradeInvites.delete(id); this.clients.getById(id)?.send(Evt.TradeInviteEnd, {}); }
    }
    for (const tr of new Set(this.trades.values())) {
      const a = this.state.players.get(tr.a), b = this.state.players.get(tr.b);
      if (!a || !b || a.dead || b.dead || a.traveling || b.traveling) this.closeTrade(tr, "A troca foi cancelada.");
      else if (dist(a.x, a.y, b.x, b.y) > TRADE_RANGE + 2) this.closeTrade(tr, "Vocês se afastaram demais.");
    }
  }

  private invOp(client: Client, op: (p: Player) => { ok: true } | { ok: false; error: string }) {
    if (!this.allow(client)) return;
    const p = this.state.players.get(client.sessionId);
    if (!p || p.dead) return;
    if (p.trading || p.marketBusy) return this.notify(client.sessionId, p.trading ? "Termine ou cancele a troca primeiro." : "Aguarde a operação do mercado.");
    const r = op(p);
    if (!r.ok) return this.notify(client.sessionId, r.error);
    p.invDirty = true;
    this.refreshStats(p);
    this.sendInv(client.sessionId, p);
    this.questsDaMochila(client.sessionId, p); // equipar e coletar acompanham o que o personagem tem agora
  }

  private usePotion(id: string, p: Player, slot: unknown): { ok: true } | { ok: false; error: string } {
    if (!validSlot(slot)) return { ok: false, error: "Espaço inválido." };
    const stack = p.inv.slots[slot];
    const def = stack ? ITEMS[stack.id] : undefined;
    if (!stack || !def || def.kind !== "potion") return { ok: false, error: "Esse item não pode ser usado." };
    if (this.t < p.potionCdUntil) return { ok: false, error: "Poção em recarga." };
    if (p.hp >= p.maxHp) return { ok: false, error: "Sua vida já está cheia." };
    consumeOne(p.inv, slot);
    p.potionCdUntil = this.t + POTION_COOLDOWN_S;
    this.healPlayer(id, p, def.heal ?? 0); // Bênção soma; limita à vida máxima e avisa o valor efetivo (poção não é bloqueada por combate)
    return { ok: true };
  }

  /** auto-poção: com a vida em (ou abaixo de) autoPotAt % e uma poção na bolsa, bebe uma sozinha. Segue as mesmas regras do botão (recarga, vida cheia). */
  private autoPotTick(id: string, p: Player) {
    if (p.dead || p.traveling || !autoPotDispara(p.hp, p.maxHp, p.autoPotAt)) return; // acima do limiar, ou desligada
    if (this.t < p.potionCdUntil) return; // recarga das poções
    const slot = p.inv.slots.findIndex((s) => s && ITEMS[s.id]?.kind === "potion");
    if (slot < 0) return; // sem poção: não faz nada (sem aviso repetido)
    if (!this.usePotion(id, p, slot).ok) return;
    p.invDirty = true;
    this.refreshStats(p);
    this.sendInv(id, p);
  }

  // ------------------------------------------------------------------ itens no chão
  private canPickup(id: string, p: Player, g: GroundItem): boolean {
    return this.t >= g.unlockAt || g.owner === id || (!!g.party && g.party === p.party);
  }

  /** Coloca os itens no chão em volta de (x, y), reservados a `owner` (e ao grupo dele) por `lockS`. O mais antigo sai se passar do limite. */
  private spawnGround(drops: Drop[], x: number, y: number, owner: string, lockS: number, shareParty = true): GroundItem[] {
    const party = shareParty ? this.state.players.get(owner)?.party ?? "" : ""; // drops de abate: dono EXCLUSIVO (a divisão é por rodízio)
    const made: GroundItem[] = [];
    drops.forEach((d, i) => {
      const g = new GroundItem();
      const ang = (i / Math.max(1, drops.length)) * Math.PI * 2 + Math.random() * 0.6, rad = drops.length > 1 ? 1.2 + Math.random() * 0.4 : 0; // afastados o bastante para os nomes não se sobrepor
      g.itemId = d.id; g.qty = d.qty; g.af = (d.af ?? []).join(",");
      g.x = clamp(x + Math.cos(ang) * rad, 0, this.zone.w - 1);
      g.y = clamp(y + Math.sin(ang) * rad, 0, this.zone.h - 1);
      g.owner = owner; g.party = party; g.lockS = lockS;
      g.unlockAt = this.t + lockS; g.expireAt = this.t + lockS + GROUND_TTL_S;
      this.state.items.set(`g${++this.seq}`, g);
      made.push(g);
    });
    while (this.state.items.size > GROUND_MAX) { // passou do limite: sai o mais antigo (menor tempo para expirar)
      let oldest: string | null = null, at = Infinity;
      this.state.items.forEach((g, gid) => { if (g.expireAt < at) { at = g.expireAt; oldest = gid; } });
      if (oldest) this.state.items.delete(oldest); else break;
    }
    return made;
  }

  private tryPickup(id: string, p: Player, gid: string, g: GroundItem, quiet = false) {
    if (isCoinItem(g.itemId)) { // moeda no chão: vai direto para o saldo (não ocupa espaço na mochila)
      const kind = g.itemId === COIN_OBOL.id ? "obols" : "iron";
      const add = addCoins(p.inv, kind, g.qty);
      if (add <= 0) { if (!quiet || this.t >= p.fullNoticeAt) { this.notify(id, "Saldo de moedas cheio."); p.fullNoticeAt = this.t + 4; } return; }
      this.clients.getById(id)?.send(Evt.Coins, { iron: kind === "iron" ? add : 0, obols: kind === "obols" ? add : 0, x: g.x, y: g.y });
      p.invDirty = true;
      this.sendInv(id, p);
      if (add < g.qty) g.qty -= add; else this.state.items.delete(gid);
      return;
    }
    const left = addItem(p.inv, g.itemId, g.qty, g.af ? g.af.split(",") : undefined);
    const got = g.qty - left;
    if (got <= 0) {
      if (!quiet || this.t >= p.fullNoticeAt) { this.notify(id, "Mochila cheia."); p.fullNoticeAt = this.t + 4; }
      return;
    }
    this.clients.getById(id)?.send(Evt.Loot, { id: g.itemId, qty: got });
    p.invDirty = true;
    this.sendInv(id, p);
    if (left > 0) g.qty = left; else this.state.items.delete(gid);
  }

  /** a cada tick: pega o que está ao alcance (e liberado para o jogador) e remove o que expirou */
  private updateGround() {
    if (this.state.items.size === 0) return;
    const gone: string[] = [];
    this.state.items.forEach((g, gid) => {
      if (this.t >= g.expireAt) { gone.push(gid); return; }
      this.state.players.forEach((p, pid) => {
        if (p.dead || p.traveling || !this.state.items.has(gid) || dist(p.x, p.y, g.x, g.y) > PICKUP_AUTO || !this.canPickup(pid, p, g)) return;
        if (g.noAutoSid === pid && this.t < g.noAutoUntil) return; // acabou de soltar: não pega de volta sozinho
        this.tryPickup(pid, p, gid, g, true);
      });
    });
    for (const gid of gone) this.state.items.delete(gid);
  }

  /** tempo de reserva (nos testes pode ser encurtado por LOOT_LOCK_S) */
  private lockSeconds(base: number) {
    const o = Number(process.env.LOOT_LOCK_S);
    return process.env.NODE_ENV !== "production" && Number.isFinite(o) && o > 0 ? o : base;
  }

  async onAuth(_client: Client, options: { token?: string; charId?: string }): Promise<JoinAuth> {
    let user: AuthUser;
    try {
      user = await verifySession(options?.token);
    } catch {
      throw new ServerError(401, "não autorizado"); // não vaza detalhes do JWT
    }
    // banimento: recusado antes de qualquer coisa; o cache de sanções também vale para o chat
    const sancao = await this.repo.getSancao(user.id);
    guardarSancao(user.id, { silenciadoAte: sancao.silenciadoAte, banido: sancao.banido });
    if (sancao.banido) throw new ServerError(403, "Esta conta está banida do FrixeP.");
    const charId = typeof options?.charId === "string" ? options.charId : undefined; // o personagem escolhido na tela de seleção
    const character = await this.repo.getCharacter(user.id, charId);
    if (!character) throw new ServerError(403, charId ? "personagem não encontrado nesta conta" : "crie um personagem antes de entrar");
    const inventory = await this.repo.loadInventory(character.id, character.class);
    // o personagem só entra na sala da zona em que está (a zona é gravada pelo servidor): ninguém "teletransporta" pedindo outra sala
    if ((character.zone ?? START_ZONE) !== this.zone.id) throw new ServerError(403, "zona errada");
    // uma sessão por conta (em qualquer zona): derruba a anterior, exceto quem já está saindo por um portal
    const old = active.get(user.id);
    if (old) {
      const op = old.room.state.players.get(old.sid);
      if (!op?.traveling) old.room.clients.getById(old.sid)?.leave(4001);
    }
    const quests = await this.repo.loadQuests(character.id);
    return { user, character, inventory, quests };
  }

  onJoin(client: Client, options: { load?: boolean } | undefined, auth: JoinAuth) {
    this.userIds.set(client.sessionId, auth.user.id);
    client.send(Evt.Balance, { valores: valoresEfetivos() } satisfies BalanceEvent); // valores efetivos do balanceamento (dicas e fichas mostram os números certos)
    active.set(auth.user.id, { room: this, sid: client.sessionId });
    const pl = new Player();
    const from = arrivals.get(auth.character.id); // chegou por um portal: nasce junto do portal de volta
    arrivals.delete(auth.character.id);
    const gd = gmDestino.get(auth.character.id); // teleporte do Modo Deus entre zonas: nasce na coordenada pedida
    gmDestino.delete(auth.character.id);
    const at = gd ?? ((from !== undefined && this.zone.arrive[from]) || this.spawnPoint(options?.load !== true));
    pl.x = pl.tx = at.x;
    pl.y = pl.ty = at.y;
    // o cliente de verdade avisa que vai carregar (options.load): a bolha já vale durante o load e só começa a contar no Msg.Ready.
    // Sem o aviso (bots e testes antigos) não há bolha: ninguém ganha proteção sem o cliente confirmar que a tela está pronta.
    if (options?.load === true) { pl.shield = true; pl.shieldPending = true; pl.shieldUntil = this.t + ARRIVAL_SHIELD_WAIT_S; }
    pl.name = auth.character.name;
    pl.charId = auth.character.id;
    pl.cls = auth.character.class;
    pl.level = auth.character.level;
    if (process.env.VARIACAO_TEST_LEVEL && process.env.NODE_ENV !== "production") pl.level = Number(process.env.VARIACAO_TEST_LEVEL); // só nos testes (test/variacoes.mjs): nível para testar o desbloqueio
    pl.pvp = this.zone.pvp === true; // arena: PvP ligado desde a entrada (o servidor decide; o cliente não liga nem desliga)
    pl.xp = auth.character.xp;
    pl.inv = auth.inventory;
    pl.quests = auth.quests;
    pl.autoPotAt = clampAutoPot(auth.character.auto_pot_at); // a escolha da auto-poção volta com o personagem
    pl.variacoes = JSON.stringify(limparEscolhas(auth.character.variacoes, pl.cls as CharClass, pl.level)); // as variações voltam com o personagem (C2.2)
    pl.talentos = JSON.stringify(limparTalentos(auth.character.talentos, pl.cls as CharClass, pl.level)); // os talentos também (C2.3)
    pl.talentosResets = Math.max(0, Math.floor(Number(auth.character.talentos_resets) || 0));
    pl.loadouts = JSON.stringify(limparLoadouts(auth.character.loadouts, pl.cls as CharClass)); // os 3 builds voltam com o personagem (C2.4)
    pl.gmUsado = auth.character.gm_usado === true; // a marca do personagem volta com ele
    if (isAdmin(auth.user.id) && auth.character.gm_modo) { // Modo Deus volta com o personagem (só para conta admin)
      pl.gm = true;
      pl.gmInvis = auth.character.gm_invis === true;
      pl.gmInvuln = auth.character.gm_invuln === true;
      pl.gmVel = Math.min(GM_VEL_MAX, Math.max(GM_VEL_MIN, Number(auth.character.gm_vel) || 1));
    }
    if (econTest() && !auth.inventory.slots.some(Boolean) && auth.inventory.iron === 0) { // só nos testes (ECON_TEST=1): kit inicial para exercitar loja, fusão e troca sem jogar horas
      const i = auth.inventory;
      i.iron = 50000; i.obols = 2;
      for (const k of ["espada_1m_common", "arco_curto_common", "cetro_common", "varinha_common", "warrior_armor_common", "warrior_armor_common", "warrior_armor_common", "warrior_armor_rare", "warrior_helmet_epic"]) addItem(i, k, 1);
      addItem(i, "pocao_de_vida", 5);
      if (process.env.CRAFT_TEST === "1") for (const m of ["mat_ferro_bruto", "mat_couro_curtido", "mat_essencia_arcana"]) for (let k = 0; k < 2; k++) addItem(i, m, 50); // CRAFT_TEST=1 (só testes): ingredientes para o craft
      pl.invDirty = true;
    }
    if (auth.inventory.migrated) { pl.invDirty = true; auth.inventory.migrated = false; } // itens antigos traduzidos: grava no próximo salvamento
    this.refreshStats(pl, true);
    this.state.players.set(client.sessionId, pl);
    this.sendInv(client.sessionId, pl);
    this.sendQuests(client.sessionId, pl);
    void this.sendDicas(client.sessionId);
    // grupo: registra a presença (o grupo atravessa as zonas: a identidade é o personagem)
    parties.attach({ charId: pl.charId, name: pl.name, sid: client.sessionId, zone: this.zone.id, player: pl, send: (t, m) => this.clients.getById(client.sessionId)?.send(t, m) });
  }

  // ------------------------------------------------------------------ limite de taxa
  // balde de fichas por cliente: rajada de 40, reposição de 30 mensagens/s. Jogo legítimo
  // fica bem abaixo disso (cliques e teclas); excesso é descartado e a insistência derruba a conexão.
  private buckets = new Map<string, { tokens: number; last: number; strikes: number }>();
  private abatesRegistrados = new Set<string>(); // telemetria: 1º abate de cada personagem já anotado nesta execução (evita consulta a cada abate)
  private static readonly CHAT_WINDOW_MS = 8000; // no máximo 5 mensagens de chat a cada 8 s por jogador
  private static readonly CHAT_MAX_IN_WINDOW = 5;
  private chatAt = new Map<string, number[]>();
  private static readonly BURST = 40;
  private static readonly REFILL = 30;
  private static readonly MAX_STRIKES = 100;
  private static readonly STRIKE_DECAY = 10; // infrações perdoadas por segundo

  private allow(client: Client): boolean {
    const now = performance.now();
    let b = this.buckets.get(client.sessionId);
    if (!b) this.buckets.set(client.sessionId, (b = { tokens: ZoneRoom.BURST, last: now, strikes: 0 }));
    const dtS = (now - b.last) / 1000;
    b.tokens = Math.min(ZoneRoom.BURST, b.tokens + dtS * ZoneRoom.REFILL);
    b.strikes = Math.max(0, b.strikes - dtS * ZoneRoom.STRIKE_DECAY); // bom comportamento "perdoa" aos poucos
    b.last = now;
    if (b.tokens >= 1) {
      b.tokens -= 1;
      return true;
    }
    if (++b.strikes > ZoneRoom.MAX_STRIKES) {
      console.warn(`[anti-abuso] ${client.sessionId} derrubado por excesso de mensagens`);
      client.leave(4003);
    }
    return false;
  }

  async onLeave(client: Client) {
    const tr = this.trades.get(client.sessionId);
    if (tr) this.closeTrade(tr, "O outro jogador saiu.");
    this.tradeInvites.delete(client.sessionId);
    this.buckets.delete(client.sessionId);
    this.chatAt.delete(client.sessionId);
    const uid = this.userIds.get(client.sessionId);
    if (uid && active.get(uid)?.sid === client.sessionId) active.delete(uid);
    this.userIds.delete(client.sessionId);
    for (const tr of this.traps.filter((x) => x.owner === client.sessionId)) this.removeTrap(tr, "gone"); // armadilhas somem com o dono
    const pl = this.state.players.get(client.sessionId);
    if (pl) parties.detach(pl.charId, client.sessionId); // continua no grupo (ausente) por um tempo: recarregar ou atravessar não o desfaz
    this.state.players.delete(client.sessionId);
    if (pl) {
      void registrarEvento(this.repo.db, "saida", { contaId: uid, personagemId: pl.charId, dados: { nivel: pl.level, zona: this.zone.id } });
      await this.save(pl);
    }
  }

  /** ajuste de balanceamento ao vivo: avisa os clientes e ajusta o que já está em jogo (vida dos inimigos e dos jogadores vivos) */
  private aplicarBalanceamento(mudou: string[]) {
    if (mudou.length === 0) return;
    this.broadcast(Evt.Balance, { valores: valoresEfetivos() } satisfies BalanceEvent);
    // inimigos vivos: a vida nova vale também para eles, mantendo a fração que ainda têm (o dano já usa o valor novo a cada golpe)
    this.state.enemies.forEach((e) => {
      if (!mudou.includes(`inimigo.${e.kind}.hp`)) return;
      const novo = enemyHp(e.level, e.kind);
      if (novo === e.maxHp) return;
      const frac = e.maxHp > 0 ? e.hp / e.maxHp : 1;
      e.maxHp = novo;
      if (e.st !== "dead") e.hp = Math.max(1, Math.round(novo * frac));
    });
    // jogadores vivos: a vida máxima da classe muda; quem está vivo mantém a fração de vida que tinha
    if (mudou.some((k) => k.startsWith("classe."))) {
      this.state.players.forEach((p) => {
        const novo = maxHpFor(this.classOf(p).id, p.level, p.gear.hp);
        if (novo === p.maxHp) return;
        const frac = p.maxHp > 0 ? p.hp / p.maxHp : 1;
        p.maxHp = novo;
        if (!p.dead) p.hp = Math.max(1, Math.min(novo, Math.round(novo * frac)));
      });
    }
  }

  /** Modo Deus ligado (com as travas): o personagem não negocia, não usa mercado nem baú. Avisa quem tentou. */
  private gmTravado(sid: string): boolean {
    const pl = this.state.players.get(sid);
    if (!(pl?.gm || pl?.gmUsado) || !travasAtivas()) return false;
    this.notify(sid, pl.gmUsado
      ? "Este personagem usou o Modo Deus: fica isolado da economia (mercado, negociação e baú)."
      : "Modo Deus ligado: este personagem não negocia, não usa o mercado nem o baú.");
    return true;
  }

  /** marca permanente: o personagem usou moedas, item ou XP do Modo Deus */
  private async marcaGmUsado(p: Player): Promise<void> {
    if (p.gmUsado) return;
    p.gmUsado = true;
    await this.repo.marcarGmUsado(p.charId);
  }

  private achaJogador(charId: unknown): [string, Player] | null {
    if (typeof charId !== "string" || !charId) return null;
    let r: [string, Player] | null = null;
    this.state.players.forEach((o, oid) => { if (!r && o.charId === charId) r = [oid, o]; });
    return r;
  }

  // ------------------------------------------------------------------ Modo Deus (ferramenta de admin)
  /**
   * Uma ação do Modo Deus no personagem desta sessão. A rota do painel já confirmou sessão, conta admin e token;
   * aqui se confere de novo. Quem chama grava a auditoria com `antes` e `depois`.
   */
  async gmAcao(sid: string, acao: string, q: Record<string, unknown>): Promise<GmResultado> {
    const p = this.state.players.get(sid);
    if (!p || !isAdmin(this.userIds.get(sid))) return { ok: false, status: 403, erro: "Acesso restrito a administradores." };
    const bad = (erro: string): GmResultado => ({ ok: false, status: 400, erro });
    const num = (x: unknown) => (typeof x === "number" && Number.isFinite(x) ? x : NaN);
    const semMorte = acao !== "modo" && acao !== "reviver";
    if (p.dead && semMorte) return { ok: false, status: 409, erro: "Você está morto: espere renascer para usar esta ação." };

    switch (acao) {
      case "modo": {
        const antes = { modo: p.gm, invis: p.gmInvis, invuln: p.gmInvuln, vel: p.gmVel };
        if (q.ligado === false) { p.gm = false; p.gmInvis = false; p.gmInvuln = false; p.gmVel = 1; }
        else {
          const mexeu = q.ligado === true || q.invis !== undefined || q.invuln !== undefined || q.vel !== undefined;
          if (!mexeu) return bad("Nada a mudar no Modo Deus.");
          if (q.ligado === true) p.gm = true;
          if (q.invis !== undefined && typeof q.invis !== "boolean") return bad("Invisível: sim ou não.");
          if (q.invuln !== undefined && typeof q.invuln !== "boolean") return bad("Invulnerável: sim ou não.");
          if (!p.gm && (q.invis !== undefined || q.invuln !== undefined || q.vel !== undefined)) return { ok: false, status: 409, erro: "Ligue o Modo Deus antes de mudar invisibilidade, invulnerabilidade ou velocidade." };
          if (typeof q.invis === "boolean") p.gmInvis = q.invis;
          if (typeof q.invuln === "boolean") p.gmInvuln = q.invuln;
          if (q.vel !== undefined) {
            const v = velocidadeValida(q.vel);
            if (v === null) return bad(`Velocidade de ${GM_VEL_MIN} a ${GM_VEL_MAX}.`);
            p.gmVel = v;
          }
        }
        await this.repo.setGmModo(p.charId, { modo: p.gm, invis: p.gmInvis, invuln: p.gmInvuln, vel: p.gmVel });
        const depois = { modo: p.gm, invis: p.gmInvis, invuln: p.gmInvuln, vel: p.gmVel };
        this.notify(sid, p.gm ? "Modo Deus ligado." : "Modo Deus desligado.");
        return { ok: true, resumo: p.gm ? "Modo Deus ligado" : "Modo Deus desligado", antes, depois };
      }

      case "xp": {
        const antes = { nivel: p.level, xp: p.xp };
        const nivel = q.nivel === undefined ? undefined : num(q.nivel);
        const xp = q.xp === undefined ? undefined : num(q.xp);
        if (nivel === undefined && xp === undefined) return bad("Informe XP ou nível.");
        if (nivel !== undefined && (!Number.isInteger(nivel) || nivel < 1 || nivel > LEVEL_CAP)) return bad(`Nível de 1 a ${LEVEL_CAP}.`);
        if (xp !== undefined && (!Number.isInteger(xp) || xp < 1 || xp > 10_000_000)) return bad("XP de 1 a 10.000.000.");
        if (nivel !== undefined) { p.level = nivel; p.xp = 0; }
        if (xp !== undefined) this.addXp(sid, p, xp);
        p.dirty = true;
        this.refreshStats(p);
        await this.marcaGmUsado(p);
        return { ok: true, resumo: `Nível ${p.level} (XP ${p.xp})`, antes, depois: { nivel: p.level, xp: p.xp }, detalhes: { nivelPedido: nivel, xpDado: xp } };
      }

      case "item": {
        const v = validarItemGm({ id: q.id, qtd: q.qtd, refino: q.refino, afixos: q.afixos });
        if (!v.ok) return bad(v.error);
        const teste: Inventory = { ...p.inv, slots: p.inv.slots.map((s) => (s ? { ...s } : null)) };
        if (addItem(teste, v.id, v.qtd, v.af, v.refino, undefined, true) > 0) return { ok: false, status: 409, erro: "Mochila sem espaço para isso." };
        p.inv.slots = teste.slots;
        p.invDirty = true;
        this.sendInv(sid, p);
        await this.marcaGmUsado(p);
        return { ok: true, resumo: `${ITEMS[v.id].name} x${v.qtd} na mochila (vinculado ao GM)`, detalhes: { item: v.id, qtd: v.qtd, refino: v.refino, afixos: v.af } };
      }

      case "moedas": {
        const tipo = q.tipo === "obols" ? "obols" : q.tipo === "iron" ? "iron" : null;
        const qtd = num(q.qtd);
        if (!tipo) return bad("Moeda: iron (Tostões) ou obols (Óbolos).");
        if (!Number.isInteger(qtd) || qtd < 1 || qtd > 1_000_000_000) return bad("Quantidade de 1 a 1.000.000.000.");
        const antes = { [tipo]: p.inv[tipo] };
        p.inv[tipo] = Math.min(MAX_COINS, p.inv[tipo] + qtd);
        p.invDirty = true;
        this.sendInv(sid, p);
        await this.marcaGmUsado(p);
        return { ok: true, resumo: `+${qtd} ${tipo === "iron" ? "Tostões" : "Óbolos"}`, antes, depois: { [tipo]: p.inv[tipo] }, detalhes: { moeda: tipo, qtd } };
      }

      case "curar": {
        const antes = { hp: p.hp, mana: p.mana };
        p.hp = p.maxHp;
        p.manaF = p.maxMana;
        p.mana = p.maxMana;
        return { ok: true, resumo: "Vida e recurso cheios", antes, depois: { hp: p.hp, mana: p.mana } };
      }

      case "teleporte": {
        if (typeof q.jogador === "string" && q.jogador) { // até um jogador desta zona
          const alvo = this.achaJogador(q.jogador);
          if (!alvo || alvo[1] === p) return { ok: false, status: 404, erro: "Jogador não está nesta zona." };
          const antes = { x: p.x, y: p.y };
          p.x = p.tx = alvo[1].x;
          p.y = p.ty = alvo[1].y;
          return { ok: true, resumo: `Teleportado até ${alvo[1].name}`, antes, depois: { x: p.x, y: p.y }, detalhes: { jogador: q.jogador } };
        }
        const zona = q.zona === undefined ? this.zone.id : num(q.zona);
        const x = num(q.x), y = num(q.y);
        const dest = ZONES[zona];
        if (!dest) return bad("Zona inexistente.");
        if (!Number.isFinite(x) || !Number.isFinite(y) || x < 0 || y < 0 || x > dest.w - 1 || y > dest.h - 1) return bad(`Coordenada dentro da zona: x de 0 a ${dest.w - 1}, y de 0 a ${dest.h - 1}.`);
        if (zona === this.zone.id) {
          const antes = { x: p.x, y: p.y };
          p.x = p.tx = x;
          p.y = p.ty = y;
          return { ok: true, resumo: `Teleportado para (${x}, ${y})`, antes, depois: { x, y }, detalhes: { zona, x, y } };
        }
        if (p.traveling) return { ok: false, status: 409, erro: "Você já está atravessando para outra zona." };
        gmDestino.set(p.charId, { x, y }); // a próxima entrada nasce na coordenada pedida
        void this.travel(sid, p, { to: zona }, true); // o admin não passa pelo tempo de combate
        return { ok: true, resumo: `Teleporte para ${dest.name} (${x}, ${y})`, detalhes: { zona, x, y } };
      }

      case "puxar": {
        const alvo = this.achaJogador(q.jogador);
        if (!alvo || alvo[1] === p) return { ok: false, status: 404, erro: "Jogador não está nesta zona (puxar só vale na mesma zona)." };
        const [tid, t] = alvo;
        const antes = { x: t.x, y: t.y };
        t.x = t.tx = clamp(p.x + 1, 0, this.zone.w - 1);
        t.y = t.ty = clamp(p.y, 0, this.zone.h - 1);
        this.notify(tid, `Um administrador puxou você até ele.`);
        return { ok: true, resumo: `${t.name} puxado até você`, antes, depois: { x: t.x, y: t.y }, detalhes: { jogador: t.charId } };
      }

      case "reviver": {
        const alvo = this.achaJogador(q.jogador);
        if (!alvo) return { ok: false, status: 404, erro: "Jogador não está nesta zona." };
        const [tid, t] = alvo;
        if (!t.dead) return bad("Este jogador não está morto.");
        const antes = { hp: t.hp, morto: true };
        t.dead = false;
        t.deadUntil = 0;
        t.hp = t.maxHp;
        t.tx = t.x; t.ty = t.y;
        this.notify(tid, "Um administrador trouxe você de volta.");
        return { ok: true, resumo: `${t.name} reviveu`, antes, depois: { hp: t.hp, morto: false }, detalhes: { jogador: t.charId } };
      }

      case "monstros": {
        const modo = q.modo === "renascer" ? "renascer" : q.modo === "matar" ? "matar" : null; // "acao" já é o nome da ação (monstros)
        if (!modo) return bad("Use matar ou renascer.");
        const raio = q.raio === undefined ? 0 : num(q.raio);
        if (!Number.isFinite(raio) || raio < 0 || raio > 200) return bad("Raio de 0 (zona toda) a 200.");
        let n = 0;
        this.state.enemies.forEach((e, eid) => {
          if (raio > 0 && dist(e.x, e.y, p.x, p.y) > raio) return;
          if (modo === "matar") {
            if (e.st === "dead") return;
            e.hp = 0; e.st = "dead"; e.respawnAt = this.t + enemyKind(e.kind).respawnS;
            e.targetId = ""; e.contrib.clear(); e.fightStart = 0;
            this.broadcast(Evt.Died, { k: "e", id: eid });
          } else {
            e.hp = e.maxHp; e.x = e.sx; e.y = e.sy; e.st = "idle";
            e.contrib.clear(); e.fightStart = 0; e.lastHurt = -1e9;
          }
          n++;
        });
        return { ok: true, resumo: `${n} monstro(s) ${modo === "matar" ? "abatido(s)" : "renascido(s)"}`, detalhes: { modo, raio, quantos: n } };
      }

      default:
        return bad("Ação desconhecida.");
    }
  }

  /** zona desta sala e quantos jogadores estão nela (painel de administração) */
  infoZona(): { zona: number; nome: string; jogadores: number } {
    return { zona: this.zone.id, nome: this.zone.name, jogadores: this.state.players.size };
  }

  /** aviso discreto para uma sessão desta sala (usado pelo painel, fora da sala) */
  notificarSessao(sid: string, text: string) {
    this.notify(sid, text);
  }

  async onDispose() {
    liveRooms.delete(this);
    this.soltarBalance?.();
    clearInterval(this.saver);
    await this.saveAll();
  }

  // ------------------------------------------------------------------ persistência
  /** Os salvamentos de um mesmo jogador rodam em fila: um estado velho nunca termina depois de um novo. */
  private save(p: Player): Promise<void> {
    p.saveChain = p.saveChain.then(() => this.doSave(p));
    return p.saveChain;
  }

  private async doSave(p: Player) {
    if (!p.charId || (!p.dirty && !p.invDirty && !p.vaultDirty && !p.questDirty.size)) return;
    const progress = p.dirty, inv = p.invDirty, vault = p.vaultDirty && !!p.vault;
    const qIds = [...p.questDirty];
    const qRows = qIds.map((id) => p.quests.get(id)).filter((q): q is QuestRt => !!q); // fotografia copiada agora (antes de qualquer espera)
    p.dirty = p.invDirty = p.vaultDirty = false;
    p.questDirty.clear();
    try {
      if (qRows.length) await this.repo.saveQuests(p.charId, qRows);
      if (progress) await this.repo.saveProgress(p.charId, p.level, p.xp);
      if (vault) await this.repo.saveInventoryAndVault(p.charId, p.inv, p.vault!); // bolsa e baú na MESMA transação
      else if (inv) await this.repo.saveInventory(p.charId, p.inv);
    } catch (e) {
      p.dirty ||= progress; // tenta de novo no próximo ciclo
      p.invDirty ||= inv;
      p.vaultDirty ||= vault;
      qIds.forEach((id) => p.questDirty.add(id));
      console.error("[db] falha ao salvar personagem:", (e as Error).message);
    }
  }

  private async saveAll() {
    await Promise.all([...this.state.players.values()].map((p) => this.save(p)));
  }

  // ------------------------------------------------------------------ quests (C1.1)
  /** Fotografia completa das quests para o dono. */
  private sendQuests(sid: string, p: Player) {
    this.clients.getById(sid)?.send(Evt.Quests, { quests: estadoParaCliente(p.quests) } satisfies QuestEvent);
  }

  /** Marca as quests alteradas (grava no próximo salvamento), avisa o dono e, se alguma ficou pronta, diz para entregar. */
  private questsMudaram(sid: string, p: Player, ids: string[]) {
    if (!ids.length) return;
    ids.forEach((id) => p.questDirty.add(id));
    this.sendQuests(sid, p);
    for (const id of ids) {
      const rt = p.quests.get(id);
      if (rt?.estado === "pronta") this.notifyOk(sid, `Missão pronta para entregar: ${DEFS.get(id)?.nome ?? id}.`);
    }
  }

  /** Mochila mudou: recalcula os objetivos "coletar" (o que o personagem tem agora). */
  private questsDaMochila(sid: string, p: Player) {
    const ids: string[] = [];
    for (const rt of p.quests.values()) {
      const def = DEFS.get(rt.id);
      if (def && atualizarColetas(rt, def, p.inv)) ids.push(rt.id);
    }
    this.questsMudaram(sid, p, ids);
  }

  /** NPC da quest ao alcance (distância do SERVIDOR). */
  private npcPerto(p: Player, npc: string): boolean {
    const n = zoneNpcs(this.zone.id).find((q) => q.id === npc);
    return !!n && dist(p.x, p.y, n.x, n.y) <= NPC_REACH;
  }

  /** Um abate contou para as quests deste jogador (mesmo caminho do XP: só quem é elegível). */
  private questAbate(sid: string, p: Player, kind: string, zona: number) {
    this.questsMudaram(sid, p, progredirAbate(p.quests, DEFS, kind, zona).map((rt) => rt.id));
  }

  /** Uma habilidade (skill1..3, ultimate) disparou: conta nas quests "usar" (C1.4). */
  private questUso(sid: string, p: Player, a: ActionId) {
    if (p.quests.size === 0 || !["skill1", "skill2", "skill3", "ultimate"].includes(a)) return;
    this.questsMudaram(sid, p, progredirUso(p.quests, DEFS, a as AcaoUsar).map((rt) => rt.id));
  }

  /** Conferência dos objetivos "chegar" (a cada 0,5 s, só para quem tem quest ativa). */
  private checarChegadas() {
    this.state.players.forEach((p, sid) => {
      if (p.dead || p.traveling || p.quests.size === 0) return;
      this.questsMudaram(sid, p, progredirChegada(p.quests, DEFS, this.zone.id, p.x, p.y).map((rt) => rt.id));
    });
  }

  /** Dicas já vistas pelo personagem (C1.6), enviadas ao dono. */
  private async sendDicas(sid: string) {
    const pl = this.state.players.get(sid);
    if (!pl?.charId) return;
    try {
      const ids = dicasValidas(await this.repo.loadDicas(pl.charId));
      this.clients.getById(sid)?.send(Evt.DicasVistas, { ids } satisfies DicasVistasEvent);
    } catch (e) { console.error("[dicas] falha ao ler:", (e as Error).message); }
  }

  /** Grava que o personagem viu a dica (C1.6). Id desconhecido é ignorado. */
  private async dicaVista(sid: string, id: unknown) {
    const pl = this.state.players.get(sid);
    if (!pl?.charId || !dicaValida(id)) return;
    try { await this.repo.marcarDica(pl.charId, id); } catch (e) { console.error("[dicas] falha ao gravar:", (e as Error).message); }
  }

  private questFalar(sid: string, npc: unknown) {
    const p = this.state.players.get(sid);
    if (!p || p.dead || typeof npc !== "string") return;
    if (!this.npcPerto(p, npc)) return this.notify(sid, "Chegue mais perto do NPC.");
    this.questsMudaram(sid, p, progredirFala(p.quests, DEFS, npc).map((rt) => rt.id));
  }

  private questAceitar(sid: string, id: unknown) {
    const p = this.state.players.get(sid);
    if (!p || p.dead) return;
    if (typeof id !== "string") return this.notify(sid, "Missão inválida.");
    const def = DEFS.get(id);
    if (def?.npc && !this.npcPerto(p, def.npc)) return this.notify(sid, "Chegue mais perto de quem dá essa missão.");
    const r = aceitar(p.quests, DEFS, id, p.level, p.inv);
    if (!r.ok) return this.notify(sid, r.error);
    p.questDirty.add(id);
    void registrarEvento(this.repo.db, "quest_aceita", { contaId: this.userIds.get(sid), personagemId: p.charId, dados: { quest: id } });
    this.sendQuests(sid, p);
    this.notifyOk(sid, `Missão aceita: ${r.def.nome}.`);
    // "falar com o próprio NPC que deu a missão": o jogador já está conversando com ele, então conta na hora (não precisa fechar e reabrir)
    if (r.def.npc && r.def.objetivos.some((o) => o.tipo === "falar" && o.npc === r.def.npc)) {
      this.questsMudaram(sid, p, progredirFala(p.quests, DEFS, r.def.npc).map((rt) => rt.id));
    }
    void this.save(p); // aceitar grava na hora (não espera o salvamento periódico)
  }

  /**
   * Entrega: a recompensa e a mudança de estado são gravadas NUMA transação, na fila de salvamento do jogador.
   * Enquanto isso o jogador fica travado (marketBusy), então nada mexe na mochila por outro caminho.
   * Mochila cheia = recusa antes de gravar: nada se perde.
   */
  private questEntregar(sid: string, id: unknown) {
    const p = this.state.players.get(sid);
    if (!p || p.dead) return;
    if (typeof id !== "string") return this.notify(sid, "Missão inválida.");
    const def = DEFS.get(id);
    const rt = p.quests.get(id);
    if (!def || !rt) return this.notify(sid, "Você não aceitou essa missão.");
    if (rt.estado === "entregue") return this.notify(sid, "Você já entregou essa missão.");
    if (p.trading || p.marketBusy) return this.notify(sid, "Espere a operação em andamento terminar.");
    if (def.npc && !this.npcPerto(p, def.npc)) return this.notify(sid, "Chegue mais perto de quem dá essa missão.");
    this.questsDaMochila(sid, p); // confere o estado com a mochila de agora
    if (rt.estado !== "pronta") return this.notify(sid, "Essa missão ainda não está pronta.");
    p.marketBusy = true;
    p.saveChain = p.saveChain.then(() => this.gravarEntrega(sid, p, def, rt));
  }

  private async gravarEntrega(sid: string, p: Player, def: QuestDef, rt: QuestRt) {
    try {
      if (!p.charId || rt.estado !== "pronta") return;
      const r = aplicarRecompensa(p.inv, def, p.cls as CharClass);
      if (!r.ok) return this.notify(sid, r.error);
      const lv = xpAposGanho(p.level, p.xp, def.recompensa.xp);
      await this.repo.entregarQuest(p.charId, { id: rt.id, estado: "entregue", progresso: [...rt.progresso] }, lv.level, lv.xp, r.inv);
      // gravado: só agora a memória recebe o resultado
      p.inv.slots = r.inv.slots;
      p.inv.iron = r.inv.iron;
      p.inv.obols = r.inv.obols;
      rt.estado = "entregue";
      p.questDirty.delete(rt.id);
      const subiu = lv.level > p.level;
      p.level = lv.level;
      p.xp = lv.xp;
      if (subiu) { this.refreshStats(p, true); this.broadcast(Evt.LevelUp, { id: sid, level: p.level }); }
      this.sendInv(sid, p);
      this.sendQuests(sid, p);
      void registrarEvento(this.repo.db, "quest_entregue", { contaId: this.userIds.get(sid), personagemId: p.charId, dados: { quest: rt.id } });
      this.notifyOk(sid, `Missão concluída: ${def.nome}! Recompensa recebida.`);
    } catch (e) {
      console.error("[quests] falha ao entregar:", (e as Error).message);
      this.notify(sid, "Não foi possível entregar agora. Tente de novo.");
    } finally {
      p.marketBusy = false;
    }
  }

  private addXp(id: string, p: Player, amount: number) {
    if (p.level >= LEVEL_CAP) return;
    p.xp += amount;
    const nivelAntes = p.level;
    let leveled = false;
    while (p.level < LEVEL_CAP && p.xp >= xpToNext(p.level)) {
      p.xp -= xpToNext(p.level);
      p.level++;
      leveled = true;
    }
    if (p.level >= LEVEL_CAP) p.xp = 0;
    if (nivelAntes < 5 && p.level >= 5) void registrarEvento(this.repo.db, "nivel_5", { contaId: this.userIds.get(id), personagemId: p.charId, dados: { nivel: p.level } });
    p.dirty = true;
    if (leveled) {
      this.refreshStats(p, true);
      this.broadcast(Evt.LevelUp, { id, level: p.level });
      void this.save(p); // subir de nível salva na hora
    }
  }

  // ------------------------------------------------------------------ simulação
  // estado extra da sala (não sincronizado): projéteis, armadilhas e efeitos com atraso
  private projs: Proj[] = [];
  private traps: Trap[] = [];
  private pending: { at: number; run: () => void }[] = [];
  private seq = 0;
  private questChegadaAt = 0; // próxima conferência dos objetivos "chegar" (relógio da simulação)

  private tick(dt: number) {
    this.t += dt;
    if (this.t >= this.questChegadaAt) { this.questChegadaAt = this.t + QUEST_CHEGADA_CHECK_S; this.checarChegadas(); } // quests "chegar": conferido 2 vezes por segundo, não a cada tick
    this.state.players.forEach((p, id) => {
      this.updatePlayer(id, p, dt);
      this.updatePvp(id, p);
      this.autoPotTick(id, p);
      if (!p.dead && !p.traveling) { // pisou num portal: atravessa (sem apertar nada)
        const portal = this.zone.portals.find((q) => dist(p.x, p.y, q.x, q.y) <= q.r);
        if (portal && portal.to === WORLD_GATE) { // portão da cidade: abre o mapa-mundo uma vez por entrada no raio
          if (!p.atGate) { p.atGate = true; this.clients.getById(id)?.send(Evt.WorldMap, {}); }
        } else if (portal) void this.travel(id, p, portal);
        else p.atGate = false;
      }
    });
    this.updateProjectiles(dt);
    this.updateTraps();
    this.updateGround();
    this.updateTrades();
    if (this.pending.length) {
      const due = this.pending.filter((x) => this.t >= x.at);
      if (due.length) {
        this.pending = this.pending.filter((x) => this.t < x.at);
        due.forEach((x) => x.run());
      }
    }
    this.state.enemies.forEach((e, id) => this.updateEnemy(id, e, dt));
  }

  private updatePlayer(id: string, p: Player, dt: number) {
    if (p.dead) {
      if (p.traveling || this.t < p.deadUntil) return;
      // arena (PvP): renasce lá dentro, no ponto da arena, sem perda; nunca volta à cidade
      if (!this.zone.safe && !this.zone.pvp && !(process.env.TEST_START_ZONE && process.env.NODE_ENV !== "production")) {
        // morreu numa zona de combate: vai direto à cidade (o checkpoint). O corpo fica onde caiu (não volta ao ponto de nascimento da zona);
        // a tela de load cobre a viagem e quem chega na cidade já nasce inteiro no ponto de nascimento dela.
        void this.travel(id, p, { to: HUB_ZONE }, true);
        return;
      }
      p.dead = false; // cidade, arena ou testes antigos: renasce aqui mesmo, no ponto de nascimento (na arena, o da arena)
      p.hp = p.maxHp;
      p.manaF = p.maxMana;
      p.mana = p.maxMana;
      const sp = this.zone.pvp ? this.zone.spawn : this.spawnPoint(true);
      p.x = p.tx = sp.x;
      p.y = p.ty = sp.y;
      p.combatAt = -1e9;
      p.invulnUntil = this.t + 2; // um respiro ao renascer
      this.startShield(id, p); // renasceu: bolha de proteção (sem tela de load aqui, conta já)
      return;
    }
    if (p.shield && this.t >= p.shieldUntil) { if (p.shieldPending) this.startShield(id, p); else p.shield = false; } // fim da bolha (ou fim da espera sem aviso do cliente)
    p.buff = this.t < p.buffUntil;
    p.ember = this.t < p.emberUntil;
    this.syncBuffs(id, p);
    p.reflect = this.t < p.reflectUntil;
    p.stunned = this.t < p.stunUntil;
    p.rooted = this.t < p.rootUntil;
    if (this.t >= p.healStackUntil) { p.healStacks = 0; p.healStackPct = 0; } // acúmulos de Cura Focada expiraram
    p.healStackS = this.t < p.healStackUntil ? Math.round((p.healStackUntil - this.t) * 10) / 10 : 0; // para a UI mostrar o tempo
    if (p.gear.af.hpRegen > 0 && p.hp < p.maxHp && !p.dead && !this.healBlocked(id, p)) { // Vitalidade (afixo): regenera o tempo todo
      p.regenAcc += p.gear.af.hpRegen * dt;
      const w = Math.floor(p.regenAcc);
      if (w >= 1) { p.hp = Math.min(p.maxHp, p.hp + w); p.regenAcc -= w; }
    }
    if (p.hp < p.maxHp && this.t - p.combatAt >= PLAYER_REGEN_DELAY_S && !this.healBlocked(id, p)) { // fora de combate: recupera aos poucos (o servidor decide)
      p.regenAcc += p.maxHp * PLAYER_REGEN_PCT_S * dt;
      const whole = Math.floor(p.regenAcc);
      if (whole >= 1) { p.hp = Math.min(p.maxHp, p.hp + whole); p.regenAcc -= whole; }
    } else if (p.hp >= p.maxHp) p.regenAcc = 0;
    if (p.manaF < p.maxMana) { // regenera o recurso; só mexe no valor sincronizado quando o inteiro muda
      p.manaF = Math.min(p.maxMana, p.manaF + (this.classOf(p).resource.regen + p.gear.regen) * dt);
      const m = Math.floor(p.manaF);
      if (m !== p.mana) p.mana = m;
    }

    if (p.queued) { // comando guardado: sai quando o deslocamento acabou e a recarga está pronta; vence em meio segundo
      const q = p.queued;
      if (this.t > q.until) { p.queued = null; this.sendTo(id, Evt.ActDenied, { a: q.a }); }
      else if (p.dashLeft <= 0 && this.t >= (p.cdUntil[q.a] ?? 0) - 0.05) { p.queued = null; this.doAction(id, p, q.a as ActionId, q.ax, q.ay); }
    }
    if (this.t < p.pullUntil) { // puxado pelo Compressor de Ar: vai até o ponto; depois fica atordoado
      const d = Math.hypot(p.pullX - p.x, p.pullY - p.y);
      if (!p.rooted && d > 0.5) {
        const sp = Math.max(d, 0.5) / Math.max(0.05, p.pullUntil - this.t);
        const st = Math.min(d, sp * dt);
        p.x += ((p.pullX - p.x) / d) * st;
        p.y += ((p.pullY - p.y) / d) * st;
      }
      p.tx = p.x; p.ty = p.y;
      return;
    }
    if (p.stunned) { p.dashLeft = 0; p.tx = p.x; p.ty = p.y; return; } // atordoado: parado, sem deslocamento

    if (p.dashLeft > 0) {
      const step = Math.min(dt, p.dashLeft);
      p.x = clamp(p.x + p.dashVx * step, 0, this.zone.w - 1);
      p.y = clamp(p.y + p.dashVy * step, 0, this.zone.h - 1);
      p.dashLeft -= dt;
      if (p.dashLeft <= 0) { p.tx = p.x; p.ty = p.y; }
      return;
    }
    if (p.rooted) { p.tx = p.x; p.ty = p.y; return; } // enraizado (Correntes): não anda

    const dx = p.tx - p.x, dy = p.ty - p.y;
    const d = Math.hypot(dx, dy);
    if (d < 0.01) return;
    const step = Math.min(d, MOVE_SPEED * dt * (p.gm ? p.gmVel : 1)); // Modo Deus: velocidade ajustável (1 = normal)
    p.x += (dx / d) * step;
    p.y += (dy / d) * step;
    p.face = Math.atan2(dy, dx);
  }

  // ------------------------------------------------------------------ ações do jogador
  private classOf(p: Player): ClassDef {
    return CLASS_DEFS[p.cls as CharClass] ?? CLASS_DEFS.warrior;
  }

  /** aliado caído mais próximo dentro do raio (para Ressurgir) */
  private nearestDead(p: Player, radius: number): [string, Player] | null {
    let best: [string, Player] | null = null;
    let bestD = radius;
    this.state.players.forEach((o, oid) => {
      if (!o.dead) return;
      const d = dist(o.x, o.y, p.x, p.y);
      if (d <= bestD) { bestD = d; best = [oid, o]; }
    });
    return best;
  }

  /** Variação de habilidade (C2.2): só na cidade, só no nível da habilidade, só variação da própria classe e slot. id null = volta à base. */
  private escolherVariacao(id: string, pl: Player, p: { slot?: unknown; id?: unknown }) {
    if (pl.dead) return;
    if (!this.zone.safe) return this.notify(id, "Troque as variações na cidade.");
    const slot = p?.slot as VariacaoSlot;
    if (!(VARIACAO_SLOTS as readonly string[]).includes(slot)) return;
    if (!variacaoDesbloqueada(slot, pl.level)) return this.notify(id, `Esta variação libera no nível ${VARIACAO_NIVEL[slot]}.`);
    const novo = typeof p.id === "string" ? p.id : null;
    if (novo !== null) {
      const v = variacaoPorId(novo);
      if (!v || v.classe !== pl.cls || v.slot !== slot) return; // id de outra classe ou de outra habilidade
    }
    const e: EscolhasVariacao = limparEscolhas(pl.variacoes, pl.cls as CharClass, pl.level);
    if (novo === null) delete e[slot]; else e[slot] = novo;
    const json = JSON.stringify(e);
    if (json === pl.variacoes) return;
    pl.variacoes = json;
    if (pl.charId) this.repo.setVariacoes(pl.charId, json).catch((err) => console.error("[db] falha ao gravar as variações:", (err as Error).message));
    const nome = novo ? variacaoPorId(novo)?.nome ?? novo : "base";
    this.notifyOk(id, `${slot === "ultimate" ? "Final" : slot === "skill1" ? "Q" : slot === "skill2" ? "W" : "E"}: ${nome}`);
  }

  /** Gasta 1 ponto num talento (C2.3). A validação (pontos, máximo, porta do ramo) é a do shared; o servidor grava e manda o estado. */
  private escolherTalento(sid: string, pl: Player, p: { id?: unknown }) {
    if (pl.dead) return;
    const id = typeof p?.id === "string" ? p.id : "";
    const cls = pl.cls as CharClass;
    const esc = limparTalentos(pl.talentos, cls, pl.level);
    const r = podeSubirTalento(esc, cls, pl.level, id);
    if (!r.ok) return this.notify(sid, r.error);
    const novo = subirTalento(esc, id);
    pl.talentos = JSON.stringify(novo);
    this.gravarTalentos(pl);
    this.refreshStats(pl);
    const t = talentoPorId(id);
    this.notifyOk(sid, `${t?.nome ?? id}: rank ${novo[id]}/${t?.max ?? novo[id]}`);
  }

  /** Reset dos talentos (C2.3): só na cidade e pagando tostões (50 × (resets + 1)). Usa a operação de economia (mochila e tostões juntos). */
  private resetarTalentos(client: Client) {
    this.econOp(client, null, null, (p) => {
      if (!this.zone.safe) return { ok: false, error: "Os talentos só podem ser resetados na cidade (Brasalume)." };
      if (p.talentos === "{}") return { ok: false, error: "Nenhum talento para resetar." };
      const custo = resetCusto(p.talentosResets);
      if (p.inv.iron < custo) return { ok: false, error: `Tostões insuficientes (o reset custa ${custo}).` };
      p.inv.iron -= custo;
      p.talentos = "{}";
      p.talentosResets++;
      this.gravarTalentos(p);
      return { ok: true, msg: `Talentos resetados (−${custo} tostões).` };
    });
  }

  /** Grava os talentos e o número de resets em fila (a última gravação é sempre a mais nova). */
  private gravarTalentos(p: Player) {
    if (!p.charId) return;
    const charId = p.charId, json = p.talentos, resets = p.talentosResets;
    p.saveChain = p.saveChain.then(() => this.repo.setTalentos(charId, json, resets)).catch((err) => console.error("[db] falha ao gravar os talentos:", (err as Error).message));
  }

  /** Motivo para não trocar de build agora (builds, C2.4), ou null. Trocar exige cidade segura, personagem vivo e sem combate recente. */
  private loadoutBloqueio(pl: Player): string | null {
    if (pl.dead) return "Você está morto.";
    if (!this.zone.safe) return "Troque de build na cidade (Brasalume).";
    const falta = LOADOUT_COMBAT_LOCK_S - (this.t - pl.combatAt);
    if (falta > 0) return `Espere ${Math.ceil(falta)}s sem combate para trocar de build.`;
    return null;
  }

  /** Índice de slot vindo do cliente (0 a 2), ou null se for inválido. */
  private slotBuild(p: { slot?: unknown }): number | null {
    const i = typeof p?.slot === "number" ? p.slot : NaN;
    return Number.isInteger(i) && i >= 0 && i < LOADOUT_SLOTS ? i : null;
  }

  /** Salva as variações e os talentos atuais no slot (o nome fica). O slot salvo vira o build ativo. */
  private salvarLoadout(sid: string, pl: Player, p: { slot?: unknown }) {
    const i = this.slotBuild(p);
    if (i === null) return;
    const bloqueio = this.loadoutBloqueio(pl);
    if (bloqueio) return this.notify(sid, bloqueio);
    const cls = pl.cls as CharClass;
    const lo: Loadouts = limparLoadouts(pl.loadouts, cls);
    lo.slots[i] = { nome: lo.slots[i].nome, salvo: true, variacoes: limparEscolhas(pl.variacoes, cls, pl.level), talentos: limparTalentos(pl.talentos, cls, pl.level) };
    lo.ativo = i;
    this.gravarLoadouts(pl, lo);
    this.notifyOk(sid, `${lo.slots[i].nome} salvo.`);
  }

  /** Aplica o build do slot de uma vez (variações e talentos), sem custo. O nível atual decide: um build que não cabe é recusado com o motivo. */
  private aplicarLoadout(sid: string, pl: Player, p: { slot?: unknown }) {
    const i = this.slotBuild(p);
    if (i === null) return;
    const bloqueio = this.loadoutBloqueio(pl);
    if (bloqueio) return this.notify(sid, bloqueio);
    const cls = pl.cls as CharClass;
    const lo: Loadouts = limparLoadouts(pl.loadouts, cls);
    const slot = lo.slots[i];
    const r = validarLoadout(slot, cls, pl.level);
    if (!r.ok) return this.notify(sid, r.error);
    pl.variacoes = JSON.stringify(slot.variacoes);
    if (pl.charId) this.repo.setVariacoes(pl.charId, pl.variacoes).catch((err) => console.error("[db] falha ao gravar as variações:", (err as Error).message));
    pl.talentos = JSON.stringify(slot.talentos);
    this.gravarTalentos(pl);
    this.refreshStats(pl);
    lo.ativo = i;
    this.gravarLoadouts(pl, lo);
    this.notifyOk(sid, `${slot.nome} aplicado.`);
  }

  /** Renomeia o slot (até 16 caracteres, sanitizado; vazio volta ao padrão). */
  private renomearLoadout(pl: Player, p: { slot?: unknown; nome?: unknown }) {
    const i = this.slotBuild(p);
    if (i === null) return;
    const cls = pl.cls as CharClass;
    const lo: Loadouts = limparLoadouts(pl.loadouts, cls);
    lo.slots[i].nome = sanitizarNomeLoadout(p.nome, loadoutNomePadrao(i));
    this.gravarLoadouts(pl, lo);
  }

  /** Salva no slot as peças que o personagem veste agora (C3.6). Não mexe no build de talentos/variações nem no ativo. */
  private salvarEquipLoadout(sid: string, pl: Player, p: { slot?: unknown }) {
    const i = this.slotBuild(p);
    if (i === null) return;
    const bloqueio = this.loadoutBloqueio(pl);
    if (bloqueio) return this.notify(sid, bloqueio);
    const cls = pl.cls as CharClass;
    const inv = pl.inv;
    const build: EquipBuild = {};
    for (const s of EQUIP_SLOTS) {
      const id = inv.equip[s];
      if (!id) continue;
      const af = inv.equipAf?.[s], rf = inv.equipRf?.[s], gm = inv.equipGm?.[s];
      build[s] = { id, ...(af?.length ? { af: [...af] } : {}), ...(rf ? { rf } : {}), ...(gm?.length ? { gm: [...gm] } : {}) };
    }
    const lo: Loadouts = limparLoadouts(pl.loadouts, cls);
    lo.slots[i] = { ...lo.slots[i], equipSalvo: true, equip: build };
    this.gravarLoadouts(pl, lo);
    this.notifyOk(sid, `Equipamento salvo em ${lo.slots[i].nome}.`);
  }

  /** Veste o conjunto salvo no slot (C3.6): peça que não existe mais é ignorada; nada é duplicado nem perdido. */
  private aplicarEquipLoadout(sid: string, pl: Player, p: { slot?: unknown }) {
    const i = this.slotBuild(p);
    if (i === null) return;
    const bloqueio = this.loadoutBloqueio(pl);
    if (bloqueio) return this.notify(sid, bloqueio);
    if (pl.trading || pl.marketBusy) return this.notify(sid, pl.trading ? "Termine ou cancele a troca primeiro." : "Aguarde a operação do mercado.");
    const cls = pl.cls as CharClass;
    const lo: Loadouts = limparLoadouts(pl.loadouts, cls);
    const slot = lo.slots[i];
    if (!slot.equipSalvo) return this.notify(sid, "Este slot não tem equipamento salvo: salve um conjunto nele primeiro.");
    const r = aplicarEquipBuild(pl.inv, slot.equip ?? {}, cls, pl.level);
    if (!r.ok) return this.notify(sid, r.error);
    pl.invDirty = true;
    this.refreshStats(pl);
    this.sendInv(sid, pl);
    this.questsDaMochila(sid, pl);
    this.notifyOk(sid, r.faltando.length ? `${slot.nome} aplicado; ${r.faltando.length} peça(s) não estão mais com você e foram ignoradas.` : `${slot.nome} (equipamento) aplicado.`);
  }

  /** Grava os builds em fila (a última gravação é sempre a mais nova) e manda o estado ao cliente. */
  private gravarLoadouts(pl: Player, lo: Loadouts) {
    pl.loadouts = JSON.stringify(lo);
    if (!pl.charId) return;
    const charId = pl.charId, json = pl.loadouts;
    pl.saveChain = pl.saveChain.then(() => this.repo.setLoadouts(charId, json)).catch((err) => console.error("[db] falha ao gravar os builds:", (err as Error).message));
  }

  private queueAct(p: Player, a: ActionId, ax: number, ay: number) { p.queued = { a, ax, ay, until: this.t + 0.5 }; }

  private sendTo(id: string, evt: string, payload: unknown) { this.clients.getById(id)?.send(evt, payload); }

  private doAction(id: string, p: Player, a: ActionId, ax: number, ay: number) {
    const mods = modificadoresDaEscolha(limparEscolhas(p.variacoes, p.cls as CharClass, p.level)); // variações escolhidas (C2.2)
    const def: ActionDef = effectiveAction(classAction(p.cls as CharClass, a, p.qMode, mods), a, p.gear.kit, p.gear.cdr); // o kit da arma e as botas ajustam a ação
    if (a === "attack" && p.gear.af.atkSpeed > 0) def.cd *= 1 - p.gear.af.atkSpeed / 100; // Punhos Rápidos (afixo): só o ataque básico
    if (this.t < p.stunUntil) return; // atordoado (PvP ou puxado): não age
    const left = (p.cdUntil[a] ?? 0) - this.t;
    if (left > 0.05) { // em recarga (tolerância de rede)
      if (left <= 0.25) this.queueAct(p, a, ax, ay); // quase pronta: guarda o comando em vez de perdê-lo
      else this.sendTo(id, Evt.ActDenied, { a });
      return;
    }
    if (p.dashLeft > 0) return this.queueAct(p, a, ax, ay); // durante a esquiva/investida: o comando espera o fim do deslocamento
    if (a !== "dodge") this.breakShield(p); // atacar ou usar habilidade estoura a bolha de chegada

    // Ressurgir sem ninguém caído por perto: avisa e NÃO gasta a recarga
    const fallen = def.kind === "revive" ? this.nearestDead(p, def.radius ?? 0) : null;
    if (def.kind === "revive" && !fallen) { this.sendTo(id, Evt.ActDenied, { a }); return this.notify(id, "Ninguém caído por perto."); }

    // custo do recurso: sem o suficiente a ação NÃO acontece e a recarga NÃO é gasta
    const cost = def.cost ?? 0;
    if (cost > 0) {
      if (p.manaF < cost) { this.sendTo(id, Evt.ActDenied, { a }); return this.notify(id, `${this.classOf(p).resource.name} insuficiente.`); }
      p.manaF -= cost;
      p.mana = Math.floor(p.manaF);
    }

    this.interruptPvp(id, p, "act"); // agir cancela a canalização do PvP
    let dx = ax - p.x, dy = ay - p.y;
    const aimDist = Math.hypot(dx, dy);
    if (aimDist < 0.01) { dx = Math.cos(p.face); dy = Math.sin(p.face); } else { dx /= aimDist; dy /= aimDist; }
    p.face = Math.atan2(dy, dx);
    p.cdUntil[a] = this.t + (a === "attack" ? def.cd / Math.max(0.2, p.atkSpeed * (this.t < p.hasteUntil ? 1 + p.hastePct : 1)) : def.cd); // ataque básico: intervalo pela velocidade de ataque
    if (a !== "attack" && a !== "dodge") this.questUso(id, p, a); // a habilidade disparou (quests "usar")
    p.tx = p.x; // ação interrompe o movimento
    p.ty = p.y;

    this.broadcast(Evt.Swing, { id, a, x: p.x, y: p.y, dir: p.face });

    // poder = nível * arma * Brasa de um aliado (vale para dano e cura)
    const power = dmgMult(p.level, p.gear.dmgPct) * (this.t < p.emberUntil ? 1 + p.emberPct / 100 : 1);
    const dmg = (def.dmg ?? 0) * power;
    // ponto de colocação (armadilha/chuva): onde o jogador mira, limitado ao alcance
    const place = () => {
      const d = Math.min(aimDist < 0.01 ? (def.placeRange ?? 0) * 0.5 : aimDist, def.placeRange ?? 0);
      return { x: clamp(p.x + dx * d, 0, this.zone.w - 1), y: clamp(p.y + dy * d, 0, this.zone.h - 1) };
    };

    switch (def.kind) {
      case "melee":
      case "ring": {
        const cx = p.x + dx * (def.offset ?? 0), cy = p.y + dy * (def.offset ?? 0);
        const n = this.hitEnemies(id, dmg, (e) => dist(e.x, e.y, cx, cy) <= (def.radius ?? 1) + enemyKind(e.kind).radius);
        if (n > 0 && def.hitHeal) this.healPlayer(id, p, Math.round(def.hitHeal * power)); // golpe que acerta cura um pouco (Guerreiro)
        this.hitPlayers(id, dmg, (o) => dist(o.x, o.y, cx, cy) <= (def.radius ?? 1) + PLAYER_RADIUS, def);
        break;
      }
      case "dashHit": {
        const ex = p.x + dx * (def.dash ?? 0), ey = p.y + dy * (def.dash ?? 0);
        const sx = p.x, sy = p.y;
        this.hitEnemies(id, dmg, (e) => {
          const hit = distToSegment(e.x, e.y, sx, sy, ex, ey) <= (def.radius ?? 1) + enemyKind(e.kind).radius;
          if (hit && def.stunS) this.stunEnemy(e, def.stunS);
          return hit;
        });
        this.hitPlayers(id, dmg, (o) => distToSegment(o.x, o.y, sx, sy, ex, ey) <= (def.radius ?? 1) + PLAYER_RADIUS, def);
        this.startDash(p, dx, dy, def);
        break;
      }
      case "tauntBuff":
      case "reflectBuff": {
        p.buffUntil = this.t + (def.buffS ?? 0);
        p.buffRed = def.reduction ?? 0;
        p.buff = true;
        p.provokeUntil = this.t + (def.tauntS ?? 0); // provocação do próprio Guerreiro (buff na UI)
        if (def.kind === "reflectBuff") { p.reflectUntil = p.buffUntil; p.reflectPct = def.reflect ?? 0; p.reflect = true; }
        this.state.enemies.forEach((e) => {
          if (e.st !== "dead" && dist(e.x, e.y, p.x, p.y) <= (def.tauntRadius ?? 0)) {
            e.tauntId = id;
            e.tauntUntil = this.t + (def.tauntS ?? 0);
          }
        });
        break;
      }
      case "dodge": {
        p.invulnUntil = this.t + (def.invulnS ?? 0);
        this.startDash(p, dx, dy, def);
        break;
      }
      case "blast":
      case "projectile": {
        const pid = `j${++this.seq}`;
        const sx = p.x + dx * 0.6, sy = p.y + dy * 0.6;
        const look = def.kind === "blast" ? "fire" : def.pierce ? "pierce" : p.cls === "mage" ? "arcane" : p.cls === "cleric" ? "bolt" : "arrow";
        const blast = def.kind === "blast" ? def.blast ?? 2 : 0;
        this.projs.push({ id: pid, owner: id, x: sx, y: sy, dx, dy, speed: def.speed ?? 12, left: def.range ?? 8, radius: def.radius ?? 0.4, dmg, pierce: !!def.pierce, blast, hit: new Set(), shredPct: def.shredPct, shredS: def.shredS, burnDmg: def.burnPct ? Math.max(1, Math.round((dmg * def.burnPct) / 100)) : undefined, burnS: def.burnS, slowPct: def.slowPct, slowS: def.slowS });
        this.broadcast(Evt.Proj, { id: pid, x: sx, y: sy, dir: p.face, speed: def.speed ?? 12, range: def.range ?? 8, look, blast: blast || undefined });
        break;
      }
      case "trap": {
        const mine = this.traps.filter((tr) => tr.owner === id);
        while (mine.length >= (def.maxActive ?? 3)) { // passou do limite: a mais antiga some
          const old = mine.shift()!;
          this.removeTrap(old, "gone");
        }
        const pos = place();
        const tr: Trap = { id: `t${++this.seq}`, owner: id, x: pos.x, y: pos.y, r: def.radius ?? 1.5, dmg, armAt: this.t + (def.armS ?? 0.5), expireAt: this.t + (def.lifeS ?? 20), slowPct: def.slowPct, slowS: def.slowS };
        this.traps.push(tr);
        this.broadcast(Evt.Trap, { id: tr.id, s: "set", x: tr.x, y: tr.y, r: tr.r });
        break;
      }
      case "rain": {
        const pos = place();
        const r = def.radius ?? 2;
        const delay = def.delayS ?? 0.8;
        this.broadcast(Evt.Telegraph, { id: `r${++this.seq}`, x: pos.x, y: pos.y, r, ms: delay * 1000, friendly: true, fx: def.fx });
        this.pending.push({ at: this.t + delay, run: () => {
          let hits = 0;
          this.hitEnemies(id, dmg, (e) => {
            const hit = dist(e.x, e.y, pos.x, pos.y) <= r + enemyKind(e.kind).radius;
            if (hit && def.stunS) this.stunEnemy(e, def.stunS);
            if (hit && def.rootS) this.rootEnemy(e, def.rootS);
            if (hit && def.slowPct) this.slowEnemy(e, def.slowPct, def.slowS ?? 3);
            if (hit && def.burnPct) this.burnEnemy(e, id, Math.max(1, Math.round((dmg * def.burnPct) / 100)), def.burnS ?? 0);
            if (hit) hits++;
            return hit;
          });
          if (hits > 0 && def.hasteAtkPct) { p.hasteUntil = this.t + (def.hasteS ?? 5); p.hastePct = def.hasteAtkPct / 100; } // acertou: o ataque básico acelera
          this.hitPlayers(id, dmg, (o) => dist(o.x, o.y, pos.x, pos.y) <= r + PLAYER_RADIUS, def);
        } });
        break;
      }
      case "pull": {
        const pos = place();
        const r = def.radius ?? 4;
        const until = this.t + (def.pullS ?? 0.4);
        this.state.enemies.forEach((e) => {
          if (e.st === "dead" || dist(e.x, e.y, pos.x, pos.y) > r + enemyKind(e.kind).radius) return;
          e.pullUntil = until;
          e.pullX = pos.x;
          e.pullY = pos.y;
          e.st = "recover"; // cancela o golpe que ele preparava e o deixa atordoado depois da puxada
          e.recoverEnd = until + (def.stunS ?? 1);
        });
        this.state.players.forEach((o, oid) => { // PvP: o mesmo efeito nos inimigos jogadores (puxa e atordoa depois)
          if (!this.canPvpHit(id, o, oid) || dist(o.x, o.y, pos.x, pos.y) > r + PLAYER_RADIUS) return;
          o.pullUntil = until;
          o.pullX = pos.x;
          o.pullY = pos.y;
          o.stunUntil = Math.max(o.stunUntil, until + (def.stunS ?? 1));
          this.interruptPvp(oid, o, "damage");
        });
        this.broadcast(Evt.Telegraph, { id: `r${++this.seq}`, x: pos.x, y: pos.y, r, ms: (def.pullS ?? 0.4) * 1000, friendly: true });
        break;
      }
      case "healAoe": {
        const base = (def.heal ?? 0) * power;
        let healed = 0;
        this.state.players.forEach((o, oid) => {
          if (o.dead || this.hostile(id, p, oid, o) || dist(o.x, o.y, p.x, p.y) > (def.radius ?? 0)) return;
          this.healPlayer(oid, o, Math.round(base * this.healStackMult(o))); // área: sem "from" (só a cura focada desenha o raio do curandeiro)
          if (def.guardPct) this.grantGuard(o, def.guardPct, def.guardS ?? 0);
          if (def.cleanse) { o.stunUntil = 0; o.rootUntil = 0; } // purifica: aliado curado sai do atordoamento e das raízes
          healed++;
        });
        if (healed > 0 && def.manaGain) { // curar devolve mana ao Clérigo
          p.manaF = Math.min(p.maxMana, p.manaF + def.manaGain);
          p.mana = Math.floor(p.manaF);
        }
        break;
      }
      case "healFocus": { // um só alvo: o jogador vivo mais perto da mira (até 2,2 tiles dela) dentro do alcance; sem ninguém ali, cura a si mesmo
        let target: [string, Player] = [id, p], bestD = Infinity;
        this.state.players.forEach((o, oid) => {
          if (o.dead || o.traveling || this.hostile(id, p, oid, o) || dist(o.x, o.y, p.x, p.y) > (def.range ?? 9)) return;
          const d = dist(o.x, o.y, ax, ay);
          if (d <= 2.2 && d < bestD) { bestD = d; target = [oid, o]; }
        });
        const [tid, t] = target;
        this.healPlayer(tid, t, Math.round((def.heal ?? 0) * power * this.healStackMult(t)), id); // acúmulos atuais valem para esta cura
        if (def.stackMax) this.addHealStack(t, def.stackMax, def.stackPct ?? 0, def.stackS ?? 0); // e este uso soma mais um
        break;
      }
      case "emberBuff": {
        this.state.players.forEach((o, oid) => {
          if (!o.dead && !this.hostile(id, p, oid, o) && dist(o.x, o.y, p.x, p.y) <= (def.radius ?? 0)) {
            o.emberUntil = this.t + (def.buffS ?? 0);
            o.emberPct = def.dmgPct ?? 0;
            o.ember = true;
          }
        });
        break;
      }
      case "revive": {
        const [fid, f] = fallen!;
        f.dead = false;
        f.hp = Math.max(1, Math.ceil((f.maxHp * (def.hpPct ?? 50)) / 100));
        f.invulnUntil = this.t + 1.5; // um instante para se reorganizar
        f.tx = f.x;
        f.ty = f.y;
        this.broadcast(Evt.Heal, { id: fid, amount: f.hp, x: f.x, y: f.y, revive: true });
        break;
      }
    }
    if (def.selfHeal) this.healPlayer(id, p, Math.round(def.selfHeal * power)); // cura do próprio jogador ao usar (Guerreiro)
  }

  /** Bloqueia só a REGENERAÇÃO AUTOMÁTICA em repouso: apanhou há pouco, ou algum inimigo vivo está focando este jogador. Poções, habilidades de cura e aliados não passam por aqui. */
  private healBlocked(id: string, p: Player): boolean {
    if (this.t - p.hurtAt < HEAL_BLOCK_AFTER_HIT_S) return true;
    let focused = false;
    this.state.enemies.forEach((e: Enemy) => { if (!focused && e.targetId === id && (e.st === "chase" || e.st === "windup" || e.st === "recover")) focused = true; });
    return focused;
  }

  private healPlayer(id: string, p: Player, amount: number, from?: string) {
    const before = p.hp;
    p.hp = Math.min(p.maxHp, p.hp + Math.round(amount * (1 + p.gear.af.healPct / 100))); // Bênção (afixo): cura mais
    const healed = p.hp - before;
    if (healed > 0) this.broadcast(Evt.Heal, { id, amount: healed, x: p.x, y: p.y, from });
  }

  /** Atordoa o inimigo (não age até acabar; cancela o golpe que preparava). Chefes resistem: a duração cai para BOSS_CC_RESIST. */
  private stunEnemy(e: Enemy, s: number) {
    if (e.st === "dead") return;
    const until = this.t + s * (enemyKind(e.kind).boss ? BOSS_CC_RESIST : 1);
    if (until <= e.stunUntil) return;
    e.stunUntil = until;
    if (e.st === "windup") { e.st = "recover"; e.slam = false; e.recoverEnd = until; }
  }

  /** Quebra a armadura: o inimigo recebe +pct% de dano de todas as fontes por s segundos (chefes: metade do bônus). */
  private shredEnemy(e: Enemy, pct: number, s: number) {
    if (e.st === "dead") return;
    const k = enemyKind(e.kind).boss ? 0.5 : 1;
    e.shredPct = Math.max(this.t < e.shredUntil ? e.shredPct : 0, (pct / 100) * k);
    e.shredUntil = this.t + s;
  }

  /** Lentidão: o inimigo anda -pct% por s segundos (chefes resistem: força e duração caem para BOSS_CC_RESIST). */
  private slowEnemy(e: Enemy, pct: number, s: number) {
    if (e.st === "dead") return;
    const boss = !!enemyKind(e.kind).boss;
    e.slowPct = Math.max(this.t < e.slowUntil ? e.slowPct : 0, (pct / 100) * (boss ? BOSS_CC_RESIST : 1));
    e.slowUntil = this.t + s * (boss ? BOSS_CC_RESIST : 1);
  }

  /** Enraíza o inimigo (não anda; se o alvo estiver ao alcance, ainda ataca). Chefes resistem. */
  private rootEnemy(e: Enemy, s: number) {
    if (e.st === "dead") return;
    e.rootUntil = Math.max(e.rootUntil, this.t + s * (enemyKind(e.kind).boss ? BOSS_CC_RESIST : 1));
  }

  private startDash(p: Player, dx: number, dy: number, def: ActionDef) {
    if (this.t < p.rootUntil) return; // enraizado: não se desloca (a ação do golpe continua valendo)
    const time = def.dashTime ?? 0.25;
    const speed = (def.dash ?? 0) / time;
    p.dashVx = dx * speed;
    p.dashVy = dy * speed;
    p.dashLeft = time;
  }

  // ------------------------------------------------------------------ projéteis e armadilhas
  private updateProjectiles(dt: number) {
    for (let i = this.projs.length - 1; i >= 0; i--) {
      const pr = this.projs[i];
      const step = Math.min(pr.speed * dt, pr.left);
      const nx = pr.x + pr.dx * step, ny = pr.y + pr.dy * step;
      // alvos no trecho percorrido neste tick (teste por segmento: a flecha rápida não "atravessa" sem acertar)
      const cands: [number, string, Enemy | Player][] = [];
      this.state.enemies.forEach((e, eid) => {
        if (e.st === "dead" || pr.hit.has(eid)) return;
        if (distToSegment(e.x, e.y, pr.x, pr.y, nx, ny) <= pr.radius + enemyKind(e.kind).radius) cands.push([dist(e.x, e.y, pr.x, pr.y), eid, e]);
      });
      this.state.players.forEach((o, oid) => { // jogadores em PvP (as regras de quem pode ser alvo ficam em canPvpHit)
        if (pr.hit.has(oid) || !this.canPvpHit(pr.owner, o, oid)) return;
        if (distToSegment(o.x, o.y, pr.x, pr.y, nx, ny) <= pr.radius + PLAYER_RADIUS) cands.push([dist(o.x, o.y, pr.x, pr.y), oid, o]);
      });
      cands.sort((a, b) => a[0] - b[0]);
      let ended = false;
      if (pr.blast > 0 && cands.length) { // projétil explosivo: não fere direto, explode no primeiro alvo atingido
        const [, , first] = cands[0];
        pr.x = first.x; pr.y = first.y;
        this.explodeBlast(pr);
        this.projs.splice(i, 1);
        this.broadcast(Evt.ProjEnd, { id: pr.id, x: pr.x, y: pr.y, hit: true });
        continue;
      }
      for (const [, eid, e] of cands) {
        pr.hit.add(eid);
        if (e instanceof Player) this.damagePvp(pr.owner, eid, e, pr.dmg);
        else { this.damageEnemy(pr.owner, eid, e, pr.dmg); if (pr.shredPct) this.shredEnemy(e, pr.shredPct, pr.shredS ?? 5); if (pr.burnDmg) this.burnEnemy(e, pr.owner, pr.burnDmg, pr.burnS ?? 0); if (pr.slowPct) this.slowEnemy(e, pr.slowPct, pr.slowS ?? 3); }
        if (!pr.pierce) { ended = true; break; } // flecha comum para no primeiro alvo
      }
      pr.x = nx;
      pr.y = ny;
      pr.left -= step;
      if (ended || pr.left <= 0.001 || nx < 0 || ny < 0 || nx > this.zone.w - 1 || ny > this.zone.h - 1) {
        if (pr.blast > 0) { pr.x = clamp(pr.x, 0, this.zone.w - 1); pr.y = clamp(pr.y, 0, this.zone.h - 1); this.explodeBlast(pr); ended = true; } // fim do alcance: explode no chão
        this.projs.splice(i, 1);
        this.broadcast(Evt.ProjEnd, { id: pr.id, x: pr.x, y: pr.y, hit: ended });
      }
    }
  }

  /** explosão de um projétil "blast": fere inimigos e (em PvP) jogadores numa área ao redor do ponto final */
  private explodeBlast(pr: Proj) {
    this.hitEnemies(pr.owner, pr.dmg, (e) => {
      const hit = dist(e.x, e.y, pr.x, pr.y) <= pr.blast + enemyKind(e.kind).radius;
      if (hit && pr.burnDmg) this.burnEnemy(e, pr.owner, pr.burnDmg, pr.burnS ?? 0);
      if (hit && pr.slowPct) this.slowEnemy(e, pr.slowPct, pr.slowS ?? 3); // Bola de Fogo: lentidão na área da explosão
      return hit;
    });
    this.hitPlayers(pr.owner, pr.dmg, (o) => dist(o.x, o.y, pr.x, pr.y) <= pr.blast + PLAYER_RADIUS);
  }

  private removeTrap(tr: Trap, s: "boom" | "gone") {
    this.traps = this.traps.filter((x) => x !== tr);
    this.broadcast(Evt.Trap, { id: tr.id, s, x: tr.x, y: tr.y, r: tr.r });
  }

  private updateTraps() {
    for (const tr of [...this.traps]) {
      if (this.t >= tr.expireAt) { this.removeTrap(tr, "gone"); continue; }
      if (this.t < tr.armAt) continue;
      let trigger = false;
      this.state.enemies.forEach((e) => { if (e.st !== "dead" && dist(e.x, e.y, tr.x, tr.y) <= tr.r + enemyKind(e.kind).radius) trigger = true; });
      this.state.players.forEach((o, oid) => { if (this.canPvpHit(tr.owner, o, oid) && dist(o.x, o.y, tr.x, tr.y) <= tr.r + PLAYER_RADIUS) trigger = true; });
      if (!trigger) continue;
      this.removeTrap(tr, "boom");
      this.hitEnemies(tr.owner, tr.dmg, (e) => {
        const hit = dist(e.x, e.y, tr.x, tr.y) <= tr.r + enemyKind(e.kind).radius;
        if (hit && tr.slowPct) this.slowEnemy(e, tr.slowPct, tr.slowS ?? 4);
        return hit;
      });
      this.hitPlayers(tr.owner, tr.dmg, (o) => dist(o.x, o.y, tr.x, tr.y) <= tr.r + PLAYER_RADIUS);
    }
  }

  // ------------------------------------------------------------------ dano e recompensas
  private damageEnemy(by: string, eid: string, e: Enemy, baseDmg: number, refl = false) {
    if (e.st === "dead") return;
    if (this.t < e.shredUntil) baseDmg *= 1 + e.shredPct; // armadura quebrada: toda fonte de dano ganha o bônus
    // afixos de quem bate (o reflexo e o dano de inimigos não usam os afixos de quem está por perto)
    const attG = refl ? undefined : this.state.players.get(by)?.gear;
    if (attG) {
      if (attG.af.execute > 0 && e.hp < e.maxHp * 0.25) baseDmg *= 1 + attG.af.execute / 100; // Execução: inimigo com pouca vida
      if (attG.af.bossPct > 0 && enemyKind(e.kind).boss) baseDmg *= 1 + attG.af.bossPct / 100; // Caçador de Chefes
    }
    const fixo = danoFixo();
    const crit = !refl && !fixo && Math.random() < this.critChance(by);
    const variance = fixo ? 1 : 1 + (Math.random() * 2 - 1) * DAMAGE_VARIANCE;
    const dmg = Math.max(1, Math.round(baseDmg * variance * (crit ? CRIT.mult + (attG?.af.critDmg ?? 0) / 100 : 1)));
    const shown = Math.min(dmg, e.hp);
    e.hp = Math.max(0, e.hp - dmg);
    e.contrib.set(by, (e.contrib.get(by) ?? 0) + shown); // o dano real define a elegibilidade a XP e loot
    e.lastHurt = this.t; // o dano recebido SEMPRE conta: nada de regenerar enquanto apanha
    if (!e.fightStart) { e.fightStart = this.t; e.nextPulse = this.t + (enemyKind(e.kind).boss?.pulseEveryS ?? 0); }
    const att = this.state.players.get(by);
    if (att) { att.combatAt = this.t; this.breakShield(att); }
    if (attG && att && shown > 0 && attG.af.lifesteal > 0) this.healPlayer(by, att, Math.max(1, Math.round(shown * attG.af.lifesteal / 100))); // Roubo de Vida (proc de afixo)
    if (attG && e.hp > 0 && attG.af.burnChance > 0 && Math.random() * 100 < attG.af.burnChance) this.burnEnemy(e, by, Math.max(1, Math.round(dmg * 0.2)), 3); // Queimadura ao Acertar (proc de afixo)
    if (!e.targetId && e.st !== "evade") e.targetId = by; // quem bate chama a atenção (inimigo voltando para casa ignora)
    this.broadcast(Evt.Hit, { k: "e", id: eid, dmg, crit, x: e.x, y: e.y, by, refl: refl || undefined });
    if (e.hp > 0) return;
    e.st = "dead";
    e.respawnAt = this.t + enemyKind(e.kind).respawnS;
    e.targetId = "";
    this.broadcast(Evt.Died, { k: "e", id: eid });
    const K = enemyKind(e.kind);
    const els = this.eligible(e);
    this.rewardKill(e, K.boss ? K.name : "", els);
    e.contrib.clear();
    e.fightStart = 0;
  }

  /**
   * Quem é ELEGÍVEL a XP e loot de um abate (nunca "todo mundo por perto"):
   *  1) quem causou pelo menos ELIGIBLE_DMG_PCT da vida máxima do alvo (vivo, a até 2x SHARE_RADIUS);
   *  2) os colegas de grupo (vivos, a até 1,5x SHARE_RADIUS do alvo) de qualquer elegível do passo 1.
   * Passante sem grupo e sem dano relevante não recebe nada. Ordem estável (por sessão) para o rodízio.
   */
  private eligible(e: Enemy, pct = ELIGIBLE_DMG_PCT): [string, Player][] {
    const min = Math.max(1, e.maxHp * pct);
    const out = new Map<string, Player>();
    const parties = new Set<string>();
    e.contrib.forEach((dmg, sid) => {
      const pl = this.state.players.get(sid);
      if (!pl || pl.dead || pl.traveling || dmg < min || dist(pl.x, pl.y, e.x, e.y) > SHARE_RADIUS * 2) return;
      out.set(sid, pl);
      if (pl.party) parties.add(pl.party);
    });
    if (parties.size) this.state.players.forEach((pl, sid) => {
      if (!out.has(sid) && pl.party && parties.has(pl.party) && !pl.dead && !pl.traveling && dist(pl.x, pl.y, e.x, e.y) <= SHARE_RADIUS * 1.5) out.set(sid, pl);
    });
    return [...out].sort((a, b) => (a[0] < b[0] ? -1 : 1));
  }

  private lootRr = 0; // rodízio dos itens entre os elegíveis (um item por vez, em ordem)

  /**
   * XP, tostões e itens de um abate. Cada GRUPO elegível divide o XP (pool = base x partyXpMult(membros), em partes iguais) e os tostões;
   * quem está fora de grupo recebe o valor cheio. Os itens saem por rodízio entre todos os elegíveis, com dono exclusivo durante a reserva
   * (depois, qualquer um pega). No chefe, cada elegível tem a SUA rolagem do baú.
   */
  private rewardKill(e: Enemy, bossName: string, els: [string, Player][]) {
    const K = enemyKind(e.kind);
    const units = new Map<string, [string, Player][]>(); // grupo (ou a sessão, se solo) -> membros elegíveis
    for (const m of els) { const k = m[1].party || `solo:${m[0]}`; units.set(k, [...(units.get(k) ?? []), m]); }
    const baseXp = enemyXp(e.level) * (K.boss?.xpMul ?? 1) * mulXp(e.kind); // balanceamento: XP do tipo x geral (1 = padrão)
    for (const members of units.values()) {
      const n = members.length;
      const xpEach = Math.round((baseXp * partyXpMult(n)) / n);
      const ironEach = Math.max(1, Math.round(((K.boss ? bossIron(e.level) : mobIron(e.level)) * mulTostoes(e.kind)) / n));
      for (const [pid, pl] of members) {
        const xpMine = Math.round(xpEach * (1 + pl.gear.af.xpPct / 100)); // Sabedoria (afixo)
        const ironMine = Math.max(1, Math.round(ironEach * (1 + pl.gear.af.goldPct / 100))); // Mão Gananciosa (afixo)
        this.addXp(pid, pl, xpMine);
        if (pl.gear.af.hpOnKill > 0) this.healPlayer(pid, pl, pl.gear.af.hpOnKill); // Colheita de Almas (afixo)
        if (pl.gear.af.manaOnKill > 0) pl.manaF = Math.min(pl.maxMana, pl.manaF + pl.gear.af.manaOnKill); // Essência Drenada (afixo)
        if (!this.abatesRegistrados.has(pl.charId)) {
          this.abatesRegistrados.add(pl.charId);
          void registrarEvento(this.repo.db, "primeiro_abate", { contaId: this.userIds.get(pid), personagemId: pl.charId, dados: { nivel: pl.level, zona: this.zone.id } });
        }
        this.questAbate(pid, pl, e.kind, this.zone.id); // quests: conta o abate (só para quem é elegível, como o XP)
        this.clients.getById(pid)?.send(Evt.Xp, { amount: xpMine, x: e.x, y: e.y });
        const iron = addCoins(pl.inv, "iron", ironMine);
        if (iron > 0) { pl.invDirty = true; this.sendInv(pid, pl); this.clients.getById(pid)?.send(Evt.Coins, { iron, obols: 0, x: e.x, y: e.y }); }
      }
    }
    if (K.boss) return this.openBossChest(e, bossName, els);
    const drops = rollMobLoot(this.zone, Math.random, (els[0]?.[1].cls ?? "warrior") as CharClass, e.level, e.kind);
    if (!els.length) { this.spawnGround(drops, e.x, e.y, "", 0); return; } // ninguém elegível (ex.: dano de quem já saiu): fica livre
    const per = new Map<string, Drop[]>();
    for (const d of drops) { const [sid] = els[this.lootRr++ % els.length]; per.set(sid, [...(per.get(sid) ?? []), d]); }
    for (const [sid, ds] of per) this.spawnGround(ds, e.x, e.y, sid, this.lockSeconds(LOOT_LOCK_S), false);
  }

  /** O baú do chefe: cada elegível tem a SUA rolagem, reservada a ele; o centro da tela mostra a animação da melhor raridade. */
  private openBossChest(e: Enemy, name: string, els: [string, Player][]) {
    this.broadcast(Evt.Notice, { text: `${name} foi derrotado!` });
    let best: Rarity = "common";
    for (const [pid, pl] of els) {
      const drops = rollChestLoot(this.zone, Math.random, pl.cls as CharClass);
      for (const d of drops) if (ITEMS[d.id] && rarityIndex(ITEMS[d.id].rarity) > rarityIndex(best)) best = ITEMS[d.id].rarity;
      this.spawnGround(drops, e.x, e.y, pid, this.lockSeconds(CHEST_LOCK_S), false);
    }
    this.broadcast(Evt.Chest, { x: e.x, y: e.y, rarity: best, boss: name });
  }

  /** Acerta os inimigos da área. Devolve quantos foram atingidos (o golpe que acerta pode curar o dono: hitHeal). */
  private hitEnemies(by: string, baseDmg: number, inArea: (e: Enemy, eid: string) => boolean): number {
    let n = 0;
    this.state.enemies.forEach((e, eid) => {
      if (e.st === "dead" || !inArea(e, eid)) return;
      n++;
      this.damageEnemy(by, eid, e, baseDmg);
    });
    return n;
  }

  /** Queimadura (Mago): o inimigo recebe `dmg` por segundo por `s` segundos (chefes resistem como nos outros CCs). Renova a duração; não acumula: só vale o maior dano por segundo. */
  private burnEnemy(e: Enemy, by: string, dmg: number, s: number) {
    if (e.st === "dead" || s <= 0) return;
    const boss = !!enemyKind(e.kind).boss;
    const active = this.t < e.burnUntil;
    e.burnDmg = Math.max(active ? e.burnDmg : 0, dmg);
    e.burnBy = by;
    e.burnUntil = this.t + s * (boss ? BOSS_CC_RESIST : 1);
    if (!active) e.nextBurn = this.t + 1; // o primeiro tick vem 1 s depois de acender
  }

  /** Dano da queimadura: um tick por segundo enquanto houver. Conta como dano normal (XP, loot, regeneração e crítico). */
  private tickBurn(eid: string, e: Enemy) {
    if (this.t < e.burnUntil && this.t >= e.nextBurn) {
      e.nextBurn = this.t + 1;
      this.damageEnemy(e.burnBy, eid, e, e.burnDmg);
    }
    e.burning = this.t < e.burnUntil && e.st !== "dead";
  }

  /** Acúmulos de Cura Focada: cada uso no aliado soma 1 (até max), e cada acúmulo aumenta as curas do Clérigo nele. Some sozinho depois de `s` sem novo uso. */
  private healStackMult(o: Player): number {
    if (this.t >= o.healStackUntil) { o.healStacks = 0; o.healStackPct = 0; }
    return 1 + (o.healStacks * o.healStackPct) / 100;
  }

  private addHealStack(o: Player, max: number, pct: number, s: number) {
    if (this.t >= o.healStackUntil) o.healStacks = 0;
    o.healStacks = Math.min(max, o.healStacks + 1);
    o.healStackPct = pct;
    o.healStackUntil = this.t + s;
  }

  /** Escudo leve de cura (Cura em Área / Luz Divina): -pct% de dano por s. Usa o maior valor ativo (não soma com o Refletor do Guerreiro). */
  private grantGuard(o: Player, pct: number, s: number) {
    const active = this.t < o.buffUntil;
    o.buffRed = Math.max(active ? o.buffRed : 0, pct / 100);
    o.buffUntil = Math.max(active ? o.buffUntil : 0, this.t + s);
    o.guardUntil = Math.max(o.guardUntil, this.t + s); // só para a UI de buffs
  }

  /** Buffs positivos ativos deste jogador (para o próprio dono ver os ícones). Escudo da chegada e esquiva ficam de fora (já têm seus próprios avisos). */
  private buffList(p: Player): ActiveBuff[] {
    const out: ActiveBuff[] = [];
    const left = (u: number) => Math.round((u - this.t) * 10) / 10;
    if (this.t < p.hasteUntil) out.push({ id: "haste", ate: left(p.hasteUntil) });
    if (this.t < p.healStackUntil && p.healStacks > 0) out.push({ id: "heal_stacks", ate: left(p.healStackUntil), stacks: p.healStacks });
    if (this.t < p.reflectUntil) out.push({ id: "reflect", ate: left(p.reflectUntil) });
    if (this.t < p.guardUntil) out.push({ id: "guard", ate: left(p.guardUntil) });
    if (this.t < p.provokeUntil) out.push({ id: "provoke", ate: left(p.provokeUntil) });
    if (this.t < p.emberUntil) out.push({ id: "ember", ate: left(p.emberUntil) });
    return out;
  }

  /** Manda ao dono a lista de buffs quando ela muda (ou de 1 em 1 s enquanto houver algum, para o tempo não desviar). */
  private syncBuffs(id: string, p: Player) {
    const list = this.buffList(p);
    const sig = list.map((b) => `${b.id}:${b.stacks ?? ""}`).join("|");
    if (sig === p.buffSig && (list.length === 0 || this.t - p.buffSentAt < 1)) return;
    p.buffSig = sig;
    p.buffSentAt = this.t;
    this.clients.getById(id)?.send(Evt.Buffs, { list } satisfies BuffsEvent);
  }

  // ------------------------------------------------------------------ IA do esqueleto
  private nearestPlayer(e: Enemy, maxDist: number, leash: number): [string, Player] | null {
    let best: [string, Player] | null = null;
    let bestD = maxDist;
    this.state.players.forEach((p, id) => {
      if (p.dead || p.traveling || p.shield || (p.gm && p.gmInvis) || dist(p.x, p.y, e.sx, e.sy) > leash) return; // além da coleira ou invisível (Modo Deus): não vira alvo
      const d = dist(e.x, e.y, p.x, p.y);
      if (d < bestD) { bestD = d; best = [id, p]; }
    });
    return best;
  }

  /** Coleira do inimigo (tiles do ponto de origem). ENEMY_LEASH_TEST=n (só fora de produção) a fixa em n: o teste do evade precisa de uma coleira curta. */
  private leashOf(K: ReturnType<typeof enemyKind>): number {
    const o = Number(process.env.ENEMY_LEASH_TEST);
    return process.env.NODE_ENV !== "production" && Number.isFinite(o) && o > 0 ? o : K.leash;
  }

  /** Regeneração do inimigo: só sem apanhar há ENEMY_REGEN.delayS (o chefe é mais lento). Ao encher, esquece quem lutou. */
  private regenEnemy(e: Enemy, boss: boolean, dt: number) {
    if (e.hp >= e.maxHp) return;
    if (this.t - e.lastHurt < (boss ? ENEMY_REGEN.bossDelayS : ENEMY_REGEN.delayS)) return;
    e.hp = Math.min(e.maxHp, e.hp + e.maxHp * (boss ? ENEMY_REGEN.bossPctS : ENEMY_REGEN.pctS) * dt);
    if (e.hp >= e.maxHp) { e.contrib.clear(); e.fightStart = 0; }
  }

  /** Chefe em luta sem nenhum alvo vivo por BOSS_RESET_GRACE_S: volta à vida cheia e esquece a luta. Devolve true quando resetou. */
  private bossResetCheck(e: Enemy, hasTarget: boolean): boolean {
    if (hasTarget) { e.noTargetSince = -1; return false; }
    if (e.noTargetSince < 0) { e.noTargetSince = this.t; return false; }
    if (this.t - e.noTargetSince < BOSS_RESET_GRACE_S) return false;
    e.hp = e.maxHp; e.contrib.clear(); e.fightStart = 0; e.noTargetSince = -1; e.nextSlam = this.t + 6; e.slam = false;
    if (e.st !== "idle" && e.st !== "evade") this.startEvade(e);
    return true;
  }

  /** "Evade": o inimigo desiste da luta e volta para casa SEM voltar a perseguir ninguém (nem provocação) até chegar. Dano recebido continua contando. */
  private startEvade(e: Enemy) {
    e.st = "evade";
    e.targetId = "";
    e.tauntUntil = 0;
    e.slam = false;
  }

  /** Jogadores elegíveis vivos perto do chefe (define o multiplicador de dano: solo e dupla apanham muito mais). */
  private bossGroupSize(e: Enemy): number {
    return this.eligible(e, 0.02).filter(([, p]) => dist(p.x, p.y, e.x, e.y) <= BOSS_COUNT_RADIUS).length;
  }

  /** multiplicador total do dano do chefe agora: tamanho do grupo x fúria por tempo de luta */
  private bossMult(e: Enemy): number {
    return bossDmgMult(this.bossGroupSize(e)) * bossEnrageMult(e.fightStart ? this.t - e.fightStart : 0);
  }

  /** Pulso Sombrio do chefe: telégrafo de 1,5 s e depois dano a todos no raio (ignora esquiva): sem curandeiro e tanque não se sobrevive. */
  private bossPulse(id: string, e: Enemy, B: NonNullable<ReturnType<typeof enemyKind>["boss"]>) {
    e.nextPulse = this.t + B.pulseEveryS;
    this.broadcast(Evt.Telegraph, { id: `${id}-pulso`, x: e.x, y: e.y, r: B.pulseRadius, ms: 1500 });
    this.pending.push({ at: this.t + 1.5, run: () => {
      if (e.st === "dead" || e.st === "evade") return;
      const mult = this.bossMult(e);
      this.state.players.forEach((p, pid) => {
        if (p.dead || p.traveling || dist(p.x, p.y, e.x, e.y) > B.pulseRadius) return;
        this.damagePlayer(pid, p, p.maxHp * B.pulsePct * mult);
      });
    } });
  }

  private updateEnemy(_id: string, e: Enemy, dt: number) {
    if (e.st === "dead") {
      e.burning = false; // morto: a queimadura apaga (ela não renova depois da morte)
      e.burnUntil = 0;
      if (this.t >= e.respawnAt) {
        e.hp = e.maxHp;
        e.x = e.sx;
        e.y = e.sy;
        e.st = "idle";
        e.contrib.clear();
        e.fightStart = 0;
        e.lastHurt = -1e9;
        const KB = enemyKind(e.kind);
        if (KB.boss) { e.nextSlam = this.t + KB.boss.slamEveryS; this.broadcast(Evt.Notice, { text: `${KB.name} despertou!` }); }
      }
      return;
    }

    e.stunned = this.t < e.stunUntil;
    e.rooted = this.t < e.rootUntil;
    e.shredded = this.t < e.shredUntil;
    e.slowed = this.t < e.slowUntil;
    this.tickBurn(_id, e); // queimadura corre mesmo atordoado
    if (e.hp <= 0) return; // a queimadura pode ter matado o inimigo neste tick (morte zera a vida)
    if (e.stunned) return; // atordoado: congelado (depois segue o estado em que estava)

    if (this.t < e.pullUntil) { // puxado para o centro: não age até terminar (depois fica atordoado em "recover")
      const d = dist(e.x, e.y, e.pullX, e.pullY);
      if (d > 0.5) this.moveToward(e, e.pullX, e.pullY, Math.max(d, 0.5) / Math.max(0.05, e.pullUntil - this.t), dt);
      return;
    }

    const K = enemyKind(e.kind);

    if (e.st === "evade") { // voltando para casa: sem alvo, sem provocação; só regenera se ninguém o feriu há alguns segundos
      if (K.boss && e.fightStart && this.bossResetCheck(e, !!this.nearestPlayer(e, K.aggro, this.leashOf(K)))) return; // evadindo e ninguém por perto: reseta
      this.moveToward(e, e.sx, e.sy, K.speed * 1.4, dt);
      this.regenEnemy(e, !!K.boss, dt);
      if (dist(e.x, e.y, e.sx, e.sy) < 0.2) { e.x = e.sx; e.y = e.sy; e.st = "idle"; }
      return;
    }

    // alvo: provocação ativa > quem já está em combate > mais próximo no raio de aggro (e dentro da coleira: quem está além dela não "puxa" o inimigo)
    let target: [string, Player] | null = null;
    const taunter = this.t < e.tauntUntil ? this.state.players.get(e.tauntId) : undefined;
    if (taunter && !taunter.dead && !taunter.traveling && !taunter.shield && !(taunter.gm && taunter.gmInvis)) target = [e.tauntId, taunter];
    else {
      const current = e.targetId ? this.state.players.get(e.targetId) : undefined;
      // Modo Deus invisível: monstro nenhum mantém, mira ou persegue o GM (a escolha de alvo ignora ele)
      if (current && !current.dead && !current.traveling && !current.shield && !(current.gm && current.gmInvis) && dist(e.x, e.y, current.x, current.y) <= K.aggro * 1.5) target = [e.targetId, current];
      else target = this.nearestPlayer(e, K.aggro, this.leashOf(K));
    }
    e.targetId = target ? target[0] : "";
    if (K.boss && e.fightStart && this.bossResetCheck(e, !!target)) return;

    const away = dist(e.x, e.y, e.sx, e.sy) > this.leashOf(K);
    // histerese: passou da coleira OU perdeu o alvo no meio da luta -> evade (volta inteiro para casa antes de agir de novo)
    if ((away || (!target && (e.st === "chase" || e.st === "recover"))) && e.st !== "windup") return this.startEvade(e);

    if (K.boss && e.fightStart && this.t >= e.nextPulse && e.st !== "idle") this.bossPulse(_id, e, K.boss);

    switch (e.st) {
      case "idle":
        if (target) e.st = "chase";
        else if (dist(e.x, e.y, e.sx, e.sy) > 0.5) this.startEvade(e);
        else this.regenEnemy(e, !!K.boss, dt);
        break;

      case "chase": {
        const p = target![1];
        const d = dist(e.x, e.y, p.x, p.y);
        const enraged = !!K.boss && e.hp < e.maxHp * K.boss.enrageAt;
        if (d > K.engage * 0.85) this.moveToward(e, p.x, p.y, K.speed * (enraged ? K.boss!.enrageSpeed : 1), dt);
        if (K.boss && this.t >= e.nextSlam && d <= K.boss.slamRadius + 1.5) { // pancada em área: telégrafo grande em volta do chefe
          e.slam = true;
          e.strikeX = e.x;
          e.strikeY = e.y;
          e.windupEnd = this.t + K.boss.slamWindupS;
          e.nextSlam = this.t + K.boss.slamEveryS * (enraged ? 0.6 : 1);
          e.st = "windup";
          this.broadcast(Evt.Telegraph, { id: _id, x: e.x, y: e.y, r: K.boss.slamRadius, ms: K.boss.slamWindupS * 1000 });
          break;
        }
        if (d <= K.engage) {
          e.slam = false;
          // telégrafo: a área é travada agora; quem sair dela antes do golpe não leva dano
          const dir = Math.atan2(p.y - e.y, p.x - e.x);
          e.face = dir;
          e.strikeX = e.x + Math.cos(dir) * K.strikeOffset;
          e.strikeY = e.y + Math.sin(dir) * K.strikeOffset;
          e.windupEnd = this.t + K.windupS;
          e.st = "windup";
          this.broadcast(Evt.Telegraph, { id: _id, x: e.strikeX, y: e.strikeY, r: K.strikeRadius, ms: K.windupS * 1000 });
        }
        break;
      }

      case "windup":
        if (this.t >= e.windupEnd) {
          const mult = K.boss ? this.bossMult(e) : 1;
          this.state.players.forEach((p, pid) => {
            if (p.dead || this.t < p.invulnUntil) return; // esquiva (i-frames)
            const rad = e.slam && K.boss ? K.boss.slamRadius : K.strikeRadius;
            if (dist(p.x, p.y, e.strikeX, e.strikeY) <= rad + PLAYER_RADIUS) this.damagePlayer(pid, p, enemyDmg(e.level, e.kind) * (e.slam && K.boss ? K.boss.slamMul : 1) * mult, undefined, false, { id: _id, e });
          });
          e.slam = false;
          e.recoverEnd = this.t + K.recoverS;
          e.st = "recover";
        }
        break;

      case "recover":
        if (this.t >= e.recoverEnd) e.st = "chase";
        break;
    }
  }

  private moveToward(e: Enemy, x: number, y: number, speed: number, dt: number) {
    if (this.t < e.rootUntil) return; // enraizado
    const dx = x - e.x, dy = y - e.y;
    const d = Math.hypot(dx, dy);
    if (d < 0.01) return;
    const step = Math.min(d, speed * (this.t < e.slowUntil ? 1 - e.slowPct : 1) * dt);
    e.x += (dx / d) * step;
    e.y += (dy / d) * step;
    e.face = Math.atan2(dy, dx);
  }

  private damagePlayer(id: string, p: Player, baseDmg: number, by?: string, crit = false, src?: { id: string; e: Enemy }) {
    if (this.zone.safe) return; // cidade segura: NINGUÉM leva dano, venha de onde vier (área, armadilha, projétil)
    if (p.shield) return; // bolha de chegada: imune a inimigos, chefes e PvP (também durante o load)
    if (p.gmInvuln || (p.gm && p.gmInvis)) return; // Modo Deus: invulnerável, e invisível não é alvo de nada
    if (p.gear.af.dodge > 0 && Math.random() * 100 < p.gear.af.dodge) return; // Passo Fantasma (afixo): esquivou o golpe
    p.combatAt = this.t; // em combate: a regeneração de vida recomeça só depois de um tempo
    p.regenAcc = 0;
    if (by) { const a = this.state.players.get(by); if (a) a.combatAt = this.t; }
    p.hurtAt = this.t;
    this.interruptPvp(id, p, "damage"); // qualquer dano (inimigo, projétil, habilidade, área) cancela a canalização do PvP
    const reduction = Math.min(0.8, (this.t < p.buffUntil ? p.buffRed : 0) + p.gear.dr / 100);
    if (src && this.t < p.reflectUntil && p.reflectPct > 0) this.damageEnemy(id, src.id, src.e, Math.max(1, baseDmg * p.reflectPct), true); // Escudo Refletor: parte do golpe volta ao atacante
    if (src && p.gear.af.reflect > 0) this.damageEnemy(id, src.id, src.e, Math.max(1, baseDmg * p.gear.af.reflect / 100), true); // afixo Espinhos: devolve parte do golpe
    // Escudo Refletor no PvP: parte do golpe volta ao jogador que atacou (sem "by" na chamada: o reflexo não reflete de novo)
    const attacker = by ? this.state.players.get(by) : undefined;
    if (by && attacker && by !== id && this.t < p.reflectUntil && p.reflectPct > 0 && !attacker.dead) this.damagePlayer(by, attacker, Math.max(1, baseDmg * p.reflectPct));
    if (by && attacker && by !== id && p.gear.af.reflect > 0 && !attacker.dead) this.damagePlayer(by, attacker, Math.max(1, baseDmg * p.gear.af.reflect / 100)); // Espinhos no PvP
    const dmg = Math.max(1, Math.round((baseDmg * (1 - reduction)) / defenseMult(p.level))); // defesa por nível: quem está mais alto leva menos de cada golpe
    p.hp = Math.max(0, p.hp - dmg);
    this.broadcast(Evt.Hit, { k: "p", id, dmg, crit, x: p.x, y: p.y, by });
    if (p.hp <= 0) {
      p.dead = true;
      p.stunUntil = p.rootUntil = p.pullUntil = 0; // morto: os controles acabam
      p.deadUntil = this.t + RESPAWN_S;
      p.tx = p.x;
      p.ty = p.y;
      this.broadcast(Evt.Died, { k: "p", id });
    }
  }
}
