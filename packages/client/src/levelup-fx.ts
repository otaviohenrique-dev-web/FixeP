import Phaser from "phaser";
import { chaoH } from "./iso";
import { LEVEL_TIER_COLORS, LEVEL_TIER_TITLES, levelTier } from "@frixep/shared";
/**
 * Efeitos de subir de nível:
 * - banner "Level Up!" no centro da tela (só para quem subiu), no mesmo estilo do aviso de item raro;
 * - brilho no personagem na cor da sua faixa de borda (cinzas, sombra, abismo, gelo, trevas, ruína): anel, coluna de luz
 *   e um halo que pulsa sob os pés por alguns segundos. Vale para todos que estão na tela, não só para você.
 */

const CSS = `
.lvb{position:fixed;left:50%;top:30%;transform:translate(-50%,-50%);z-index:60;pointer-events:none;text-align:center;font-family:Cinzel,Georgia,serif;
  animation:lvb-in .5s cubic-bezier(.2,1.4,.4,1) both,lvb-out .6s ease-in 2.6s forwards}
.lvb-rays{position:absolute;left:50%;top:50%;width:520px;height:520px;margin:-260px 0 0 -260px;opacity:.35;
  background:repeating-conic-gradient(from 0deg,var(--c) 0 6deg,transparent 6deg 18deg);
  -webkit-mask-image:radial-gradient(circle,#000 20%,transparent 70%);mask-image:radial-gradient(circle,#000 20%,transparent 70%);
  animation:lvb-spin 6s linear infinite}
.lvb-txt{position:relative}
.lvb-big{font-size:clamp(34px,7vw,64px);font-weight:700;color:#fff6dc;letter-spacing:.04em;text-shadow:0 0 18px var(--c),0 0 4px #000,0 3px 0 #000}
.lvb-lv{margin-top:6px;font-size:clamp(14px,2.6vw,20px);font-weight:700;color:var(--c);letter-spacing:.2em;text-transform:uppercase;text-shadow:0 0 10px var(--c),0 2px 0 #000}
@keyframes lvb-in{from{opacity:0;transform:translate(-50%,-50%) scale(.4)}to{opacity:1;transform:translate(-50%,-50%) scale(1)}}
@keyframes lvb-out{to{opacity:0;transform:translate(-50%,-70%)}}
@keyframes lvb-spin{to{transform:rotate(360deg)}}
@media (prefers-reduced-motion: reduce){.lvb,.lvb-rays{animation:none}}
`;

let style: HTMLStyleElement | null = null;
let current: HTMLElement | null = null;
let timer: ReturnType<typeof setTimeout> | undefined;

const hex = (c: number) => `#${c.toString(16).padStart(6, "0")}`;

/** banner "Level Up!" no centro da tela, na cor da faixa do nível */
export function showLevelUpBanner(level: number): void {
  if (!style) { style = document.createElement("style"); style.textContent = CSS; document.head.append(style); }
  clearTimeout(timer);
  current?.remove();
  const el = document.createElement("div");
  el.className = "lvb";
  el.style.setProperty("--c", hex(LEVEL_TIER_COLORS[levelTier(level)]));
  el.setAttribute("role", "status");
  const rays = document.createElement("div");
  rays.className = "lvb-rays";
  const txt = document.createElement("div");
  txt.className = "lvb-txt";
  const big = document.createElement("div");
  big.className = "lvb-big";
  big.textContent = "Level Up!";
  const lv = document.createElement("div");
  lv.className = "lvb-lv";
  lv.textContent = `Nível ${level} · ${LEVEL_TIER_TITLES[levelTier(level)]}`; // textContent: nunca interpretar HTML
  txt.append(big, lv);
  el.append(rays, txt);
  document.body.append(el);
  current = el;
  timer = setTimeout(() => { el.remove(); if (current === el) current = null; }, 3300);
}

/**
 * Brilho no personagem (`target` é o sprite da cena). Dura ~3 s e acompanha o personagem enquanto dura.
 */
export function levelUpGlow(scene: Phaser.Scene, target: Phaser.GameObjects.GameObject & { x: number; y: number; depth: number }, level: number): void {
  const col = LEVEL_TIER_COLORS[levelTier(level)];
  const x = target.x, y = target.y;
  const ring = scene.add.ellipse(x, y, 60, chaoH(60)).setStrokeStyle(3, col, 0.95).setDepth(target.depth - 1);
  scene.tweens.add({ targets: ring, scale: 3, alpha: 0, duration: 900, ease: "Quad.easeOut", onComplete: () => ring.destroy() });

  const beam = scene.add.rectangle(x, y - 40, 14, 120, col, 0.6).setBlendMode(Phaser.BlendModes.ADD).setDepth(target.depth - 1);
  scene.tweens.add({ targets: beam, scaleX: 0.2, alpha: 0, y: y - 80, duration: 1300, ease: "Quad.easeOut", onComplete: () => beam.destroy() });

  const glow = scene.add.ellipse(x, y, 52, chaoH(52), col, 0.35).setBlendMode(Phaser.BlendModes.ADD).setDepth(target.depth - 1);
  scene.tweens.add({ targets: glow, alpha: { from: 0.2, to: 0.55 }, duration: 500, yoyo: true, repeat: 2, ease: "Sine.easeInOut" });
  const follow = () => glow.setPosition(target.x, target.y); // o halo anda com o personagem
  scene.events.on("update", follow);
  scene.time.delayedCall(3000, () => {
    scene.events.off("update", follow);
    scene.tweens.add({ targets: glow, alpha: 0, duration: 400, onComplete: () => glow.destroy() });
  });
}
