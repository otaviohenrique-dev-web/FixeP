import Phaser from "phaser";
import { Client, Room } from "colyseus.js";
import { Msg, MAP_W, MAP_H } from "@frixep/shared";
import { ensureLogin, logout, wsUrl } from "./auth";

const TILE_W = 64;
const TILE_H = 32;
// projeção iso: grade (x,y) -> tela, e inversa
const toScreen = (x: number, y: number) => ({ sx: (x - y) * (TILE_W / 2), sy: (x + y) * (TILE_H / 2) });
const toGrid = (sx: number, sy: number) => ({
  x: (sx / (TILE_W / 2) + sy / (TILE_H / 2)) / 2,
  y: (sy / (TILE_H / 2) - sx / (TILE_W / 2)) / 2,
});

class WorldScene extends Phaser.Scene {
  private room!: Room;
  private sprites = new Map<string, Phaser.GameObjects.Arc>();
  private labels = new Map<string, Phaser.GameObjects.Text>();

  async create() {
    const g = this.add.graphics();
    g.lineStyle(1, 0x2a2a3a, 1);
    for (let x = 0; x < MAP_W; x++) {
      for (let y = 0; y < MAP_H; y++) {
        const { sx, sy } = toScreen(x, y);
        g.strokePoints(
          [
            new Phaser.Math.Vector2(sx, sy - TILE_H / 2),
            new Phaser.Math.Vector2(sx + TILE_W / 2, sy),
            new Phaser.Math.Vector2(sx, sy + TILE_H / 2),
            new Phaser.Math.Vector2(sx - TILE_W / 2, sy),
          ],
          true,
        );
      }
    }

    const token = await ensureLogin();
    try {
      this.room = await new Client(wsUrl).joinOrCreate("zone", { token });
    } catch {
      logout(); // token inválido/recusado: volta ao login
      return;
    }
    const players = (this.room.state as any).players;

    players.onAdd((p: any, id: string) => {
      const me = id === this.room.sessionId;
      this.sprites.set(id, this.add.circle(0, 0, 10, me ? 0xff8a3d : 0x6fa8dc));
      this.labels.set(id, this.add.text(0, 0, p.name, { fontSize: "10px", color: "#ccc" }).setOrigin(0.5, 2.2));
      if (me) this.cameras.main.startFollow(this.sprites.get(id)!, true, 0.1, 0.1);
    });
    players.onRemove((_: any, id: string) => {
      this.sprites.get(id)?.destroy();
      this.sprites.delete(id);
      this.labels.get(id)?.destroy();
      this.labels.delete(id);
    });

    this.input.on("pointerdown", (ptr: Phaser.Input.Pointer) => {
      const { x, y } = toGrid(ptr.worldX, ptr.worldY);
      this.room.send(Msg.MoveTo, { x, y });
    });
  }

  update() {
    if (!this.room) return;
    (this.room.state as any).players.forEach((p: any, id: string) => {
      const s = this.sprites.get(id);
      if (!s) return;
      const { sx, sy } = toScreen(p.x, p.y);
      // interpolação simples rumo à posição autoritativa do servidor
      s.x += (sx - s.x) * 0.3;
      s.y += (sy - s.y) * 0.3;
      s.setDepth(s.y);
      this.labels.get(id)?.setPosition(s.x, s.y).setDepth(s.y + 1);
    });
  }
}

new Phaser.Game({
  type: Phaser.AUTO,
  parent: "game",
  backgroundColor: "#0b0b10",
  scale: { mode: Phaser.Scale.RESIZE, width: "100%", height: "100%" },
  scene: WorldScene,
});
