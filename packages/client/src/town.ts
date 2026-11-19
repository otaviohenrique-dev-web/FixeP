import Phaser from "phaser";
import { VAULT_REACH, type ZoneDef } from "@frixep/shared";

/**
 * A cidade segura (Brasalume), desenhada por código: pedras claras e quentes, praça com fonte, casas e árvores,
 * lanternas, fogueiras e vaga-lumes. Nada daqui interfere na simulação (o servidor decide tudo); é só cenário.
 */
type ToScreen = (x: number, y: number) => { sx: number; sy: number };
const hash = (x: number, y: number) => { const h = Math.sin(x * 127.1 + y * 311.7) * 43758.5453; return h - Math.floor(h); };

const HOUSES: { x: number; y: number; w: number; d: number; h: number; wall: number; roof: number }[] = [
  { x: 8, y: 8, w: 4, d: 4, h: 62, wall: 0xcfb58f, roof: 0x8a4b36 },
  { x: 14, y: 12, w: 3, d: 3, h: 52, wall: 0xd8c4a0, roof: 0x6f5a8a },
  { x: 35, y: 8, w: 4, d: 4, h: 66, wall: 0xc9ad84, roof: 0x7a3f32 },
  { x: 30, y: 12, w: 3, d: 3, h: 50, wall: 0xdac6a2, roof: 0x4f7a6a },
  { x: 7, y: 28, w: 4, d: 3, h: 56, wall: 0xd0b890, roof: 0x7d4a6a },
  { x: 12, y: 34, w: 3, d: 3, h: 50, wall: 0xc4aa82, roof: 0x8a5a36 },
  { x: 36, y: 33, w: 4, d: 3, h: 58, wall: 0xd4bd98, roof: 0x5e6b8a },
  { x: 32, y: 38, w: 3, d: 3, h: 48, wall: 0xcdb48c, roof: 0x8a4b36 },
  { x: 13, y: 40, w: 4, d: 3, h: 54, wall: 0xd6c19c, roof: 0x6a7d4a },
];
const FIRES = [[20, 31], [28, 33], [24, 36]];

export interface TownLayer {
  update(time: number, cam: Phaser.Cameras.Scene2D.Camera, me: { x: number; y: number } | null): void;
  /** o ponto do mundo (px) está sobre o baú? */
  chestHit(wx: number, wy: number): boolean;
  nearChest(gx: number, gy: number): boolean;
  chestPos: { x: number; y: number };
}

