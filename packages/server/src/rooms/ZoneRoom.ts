import { Room, Client } from "colyseus";
import { Schema, MapSchema, type } from "@colyseus/schema";
import { Msg, MoveToPayload, MAP_W, MAP_H, TICK_RATE, MOVE_SPEED, MAX_CLIENTS_PER_ZONE, clamp } from "@frixep/shared";

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

  onJoin(client: Client) {
    const pl = new Player();
    pl.name = `Portador-${client.sessionId.slice(0, 4)}`;
    this.state.players.set(client.sessionId, pl);
  }

  onLeave(client: Client) {
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
