import { Room, Client, ServerError } from "colyseus";
import {
  Msg, Evt, MoveToPayload, ActPayload, ActionId, ACTION_IDS, ActionDef,
  MAP_W, MAP_H, TICK_RATE, MAX_CLIENTS_PER_ZONE, CHAT_MAX_LEN, SPAWN, ENEMY_SPAWNS,
  CLASS_DEFS, type ClassDef, type CharClass, MOVE_SPEED, RESPAWN_S, SHARE_RADIUS,
  SKELETON, PLAYER_RADIUS, CRIT, DAMAGE_VARIANCE, clamp,
  LEVEL_CAP, xpToNext, enemyHp, enemyDmg, enemyXp, maxHpFor, maxManaFor, dmgMult, ITEMS, POTION_COOLDOWN_S,
} from "@frixep/shared";
import { verifySession, type AuthUser } from "../auth.js";
import { Player, Enemy, ZoneState } from "./entities.js";
import type { Repo, CharacterRow } from "../db/repo.js";
import { snapshot, addItem, equipFromSlot, unequip, dropSlot, consumeOne, bonuses, validSlot, type Inventory } from "../game/inventory.js";
import { rollLoot } from "../game/loot.js";

interface Proj { id: string; owner: string; x: number; y: number; dx: number; dy: number; speed: number; left: number; radius: number; dmg: number; pierce: boolean; hit: Set<string> }
interface Trap { id: string; owner: string; x: number; y: number; r: number; dmg: number; armAt: number; expireAt: number }
interface JoinAuth { user: AuthUser; character: CharacterRow; inventory: Inventory }

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

  onCreate(options: { repo: Repo }) {
    this.repo = options.repo;
    this.setState(new ZoneState());
    // salva o progresso pendente a cada 30 s (além de ao sair e ao subir de nível)
    this.saver = setInterval(() => void this.saveAll(), 30_000);
    this.setPatchRate(1000 / TICK_RATE);

    ENEMY_SPAWNS.forEach((s, i) => {
      const e = new Enemy();
      e.x = e.sx = s.x;
      e.y = e.sy = s.y;
      e.level = s.level;
      e.maxHp = e.hp = enemyHp(s.level);
      this.state.enemies.set(`e${i + 1}`, e);
    });

    // Cliente envia INTENÇÃO (alvo / ação), nunca posição nem dano. Servidor valida e simula.
    this.onMessage(Msg.MoveTo, (client, p: MoveToPayload) => {
      if (!this.allow(client)) return;
      const pl = this.state.players.get(client.sessionId);
      if (!pl || pl.dead || !Number.isFinite(p?.x) || !Number.isFinite(p?.y)) return;
      pl.tx = clamp(p.x, 0, MAP_W - 1);
      pl.ty = clamp(p.y, 0, MAP_H - 1);
    });

    this.onMessage(Msg.Act, (client, p: ActPayload) => {
      if (!this.allow(client)) return;
      const pl = this.state.players.get(client.sessionId);
      if (!pl || pl.dead) return;
      if (!ACTION_IDS.includes(p?.a) || !Number.isFinite(p?.ax) || !Number.isFinite(p?.ay)) return;
      // a mira é só uma direção: limita a valores sensatos (evita overflow em contas)
      this.doAction(client.sessionId, pl, p.a, clamp(p.ax, -100, 140), clamp(p.ay, -100, 140));
    });

    // Inventário: o cliente pede, o servidor valida e devolve a fotografia completa.
    this.onMessage(Msg.InvEquip, (client, p: { slot?: unknown }) => this.invOp(client, (pl) => equipFromSlot(pl.inv, p?.slot, pl.level, pl.cls as CharClass)));
    this.onMessage(Msg.InvUnequip, (client, p: { slot?: unknown }) => this.invOp(client, (pl) => unequip(pl.inv, p?.slot)));
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
      if (!pl || typeof p?.text !== "string") return;
      if (p.text.length > CHAT_MAX_LEN) return this.notify(client.sessionId, `Mensagem longa demais (máx. ${CHAT_MAX_LEN} caracteres).`);
      const text = cleanChat(p.text);
      if (!text) return;
      const now = Date.now();
      const last = this.chatAt.get(client.sessionId) ?? [];
      const recent = last.filter((t) => now - t < ZoneRoom.CHAT_WINDOW_MS);
      if (recent.length >= ZoneRoom.CHAT_MAX_IN_WINDOW) {
        this.chatAt.set(client.sessionId, recent);
        return this.notify(client.sessionId, "Calma! Você está falando rápido demais.");
      }
      recent.push(now);
      this.chatAt.set(client.sessionId, recent);
      this.broadcast(Evt.Chat, { id: client.sessionId, name: pl.name, text });
    });
    this.onMessage(Msg.InvSync, (client) => {
      if (!this.allow(client)) return;
      const p = this.state.players.get(client.sessionId);
      if (p) this.sendInv(client.sessionId, p);
    });
    this.onMessage(Msg.InvUse, (client, p: { slot?: unknown }) => this.invOp(client, (pl) => this.usePotion(pl, p?.slot)));

    this.setSimulationInterval((dtMs) => this.tick(dtMs / 1000), 1000 / TICK_RATE);
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
    p.maxHp = maxHpFor(this.classOf(p).id, p.level, bonuses(p.inv).hp);
    p.hp = fill ? p.maxHp : Math.min(p.hp, p.maxHp);
    p.maxMana = maxManaFor(this.classOf(p).id, p.level);
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

  private giveLoot(id: string, p: Player) {
    const client = this.clients.getById(id);
    let any = false;
    for (const d of rollLoot(p.cls as CharClass)) {
      const notFit = addItem(p.inv, d.id, d.qty);
      const got = d.qty - notFit;
      if (got > 0) { client?.send(Evt.Loot, { id: d.id, qty: got }); any = true; }
      if (notFit > 0) this.notify(id, "Mochila cheia: item perdido.");
    }
    if (any) { p.invDirty = true; this.sendInv(id, p); }
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
    const inventory = await this.repo.loadInventory(character.id);
    // uma sessão por conta: derruba a anterior
    for (const c of this.clients) if (this.userIds.get(c.sessionId) === user.id) c.leave(4001);
    return { user, character, inventory };
  }

  onJoin(client: Client, _options: unknown, auth: JoinAuth) {
    this.userIds.set(client.sessionId, auth.user.id);
    const pl = new Player();
    pl.name = auth.character.name;
    pl.charId = auth.character.id;
    pl.cls = auth.character.class;
    pl.level = auth.character.level;
    pl.xp = auth.character.xp;
    pl.inv = auth.inventory;
    this.refreshStats(pl, true);
    this.state.players.set(client.sessionId, pl);
    this.sendInv(client.sessionId, pl);
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
    this.userIds.delete(client.sessionId);
    for (const tr of this.traps.filter((x) => x.owner === client.sessionId)) this.removeTrap(tr, "gone"); // armadilhas somem com o dono
    const pl = this.state.players.get(client.sessionId);
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
    this.state.players.forEach((p) => this.updatePlayer(p, dt));
    this.updateProjectiles(dt);
    this.updateTraps();
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
        p.x = p.tx = SPAWN.x;
        p.y = p.ty = SPAWN.y;
      }
      return;
    }
    p.buff = this.t < p.buffUntil;
    p.ember = this.t < p.emberUntil;
    if (p.manaF < p.maxMana) { // regenera o recurso; só mexe no valor sincronizado quando o inteiro muda
      p.manaF = Math.min(p.maxMana, p.manaF + this.classOf(p).resource.regen * dt);
      const m = Math.floor(p.manaF);
      if (m !== p.mana) p.mana = m;
    }

    if (p.dashLeft > 0) {
      const step = Math.min(dt, p.dashLeft);
      p.x = clamp(p.x + p.dashVx * step, 0, MAP_W - 1);
      p.y = clamp(p.y + p.dashVy * step, 0, MAP_H - 1);
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
    const def: ActionDef = this.classOf(p).actions[a];
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
    const power = dmgMult(p.level, bonuses(p.inv).dmgPct) * (this.t < p.emberUntil ? 1 + p.emberPct / 100 : 1);
    const dmg = (def.dmg ?? 0) * power;
    // ponto de colocação (armadilha/chuva): onde o jogador mira, limitado ao alcance
    const place = () => {
      const d = Math.min(aimDist < 0.01 ? (def.placeRange ?? 0) * 0.5 : aimDist, def.placeRange ?? 0);
      return { x: clamp(p.x + dx * d, 0, MAP_W - 1), y: clamp(p.y + dy * d, 0, MAP_H - 1) };
    };

    switch (def.kind) {
      case "melee":
      case "ring": {
        const cx = p.x + dx * (def.offset ?? 0), cy = p.y + dy * (def.offset ?? 0);
        this.hitEnemies(id, dmg, (e) => dist(e.x, e.y, cx, cy) <= (def.radius ?? 1) + SKELETON.radius);
        break;
      }
      case "dashHit": {
        const ex = p.x + dx * (def.dash ?? 0), ey = p.y + dy * (def.dash ?? 0);
        const sx = p.x, sy = p.y;
        this.hitEnemies(id, dmg, (e) => distToSegment(e.x, e.y, sx, sy, ex, ey) <= (def.radius ?? 1) + SKELETON.radius);
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
      case "projectile": {
        const pid = `j${++this.seq}`;
        const sx = p.x + dx * 0.6, sy = p.y + dy * 0.6;
        const look = def.pierce ? "pierce" : p.cls === "cleric" ? "bolt" : "arrow";
        this.projs.push({ id: pid, owner: id, x: sx, y: sy, dx, dy, speed: def.speed ?? 12, left: def.range ?? 8, radius: def.radius ?? 0.4, dmg, pierce: !!def.pierce, hit: new Set() });
        this.broadcast(Evt.Proj, { id: pid, x: sx, y: sy, dir: p.face, speed: def.speed ?? 12, range: def.range ?? 8, look });
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
        this.broadcast(Evt.Telegraph, { id: `r${++this.seq}`, x: pos.x, y: pos.y, r, ms: delay * 1000, friendly: true });
        this.pending.push({ at: this.t + delay, run: () => this.hitEnemies(id, dmg, (e) => dist(e.x, e.y, pos.x, pos.y) <= r + SKELETON.radius) });
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
      const cands: [number, string, Enemy][] = [];
      this.state.enemies.forEach((e, eid) => {
        if (e.st === "dead" || pr.hit.has(eid)) return;
        if (distToSegment(e.x, e.y, pr.x, pr.y, nx, ny) <= pr.radius + SKELETON.radius) cands.push([dist(e.x, e.y, pr.x, pr.y), eid, e]);
      });
      cands.sort((a, b) => a[0] - b[0]);
      let ended = false;
      for (const [, eid, e] of cands) {
        pr.hit.add(eid);
        this.damageEnemy(pr.owner, eid, e, pr.dmg);
        if (!pr.pierce) { ended = true; break; } // flecha comum para no primeiro alvo
      }
      pr.x = nx;
      pr.y = ny;
      pr.left -= step;
      if (ended || pr.left <= 0.001 || nx < 0 || ny < 0 || nx > MAP_W - 1 || ny > MAP_H - 1) {
        this.projs.splice(i, 1);
        this.broadcast(Evt.ProjEnd, { id: pr.id, x: pr.x, y: pr.y, hit: ended });
      }
    }
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
      this.state.enemies.forEach((e) => { if (e.st !== "dead" && dist(e.x, e.y, tr.x, tr.y) <= tr.r + SKELETON.radius) trigger = true; });
      if (!trigger) continue;
      this.removeTrap(tr, "boom");
      this.hitEnemies(tr.owner, tr.dmg, (e) => dist(e.x, e.y, tr.x, tr.y) <= tr.r + SKELETON.radius);
    }
  }

  // ------------------------------------------------------------------ dano e recompensas
  private damageEnemy(by: string, eid: string, e: Enemy, baseDmg: number) {
    if (e.st === "dead") return;
    const crit = Math.random() < CRIT.chance;
    const variance = 1 + (Math.random() * 2 - 1) * DAMAGE_VARIANCE;
    const dmg = Math.max(1, Math.round(baseDmg * variance * (crit ? CRIT.mult : 1)));
    e.hp = Math.max(0, e.hp - dmg);
    if (!e.targetId) e.targetId = by; // quem bate chama a atenção
    this.broadcast(Evt.Hit, { k: "e", id: eid, dmg, crit, x: e.x, y: e.y, by });
    if (e.hp > 0) return;
    e.st = "dead";
    e.respawnAt = this.t + SKELETON.respawnS;
    e.targetId = "";
    this.broadcast(Evt.Died, { k: "e", id: eid });
    // grupo: todo jogador vivo por perto recebe XP e faz a sua própria rolagem de loot
    this.state.players.forEach((pl, pid) => {
      if (pl.dead || dist(pl.x, pl.y, e.x, e.y) > SHARE_RADIUS) return;
      this.addXp(pid, pl, enemyXp(e.level));
      this.giveLoot(pid, pl);
    });
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
      if (p.dead) return;
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
      }
      return;
    }

    // alvo: provocação ativa > quem já está em combate > mais próximo no raio de aggro
    let target: [string, Player] | null = null;
    const taunter = this.t < e.tauntUntil ? this.state.players.get(e.tauntId) : undefined;
    if (taunter && !taunter.dead) target = [e.tauntId, taunter];
    else {
      const current = e.targetId ? this.state.players.get(e.targetId) : undefined;
      if (current && !current.dead && dist(e.x, e.y, current.x, current.y) <= SKELETON.aggro * 1.5) target = [e.targetId, current];
      else target = this.nearestPlayer(e, SKELETON.aggro);
    }
    e.targetId = target ? target[0] : "";

    const away = dist(e.x, e.y, e.sx, e.sy) > SKELETON.leash;

    switch (e.st) {
      case "idle":
        if (target && !away) e.st = "chase";
        break;

      case "chase": {
        if (!target || away) {
          // volta para casa e recupera a vida
          this.moveToward(e, e.sx, e.sy, SKELETON.speed * 1.4, dt);
          e.hp = Math.min(e.maxHp, e.hp + e.maxHp * 0.2 * dt);
          if (dist(e.x, e.y, e.sx, e.sy) < 0.2) e.st = "idle";
          break;
        }
        const p = target[1];
        const d = dist(e.x, e.y, p.x, p.y);
        if (d > SKELETON.engage * 0.85) this.moveToward(e, p.x, p.y, SKELETON.speed, dt);
        if (d <= SKELETON.engage) {
          // telégrafo: a área é travada agora; quem sair dela antes do golpe não leva dano
          const dir = Math.atan2(p.y - e.y, p.x - e.x);
          e.face = dir;
          e.strikeX = e.x + Math.cos(dir) * SKELETON.strikeOffset;
          e.strikeY = e.y + Math.sin(dir) * SKELETON.strikeOffset;
          e.windupEnd = this.t + SKELETON.windupS;
          e.st = "windup";
          this.broadcast(Evt.Telegraph, { id: _id, x: e.strikeX, y: e.strikeY, r: SKELETON.strikeRadius, ms: SKELETON.windupS * 1000 });
        }
        break;
      }

      case "windup":
        if (this.t >= e.windupEnd) {
          this.state.players.forEach((p, pid) => {
            if (p.dead || this.t < p.invulnUntil) return; // esquiva (i-frames)
            if (dist(p.x, p.y, e.strikeX, e.strikeY) <= SKELETON.strikeRadius + PLAYER_RADIUS) this.damagePlayer(pid, p, enemyDmg(e.level));
          });
          e.recoverEnd = this.t + SKELETON.recoverS;
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

  private damagePlayer(id: string, p: Player, baseDmg: number) {
    const reduction = this.t < p.buffUntil ? (CLASS_DEFS.warrior.actions.skill3.reduction ?? 0) : 0;
    const dmg = Math.max(1, Math.round(baseDmg * (1 - reduction)));
    p.hp = Math.max(0, p.hp - dmg);
    this.broadcast(Evt.Hit, { k: "p", id, dmg, crit: false, x: p.x, y: p.y });
    if (p.hp <= 0) {
      p.dead = true;
      p.deadUntil = this.t + RESPAWN_S;
      p.tx = p.x;
      p.ty = p.y;
      this.broadcast(Evt.Died, { k: "p", id });
    }
  }
}
