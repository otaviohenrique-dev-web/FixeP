import Phaser from "phaser";
import type { ZoneTheme } from "@frixep/shared";
import { HX, HY } from "./iso";

/**
 * Portões das zonas (substituem o antigo anel no chão): dois pilares de pedra com base e capitel, viga e arco, tochas, runas que pulsam,
 * um véu de energia no vão e a placa com o nome do destino. Tudo desenhado por código (Graphics), sem arte externa.
 * A travessia continua sendo por proximidade (servidor): o vão tem o mesmo raio do portal, pisar nele atravessa.
 * Pedra e chama seguem o tema da zona onde o portão está; o véu e as runas, a cor do destino.
 */

type Pt = [number, number];
type ToScreen = (x: number, y: number) => { sx: number; sy: number };

export interface GateSpec {
  x: number; y: number; r: number;
  /** nome do destino (vai na placa) */
  label: string;
  /** direção em que o vão se abre ao longo da muralha: "x" = a linha do vão corre no eixo x da grade, "y" = no eixo y */
  axis: "x" | "y";
  /** tema da zona do portão (pedra e tochas) */
  stone: ZoneTheme;
  /** cor do véu e das runas (a do destino) */
  glow: number;
}

/** Pedra e chama de cada tema. */
const STONE: Record<ZoneTheme, { base: number; flame: number; core: number; cap: number }> = {
  ash: { base: 0x77705f, flame: 0xff8a2a, core: 0xffe08a, cap: 0xa39880 },
  frost: { base: 0x7e92a8, flame: 0x7fd0ff, core: 0xeaf8ff, cap: 0xdfeefa },
  crypt: { base: 0x4a4060, flame: 0xb07aff, core: 0xf0e0ff, cap: 0x6a5a88 },
  town: { base: 0xa39a82, flame: 0xffb04a, core: 0xfff0b8, cap: 0xc9bd9c },
};

const shade = (c: number, f: number) => {
  const r = Math.min(255, Math.round(((c >> 16) & 255) * f)), g = Math.min(255, Math.round(((c >> 8) & 255) * f)), b = Math.min(255, Math.round((c & 255) * f));
  return (r << 16) | (g << 8) | b;
};

/** direção do vão: o portão corre ao longo da muralha mais próxima (nas quinas, ao longo do eixo x) */
export function gateAxis(zone: { w: number; h: number }, p: { x: number; y: number }): "x" | "y" {
  const dx = Math.min(p.x, zone.w - 1 - p.x), dy = Math.min(p.y, zone.h - 1 - p.y);
  return dx < dy ? "y" : "x";
}

const GATE_H = 118; // altura dos pilares (px)
const PILLAR = 0.95; // largura do pilar (tiles)
const ARCH = 26; // altura extra do arco sobre a viga

/** prisma isométrico: base centrada em (px,py), `u`/`v` = vetores de tela por tile nos dois eixos, w x d tiles, altura h px */
function prism(g: Phaser.GameObjects.Graphics, px: number, py: number, u: Pt, v: Pt, w: number, d: number, h: number, col: number, courses = true) {
  const corner = (a: number, b: number): Pt => [px + u[0] * w * a + v[0] * d * b, py + u[1] * w * a + v[1] * d * b];
  const cs = [corner(-0.5, -0.5), corner(0.5, -0.5), corner(0.5, 0.5), corner(-0.5, 0.5)];
  const by = (f: (p: Pt) => number) => cs.reduce((a, b) => (f(b) < f(a) ? b : a));
  const T = by((p) => p[1]), B = by((p) => -p[1]), L = by((p) => p[0]), R = by((p) => -p[0]);
  const up = (p: Pt): Pt => [p[0], p[1] - h];
  g.fillStyle(shade(col, 1.0), 1).fillPoints([L, B, up(B), up(L)].map((p) => new Phaser.Math.Vector2(p[0], p[1])), true);
  g.fillStyle(shade(col, 0.7), 1).fillPoints([B, R, up(R), up(B)].map((p) => new Phaser.Math.Vector2(p[0], p[1])), true);
  g.fillStyle(shade(col, 1.28), 1).fillPoints([up(T), up(R), up(B), up(L)].map((p) => new Phaser.Math.Vector2(p[0], p[1])), true);
  g.lineStyle(1, 0x000000, 0.45).strokePoints([L, B, R, up(R), up(T), up(L)].map((p) => new Phaser.Math.Vector2(p[0], p[1])), false);
  g.lineBetween(B[0], B[1], B[0], B[1] - h).lineBetween(L[0], L[1], up(L)[0], up(L)[1]).lineBetween(R[0], R[1], up(R)[0], up(R)[1]);
  if (courses) { // fiadas de pedra: linhas horizontais nas duas faces
    g.lineStyle(1, 0x000000, 0.22);
    for (let y = 14; y < h - 2; y += 14) {
      g.lineBetween(L[0], L[1] - y, B[0], B[1] - y).lineBetween(B[0], B[1] - y, R[0], R[1] - y);
    }
  }
}

