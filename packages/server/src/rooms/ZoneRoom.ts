import { Room, Client, ServerError } from "colyseus";
import {
  Msg, Evt, MoveToPayload, ActPayload, ActionId, ACTION_IDS, ActionDef,
  MAP_W, MAP_H, TICK_RATE, MAX_CLIENTS_PER_ZONE, SPAWN, ENEMY_SPAWNS,
  WARRIOR, SKELETON, PLAYER_RADIUS, CRIT, DAMAGE_VARIANCE, clamp,
} from "@frixep/shared";
import { verifySession, type AuthUser } from "../auth.js";
import { Player, Enemy, ZoneState } from "./entities.js";

const dist = (ax: number, ay: number, bx: number, by: number) => Math.hypot(ax - bx, ay - by);

/** distância do ponto (px,py) ao segmento (x1,y1)-(x2,y2) */
function distToSegment(px: number, py: number, x1: number, y1: number, x2: number, y2: number) {
  const dx = x2 - x1, dy = y2 - y1;
  const l2 = dx * dx + dy * dy;
  const t = l2 === 0 ? 0 : clamp(((px - x1) * dx + (py - y1) * dy) / l2, 0, 1);
  return dist(px, py, x1 + t * dx, y1 + t * dy);
}

export class ZoneRoom extends Room<ZoneState> {
  maxClients = MAX_CLIENTS_PER_ZONE;
  private userIds = new Map<string, string>(); // sessionId -> accountId
  private t = 0; // relógio da simulação (s)

