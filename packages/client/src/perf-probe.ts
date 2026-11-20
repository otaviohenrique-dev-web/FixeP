import Phaser from "phaser";
/**
 * Medidor de desempenho para o celular (sem cabo nem configuração).
 * Pelo menu ("Medir desempenho"), grava 30 s de jogo e mostra um relatório curto para copiar e mandar.
 * Mede pelos eventos do próprio Phaser: quanto tempo o quadro gasta em atualizar o mundo (update) e em desenhar (render),
 * além dos intervalos entre quadros reais (FPS). Quando não está medindo, custa quase nada.
 */

const SECONDS = 30;

type Ctx = () => { zone: string; ents: number };

let game: Phaser.Game | null = null;
let ctx: Ctx = () => ({ zone: "?", ents: 0 });
let measuring = false;
let t0 = 0; // início do quadro (prestep)
let tRender = 0; // início do desenho (prerender)
let lastFrame = 0; // momento do quadro anterior (para o intervalo entre quadros)
let frameMs: number[] = [];
let updMs: number[] = [];
let rendMs: number[] = [];
let zones = new Set<string>();
let entsMax = 0;
let startedAt = 0;
let overlay: HTMLDivElement | null = null;
let rafTimer = 0;

/** liga o medidor ao jogo (uma vez, ao entrar no mundo) */
export function attachPerf(g: Phaser.Game, c: Ctx): void {
  if (game) return;
  game = g;
  ctx = c;
  g.events.on("prestep", (_t: number, _d: number) => {
    if (!measuring) return;
    t0 = performance.now();
  });
  g.events.on("poststep", () => {
    if (measuring) updMs.push(performance.now() - t0);
  });
  g.events.on("prerender", () => {
    if (!measuring) return;
    tRender = performance.now();
  });
  g.events.on("postrender", () => {
    if (!measuring) return;
    const now = performance.now();
    rendMs.push(now - tRender);
    if (lastFrame) frameMs.push(now - lastFrame);
    lastFrame = now;
    const c2 = ctx();
    zones.add(c2.zone);
    entsMax = Math.max(entsMax, c2.ents);
  });
}

const pct = (a: number[], p: number) => {
  if (!a.length) return 0;
  const s = [...a].sort((x, y) => x - y);
  return s[Math.min(s.length - 1, Math.floor((s.length - 1) * p))];
};
const avg = (a: number[]) => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : 0);
const r1 = (n: number) => Math.round(n * 10) / 10;

/** monta o relatório em texto curto (para colar em uma mensagem) */
function report(): string {
  const secs = (performance.now() - startedAt) / 1000;
  const fpsAvg = frameMs.length ? frameMs.length / (frameMs.reduce((x, y) => x + y, 0) / 1000) : 0;
  const worst = frameMs.length ? Math.max(...frameMs) : 0;
  const slow = frameMs.filter((f) => f > 33.4).length;
  const lines = [
    `FrixeP desempenho (${r1(secs)} s)`,
    `tela: ${innerWidth}x${innerHeight} @${devicePixelRatio}x · núcleos: ${navigator.hardwareConcurrency ?? "?"}`,
    `zonas: ${[...zones].join(", ") || "?"} · entidades máx.: ${entsMax}`,
    `FPS médio: ${r1(fpsAvg)} · 1% pior: ${r1(1000 / Math.max(1, pct(frameMs, 0.99)))} · pior quadro: ${r1(worst)} ms`,
    `quadros acima de 33 ms: ${slow} de ${frameMs.length} (${r1((100 * slow) / Math.max(1, frameMs.length))}%)`,
    `atualizar mundo (update): média ${r1(avg(updMs))} ms · p95 ${r1(pct(updMs, 0.95))} ms`,
    `desenhar (render): média ${r1(avg(rendMs))} ms · p95 ${r1(pct(rendMs, 0.95))} ms`,
  ];
  return lines.join("\n");
}

function el<K extends keyof HTMLElementTagNameMap>(tag: K, css: string, text?: string): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  e.style.cssText = css;
  if (text !== undefined) e.textContent = text;
  return e;
}

type Parts = { title: HTMLElement; info: HTMLElement; area: HTMLTextAreaElement; btn: HTMLButtonElement; close: HTMLButtonElement };

function showOverlay(): Parts {
  if (overlay) overlay.remove();
  const box = el("div", "position:fixed;inset:0;z-index:40;display:flex;align-items:center;justify-content:center;background:rgba(2,5,11,.6);padding:16px;font-family:Georgia,serif");
  const card = el("div", "width:min(340px,100%);padding:18px;border-radius:8px;color:#dbeaff;background:linear-gradient(180deg,rgba(20,34,52,.97),rgba(6,12,20,.98));border:1px solid rgba(255,150,70,.4)");
  const title = el("p", "margin:0 0 10px;font:700 14px Georgia,serif;letter-spacing:.2em;text-transform:uppercase;color:#ffb072;text-align:center", "Medindo desempenho");
  const info = el("p", "margin:0 0 10px;font-size:13px;line-height:1.4;color:#8fb0cf;text-align:center", `Jogue normalmente por ${SECONDS} s.`);
  const area = el("textarea", "display:none;width:100%;height:170px;box-sizing:border-box;font:12px/1.4 monospace;background:#06090f;color:#dbeaff;border:1px solid #3a4f66;border-radius:4px;padding:6px");
  area.readOnly = true;
  const btn = el("button", "display:none;width:100%;min-height:44px;margin-top:10px;border-radius:5px;cursor:pointer;font:700 13px Georgia,serif;letter-spacing:.12em;text-transform:uppercase;color:#eaf4ff;background:rgba(24,40,60,.9);border:1px solid rgba(255,150,70,.38)", "Copiar relatório");
  const close = el("button", "display:none;width:100%;min-height:44px;margin-top:8px;border-radius:5px;cursor:pointer;font:700 13px Georgia,serif;letter-spacing:.12em;text-transform:uppercase;color:#eaf4ff;background:rgba(7,13,22,.9);border:1px solid #3a4f66", "Fechar");
  btn.onclick = async () => {
    try { await navigator.clipboard.writeText(area.value); btn.textContent = "Copiado!"; } catch { area.select(); btn.textContent = "Selecione e copie"; }
  };
  close.onclick = () => box.remove();
  card.append(title, info, area, btn, close);
  box.append(card);
  document.body.append(box);
  overlay = box;
  return { title, info, area, btn, close };
}

/** abre a medição: 30 s de jogo e depois o relatório */
export function startPerf(): void {
  if (!game || measuring) return;
  const p = showOverlay();
  frameMs = []; updMs = []; rendMs = []; zones = new Set(); entsMax = 0; lastFrame = 0;
  measuring = true;
  startedAt = performance.now();
  const tick = () => {
    const left = Math.max(0, SECONDS - (performance.now() - startedAt) / 1000);
    if (left > 0) {
      p.info.textContent = `Jogue normalmente. Faltam ${Math.ceil(left)} s.`;
      rafTimer = requestAnimationFrame(tick);
      return;
    }
    measuring = false;
    p.title.textContent = "Relatório pronto";
    p.info.textContent = "Toque em Copiar e cole a mensagem aqui no chat.";
    p.area.value = report();
    p.area.style.display = "block";
    p.btn.style.display = "block";
    p.close.style.display = "block";
  };
  rafTimer = requestAnimationFrame(tick);
}