/** contorno do vão (de pé ao arco), em pontos de tela: `hw` = meia largura em tiles, `h0` = altura das laterais, `ah` = quanto o arco sobe */
function archPoints(cx: number, cy: number, u: Pt, hw: number, h0: number, ah: number): Pt[] {
  const pts: Pt[] = [[cx - u[0] * hw, cy - u[1] * hw]];
  const N = 14;
  for (let i = 0; i <= N; i++) {
    const t = i / N, k = -1 + 2 * t;
    pts.push([cx + u[0] * hw * k, cy + u[1] * hw * k - h0 - ah * Math.sqrt(Math.max(0, 1 - k * k))]);
  }
  pts.push([cx + u[0] * hw, cy + u[1] * hw]);
  return pts;
}

/** véu de energia dentro do vão: camadas de arco que respiram, ondas que sobem e faíscas */
export function drawVeil(g: Phaser.GameObjects.Graphics, cx: number, cy: number, u: Pt, hw: number, h0: number, ah: number, time: number, color: number, still = false) {
  const pulse = still ? 0.6 : 0.5 + 0.5 * Math.sin(time / 420);
  for (let k = 0; k < 4; k++) {
    const s = 1 - k * 0.2;
    const pts = archPoints(cx, cy, u, hw * s, h0 * s, ah * s).map((p) => new Phaser.Math.Vector2(p[0], p[1]));
    g.fillStyle(color, (0.1 + 0.05 * pulse) * (1 + k * 0.45)).fillPoints(pts, true);
  }
  // ondas subindo no véu
  g.lineStyle(2, shade(color, 1.4), 0.5);
  for (let i = 0; i < 3; i++) {
    const t = ((still ? 0 : time / 2600) + i / 3) % 1, hh = (h0 + ah * 0.7) * t;
    const half = hw * 0.9;
    g.lineBetween(cx - u[0] * half, cy - u[1] * half - hh, cx + u[0] * half, cy + u[1] * half - hh);
  }
  // faíscas
  for (let i = 0; i < 7; i++) {
    const t = ((still ? 0.3 : time / 3000) + i * 0.143) % 1;
    const ox = Math.sin(i * 12.9898) * hw * 0.8;
    g.fillStyle(0xffffff, 0.7 * (1 - t)).fillCircle(cx + u[0] * ox + Math.sin(time / 500 + i) * 2, cy + u[1] * ox - t * (h0 + ah * 0.6), 1.6);
  }
}

interface Built { spec: GateSpec; cx: number; cy: number; u: Pt; v: Pt; hw: number; flameA: Pt; flameB: Pt; runeA: { p: Pt; dir: Pt }; runeB: { p: Pt; dir: Pt }; veilG: Phaser.GameObjects.Graphics; fxG: Phaser.GameObjects.Graphics }

export class GateLayer {
  private built: Built[] = [];
  private objs: Phaser.GameObjects.GameObject[] = [];

  constructor(private scene: Phaser.Scene, toScreen: ToScreen, specs: GateSpec[]) {
    for (const s of specs) this.build(toScreen, s);
  }

