/**
 * Arte da cidade de Brasalume gerada por código: cada peça é desenhada UMA vez num canvas 2D e vira textura em cache
 * (casas, árvores, lampiões, baú, fonte...). Em jogo cada peça é só uma Image; nada é redesenhado por quadro.
 *
 * Convenção isométrica (tile 64x32): +x aponta para baixo-direita (32,16) e +y para baixo-esquerda (-32,16).
 * Luz vinda de cima à esquerda: faces voltadas para +y (esquerda na tela) ficam claras; faces para +x (direita) ficam escuras;
 * as sombras no chão caem para baixo-direita. A arte NÃO tem luz pintada além das janelas e lanternas acesas.
 */
import Phaser from "phaser";

export type Ctx = CanvasRenderingContext2D;
export type Pt = [number, number];
export interface Tex { key: string; ax: number; ay: number; w: number; h: number } // ax, ay: ponto de ancoragem (px) dentro da textura

export const rngOf = (seed: number) => {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
};

/** clareia (f>1) ou escurece (f<1) uma cor "#rrggbb" */
export const shade = (hex: string, f: number): string => {
  const n = parseInt(hex.slice(1), 16);
  let r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255;
  if (f <= 1) { r *= f; g *= f; b *= f; } else { const k = f - 1; r += (255 - r) * k; g += (255 - g) * k; b += (255 - b) * k; }
  const h = (v: number) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, "0");
  return `#${h(r)}${h(g)}${h(b)}`;
};

export const poly = (c: Ctx, pts: Pt[], fill?: string | CanvasGradient, stroke?: string, lw = 1) => {
  c.beginPath();
  c.moveTo(pts[0][0], pts[0][1]);
  for (let i = 1; i < pts.length; i++) c.lineTo(pts[i][0], pts[i][1]);
  c.closePath();
  if (fill) { c.fillStyle = fill; c.fill(); }
  if (stroke) { c.strokeStyle = stroke; c.lineWidth = lw; c.lineJoin = "round"; c.stroke(); }
};
export const line = (c: Ctx, a: Pt, b: Pt, col: string, lw = 1) => {
  c.beginPath(); c.moveTo(a[0], a[1]); c.lineTo(b[0], b[1]); c.strokeStyle = col; c.lineWidth = lw; c.lineCap = "round"; c.stroke();
};
export const lerp = (p: Pt, q: Pt, t: number): Pt => [p[0] + (q[0] - p[0]) * t, p[1] + (q[1] - p[1]) * t];
const up = (p: Pt, h: number): Pt => [p[0], p[1] - h];

export function canvasTex(scene: Phaser.Scene, key: string, w: number, h: number, draw: (c: Ctx) => void) {
  if (scene.textures.exists(key)) return;
  const t = scene.textures.createCanvas(key, Math.ceil(w), Math.ceil(h))!;
  draw(t.getContext());
  t.refresh();
}

export interface BoxCols { top: string; left: string; right: string; edge?: string }
/** caixa isométrica: C = quina de baixo da frente; w ao longo de +x (esquerda), d ao longo de -y (direita); medidas em tiles; h em px */
export function isoBox(c: Ctx, C: Pt, w: number, d: number, h: number, col: BoxCols, h0 = 0): { A: Pt; B: Pt; C: Pt; D: Pt } {
  const D: Pt = [C[0] - 32 * w, C[1] - 16 * w];
  const B: Pt = [C[0] + 32 * d, C[1] - 16 * d];
  const A: Pt = [D[0] + 32 * d, D[1] - 16 * d];
  const e = col.edge;
  poly(c, [up(D, h0), up(C, h0), up(C, h), up(D, h)], col.left, e, 1);
  poly(c, [up(C, h0), up(B, h0), up(B, h), up(C, h)], col.right, e, 1);
  poly(c, [up(D, h), up(C, h), up(B, h), up(A, h)], col.top, e, 1);
  return { A: up(A, h), B: up(B, h), C: up(C, h), D: up(D, h) };
}

/** sombra suave no chão (elipse achatada, deslocada para baixo-direita) */
export function groundShadow(c: Ctx, x: number, y: number, rx: number, ry: number, a = 0.34) {
  c.save();
  c.translate(x, y); c.scale(1, ry / rx);
  const g = c.createRadialGradient(0, 0, 0, 0, 0, rx);
  g.addColorStop(0, `rgba(0,0,0,${a})`); g.addColorStop(0.7, `rgba(0,0,0,${a * 0.7})`); g.addColorStop(1, "rgba(0,0,0,0)");
  c.fillStyle = g; c.beginPath(); c.arc(0, 0, rx, 0, Math.PI * 2); c.fill();
  c.restore();
}

export function halo(c: Ctx, x: number, y: number, r: number, rgb: string, a: number) {
  const g = c.createRadialGradient(x, y, 0, x, y, r);
  g.addColorStop(0, `rgba(${rgb},${a})`); g.addColorStop(1, `rgba(${rgb},0)`);
  c.fillStyle = g; c.fillRect(x - r, y - r, r * 2, r * 2);
}

// =====================================================================================================================
// CASAS
// =====================================================================================================================
export type HouseKind = "inn" | "smith" | "shop" | "hall" | "cottage";
export interface HouseSpec {
  id: string; kind: HouseKind; w: number; d: number; floors: 1 | 2;
  wall: string; trim: string; roof: string; stone: string;
  door: "L" | "R"; // face da porta: L = voltada para +y (sul, esquerda na tela); R = voltada para +x (leste, direita na tela)
  seed: number;
}

