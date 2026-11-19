import type Phaser from "phaser";

/**
 * Bolha de proteção da chegada: domo translúcido azul-dourado em volta do personagem, que pulsa devagar, com um anel no chão
 * e faíscas que giram. Só desenha (Graphics); `alpha` (0..1) permite piscar de leve quando a bolha está acabando.
 */
export function drawShieldBubble(g: Phaser.GameObjects.Graphics, x: number, y: number, time: number, alpha = 1) {
  const k = 1 + 0.045 * Math.sin(time / 260);
  const cy = y - 18, w = 62 * k, h = 78 * k;
  g.fillStyle(0x6ab4ff, 0.13 * alpha).fillEllipse(x, cy, w, h);
  g.fillStyle(0xffd27a, 0.07 * alpha).fillEllipse(x, cy + 6, w * 0.78, h * 0.7);
  g.lineStyle(2, 0xbfe3ff, 0.8 * alpha).strokeEllipse(x, cy, w, h);
  g.lineStyle(1, 0xffd98a, 0.65 * alpha).strokeEllipse(x, cy, w * 0.9, h * 0.9);
  g.lineStyle(2, 0xffffff, 0.55 * alpha).beginPath().arc(x, cy, w * 0.36, Math.PI * 1.1, Math.PI * 1.5).strokePath(); // reflexo no alto
  g.lineStyle(2, 0xbfe3ff, 0.7 * alpha).strokeEllipse(x, y + 2, 52 * k, 22 * k); // anel no chão
  g.lineStyle(1, 0xffd98a, 0.6 * alpha).strokeEllipse(x, y + 2, 40 * k, 16 * k);
  for (let i = 0; i < 4; i++) { // faíscas orbitando
    const a = time / 900 + (i * Math.PI) / 2;
    g.fillStyle(i % 2 ? 0xffe9a8 : 0xd8efff, 0.9 * alpha).fillCircle(x + Math.cos(a) * w * 0.48, cy + Math.sin(a) * h * 0.48, 2);
  }
}