  private build(toScreen: ToScreen, s: GateSpec) {
    const { sx: cx, sy: cy } = toScreen(s.x, s.y);
    // vetores de tela por tile: u = ao longo do vão, v = atravessando a muralha
    const ux: Pt = [HX, HY], uy: Pt = [-HX, HY];
    const u = s.axis === "x" ? ux : uy, v = s.axis === "x" ? uy : ux;
    const col = STONE[s.stone];
    const off = s.r + PILLAR * 0.5 + 0.1; // centro dos pilares, em tiles a partir do centro do vão
    const A: Pt = [cx - u[0] * off, cy - u[1] * off], B: Pt = [cx + u[0] * off, cy + u[1] * off];
    const [back, front] = A[1] <= B[1] ? [A, B] : [B, A];
    const scene = this.scene;
    const mkG = (depth: number) => { const g = scene.add.graphics().setDepth(depth); this.objs.push(g); return g; };
    const pillar = (g: Phaser.GameObjects.Graphics, p: Pt) => {
      prism(g, p[0], p[1], u, v, PILLAR + 0.5, 1.5, 9, shade(col.base, 0.9)); // base alargada
      prism(g, p[0], p[1] - 9, u, v, PILLAR, 1.2, GATE_H - 20, col.base);
      prism(g, p[0], p[1] - GATE_H + 11, u, v, PILLAR + 0.45, 1.5, 11, shade(col.cap, 0.95)); // capitel
    };
    const gBack = mkG(back[1]);
    pillar(gBack, back);
    const gFront = mkG(front[1] + 0.5);
    pillar(gFront, front);
    // viga e arco (na frente): a viga liga os dois capitéis; o arco é o contorno do vão
    const span = off * 2 + PILLAR + 0.45;
    prism(gFront, cx, cy - GATE_H + 12, u, v, span, 1.35, 22, shade(col.base, 1.05));
    const hw = s.r + 0.05, h0 = GATE_H - 40;
    const arch = archPoints(cx, cy, u, hw, h0, ARCH * 0.6).map((p) => new Phaser.Math.Vector2(p[0], p[1]));
    gFront.lineStyle(7, shade(col.base, 0.55), 1).strokePoints(arch, false);
    gFront.lineStyle(4, shade(col.cap, 1.0), 1).strokePoints(arch, false);
    // pedra-chave no topo do arco
    const kx = cx, ky = cy - h0 - ARCH * 0.6;
    gFront.fillStyle(shade(col.cap, 1.1), 1).fillPoints([new Phaser.Math.Vector2(kx - 7, ky - 2), new Phaser.Math.Vector2(kx + 7, ky - 2), new Phaser.Math.Vector2(kx + 4, ky + 11), new Phaser.Math.Vector2(kx - 4, ky + 11)], true);
    gFront.lineStyle(1, 0x000000, 0.6).strokePoints([new Phaser.Math.Vector2(kx - 7, ky - 2), new Phaser.Math.Vector2(kx + 7, ky - 2), new Phaser.Math.Vector2(kx + 4, ky + 11), new Phaser.Math.Vector2(kx - 4, ky + 11)], true);
    if (s.stone === "frost") { // neve acumulada nas bordas
      for (const p of [back, front]) gFront.fillStyle(0xf2f9ff, 0.9).fillEllipse(p[0], p[1] - GATE_H + 4, 44, 12);
      gFront.fillStyle(0xf2f9ff, 0.85).fillEllipse(cx, cy - GATE_H + 2, span * 40, 12);
    }
    // véu e efeitos animados
    const veilG = mkG(cy - 1);
    const fxG = mkG(front[1] + 1);
    // tochas (chama no topo de cada pilar) e runas (na face do pilar voltada para o vão)
    const flameA: Pt = [back[0], back[1] - GATE_H - 8], flameB: Pt = [front[0], front[1] - GATE_H - 8];
    const runeOf = (p: Pt, sign: number) => ({ p: [p[0] + sign * u[0] * 0.0, p[1] - GATE_H * 0.55] as Pt, dir: [u[0] * sign, u[1] * sign] as Pt });
    // placa do destino, pendurada na viga
    const label = scene.add.text(cx, cy - GATE_H - 30, `➜ ${s.label}`, { fontFamily: "Cinzel, Georgia, serif", fontStyle: "bold", fontSize: "13px", color: "#f4ecd2", backgroundColor: "#16110d", padding: { x: 8, y: 3 }, stroke: "#000", strokeThickness: 2 }).setOrigin(0.5).setDepth(1e5);
    this.objs.push(label);
    const plaque = scene.add.graphics().setDepth(1e5 - 1);
    plaque.lineStyle(2, shade(col.cap, 1.1), 1).strokeRoundedRect(label.x - label.width / 2, label.y - label.height / 2, label.width, label.height, 3);
    plaque.lineStyle(1, 0xffd98a, 0.55).lineBetween(cx - 18, cy - GATE_H - 30 + 10, cx - 18, cy - GATE_H - 8).lineBetween(cx + 18, cy - GATE_H - 30 + 10, cx + 18, cy - GATE_H - 8); // correntes
    this.objs.push(plaque);
    this.built.push({ spec: s, cx, cy, u, v, hw, flameA, flameB, runeA: runeOf(back, 1), runeB: runeOf(front, -1), veilG, fxG });
  }