export function houseTex(scene: Phaser.Scene, s: HouseSpec): Tex {
  const key = `town_h_${s.id}`;
  const { w, d } = s;
  const H = s.floors === 2 ? 78 : 48, H0 = 9, ov = 0.3, rise = 16 + 9 * d;
  const leftExt = 32 * (w + ov) + 10, rightExt = 32 * (d + ov) + 34;
  const top = 16 * (w + d) + H + rise + 62;
  const bottom = 46;
  const W = Math.ceil(leftExt + rightExt), Hh = Math.ceil(top + bottom);
  const tex: Tex = { key, ax: leftExt, ay: top, w: W, h: Hh };
  if (scene.textures.exists(key)) return tex;
  canvasTex(scene, key, W, Hh, (c) => {
    const rnd = rngOf(s.seed);
    const C: Pt = [leftExt, top];
    const D: Pt = [C[0] - 32 * w, C[1] - 16 * w];
    const B: Pt = [C[0] + 32 * d, C[1] - 16 * d];
    const A: Pt = [D[0] + 32 * d, D[1] - 16 * d];
    const wallL = s.wall, wallR = shade(s.wall, 0.74);
    const stoneL = s.stone, stoneR = shade(s.stone, 0.74);
    const wp = (side: "L" | "R", t: number, v: number): Pt => (side === "L" ? [D[0] + 32 * t, D[1] + 16 * t - v] : [C[0] + 32 * t, C[1] - 16 * t - v]);
    const len = (side: "L" | "R") => (side === "L" ? w : d);
    const dark = shade(s.trim, 0.7);
    const stoneWalls = s.kind === "smith";

    // ---- sombra no chão: pegada + faixa até baixo-direita + oclusão de contato
    const sh: Pt = [16, 22];
    const foot = [D, C, B, A] as Pt[];
    c.fillStyle = "rgba(0,0,0,0.30)";
    poly(c, foot.map((p) => [p[0] + sh[0], p[1] + sh[1]] as Pt), "rgba(0,0,0,0.30)");
    poly(c, [C, B, [B[0] + sh[0], B[1] + sh[1]], [C[0] + sh[0], C[1] + sh[1]]], "rgba(0,0,0,0.30)");
    poly(c, [D, C, [C[0] + sh[0], C[1] + sh[1]], [D[0] + sh[0], D[1] + sh[1]]], "rgba(0,0,0,0.30)");
    poly(c, [[D[0] - 4, D[1] + 2], [C[0], C[1] + 5], [B[0] + 4, B[1] + 2], B, C, D], "rgba(0,0,0,0.22)");

    // ---- alicerce de pedra (blocos)
    const blocks = (side: "L" | "R", v0: number, v1: number, base: string) => {
      const L = len(side);
      poly(c, [wp(side, 0, v0), wp(side, L, v0), wp(side, L, v1), wp(side, 0, v1)], base);
      const rows = Math.max(1, Math.round((v1 - v0) / 7));
      for (let r = 0; r < rows; r++) {
        const va = v0 + ((v1 - v0) * r) / rows;
        line(c, wp(side, 0, va), wp(side, L, va), shade(base, 0.72), 1);
        const step = 0.5, off = (r % 2) * 0.25;
        for (let t = off; t < L; t += step + rnd() * 0.15) line(c, wp(side, t, va), wp(side, t, va + (v1 - v0) / rows), shade(base, 0.78), 1);
        if (rnd() < 0.7) { const t = rnd() * L; poly(c, [wp(side, t, va + 1), wp(side, t + 0.18, va + 1), wp(side, t + 0.18, va + 5), wp(side, t, va + 5)], shade(base, 1.1 + rnd() * 0.1)); }
      }
    };
    blocks("L", 0, H0, stoneL);
    blocks("R", 0, H0, stoneR);

    // ---- paredes: reboco com ruído ou pedra
    const wall = (side: "L" | "R") => {
      const L = len(side), base = side === "L" ? wallL : wallR;
      if (stoneWalls) { blocks(side, H0, H, side === "L" ? shade(s.stone, 1.05) : shade(s.stone, 0.8)); return; }
      poly(c, [wp(side, 0, H0), wp(side, L, H0), wp(side, L, H), wp(side, 0, H)], base);
      for (let i = 0; i < 26 * L; i++) { // manchas e riscos leves do reboco
        const t = rnd() * L, v = H0 + rnd() * (H - H0);
        const a = wp(side, t, v), b = wp(side, t + 0.1 + rnd() * 0.12, v + (rnd() - 0.5) * 2);
        line(c, a, b, rnd() < 0.5 ? "rgba(255,255,255,0.10)" : "rgba(60,40,20,0.10)", 1);
      }
      // base mais escura (sujeira/umidade) e faixa de sombra do beiral no alto
      const g = c.createLinearGradient(0, wp(side, 0, H0)[1], 0, wp(side, 0, H0 + 12)[1]);
      g.addColorStop(0, "rgba(40,28,16,0.30)"); g.addColorStop(1, "rgba(40,28,16,0)");
      poly(c, [wp(side, 0, H0), wp(side, L, H0), wp(side, L, H0 + 12), wp(side, 0, H0 + 12)], g);
    };
    wall("L"); wall("R");

    // ---- enxaimel (vigas de madeira)
    const frame = (side: "L" | "R") => {
      const L = len(side);
      const col = side === "L" ? s.trim : shade(s.trim, 0.78);
      const floorV = H0 + (H - H0) / 2;
      const hb = (v: number, lw = 3) => line(c, wp(side, 0, v), wp(side, L, v), col, lw);
      hb(H0 + 1); hb(H - 1.5);
      if (s.floors === 2) { hb(floorV, 4); }
      for (let t = 0; t <= L + 0.001; t += 1) line(c, wp(side, t, H0), wp(side, t, H), col, 3.5);
      if (!stoneWalls) { // travessas em X nos painéis do andar de cima (casas de 2 andares) ou diagonais simples
        const vTop = s.floors === 2 ? H - 1.5 : H - 1.5, vBot = s.floors === 2 ? floorV : H0 + 1;
        for (let t = 0; t < L - 0.01; t += 1) {
          if ((Math.floor(t) + s.seed) % 2 === 0) { line(c, wp(side, t + 0.04, vBot + 2), wp(side, t + 0.96, vTop - 2), col, 2); }
          else if (s.floors === 2) { line(c, wp(side, t + 0.96, vBot + 2), wp(side, t + 0.04, vTop - 2), col, 2); }
        }
      }
    };
    frame("L"); frame("R");

    // ---- janelas e porta
    const glowCol = s.kind === "smith" ? ["#ffb35a", "#e0662a"] : ["#ffe7a0", "#f0a04a"];
    const window = (side: "L" | "R", tc: number, vc: number, hw = 0.19, hh = 11) => {
      const v0 = vc - hh, v1 = vc + hh;
      const q = (a: number, b: number, c0: number, c1: number): Pt[] => [wp(side, a, c0), wp(side, b, c0), wp(side, b, c1), wp(side, a, c1)];
      const shut = side === "L" ? shade(s.trim, 1.25) : shade(s.trim, 0.95);
      if (s.kind !== "smith") { // venezianas
        poly(c, q(tc - hw - 0.1, tc - hw, v0, v1), shut, dark, 1);
        poly(c, q(tc + hw, tc + hw + 0.1, v0, v1), shut, dark, 1);
      }
      poly(c, q(tc - hw - 0.025, tc + hw + 0.025, v0 - 1.5, v1 + 1.5), dark);
      const gy0 = wp(side, tc, v1)[1], gy1 = wp(side, tc, v0)[1];
      const g = c.createLinearGradient(0, gy0 - 6, 0, gy1 + 6);
      g.addColorStop(0, glowCol[0]); g.addColorStop(1, glowCol[1]);
      poly(c, q(tc - hw, tc + hw, v0, v1), g);
      if (side === "R") poly(c, q(tc - hw, tc + hw, v0, v1), "rgba(0,0,0,0.10)");
      line(c, wp(side, tc, v0), wp(side, tc, v1), dark, 1.5);
      line(c, wp(side, tc - hw, vc), wp(side, tc + hw, vc), dark, 1.5);
      poly(c, q(tc - hw - 0.06, tc + hw + 0.06, v0 - 4, v0 - 1.5), shade(s.stone, 1.15), shade(s.stone, 0.6), 1); // peitoril
      const m = wp(side, tc, vc);
      c.save(); c.globalCompositeOperation = "lighter"; halo(c, m[0], m[1], 22, "255,170,70", 0.16); c.restore();
    };
    const doorSide = s.door;
    const kd = Math.floor((len(doorSide) - 1) / 2), doorT = kd + 0.5;
    const door = () => {
      const side = doorSide, hw = 0.27, hv = 30;
      const q = (a: number, b: number, c0: number, c1: number): Pt[] => [wp(side, a, c0), wp(side, b, c0), wp(side, b, c1), wp(side, a, c1)];
      poly(c, q(doorT - hw - 0.1, doorT + hw + 0.1, H0 - 8, hv + 5), shade(s.stone, side === "L" ? 1.05 : 0.8), dark, 1); // moldura de pedra
      poly(c, q(doorT - hw, doorT + hw, H0 - 8, hv), side === "L" ? "#5a3a22" : "#47301c", dark, 1);
      for (const t of [-0.12, 0, 0.12]) line(c, wp(side, doorT + t, H0 - 8), wp(side, doorT + t, hv), "rgba(20,10,4,0.55)", 1);
      line(c, wp(side, doorT - hw, 13), wp(side, doorT + hw, 13), "#2a2622", 2); line(c, wp(side, doorT - hw, 26), wp(side, doorT + hw, 26), "#2a2622", 2);
      const k = wp(side, doorT + 0.17, 14); c.fillStyle = "#e5b85a"; c.beginPath(); c.arc(k[0], k[1], 1.8, 0, 7); c.fill();
      // degrau
      const o = doorSide === "R" ? [11, 5.5] : [-11, 5.5];
      const a = wp(side, doorT - hw - 0.08, 0), b2 = wp(side, doorT + hw + 0.08, 0);
      poly(c, [a, b2, [b2[0] + o[0], b2[1] + o[1]], [a[0] + o[0], a[1] + o[1]]], shade(s.stone, 1.12), shade(s.stone, 0.6), 1);
      // lampião ao lado da porta
      const lp = wp(side, doorT + 0.5, 30);
      c.save(); c.globalCompositeOperation = "lighter"; halo(c, lp[0], lp[1], 20, "255,170,70", 0.28); c.restore();
      c.fillStyle = "#2a2622"; c.fillRect(lp[0] - 2.5, lp[1] - 4, 5, 8); c.fillStyle = "#ffd56b"; c.fillRect(lp[0] - 1.5, lp[1] - 3, 3, 6);
    };
    for (const side of ["L", "R"] as const) {
      const L = len(side);
      for (let i = 0; i < L; i++) {
        const tc = i + 0.5;
        if (side === doorSide && i === kd) {
          door();
          if (s.floors === 2) window(side, tc, H0 + (H - H0) * 0.74, 0.19, 10);
          continue;
        }
        if (s.floors === 2) { window(side, tc, H0 + (H - H0) * 0.27 + 5, 0.19, 10); window(side, tc, H0 + (H - H0) * 0.77, 0.19, 10); }
        else window(side, tc, H0 + (H - H0) * 0.55, 0.19, 11);
      }
    }

    // ---- empena (triângulo da parede lateral, na face direita)
    const apexR = wp("R", d / 2, H + rise);
    poly(c, [wp("R", 0, H), wp("R", d, H), apexR], stoneWalls ? shade(s.stone, 0.8) : wallR);
    line(c, wp("R", 0, H), apexR, s.trim, 3); line(c, wp("R", d, H), apexR, s.trim, 3);
    line(c, wp("R", d / 2, H), wp("R", d / 2, H + rise - 4), shade(s.trim, 0.85), 2.5);
    const vent = wp("R", d / 2, H + rise * 0.32);
    c.fillStyle = dark; c.beginPath(); c.ellipse(vent[0], vent[1], 6, 4.2, 0, 0, 7); c.fill();
    c.fillStyle = glowCol[0]; c.beginPath(); c.ellipse(vent[0], vent[1], 4.2, 2.9, 0, 0, 7); c.fill();

    // ---- toldo (loja) e placa pendurada (taverna, ferreiro, leilões, loja)
    if (s.kind === "shop") {
      const side = doorSide, out: Pt = side === "R" ? [13, 6.5] : [-13, 6.5], hw = 0.5;
      const t0 = doorT - hw, t1 = doorT + hw, vTop = 38, vBot = 31;
      const p0 = wp(side, t0, vTop), p1 = wp(side, t1, vTop);
      const stripes = 6;
      for (let i = 0; i < stripes; i++) {
        const a = lerp(p0, p1, i / stripes), b = lerp(p0, p1, (i + 1) / stripes);
        poly(c, [a, b, [b[0] + out[0], b[1] + out[1] + (vTop - vBot) * 0.4], [a[0] + out[0], a[1] + out[1] + (vTop - vBot) * 0.4]], i % 2 ? "#e8dcc0" : side === "R" ? "#8f2f2a" : "#b23c35", "rgba(0,0,0,0.25)", 1);
      }
    }
    if (s.kind !== "cottage") {
      const side: "L" | "R" = "R";
      const M = wp(side, d - 0.25, H0 + (H - H0) * (s.floors === 2 ? 0.52 : 0.78));
      const N: Pt = [M[0] + 20, M[1] + 10];
      line(c, M, N, "#26221d", 2.5);
      const b0: Pt = [N[0] - 18, N[1] - 8 + 4], b1: Pt = [N[0] - 2, N[1] + 4];
      line(c, [b0[0] + 2, b0[1] - 1], [b0[0] + 2, N[1] - 8], "#26221d", 1); line(c, [b1[0] - 2, b1[1] - 5], [b1[0] - 2, N[1]], "#26221d", 1);
      poly(c, [[b0[0], b0[1] + 3], [b1[0], b1[1] + 3], [b1[0], b1[1] + 19], [b0[0], b0[1] + 19]], "#5a3a22", "#e0b565", 1.5);
      const ex = (b0[0] + b1[0]) / 2, ey = (b0[1] + b1[1]) / 2 + 11;
      c.strokeStyle = "#f0d08a"; c.fillStyle = "#f0d08a"; c.lineWidth = 1.6;
      if (s.kind === "inn") { c.fillRect(ex - 3, ey - 4, 6, 8); c.beginPath(); c.arc(ex + 4, ey, 2.5, -1.5, 1.5); c.stroke(); }
      else if (s.kind === "shop") { line(c, [ex, ey - 5], [ex, ey + 4], "#f0d08a", 1.6); line(c, [ex - 5, ey - 3], [ex + 5, ey - 3], "#f0d08a", 1.6); c.fillRect(ex - 6, ey - 2, 4, 2); c.fillRect(ex + 2, ey - 2, 4, 2); }
      else { line(c, [ex - 4, ey + 4], [ex + 3, ey - 3], "#f0d08a", 2); c.fillRect(ex + 1, ey - 6, 6, 4); } // martelo / martelo de leilão
    }

    // ---- sombra do beiral sobre as paredes
    poly(c, [wp("L", 0, H - 7), wp("L", w, H - 7), wp("L", w, H), wp("L", 0, H)], "rgba(30,18,8,0.30)");
    poly(c, [wp("R", 0, H - 7), wp("R", d, H - 7), wp("R", d, H), wp("R", 0, H)], "rgba(30,18,8,0.38)");

    // ---- telhado de duas águas (cumeeira ao longo de +x) com beiral
    const Dr: Pt = [D[0] - 64 * ov, D[1]], Cr: Pt = [C[0], C[1] + 32 * ov], Br: Pt = [B[0] + 64 * ov, B[1]], Ar: Pt = [A[0], A[1] - 32 * ov];
    const he = H - 3, hr = H + rise;
    const eave = (u: number) => up(lerp(Dr, Cr, u), he);
    const ridge = (u: number) => up(lerp(lerp(Dr, Ar, 0.5), lerp(Cr, Br, 0.5), u), hr);
    const roofL = s.roof, roofD = shade(s.roof, 0.7);
    const slope = (u: number, t: number): Pt => lerp(eave(u), ridge(u), t);
    poly(c, [eave(0), eave(1), ridge(1), ridge(0)], roofL);
    const rows = 5 + 2 * d, per = Math.round(5 * (w + 0.6));
    for (let r = 0; r < rows; r++) { // fileiras de telhas: faixas com tom próprio e juntas desencontradas
      const t0 = r / rows, t1 = (r + 1) / rows;
      const tone = 0.9 + rnd() * 0.18;
      poly(c, [slope(0, t0), slope(1, t0), slope(1, t1), slope(0, t1)], shade(roofL, tone));
      for (let k = 0; k < per; k++) {
        const u = (k + (r % 2) * 0.5) / per;
        if (u > 1) continue;
        const a = slope(u, t0), b = slope(u, t1);
        line(c, a, b, "rgba(0,0,0,0.20)", 1);
        if (rnd() < 0.18) poly(c, [slope(u, t0), slope(Math.min(1, u + 1 / per), t0), slope(Math.min(1, u + 1 / per), t1), slope(u, t1)], rnd() < 0.5 ? "rgba(255,255,255,0.10)" : "rgba(0,0,0,0.12)");
      }
      line(c, slope(0, t0), slope(1, t0), "rgba(0,0,0,0.38)", 1.2);
      line(c, slope(0, t0 + 0.01), slope(1, t0 + 0.01), "rgba(255,255,255,0.07)", 1);
    }
    const hl = c.createLinearGradient(0, ridge(0)[1], 0, eave(0)[1]); hl.addColorStop(0, "rgba(255,240,200,0.14)"); hl.addColorStop(1, "rgba(0,0,0,0.10)");
    poly(c, [eave(0), eave(1), ridge(1), ridge(0)], hl);
    poly(c, [eave(0), eave(1), up(lerp(Dr, Cr, 1), he - 4), up(lerp(Dr, Cr, 0), he - 4)], roofD, dark, 1); // fáscia no beiral
    line(c, eave(1), ridge(1), dark, 4); // tábua da empena
    line(c, eave(0), ridge(0), roofD, 2);
    line(c, ridge(0), ridge(1), shade(roofL, 0.6), 5); line(c, up(ridge(0), 2), up(ridge(1), 2), shade(roofL, 1.25), 1.5); // cumeeira

    // ---- chaminé
    const big = s.kind === "smith";
    const cw = big ? 0.55 : 0.36, chH = big ? 40 : 28;
    const base = slope(0.2, 0.62);
    const cb: Pt = [base[0], base[1] + 12];
    isoBox(c, cb, cw, cw, chH + 12, { top: "#3a352f", left: "#6d665c", right: "#4a443c", edge: "#2a2622" });
    const ctop = up(cb, chH + 12);
    poly(c, [[ctop[0] - 32 * cw - 2, ctop[1] - 16 * cw], [ctop[0] + 0, ctop[1] + 2], [ctop[0] + 32 * cw + 2, ctop[1] - 16 * cw], [ctop[0], ctop[1] - 32 * cw - 2]], "#26221d");
    if (big) { c.save(); c.globalCompositeOperation = "lighter"; halo(c, ctop[0], ctop[1] - 8 - 16 * cw, 18, "255,120,40", 0.4); c.restore(); }
  });
  return tex;
}

