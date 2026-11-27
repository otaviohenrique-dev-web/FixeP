import Phaser from "phaser";
import { drawVeil } from "./gate";
import { VAULT_REACH, zoneNpcs, type ZoneDef } from "@frixep/shared";
import {
  houseTex, treeTex, lampTex, barrelTex, crateTex, benchTex, bannerTex, braziertTex, fxTextures, fountainTex, chestTex, canvasTex, isoBox, poly, line, rngOf, shade,
  type HouseSpec, type Pt, type Tex, type Ctx,
} from "./townart";

/**
 * Brasalume, a cidade-hub segura. Tudo é gerado por código UMA vez e fica em cache de textura (sobrevive às travessias):
 *   - o CHÃO inteiro (grama, ruas, praça, caminhos até as portas, muralha, portão, fence, poças de luz dos lampiões) é UMA textura/Image;
 *   - casas, árvores, lampiões, fonte, baú... são Images de texturas pequenas (1 textura por tipo), ordenadas por profundidade;
 *   - animado: só 4 braseiros (chama+brilho), 2 ondas da fonte, o pulso do portão, o brilho do baú e um emissor de vaga-lumes
 *     (tudo por seno, sem criar objetos nem Graphics por quadro). Nada depende do número de jogadores.
 * Nada daqui interfere na simulação: o servidor decide tudo.
 */
type ToScreen = (x: number, y: number) => { sx: number; sy: number };
const hash = (x: number, y: number) => {
  const h = Math.sin(x * 127.1 + y * 311.7) * 43758.5453;
  return h - Math.floor(h);
};

const CX = 24, CY = 24;
const PLAZA_R = 7.6;
const GATE = { x: 24, y: 0 }; // o ÚNICO portão da cidade (muralha norte); casa com `zones.ts`

// ---------------------------------------------------------------- casas
// (x, y) = tile do canto de trás (menor x e y); w x d tiles. Portas: R olha para o leste (rua principal), L para o sul. `lane` = fileira da viela que a porta alcança.
interface H extends HouseSpec { x: number; y: number; lane?: number }
const mk = (id: string, kind: HouseSpec["kind"], x: number, y: number, w: number, d: number, floors: 1 | 2, wall: string, roof: string, door: "L" | "R", seed: number, lane?: number): H => ({
  id, kind, x, y, w, d, floors, wall, roof, door, seed, lane, trim: kind === "smith" ? "#3a2a1c" : "#4a2e1a", stone: kind === "smith" ? "#8b867c" : "#7d7365",
});
const HOUSES: H[] = [
  // noroeste (porta para a rua principal, a leste)
  mk("hall", "hall", 14, 9, 4, 3, 2, "#e2d2b0", "#5e4a78", "R", 1),
  mk("shop", "shop", 14, 17, 3, 3, 1, "#dbc7a3", "#8a4b36", "R", 2),
  mk("nw1", "cottage", 7, 4, 3, 3, 1, "#cfb58f", "#6a7d4a", "R", 3),
  mk("nw2", "cottage", 7, 12, 3, 3, 2, "#d8c4a0", "#7d4a6a", "R", 4),
  // nordeste (porta para o sul, na rua leste-oeste)
  mk("inn", "inn", 28, 16, 4, 3, 2, "#dccaa2", "#7a3a2c", "L", 5),
  mk("smith", "smith", 33, 16, 3, 3, 1, "#8b867c", "#3f4650", "L", 6),
  mk("ne1", "cottage", 38, 16, 3, 3, 1, "#cdb68e", "#5e6b8a", "L", 7),
  mk("ne2", "cottage", 31, 8, 3, 3, 2, "#d6c19c", "#4f7a6a", "L", 8),
  mk("ne3", "cottage", 36, 8, 3, 3, 1, "#c9ad84", "#8a4b36", "L", 9),
  // sudoeste
  mk("sw1", "cottage", 7, 29, 3, 3, 1, "#d0b890", "#8a5a36", "R", 10),
  mk("sw2", "cottage", 14, 32, 4, 3, 2, "#c4aa82", "#5e6b8a", "R", 11),
  mk("sw3", "cottage", 7, 36, 3, 3, 1, "#d6c19c", "#6a7d4a", "R", 12),
  // sudeste (portas para as vielas das fileiras 33 e 40)
  mk("se1", "cottage", 34, 28, 3, 3, 1, "#d4bd98", "#7d4a6a", "L", 13, 33),
  mk("se2", "cottage", 39, 28, 3, 3, 2, "#cdb48c", "#6f5a8a", "L", 14, 33),
  mk("se3", "cottage", 34, 35, 3, 3, 2, "#d0b890", "#4f7a6a", "L", 15, 40),
  mk("se4", "cottage", 39, 35, 3, 3, 1, "#c8ae86", "#8a4b36", "L", 16, 40),
];
const LANES = [33, 40]; // vielas leste-oeste (x de 27 a 44)

