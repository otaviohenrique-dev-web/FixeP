import type Phaser from "phaser";
import { LEVEL_TIER_COLORS, levelTier } from "@frixep/shared";

/**
 * Placa de cada personagem e inimigo (nome em cima; embaixo, selo de nível ao lado esquerdo da barra, sem cobri-la + de vida segmentada).
 * O selo é o destaque: a moldura muda a cada 10 níveis e ganha enfeites (rebites, gema, brilho que pulsa) para dar vontade de chegar à próxima faixa.
 * Só desenha (o texto do nome e o número ficam em objetos de texto posicionados com o retorno).
 */

export type PlateKind = "me" | "ally" | "enemy" | "pvp" | "party";

/** Paleta das barras de vida. O vermelho vivo do jogador (o MESMO da barra de vida da HUD, ver hud.ts) é inequívoco: o inimigo usa um tijolo escuro e
 *  fosco, o PvP um laranja de alerta, o aliado verde e o colega de grupo azul (com filete claro em volta). */
export const PLAYER_RED = 0xe5202e;
// jogadores são sempre vermelhos; só o grupo (colegas de PT) fica verde
const FILL: Record<PlateKind, number> = { me: PLAYER_RED, ally: PLAYER_RED, enemy: 0x8a3226, pvp: PLAYER_RED, party: 0x4cc26a };

export interface PlateGeom {
  /** centro do número do nível */
  numX: number;
  numY: number;
  /** centro (x) e base (y) do nome */
  nameX: number;
  nameY: number;
}

const mix = (c: number, to: number, t: number) => {
  const r = ((c >> 16) & 255) * (1 - t) + ((to >> 16) & 255) * t;
  const g = ((c >> 8) & 255) * (1 - t) + ((to >> 8) & 255) * t;
  const b = (c & 255) * (1 - t) + (to & 255) * t;
  return (Math.round(r) << 16) | (Math.round(g) << 8) | Math.round(b);
};

export function drawPlate(
  g: Phaser.GameObjects.Graphics,
  o: { x: number; y: number; hp: number; maxHp: number; level: number; kind: PlateKind; time: number; low?: boolean },
): PlateGeom {
  const fancy = !o.low; // qualidade "Baixo" tira os enfeites (halos, rebites, gema)
  const K = 1.3; // escala geral da placa
  const W = (o.kind === "enemy" ? 44 : 54) * K; // largura da barra
  const H = 9 * K;
  const tier = levelTier(o.level);
  const col = LEVEL_TIER_COLORS[tier];
  const light = mix(col, 0xffffff, 0.55);
  const size = (tier >= 4 ? 26 : tier >= 2 ? 24 : 22) * K;
  const gap = 4; // folga entre o contorno do selo e a barra
  const total = size + gap + W; // selo + folga + barra: o conjunto fica centrado no personagem
  const cx = o.x - total / 2 + size / 2; // centro do selo: à ESQUERDA da barra, sem cobrir nenhum pedaço dela
  const barLeft = cx + size / 2 + gap; // a barra (e o nome, centrado nela) começa logo depois do selo
  const cy = o.y;

  // ----- barra de vida
  g.fillStyle(0x05080d, 0.92).fillRoundedRect(barLeft - 1, cy - H / 2 - 1, W + 2, H + 2, 3);
  const ratio = Math.max(0, Math.min(1, o.hp / Math.max(1, o.maxHp)));
  const fill = FILL[o.kind];
  if (ratio > 0) {
    g.fillStyle(fill, 1).fillRoundedRect(barLeft, cy - H / 2, W * ratio, H, 2);
    g.fillStyle(0xffffff, 0.28).fillRect(barLeft + 1, cy - H / 2, Math.max(0, W * ratio - 2), 3); // brilho no topo
    g.fillStyle(0x000000, 0.25).fillRect(barLeft, cy + H / 2 - 2, W * ratio, 2); // sombra embaixo
  }
  const segs = Math.max(3, Math.min(12, Math.round(o.maxHp / 25)));
  g.lineStyle(1, 0x05080d, 0.85);
  for (let i = 1; i < segs; i++) {
    const sx = barLeft + (W * i) / segs;
    g.lineBetween(sx, cy - H / 2, sx, cy + H / 2);
  }
  g.lineStyle(1, mix(0x7a5f2e, col, 0.35), 0.9).strokeRoundedRect(barLeft - 1, cy - H / 2 - 1, W + 2, H + 2, 3);

  // ----- selo de nível
  const pulse = tier >= 5 ? 0.5 + 0.5 * Math.sin(o.time / 220) : 1;
  if (tier >= 3 && fancy) {
    g.lineStyle(7, col, 0.14 * pulse).strokeRoundedRect(cx - size / 2 - 3, cy - size / 2 - 3, size + 6, size + 6, 9);
    g.lineStyle(3, col, 0.34 * pulse).strokeRoundedRect(cx - size / 2 - 1, cy - size / 2 - 1, size + 2, size + 2, 7);
  }
  g.fillStyle(0x03050a, 0.95).fillRoundedRect(cx - size / 2 - 2, cy - size / 2 - 2, size + 4, size + 4, 6); // contorno escuro
  g.fillStyle(col, 1).fillRoundedRect(cx - size / 2, cy - size / 2, size, size, 5); // moldura da faixa
  const bw = (tier >= 2 ? 3 : tier >= 1 ? 2.5 : 2) * 1.15;
  g.fillStyle(0x0d1420, 1).fillRoundedRect(cx - size / 2 + bw, cy - size / 2 + bw, size - bw * 2, size - bw * 2, 3); // miolo
  g.fillStyle(light, 0.5).fillRect(cx - size / 2 + 3, cy - size / 2 + 1, size - 6, 1); // reflexo no alto da moldura
  if (tier >= 2 && fancy) {
    // rebites nos cantos
    g.fillStyle(light, 1);
    for (const [dx, dy] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) g.fillRect(cx + dx * (size / 2 - 1) - 2, cy + dy * (size / 2 - 1) - 2, 4, 4);
  }
  if (tier >= 4 && fancy) {
    // gema no topo
    const gy = cy - size / 2 - 1;
    g.fillStyle(0x03050a, 1).fillTriangle(cx - 8, gy + 1, cx + 8, gy + 1, cx, gy - 11);
    g.fillStyle(col, 1).fillTriangle(cx - 6, gy, cx + 6, gy, cx, gy - 9);
    g.fillStyle(0xffffff, 0.85).fillTriangle(cx - 1.5, gy - 1, cx + 1.5, gy - 1, cx, gy - 6);
  }

  if (o.kind === "party") { // colega de grupo: filete azul-claro em volta da barra, para se reconhecer de longe
    g.lineStyle(2, 0x9fd8ff, 0.95).strokeRoundedRect(barLeft - 2, cy - H / 2 - 2, W + 4, H + 4, 4);
  }

  return { numX: cx, numY: cy + 0.5, nameX: barLeft + W / 2, nameY: cy - H / 2 - (tier >= 4 ? 10 : 5) };
}
