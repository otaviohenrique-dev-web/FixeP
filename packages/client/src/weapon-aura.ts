import Phaser from "phaser";
import { RARITY_HEX } from "@frixep/shared";
/**
 * Brilho público da ARMA na mão: um halo translúcido e pulsante na cor da raridade, só ao redor da arma.
 * - comum: sem brilho;
 * - incomum em diante: azul para raro, dourado para lendário etc. (cor da raridade);
 * - o pulso sobe e desce devagar; quanto maior a raridade, mais forte o halo.
 * A forma segue a arma de cada classe (arco, espada, cajado). Os pontos são em pixels do quadro 64x64,
 * medidos a partir dos pés do personagem, e espelham quando o personagem olha para a esquerda.
 */

const ORDER = ["common", "uncommon", "rare", "epic", "legendary", "mythic"];

/** Caminho da arma por classe, em pixels a partir dos pés (x para a direita, y para baixo; negativo = para cima). */
const WEAPON_PATH: Record<string, [number, number][]> = {
  archer: [[13, -40], [20, -28], [21, -19], [20, -10], [13, 2]], // arco longo: arco à frente, do alto à base
  warrior: [[11, -26], [15, -36], [19, -50]],                  // espada: da mão para a ponta
  cleric: [[12, -4], [12, -30], [12, -50]],                     // cajado: haste vertical
  mage: [[12, -4], [12, -30], [12, -50]],                       // cajado arcano
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
      const path = WEAPON_PATH[String(p.cls)];
      if (!view || !path) return;
      const col = RARITY_HEX[rarity as keyof typeof RARITY_HEX] ?? 0xffffff;
      // pulso alto: a transparência sobe e desce devagar (≈1,6 s por ciclo)
      const pulse = 0.5 + 0.5 * Math.sin(time / 260);
      const k = 0.55 + 0.1 * Math.min(idx, 5) / 5 * 2; // raridades maiores brilham mais
      const sx = view.obj.flipX ? -1 : 1;
      const pts = path.map(([dx, dy]) => ({ x: view.obj.x + dx * sx, y: view.obj.y + dy }));
      const stroke = (width: number, alpha: number) => {
        g.lineStyle(width, col, alpha);
        g.beginPath();
        g.moveTo(pts[0].x, pts[0].y);
        for (let i = 1; i < pts.length; i++) g.lineTo(pts[i].x, pts[i].y);
        g.strokePath();
      };
      const a = (0.12 + 0.28 * pulse) * k; // alfa entre ~0,12 e ~0,4, multiplicado pela raridade
      stroke(10, a * 0.5);  // halo externo, bem difuso
      stroke(5, a);         // brilho do meio
      stroke(1.5, a * 1.6); // fio mais claro
    });
  }

  destroy(): void {
    this.g.destroy();
  }
}