export interface TownLayer {
  update(time: number, cam: Phaser.Cameras.Scene2D.Camera, me: { x: number; y: number } | null): void;
  chestHit(wx: number, wy: number): boolean;
  nearChest(gx: number, gy: number): boolean;
  chestPos: { x: number; y: number };
}

export function drawTown(scene: Phaser.Scene, zone: ZoneDef, toScreen: ToScreen, TILE_W: number, TILE_H: number): TownLayer {
  const t0 = performance.now();
  scene.cameras.main.setBackgroundColor("#14101a");
  fxTextures(scene);
  const W = zone.w, Hh = zone.h;
  const S = (x: number, y: number): Pt => { const p = toScreen(x, y); return [p.sx, p.sy]; };

  // ---------------------------------------------------------------- mapa lógico (o que é rua, caminho, casa...)
  const inMain = (x: number, y: number) => (Math.abs(x - CX) <= 2 || Math.abs(y - CY) <= 2) && x >= 1 && y >= 0 && x <= W - 2 && y <= Hh - 2;
  const road = new Uint8Array(W * Hh); // 1 = rua/praça/caminho pavimentado
  const idx = (x: number, y: number) => y * W + x;
  const setRoad = (x: number, y: number) => { if (x >= 0 && y >= 0 && x < W && y < Hh) road[idx(x, y)] = 1; };
  for (let x = 0; x < W; x++) for (let y = 0; y < Hh; y++) if (inMain(x, y) || Math.hypot(x - CX, y - CY) <= PLAZA_R) setRoad(x, y);
  for (const ly of LANES) for (let x = 27; x <= 44; x++) setRoad(x, ly);
  const kdOf = (n: number) => Math.floor((n - 1) / 2);
  for (const h of HOUSES) { // caminho da porta até a rua
    if (h.door === "R") {
      const row = h.y + h.d - 1 - kdOf(h.d);
      for (let x = h.x + h.w; x <= 21; x++) setRoad(x, row);
    } else {
      const col = h.x + kdOf(h.w);
      const end = h.lane ?? 21;
      for (let y = h.y + h.d; y <= end; y++) setRoad(col, y);
    }
  }
  const occ = new Uint8Array(W * Hh); // 1 = ocupado por casa
  for (const h of HOUSES) for (let x = h.x; x < h.x + h.w; x++) for (let y = h.y; y < h.y + h.d; y++) occ[idx(x, y)] = 1;
  const nearHouse = (gx: number, gy: number, m: number) => HOUSES.some((h) => gx > h.x - 0.5 - m && gx < h.x + h.w - 0.5 + m && gy > h.y - 0.5 - m && gy < h.y + h.d - 0.5 + m);
  const nearRoad = (gx: number, gy: number, m: number) => {
    for (let x = Math.floor(gx - m); x <= Math.ceil(gx + m); x++) for (let y = Math.floor(gy - m); y <= Math.ceil(gy + m); y++) if (x >= 0 && y >= 0 && x < W && y < Hh && road[idx(x, y)] && Math.hypot(x - gx, y - gy) <= m + 0.6) return true;
    return false;
  };

  // ---------------------------------------------------------------- posições dos adereços
  const LAMPS: [number, number][] = [];
  for (let i = 0; i < 6; i++) { const a = (i / 6) * Math.PI * 2 + Math.PI / 6; LAMPS.push([CX + Math.cos(a) * 8.4, CY + Math.sin(a) * 8.4]); }
  for (const y of [7, 12, 17, 31, 37, 43]) LAMPS.push([21.2, y], [26.8, y]);
  for (const x of [9, 13, 18, 31, 36, 41]) LAMPS.push([x, 21.2], [x, 26.8]);
  LAMPS.push([21.4, 3.2], [26.6, 3.2]);
  const lamps = LAMPS.filter(([x, y]) => !nearHouse(x, y, 0.2) && !(Math.abs(x - CX) < 2.2 && Math.abs(y - CY) < 2.2));
  const BRAZIERS: [number, number][] = [[21.2, 0.6], [26.8, 0.6], [20.6, 31.5], [27.4, 34]];
  const BARRELS: [number, number][] = [[17.4, 22.2], [18.1, 22.9], [30.6, 22.1], [20.8, 26.6], [27.6, 16.4], [32.4, 14.4], [18.4, 16.8]];
  const CRATES: [number, number][] = [[30.7, 22.8], [17.6, 26.8], [28.4, 17.0]];
  const BENCHES: { x: number; y: number; a: "x" | "y" }[] = [
    { x: 20.2, y: 20.2, a: "x" }, { x: 27.8, y: 20.2, a: "x" }, { x: 20.2, y: 28.2, a: "x" }, { x: 12, y: 21.4, a: "x" }, { x: 36, y: 26.6, a: "x" },
  ];
  const BANNERS: [number, number, 0 | 1][] = [[21.5, 9, 0], [26.5, 9, 1], [21.5, 35, 1], [26.5, 35, 0], [21.5, 14, 1], [26.5, 14, 0]];
  const vault = zone.vault!;
  const npcs = zoneNpcs(zone.id);
  const keepClear = (gx: number, gy: number) =>
    nearHouse(gx, gy, 1.6) || nearRoad(gx, gy, 1.1) || Math.hypot(gx - CX, gy - CY) < 10 || Math.hypot(gx - vault.x, gy - vault.y) < 3.2 ||
    Math.hypot(gx - 24, gy - 30) < 3.4 || gx < 2 || gy < 2.2 || gx > W - 3 || gy > Hh - 3 || BRAZIERS.some(([bx, by]) => Math.hypot(gx - bx, gy - by) < 2.4) ||
    Math.hypot(gx - GATE.x, gy - GATE.y) < 6.5 || npcs.some((n) => Math.hypot(gx - n.x, gy - n.y) < 2.4) || lamps.some(([lx, ly]) => Math.hypot(gx - lx, gy - ly) < 1.3);

  // ---------------------------------------------------------------- CHÃO (UMA textura em cache)
  const ox = (Hh + 4) * (TILE_W / 2), oy = 230;
  const gw = Math.ceil((W + Hh + 8) * (TILE_W / 2)), gh = Math.ceil(oy + (W + Hh + 3) * (TILE_H / 2) + 60);
  const groundKey = "town_ground_v2";
  if (!scene.textures.exists(groundKey)) {
    canvasTex(scene, groundKey, gw, gh, (c) => {
      c.translate(ox, oy);
      bakeGround(c, W, Hh, TILE_W, TILE_H, S, road, lamps, BRAZIERS);
    });
  }
  scene.add.image(-ox, -oy, groundKey).setOrigin(0, 0).setDepth(-10);

  // ---------------------------------------------------------------- casas
  const placed: Phaser.GameObjects.Image[] = [];
  const put = (tex: Tex, gx: number, gy: number, depth?: number, scale = 1) => {
    const [sx, sy] = S(gx, gy);
    const im = scene.add.image(sx, sy, tex.key).setOrigin(tex.ax / tex.w, tex.ay / tex.h).setScale(scale).setDepth(depth ?? sy);
    placed.push(im);
    return im;
  };
  for (const h of HOUSES) put(houseTex(scene, h), h.x + h.w - 0.5, h.y + h.d - 0.5, S(h.x + h.w - 0.5, h.y + h.d - 0.5)[1] + 0.5);

  // ---------------------------------------------------------------- árvores (poucas, variadas, só fora de ruas e casas)
  const trees = [treeTex(scene, 0), treeTex(scene, 1), treeTex(scene, 2)];
  let treeCount = 0;
  for (let gx = 2; gx < W - 2; gx += 2) {
    for (let gy = 2; gy < Hh - 2; gy += 2) {
      const x = gx + (hash(gx, gy) - 0.5) * 1.6, y = gy + (hash(gy, gx) - 0.5) * 1.6;
      if (hash(gx * 3, gy * 7) > 0.34 || keepClear(x, y)) continue;
      const k = hash(gx, gy * 2);
      const t = trees[k < 0.45 ? 0 : k < 0.75 ? 1 : 2];
      put(t, x, y, undefined, 0.85 + hash(gx * 5, gy) * 0.35);
      treeCount++;
    }
  }

  // ---------------------------------------------------------------- lampiões e adereços
  const lampT = lampTex(scene), barrelT = barrelTex(scene), crateT = crateTex(scene);
  lamps.forEach(([x, y]) => put(lampT, x, y));
  BARRELS.forEach(([x, y]) => put(barrelT, x, y));
  CRATES.forEach(([x, y]) => put(crateT, x, y));
  BENCHES.forEach((b) => put(benchTex(scene, b.a), b.x, b.y));
  BANNERS.forEach(([x, y, v]) => put(bannerTex(scene, v), x, y));
  const brazT = braziertTex(scene);
  const fires = BRAZIERS.map(([x, y]) => {
    const im = put(brazT, x, y);
    const [sx, sy] = S(x, y);
    const flame = scene.add.image(sx, sy - 32, "town_flame").setBlendMode(Phaser.BlendModes.ADD).setDepth(sy + 1).setOrigin(0.5, 0.85);
    const glow = scene.add.image(sx, sy - 34, "town_glow").setBlendMode(Phaser.BlendModes.ADD).setTint(0xff8a2a).setDepth(9000).setScale(1.5);
    void im;
    return { flame, glow, ph: x * 1.7 + y };
  });

  // ---------------------------------------------------------------- fonte
  const fT = fountainTex(scene);
  const [fx, fy] = S(CX, CY);
  scene.add.image(fx, fy, fT.key).setOrigin(fT.ax / fT.w, fT.ay / fT.h).setDepth(fy + 18);
  const ripples = [0, 1].map(() => scene.add.image(fx, fy - 17, "town_ring").setBlendMode(Phaser.BlendModes.ADD).setDepth(fy + 19).setTint(0xcff1ff));
  const fGlow = scene.add.image(fx, fy - 100, "town_glow").setBlendMode(Phaser.BlendModes.ADD).setTint(0x8fd8f0).setAlpha(0.18).setScale(1.6).setDepth(fy + 20);

  // ---------------------------------------------------------------- portão (arte no chão; aqui só o pulso e o rótulo)
  const [gx, gy] = S(GATE.x, GATE.y);
  void gx; void gy;
  const veilG = scene.add.graphics().setDepth(0.6); // véu de energia dourado dentro do arco da muralha
  const veilAt = S(24, -0.5);
  const [gax, gay] = S(24, -0.5);
  scene.add
    .text(gax, gay - 132, "➜ Portão de Brasalume", { fontFamily: "Cinzel, Georgia, serif", fontStyle: "bold", fontSize: "14px", color: "#f4ecd2", stroke: "#000", strokeThickness: 4 })
    .setOrigin(0.5)
    .setDepth(1e5);

  // ---------------------------------------------------------------- baú de armazenamento
  const cT = chestTex(scene);
  const vp = S(vault.x, vault.y);
  put(cT, vault.x, vault.y, vp[1] + 6);
  const chestGlow = scene.add.image(vp[0], vp[1] - 16, "town_glow").setBlendMode(Phaser.BlendModes.ADD).setTint(0xffc060).setAlpha(0.16).setScale(1.5).setDepth(vp[1] + 7);
  const ring = scene.add.image(vp[0], vp[1], "town_ring").setBlendMode(Phaser.BlendModes.ADD).setTint(0xf0cf86).setDepth(0.7).setScale(0.6, 0.6).setVisible(false);
  scene.add
    .text(vp[0], vp[1] - 72, "BAÚ DE ARMAZENAMENTO", {
      fontFamily: "Cinzel, Georgia, serif", fontStyle: "bold", fontSize: "12px", color: "#f4e6b8", stroke: "#000", strokeThickness: 3,
      backgroundColor: "rgba(74,46,26,0.92)", padding: { x: 7, y: 4 },
    })
    .setOrigin(0.5)
    .setDepth(vp[1] + 8);

  // ---------------------------------------------------------------- vaga-lumes (um emissor, poucas partículas)
  const flies = scene.add
    .particles(0, 0, "town_fly", {
      x: { min: -380, max: 380 }, y: { min: -260, max: 260 }, lifespan: { min: 3500, max: 6500 }, frequency: 420, quantity: 1, maxAliveParticles: 14,
      speedX: { min: -10, max: 10 }, speedY: { min: -10, max: 6 }, scale: { start: 0.3, end: 0.08 }, alpha: { values: [0, 0.8, 0.2, 0.7, 0] }, blendMode: "ADD",
    })
    .setDepth(9500);

  const genMs = performance.now() - t0;
  if (import.meta.env.DEV) {
    const info = { genMs: +genMs.toFixed(1), houses: HOUSES.length, trees: treeCount, lamps: lamps.length, images: placed.length, groundPx: `${gw}x${gh}` };
    (window as unknown as { __frixepTown?: unknown }).__frixepTown = info;
    console.log("[cidade] gerada em", info);
  }

  return {
    chestPos: vault,
    chestHit: (wx, wy) => Math.abs(wx - vp[0]) < 40 && wy > vp[1] - 64 && wy < vp[1] + 26,
    nearChest: (px, py) => Math.hypot(px - vault.x, py - vault.y) <= VAULT_REACH,
    update(time, cam, me) {
      for (const f of fires) {
        const k = 0.5 + 0.5 * Math.sin(time / 90 + f.ph) * Math.sin(time / 143 + f.ph * 2);
        f.flame.setScale(0.9 + 0.25 * k, 0.9 + 0.35 * k).setAlpha(0.85 + 0.15 * k);
        f.glow.setAlpha(0.28 + 0.12 * k);
      }
      for (let i = 0; i < 2; i++) { // ondas da fonte
        const t = (time / 2200 + i / 2) % 1;
        ripples[i].setScale(0.12 + 0.62 * t, 0.12 + 0.62 * t).setAlpha(0.55 * (1 - t));
      }
      fGlow.setAlpha(0.15 + 0.05 * Math.sin(time / 600));
      const p = 0.5 + 0.5 * Math.sin(time / 520);
      veilG.clear();
      drawVeil(veilG, veilAt[0], veilAt[1], [32, 16], 2, 58, 12, time, 0xffc873);
      void p;
      flies.setPosition(cam.worldView.centerX, cam.worldView.centerY);
      const near = !!me && Math.hypot(me.x - vault.x, me.y - vault.y) <= VAULT_REACH;
      chestGlow.setAlpha(0.13 + 0.05 * Math.sin(time / 500));
      if (near) ring.setVisible(true).setScale(0.5, 0.5).setAlpha(0.45 + 0.25 * Math.sin(time / 260));
      else if (ring.visible) ring.setVisible(false);
    },
  };
}

