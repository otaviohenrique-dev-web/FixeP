/**
 * Lógica PURA do carregador de sprites (sem Phaser): direções, espelhamento, tags do Aseprite e validação do atlas.
 * Fica separada para ser testada sem navegador. Convenção em docs/GUIA_ARTE_INICIAL.pdf.
 */

import { HX, HY } from "./iso";
export type Dir = "e" | "se" | "s" | "sw" | "w" | "nw" | "n" | "ne";
/** índice = setor de 45° na tela, começando em Leste e girando para baixo (sentido horário, y da tela cresce para baixo) */
export const DIRS: readonly Dir[] = ["e", "se", "s", "sw", "w", "nw", "n", "ne"];
export const isDir = (s: string): s is Dir => (DIRS as readonly string[]).includes(s);

/**
 * Tamanho do personagem NO MUNDO (64 unidades) e o ponto dos pés nesse quadro. A arte pode vir em quadros de
 * 64x64 (antiga) ou 128x128 (padrão desde 27/11/2026, 32 cores): o quadro de 128 é desenhado em escala 0,5, então
 * ocupa o mesmo lugar na tela e fica mais nítido quando a câmera aproxima. O pé fica na mesma proporção (32/64, 52/64).
 */
export const FRAME = 64;
export const PIVOT_X = 32;
export const PIVOT_Y = 52;
/** tamanhos de quadro aceitos no atlas (quadrado) */
export const QUADROS_ACEITOS: readonly number[] = [64, 128];

/** Direção da tela a partir de um vetor da tela (vx, vy), com y para baixo. */
export function dirFromScreen(vx: number, vy: number): Dir {
  const ang = Math.atan2(vy, vx); // 0 = Leste, +90° = Sul
  const sector = ((Math.round(ang / (Math.PI / 4)) % 8) + 8) % 8;
  return DIRS[sector];
}

/** Direção da tela a partir do ângulo de olhar no espaço da GRADE (a simulação do servidor). */
export function gridAngleToDir(angle: number): Dir {
  const vx = (Math.cos(angle) - Math.sin(angle)) * HX; // projeção do chão (iso.ts)
  const vy = (Math.cos(angle) + Math.sin(angle)) * HY;
  return dirFromScreen(vx, vy);
}

export interface Pick { dir: Dir; flip: boolean }

/** Quais desenhos servem para cada direção, em ordem de preferência. flip = espelhar na horizontal. */
const CANDIDATES: Record<Dir, [Dir, boolean][]> = {
  se: [["se", false], ["sw", true]],
  sw: [["sw", false], ["se", true]],
  ne: [["ne", false], ["nw", true]],
  nw: [["nw", false], ["ne", true]],
  e: [["e", false], ["w", true], ["se", false], ["ne", false], ["sw", true], ["nw", true]],
  w: [["w", false], ["e", true], ["sw", false], ["nw", false], ["se", true], ["ne", true]],
  s: [["s", false], ["se", false], ["sw", false], ["e", false], ["w", false]],
  n: [["n", false], ["ne", false], ["nw", false], ["e", false], ["w", false]],
};

/** Escolhe o desenho (e se precisa espelhar) para a direção pedida, conforme as direções que o atlas tem. */
export function pickDirection(want: Dir, has: (d: Dir) => boolean): Pick | null {
  for (const [d, flip] of CANDIDATES[want]) if (has(d)) return { dir: d, flip };
  return null;
}

/** Nome da animação pedida -> alternativas, caso o artista ainda não tenha desenhado aquela. */
export function animFallbacks(anim: string): string[] {
  switch (anim) {
    case "skill": return ["skill", "attack"];
    case "windup": return ["windup", "idle"];
    case "dodge": return ["dodge", "walk"];
    case "hit": return ["hit", "idle"];
    case "death": return ["death", "hit", "idle"];
    case "attack": return ["attack", "skill"];
    default: return [anim, "idle"];
  }
}

export const LOOP_ANIMS: ReadonlySet<string> = new Set(["idle", "walk"]);

/** "walk_se" -> { anim: "walk", dir: "se" } */
export function parseTag(name: string): { anim: string; dir: Dir } | null {
  const i = name.lastIndexOf("_");
  if (i <= 0) return null;
  const dir = name.slice(i + 1).toLowerCase();
  const anim = name.slice(0, i).toLowerCase();
  if (!isDir(dir) || !/^[a-z0-9]+$/.test(anim)) return null;
  return { anim, dir };
}

export interface AtlasFrame { filename: string; duration: number }
export interface AtlasTag { name: string; from: number; to: number }
export type AtlasCheck = { ok: true; frames: AtlasFrame[]; tags: AtlasTag[]; size: { w: number; h: number }; quadro: number } | { ok: false; reason: string };

/** Confere um JSON exportado pelo Aseprite (json-array, com --list-tags). */
export function validateAtlasJson(json: unknown): AtlasCheck {
  const j = json as any;
  if (!j || typeof j !== "object") return { ok: false, reason: "JSON inválido" };
  if (!Array.isArray(j.frames)) return { ok: false, reason: "falta 'frames' como lista: exporte com --format json-array" };
  if (!Array.isArray(j.meta?.frameTags) || j.meta.frameTags.length === 0) return { ok: false, reason: "sem tags de animação: exporte com --list-tags" };
  const frames: AtlasFrame[] = [];
  let quadro = 0; // tamanho do quadro deste atlas (todos iguais): 64 ou 128
  for (const [i, f] of j.frames.entries()) {
    if (typeof f?.filename !== "string") return { ok: false, reason: `quadro ${i} sem 'filename'` };
    const w = Number(f.sourceSize?.w ?? f.frame?.w ?? FRAME), h = Number(f.sourceSize?.h ?? f.frame?.h ?? FRAME);
    if (w !== h || !QUADROS_ACEITOS.includes(w)) return { ok: false, reason: `quadro ${i} tem ${w}x${h}; o padrão é 128x128 (ou 64x64 na arte antiga), sem trim` };
    if (quadro && w !== quadro) return { ok: false, reason: `quadro ${i} tem ${w}x${h}, diferente dos outros (${quadro}x${quadro}): use um tamanho só por atlas` };
    quadro = w;
    const duration = Number.isFinite(f.duration) && f.duration > 0 ? f.duration : 100;
    frames.push({ filename: f.filename, duration });
  }
  const tags: AtlasTag[] = [];
  for (const t of j.meta.frameTags) {
    if (typeof t?.name !== "string" || !Number.isInteger(t.from) || !Number.isInteger(t.to)) continue;
    if (t.from < 0 || t.to >= frames.length || t.from > t.to) return { ok: false, reason: `tag '${t.name}' aponta para quadros que não existem` };
    if (parseTag(t.name)) tags.push({ name: t.name, from: t.from, to: t.to });
  }
  if (tags.length === 0) return { ok: false, reason: "nenhuma tag no formato <animacao>_<direcao> (ex.: walk_se)" };
  return { ok: true, frames, tags, size: { w: Number(j.meta?.size?.w) || 0, h: Number(j.meta?.size?.h) || 0 }, quadro: quadro || FRAME };
}

export const totalDuration = (frames: { duration: number }[]) => frames.reduce((n, f) => n + f.duration, 0);
