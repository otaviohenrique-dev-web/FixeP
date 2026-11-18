import Phaser from "phaser";
import { NPC_REACH, type NpcDef } from "@frixep/shared";

/**
 * NPCs da zona (comerciante e ferreira), desenhados por código até a arte chegar: figura simples + placa com nome e ofício.
 * Ficam parados num ponto fixo (os dados vêm de shared/economy.ts: o servidor valida a distância com os mesmos números).
 */
type ToScreen = (x: number, y: number) => { sx: number; sy: number };
interface View { def: NpcDef; sx: number; sy: number; ring: Phaser.GameObjects.Graphics; body: Phaser.GameObjects.Container }

export class NpcLayer {
  private views = new Map<string, View>();

  constructor(private scene: Phaser.Scene, private toScreen: ToScreen, npcs: readonly NpcDef[]) {
    for (const n of npcs) this.build(n);
  }

  private build(n: NpcDef) {
    const s = this.scene;
    const { sx, sy } = this.toScreen(n.x, n.y);
    const smith = n.kind === "smith";
    const g = s.add.graphics();
    // sombra
    g.fillStyle(0x000000, 0.35).fillEllipse(0, 2, 34, 12);
    if (smith) {
      // bigorna ao lado e brasa da forja
      g.fillStyle(0x2b2f38, 1).fillRect(14, -12, 22, 8).fillRect(18, -4, 14, 10).fillRect(15, 6, 20, 4);
      g.fillStyle(0x5d6471, 1).fillRect(14, -12, 22, 3);
      g.fillStyle(0xff7a2a, 0.9).fillCircle(-24, -4, 7);
      g.fillStyle(0xffd27a, 0.9).fillCircle(-24, -5, 3);
    } else {
      // pilha de caixas e sacos da barraca
      g.fillStyle(0x4a2e1a, 1).fillRect(14, -10, 18, 16).fillRect(-30, -6, 14, 12);
      g.fillStyle(0x7a4d2b, 1).fillRect(14, -10, 18, 4).fillRect(-30, -6, 14, 3);
      g.fillStyle(0x97703f, 1).fillCircle(-23, -12, 6);
    }
    // corpo (túnica), capuz/cabeça e braços
    const robe = smith ? 0x3a2f2f : 0x5a1f2a, trim = smith ? 0xb9824f : 0xc9a45c;
    g.fillStyle(robe, 1).fillTriangle(-12, 2, 12, 2, 0, -34);
    g.fillStyle(0x000000, 0.25).fillTriangle(0, 2, 12, 2, 0, -34);
    g.fillStyle(trim, 1).fillRect(-12, -2, 24, 3);
    g.fillStyle(smith ? 0xc08a62 : 0xb59a7a, 1).fillCircle(0, -38, 8);
    g.fillStyle(robe, 1).fillCircle(0, -42, 9).fillRect(-9, -42, 18, 4);
    g.fillStyle(0x0d121b, 1).fillRect(-5, -38, 3, 3).fillRect(2, -38, 3, 3); // olhos fundos
    if (smith) { g.fillStyle(0x6c7684, 1).fillRect(-16, -22, 5, 14); g.fillStyle(0x3a2819, 1).fillRect(-15, -10, 3, 12); } // martelo
    else { g.fillStyle(0xd9b25a, 1).fillCircle(16, -22, 5); g.fillStyle(0x2b2f38, 1).fillCircle(16, -22, 2); } // bolsa de moedas
    // placa: tábua de madeira num poste, com nome e ofício
    const sign = s.add.graphics();
    sign.fillStyle(0x2a1b10, 1).fillRect(-2, -92, 4, 40);
    sign.fillStyle(0x4a2e1a, 1).fillRoundedRect(-52, -112, 104, 36, 5);
    sign.lineStyle(2, 0xc9a45c, 1).strokeRoundedRect(-52, -112, 104, 36, 5);
    const nm = s.add.text(0, -103, n.name, { fontFamily: "Cinzel, Georgia, serif", fontStyle: "bold", fontSize: "13px", color: "#f4e6b8", stroke: "#000", strokeThickness: 3 }).setOrigin(0.5);
    const tt = s.add.text(0, -88, n.title.toUpperCase(), { fontFamily: "Cinzel, Georgia, serif", fontSize: "9px", color: "#c9a45c", stroke: "#000", strokeThickness: 2 }).setOrigin(0.5);
    const body = s.add.container(sx, sy, [g, sign, nm, tt]).setDepth(sy);
    s.tweens.add({ targets: g, y: -1.5, duration: 1400 + Math.random() * 400, yoyo: true, repeat: -1, ease: "Sine.easeInOut" }); // respiração
    const ring = s.add.graphics().setDepth(0.7);
    this.views.set(n.id, { def: n, sx, sy, ring, body });
  }

  /** NPC mais próximo do ponto (em tiles) dentro de `maxD`, ou null */
  nearest(gx: number, gy: number, maxD: number): NpcDef | null {
    let best: NpcDef | null = null, bd = maxD;
    for (const v of this.views.values()) {
      const d = Math.hypot(v.def.x - gx, v.def.y - gy);
      if (d < bd) { bd = d; best = v.def; }
    }
    return best;
  }

  /** NPC sob o ponto do mundo (px): a figura é alta, então o clique vale em cima do corpo e da placa */
  hit(wx: number, wy: number): NpcDef | null {
    for (const v of this.views.values()) if (Math.abs(wx - v.sx) < 34 && wy > v.sy - 120 && wy < v.sy + 14) return v.def;
    return null;
  }

  /** NPC ao alcance de conversa de quem está em (gx, gy) */
  inReach(gx: number, gy: number): NpcDef | null {
    return this.nearest(gx, gy, NPC_REACH);
  }

  /** anel dourado no chão do NPC enquanto o jogador está ao alcance (convite para falar) */
  update(time: number, gx: number, gy: number) {
    for (const v of this.views.values()) {
      v.ring.clear();
      if (Math.hypot(v.def.x - gx, v.def.y - gy) <= NPC_REACH) {
        const a = 0.55 + 0.25 * Math.sin(time / 260);
        v.ring.lineStyle(3, 0xf0cf86, a).strokeEllipse(v.sx, v.sy + 2, 54, 24);
      }
    }
  }
}