// =====================================================================================================================
// CHÃO: tudo num canvas só
// =====================================================================================================================
function bakeGround(c: Ctx, W: number, Hh: number, TW: number, TH: number, S: (x: number, y: number) => Pt, road: Uint8Array, lamps: [number, number][], braziers: [number, number][]) {
  const rnd = rngOf(4242);
  const dia = (sx: number, sy: number, k = 1): Pt[] => [[sx, sy - (TH / 2) * k], [sx + (TW / 2) * k, sy], [sx, sy + (TH / 2) * k], [sx - (TW / 2) * k, sy]];
  const stone = (sx: number, sy: number, k: number, col: string, hi: boolean) => {
    poly(c, dia(sx, sy, k), col);
    if (hi) { line(c, [sx - (TW / 2) * k, sy], [sx, sy - (TH / 2) * k], "rgba(255,255,255,0.12)", 1); line(c, [sx, sy + (TH / 2) * k], [sx + (TW / 2) * k, sy], "rgba(0,0,0,0.16)", 1); }
  };
  const FLOWERS = ["#f2a0b8", "#f2d57a", "#e8e0f5", "#e58a5a"];

  for (let x = 0; x < W; x++) {
    for (let y = 0; y < Hh; y++) {
      const [sx, sy] = S(x, y);
      const h = hash(x, y), d = Math.hypot(x - CX, y - CY);
      if (road[y * W + x]) {
        if (d <= PLAZA_R) { // praça: lajes grandes, anéis alternados e uma faixa escura de contorno
          const ring = d > 6.3 ? 0 : d > 2.9 ? 1 : 2;
          const base = ring === 0 ? ((x + y) % 2 ? "#847a68" : "#8d826e") : ring === 1 ? ((x + y) % 2 ? "#a2977f" : "#ab9f86") : ((x + y) % 2 ? "#6e6554" : "#766c5a");
          poly(c, dia(sx, sy), "#5f5646");
          for (const [a, b] of [[-0.5, -0.5], [0.5, -0.5], [-0.5, 0.5], [0.5, 0.5]] as const) {
            const px = sx + (a - b) * (TW / 4) * 1.0, py = sy + (a + b) * (TH / 4) * 1.0;
            stone(px, py, 0.46, shade(base, 0.93 + hash(x * 3 + a * 2, y * 5 + b * 2) * 0.16), true);
          }
          if (d > 6.0 && d < 6.9) poly(c, dia(sx, sy), "rgba(40,30,20,0.18)");
        } else { // rua: paralelepípedos pequenos
          const base = (x + y) % 2 ? "#8a7f6b" : "#92876f";
          poly(c, dia(sx, sy), "#5f5646");
          for (let i = -1; i <= 1; i++) for (let j = -1; j <= 1; j++) {
            const px = sx + (i - j) * (TW / 6) * 0.98, py = sy + (i + j) * (TH / 6) * 0.98;
            stone(px, py, 0.3, shade(base, 0.86 + hash(x * 7 + i, y * 11 + j) * 0.26), false);
          }
        }
      } else {
        const base = (x + y) % 2 ? "#3f5a34" : "#456338";
        poly(c, dia(sx, sy), shade(base, 0.94 + h * 0.14));
        if (h < 0.55) for (let k = 0; k < 3; k++) {
          const px = sx + (rnd() - 0.5) * TW * 0.6, py = sy + (rnd() - 0.5) * TH * 0.6;
          line(c, [px, py], [px + (rnd() - 0.5) * 3, py - 3 - rnd() * 3], rnd() < 0.5 ? "#5e8a48" : "#2f4a28", 1);
        }
        if (h > 0.93) { const px = sx + (rnd() - 0.5) * 30, py = sy + (rnd() - 0.5) * 10; c.fillStyle = "#36502c"; c.beginPath(); c.ellipse(px, py + 1, 4, 2, 0, 0, 7); c.fill(); c.fillStyle = FLOWERS[Math.floor(rnd() * 4)]; c.beginPath(); c.arc(px, py - 1.5, 2, 0, 7); c.fill(); }
        if (h < 0.05) { c.fillStyle = "rgba(20,40,20,0.35)"; c.beginPath(); c.ellipse(sx + (h - 0.025) * 300, sy, 12 + h * 80, 5 + h * 20, 0, 0, 7); c.fill(); }
      }
    }
  }

  // linhas de contorno suaves entre ruas e grama (meio-tom) ficam por conta das cores; agora sombras de contato dos lampiões e luz no chão
  c.save();
  c.globalCompositeOperation = "lighter";
  const pool = (gx: number, gy: number, r: number, a: number, rgb: string) => {
    const [sx, sy] = S(gx, gy);
    c.save(); c.translate(sx, sy); c.scale(1, 0.5);
    const g = c.createRadialGradient(0, 0, 0, 0, 0, r); g.addColorStop(0, `rgba(${rgb},${a})`); g.addColorStop(1, `rgba(${rgb},0)`);
    c.fillStyle = g; c.beginPath(); c.arc(0, 0, r, 0, 7); c.fill(); c.restore();
  };
  for (const [x, y] of lamps) pool(x, y, 110, 0.2, "255,170,70");
  for (const [x, y] of braziers) pool(x, y, 130, 0.26, "255,130,40");
  c.restore();

  // ---------------------------------------------------------------- muralha norte e oeste (altas), portão e torre de canto
  const WH = 62;
  const wallStone = "#8c877c";
  const courses = (a: Pt, b: Pt, h: number, dark: boolean) => { // juntas de pedra numa face vertical entre a e b
    const rows = Math.round(h / 8);
    for (let r = 1; r < rows; r++) line(c, [a[0], a[1] - (h * r) / rows], [b[0], b[1] - (h * r) / rows], dark ? "rgba(0,0,0,0.30)" : "rgba(0,0,0,0.22)", 1);
    const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
    for (let r = 0; r < rows; r++) for (let t = (r % 2) * 14; t < len; t += 28) {
      const u = t / len; const px = a[0] + (b[0] - a[0]) * u, py = a[1] + (b[1] - a[1]) * u;
      line(c, [px, py - (h * r) / rows], [px, py - (h * (r + 1)) / rows], "rgba(0,0,0,0.18)", 1);
    }
  };
  const faceL = wallStone, faceR = shade(wallStone, 0.74), topC = shade(wallStone, 1.18);
  const northWall = (xa: number, xb: number) => {
    const a = S(xa, -0.5), b = S(xb, -0.5), a2 = S(xa, -1.7), b2 = S(xb, -1.7);
    poly(c, [a, b, [b[0], b[1] - WH], [a[0], a[1] - WH]], faceL);
    courses(a, b, WH, false);
    poly(c, [[a[0], a[1] - WH], [b[0], b[1] - WH], [b2[0], b2[1] - WH], [a2[0], a2[1] - WH]], topC, "rgba(0,0,0,0.3)", 1);
    for (let x = Math.ceil(xa + 0.25); x < xb - 0.25; x += 1) isoBox(c, [S(x + 0.25, -0.5)[0], S(x + 0.25, -0.5)[1] - WH], 0.5, 0.7, 10, { top: shade(wallStone, 1.25), left: shade(wallStone, 1.05), right: shade(wallStone, 0.74), edge: "rgba(0,0,0,0.35)" });
  };
  const westWall = (ya: number, yb: number) => {
    const a = S(-0.5, ya), b = S(-0.5, yb), a2 = S(-1.7, ya), b2 = S(-1.7, yb);
    poly(c, [a, b, [b[0], b[1] - WH], [a[0], a[1] - WH]], faceR);
    courses(a, b, WH, true);
    poly(c, [[a[0], a[1] - WH], [b[0], b[1] - WH], [b2[0], b2[1] - WH], [a2[0], a2[1] - WH]], topC, "rgba(0,0,0,0.3)", 1);
    for (let y = Math.ceil(ya + 0.25); y < yb - 0.25; y += 1) isoBox(c, [S(-0.5, y + 0.25)[0], S(-0.5, y + 0.25)[1] - WH], 0.7, 0.5, 10, { top: shade(wallStone, 1.25), left: shade(wallStone, 1.05), right: shade(wallStone, 0.74), edge: "rgba(0,0,0,0.35)" });
  };
  // a muralha oeste termina no canto sudoeste e a norte no nordeste; a leste e a sul são baixas (abaixo)
  westWall(-0.5, Hh - 0.5);
  northWall(-0.5, 19.7);
  northWall(28.3, W - 0.5);
  // chão sob o arco do portão (continua a rua para fora)
  for (let x = 22; x <= 25; x++) for (let y = -2; y <= -1; y++) { const [sx, sy] = S(x, y); poly(c, dia(sx, sy), "#4a4238"); }
  // torres do portão e arco
  const TH_ = 98;
  const towerCols = { top: shade(wallStone, 1.2), left: shade(wallStone, 1.08), right: shade(wallStone, 0.72), edge: "rgba(0,0,0,0.4)" };
  const tower = (xr: number, w: number) => {
    const C0 = S(xr, -0.5);
    const t = isoBox(c, C0, w, 2.2, TH_, towerCols);
    void t;
    // juntas
    const D0: Pt = [C0[0] - 32 * w, C0[1] - 16 * w];
    courses(D0, C0, TH_, false);
    courses(C0, [C0[0] + 32 * 2.2, C0[1] - 16 * 2.2], TH_, true);
    // ameias
    for (let i = 0; i < Math.floor(w * 2); i += 2) { const bx = xr - w + 0.15 + i * 0.5; isoBox(c, [S(bx + 0.4, -0.5)[0], S(bx + 0.4, -0.5)[1] - TH_], 0.4, 0.5, 9, { top: shade(wallStone, 1.3), left: shade(wallStone, 1.1), right: shade(wallStone, 0.72), edge: "rgba(0,0,0,0.35)" }); }
    // seteira iluminada
    const sw = S(xr - w / 2, -0.5); c.fillStyle = "#1a1410"; c.fillRect(sw[0] - 2.5, sw[1] - 62, 5, 16); c.fillStyle = "#ffcf70"; c.fillRect(sw[0] - 1.2, sw[1] - 60, 2.4, 12);
  };
  tower(22, 2.3);
  tower(28.3, 2.3);
  { // lintel e arco
    const C0 = S(26, -0.5);
    isoBox(c, C0, 4, 2.2, TH_ - 6, { top: shade(wallStone, 1.2), left: shade(wallStone, 1.0), right: shade(wallStone, 0.72), edge: "rgba(0,0,0,0.4)" }, 56);
    const q = (xx: number, v: number): Pt => { const p = S(xx, -0.5); return [p[0], p[1] - v]; };
    const arcTop = (xx: number) => 58 + 12 * Math.sin((Math.PI * (xx - 22)) / 4);
    const pts: Pt[] = [q(22, 0)];
    for (let i = 0; i <= 16; i++) { const xx = 22 + (i / 16) * 4; pts.push(q(xx, arcTop(xx))); }
    pts.push(q(26, 0));
    const g = c.createLinearGradient(0, q(24, 0)[1] - 70, 0, q(24, 0)[1]); g.addColorStop(0, "#0b0912"); g.addColorStop(0.7, "#1c1630"); g.addColorStop(1, "#3a2a50");
    poly(c, pts, g, "#2a2622", 3);
    const dy = c.createRadialGradient(q(24, 0)[0], q(24, 0)[1] - 18, 2, q(24, 0)[0], q(24, 0)[1] - 18, 48); dy.addColorStop(0, "rgba(255,210,140,0.35)"); dy.addColorStop(1, "rgba(255,210,140,0)");
    poly(c, pts, dy);
    for (let i = 0; i <= 12; i++) { const xx = 22 + (i / 12) * 4; line(c, q(xx, arcTop(xx)), q(xx, arcTop(xx) + 7), "rgba(0,0,0,0.5)", 1.5); } // aduelas
    const key = q(24, arcTop(24) + 6); poly(c, [[key[0] - 5, key[1]], [key[0] + 5, key[1]], [key[0] + 3, key[1] - 11], [key[0] - 3, key[1] - 11]], shade(wallStone, 1.3), "rgba(0,0,0,0.5)", 1);
    // brasões
    const b0 = q(22.6, 70); void b0;
  }
  // torre de canto (noroeste)
  isoBox(c, S(-0.5, -0.5), 2.2, 2.2, 82, { top: shade(wallStone, 1.2), left: shade(wallStone, 1.08), right: shade(wallStone, 0.72), edge: "rgba(0,0,0,0.4)" });
  for (const [mx, my] of [[-2.2, -2.2], [-1.2, -2.2], [-2.2, -1.2], [-0.8, -1.4]] as const) isoBox(c, [S(mx + 0.5, my + 0.5)[0], S(mx + 0.5, my + 0.5)[1] - 82], 0.5, 0.5, 9, { top: shade(wallStone, 1.3), left: shade(wallStone, 1.1), right: shade(wallStone, 0.72), edge: "rgba(0,0,0,0.35)" });
  { const C0 = S(-0.5, -0.5); courses([C0[0] - 32 * 2.2, C0[1] - 16 * 2.2], C0, 82, false); courses(C0, [C0[0] + 32 * 2.2, C0[1] - 16 * 2.2], 82, true); }

  // ---------------------------------------------------------------- cerca baixa ao sul e a leste (rente ao chão, por cima do mapa)
  const LH = 22;
  const lowCols = { top: shade(wallStone, 1.2), left: shade(wallStone, 1.05), right: shade(wallStone, 0.74), edge: "rgba(0,0,0,0.35)" };
  for (let x = -0.5; x < W - 0.5; x += 1) isoBox(c, S(x + 1, Hh - 0.5 + 0.9), 1, 0.9, LH, lowCols); // sul
  for (let y = 0.5; y <= Hh - 0.5 + 1e-6; y += 1) isoBox(c, S(W - 0.5 + 0.9, y), 0.9, 1, LH, lowCols); // leste
  for (let i = 0; i <= 12; i++) { // pilares mais altos
    const x = -0.5 + i * 4; isoBox(c, S(Math.min(x + 0.5, W - 0.5 + 0.2), Hh - 0.5 + 1.0), 0.8, 1.0, 34, { ...lowCols, top: shade(wallStone, 1.3) });
    const y = -0.5 + i * 4; isoBox(c, S(W - 0.5 + 1.0, Math.min(y + 0.5, Hh - 0.5 + 0.2)), 1.0, 0.8, 34, { ...lowCols, top: shade(wallStone, 1.3) });
  }
}
