import Phaser from "phaser";
import { RARITY_HEX } from "@frixep/shared";
/**
 * Brilho público da arma: um brilho pertinho da mão da frente, na cor da raridade.
 * - comum: sem brilho;
 * - incomum em diante: azul para raro, dourado para lendário etc.;
 * - o brilho respira devagar; raridades maiores brilham mais forte.
 * A posição é a da mão (em pixels do quadro 64x64, a partir dos pés); espelha quando o personagem olha para a esquerda.
 */

const ORDER = ["common", "uncommon", "rare", "epic", "legendary", "mythic"];

/** Mão da frente por classe (x para a direita, y para baixo; negativo = para cima). */
const HAND: Record<string, [number, number]> = {
  archer: [7, -19],
  warrior: [8, -20],
  cleric: [8, -19],
  mage: [8, -19],
};

type Pos = { x: number; y: number; flipX?: boolean };

export class WeaponAuras {
  private g: Phaser.GameObjects.Graphics;

  constructor(scene: Phaser.Scene) {
    this.g = scene.add.graphics().setDepth(0.36); // logo acima do chão, abaixo dos personagens
  }

  update(time: number, players: { forEach(cb: (p: any, id: string) => void): void }, sprites: Map<string, { obj: Pos }>): void {
    const g = this.g;
    g.clear();
    players.forEach((p: any, id: string) => {
      const rarity = String(p.weaponRarity ?? "");
      const idx = ORDER.indexOf(rarity);
      if (idx <= 0 || p.dead) return; // sem arma ou arma comum: nada
      const view = sprites.get(`p:${id}`);
      const hand = HAND[String(p.cls)];
      if (!view || !hand) return;
      const col = RARITY_HEX[rarity as keyof typeof RARITY_HEX] ?? 0xffffff;
      const sx = view.obj.flipX ? -1 : 1;
      const x = view.obj.x + hand[0] * sx, y = view.obj.y + hand[1];
      // respiração suave; raridades maiores brilham mais forte
      const breath = 0.8 + 0.2 * Math.sin(time / 420);
      const k = Math.min(1, (0.55 + 0.09 * idx) * breath);
      g.fillStyle(col, 0.3 * k).fillCircle(x, y, 12);   // halo externo
      g.fillStyle(col, 0.55 * k).fillCircle(x, y, 7);   // brilho do meio
      g.fillStyle(col, 0.9 * k).fillCircle(x, y, 3.5);  // núcleo colorido
      g.fillStyle(0xffffff, 0.8 * k).fillCircle(x, y, 1.5); // ponto claro no centro
    });
  }

  destroy(): void {
    this.g.destroy();
  }
}