// =====================================================================================================================
// ÁRVORES
// =====================================================================================================================
export function treeTex(scene: Phaser.Scene, v: 0 | 1 | 2): Tex {
  const key = `town_tree_${v}`;
  const W = 132, H = 150, ax = 66, ay = 134;
  if (scene.textures.exists(key)) return { key, ax, ay, w: W, h: H };
  canvasTex(scene, key, W, H, (c) => {
    const rnd = rngOf(77 + v * 13);
    groundShadow(c, ax + 14, ay + 3, 40, 14, 0.34);
    // tronco com raízes
    const trunk = v === 2 ? ["#6b5a4a", "#4a3d31"] : ["#5a3a22", "#3a2414"];
    poly(c, [[ax - 6, ay + 1], [ax - 3, ay - 40], [ax + 3, ay - 40], [ax + 7, ay + 1], [ax + 11, ay + 3], [ax - 11, ay + 3]], trunk[0]);
    poly(c, [[ax + 1, ay + 1], [ax + 2, ay - 40], [ax + 3, ay - 40], [ax + 7, ay + 1]], trunk[1]);
    const pal = v === 0 ? ["#24471f", "#33642c", "#4a8a3e", "#74b25a"] : v === 1 ? ["#1d3d2c", "#2a5a3e", "#3b7a52", "#5fa070"] : ["#3a4f24", "#52702e", "#7a9a3c", "#b0c660"];
    const blob = (x: number, y: number, r: number, col: string) => { c.fillStyle = col; c.beginPath(); c.arc(x, y, r, 0, 7); c.fill(); };
    if (v === 1) { // conífera em camadas
      for (let i = 0; i < 4; i++) {
        const y = ay - 28 - i * 22, wd = 34 - i * 6;
        poly(c, [[ax - wd, y + 14], [ax, y - 22], [ax + wd, y + 14]], pal[0]);
        poly(c, [[ax - wd, y + 14], [ax, y - 22], [ax + 2, y + 14]], pal[1]);
        poly(c, [[ax - wd + 6, y + 8], [ax - 2, y - 18], [ax - 2, y + 2]], pal[2]);
        line(c, [ax - wd, y + 14], [ax + wd, y + 14], "rgba(0,0,0,0.25)", 2);
      }
    } else {
      const lumps: [number, number, number][] = [[-22, -50, 22], [22, -52, 21], [0, -78, 25], [-10, -44, 22], [12, -64, 22], [-18, -68, 17], [20, -34, 15]];
      for (const [dx, dy, r] of lumps) blob(ax + dx + 3, ay + dy + 4, r, pal[0]); // sombra interna
      for (const [dx, dy, r] of lumps) blob(ax + dx, ay + dy, r, pal[1]);
      for (const [dx, dy, r] of lumps) blob(ax + dx - 4, ay + dy - 5, r * 0.68, pal[2]);
      for (let i = 0; i < 46; i++) { const [dx, dy, r] = lumps[Math.floor(rnd() * lumps.length)]; const a = rnd() * 6.28, rr = rnd() * r * 0.9; blob(ax + dx + Math.cos(a) * rr - 5, ay + dy + Math.sin(a) * rr - 6, 1.6 + rnd() * 2.6, rnd() < 0.5 ? pal[3] : pal[2]); }
      if (v === 2) for (let i = 0; i < 9; i++) blob(ax - 30 + rnd() * 60, ay - 90 + rnd() * 60, 1.6, "#f6e6a0");
    }
  });
  return { key, ax, ay, w: W, h: H };
}