  update(time: number) {
    for (const b of this.built) {
      const col = STONE[b.spec.stone];
      b.veilG.clear();
      drawVeil(b.veilG, b.cx, b.cy, b.u, b.hw, GATE_H - 40, ARCH * 0.6, time, b.spec.glow);
      const g = b.fxG;
      g.clear();
      // tochas: chama que dança + brilho aditivo
      for (const [i, f] of [b.flameA, b.flameB].entries()) {
        const fl = 0.8 + 0.2 * Math.sin(time / 90 + i * 2.1) + 0.1 * Math.sin(time / 37 + i);
        g.fillStyle(0x2b2118, 1).fillRect(f[0] - 10, f[1] - 2, 20, 8); // braseiro
        g.fillStyle(0x4a3a28, 1).fillRect(f[0] - 12, f[1] - 4, 24, 3);
        g.fillStyle(col.flame, 0.2).fillCircle(f[0], f[1] - 12, 34 * fl);
        g.fillStyle(col.flame, 0.95).fillTriangle(f[0] - 10, f[1] - 3, f[0] + 10, f[1] - 3, f[0] + Math.sin(time / 130 + i) * 3.5, f[1] - 30 * fl);
        g.fillStyle(col.core, 0.95).fillTriangle(f[0] - 5, f[1] - 3, f[0] + 5, f[1] - 3, f[0] + Math.sin(time / 110 + i) * 2, f[1] - 17 * fl);
      }
      // runas nos pilares: pequenos glifos que acendem em sequência
      const glyphs = [b.runeA, b.runeB];
      for (const [i, r] of glyphs.entries()) {
        for (let k = 0; k < 3; k++) {
          const a = 0.25 + 0.65 * Math.max(0, Math.sin(time / 700 - (i * 3 + k) * 0.9));
          const y = r.p[1] + k * 17 - 14, x = r.p[0] + (i === 0 ? 1 : -1) * 0;
          g.lineStyle(2, b.spec.glow, a);
          g.strokeRect(x - 4, y - 4, 8, 8);
          g.lineBetween(x - 4, y, x + 4, y).lineBetween(x, y - 4, x, y + 4);
        }
      }
      // brasas que sobem das tochas
      for (let i = 0; i < 8; i++) {
        const f = i % 2 ? b.flameA : b.flameB, t = ((time / 1800) + i * 0.173) % 1;
        g.fillStyle(col.flame, 0.8 * (1 - t)).fillCircle(f[0] + Math.sin(i * 7.7 + t * 6) * 7, f[1] - 10 - t * 36, 1.5);
      }
    }
  }

  destroy() {
    for (const o of this.objs) o.destroy();
    this.objs = [];
    this.built = [];
  }
}