export function drawTown(scene: Phaser.Scene, zone: ZoneDef, toScreen: ToScreen, TILE_W: number, TILE_H: number): TownLayer {
  scene.cameras.main.setBackgroundColor("#1d1620");
  const V = (x: number, y: number) => new Phaser.Math.Vector2(x, y);
  const cx = 24, cy = 24;
  const inHouse = (x: number, y: number, m = 0) => HOUSES.some((h) => x > h.x - m && x < h.x + h.w + m && y > h.y - m && y < h.y + h.d + m);

  // ---------------------------------------------------------------- chão
  const g = scene.add.graphics().setDepth(-10);
  for (let x = 0; x < zone.w; x++) {
    for (let y = 0; y < zone.h; y++) {
      const { sx, sy } = toScreen(x, y);
      const h = hash(x, y), d = Math.hypot(x - cx, y - cy);
      const road = (Math.abs(x - cx) <= 2 || Math.abs(y - cy) <= 2) && x > 1 && y > 1 && x < zone.w - 2 && y < zone.h - 2;
      let base: number, line = 0x6a5f50, la = 0.4;
      if (d <= 7.6) { base = d > 6.2 ? ((x + y) % 2 ? 0x7d725f : 0x857a66) : (x + y) % 2 ? 0x9a8f7a : 0xa3987f; line = 0x7d725f; }
      else if (road) { base = (x + y) % 2 ? 0x877c68 : 0x8f846f; line = 0x6f6453; }
      else { base = (x + y) % 2 ? 0x405536 : 0x475d3b; line = 0x33452c; la = 0.25; }
      const pts = [V(sx, sy - TILE_H / 2), V(sx + TILE_W / 2, sy), V(sx, sy + TILE_H / 2), V(sx - TILE_W / 2, sy)];
      g.fillStyle(base, 1).fillPoints(pts, true);
      if (h < 0.1) g.fillStyle(base === 0x405536 || base === 0x475d3b ? 0x5d7a45 : 0xb4a98f, 0.35).fillEllipse(sx + (h - 0.05) * 160, sy, 8 + h * 50, 3 + h * 12);
      g.lineStyle(1, line, la).strokePoints(pts, true);
    }
  }
  const c = (x: number, y: number) => { const p = toScreen(x, y); return V(p.sx, p.sy); };
  g.lineStyle(3, 0x8a6a45, 0.9).strokePoints([c(-0.5, -0.5), c(zone.w - 0.5, -0.5), c(zone.w - 0.5, zone.h - 0.5), c(-0.5, zone.h - 0.5)], true);

  // brilho: textura radial reutilizável (luz quente aditiva)
  if (!scene.textures.exists("town_glow")) {
    const t = scene.textures.createCanvas("town_glow", 128, 128)!;
    const ctx = t.getContext();
    const gr = ctx.createRadialGradient(64, 64, 0, 64, 64, 64);
    gr.addColorStop(0, "rgba(255,255,255,1)"); gr.addColorStop(0.35, "rgba(255,255,255,0.35)"); gr.addColorStop(1, "rgba(255,255,255,0)");
    ctx.fillStyle = gr; ctx.fillRect(0, 0, 128, 128); t.refresh();
  }
  const glows: { img: Phaser.GameObjects.Image; base: number; ph: number; amp: number }[] = [];
  const glow = (sx: number, sy: number, size: number, color: number, alpha: number, amp = 0.15, depth = 9000) => {
    const img = scene.add.image(sx, sy, "town_glow").setBlendMode(Phaser.BlendModes.ADD).setTint(color).setAlpha(alpha).setScale(size / 128).setDepth(depth);
    glows.push({ img, base: alpha, ph: Math.random() * 6.28, amp });
    return img;
  };
  const prop = (sy: number) => scene.add.graphics().setDepth(sy);
  const shadow = (gr: Phaser.GameObjects.Graphics, sx: number, sy: number, w: number, h: number) => gr.fillStyle(0x000000, 0.28).fillEllipse(sx, sy, w, h);

  // ---------------------------------------------------------------- casas
  const house = (hs: (typeof HOUSES)[number]) => {
    const A = toScreen(hs.x, hs.y), B = toScreen(hs.x + hs.w, hs.y), C = toScreen(hs.x + hs.w, hs.y + hs.d), D = toScreen(hs.x, hs.y + hs.d);
    const gr = prop(C.sy);
    shadow(gr, (D.sx + B.sx) / 2, C.sy - 4, (B.sx - D.sx) + 30, 40);
    const up = (p: { sx: number; sy: number }, h: number) => V(p.sx, p.sy - h);
    // parede esquerda (D-C) e direita (C-B)
    gr.fillStyle(hs.wall, 1).fillPoints([V(D.sx, D.sy), V(C.sx, C.sy), up(C, hs.h), up(D, hs.h)], true);
    gr.fillStyle(hs.wall, 1).fillPoints([V(C.sx, C.sy), V(B.sx, B.sy), up(B, hs.h), up(C, hs.h)], true);
    gr.fillStyle(0x000000, 0.2).fillPoints([V(C.sx, C.sy), V(B.sx, B.sy), up(B, hs.h), up(C, hs.h)], true); // lado da sombra
    gr.lineStyle(2, 0x5a4630, 0.5).strokePoints([V(D.sx, D.sy), V(C.sx, C.sy), up(C, hs.h), up(D, hs.h)], true).strokePoints([V(C.sx, C.sy), V(B.sx, B.sy), up(B, hs.h), up(C, hs.h)], true);
    // vigas de madeira
    gr.lineStyle(3, 0x5b3d24, 0.8).lineBetween(C.sx, C.sy, C.sx, C.sy - hs.h).lineBetween(D.sx, D.sy - hs.h * 0.55, C.sx, C.sy - hs.h * 0.55).lineBetween(C.sx, C.sy - hs.h * 0.55, B.sx, B.sy - hs.h * 0.55);
    // telhado de quatro águas, com beiral
    const k = 0.14, mx = (A.sx + C.sx) / 2, my = (A.sy + C.sy) / 2 - hs.h;
    const ov = (p: { sx: number; sy: number }) => V(mx + (p.sx - mx) * (1 + k), my + (p.sy - hs.h - my) * (1 + k) - 0);
    const apex = V(mx, my - 34 - hs.w * 3);
    const dd = ov(D), cc = ov(C), bb = ov(B), aa = ov(A);
    gr.fillStyle(hs.roof, 1).fillTriangle(aa.x, aa.y, bb.x, bb.y, apex.x, apex.y);
    gr.fillStyle(hs.roof, 1).fillTriangle(aa.x, aa.y, dd.x, dd.y, apex.x, apex.y);
    gr.fillStyle(hs.roof, 1).fillTriangle(dd.x, dd.y, cc.x, cc.y, apex.x, apex.y);
    gr.fillStyle(0x000000, 0.22).fillTriangle(cc.x, cc.y, bb.x, bb.y, apex.x, apex.y);
    gr.fillStyle(hs.roof, 1).fillTriangle(cc.x, cc.y, bb.x, bb.y, apex.x, apex.y);
    gr.fillStyle(0x000000, 0.22).fillTriangle(cc.x, cc.y, bb.x, bb.y, apex.x, apex.y);
    gr.lineStyle(2, 0x2b1a12, 0.55).strokeTriangle(dd.x, dd.y, cc.x, cc.y, apex.x, apex.y).strokeTriangle(cc.x, cc.y, bb.x, bb.y, apex.x, apex.y);
    // janelas acesas e porta
    const face = (p: { sx: number; sy: number }, q: { sx: number; sy: number }, t: number) => ({ x: p.sx + (q.sx - p.sx) * t, y: p.sy + (q.sy - p.sy) * t });
    for (const [p, q, n] of [[D, C, hs.d], [C, B, hs.w]] as const) {
      for (let i = 0; i < n - 1; i++) {
        const f = face(p, q, (i + 0.8) / n);
        gr.fillStyle(0xffc760, 0.95).fillRect(f.x - 5, f.y - hs.h * 0.7, 10, 14);
        gr.lineStyle(2, 0x4a2f1c, 1).strokeRect(f.x - 5, f.y - hs.h * 0.7, 10, 14);
        glow(f.x, f.y - hs.h * 0.7 + 7, 70, 0xffa845, 0.22, 0.05, C.sy + 2);
      }
    }
    const door = face(C, B, 0.28);
    gr.fillStyle(0x4a2b18, 1).fillRect(door.x - 7, door.y - 26, 14, 26);
    gr.fillStyle(0xe0b565, 1).fillCircle(door.x + 4, door.y - 13, 1.6);
    const ch = face(A, C, 0.5);
    gr.fillStyle(0x5a4a40, 1).fillRect(ch.x + 6, ch.y - hs.h - 40, 9, 22);
  };
  HOUSES.forEach(house);

  // ---------------------------------------------------------------- árvores, canteiros, bancos, barris
  const tree = (gx: number, gy: number, s: number) => {
    const { sx, sy } = toScreen(gx, gy);
    const gr = prop(sy);
    shadow(gr, sx, sy, 56 * s, 20 * s);
    gr.fillStyle(0x5a3b22, 1).fillRect(sx - 4 * s, sy - 34 * s, 8 * s, 34 * s);
    const cols = [0x34602f, 0x437a3a, 0x58923f];
    const j = hash(gx, gy);
    [[-14, -42, 20], [12, -46, 18], [0, -62, 22], [-4, -40, 18]].forEach(([dx, dy, r], i) => gr.fillStyle(cols[(i + (j > 0.5 ? 1 : 0)) % 3], 1).fillCircle(sx + dx * s, sy + dy * s, r * s));
    gr.fillStyle(0xf2d57a, 0.55).fillCircle(sx + 8 * s, sy - 66 * s, 3 * s).fillCircle(sx - 12 * s, sy - 50 * s, 2.5 * s); // luz quente entre as folhas
  };
  for (let x = 1; x < zone.w - 1; x += 3) {
    for (let y = 1; y < zone.h - 1; y += 3) {
      const gx = x + (hash(x, y) - 0.5) * 2.2, gy = y + (hash(y, x) - 0.5) * 2.2;
      const onRoad = Math.abs(gx - cx) < 3.8 || Math.abs(gy - cy) < 3.8;
      if (onRoad || Math.hypot(gx - cx, gy - cy) < 10 || inHouse(gx, gy, 1.6) || Math.hypot(gx - zone.vault!.x, gy - zone.vault!.y) < 3.5) continue;
      if (zone.portals.some((p) => Math.hypot(gx - p.x, gy - p.y) < 4.5)) continue;
      if (Math.hypot(gx - 24, gy - 30) < 5 || FIRES.some(([fx, fy]) => Math.hypot(gx - fx, gy - fy) < 3)) continue;
      if (hash(x * 3, y * 7) < 0.42) tree(gx, gy, 0.85 + hash(x, y * 2) * 0.5);
    }
  }
  // canteiros de flores ao redor da praça
  const flowers = prop(8000);
  flowers.setDepth(-5);
  const FL = [0xf2a0b8, 0xf2d57a, 0xe8e0f5, 0xe58a5a];
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * Math.PI * 2 + 0.2, rr = 9.2;
    for (let k = 0; k < 9; k++) {
      const gx = cx + Math.cos(a) * rr + (hash(i, k) - 0.5) * 1.8, gy = cy + Math.sin(a) * rr + (hash(k, i) - 0.5) * 1.8;
      if (Math.abs(gx - cx) < 3 || Math.abs(gy - cy) < 3) continue;
      const { sx, sy } = toScreen(gx, gy);
      flowers.fillStyle(0x36502c, 1).fillEllipse(sx, sy + 1, 9, 4);
      flowers.fillStyle(FL[(i + k) % 4], 1).fillCircle(sx, sy - 2, 2.2);
    }
  }
  const bench = (gx: number, gy: number, flip: boolean) => {
    const { sx, sy } = toScreen(gx, gy);
    const gr = prop(sy);
    shadow(gr, sx, sy + 2, 48, 14);
    const dx = flip ? 1 : -1;
    gr.fillStyle(0x4a2e1a, 1).fillRect(sx - 20, sy - 8, 4, 10).fillRect(sx + 16, sy - 8, 4, 10);
    gr.fillStyle(0x8a5e36, 1).fillRect(sx - 22, sy - 12, 44, 6);
    gr.fillStyle(0x6e4a2a, 1).fillRect(sx - 22, sy - 22 + (dx > 0 ? 0 : 0), 44, 5);
  };
  for (let i = 0; i < 4; i++) { const a = Math.PI / 4 + (i * Math.PI) / 2; bench(cx + Math.cos(a) * 5.4, cy + Math.sin(a) * 5.4, i % 2 === 0); }
  const barrel = (gx: number, gy: number) => {
    const { sx, sy } = toScreen(gx, gy);
    const gr = prop(sy);
    shadow(gr, sx, sy, 22, 8);
    gr.fillStyle(0x6b4527, 1).fillRect(sx - 8, sy - 18, 16, 18).fillEllipse(sx, sy - 18, 16, 6).fillEllipse(sx, sy, 16, 6);
    gr.lineStyle(2, 0x3a2a1c, 1).lineBetween(sx - 8, sy - 12, sx + 8, sy - 12).lineBetween(sx - 8, sy - 5, sx + 8, sy - 5);
  };
  [[17.2, 22.2], [17.8, 22.8], [31.2, 22.4], [20.8, 26.4]].forEach(([x, y]) => barrel(x, y));

  // ---------------------------------------------------------------- fonte da praça
  const fc = toScreen(cx, cy);
  const fount = prop(fc.sy);
  shadow(fount, fc.sx, fc.sy + 8, 220, 90);
  fount.fillStyle(0x6f6657, 1).fillEllipse(fc.sx, fc.sy + 6, 200, 96);
  fount.fillStyle(0x9a8f7a, 1).fillEllipse(fc.sx, fc.sy - 4, 200, 96);
  fount.fillStyle(0x4aa0b8, 1).fillEllipse(fc.sx, fc.sy - 6, 176, 80);
  fount.fillStyle(0x6bc2d6, 0.55).fillEllipse(fc.sx - 14, fc.sy - 10, 110, 44);
  fount.fillStyle(0x8c8270, 1).fillRect(fc.sx - 10, fc.sy - 70, 20, 66).fillEllipse(fc.sx, fc.sy - 4, 34, 14);
  fount.fillStyle(0xa89d86, 1).fillEllipse(fc.sx, fc.sy - 56, 78, 28).fillStyle(0x4aa0b8, 1).fillEllipse(fc.sx, fc.sy - 58, 62, 20);
  fount.fillStyle(0xb9a98a, 1).fillCircle(fc.sx, fc.sy - 82, 9);
  const water = scene.add.graphics().setDepth(fc.sy + 1);

  // ---------------------------------------------------------------- lanternas e fogueiras
  const lamp = (gx: number, gy: number) => {
    const { sx, sy } = toScreen(gx, gy);
    const gr = prop(sy);
    shadow(gr, sx, sy, 18, 7);
    gr.fillStyle(0x2d2620, 1).fillRect(sx - 2, sy - 56, 4, 56).fillRect(sx - 6, sy - 3, 12, 3);
    gr.fillStyle(0x3b3128, 1).fillRect(sx - 7, sy - 70, 14, 5).fillRect(sx - 7, sy - 56, 14, 3);
    gr.fillStyle(0xffd27a, 1).fillRect(sx - 5, sy - 65, 10, 9);
    glow(sx, sy - 60, 190, 0xffa646, 0.34, 0.08);
    glow(sx, sy - 2, 120, 0xffa646, 0.16, 0.04, 0.8);
  };
  const LAMPS: number[][] = [];
  for (let i = 0; i < 8; i++) { const a = (i / 8) * Math.PI * 2 + Math.PI / 8; LAMPS.push([cx + Math.cos(a) * 8.6, cy + Math.sin(a) * 8.6]); }
  for (const y of [11, 17, 36, 42]) LAMPS.push([21.2, y], [26.8, y]);
  for (const x of [10, 15, 33, 38]) LAMPS.push([x, 21.2], [x, 26.8]);
  LAMPS.forEach(([x, y]) => { if (!inHouse(x, y, 0.5)) lamp(x, y); });

  const fires = FIRES.map(([fx, fy]) => {
    const { sx, sy } = toScreen(fx, fy);
    const base = prop(sy);
    shadow(base, sx, sy + 2, 56, 20);
    for (let i = 0; i < 6; i++) { const a = (i / 6) * 6.28; base.fillStyle(0x6e6a64, 1).fillCircle(sx + Math.cos(a) * 17, sy + Math.sin(a) * 7, 4); }
    base.fillStyle(0x4a2e1a, 1).fillRect(sx - 14, sy - 4, 28, 5).fillRect(sx - 4, sy - 8, 8, 9);
    const flame = scene.add.graphics().setDepth(sy + 1);
    glow(sx, sy - 14, 240, 0xff8a2a, 0.4, 0.12);
    glow(sx, sy, 160, 0xff8a2a, 0.2, 0.06, 0.8);
    // bancos ao redor da fogueira
    return { sx, sy, flame };
  });
  [[18.4, 31], [29.6, 33]].forEach(([x, y]) => bench(x, y, true));

  // ---------------------------------------------------------------- portais: pilares com tochas
  zone.portals.forEach((p) => {
    const horiz = Math.abs(p.y - 24) < 1; // portais leste/oeste ficam na estrada x; norte na y
    const off = [[0, -2.1], [0, 2.1]].map(([a, b]) => (horiz ? [p.x + a, p.y + b] : [p.x + b, p.y + a]));
    off.forEach(([x, y]) => {
      const { sx, sy } = toScreen(x, y);
      const gr = prop(sy);
      shadow(gr, sx, sy, 34, 12);
      gr.fillStyle(0x7d7466, 1).fillRect(sx - 9, sy - 70, 18, 70).fillStyle(0xa0968a, 1).fillRect(sx - 12, sy - 78, 24, 10).fillRect(sx - 12, sy - 4, 24, 4);
      gr.fillStyle(0xffd27a, 1).fillCircle(sx, sy - 86, 6);
      glow(sx, sy - 86, 150, 0xffb050, 0.4, 0.12);
    });
  });

  // ---------------------------------------------------------------- baú de armazenamento
  const v = zone.vault!;
  const vp = toScreen(v.x, v.y);
  const chest = prop(vp.sy);
  shadow(chest, vp.sx, vp.sy + 4, 110, 40);
  // corpo: caixa isométrica 1,4 x 0,9 tile
  const bw = 46, bd = 26, bh = 36, hx = vp.sx, hy = vp.sy;
  const top = [V(hx, hy - bd - bh), V(hx + bw, hy - bd / 2 - bh), V(hx, hy - bh), V(hx - bw, hy - bd / 2 - bh)];
  chest.fillStyle(0x6b4423, 1).fillPoints([V(hx - bw, hy - bd / 2 - bh), V(hx, hy - bh), V(hx, hy), V(hx - bw, hy - bd / 2)], true);
  chest.fillStyle(0x4f3219, 1).fillPoints([V(hx, hy - bh), V(hx + bw, hy - bd / 2 - bh), V(hx + bw, hy - bd / 2), V(hx, hy)], true);
  chest.fillStyle(0x8a5a2e, 1).fillPoints(top, true);
  // tampa abaulada
  chest.fillStyle(0x7d4f28, 1).fillPoints([V(hx - bw, hy - bd / 2 - bh), V(hx, hy - bh), V(hx, hy - bh - 18), V(hx - bw + 2, hy - bd / 2 - bh - 14)], true);
  chest.fillStyle(0x5e3a1d, 1).fillPoints([V(hx, hy - bh), V(hx + bw, hy - bd / 2 - bh), V(hx + bw - 2, hy - bd / 2 - bh - 14), V(hx, hy - bh - 18)], true);
  chest.fillStyle(0x9a6a36, 1).fillPoints([V(hx, hy - bd - bh - 16), V(hx + bw - 2, hy - bd / 2 - bh - 14), V(hx, hy - bh - 18), V(hx - bw + 2, hy - bd / 2 - bh - 14)], true);
  // cintas de ferro e fecho dourado
  chest.fillStyle(0x30302f, 1).fillRect(hx - bw + 8, hy - bd / 2 - bh - 12, 6, bh + 12 - 0).fillRect(hx + bw - 14, hy - bd / 2 - bh - 12, 6, bh + 12);
  chest.fillRect(hx - 26, hy - bh + 4 - 12, 6, bh - 4).fillRect(hx + 18, hy - bh + 4 - 12, 6, bh - 4);
  chest.fillStyle(0xe0b565, 1).fillRoundedRect(hx - 8, hy - bh - 4, 16, 18, 3);
  chest.fillStyle(0x3a2810, 1).fillCircle(hx, hy - bh + 4, 2.4).fillRect(hx - 1, hy - bh + 4, 2, 6);
  chest.lineStyle(2, 0x2a1a0c, 0.7).strokePoints(top, true);
  const chestGlow = glow(vp.sx, vp.sy - 30, 220, 0xffc060, 0.2, 0.1);
  const sign = scene.add.text(vp.sx, vp.sy - bh - bd - 44, "BAÚ DE ARMAZENAMENTO", { fontFamily: "Cinzel, Georgia, serif", fontStyle: "bold", fontSize: "12px", color: "#f4e6b8", stroke: "#000", strokeThickness: 3, backgroundColor: "rgba(74,46,26,0.92)", padding: { x: 7, y: 4 } }).setOrigin(0.5).setDepth(vp.sy + 3);
  const ring = scene.add.graphics().setDepth(0.7);

  // ---------------------------------------------------------------- vaga-lumes (acompanham a câmera)
  if (!scene.textures.exists("town_fly")) {
    const t = scene.textures.createCanvas("town_fly", 16, 16)!;
    const ctx = t.getContext();
    const gr = ctx.createRadialGradient(8, 8, 0, 8, 8, 8);
    gr.addColorStop(0, "rgba(255,244,190,1)"); gr.addColorStop(0.4, "rgba(255,214,110,0.55)"); gr.addColorStop(1, "rgba(255,200,90,0)");
    ctx.fillStyle = gr; ctx.fillRect(0, 0, 16, 16); t.refresh();
  }
  const flies = scene.add.particles(0, 0, "town_fly", {
    x: { min: -520, max: 520 }, y: { min: -360, max: 360 },
    lifespan: { min: 4000, max: 8000 }, frequency: 140, quantity: 1,
    speedX: { min: -14, max: 14 }, speedY: { min: -14, max: 8 },
    scale: { start: 0.35, end: 0.1 }, alpha: { values: [0, 0.9, 0.25, 0.85, 0] }, blendMode: "ADD",
  }).setDepth(9500);

  return {
    chestPos: v,
    chestHit: (wx, wy) => Math.abs(wx - vp.sx) < 62 && wy > vp.sy - 110 && wy < vp.sy + 16,
    nearChest: (gx, gy) => Math.hypot(gx - v.x, gy - v.y) <= VAULT_REACH,
    update(time, cam, me) {
      for (const l of glows) l.img.setAlpha(l.base + Math.sin(time / 420 + l.ph) * l.base * l.amp * 2.2);
      flies.setPosition(cam.worldView.centerX, cam.worldView.centerY);
      // fonte: ondas e gotas
      water.clear();
      for (let i = 0; i < 3; i++) { const t = ((time / 1800 + i / 3) % 1); water.lineStyle(2, 0xdff6ff, 0.55 * (1 - t)).strokeEllipse(fc.sx, fc.sy - 6, 40 + 130 * t, 18 + 56 * t); }
      for (let i = 0; i < 9; i++) {
        const t = ((time / 900 + i / 9) % 1), a = (i / 9) * 6.28;
        water.fillStyle(0xcff1ff, 0.8 * (1 - t * 0.6)).fillCircle(fc.sx + Math.cos(a) * 26 * t, fc.sy - 84 + 108 * t * t - 40 * Math.sin(t * 3.14) , 2.2);
      }
      for (const f of fires) {
        f.flame.clear();
        for (let i = 0; i < 4; i++) {
          const w = 9 - i * 1.6, hgt = 24 + Math.sin(time / (110 + i * 37) + i) * 6 - i * 3;
          f.flame.fillStyle([0xff5a1c, 0xff8a2a, 0xffbf4a, 0xfff0a0][i], 0.92).fillTriangle(f.sx - w, f.sy - 4, f.sx + w, f.sy - 4, f.sx + Math.sin(time / 170 + i) * 3, f.sy - 4 - hgt);
        }
      }
      // baú: anel dourado quando ao alcance
      ring.clear();
      chestGlow.setScale((220 + Math.sin(time / 500) * 14) / 128);
      if (me && Math.hypot(me.x - v.x, me.y - v.y) <= VAULT_REACH) {
        ring.lineStyle(3, 0xf0cf86, 0.55 + 0.25 * Math.sin(time / 260)).strokeEllipse(vp.sx, vp.sy + 6, 120, 52);
      }
      sign.setAlpha(1);
    },
  };
}