// =====================================================================================================================
// LAMPIÃO, BARRIL, CAIXOTE, BANCO, ESTANDARTE, BRASEIRO
// =====================================================================================================================
export function lampTex(scene: Phaser.Scene): Tex {
  const key = "town_lamp", W = 64, H = 120, ax = 32, ay = 104;
  canvasTex(scene, key, W, H, (c) => {
    groundShadow(c, ax + 8, ay + 2, 15, 6, 0.32);
    halo(c, ax, ay - 76, 30, "255,176,80", 0.30); // brilho ao redor da lanterna (já assado: nada aditivo em jogo)
    poly(c, [[ax - 6, ay + 1], [ax + 6, ay + 1], [ax + 4, ay - 8], [ax - 4, ay - 8]], "#2c2824");
    poly(c, [[ax - 2, ay - 8], [ax + 2, ay - 8], [ax + 2, ay - 70], [ax - 2, ay - 70]], "#3a342d");
    line(c, [ax + 1, ay - 8], [ax + 1, ay - 70], "#1f1c19", 1.5);
    c.fillStyle = "#2c2824"; c.fillRect(ax - 7, ay - 80, 14, 3); c.fillRect(ax - 8, ay - 68, 16, 3);
    poly(c, [[ax - 8, ay - 80], [ax, ay - 90], [ax + 8, ay - 80]], "#2c2824");
    c.fillStyle = "#2c2824"; c.fillRect(ax - 7, ay - 79, 2, 11); c.fillRect(ax + 5, ay - 79, 2, 11);
    const g = c.createLinearGradient(0, ay - 78, 0, ay - 68); g.addColorStop(0, "#fff0b0"); g.addColorStop(1, "#ffb84a");
    c.fillStyle = g; c.fillRect(ax - 5, ay - 78, 10, 10);
  });
  return { key, ax, ay, w: W, h: H };
}