  onCreate() {
    this.setState(new ZoneState());
    this.setPatchRate(1000 / TICK_RATE);

    ENEMY_SPAWNS.forEach((s, i) => {
      const e = new Enemy();
      e.x = e.sx = s.x;
      e.y = e.sy = s.y;
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

    this.setSimulationInterval((dtMs) => this.tick(dtMs / 1000), 1000 / TICK_RATE);
  }

  async onAuth(_client: Client, options: { token?: string }): Promise<AuthUser> {
    let user: AuthUser;
    try {
      user = await verifySession(options?.token);
    } catch {
      throw new ServerError(401, "não autorizado"); // não vaza detalhes do JWT
    }
    // uma sessão por conta: derruba a anterior
    for (const c of this.clients) if (this.userIds.get(c.sessionId) === user.id) c.leave(4001);
    return user;
  }

  onJoin(client: Client, _options: unknown, auth: AuthUser) {
    this.userIds.set(client.sessionId, auth.id);
    const pl = new Player();
    pl.name = auth.name;
    this.state.players.set(client.sessionId, pl);
  }

  // ------------------------------------------------------------------ limite de taxa
  // balde de fichas por cliente: rajada de 40, reposição de 30 mensagens/s. Jogo legítimo
  // fica bem abaixo disso (cliques e teclas); excesso é descartado e a insistência derruba a conexão.
  private buckets = new Map<string, { tokens: number; last: number; strikes: number }>();
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

  onLeave(client: Client) {
    this.buckets.delete(client.sessionId);
    this.userIds.delete(client.sessionId);
    this.state.players.delete(client.sessionId);
  }

  // ------------------------------------------------------------------ simulação
  private tick(dt: number) {
    this.t += dt;
    this.state.players.forEach((p) => this.updatePlayer(p, dt));
    this.state.enemies.forEach((e, id) => this.updateEnemy(id, e, dt));
  }

  private updatePlayer(p: Player, dt: number) {
    if (p.dead) {
      if (this.t >= p.deadUntil) {
        p.dead = false;
        p.hp = p.maxHp;
        p.x = p.tx = SPAWN.x;
        p.y = p.ty = SPAWN.y;
      }
      return;
    }
    p.buff = this.t < p.buffUntil;

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
    const step = Math.min(d, WARRIOR.speed * dt);
    p.x += (dx / d) * step;
    p.y += (dy / d) * step;
    p.face = Math.atan2(dy, dx);
  }

  // ------------------------------------------------------------------ ações do jogador
  private doAction(id: string, p: Player, a: ActionId, ax: number, ay: number) {
    const def: ActionDef = WARRIOR.actions[a];
    if (this.t < (p.cdUntil[a] ?? 0) - 0.05) return; // em recarga (tolerância de rede)
    if (p.dashLeft > 0) return; // não age durante o deslocamento

    let dx = ax - p.x, dy = ay - p.y;
    const l = Math.hypot(dx, dy);
    if (l < 0.01) { dx = Math.cos(p.face); dy = Math.sin(p.face); } else { dx /= l; dy /= l; }
    p.face = Math.atan2(dy, dx);
    p.cdUntil[a] = this.t + def.cd;
    p.tx = p.x; // ação interrompe o movimento
    p.ty = p.y;

    this.broadcast(Evt.Swing, { id, a, x: p.x, y: p.y, dir: p.face });

    switch (a) {
      case "attack":
      case "skill1": {
        const cx = p.x + dx * (def.offset ?? 0), cy = p.y + dy * (def.offset ?? 0);
        this.hitEnemies(id, def.dmg ?? 0, (e) => dist(e.x, e.y, cx, cy) <= (def.radius ?? 1) + SKELETON.radius);
        break;
      }
      case "skill2": {
        const ex = p.x + dx * (def.dash ?? 0), ey = p.y + dy * (def.dash ?? 0);
        this.hitEnemies(id, def.dmg ?? 0, (e) => distToSegment(e.x, e.y, p.x, p.y, ex, ey) <= (def.radius ?? 1) + SKELETON.radius);
        this.startDash(p, dx, dy, def);
        break;
      }
      case "skill3": {
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
    }
  }

  private startDash(p: Player, dx: number, dy: number, def: ActionDef) {
    const time = def.dashTime ?? 0.25;
    const speed = (def.dash ?? 0) / time;
    p.dashVx = dx * speed;
    p.dashVy = dy * speed;
    p.dashLeft = time;
  }

  private hitEnemies(by: string, baseDmg: number, inArea: (e: Enemy) => boolean) {
    this.state.enemies.forEach((e, eid) => {
      if (e.st === "dead" || !inArea(e)) return;
      const crit = Math.random() < CRIT.chance;
      const variance = 1 + (Math.random() * 2 - 1) * DAMAGE_VARIANCE;
      const dmg = Math.max(1, Math.round(baseDmg * variance * (crit ? CRIT.mult : 1)));
      e.hp = Math.max(0, e.hp - dmg);
      if (!e.targetId) e.targetId = by; // quem bate chama a atenção
      this.broadcast(Evt.Hit, { k: "e", id: eid, dmg, crit, x: e.x, y: e.y, by });
      if (e.hp <= 0) {
        e.st = "dead";
        e.respawnAt = this.t + SKELETON.respawnS;
        e.targetId = "";
        this.broadcast(Evt.Died, { k: "e", id: eid });
      }
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
            if (dist(p.x, p.y, e.strikeX, e.strikeY) <= SKELETON.strikeRadius + PLAYER_RADIUS) this.damagePlayer(pid, p, SKELETON.dmg);
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
    const reduction = this.t < p.buffUntil ? WARRIOR.actions.skill3.reduction : 0;
    const dmg = Math.max(1, Math.round(baseDmg * (1 - reduction)));
    p.hp = Math.max(0, p.hp - dmg);
    this.broadcast(Evt.Hit, { k: "p", id, dmg, crit: false, x: p.x, y: p.y });
    if (p.hp <= 0) {
      p.dead = true;
      p.deadUntil = this.t + WARRIOR.respawnS;
      p.tx = p.x;
      p.ty = p.y;
      this.broadcast(Evt.Died, { k: "p", id });
    }
  }
}
