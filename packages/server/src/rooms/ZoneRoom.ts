import { Room, Client, ServerError } from "colyseus";
import {
  Msg, Evt, MoveToPayload, ActPayload, ActionId, ACTION_IDS, ActionDef,
  TICK_RATE, MAX_CLIENTS_PER_ZONE, CHAT_MAX_LEN, ZONES, ZONE_IDS, zoneRoomName, enemyKind, type ZoneDef, type PortalDef,
  CLASS_DEFS, type ClassDef, type CharClass, MOVE_SPEED, RESPAWN_S, SHARE_RADIUS,
  PLAYER_RADIUS, PVP_CHANNEL_S, CRIT, DAMAGE_VARIANCE, clamp, partyXpMult,
  LEVEL_CAP, xpToNext, enemyHp, enemyDmg, enemyXp, maxHpFor, maxManaFor, dmgMult, ITEMS, POTION_COOLDOWN_S, effectiveAction, rarityIndex,
  LOOT_LOCK_S, CHEST_LOCK_S, GROUND_TTL_S, PICKUP_AUTO, PICKUP_REACH, GROUND_MAX, type Rarity,
} from "@frixep/shared";
import { verifySession, type AuthUser } from "../auth.js";
import { Player, Enemy, GroundItem, ZoneState } from "./entities.js";
import type { Repo, CharacterRow } from "../db/repo.js";
import { snapshot, addItem, equipFromSlot, unequip, dropSlot, consumeOne, bonuses, validSlot, sortInventory, type Inventory } from "../game/inventory.js";
import { rollMobLoot, rollChestLoot, type Drop } from "../game/loot.js";
import { parties, type Result } from "../game/party.js";

interface Proj { id: string; owner: string; x: number; y: number; dx: number; dy: number; speed: number; left: number; radius: number; dmg: number; pierce: boolean; blast: number; hit: Set<string> }
interface Trap { id: string; owner: string; x: number; y: number; r: number; dmg: number; armAt: number; expireAt: number }
interface JoinAuth { user: AuthUser; character: CharacterRow; inventory: Inventory }

// uma sessão por conta em TODAS as zonas: conta -> (sala, sessão) atual; a chegada de uma travessia guarda de onde veio
const active = new Map<string, { room: ZoneRoom; sid: string }>();
const arrivals = new Map<string, number>(); // personagem -> zona de origem da travessia (consumido ao entrar)

const dist = (ax: number, ay: number, bx: number, by: number) => Math.hypot(ax - bx, ay - by);

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

export class ZoneRoom extends Room<ZoneState> {
  maxClients = MAX_CLIENTS_PER_ZONE;
  private userIds = new Map<string, string>(); // sessionId -> accountId
  private t = 0; // relógio da simulação (s)
  private repo!: Repo;
  private saver?: ReturnType<typeof setInterval>;
  private zone!: ZoneDef;

