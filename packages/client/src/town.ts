import Phaser from "phaser";
import { VAULT_REACH, type ZoneDef } from "@frixep/shared";

/**
 * A cidade segura (Brasalume), desenhada por código: pedras claras e quentes, praça com fonte, casas e árvores,
 * lanternas, fogueiras e vaga-lumes. Nada daqui interfere na simulação (o servidor decide tudo); é só cenário.
 *
 * Otimizado para alta taxa de quadros (60 FPS):
 * - Árvores, lanternas, bancos e barris gerados como texturas em canvas e renderizados como Sprites/Imagens (WebGL instanced batching).
 * - Casas alinhadas 100% à geometria isométrica (quinas nos nós de azulejos 2:1, janelas e portas inclinadas com paralelogramos isométricos).
 * - Sombra de contato integrada ao chão.
 * - Redução drástica de objetos Graphics individuais e limites controlados de luzes aditivas.
 */
type ToScreen = (x: number, y: number) => { sx: number; sy: number };
const hash = (x: number, y: number) => {
  const h = Math.sin(x * 127.1 + y * 311.7) * 43758.5453;
  return h - Math.floor(h);
};

const HOUSES: { x: number; y: number; w: number; d: number; h: number; wall: number; roof: number }[] = [
  { x: 8, y: 8, w: 4, d: 4, h: 58, wall: 0xcfb58f, roof: 0x8a4b36 },
  { x: 14, y: 12, w: 3, d: 3, h: 50, wall: 0xd8c4a0, roof: 0x6f5a8a },
  { x: 35, y: 8, w: 4, d: 4, h: 62, wall: 0xc9ad84, roof: 0x7a3f32 },
  { x: 30, y: 12, w: 3, d: 3, h: 48, wall: 0xdac6a2, roof: 0x4f7a6a },
  { x: 7, y: 28, w: 4, d: 3, h: 54, wall: 0xd0b890, roof: 0x7d4a6a },
  { x: 12, y: 34, w: 3, d: 3, h: 48, wall: 0xc4aa82, roof: 0x8a5a36 },
  { x: 36, y: 33, w: 4, d: 3, h: 56, wall: 0xd4bd98, roof: 0x5e6b8a },
  { x: 32, y: 38, w: 3, d: 3, h: 46, wall: 0xcdb48c, roof: 0x8a4b36 },
  { x: 13, y: 40, w: 4, d: 3, h: 52, wall: 0xd6c19c, roof: 0x6a7d4a },
];
const FIRES = [[20, 31], [28, 33], [24, 36]];

export interface TownLayer {
  update(time: number, cam: Phaser.Cameras.Scene2D.Camera, me: { x: number; y: number } | null): void;
  chestHit(wx: number, wy: number): boolean;
  nearChest(gx: number, gy: number): boolean;
  chestPos: { x: number; y: number };
}

