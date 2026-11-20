import Phaser from "phaser";
import { RARITY_HEX } from "@frixep/shared";
/**
 * Brilho público da arma: quem está com arma equipada aparece com um halo na cor da raridade, visível para todos.
 * - comum: sem brilho (como no inventário);
 * - incomum e raro: halo suave e poucas faíscas;
 * - épico, lendário e mítico: halo mais forte, mais faíscas e um feixe de luz que sobe do chão, mais rápido a cada raridade.
 * Desenhado a cada quadro com um único Graphics, então custa pouco mesmo com muita gente na tela.
 */

const ORDER = ["common", "uncommon", "rare", "epic", "legendary", "mythic"];

type Pos = { x: number; y: number };

export class WeaponAuras {
  private g: Phaser.GameObjects.Graphics;

  constructor(scene: Phaser.Scene) {
    this.g = scene.add.graphics().setDepth(0.35); // acima do chão e da sombra, abaixo dos personagens
  }

  update(time: number, players: { forEach(cb: (p: any, id: string) => void): void }, sprites: Map<string, { obj: Pos }>): void {
    const g = this.g;
    g.clear();
    players.forEach((p: any, id: string) => {
      const rarity = String(p.weaponRarity ?? "");
      const idx = ORDER.indexOf(rarity);
      if (idx <= 0 || p.dead) return; // sem arma ou comum: nada
      const view = sprites.get(`p:${id}`);
      if (!view) return;
      const x = view.obj.x, y = view.obj.y;
      const col = RARITY_HEX[rarity as keyof typeof RARITY_HEX] ?? 0xffffff;
      const pulse = 0.5 + 0.5 * Math.sin(time / (760 - idx * 90));
      // halo sob os pés
      const rx = 26 + idx * 2, ry = 13 + idx;
      g.fillStyle(col, 0.1 + 0.04 * idx + 0.08 * pulse).fillEllipse(x, y + 2, rx * 2, ry * 2);
      g.lineStyle(2, col, 0.45 + 0.08 * idx).strokeEllipse(x, y + 2, rx * 2 - 4, ry * 2 - 2);
      // faíscas orbitando o personagem (mais e mais rápidas conforme a raridade)
      const n = idx + 1;
      for (let i = 0; i < n; i++) {
        const a = time / (980 - idx * 110) + (i * Math.PI * 2) / n;
        const px = x + Math.cos(a) * (rx - 4), py = y - 20 + Math.sin(a) * (ry * 0.8);
        g.fillStyle(col, 0.9).fillCircle(px, py, 2 + (idx >= 4 ? 0.6 : 0));
        g.fillStyle(0xffffff, 0.85).fillCircle(px, py, 0.9);
      }
      // feixe de luz para épico em diante
      if (idx >= 3) {
        const h = 46 + idx * 6;
        g.fillStyle(col, 0.06 + 0.04 * pulse + 0.01 * idx).fillRect(x - 5 - idx, y - h, 10 + idx * 2, h);
      }
    });
  }

  destroy(): void {
    this.g.destroy();
  }
}