export function barrelTex(scene: Phaser.Scene): Tex {
  const key = "town_barrel", W = 44, H = 52, ax = 22, ay = 40;
  canvasTex(scene, key, W, H, (c) => {
    groundShadow(c, ax + 6, ay + 1, 15, 6, 0.34);
    const g = c.createLinearGradient(ax - 11, 0, ax + 11, 0); g.addColorStop(0, "#8a5c33"); g.addColorStop(0.5, "#6e4724"); g.addColorStop(1, "#4a2f18");
    c.fillStyle = g; c.beginPath(); c.moveTo(ax - 10, ay - 22); c.quadraticCurveTo(ax - 14, ay - 11, ax - 10, ay); c.lineTo(ax + 10, ay); c.quadraticCurveTo(ax + 14, ay - 11, ax + 10, ay - 22); c.closePath(); c.fill();
    c.fillStyle = "#3a2814"; c.beginPath(); c.ellipse(ax, ay, 10, 4, 0, 0, Math.PI); c.fill();
    c.fillStyle = "#a07848"; c.beginPath(); c.ellipse(ax, ay - 22, 10, 4.5, 0, 0, 7); c.fill(); c.strokeStyle = "#3a2814"; c.lineWidth = 1; c.stroke();
    for (const y of [-15, -6]) { c.strokeStyle = "#2a2622"; c.lineWidth = 2.2; c.beginPath(); c.ellipse(ax, ay + y, 12.2, 4.2, 0, 0, Math.PI); c.stroke(); }
  });
  return { key, ax, ay, w: W, h: H };
}