export function drawTown(scene: Phaser.Scene, zone: ZoneDef, toScreen: ToScreen, TILE_W: number, TILE_H: number): TownLayer {
  scene.cameras.main.setBackgroundColor("#1d1620");
  const V = (x: number, y: number) => new Phaser.Math.Vector2(x, y);
  const cx = 24, cy = 24;
  const inHouse = (x: number, y: number, m = 0) =>
    HOUSES.some((h) => x > h.x - m && x < h.x + h.w + m && y > h.y - m && y < h.y + h.d + m);

  // ---------------------------------------------------------------- CHÃO ESTÁTICO
  const g = scene.add.graphics().setDepth(-10);
  for (let x = 0; x < zone.w; x++) {
    for (let y = 0; y < zone.h; y++) {
      const { sx, sy } = toScreen(x, y);
      const h = hash(x, y), d = Math.hypot(x - cx, y - cy);
      const road = (Math.abs(x - cx) <= 2 || Math.abs(y - cy) <= 2) && x > 1 && y > 1 && x < zone.w - 2 && y < zone.h - 2;
      let base: number, line = 0x6a5f50, la = 0.4;
      if (d <= 7.6) {
        base = d > 6.2 ? ((x + y) % 2 ? 0x7d725f : 0x857a66) : (x + y) % 2 ? 0x9a8f7a : 0xa3987f;
        line = 0x7d725f;
      } else if (road) {
        base = (x + y) % 2 ? 0x877c68 : 0x8f846f;
        line = 0x6f6453;
      } else {
        base = (x + y) % 2 ? 0x405536 : 0x475d3b;
        line = 0x33452c;
        la = 0.25;
      }
      const pts = [V(sx, sy - TILE_H / 2), V(sx + TILE_W / 2, sy), V(sx, sy + TILE_H / 2), V(sx - TILE_W / 2, sy)];
      g.fillStyle(base, 1).fillPoints(pts, true);
      if (h < 0.08) {
        g.fillStyle(base === 0x405536 || base === 0x475d3b ? 0x5d7a45 : 0xb4a98f, 0.3).fillEllipse(
          sx + (h - 0.04) * 120, sy, 8 + h * 40, 3 + h * 10
        );
      }
      g.lineStyle(1, line, la).strokePoints(pts, true);
    }
  }
  const c = (x: number, y: number) => {
    const p = toScreen(x, y);
    return V(p.sx, p.sy);
  };
  g.lineStyle(3, 0x8a6a45, 0.9).strokePoints(
    [c(-0.5, -0.5), c(zone.w - 0.5, -0.5), c(zone.w - 0.5, zone.h - 0.5), c(-0.5, zone.h - 0.5)],
    true
  );

  // ---------------------------------------------------------------- TEXTURAS DE CENÁRIO (BAKED PARA ALTO FPS)
  // 1. Textura do Brilho Suave (Luz Aditiva)
  if (!scene.textures.exists("town_glow")) {
    const t = scene.textures.createCanvas("town_glow", 128, 128)!;
    const ctx = t.getContext();
    const gr = ctx.createRadialGradient(64, 64, 0, 64, 64, 64);
    gr.addColorStop(0, "rgba(255,255,255,1)");
    gr.addColorStop(0.35, "rgba(255,255,255,0.35)");
    gr.addColorStop(1, "rgba(255,255,255,0)");
    ctx.fillStyle = gr;
    ctx.fillRect(0, 0, 128, 128);
    t.refresh();
  }

  // 2. Texturas de Árvores (Variante 1 e 2)
  if (!scene.textures.exists("town_tree_1")) {
    const createTreeTex = (key: string, v2: boolean) => {
      const w = 128, h = 144;
      const t = scene.textures.createCanvas(key, w, h)!;
      const ctx = t.getContext();
      const tx = w / 2, ty = h - 14;
      // Sombra suave elíptica no chão
      ctx.fillStyle = "rgba(0,0,0,0.32)";
      ctx.beginPath();
      ctx.ellipse(tx, ty, 32, 12, 0, 0, Math.PI * 2);
      ctx.fill();
      // Tronco
      ctx.fillStyle = "#4a2e18";
      ctx.fillRect(tx - 5, ty - 42, 10, 42);
      ctx.fillStyle = "#331f10";
      ctx.fillRect(tx - 2, ty - 42, 4, 42);
      // Copa frondosa em camadas
      const colA = v2 ? "#284d24" : "#2f572a";
      const colB = v2 ? "#356530" : "#3d6f35";
      const colC = v2 ? "#45823e" : "#4f8d46";
      const circs = [
        [-15, -46, 22, colA],
        [15, -48, 20, colB],
        [0, -68, 24, colC],
        [-6, -42, 18, colB],
        [8, -60, 20, colC],
      ] as const;
      for (const [dx, dy, r, col] of circs) {
        ctx.fillStyle = col;
        ctx.beginPath();
        ctx.arc(tx + dx, ty + dy, r, 0, Math.PI * 2);
        ctx.fill();
      }
      // Destaques de luz entre as folhas
      ctx.fillStyle = "rgba(242, 213, 122, 0.45)";
      ctx.beginPath();
      ctx.arc(tx + 8, ty - 70, 3.5, 0, Math.PI * 2);
      ctx.arc(tx - 12, ty - 54, 2.5, 0, Math.PI * 2);
      ctx.fill();
      t.refresh();
    };
    createTreeTex("town_tree_1", false);
    createTreeTex("town_tree_2", true);
  }

  // 3. Textura de Poste de Lanterna
  if (!scene.textures.exists("town_lamp")) {
    const w = 32, h = 90;
    const t = scene.textures.createCanvas("town_lamp", w, h)!;
    const ctx = t.getContext();
    const lx = w / 2, ly = h - 8;
    // Sombra no chão
    ctx.fillStyle = "rgba(0,0,0,0.3)";
    ctx.beginPath();
    ctx.ellipse(lx, ly, 10, 4, 0, 0, Math.PI * 2);
    ctx.fill();
    // Haste de ferro
    ctx.fillStyle = "#26221d";
    ctx.fillRect(lx - 2, ly - 64, 4, 64);
    ctx.fillRect(lx - 6, ly - 4, 12, 4);
    // Lanterna
    ctx.fillStyle = "#382e25";
    ctx.fillRect(lx - 7, ly - 76, 14, 4);
    ctx.fillRect(lx - 6, ly - 64, 12, 3);
    ctx.fillRect(lx - 7, ly - 76, 2, 14);
    ctx.fillRect(lx + 5, ly - 76, 2, 14);
    // Vidro iluminado
    ctx.fillStyle = "#ffd56b";
    ctx.fillRect(lx - 5, ly - 72, 10, 9);
    t.refresh();
  }

  // 4. Textura de Banco e Barril
  if (!scene.textures.exists("town_barrel")) {
    const t = scene.textures.createCanvas("town_barrel", 32, 32)!;
    const ctx = t.getContext();
    const bx = 16, by = 24;
    ctx.fillStyle = "rgba(0,0,0,0.3)";
    ctx.beginPath();
    ctx.ellipse(bx, by, 12, 5, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#6b4527";
    ctx.fillRect(bx - 9, by - 18, 18, 18);
    ctx.beginPath();
    ctx.ellipse(bx, by - 18, 9, 4, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#3a2a1c";
    ctx.fillRect(bx - 9, by - 13, 18, 2);
    ctx.fillRect(bx - 9, by - 6, 18, 2);
    t.refresh();
  }

  const glows: { img: Phaser.GameObjects.Image; base: number; ph: number; amp: number }[] = [];
  const glow = (sx: number, sy: number, size: number, color: number, alpha: number, amp = 0.15, depth = 9000) => {
    const img = scene.add
      .image(sx, sy, "town_glow")
      .setBlendMode(Phaser.BlendModes.ADD)
      .setTint(color)
      .setAlpha(alpha)
      .setScale(size / 128)
      .setDepth(depth);
    glows.push({ img, base: alpha, ph: Math.random() * 6.28, amp });
    return img;
  };
  const prop = (sy: number) => scene.add.graphics().setDepth(sy);

  // ---------------------------------------------------------------- CASAS ISOMÉTRICAS
  const house = (hs: (typeof HOUSES)[number]) => {
    // Quinas exatas na malha de azulejos (losangos 2:1 perfeitos):
    const x0 = hs.x - 0.5;
    const y0 = hs.y - 0.5;
    const x1 = hs.x + hs.w - 0.5;
    const y1 = hs.y + hs.d - 0.5;

    const A = toScreen(x0, y0); // norte / fundo
    const B = toScreen(x1, y0); // leste / direita
    const C = toScreen(x1, y1); // sul / frente (mais próximo da câmera)
    const D = toScreen(x0, y1); // oeste / esquerda

    // Sombra de contato no chão (firme sob a base da casa, estendendo suavemente para o sudeste)
    const shGr = scene.add.graphics().setDepth(-9);
    const sOff = 0.35;
    const sB = toScreen(x1 + sOff, y0 + sOff);
    const sC = toScreen(x1 + sOff, y1 + sOff);
    const sD = toScreen(x0 + sOff, y1 + sOff);
    shGr.fillStyle(0x000000, 0.32).fillPoints(
      [V(A.sx, A.sy), V(B.sx, B.sy), V(sB.sx, sB.sy), V(sC.sx, sC.sy), V(sD.sx, sD.sy), V(D.sx, D.sy)],
      true
    );

    const gr = prop(C.sy);
    const up = (p: { sx: number; sy: number }, h: number) => V(p.sx, p.sy - h);

    // 1. Alicerce de pedra na base isométrica (altura 7px)
    const fH = 7;
    gr.fillStyle(0x3a3228, 1).fillPoints([V(D.sx, D.sy), V(C.sx, C.sy), up(C, fH), up(D, fH)], true);
    gr.fillStyle(0x2d261e, 1).fillPoints([V(C.sx, C.sy), V(B.sx, B.sy), up(B, fH), up(C, fH)], true);
    gr.lineStyle(1.5, 0x221c16, 0.7)
      .strokePoints([V(D.sx, D.sy), V(C.sx, C.sy), up(C, fH), up(D, fH)], true)
      .strokePoints([V(C.sx, C.sy), V(B.sx, B.sy), up(B, fH), up(C, fH)], true);

    // 2. Paredes de enxaimel
    // Parede frontal-esquerda (D -> C): iluminada
    gr.fillStyle(hs.wall, 1).fillPoints([up(D, fH), up(C, fH), up(C, hs.h), up(D, hs.h)], true);
    // Parede frontal-direita (C -> B): sombreada (~22% mais escura)
    gr.fillStyle(hs.wall, 1).fillPoints([up(C, fH), up(B, fH), up(B, hs.h), up(C, hs.h)], true);
    gr.fillStyle(0x000000, 0.22).fillPoints([up(C, fH), up(B, fH), up(B, hs.h), up(C, hs.h)], true);

    // Vigas mestras de madeira escura
    gr.lineStyle(2.5, 0x422a18, 0.9);
    gr.lineBetween(D.sx, D.sy - fH, D.sx, D.sy - hs.h);
    gr.lineBetween(C.sx, C.sy - fH, C.sx, C.sy - hs.h);
    gr.lineBetween(B.sx, B.sy - fH, B.sx, B.sy - hs.h);

    const midH = hs.h * 0.52;
    gr.lineBetween(D.sx, D.sy - midH, C.sx, C.sy - midH);
    gr.lineBetween(C.sx, C.sy - midH, B.sx, B.sy - midH);
    gr.lineBetween(D.sx, D.sy - hs.h, C.sx, C.sy - hs.h);
    gr.lineBetween(C.sx, C.sy - hs.h, B.sx, B.sy - hs.h);

    // 3. Janelas e portas ISOMÉTRICAS (Paralelogramos com inclinação exata 2:1)
    const winH = 14;
    const winW = 7;

    // Janelas na parede esquerda (D -> C, inclinação dy/dx = +0.5)
    for (let i = 0; i < hs.d - 1; i++) {
      const t = (i + 0.65) / hs.d;
      const wx = D.sx + (C.sx - D.sx) * t;
      const wy = D.sy + (C.sy - D.sy) * t - hs.h * 0.65;
      const p1 = V(wx - winW, wy - winW * 0.5);
      const p2 = V(wx + winW, wy + winW * 0.5);
      const p3 = V(wx + winW, wy + winW * 0.5 - winH);
      const p4 = V(wx - winW, wy - winW * 0.5 - winH);
      gr.fillStyle(0x28190e, 1).fillPoints([p1, p2, p3, p4], true);
      const iW = winW - 2, iH = winH - 3;
      const ip1 = V(wx - iW, wy - iW * 0.5 - 1.5);
      const ip2 = V(wx + iW, wy + iW * 0.5 - 1.5);
      const ip3 = V(wx + iW, wy + iW * 0.5 - 1.5 - iH);
      const ip4 = V(wx - iW, wy - iW * 0.5 - 1.5 - iH);
      gr.fillStyle(0xffcb52, 0.98).fillPoints([ip1, ip2, ip3, ip4], true);
      gr.lineStyle(1.5, 0x422a18, 0.95);
      gr.lineBetween(wx, wy - 1.5 - iH, wx, wy - 1.5);
      gr.lineBetween(wx - iW, wy - iW * 0.5 - 1.5 - iH * 0.5, wx + iW, wy + iW * 0.5 - 1.5 - iH * 0.5);
    }

    // Janelas na parede direita (C -> B, inclinação dy/dx = -0.5)
    for (let i = 0; i < hs.w - 1; i++) {
      const t = (i + 0.65) / hs.w;
      const wx = C.sx + (B.sx - C.sx) * t;
      const wy = C.sy + (B.sy - C.sy) * t - hs.h * 0.65;
      const p1 = V(wx - winW, wy + winW * 0.5);
      const p2 = V(wx + winW, wy - winW * 0.5);
      const p3 = V(wx + winW, wy - winW * 0.5 - winH);
      const p4 = V(wx - winW, wy + winW * 0.5 - winH);
      gr.fillStyle(0x28190e, 1).fillPoints([p1, p2, p3, p4], true);
      const iW = winW - 2, iH = winH - 3;
      const ip1 = V(wx - iW, wy + iW * 0.5 - 1.5);
      const ip2 = V(wx + iW, wy - iW * 0.5 - 1.5);
      const ip3 = V(wx + iW, wy - iW * 0.5 - 1.5 - iH);
      const ip4 = V(wx - iW, wy + iW * 0.5 - 1.5 - iH);
      gr.fillStyle(0xffcb52, 0.95).fillPoints([ip1, ip2, ip3, ip4], true);
      gr.fillStyle(0x000000, 0.15).fillPoints([ip1, ip2, ip3, ip4], true);
      gr.lineStyle(1.5, 0x422a18, 0.95);
      gr.lineBetween(wx, wy - 1.5 - iH, wx, wy - 1.5);
      gr.lineBetween(wx - iW, wy + iW * 0.5 - 1.5 - iH * 0.5, wx + iW, wy - iW * 0.5 - 1.5 - iH * 0.5);
    }

    // Porta na parede direita
    const dt = 0.28;
    const doorX = C.sx + (B.sx - C.sx) * dt;
    const doorY = C.sy + (B.sy - C.sy) * dt;
    const dW = 7, dH = 26;
    const dp1 = V(doorX - dW, doorY + dW * 0.5);
    const dp2 = V(doorX + dW, doorY - dW * 0.5);
    const dp3 = V(doorX + dW, doorY - dW * 0.5 - dH);
    const dp4 = V(doorX - dW, doorY + dW * 0.5 - dH);
    gr.fillStyle(0x351e10, 1).fillPoints([dp1, dp2, dp3, dp4], true);
    gr.lineStyle(1.5, 0x22130a, 1).strokePoints([dp1, dp2, dp3, dp4], true);
    gr.fillStyle(0xe5b85a, 1).fillCircle(doorX + 2, doorY - dH * 0.45, 1.8);

    // 4. Telhado isométrico de 4 águas com beiral uniforme no grid
    const ov = 0.22;
    const Ar = toScreen(x0 - ov, y0 - ov);
    const Br = toScreen(x1 + ov, y0 - ov);
    const Cr = toScreen(x1 + ov, y1 + ov);
    const Dr = toScreen(x0 - ov, y1 + ov);

    const eavesH = hs.h - 2;
    const bTop = up(Br, eavesH);
    const cTop = up(Cr, eavesH);
    const dTop = up(Dr, eavesH);

    const center = toScreen((x0 + x1) / 2, (y0 + y1) / 2);
    const roofApexH = hs.h + 34 + Math.min(hs.w, hs.d) * 3;
    const apex = up(center, roofApexH);

    // Sombra sob o beiral
    gr.fillStyle(0x000000, 0.35).fillPoints([up(D, hs.h), up(C, hs.h), cTop, dTop], true);
    gr.fillStyle(0x000000, 0.45).fillPoints([up(C, hs.h), up(B, hs.h), bTop, cTop], true);

    // Telhado: faces visíveis
    gr.fillStyle(hs.roof, 1).fillTriangle(dTop.x, dTop.y, cTop.x, cTop.y, apex.x, apex.y);
    gr.fillStyle(hs.roof, 1).fillTriangle(cTop.x, cTop.y, bTop.x, bTop.y, apex.x, apex.y);
    gr.fillStyle(0x000000, 0.25).fillTriangle(cTop.x, cTop.y, bTop.x, bTop.y, apex.x, apex.y);

    // Arestas de madeira / acabamento do telhado
    gr.lineStyle(2.5, 0x24150d, 0.85);
    gr.lineBetween(dTop.x, dTop.y, cTop.x, cTop.y);
    gr.lineBetween(cTop.x, cTop.y, bTop.x, bTop.y);
    gr.lineBetween(cTop.x, cTop.y, apex.x, apex.y);
    gr.lineBetween(dTop.x, dTop.y, apex.x, apex.y);
    gr.lineBetween(bTop.x, bTop.y, apex.x, apex.y);

    // Chaminé de pedra
    const chX = center.sx - 8;
    const chY = apex.y + 12;
    gr.fillStyle(0x4a443c, 1).fillRect(chX, chY, 11, 24);
    gr.fillStyle(0x363028, 1).fillRect(chX + 5, chY, 6, 24);
    gr.fillStyle(0x605850, 1).fillRect(chX - 2, chY - 3, 15, 4);
  };
  HOUSES.forEach(house);

  // ---------------------------------------------------------------- ÁRVORES BATCHED (SPRITES)
  for (let x = 1; x < zone.w - 1; x += 3) {
    for (let y = 1; y < zone.h - 1; y += 3) {
      const gx = x + (hash(x, y) - 0.5) * 2.2, gy = y + (hash(y, x) - 0.5) * 2.2;
      const onRoad = Math.abs(gx - cx) < 3.8 || Math.abs(gy - cy) < 3.8;
      if (onRoad || Math.hypot(gx - cx, gy - cy) < 10 || inHouse(gx, gy, 1.6) || Math.hypot(gx - zone.vault!.x, gy - zone.vault!.y) < 3.5)
        continue;
      if (zone.portals.some((p) => Math.hypot(gx - p.x, gy - p.y) < 4.5)) continue;
      if (Math.hypot(gx - 24, gy - 30) < 5 || FIRES.some(([fx, fy]) => Math.hypot(gx - fx, gy - fy) < 3)) continue;
      if (hash(x * 3, y * 7) < 0.42) {
        const { sx, sy } = toScreen(gx, gy);
        const s = 0.85 + hash(x, y * 2) * 0.45;
        const key = hash(x, y) > 0.5 ? "town_tree_1" : "town_tree_2";
        scene.add.image(sx, sy, key).setOrigin(0.5, 130 / 144).setScale(s).setDepth(sy);
      }
    }
  }

  // ---------------------------------------------------------------- CANTEIROS DE FLORES (ESTÁTICO)
  const flowers = prop(8000).setDepth(-5);
  const FL = [0xf2a0b8, 0xf2d57a, 0xe8e0f5, 0xe58a5a];
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * Math.PI * 2 + 0.2, rr = 9.2;
    for (let k = 0; k < 9; k++) {
      const gx = cx + Math.cos(a) * rr + (hash(i, k) - 0.5) * 1.8;
      const gy = cy + Math.sin(a) * rr + (hash(k, i) - 0.5) * 1.8;
      if (Math.abs(gx - cx) < 3 || Math.abs(gy - cy) < 3) continue;
      const { sx, sy } = toScreen(gx, gy);
      flowers.fillStyle(0x36502c, 1).fillEllipse(sx, sy + 1, 9, 4);
      flowers.fillStyle(FL[(i + k) % 4], 1).fillCircle(sx, sy - 2, 2.2);
    }
  }

  // ---------------------------------------------------------------- BANCOS E BARRIS
  const bench = (gx: number, gy: number, flip: boolean) => {
    const { sx, sy } = toScreen(gx, gy);
    const gr = prop(sy);
    gr.fillStyle(0x000000, 0.28).fillEllipse(sx, sy + 2, 48, 14);
    gr.fillStyle(0x4a2e1a, 1).fillRect(sx - 20, sy - 8, 4, 10).fillRect(sx + 16, sy - 8, 4, 10);
    gr.fillStyle(0x8a5e36, 1).fillRect(sx - 22, sy - 12, 44, 6);
    gr.fillStyle(0x6e4a2a, 1).fillRect(sx - 22, sy - 22, 44, 5);
  };
  for (let i = 0; i < 4; i++) {
    const a = Math.PI / 4 + (i * Math.PI) / 2;
    bench(cx + Math.cos(a) * 5.4, cy + Math.sin(a) * 5.4, i % 2 === 0);
  }

  [[17.2, 22.2], [17.8, 22.8], [31.2, 22.4], [20.8, 26.4]].forEach(([x, y]) => {
    const { sx, sy } = toScreen(x, y);
    scene.add.image(sx, sy, "town_barrel").setOrigin(0.5, 24 / 32).setDepth(sy);
  });

  // ---------------------------------------------------------------- FONTE DA PRAÇA
  const fc = toScreen(cx, cy);
  const fount = prop(fc.sy);
  fount.fillStyle(0x000000, 0.28).fillEllipse(fc.sx, fc.sy + 8, 220, 90);
  fount.fillStyle(0x6f6657, 1).fillEllipse(fc.sx, fc.sy + 6, 200, 96);
  fount.fillStyle(0x9a8f7a, 1).fillEllipse(fc.sx, fc.sy - 4, 200, 96);
  fount.fillStyle(0x4aa0b8, 1).fillEllipse(fc.sx, fc.sy - 6, 176, 80);
  fount.fillStyle(0x6bc2d6, 0.55).fillEllipse(fc.sx - 14, fc.sy - 10, 110, 44);
  fount.fillStyle(0x8c8270, 1).fillRect(fc.sx - 10, fc.sy - 70, 20, 66).fillEllipse(fc.sx, fc.sy - 4, 34, 14);
  fount.fillStyle(0xa89d86, 1).fillEllipse(fc.sx, fc.sy - 56, 78, 28).fillStyle(0x4aa0b8, 1).fillEllipse(fc.sx, fc.sy - 58, 62, 20);
  fount.fillStyle(0xb9a98a, 1).fillCircle(fc.sx, fc.sy - 82, 9);
  const water = scene.add.graphics().setDepth(fc.sy + 1);

  // ---------------------------------------------------------------- LANTERNAS E FOGUEIRAS BATCHED
  const LAMPS: number[][] = [];
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2 + Math.PI / 8;
    LAMPS.push([cx + Math.cos(a) * 8.6, cy + Math.sin(a) * 8.6]);
  }
  for (const y of [11, 17, 36, 42]) LAMPS.push([21.2, y], [26.8, y]);
  for (const x of [10, 15, 33, 38]) LAMPS.push([x, 21.2], [x, 26.8]);

  LAMPS.forEach(([x, y]) => {
    if (!inHouse(x, y, 0.5)) {
      const { sx, sy } = toScreen(x, y);
      scene.add.image(sx, sy, "town_lamp").setOrigin(0.5, 82 / 90).setDepth(sy);
      glow(sx, sy - 66, 160, 0xffa646, 0.32, 0.08); // 1 único glow suave na lanterna
    }
  });

  const fires = FIRES.map(([fx, fy]) => {
    const { sx, sy } = toScreen(fx, fy);
    const base = prop(sy);
    base.fillStyle(0x000000, 0.28).fillEllipse(sx, sy + 2, 56, 20);
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * 6.28;
      base.fillStyle(0x6e6a64, 1).fillCircle(sx + Math.cos(a) * 17, sy + Math.sin(a) * 7, 4);
    }
    base.fillStyle(0x4a2e1a, 1).fillRect(sx - 14, sy - 4, 28, 5).fillRect(sx - 4, sy - 8, 8, 9);
    const flame = scene.add.graphics().setDepth(sy + 1);
    glow(sx, sy - 14, 220, 0xff8a2a, 0.38, 0.12);
    return { sx, sy, flame };
  });
  [[18.4, 31], [29.6, 33]].forEach(([x, y]) => bench(x, y, true));

  // ---------------------------------------------------------------- PORTAIS: PILARES COM TOCHAS
  zone.portals.forEach((p) => {
    const horiz = Math.abs(p.y - 24) < 1;
    const off = [[0, -2.1], [0, 2.1]].map(([a, b]) => (horiz ? [p.x + a, p.y + b] : [p.x + b, p.y + a]));
    off.forEach(([x, y]) => {
      const { sx, sy } = toScreen(x, y);
      const gr = prop(sy);
      gr.fillStyle(0x000000, 0.28).fillEllipse(sx, sy, 34, 12);
      gr.fillStyle(0x7d7466, 1).fillRect(sx - 9, sy - 70, 18, 70).fillStyle(0xa0968a, 1).fillRect(sx - 12, sy - 78, 24, 10).fillRect(sx - 12, sy - 4, 24, 4);
      gr.fillStyle(0xffd27a, 1).fillCircle(sx, sy - 86, 6);
      glow(sx, sy - 86, 150, 0xffb050, 0.38, 0.12);
    });
  });

  // ---------------------------------------------------------------- BAÚ DE ARMAZENAMENTO
  const v = zone.vault!;
  const vp = toScreen(v.x, v.y);
  const chest = prop(vp.sy);
  chest.fillStyle(0x000000, 0.28).fillEllipse(vp.sx, vp.sy + 4, 110, 40);
  const bw = 46, bd = 26, bh = 36, hx = vp.sx, hy = vp.sy;
  const top = [V(hx, hy - bd - bh), V(hx + bw, hy - bd / 2 - bh), V(hx, hy - bh), V(hx - bw, hy - bd / 2 - bh)];
  chest.fillStyle(0x6b4423, 1).fillPoints([V(hx - bw, hy - bd / 2 - bh), V(hx, hy - bh), V(hx, hy), V(hx - bw, hy - bd / 2)], true);
  chest.fillStyle(0x4f3219, 1).fillPoints([V(hx, hy - bh), V(hx + bw, hy - bd / 2 - bh), V(hx + bw, hy - bd / 2), V(hx, hy)], true);
  chest.fillStyle(0x8a5a2e, 1).fillPoints(top, true);
  chest.fillStyle(0x7d4f28, 1).fillPoints([V(hx - bw, hy - bd / 2 - bh), V(hx, hy - bh), V(hx, hy - bh - 18), V(hx - bw + 2, hy - bd / 2 - bh - 14)], true);
  chest.fillStyle(0x5e3a1d, 1).fillPoints([V(hx, hy - bh), V(hx + bw, hy - bd / 2 - bh), V(hx + bw - 2, hy - bd / 2 - bh - 14), V(hx, hy - bh - 18)], true);
  chest.fillStyle(0x9a6a36, 1).fillPoints([V(hx, hy - bd - bh - 16), V(hx + bw - 2, hy - bd / 2 - bh - 14), V(hx, hy - bh - 18), V(hx - bw + 2, hy - bd / 2 - bh - 14)], true);
  chest.fillStyle(0x30302f, 1).fillRect(hx - bw + 8, hy - bd / 2 - bh - 12, 6, bh + 12).fillRect(hx + bw - 14, hy - bd / 2 - bh - 12, 6, bh + 12);
  chest.fillRect(hx - 26, hy - bh + 4 - 12, 6, bh - 4).fillRect(hx + 18, hy - bh + 4 - 12, 6, bh - 4);
  chest.fillStyle(0xe0b565, 1).fillRoundedRect(hx - 8, hy - bh - 4, 16, 18, 3);
  chest.fillStyle(0x3a2810, 1).fillCircle(hx, hy - bh + 4, 2.4).fillRect(hx - 1, hy - bh + 4, 2, 6);
  chest.lineStyle(2, 0x2a1a0c, 0.7).strokePoints(top, true);
  const chestGlow = glow(vp.sx, vp.sy - 30, 220, 0xffc060, 0.2, 0.1);
  const sign = scene.add
    .text(vp.sx, vp.sy - bh - bd - 44, "BAÚ DE ARMAZENAMENTO", {
      fontFamily: "Cinzel, Georgia, serif",
      fontStyle: "bold",
      fontSize: "12px",
      color: "#f4e6b8",
      stroke: "#000",
      strokeThickness: 3,
      backgroundColor: "rgba(74,46,26,0.92)",
      padding: { x: 7, y: 4 },
    })
    .setOrigin(0.5)
    .setDepth(vp.sy + 3);
  const ring = scene.add.graphics().setDepth(0.7);

  // ---------------------------------------------------------------- VAGA-LUMES (LEVE)
  if (!scene.textures.exists("town_fly")) {
    const t = scene.textures.createCanvas("town_fly", 16, 16)!;
    const ctx = t.getContext();
    const gr = ctx.createRadialGradient(8, 8, 0, 8, 8, 8);
    gr.addColorStop(0, "rgba(255,244,190,1)");
    gr.addColorStop(0.4, "rgba(255,214,110,0.55)");
    gr.addColorStop(1, "rgba(255,200,90,0)");
    ctx.fillStyle = gr;
    ctx.fillRect(0, 0, 16, 16);
    t.refresh();
  }
  const flies = scene.add
    .particles(0, 0, "town_fly", {
      x: { min: -400, max: 400 },
      y: { min: -280, max: 280 },
      lifespan: { min: 3000, max: 6000 },
      frequency: 250,
      quantity: 1,
      speedX: { min: -10, max: 10 },
      speedY: { min: -10, max: 6 },
      scale: { start: 0.3, end: 0.08 },
      alpha: { values: [0, 0.8, 0.2, 0.7, 0] },
      blendMode: "ADD",
    })
    .setDepth(9500);

  return {
    chestPos: v,
    chestHit: (wx, wy) => Math.abs(wx - vp.sx) < 62 && wy > vp.sy - 110 && wy < vp.sy + 16,
    nearChest: (gx, gy) => Math.hypot(gx - v.x, gy - v.y) <= VAULT_REACH,
    update(time, cam, me) {
      for (const l of glows) l.img.setAlpha(l.base + Math.sin(time / 420 + l.ph) * l.base * l.amp * 2.2);
      flies.setPosition(cam.worldView.centerX, cam.worldView.centerY);

      // Fonte: ondas e gotas
      water.clear();
      for (let i = 0; i < 2; i++) {
        const t = (time / 1800 + i / 2) % 1;
        water.lineStyle(2, 0xdff6ff, 0.5 * (1 - t)).strokeEllipse(fc.sx, fc.sy - 6, 40 + 120 * t, 18 + 52 * t);
      }
      for (let i = 0; i < 6; i++) {
        const t = (time / 900 + i / 6) % 1,
          a = (i / 6) * 6.28;
        water
          .fillStyle(0xcff1ff, 0.75 * (1 - t * 0.6))
          .fillCircle(fc.sx + Math.cos(a) * 24 * t, fc.sy - 84 + 104 * t * t - 38 * Math.sin(t * 3.14), 2.2);
      }

      // Fogueiras
      for (const f of fires) {
        f.flame.clear();
        for (let i = 0; i < 3; i++) {
          const w = 8 - i * 2,
            hgt = 22 + Math.sin(time / (110 + i * 37) + i) * 5 - i * 3;
          f.flame
            .fillStyle([0xff5a1c, 0xff8a2a, 0xfff0a0][i], 0.92)
            .fillTriangle(f.sx - w, f.sy - 4, f.sx + w, f.sy - 4, f.sx + Math.sin(time / 170 + i) * 2.5, f.sy - 4 - hgt);
        }
      }

      // Baú: anel quando ao alcance
      ring.clear();
      chestGlow.setScale((220 + Math.sin(time / 500) * 14) / 128);
      if (me && Math.hypot(me.x - v.x, me.y - v.y) <= VAULT_REACH) {
        ring.lineStyle(3, 0xf0cf86, 0.55 + 0.25 * Math.sin(time / 260)).strokeEllipse(vp.sx, vp.sy + 6, 120, 52);
      }
      sign.setAlpha(1);
    },
  };
}