  onCreate(options: { repo: Repo }) {
    this.repo = options.repo;
    // a zona vem do NOME da sala (definido no servidor), nunca de opções que o cliente mande
    const zid = ZONE_IDS.find((id) => zoneRoomName(id) === this.roomName) ?? 1;
    this.zone = ZONES[zid];
    this.setState(new ZoneState());
    this.state.zoneId = zid;
    // salva o progresso pendente a cada 30 s (além de ao sair e ao subir de nível)
    this.saver = setInterval(() => void this.saveAll(), 30_000);
    this.setPatchRate(1000 / TICK_RATE);

    this.zone.enemies.forEach((s, i) => {
      const e = new Enemy();
      e.kind = s.kind;
      e.x = e.sx = s.x;
      e.y = e.sy = s.y;
      e.level = s.level;
      e.maxHp = e.hp = enemyHp(s.level, s.kind);
      this.state.enemies.set(`e${i + 1}`, e);
    });

    const b = this.zone.boss; // o chefe da zona (um só): volta sozinho depois de respawnS
    const boss = new Enemy();
    boss.kind = b.kind; boss.x = boss.sx = b.x; boss.y = boss.sy = b.y; boss.level = b.level;
    boss.maxHp = boss.hp = enemyHp(b.level, b.kind);
    boss.nextSlam = 6;
    if (process.env.BOSS_TEST === "1" && process.env.NODE_ENV !== "production") { // só nos testes: chefe de 1 de vida, num canto livre da zona 1
      boss.x = boss.sx = this.zone.w - 4; boss.y = boss.sy = 4;
      boss.maxHp = boss.hp = 1;
    }
    this.state.enemies.set("boss", boss);

    // Cliente envia INTENÇÃO (alvo / ação), nunca posição nem dano. Servidor valida e simula.
    this.onMessage(Msg.MoveTo, (client, p: MoveToPayload) => {
      if (!this.allow(client)) return;
      const pl = this.state.players.get(client.sessionId);
      if (!pl || pl.dead || pl.traveling || !Number.isFinite(p?.x) || !Number.isFinite(p?.y)) return;
      pl.tx = clamp(p.x, 0, this.zone.w - 1);
      pl.ty = clamp(p.y, 0, this.zone.h - 1);
    });

    // Travessia: basta pisar no portal (checado a cada tick); este pedido explícito passa pela MESMA validação de distância
    this.onMessage(Msg.Travel, (client, p: { to?: unknown }) => {
      if (!this.allow(client)) return;
      const pl = this.state.players.get(client.sessionId);
      if (!pl || pl.dead || pl.traveling || typeof p?.to !== "number") return;
      const portal = this.zone.portals.find((q) => q.to === p.to);
      if (!portal || dist(pl.x, pl.y, portal.x, portal.y) > portal.r + 0.5) return this.notify(client.sessionId, "Você está longe demais do portal.");
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
    this.onMessage(Msg.InvDrop, (client, p: { slot?: unknown }) => this.invOp(client, (pl) => dropSlot(pl.inv, p?.slot)));
    // ping: devolve o mesmo carimbo de tempo para o cliente medir a ida e volta. Só ecoa números (nada é interpretado).
    this.onMessage(Msg.Ping, (client, p: { t?: unknown }) => {
      if (!this.allow(client)) return;
      if (typeof p?.t === "number" && Number.isFinite(p.t)) client.send(Evt.Pong, { t: p.t });
    });
    // chat da zona: o servidor limpa o texto, limita a taxa e usa o NOME DO PERSONAGEM (o cliente não manda nome)
    this.onMessage(Msg.Chat, (client, p: { text?: unknown }) => {
      if (!this.allow(client)) return;
      const pl = this.state.players.get(client.sessionId);
      const text = pl && this.chatText(client, p?.text);
      if (pl && text) this.broadcast(Evt.Chat, { id: client.sessionId, name: pl.name, text });
    });
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
    this.onMessage(Msg.InvSync, (client) => {
      if (!this.allow(client)) return;
      const p = this.state.players.get(client.sessionId);
      if (p) this.sendInv(client.sessionId, p);
    });
    this.onMessage(Msg.InvUse, (client, p: { slot?: unknown }) => this.invOp(client, (pl) => this.usePotion(pl, p?.slot)));

    this.setSimulationInterval((dtMs) => this.tick(dtMs / 1000), 1000 / TICK_RATE);
  }

  // ------------------------------------------------------------------ travessia entre zonas
  /** Aprova a travessia: congela o jogador, grava progresso E a nova zona no banco e só então avisa o cliente (que entra na sala nova). */
  private async travel(id: string, p: Player, portal: PortalDef) {
    if (p.traveling || !ZONES[portal.to]) return;
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
      return this.notify(id, "A passagem falhou. Tente de novo.");
    }
    arrivals.set(p.charId, this.zone.id);
    this.clients.getById(id)?.send(Evt.Travel, { zone: portal.to });
    setTimeout(() => this.clients.getById(id)?.leave(4010), 3000); // se o cliente não sair sozinho, o servidor o solta
  }

  // ------------------------------------------------------------------ PvP
  private pvpEvt(id: string, s: "start" | "cancel" | "stop" | "on" | "off") {
    this.clients.getById(id)?.send(Evt.Pvp, { s });
  }

  /** liga/desliga o modo. Já estar no estado pedido não faz nada; pedir o contrário no meio da canalização a cancela. */
  private requestPvp(id: string, p: Player, on: boolean) {
    if (p.pvpChan !== 0) {
      if ((p.pvpChan === 1) !== on) { p.pvpChan = 0; this.pvpEvt(id, "stop"); } // mudou de ideia: cancela sem aviso de dano
      return;
    }
    if (p.pvp === on) return;
    p.pvpChan = on ? 1 : 2;
    p.pvpChanUntil = this.t + PVP_CHANNEL_S;
    this.pvpEvt(id, "start");
  }

  /** qualquer dano recebido interrompe a canalização na hora */
  private interruptPvp(id: string, p: Player) {
    if (p.pvpChan === 0) return;
    p.pvpChan = 0;
    this.pvpEvt(id, "cancel");
  }

  private updatePvp(id: string, p: Player) {
    if (p.pvpChan === 0 || this.t < p.pvpChanUntil) return;
    p.pvp = p.pvpChan === 1;
    p.pvpChan = 0;
    this.pvpEvt(id, p.pvp ? "on" : "off");
  }

  /** dano de jogador em jogador: só se AMBOS estão em PvP (quem não está nunca é alvo) */
  private canPvpHit(by: string, o: Player, oid: string): boolean {
    if (oid === by || o.dead || !o.pvp || this.t < o.invulnUntil) return false;
    const a = this.state.players.get(by);
    if (!a || a.dead || !a.pvp) return false;
    return !(a.party && a.party === o.party); // membros do mesmo grupo nunca se ferem
  }

  private hitPlayers(by: string, baseDmg: number, inArea: (o: Player) => boolean) {
    this.state.players.forEach((o, oid) => {
      if (!this.canPvpHit(by, o, oid) || !inArea(o)) return;
      this.damagePvp(by, oid, o, baseDmg);
    });
  }

  /** chance de crítico de quem atacou: base + equipamento + kit da arma */
  private critChance(by: string): number {
    const g = this.state.players.get(by)?.gear;
    return CRIT.chance + (g ? g.crit + (g.kit.crit ?? 0) : 0) / 100;
  }

  private damagePvp(by: string, oid: string, o: Player, baseDmg: number) {
    const crit = Math.random() < this.critChance(by);
    const variance = 1 + (Math.random() * 2 - 1) * DAMAGE_VARIANCE;
    this.damagePlayer(oid, o, Math.max(1, baseDmg * variance * (crit ? CRIT.mult : 1)), by, crit);
  }

  /** valida, limpa e aplica a taxa do chat (zona e grupo dividem o mesmo limite); "" = descartar */
  private chatText(client: Client, raw: unknown): string {
    if (typeof raw !== "string") return "";
    if (raw.length > CHAT_MAX_LEN) { this.notify(client.sessionId, `Mensagem longa demais (máx. ${CHAT_MAX_LEN} caracteres).`); return ""; }
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

  // ------------------------------------------------------------------ inventário
  private notify(id: string, text: string) {
    this.clients.getById(id)?.send(Evt.Notice, { text });
  }

  private sendInv(id: string, p: Player) {
    this.clients.getById(id)?.send(Evt.Inv, snapshot(p.inv));
  }

  /** vida máxima e dano dependem do nível E do equipamento */
  private refreshStats(p: Player, fill = false) {
    p.gear = bonuses(p.inv, this.classOf(p).id);
    p.maxHp = maxHpFor(this.classOf(p).id, p.level, p.gear.hp);
    p.hp = fill ? p.maxHp : Math.min(p.hp, p.maxHp);
    p.maxMana = maxManaFor(this.classOf(p).id, p.level) + p.gear.mana;
    p.manaF = fill ? p.maxMana : Math.min(p.manaF, p.maxMana);
    p.mana = Math.floor(p.manaF);
  }

  private invOp(client: Client, op: (p: Player) => { ok: true } | { ok: false; error: string }) {
    if (!this.allow(client)) return;
    const p = this.state.players.get(client.sessionId);
    if (!p || p.dead) return;
    const r = op(p);
    if (!r.ok) return this.notify(client.sessionId, r.error);
    p.invDirty = true;
    this.refreshStats(p);
    this.sendInv(client.sessionId, p);
  }

  private usePotion(p: Player, slot: unknown): { ok: true } | { ok: false; error: string } {
    if (!validSlot(slot)) return { ok: false, error: "Espaço inválido." };
    const stack = p.inv.slots[slot];
    const def = stack ? ITEMS[stack.id] : undefined;
    if (!stack || !def || def.kind !== "potion") return { ok: false, error: "Esse item não pode ser usado." };
    if (this.t < p.potionCdUntil) return { ok: false, error: "Poção em recarga." };
    if (p.hp >= p.maxHp) return { ok: false, error: "Sua vida já está cheia." };
    consumeOne(p.inv, slot);
    p.potionCdUntil = this.t + POTION_COOLDOWN_S;
    p.hp = Math.min(p.maxHp, p.hp + (def.heal ?? 0));
    return { ok: true };
  }

  // ------------------------------------------------------------------ itens no chão
  private canPickup(id: string, p: Player, g: GroundItem): boolean {
    return this.t >= g.unlockAt || g.owner === id || (!!g.party && g.party === p.party);
  }

  /** Coloca os itens no chão em volta de (x, y), reservados a `owner` (e ao grupo dele) por `lockS`. O mais antigo sai se passar do limite. */
  private spawnGround(drops: Drop[], x: number, y: number, owner: string, lockS: number) {
    const party = this.state.players.get(owner)?.party ?? "";
    drops.forEach((d, i) => {
      const g = new GroundItem();
      const ang = (i / Math.max(1, drops.length)) * Math.PI * 2 + Math.random() * 0.6, rad = drops.length > 1 ? 1.2 + Math.random() * 0.4 : 0; // afastados o bastante para os nomes não se sobrepor
      g.itemId = d.id; g.qty = d.qty;
      g.x = clamp(x + Math.cos(ang) * rad, 0, this.zone.w - 1);
      g.y = clamp(y + Math.sin(ang) * rad, 0, this.zone.h - 1);
      g.owner = owner; g.party = party; g.lockS = lockS;
      g.unlockAt = this.t + lockS; g.expireAt = this.t + lockS + GROUND_TTL_S;
      this.state.items.set(`g${++this.seq}`, g);
    });
    while (this.state.items.size > GROUND_MAX) { // passou do limite: sai o mais antigo (menor tempo para expirar)
      let oldest: string | null = null, at = Infinity;
      this.state.items.forEach((g, gid) => { if (g.expireAt < at) { at = g.expireAt; oldest = gid; } });
      if (oldest) this.state.items.delete(oldest); else break;
    }
  }

  private tryPickup(id: string, p: Player, gid: string, g: GroundItem, quiet = false) {
    const left = addItem(p.inv, g.itemId, g.qty);
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

  async onAuth(_client: Client, options: { token?: string }): Promise<JoinAuth> {
    let user: AuthUser;
    try {
      user = await verifySession(options?.token);
    } catch {
      throw new ServerError(401, "não autorizado"); // não vaza detalhes do JWT
    }
    const character = await this.repo.getCharacter(user.id);
    if (!character) throw new ServerError(403, "crie um personagem antes de entrar");
    const inventory = await this.repo.loadInventory(character.id, character.class);
    // o personagem só entra na sala da zona em que está (a zona é gravada pelo servidor): ninguém "teletransporta" pedindo outra sala
    if ((character.zone ?? 1) !== this.zone.id) throw new ServerError(403, "zona errada");
    // uma sessão por conta (em qualquer zona): derruba a anterior, exceto quem já está saindo por um portal
    const old = active.get(user.id);
    if (old) {
      const op = old.room.state.players.get(old.sid);
      if (!op?.traveling) old.room.clients.getById(old.sid)?.leave(4001);
    }
    return { user, character, inventory };
  }

  onJoin(client: Client, _options: unknown, auth: JoinAuth) {
    this.userIds.set(client.sessionId, auth.user.id);
    active.set(auth.user.id, { room: this, sid: client.sessionId });
    const pl = new Player();
    const from = arrivals.get(auth.character.id); // chegou por um portal: nasce junto do portal de volta
    arrivals.delete(auth.character.id);
    const at = (from !== undefined && this.zone.arrive[from]) || this.zone.spawn;
    pl.x = pl.tx = at.x;
    pl.y = pl.ty = at.y;
    pl.name = auth.character.name;
    pl.charId = auth.character.id;
    pl.cls = auth.character.class;
    pl.level = auth.character.level;
    pl.xp = auth.character.xp;
    pl.inv = auth.inventory;
    if (auth.inventory.migrated) { pl.invDirty = true; auth.inventory.migrated = false; } // itens antigos traduzidos: grava no próximo salvamento
    this.refreshStats(pl, true);
    this.state.players.set(client.sessionId, pl);
    this.sendInv(client.sessionId, pl);
    // grupo: registra a presença (o grupo atravessa as zonas: a identidade é o personagem)
    parties.attach({ charId: pl.charId, name: pl.name, sid: client.sessionId, zone: this.zone.id, player: pl, send: (t, m) => this.clients.getById(client.sessionId)?.send(t, m) });
  }

  // ------------------------------------------------------------------ limite de taxa
  // balde de fichas por cliente: rajada de 40, reposição de 30 mensagens/s. Jogo legítimo
  // fica bem abaixo disso (cliques e teclas); excesso é descartado e a insistência derruba a conexão.
  private buckets = new Map<string, { tokens: number; last: number; strikes: number }>();
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
    this.buckets.delete(client.sessionId);
    this.chatAt.delete(client.sessionId);
    const uid = this.userIds.get(client.sessionId);
    if (uid && active.get(uid)?.sid === client.sessionId) active.delete(uid);
    this.userIds.delete(client.sessionId);
    for (const tr of this.traps.filter((x) => x.owner === client.sessionId)) this.removeTrap(tr, "gone"); // armadilhas somem com o dono
    const pl = this.state.players.get(client.sessionId);
    if (pl) parties.detach(pl.charId, client.sessionId); // continua no grupo (ausente) por um tempo: recarregar ou atravessar não o desfaz
    this.state.players.delete(client.sessionId);
    if (pl) await this.save(pl);
  }

  async onDispose() {
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
    if (!p.charId || (!p.dirty && !p.invDirty)) return;
    const progress = p.dirty, inv = p.invDirty;
    p.dirty = p.invDirty = false;
    try {
      if (progress) await this.repo.saveProgress(p.charId, p.level, p.xp);
      if (inv) await this.repo.saveInventory(p.charId, p.inv);
    } catch (e) {
      p.dirty ||= progress; // tenta de novo no próximo ciclo
      p.invDirty ||= inv;
      console.error("[db] falha ao salvar personagem:", (e as Error).message);
    }
  }

  private async saveAll() {
    await Promise.all([...this.state.players.values()].map((p) => this.save(p)));
  }

  private addXp(id: string, p: Player, amount: number) {
    if (p.level >= LEVEL_CAP) return;
    p.xp += amount;
    let leveled = false;
    while (p.level < LEVEL_CAP && p.xp >= xpToNext(p.level)) {
      p.xp -= xpToNext(p.level);
      p.level++;
      leveled = true;
    }
    if (p.level >= LEVEL_CAP) p.xp = 0;
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

  private tick(dt: number) {
    this.t += dt;
    this.state.players.forEach((p, id) => {
      this.updatePlayer(p, dt);
      this.updatePvp(id, p);
      if (!p.dead && !p.traveling) { // pisou num portal: atravessa (sem apertar nada)
        const portal = this.zone.portals.find((q) => dist(p.x, p.y, q.x, q.y) <= q.r);
        if (portal) void this.travel(id, p, portal);
      }
    });
    this.updateProjectiles(dt);
    this.updateTraps();
    this.updateGround();
    if (this.pending.length) {
      const due = this.pending.filter((x) => this.t >= x.at);
      if (due.length) {
        this.pending = this.pending.filter((x) => this.t < x.at);
        due.forEach((x) => x.run());
      }
    }
    this.state.enemies.forEach((e, id) => this.updateEnemy(id, e, dt));
  }

  private updatePlayer(p: Player, dt: number) {
    if (p.dead) {
      if (this.t >= p.deadUntil) {
        p.dead = false;
        p.hp = p.maxHp;
        p.manaF = p.maxMana;
        p.mana = p.maxMana;
        p.x = p.tx = this.zone.spawn.x; // renasce na zona onde caiu
        p.y = p.ty = this.zone.spawn.y;
        p.invulnUntil = this.t + 2; // um respiro ao renascer (evita ser abatido de novo no ponto de início)
      }
      return;
    }
    p.buff = this.t < p.buffUntil;
    p.ember = this.t < p.emberUntil;
    if (p.manaF < p.maxMana) { // regenera o recurso; só mexe no valor sincronizado quando o inteiro muda
      p.manaF = Math.min(p.maxMana, p.manaF + (this.classOf(p).resource.regen + p.gear.regen) * dt);
      const m = Math.floor(p.manaF);
      if (m !== p.mana) p.mana = m;
    }

    if (p.dashLeft > 0) {
      const step = Math.min(dt, p.dashLeft);
      p.x = clamp(p.x + p.dashVx * step, 0, this.zone.w - 1);
      p.y = clamp(p.y + p.dashVy * step, 0, this.zone.h - 1);
      p.dashLeft -= dt;
      if (p.dashLeft <= 0) { p.tx = p.x; p.ty = p.y; }
      return;
    }

    const dx = p.tx - p.x, dy = p.ty - p.y;
    const d = Math.hypot(dx, dy);
    if (d < 0.01) return;
    const step = Math.min(d, MOVE_SPEED * dt);
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

  private doAction(id: string, p: Player, a: ActionId, ax: number, ay: number) {
    const def: ActionDef = effectiveAction(this.classOf(p).actions[a], a, p.gear.kit, p.gear.cdr); // o kit da arma e as botas ajustam a ação
    if (this.t < (p.cdUntil[a] ?? 0) - 0.05) return; // em recarga (tolerância de rede)
    if (p.dashLeft > 0) return; // não age durante o deslocamento

    // Ressurgir sem ninguém caído por perto: avisa e NÃO gasta a recarga
    const fallen = def.kind === "revive" ? this.nearestDead(p, def.radius ?? 0) : null;
    if (def.kind === "revive" && !fallen) return this.notify(id, "Ninguém caído por perto.");

    // custo do recurso: sem o suficiente a ação NÃO acontece e a recarga NÃO é gasta
    const cost = def.cost ?? 0;
    if (cost > 0) {
      if (p.manaF < cost) return this.notify(id, `${this.classOf(p).resource.name} insuficiente.`);
      p.manaF -= cost;
      p.mana = Math.floor(p.manaF);
    }

    let dx = ax - p.x, dy = ay - p.y;
    const aimDist = Math.hypot(dx, dy);
    if (aimDist < 0.01) { dx = Math.cos(p.face); dy = Math.sin(p.face); } else { dx /= aimDist; dy /= aimDist; }
    p.face = Math.atan2(dy, dx);
    p.cdUntil[a] = this.t + def.cd;
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
        this.hitEnemies(id, dmg, (e) => dist(e.x, e.y, cx, cy) <= (def.radius ?? 1) + enemyKind(e.kind).radius);
        this.hitPlayers(id, dmg, (o) => dist(o.x, o.y, cx, cy) <= (def.radius ?? 1) + PLAYER_RADIUS);
        break;
      }
      case "dashHit": {
        const ex = p.x + dx * (def.dash ?? 0), ey = p.y + dy * (def.dash ?? 0);
        const sx = p.x, sy = p.y;
        this.hitEnemies(id, dmg, (e) => distToSegment(e.x, e.y, sx, sy, ex, ey) <= (def.radius ?? 1) + enemyKind(e.kind).radius);
        this.hitPlayers(id, dmg, (o) => distToSegment(o.x, o.y, sx, sy, ex, ey) <= (def.radius ?? 1) + PLAYER_RADIUS);
        this.startDash(p, dx, dy, def);
        break;
      }
      case "tauntBuff": {
        p.buffUntil = this.t + (def.buffS ?? 0);
        p.buff = true;
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
        this.projs.push({ id: pid, owner: id, x: sx, y: sy, dx, dy, speed: def.speed ?? 12, left: def.range ?? 8, radius: def.radius ?? 0.4, dmg, pierce: !!def.pierce, blast, hit: new Set() });
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
        const tr: Trap = { id: `t${++this.seq}`, owner: id, x: pos.x, y: pos.y, r: def.radius ?? 1.5, dmg, armAt: this.t + (def.armS ?? 0.5), expireAt: this.t + (def.lifeS ?? 20) };
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
          this.hitEnemies(id, dmg, (e) => dist(e.x, e.y, pos.x, pos.y) <= r + enemyKind(e.kind).radius);
          this.hitPlayers(id, dmg, (o) => dist(o.x, o.y, pos.x, pos.y) <= r + PLAYER_RADIUS);
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
        this.broadcast(Evt.Telegraph, { id: `r${++this.seq}`, x: pos.x, y: pos.y, r, ms: (def.pullS ?? 0.4) * 1000, friendly: true });
        break;
      }
      case "healAoe": {
        const amount = Math.round((def.heal ?? 0) * power);
        this.state.players.forEach((o, oid) => {
          if (!o.dead && dist(o.x, o.y, p.x, p.y) <= (def.radius ?? 0)) this.healPlayer(oid, o, amount);
        });
        break;
      }
      case "emberBuff": {
        this.state.players.forEach((o) => {
          if (!o.dead && dist(o.x, o.y, p.x, p.y) <= (def.radius ?? 0)) {
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
  }

  private healPlayer(id: string, p: Player, amount: number) {
    const before = p.hp;
    p.hp = Math.min(p.maxHp, p.hp + amount);
    const healed = p.hp - before;
    if (healed > 0) this.broadcast(Evt.Heal, { id, amount: healed, x: p.x, y: p.y });
  }

  private startDash(p: Player, dx: number, dy: number, def: ActionDef) {
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
        else this.damageEnemy(pr.owner, eid, e, pr.dmg);
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
    this.hitEnemies(pr.owner, pr.dmg, (e) => dist(e.x, e.y, pr.x, pr.y) <= pr.blast + enemyKind(e.kind).radius);
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
      this.hitEnemies(tr.owner, tr.dmg, (e) => dist(e.x, e.y, tr.x, tr.y) <= tr.r + enemyKind(e.kind).radius);
      this.hitPlayers(tr.owner, tr.dmg, (o) => dist(o.x, o.y, tr.x, tr.y) <= tr.r + PLAYER_RADIUS);
    }
  }

  // ------------------------------------------------------------------ dano e recompensas
  private damageEnemy(by: string, eid: string, e: Enemy, baseDmg: number) {
    if (e.st === "dead") return;
    const crit = Math.random() < this.critChance(by);
    e.contrib.add(by);
    const variance = 1 + (Math.random() * 2 - 1) * DAMAGE_VARIANCE;
    const dmg = Math.max(1, Math.round(baseDmg * variance * (crit ? CRIT.mult : 1)));
    e.hp = Math.max(0, e.hp - dmg);
    if (!e.targetId) e.targetId = by; // quem bate chama a atenção
    this.broadcast(Evt.Hit, { k: "e", id: eid, dmg, crit, x: e.x, y: e.y, by });
    if (e.hp > 0) return;
    e.st = "dead";
    e.respawnAt = this.t + enemyKind(e.kind).respawnS;
    e.targetId = "";
    this.broadcast(Evt.Died, { k: "e", id: eid });
    const K = enemyKind(e.kind);
    // todo jogador vivo por perto recebe XP; quem tem colegas de grupo por perto ganha um bônus
    const near: [string, Player][] = [];
    this.state.players.forEach((pl, pid) => { if (!pl.dead && dist(pl.x, pl.y, e.x, e.y) <= SHARE_RADIUS) near.push([pid, pl]); });
    for (const [pid, pl] of near) {
      const mates = pl.party ? near.filter(([, o]) => o.party === pl.party).length : 1;
      const gain = Math.round(enemyXp(e.level) * (K.boss?.xpMul ?? 1) * partyXpMult(mates));
      this.addXp(pid, pl, gain);
      this.clients.getById(pid)?.send(Evt.Xp, { amount: gain, x: e.x, y: e.y });
    }
    if (K.boss) return this.openBossChest(e, K.name, by);
    // os itens caem no chão: quem abateu (e o grupo) tem a reserva; depois qualquer um pega
    const killer = this.state.players.get(by);
    if (killer) this.spawnGround(rollMobLoot(this.zone, Math.random, killer.cls as CharClass), e.x, e.y, by, this.lockSeconds(LOOT_LOCK_S));
    e.contrib.clear();
  }

  /** O baú do chefe: cada jogador que lutou (e está por perto) tem a SUA rolagem, reservada a ele; o centro da tela mostra a animação da melhor raridade. */
  private openBossChest(e: Enemy, name: string, lastHit: string) {
    this.broadcast(Evt.Notice, { text: `${name} foi derrotado!` });
    const who = new Set<string>(e.contrib);
    who.add(lastHit);
    let best: Rarity = "common";
    for (const pid of who) {
      const pl = this.state.players.get(pid);
      if (!pl || pl.dead || dist(pl.x, pl.y, e.x, e.y) > SHARE_RADIUS * 2) continue;
      const drops = rollChestLoot(this.zone, Math.random, pl.cls as CharClass);
      for (const d of drops) if (rarityIndex(ITEMS[d.id].rarity) > rarityIndex(best)) best = ITEMS[d.id].rarity;
      this.spawnGround(drops, e.x, e.y, pid, this.lockSeconds(CHEST_LOCK_S));
    }
    this.broadcast(Evt.Chest, { x: e.x, y: e.y, rarity: best, boss: name });
    e.contrib.clear();
  }

  private hitEnemies(by: string, baseDmg: number, inArea: (e: Enemy) => boolean) {
    this.state.enemies.forEach((e, eid) => {
      if (e.st === "dead" || !inArea(e)) return;
      this.damageEnemy(by, eid, e, baseDmg);
    });
  }

  // ------------------------------------------------------------------ IA do esqueleto
  private nearestPlayer(e: Enemy, maxDist: number): [string, Player] | null {
    let best: [string, Player] | null = null;
    let bestD = maxDist;
    this.state.players.forEach((p, id) => {
      if (p.dead || p.traveling) return;
      const d = dist(e.x, e.y, p.x, p.y);
      if (d < bestD) { bestD = d; best = [id, p]; }
    });
    return best;
  }

  private updateEnemy(_id: string, e: Enemy, dt: number) {
    if (e.st === "dead") {
      if (this.t >= e.respawnAt) {
        e.hp = e.maxHp;
        e.x = e.sx;
        e.y = e.sy;
        e.st = "idle";
        e.contrib.clear();
        const KB = enemyKind(e.kind);
        if (KB.boss) { e.nextSlam = this.t + KB.boss.slamEveryS; this.broadcast(Evt.Notice, { text: `${KB.name} despertou!` }); }
      }
      return;
    }

    if (this.t < e.pullUntil) { // puxado para o centro: não age até terminar (depois fica atordoado em "recover")
      const d = dist(e.x, e.y, e.pullX, e.pullY);
      if (d > 0.5) this.moveToward(e, e.pullX, e.pullY, Math.max(d, 0.5) / Math.max(0.05, e.pullUntil - this.t), dt);
      return;
    }

    const K = enemyKind(e.kind);
    // alvo: provocação ativa > quem já está em combate > mais próximo no raio de aggro
    let target: [string, Player] | null = null;
    const taunter = this.t < e.tauntUntil ? this.state.players.get(e.tauntId) : undefined;
    if (taunter && !taunter.dead && !taunter.traveling) target = [e.tauntId, taunter];
    else {
      const current = e.targetId ? this.state.players.get(e.targetId) : undefined;
      if (current && !current.dead && !current.traveling && dist(e.x, e.y, current.x, current.y) <= K.aggro * 1.5) target = [e.targetId, current];
      else target = this.nearestPlayer(e, K.aggro);
    }
    e.targetId = target ? target[0] : "";

    const away = dist(e.x, e.y, e.sx, e.sy) > K.leash;

    switch (e.st) {
      case "idle":
        if (target && !away) e.st = "chase";
        break;

      case "chase": {
        if (!target || away) {
          // volta para casa e recupera a vida
          this.moveToward(e, e.sx, e.sy, K.speed * 1.4, dt);
          e.hp = Math.min(e.maxHp, e.hp + e.maxHp * 0.2 * dt);
          if (dist(e.x, e.y, e.sx, e.sy) < 0.2) e.st = "idle";
          break;
        }
        const p = target[1];
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
          this.state.players.forEach((p, pid) => {
            if (p.dead || this.t < p.invulnUntil) return; // esquiva (i-frames)
            const rad = e.slam && K.boss ? K.boss.slamRadius : K.strikeRadius;
            if (dist(p.x, p.y, e.strikeX, e.strikeY) <= rad + PLAYER_RADIUS) this.damagePlayer(pid, p, enemyDmg(e.level, e.kind) * (e.slam && K.boss ? K.boss.slamMul : 1));
          });
          e.slam = false;
          e.recoverEnd = this.t + K.recoverS;
          e.st = "recover";
        }
        break;

      case "recover":
        if (this.t >= e.recoverEnd) e.st = target ? "chase" : "idle";
        break;
    }
  }

  private moveToward(e: Enemy, x: number, y: number, speed: number, dt: number) {
    const dx = x - e.x, dy = y - e.y;
    const d = Math.hypot(dx, dy);
    if (d < 0.01) return;
    const step = Math.min(d, speed * dt);
    e.x += (dx / d) * step;
    e.y += (dy / d) * step;
    e.face = Math.atan2(dy, dx);
  }

  private damagePlayer(id: string, p: Player, baseDmg: number, by?: string, crit = false) {
    this.interruptPvp(id, p); // qualquer dano (inimigo, projétil, habilidade, área) cancela a canalização do PvP
    const reduction = Math.min(0.8, (this.t < p.buffUntil ? (CLASS_DEFS.warrior.actions.skill3.reduction ?? 0) : 0) + p.gear.dr / 100);
    const dmg = Math.max(1, Math.round(baseDmg * (1 - reduction)));
    p.hp = Math.max(0, p.hp - dmg);
    this.broadcast(Evt.Hit, { k: "p", id, dmg, crit, x: p.x, y: p.y, by });
    if (p.hp <= 0) {
      p.dead = true;
      p.deadUntil = this.t + RESPAWN_S;
      p.tx = p.x;
      p.ty = p.y;
      this.broadcast(Evt.Died, { k: "p", id });
    }
  }
}