export function crateTex(scene: Phaser.Scene): Tex {
  const key = "town_crate", W = 56, H = 56, ax = 28, ay = 40;
  canvasTex(scene, key, W, H, (c) => {
    groundShadow(c, ax + 8, ay - 2, 20, 8, 0.32);
    const t = isoBox(c, [ax, ay], 0.5, 0.5, 20, { top: "#a07a48", left: "#8a6438", right: "#62431f", edge: "#2f1d0e" });
    void t;
    for (const side of [0, 1]) { const a: Pt = side ? [ax, ay - 20] : [ax - 16, ay - 28], b: Pt = side ? [ax + 16, ay - 28] : [ax, ay - 20]; line(c, a, b, "rgba(0,0,0,0.3)", 1); }
    line(c, [ax - 16, ay - 8], [ax, ay], "#3a2814", 2); line(c, [ax, ay], [ax + 16, ay - 8], "#2a1c0e", 2);
  });
  return { key, ax, ay, w: W, h: H };
}

/** banco: eixo "x" (corre para baixo-direita) ou "y" (para baixo-esquerda) */
export function benchTex(scene: Phaser.Scene, axis: "x" | "y"): Tex {
  const key = `town_bench_${axis}`, W = 92, H = 60, ax = 46, ay = 44;
  canvasTex(scene, key, W, H, (c) => {
    const w = axis === "x" ? 1.2 : 0.4, d = axis === "x" ? 0.4 : 1.2;
    const C: Pt = [ax + (axis === "x" ? 12 : -12), ay + 4];
    groundShadow(c, ax + 6, ay + 4, 34, 11, 0.3);
    const leg = { top: "#3a2a1c", left: "#5a3d24", right: "#3a2814" };
    // pernas
    isoBox(c, [C[0] - (axis === "x" ? 4 : 0), C[1] - (axis === "x" ? 2 : 0) + (axis === "y" ? 1 : 0)], axis === "x" ? 0.1 : 0.4, axis === "x" ? 0.4 : 0.1, 10, leg);
    // assento e encosto
    isoBox(c, [C[0], C[1] - 10], w, d, 4, { top: "#a87a48", left: "#8a5e36", right: "#5e3e20", edge: "#2f1d0e" });
    const back: Pt = axis === "x" ? [C[0] - 6, C[1] - 16 - 6] : [C[0] - 6, C[1] - 16 - 6];
    void back;
    isoBox(c, [C[0] - (axis === "x" ? 0 : -0.0), C[1] - 14 - 4], axis === "x" ? w : 0.08, axis === "x" ? 0.08 : d, 11, { top: "#a87a48", left: "#7e5430", right: "#5e3e20", edge: "#2f1d0e" });
  });
  return { key, ax, ay, w: W, h: H };
}

export function bannerTex(scene: Phaser.Scene, v: 0 | 1): Tex {
  const key = `town_banner_${v}`, W = 56, H = 130, ax = 28, ay = 118;
  canvasTex(scene, key, W, H, (c) => {
    groundShadow(c, ax + 8, ay + 1, 13, 5, 0.3);
    c.fillStyle = "#2c2824"; c.fillRect(ax - 2, ay - 100, 4, 100);
    line(c, [ax - 14, ay - 98], [ax + 14, ay - 98], "#2c2824", 3);
    c.fillStyle = "#d9b25a"; c.beginPath(); c.arc(ax - 14, ay - 98, 2.5, 0, 7); c.arc(ax + 14, ay - 98, 2.5, 0, 7); c.fill();
    const col = v ? "#2c4a78" : "#7a2a2a";
    poly(c, [[ax - 12, ay - 96], [ax + 12, ay - 96], [ax + 12, ay - 44], [ax, ay - 34], [ax - 12, ay - 44]], col, "#d9b25a", 1.5);
    poly(c, [[ax - 12, ay - 96], [ax - 2, ay - 96], [ax - 2, ay - 38], [ax - 12, ay - 44]], "rgba(255,255,255,0.08)");
    c.fillStyle = "#e8cf8a"; c.beginPath(); c.arc(ax, ay - 74, 6, 0, 7); c.fill(); c.fillStyle = col; c.beginPath(); c.arc(ax + 2, ay - 75, 5, 0, 7); c.fill(); // lua crescente
  });
  return { key, ax, ay, w: W, h: H };
}

