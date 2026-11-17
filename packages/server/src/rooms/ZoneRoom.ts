import { Room, Client, ServerError } from "colyseus";
import { Schema, MapSchema, type } from "@colyseus/schema";
import { Msg, MoveToPayload, MAP_W, MAP_H, TICK_RATE, MOVE_SPEED, MAX_CLIENTS_PER_ZONE, clamp } from "@frixep/shared";

import { verifySession, type AuthUser } from "../auth.js";

export class Player extends Schema {
  @type("number") x = 20;
  @type("number") y = 20;
  @type("string") name = "";
  tx = 20; // alvo (não sincronizado)
  ty = 20;
}

export class ZoneState extends Schema {
  @type({ map: Player }) players = new MapSchema<Player>();
}

export class ZoneRoom extends Room<ZoneState> {
  maxClients = MAX_CLIENTS_PER_ZONE;
  private userIds = new Map<string, string>(); // sessionId -> accountId

  onCreate() {
    this.setState(new ZoneState());
    this.setPatchRate(1000 / TICK_RATE);

    // Cliente envia INTENÇÃO (alvo), nunca posição. Servidor valida e simula.
    this.onMessage(Msg.MoveTo, (client, p: MoveToPayload) => {
      const pl = this.state.players.get(client.sessionId);
      if (!pl || !Number.isFinite(p?.x) || !Number.isFinite(p?.y)) return;
      pl.tx = clamp(p.x, 0, MAP_W - 1);
      pl.ty = clamp(p.y, 0, MAP_H - 1);
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

  onLeave(client: Client) {
    this.userIds.delete(client.sessionId);
    this.state.players.delete(client.sessionId);
  }

  private tick(dt: number) {
    this.state.players.forEach((p) => {
      const dx = p.tx - p.x;
      const dy = p.ty - p.y;
      const dist = Math.hypot(dx, dy);
      if (dist < 0.01) return;
      const step = Math.min(dist, MOVE_SPEED * dt);
      p.x += (dx / dist) * step;
      p.y += (dy / dist) * step;
    });
  }
}
