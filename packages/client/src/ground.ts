import Phaser from "phaser";
import { ITEMS, RARITY_COLOR, RARITY_HEX, COIN_OBOL, isCoinItem, coinName, rarityIndex, type Rarity } from "@frixep/shared";

/**
 * Itens no chão: visíveis a todos na cor da raridade (brilho, coluna de luz de rara para cima).
 * Enquanto há reserva, um ANEL em volta do item esvazia como um relógio e um número mostra os segundos:
 * colorido para quem pode pegar (você ou seu grupo), cinza para os outros. Depois, qualquer um pega.
 */
export interface GroundData { itemId: string; qty: number; x: number; y: number; owner: string; party: string; lockS: number }

interface View { d: GroundData; at: number; sy: number; sx: number; parts: Phaser.GameObjects.GameObject[]; name: Phaser.GameObjects.Text; timer: Phaser.GameObjects.Text; gem: Phaser.GameObjects.Shape; rar: Rarity; secs: number }

const BEAM_H = [0, 0, 46, 96, 140, 170];

/** Aparência no chão: item comum de equipamento, ou moeda (Tostões: sacola cinza sem coluna; Óbolo: brilho vermelho de lendário). */
function look(d: GroundData): { name: string; rarity: Rarity; hex: number; color: string; coin: boolean } | null {
  if (isCoinItem(d.itemId)) {
    const obol = d.itemId === COIN_OBOL.id;
    return { name: coinName(d.itemId, d.qty), rarity: obol ? "mythic" : "common", hex: obol ? 0xff2e63 : 0xa8aeb9, color: obol ? "#ff6a8a" : "#cfd4dc", coin: true };
  }
  const def = ITEMS[d.itemId];
  return def ? { name: def.name + (d.qty > 1 ? ` x${d.qty}` : ""), rarity: def.rarity, hex: RARITY_HEX[def.rarity], color: RARITY_COLOR[def.rarity], coin: false } : null;
}

export class GroundLayer {
  private views = new Map<string, View>();
  private ringG: Phaser.GameObjects.Graphics;

  constructor(private scene: Phaser.Scene, private toScreen: (x: number, y: number) => { sx: number; sy: number }) {
    this.ringG = scene.add.graphics().setDepth(0.7);
  }

  add(id: string, d: GroundData) {
    const def = look(d);
    if (!def || this.views.has(id)) return;
    const { sx, sy } = this.toScreen(d.x, d.y);
    const t = rarityIndex(def.rarity), hex = def.hex;
    const parts: Phaser.GameObjects.GameObject[] = [];
    const glow = this.scene.add.ellipse(sx, sy, 34 + t * 6, 16 + t * 3, hex, 0.35).setBlendMode(Phaser.BlendModes.ADD).setDepth(0.65);
    this.scene.tweens.add({ targets: glow, alpha: { from: 0.2, to: t >= 5 ? 0.85 : 0.55 }, scale: t >= 5 ? { from: 0.9, to: 1.4 } : { from: 0.95, to: 1.1 }, duration: t >= 5 ? 520 : 900, yoyo: true, repeat: -1 });
    parts.push(glow);
    if (BEAM_H[t]) {
      const h = BEAM_H[t];
      const beam = this.scene.add.rectangle(sx, sy - h / 2, 10 + t * 2, h, hex, 0.22).setBlendMode(Phaser.BlendModes.ADD).setDepth(sy + 1);
      this.scene.tweens.add({ targets: beam, alpha: { from: 0.12, to: t >= 4 ? 0.45 : 0.3 }, duration: t >= 4 ? 300 : 700, yoyo: true, repeat: -1 });
      parts.push(beam);
    }
    const gem: Phaser.GameObjects.Shape = def.coin
      ? this.scene.add.ellipse(sx, sy - 8, 13, 13, hex).setStrokeStyle(2, 0x2b2f38, 1).setDepth(sy + 2) // moeda: disco com borda escura
      : this.scene.add.rectangle(sx, sy - 8, 10, 10, hex).setStrokeStyle(2, 0xffffff, 0.85).setRotation(Math.PI / 4).setDepth(sy + 2);
    this.scene.tweens.add({ targets: gem, y: sy - 13, duration: 700 + Math.random() * 200, yoyo: true, repeat: -1, ease: "Sine.easeInOut" });
    parts.push(gem);
    const name = this.scene.add.text(sx, sy - 26, def.name, { fontFamily: "Cinzel, Georgia, serif", fontStyle: "bold", fontSize: "11px", color: def.color, stroke: "#000", strokeThickness: 3 }).setOrigin(0.5, 1).setDepth(1e5 + 3);
    const timer = this.scene.add.text(sx, sy + 12, "", { fontFamily: "Cinzel, Georgia, serif", fontStyle: "bold", fontSize: "10px", color: "#ffffff", stroke: "#000", strokeThickness: 3 }).setOrigin(0.5, 0).setDepth(1e5 + 3);
    parts.push(name, timer);
    this.views.set(id, { d, at: this.scene.time.now, sx, sy, parts, name, timer, gem, rar: def.rarity, secs: -1 });
  }

  remove(id: string) {
    const v = this.views.get(id);
    if (!v) return;
    for (const p of v.parts) { this.scene.tweens.killTweensOf(p); p.destroy(); }
    this.views.delete(id);
  }

  /** segundos de reserva que ainda faltam (0 = livre para todos) */
  remaining(v: { d: GroundData; at: number }, now: number): number {
    return Math.max(0, v.d.lockS - (now - v.at) / 1000);
  }

  /** mesma regra do servidor: dono ou membro do grupo do dono pode pegar durante a reserva */
  mine(d: GroundData, myId: string, myParty: string): boolean {
    return d.owner === myId || (!!d.party && d.party === myParty);
  }

  update(now: number, myId: string, myParty: string) {
    const g = this.ringG;
    g.clear();
    for (const v of this.views.values()) {
      const rem = this.remaining(v, now);
      const mine = this.mine(v.d, myId, myParty);
      if (rem > 0) {
        const frac = rem / Math.max(0.001, v.d.lockS);
        const col = mine ? RARITY_HEX[v.rar] : 0x8a8f99;
        const n = Math.max(2, Math.round(40 * frac));
        const rw = 20, rh = 10;
        g.lineStyle(3, col, mine ? 0.95 : 0.7).beginPath();
        for (let i = 0; i <= n; i++) { // relógio: o anel esvazia no sentido horário a partir do topo
          const a = -Math.PI / 2 + (i / 40) * Math.PI * 2;
          const px = v.sx + Math.cos(a) * rw, py = v.sy + Math.sin(a) * rh;
          if (i === 0) g.moveTo(px, py); else g.lineTo(px, py);
        }
        g.strokePath();
        const s = Math.ceil(rem);
        if (s !== v.secs) { v.secs = s; v.timer.setText(`${s}s`).setColor(mine ? "#ffffff" : "#b0b6c0"); }
      } else if (v.secs !== 0) {
        v.secs = 0;
        v.timer.setText("");
      }
    }
  }

  /** item mais perto do ponto (em tiles) dentro do raio, ou null */
  nearest(gx: number, gy: number, maxD: number): string | null {
    let best: string | null = null, bd = maxD;
    for (const [id, v] of this.views) {
      const d = Math.hypot(v.d.x - gx, v.d.y - gy);
      if (d < bd) { bd = d; best = id; }
    }
    return best;
  }
}