export function braziertTex(scene: Phaser.Scene): Tex {
  const key = "town_brazier", W = 64, H = 76, ax = 32, ay = 62;
  canvasTex(scene, key, W, H, (c) => {
    groundShadow(c, ax + 8, ay + 1, 20, 7, 0.34);
    for (const dx of [-10, 0, 10]) line(c, [ax + dx * 0.6, ay - 26], [ax + dx, ay], "#26221d", 3);
    c.fillStyle = "#3a352f"; c.beginPath(); c.ellipse(ax, ay - 28, 16, 6, 0, 0, 7); c.fill();
    c.fillStyle = "#26221d"; c.beginPath(); c.moveTo(ax - 16, ay - 28); c.quadraticCurveTo(ax, ay - 8, ax + 16, ay - 28); c.fill();
    c.fillStyle = "#7a2c10"; c.beginPath(); c.ellipse(ax, ay - 29, 12, 4, 0, 0, 7); c.fill();
    c.fillStyle = "#ffb84a"; for (let i = 0; i < 5; i++) { c.beginPath(); c.arc(ax - 8 + i * 4, ay - 30 + (i % 2), 1.5, 0, 7); c.fill(); }
  });
  return { key, ax, ay, w: W, h: H };
}

/** chama (animada por escala/alfa em jogo) e brilho aditivo: texturas pequenas compartilhadas */
export function fxTextures(scene: Phaser.Scene) {
  canvasTex(scene, "town_flame", 32, 48, (c) => {
    const g = c.createRadialGradient(16, 34, 1, 16, 30, 20); g.addColorStop(0, "rgba(255,250,200,1)"); g.addColorStop(0.35, "rgba(255,170,50,0.95)"); g.addColorStop(1, "rgba(255,70,10,0)");
    c.fillStyle = g; c.beginPath(); c.moveTo(16, 2); c.bezierCurveTo(26, 16, 30, 28, 16, 44); c.bezierCurveTo(2, 28, 6, 16, 16, 2); c.fill();
  });
  canvasTex(scene, "town_glow", 128, 128, (c) => halo(c, 64, 64, 64, "255,255,255", 1) as unknown as void);
  canvasTex(scene, "town_ring", 256, 128, (c) => {
    c.strokeStyle = "rgba(255,230,160,0.95)"; c.lineWidth = 5; c.beginPath(); c.ellipse(128, 64, 120, 58, 0, 0, 7); c.stroke();
    c.strokeStyle = "rgba(255,230,160,0.45)"; c.lineWidth = 2.5; c.beginPath(); c.ellipse(128, 64, 104, 50, 0, 0, 7); c.stroke();
  });
  canvasTex(scene, "town_fly", 16, 16, (c) => {
    const g = c.createRadialGradient(8, 8, 0, 8, 8, 8); g.addColorStop(0, "rgba(255,244,190,1)"); g.addColorStop(0.4, "rgba(255,214,110,0.55)"); g.addColorStop(1, "rgba(255,200,90,0)");
    c.fillStyle = g; c.fillRect(0, 0, 16, 16);
  });
}

// =====================================================================================================================
// FONTE DA PRAÇA
// =====================================================================================================================
export function fountainTex(scene: Phaser.Scene): Tex {
  const key = "town_fountain", W = 260, H = 240, ax = 130, ay = 150; // ay = centro do piso da fonte
  canvasTex(scene, key, W, H, (c) => {
    const ell = (x: number, y: number, rx: number, ry: number, fill: string, stroke?: string, lw = 1) => { c.fillStyle = fill; c.beginPath(); c.ellipse(x, y, rx, ry, 0, 0, 7); c.fill(); if (stroke) { c.strokeStyle = stroke; c.lineWidth = lw; c.stroke(); } };
    groundShadow(c, ax + 16, ay + 8, 108, 44, 0.32);
    // bacia: parede externa (cilindro), borda superior, água
    const R = 92, RY = 46, wallH = 18;
    const gr = c.createLinearGradient(ax - R, 0, ax + R, 0); gr.addColorStop(0, "#b3a88f"); gr.addColorStop(0.55, "#9a8f7a"); gr.addColorStop(1, "#6a604f");
    c.fillStyle = gr; c.beginPath(); c.ellipse(ax, ay, R, RY, 0, 0, Math.PI); c.lineTo(ax - R, ay - wallH); c.lineTo(ax + R, ay - wallH); c.lineTo(ax + R, ay); c.closePath(); c.fill();
    for (let i = 0; i < 14; i++) { const a = Math.PI * (i / 14); line(c, [ax + Math.cos(a) * R, ay + Math.sin(a) * RY], [ax + Math.cos(a) * R, ay + Math.sin(a) * RY - wallH], "rgba(0,0,0,0.16)", 1); }
    ell(ax, ay - wallH, R, RY, "#c4b99f", "#4a4236", 2);
    ell(ax, ay - wallH, R - 9, RY - 4.5, "#8a8068");
    ell(ax, ay - wallH + 1, R - 12, RY - 6, "#2f7f98");
    const wg = c.createRadialGradient(ax - 24, ay - wallH - 6, 4, ax, ay - wallH, R - 12); wg.addColorStop(0, "#7fd2e6"); wg.addColorStop(1, "#2a7690");
    c.save(); c.beginPath(); c.ellipse(ax, ay - wallH + 1, R - 12, RY - 6, 0, 0, 7); c.clip(); c.fillStyle = wg; c.fillRect(ax - R, ay - wallH - RY, R * 2, RY * 2); c.restore();
    // pedestal e taças
    const py = ay - wallH;
    poly(c, [[ax - 13, py], [ax - 8, py - 44], [ax + 8, py - 44], [ax + 13, py]], "#9a8f7a");
    poly(c, [[ax + 1, py], [ax + 3, py - 44], [ax + 8, py - 44], [ax + 13, py]], "#6e6554");
    ell(ax, py - 46, 36, 14, "#8a8068", "#4a4236", 1.5);
    c.fillStyle = "#b9ae94"; c.beginPath(); c.ellipse(ax, py - 48, 36, 14, 0, 0, 7); c.fill(); c.strokeStyle = "#4a4236"; c.stroke();
    ell(ax, py - 48, 28, 10.5, "#3a8aa4");
    poly(c, [[ax - 8, py - 48], [ax - 5, py - 78], [ax + 5, py - 78], [ax + 8, py - 48]], "#9a8f7a");
    ell(ax, py - 80, 17, 6.5, "#b9ae94", "#4a4236", 1);
    ell(ax, py - 82, 12, 4.5, "#4aa2bc");
    c.fillStyle = "#d4c9a8"; c.beginPath(); c.arc(ax, py - 92, 7, 0, 7); c.fill(); // pináculo
    // jorro: gotas fixas
    c.fillStyle = "rgba(220,245,255,0.85)";
    for (let i = 0; i < 18; i++) { const a = (i / 18) * 6.283; const r = 8 + (i % 3) * 5; c.beginPath(); c.arc(ax + Math.cos(a) * r, py - 74 + Math.abs(Math.sin(a)) * (10 + (i % 2) * 6), 1.6, 0, 7); c.fill(); }
  });
  return { key, ax, ay, w: W, h: H };
}

// =====================================================================================================================
// BAÚ DE ARMAZENAMENTO: caixa isométrica SIMÉTRICA, assentada no losango do tile
// =====================================================================================================================
/**
 * A base é um losango centrado no centro do tile (mesma geometria do chão), os dois lados têm exatamente a mesma largura,
 * as cintas de ferro ficam espelhadas e o cadeado fica sobre a quina da frente (eixo de simetria). Sombra pequena e
 * coerente com o resto da cidade (cai para baixo-direita, rente ao chão).
 * `ax, ay` = centro do losango no chão.
 */
export function chestTex(scene: Phaser.Scene): Tex {
  const key = "town_chest", W = 120, H = 120, ax = 60, ay = 88;
  canvasTex(scene, key, W, H, (c) => {
    const s = 0.98; // lado da base em tiles (cabe no losango do tile com folga)
    const Cf: Pt = [ax, ay + 16 * s]; // quina da frente da base
    // sombra de contato: losango um pouco maior, deslocado ao sul-leste
    const sh = (k: number, ox: number, oy: number, a: string) => poly(c, [[ax + ox, ay - 16 * s * k + oy], [ax + 32 * s * k + ox, ay + oy], [ax + ox, ay + 16 * s * k + oy], [ax - 32 * s * k + ox, ay + oy]], a);
    sh(1.28, 7, 5, "rgba(0,0,0,0.20)"); sh(1.12, 4, 3, "rgba(0,0,0,0.26)"); sh(1.0, 0, 1, "rgba(0,0,0,0.34)");
    const bodyH = 21, lidH = 12;
    const tone = { top: "#a27a46", left: "#85592f", right: "#5f3d1d", edge: "#2a190b" };
    const bx = isoBox(c, Cf, s, s, bodyH, tone);
    // tábuas (linhas horizontais, simétricas nas duas faces)
    const D: Pt = [Cf[0] - 32 * s, Cf[1] - 16 * s], B: Pt = [Cf[0] + 32 * s, Cf[1] - 16 * s];
    for (const v of [bodyH / 3, (2 * bodyH) / 3]) { line(c, [D[0], D[1] - v], [Cf[0], Cf[1] - v], "rgba(0,0,0,0.28)", 1); line(c, [Cf[0], Cf[1] - v], [B[0], B[1] - v], "rgba(0,0,0,0.28)", 1); }
    // tampa: caixa levemente recuada + faixa superior (cantos arredondados simulados pelo recuo)
    const Cl: Pt = [Cf[0], Cf[1] - bodyH];
    isoBox(c, Cl, s, s, lidH, { top: "#bb905a", left: "#9a6c3a", right: "#6c4522", edge: "#2a190b" });
    // cintas de ferro espelhadas: a 18% e 82% do comprimento de cada face
    const iron = "#2b2a2a", ironL = "#4a4846";
    const band = (face: "L" | "R", u: number) => {
      const p = (v: number): Pt => face === "L" ? [D[0] + (Cf[0] - D[0]) * u, D[1] + (Cf[1] - D[1]) * u - v] : [Cf[0] + (B[0] - Cf[0]) * u, Cf[1] + (B[1] - Cf[1]) * u - v];
      const du: Pt = face === "L" ? [2.6, 1.3] : [2.6, -1.3];
      poly(c, [[p(0)[0] - du[0], p(0)[1] - du[1]], [p(0)[0] + du[0], p(0)[1] + du[1]], [p(bodyH + lidH)[0] + du[0], p(bodyH + lidH)[1] + du[1]], [p(bodyH + lidH)[0] - du[0], p(bodyH + lidH)[1] - du[1]]], iron);
      line(c, [p(0)[0] - du[0], p(0)[1] - du[1]], [p(bodyH + lidH)[0] - du[0], p(bodyH + lidH)[1] - du[1]], ironL, 1);
    };
    for (const u of [0.2, 0.8]) { band("L", u); band("R", u); }
    // cinta de topo ao longo da tampa (as duas direções)
    const tc: Pt = [Cl[0], Cl[1] - lidH];
    line(c, [tc[0] - 32 * s, tc[1] - 16 * s], tc, iron, 2); line(c, tc, [tc[0] + 32 * s, tc[1] - 16 * s], iron, 2);
    // rebites
    c.fillStyle = "#c9a85a";
    for (const u of [0.2, 0.8]) for (const v of [4, bodyH + 5]) { c.fillRect(D[0] + (Cf[0] - D[0]) * u - 1, D[1] + (Cf[1] - D[1]) * u - v, 2, 2); c.fillRect(Cf[0] + (B[0] - Cf[0]) * u - 1, Cf[1] + (B[1] - Cf[1]) * u - v, 2, 2); }
    // fechadura dourada centrada na quina da frente (eixo de simetria)
    const lx = Cf[0], ly = Cf[1] - bodyH + 1;
    poly(c, [[lx - 6, ly - 8], [lx + 6, ly - 8], [lx + 6, ly + 6], [lx, ly + 10], [lx - 6, ly + 6]], "#d6ab4c", "#6b4a14", 1.2);
    c.fillStyle = "#3a2810"; c.beginPath(); c.arc(lx, ly - 1, 2.2, 0, 7); c.fill(); c.fillRect(lx - 0.9, ly - 1, 1.8, 6);
    void bx;
  });
  return { key, ax, ay, w: W, h: H };
}
