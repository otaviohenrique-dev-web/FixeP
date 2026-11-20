import "@fontsource/cinzel/400.css";
import "@fontsource/cinzel/700.css";
import "@fontsource/cinzel/900.css";

/**
 * Tela de login do FrixeP: "Fogueira solitária na geada".
 * 100% procedural: cena em SVG, brasas/neve/névoa/fogo em canvas e ambiente sonoro sintetizado (WebAudio).
 * Nenhum arquivo de imagem ou áudio é necessário.
 */

export interface LoginOptions {
  message?: string;
  providers: { google: boolean; discord: boolean; guest: boolean };
  onGoogle(): void;
  onDiscord(): void;
  onGuest(): void | Promise<void>;
}
export interface LoginHandle {
  destroy(): void;
  setMessage(m: string): void;
}
/** Cena da fogueira + painel vazio: base para login, criação de personagem etc. */
export interface ScreenHandle extends LoginHandle {
  panel: HTMLElement;
  msg: HTMLElement;
  button(label: string, badge: string, main: boolean, fn: () => void | Promise<void>): HTMLButtonElement;
}

// ---------------------------------------------------------------- utilidades
const VB_W = 1600;
const VB_H = 900;
const FIRE = { x: 800, y: 600 }; // base da fogueira, em unidades do SVG
const PAD = 40; // folga das camadas para o parallax não revelar bordas
const reduced = () => window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;

function rng(seed: number) {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function ridge(base: number, amp: number, seed: number, fill: string, edge?: string): string {
  const r = rng(seed);
  const p1 = r() * 6, p2 = r() * 6;
  let d = `M-20,${VB_H}`;
  for (let x = -20; x <= VB_W + 20; x += 16) {
    const y = base - amp * (0.5 * Math.sin(x * 0.0042 + p1) + 0.32 * Math.sin(x * 0.011 + p2) + 0.18 * r());
    d += ` L${x},${y.toFixed(1)}`;
  }
  d += ` L${VB_W + 20},${VB_H} Z`;
  const line = edge ? `<path d="${d}" fill="none" stroke="${edge}" stroke-width="1.4"/>` : "";
  return `<path d="${d}" fill="${fill}"/>${line}`;
}

function tree(r: () => number, x: number, y: number, len: number, ang: number, depth: number, w: number, out: string[]) {
  const x2 = x + Math.sin(ang) * len;
  const y2 = y - Math.cos(ang) * len;
  out.push(`<line x1="${x.toFixed(1)}" y1="${y.toFixed(1)}" x2="${x2.toFixed(1)}" y2="${y2.toFixed(1)}" stroke-width="${w.toFixed(1)}"/>`);
  if (depth <= 0) return;
  const n = depth > 2 && r() < 0.35 ? 3 : 2;
  for (let i = 0; i < n; i++) {
    const da = (r() - 0.5) * 1.0 + (i - (n - 1) / 2) * 0.4;
    tree(r, x2, y2, len * (0.66 + r() * 0.16), ang + da, depth - 1, Math.max(0.7, w * 0.66), out);
  }
}
const treeSvg = (seed: number, x: number, y: number, len: number, depth: number, w: number, color: string, tilt = 0) => {
  const out: string[] = [];
  tree(rng(seed), x, y, len, tilt, depth, w, out);
  return `<g stroke="${color}" stroke-linecap="round" fill="none">${out.join("")}</g>`;
};

// ---------------------------------------------------------------- cena (SVG)
function skyLayer(): string {
  const r = rng(7);
  let stars = "";
  for (let i = 0; i < 230; i++) {
    const x = r() * VB_W, y = Math.pow(r(), 1.5) * 470, rad = 0.4 + r() * 1.1, o = 0.25 + r() * 0.75;
    const tw = r() < 0.12 ? ` class="fx-tw" style="animation-delay:${(r() * 4).toFixed(2)}s"` : "";
    stars += `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="${rad.toFixed(2)}" fill="#cfe6ff" opacity="${o.toFixed(2)}"${tw}/>`;
  }
  return `<svg viewBox="0 0 ${VB_W} ${VB_H}" preserveAspectRatio="xMidYMax slice" aria-hidden="true">
  <defs>
    <linearGradient id="fxSky" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#02050b"/><stop offset=".45" stop-color="#0a1830"/>
      <stop offset=".78" stop-color="#16395a"/><stop offset="1" stop-color="#1d4a6b"/>
    </linearGradient>
    <radialGradient id="fxMoonGlow"><stop offset="0" stop-color="#b9dcff" stop-opacity=".45"/><stop offset="1" stop-color="#b9dcff" stop-opacity="0"/></radialGradient>
    <radialGradient id="fxMoon" cx=".38" cy=".35"><stop offset="0" stop-color="#f4fbff"/><stop offset="1" stop-color="#a9c8e4"/></radialGradient>
  </defs>
  <rect width="${VB_W}" height="${VB_H}" fill="url(#fxSky)"/>
  ${stars}
  <circle cx="1190" cy="200" r="230" fill="url(#fxMoonGlow)"/>
  <circle cx="1190" cy="200" r="52" fill="url(#fxMoon)"/>
  <g fill="#8fb0cf" opacity=".35"><circle cx="1174" cy="188" r="9"/><circle cx="1204" cy="214" r="6"/><circle cx="1196" cy="176" r="4"/></g>
</svg>`;
}

function farLayer(): string {
  return `<svg viewBox="0 0 ${VB_W} ${VB_H}" preserveAspectRatio="xMidYMax slice" aria-hidden="true">
  ${ridge(500, 150, 11, "#102640", "rgba(170,210,245,.28)")}
  ${ridge(560, 110, 23, "#0b1c31", "rgba(150,195,235,.22)")}
</svg>`;
}

function midLayer(): string {
  const ruin = `
  <g fill="#060e19">
    <path d="M1040,640 L1040,430 L1062,426 L1066,398 L1092,402 L1098,360 L1130,352 L1150,372 L1190,344 L1226,352 L1240,390 L1272,384 L1282,430 L1318,436 L1320,640 Z"/>
    <rect x="1018" y="360" width="30" height="290"/>
    <path d="M1018,360 L1018,338 L1033,326 L1048,338 L1048,360 Z"/>
    <rect x="1300" y="410" width="28" height="240"/>
    <path d="M1300,410 L1306,398 L1316,404 L1322,392 L1328,410 Z"/>
  </g>
  <g fill="#143556" opacity=".9">
    <path d="M1108,520 L1108,462 Q1108,432 1130,416 Q1152,432 1152,462 L1152,520 Z"/>
    <path d="M1190,540 L1190,490 Q1190,466 1208,452 Q1226,466 1226,490 L1226,540 Z"/>
  </g>`;
  const t1 = treeSvg(31, 260, 700, 120, 5, 7, "#050c16", -0.05);
  const t2 = treeSvg(47, 560, 690, 90, 5, 5, "#060e19", 0.08);
  const t3 = treeSvg(59, 1430, 700, 110, 5, 6, "#050c16", 0.04);
  return `<svg viewBox="0 0 ${VB_W} ${VB_H}" preserveAspectRatio="xMidYMax slice" aria-hidden="true">
  ${ridge(660, 70, 37, "#08121f", "rgba(130,180,225,.18)")}
  ${ruin}${t1}${t2}${t3}
  ${ridge(700, 40, 41, "#060d18")}
</svg>`;
}

function nearLayer(): string {
  const r = rng(91);
  let rocks = "";
  for (let i = 0; i < 9; i++) {
    const a = r() * Math.PI * 2;
    const x = FIRE.x + Math.cos(a) * (46 + r() * 26), y = FIRE.y + 30 + Math.sin(a) * 10;
    rocks += `<ellipse cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" rx="${(9 + r() * 8).toFixed(1)}" ry="${(6 + r() * 4).toFixed(1)}" fill="#0a111b" stroke="rgba(255,150,70,.35)" stroke-width="1.2"/>`;
  }
  const left = treeSvg(101, 120, 910, 250, 6, 16, "#02050a", 0.07);
  const right = treeSvg(131, 1490, 910, 280, 6, 18, "#02050a", -0.08);
  return `<svg viewBox="0 0 ${VB_W} ${VB_H}" preserveAspectRatio="xMidYMax slice" aria-hidden="true">
  <defs>
    <linearGradient id="fxGround" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#0d1a2a"/><stop offset=".25" stop-color="#050b14"/><stop offset="1" stop-color="#02050a"/></linearGradient>
    <radialGradient id="fxLit" cx=".5" cy=".5"><stop offset="0" stop-color="#ff8a3d" stop-opacity=".55"/><stop offset="1" stop-color="#ff8a3d" stop-opacity="0"/></radialGradient>
  </defs>
  ${ridge(630, 26, 53, "url(#fxGround)", "rgba(190,225,255,.45)")}
  <ellipse cx="${FIRE.x}" cy="${FIRE.y + 34}" rx="260" ry="34" fill="url(#fxLit)"/>
  ${left}${right}
  ${rocks}
  <g stroke="#0b0805" stroke-linecap="round">
    <line x1="${FIRE.x - 52}" y1="${FIRE.y + 30}" x2="${FIRE.x + 40}" y2="${FIRE.y + 8}" stroke-width="15"/>
    <line x1="${FIRE.x + 52}" y1="${FIRE.y + 30}" x2="${FIRE.x - 40}" y2="${FIRE.y + 8}" stroke-width="15"/>
    <line x1="${FIRE.x - 44}" y1="${FIRE.y + 22}" x2="${FIRE.x + 44}" y2="${FIRE.y + 22}" stroke-width="12"/>
  </g>
</svg>`;
}

// ---------------------------------------------------------------- áudio sintetizado
class Ambience {
  private ctx?: AudioContext;
  private master?: GainNode;
  private timer?: number;
  level = 0.55;

  start() {
    if (this.ctx) {
      void this.ctx.resume();
      return;
    }
    const AC = window.AudioContext ?? (window as any).webkitAudioContext;
    if (!AC) return;
    const ctx: AudioContext = new AC();
    this.ctx = ctx;
    const master = ctx.createGain();
    master.gain.value = 0;
    master.connect(ctx.destination);
    this.master = master;

    // vento: ruído marrom filtrado, com a frequência oscilando lentamente
    const len = ctx.sampleRate * 3;
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = buf.getChannelData(0);
    let last = 0;
    for (let i = 0; i < len; i++) {
      last = (last + 0.02 * (Math.random() * 2 - 1)) / 1.02;
      d[i] = last * 3.5;
    }
    const wind = ctx.createBufferSource();
    wind.buffer = buf;
    wind.loop = true;
    const lp = ctx.createBiquadFilter();
    lp.type = "lowpass";
    lp.frequency.value = 420;
    const wg = ctx.createGain();
    wg.gain.value = 0.55;
    const lfo = ctx.createOscillator();
    lfo.frequency.value = 0.07;
    const lfoGain = ctx.createGain();
    lfoGain.gain.value = 220;
    lfo.connect(lfoGain).connect(lp.frequency);
    wind.connect(lp).connect(wg).connect(master);
    wind.start();
    lfo.start();

    // drone grave
    for (const [f, g] of [[55, 0.05], [82.4, 0.025]] as const) {
      const o = ctx.createOscillator();
      o.type = "triangle";
      o.frequency.value = f;
      const og = ctx.createGain();
      og.gain.value = g;
      o.connect(og).connect(master);
      o.start();
    }

    // estalos da fogueira
    const nb = ctx.createBuffer(1, Math.floor(ctx.sampleRate * 0.1), ctx.sampleRate);
    const nd = nb.getChannelData(0);
    for (let i = 0; i < nd.length; i++) nd[i] = Math.random() * 2 - 1;
    const crackle = () => {
      if (!this.ctx || ctx.state !== "running") return;
      const s = ctx.createBufferSource();
      s.buffer = nb;
      s.playbackRate.value = 0.6 + Math.random() * 1.6;
      const bp = ctx.createBiquadFilter();
      bp.type = "bandpass";
      bp.frequency.value = 1500 + Math.random() * 3500;
      bp.Q.value = 1.2;
      const g = ctx.createGain();
      const t = ctx.currentTime;
      const peak = 0.05 + Math.random() * 0.16;
      g.gain.setValueAtTime(0, t);
      g.gain.linearRampToValueAtTime(peak, t + 0.004);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.03 + Math.random() * 0.05);
      s.connect(bp).connect(g).connect(master);
      s.start(t);
      s.stop(t + 0.12);
    };
    const loop = () => {
      crackle();
      this.timer = window.setTimeout(loop, 70 + Math.random() * (Math.random() < 0.2 ? 900 : 380));
    };
    loop();

    master.gain.setTargetAtTime(this.level, ctx.currentTime, 1.2);
  }

  setMuted(m: boolean) {
    if (this.ctx && this.master) this.master.gain.setTargetAtTime(m ? 0 : this.level, this.ctx.currentTime, 0.25);
  }

  stop() {
    window.clearTimeout(this.timer);
    const ctx = this.ctx;
    if (!ctx || !this.master) return;
    this.master.gain.setTargetAtTime(0, ctx.currentTime, 0.2);
    window.setTimeout(() => void ctx.close(), 900);
    this.ctx = undefined;
  }
}

// ---------------------------------------------------------------- estilos
const CSS = `
.fx-root{position:fixed;inset:0;overflow:hidden;background:#02050b;color:#dbeaff;font-family:"Cinzel",Georgia,"Times New Roman",serif;z-index:10;animation:fx-in 1.4s ease-out both;-webkit-tap-highlight-color:transparent;user-select:none}
.fx-layer{position:absolute;inset:-${PAD}px;will-change:transform}
.fx-layer svg{position:absolute;inset:0;width:100%;height:100%;display:block}
.fx-fx{position:absolute;inset:0;width:100%;height:100%;pointer-events:none}
.fx-vig{position:absolute;inset:0;pointer-events:none;background:radial-gradient(ellipse at 50% 58%,rgba(0,0,0,0) 38%,rgba(1,3,8,.55) 78%,rgba(0,1,4,.9) 100%),linear-gradient(180deg,rgba(2,5,11,.55) 0%,rgba(2,5,11,0) 28%,rgba(2,5,11,0) 70%,rgba(2,5,11,.7) 100%)}
.fx-ui{position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:space-between;padding:clamp(20px,6vh,64px) 16px clamp(22px,6vh,56px)}
.fx-logo{text-align:center;animation:fx-rise 1.6s .35s cubic-bezier(.2,.7,.2,1) both}
.fx-pre{display:block;font-weight:400;font-size:clamp(10px,1.5vw,13px);letter-spacing:.5em;text-transform:uppercase;color:#7fa6cc;opacity:.85;margin-bottom:6px;text-indent:.5em}
.fx-logo h1{margin:0;font-weight:900;font-size:clamp(58px,12vw,142px);line-height:1;letter-spacing:.07em;text-indent:.07em;
  background:linear-gradient(180deg,#ffffff 0%,#bfe3ff 38%,#6fb0e6 62%,#ff9a4d 100%);-webkit-background-clip:text;background-clip:text;color:transparent;
  filter:drop-shadow(0 0 18px rgba(120,190,255,.35)) drop-shadow(0 4px 22px rgba(255,120,40,.28))}
.fx-logo h1 b{font-weight:900;background:linear-gradient(180deg,#fff2c9 0%,#ffb35c 45%,#ff5a1a 100%);-webkit-background-clip:text;background-clip:text;color:transparent;animation:fx-flick 2.6s infinite}
.fx-emb{display:block;margin:0 auto 6px;width:clamp(52px,10vh,84px);height:auto;filter:drop-shadow(0 4px 14px rgba(0,0,0,.8)) drop-shadow(0 0 16px rgba(255,150,60,.25))}
.fx-tag{margin:10px 0 0;font-weight:400;font-size:clamp(11px,1.7vw,16px);letter-spacing:.32em;text-transform:uppercase;color:#a9c7e6;text-indent:.32em;text-shadow:0 2px 12px #000}
.fx-panel{width:min(360px,100%);display:flex;flex-direction:column;align-items:stretch;gap:12px;animation:fx-rise 1.6s .9s cubic-bezier(.2,.7,.2,1) both}
.fx-head{display:flex;align-items:center;gap:12px;font-size:12px;font-weight:700;letter-spacing:.4em;text-transform:uppercase;color:#ffb072;margin-bottom:2px;text-shadow:0 0 14px rgba(255,120,40,.5);justify-content:center;text-indent:.4em}
.fx-head::before,.fx-head::after{content:"";flex:1;height:1px;background:linear-gradient(90deg,transparent,rgba(255,150,70,.7))}
.fx-head::after{transform:scaleX(-1)}
.fx-btn{position:relative;display:flex;align-items:center;justify-content:center;gap:12px;min-height:52px;padding:0 18px;border-radius:5px;cursor:pointer;
  font:700 14px/1 "Cinzel",Georgia,serif;letter-spacing:.14em;text-transform:uppercase;color:#eaf4ff;
  background:linear-gradient(180deg,rgba(24,40,60,.82),rgba(7,13,22,.9));border:1px solid rgba(255,150,70,.38);
  box-shadow:inset 0 1px 0 rgba(180,220,255,.12),0 6px 22px rgba(0,0,0,.55);backdrop-filter:blur(6px);-webkit-backdrop-filter:blur(6px);
  overflow:hidden;transition:transform .18s,border-color .18s,box-shadow .18s,color .18s}
.fx-btn::after{content:"";position:absolute;top:0;bottom:0;width:60%;left:-80%;background:linear-gradient(100deg,transparent,rgba(255,190,120,.22),transparent);transform:skewX(-18deg);transition:left .6s}
.fx-btn:hover,.fx-btn:focus-visible{transform:translateY(-1px);border-color:#ff9a4d;color:#fff;box-shadow:inset 0 1px 0 rgba(255,220,180,.2),0 0 26px rgba(255,120,40,.38),0 8px 24px rgba(0,0,0,.6)}
.fx-btn:hover::after,.fx-btn:focus-visible::after{left:130%}
.fx-btn:active{transform:translateY(1px)}
.fx-btn:focus-visible{outline:2px solid #ffd2a3;outline-offset:2px}
.fx-btn:disabled{opacity:.55;cursor:wait}
.fx-btn.fx-main{background:linear-gradient(180deg,rgba(150,60,14,.9),rgba(70,24,6,.95));border-color:rgba(255,170,90,.75);box-shadow:inset 0 1px 0 rgba(255,220,170,.3),0 0 22px rgba(255,110,30,.25),0 6px 22px rgba(0,0,0,.55)}
.fx-ico{display:grid;place-items:center;width:24px;height:24px;border-radius:50%;border:1px solid currentColor;font-size:12px;letter-spacing:0;text-indent:0}
.fx-msg{min-height:0;margin:0;text-align:center;font:400 13px/1.4 Georgia,serif;letter-spacing:.04em;color:#ff9d8a;text-shadow:0 1px 8px #000}
.fx-msg:empty{display:none}
.fx-snd{position:absolute;top:max(14px,env(safe-area-inset-top));right:14px;width:44px;height:44px;border-radius:50%;display:grid;place-items:center;cursor:pointer;color:#bcd8f5;
  background:rgba(8,16,28,.55);border:1px solid rgba(160,200,240,.3);backdrop-filter:blur(6px);-webkit-backdrop-filter:blur(6px);transition:border-color .18s,color .18s,box-shadow .18s}
.fx-snd:hover,.fx-snd:focus-visible{color:#fff;border-color:#ff9a4d;box-shadow:0 0 16px rgba(255,120,40,.35)}
.fx-snd:focus-visible{outline:2px solid #ffd2a3;outline-offset:2px}
.fx-snd svg{width:22px;height:22px}
.fx-tw{animation:fx-tw 3.2s ease-in-out infinite}
@keyframes fx-in{from{opacity:0}to{opacity:1}}
@keyframes fx-rise{from{opacity:0;transform:translateY(18px)}to{opacity:1;transform:none}}
@keyframes fx-flick{0%,100%{filter:brightness(1)}8%{filter:brightness(1.25)}14%{filter:brightness(.9)}36%{filter:brightness(1.18)}52%{filter:brightness(.95)}70%{filter:brightness(1.3)}}
@keyframes fx-tw{0%,100%{opacity:.25}50%{opacity:1}}
@media (prefers-reduced-motion:reduce){.fx-root,.fx-logo,.fx-panel{animation:none}.fx-logo h1 b,.fx-tw{animation:none}}
@media (max-width:520px){.fx-logo{margin-top:30px}.fx-pre{letter-spacing:.32em;text-indent:.32em}.fx-tag{letter-spacing:.2em;text-indent:.2em}}
@media (max-height:620px){.fx-pre,.fx-tag,.fx-emb{display:none}.fx-btn{min-height:46px}}
`;

const ICON_ON = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M4 9.5v5h3.5L12 18.5v-13L7.5 9.5H4z"/><path d="M15.5 9a4.2 4.2 0 0 1 0 6"/><path d="M18 6.5a8 8 0 0 1 0 11"/></svg>`;
const ICON_OFF = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M4 9.5v5h3.5L12 18.5v-13L7.5 9.5H4z"/><path d="M16 9.5l5 5M21 9.5l-5 5"/></svg>`;

// ---------------------------------------------------------------- montagem
export function mountLogin(opts: LoginOptions): LoginHandle {
  const s = mountScreen("Entrar no reino", opts.message);
  let n = 0;
  if (opts.providers.google) s.button("Entrar com Google", "G", n++ === 0, opts.onGoogle);
  if (opts.providers.discord) s.button("Entrar com Discord", "D", n++ === 0, opts.onDiscord);
  if (opts.providers.guest) s.button("Jogar como convidado", "&#9733;", n++ === 0, opts.onGuest);
  if (n === 0 && !opts.message) s.setMessage("Nenhum método de login disponível no momento.");
  return s;
}

export function mountScreen(heading: string, message?: string): ScreenHandle {
  const style = document.createElement("style");
  style.textContent = CSS;
  document.head.append(style);

  const root = document.createElement("div");
  root.className = "fx-root";
  root.setAttribute("role", "main");
  root.innerHTML = `
    <div class="fx-layer" data-d="5">${skyLayer()}</div>
    <div class="fx-layer" data-d="10">${farLayer()}</div>
    <div class="fx-layer" data-d="18">${midLayer()}</div>
    <div class="fx-layer" data-d="34">${nearLayer()}</div>
    <canvas class="fx-fx"></canvas>
    <div class="fx-vig"></div>
    <div class="fx-ui">
      <header class="fx-logo">
        <img class="fx-emb" src="/icon-192.png" alt="" width="84" height="84" draggable="false">
        <span class="fx-pre">A Geada Negra consome Vael</span>
        <h1 aria-label="FrixeP">Frixe<b>P</b></h1>
        <p class="fx-tag">Acenda a Brasa &middot; Desperte o mundo</p>
      </header>
      <section class="fx-panel">
        <div class="fx-head"></div>
        <p class="fx-msg" role="alert"></p>
      </section>
    </div>
    <button class="fx-snd" type="button" aria-label="Alternar som ambiente"></button>`;
  document.body.append(root);

  const panel = root.querySelector<HTMLElement>(".fx-panel")!;
  const msg = root.querySelector<HTMLElement>(".fx-msg")!;
  const setMessage = (m: string) => (msg.textContent = m);
  setMessage(message ?? "");
  root.querySelector<HTMLElement>(".fx-head")!.textContent = heading;
  panel.setAttribute("aria-label", heading);

  const mkBtn = (label: string, badge: string, main: boolean, fn: () => void | Promise<void>) => {
    const b = document.createElement("button");
    b.type = "button";
    b.className = "fx-btn" + (main ? " fx-main" : "");
    b.setAttribute("aria-label", label);
    b.innerHTML = `<span class="fx-ico" aria-hidden="true">${badge}</span><span>${label}</span>`;
    b.onclick = async () => {
      b.disabled = true;
      try { await fn(); } finally { b.disabled = false; }
    };
    panel.insertBefore(b, msg);
    return b;
  };

  // ----- som
  const audio = new Ambience();
  let soundOn = true;
  try { soundOn = localStorage.getItem("frixep_sound") !== "off"; } catch { /* ignore */ }
  const snd = root.querySelector<HTMLButtonElement>(".fx-snd")!;
  const paintSnd = () => {
    snd.innerHTML = soundOn ? ICON_ON : ICON_OFF;
    snd.setAttribute("aria-pressed", String(soundOn));
  };
  paintSnd();
  const firstGesture = () => { if (soundOn) audio.start(); };
  root.addEventListener("pointerdown", firstGesture, { once: true });
  root.addEventListener("keydown", firstGesture, { once: true });
  snd.onclick = (e) => {
    e.stopPropagation();
    soundOn = !soundOn;
    try { localStorage.setItem("frixep_sound", soundOn ? "on" : "off"); } catch { /* ignore */ }
    if (soundOn) { audio.start(); audio.setMuted(false); } else audio.setMuted(true);
    paintSnd();
  };

  // ----- parallax
  const layers = Array.from(root.querySelectorAll<HTMLElement>(".fx-layer"));
  const motion = !reduced();
  let tx = 0, ty = 0, cx = 0, cy = 0;
  const onMove = (e: PointerEvent) => {
    tx = (e.clientX / innerWidth - 0.5) * 2;
    ty = (e.clientY / innerHeight - 0.5) * 2;
  };
  const onTilt = (e: DeviceOrientationEvent) => {
    if (e.gamma == null || e.beta == null) return;
    tx = Math.max(-1, Math.min(1, e.gamma / 28));
    ty = Math.max(-1, Math.min(1, (e.beta - 45) / 28));
  };
  if (motion) {
    window.addEventListener("pointermove", onMove);
    window.addEventListener("deviceorientation", onTilt);
  }

  // ----- canvas: fogo, brasas, neve e névoa
  const cv = root.querySelector<HTMLCanvasElement>(".fx-fx")!;
  const g = cv.getContext("2d")!;
  let W = 0, H = 0, dpr = 1;
  const resize = () => {
    dpr = Math.min(window.devicePixelRatio || 1, innerWidth < 700 ? 1.5 : 2);
    W = innerWidth;
    H = innerHeight;
    cv.width = Math.round(W * dpr);
    cv.height = Math.round(H * dpr);
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
  };
  resize();
  window.addEventListener("resize", resize);

  // mapeia coordenadas do SVG (preserveAspectRatio xMidYMax slice) para a tela
  const fireAt = () => {
    const lw = W + PAD * 2, lh = H + PAD * 2;
    const s = Math.max(lw / VB_W, lh / VB_H);
    const ox = -PAD + (lw - VB_W * s) / 2;
    const oy = -PAD + (lh - VB_H * s);
    return { x: ox + FIRE.x * s - cx * 34, y: oy + FIRE.y * s - cy * 34 * 0.5, s };
  };

  const rnd = Math.random;
  const snow = Array.from({ length: motion ? Math.min(150, Math.round((innerWidth * innerHeight) / 9500)) : 0 }, () => ({
    x: rnd() * innerWidth, y: rnd() * innerHeight, r: 0.6 + rnd() * 1.7, v: 14 + rnd() * 34, ph: rnd() * 6.28, a: 0.25 + rnd() * 0.55,
  }));
  type Ember = { x: number; y: number; vx: number; vy: number; life: number; max: number; r: number; ph: number };
  const embers: Ember[] = [];
  const blob = document.createElement("canvas");
  blob.width = blob.height = 256;
  {
    const bg = blob.getContext("2d")!;
    const gr = bg.createRadialGradient(128, 128, 0, 128, 128, 128);
    gr.addColorStop(0, "rgba(150,190,230,.55)");
    gr.addColorStop(1, "rgba(150,190,230,0)");
    bg.fillStyle = gr;
    bg.fillRect(0, 0, 256, 256);
  }
  const fog = Array.from({ length: 7 }, (_, i) => ({
    x: rnd() * innerWidth, y: 0.5 + rnd() * 0.45, s: 380 + rnd() * 420, v: (i % 2 ? 1 : -1) * (5 + rnd() * 10), a: 0.07 + rnd() * 0.09,
  }));

  const flame = (x: number, y: number, s: number, t: number) => {
    g.globalCompositeOperation = "lighter";
    const flick = 0.86 + 0.1 * Math.sin(t * 9) + 0.06 * Math.sin(t * 23 + 1);
    const R = 380 * s * flick;
    const glow = g.createRadialGradient(x, y - 70 * s, 0, x, y - 70 * s, R);
    glow.addColorStop(0, "rgba(255,150,60,.42)");
    glow.addColorStop(0.4, "rgba(255,100,30,.14)");
    glow.addColorStop(1, "rgba(255,80,20,0)");
    g.fillStyle = glow;
    g.fillRect(x - R, y - 70 * s - R, R * 2, R * 2);
    // tochas de chama: externas laranja, internas amarelo-brancas
    const tongues = [
      [-30, 70, 24, 0.0], [30, 78, 24, 1.3], [-14, 118, 26, 2.1], [16, 124, 26, 3.4], [0, 150, 30, 4.7],
      [-6, 92, 15, 5.2], [8, 100, 14, 6.1], [0, 118, 14, 7.3],
    ];
    tongues.forEach(([bx, bh, bw, ph], i) => {
      const inner = i >= 5;
      const h = bh * s * (0.78 + 0.22 * Math.sin(t * (6 + i * 0.7) + ph) + 0.08 * Math.sin(t * 17 + ph * 2));
      const w = bw * s * (0.9 + 0.1 * Math.sin(t * 8 + ph));
      const px = x + bx * s, sway = Math.sin(t * 4.2 + ph) * 11 * s;
      const gr = g.createLinearGradient(0, y, 0, y - h);
      if (inner) {
        gr.addColorStop(0, "rgba(255,245,200,.95)");
        gr.addColorStop(0.5, "rgba(255,210,110,.7)");
        gr.addColorStop(1, "rgba(255,170,60,0)");
      } else {
        gr.addColorStop(0, "rgba(255,200,110,.85)");
        gr.addColorStop(0.4, "rgba(255,120,30,.6)");
        gr.addColorStop(0.8, "rgba(200,50,10,.25)");
        gr.addColorStop(1, "rgba(160,30,0,0)");
      }
      g.fillStyle = gr;
      g.beginPath();
      g.moveTo(px - w, y);
      g.quadraticCurveTo(px - w * 0.95, y - h * 0.55, px + sway, y - h);
      g.quadraticCurveTo(px + w * 0.95, y - h * 0.55, px + w, y);
      g.closePath();
      g.fill();
    });
  };

  let raf = 0, last = performance.now(), t = 0, spawn = 0;
  const frame = (now: number) => {
    raf = requestAnimationFrame(frame);
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    t += dt;

    if (motion) {
      cx += (tx - cx) * Math.min(1, dt * 3);
      cy += (ty - cy) * Math.min(1, dt * 3);
      for (const l of layers) {
        const d = Number(l.dataset.d);
        l.style.transform = `translate3d(${(-cx * d).toFixed(2)}px,${(-cy * d * 0.5).toFixed(2)}px,0)`;
      }
    }

    g.clearRect(0, 0, W, H);
    g.globalCompositeOperation = "source-over";

    // névoa
    for (const f of fog) {
      f.x += f.v * dt;
      if (f.x > W + f.s) f.x = -f.s;
      if (f.x < -f.s) f.x = W + f.s;
      g.globalAlpha = f.a;
      g.drawImage(blob, f.x - f.s / 2, f.y * H - f.s / 4, f.s, f.s / 2);
    }
    g.globalAlpha = 1;

    // neve
    g.fillStyle = "#d6e9ff";
    for (const p of snow) {
      p.y += p.v * dt;
      p.x += Math.sin(t * 0.8 + p.ph) * 12 * dt - 4 * dt;
      if (p.y > H + 4) { p.y = -4; p.x = rnd() * W; }
      if (p.x < -4) p.x = W + 4;
      g.globalAlpha = p.a;
      g.beginPath();
      g.arc(p.x, p.y, p.r, 0, 6.283);
      g.fill();
    }
    g.globalAlpha = 1;

    // fogo + brasas
    const f = fireAt();
    flame(f.x, f.y, f.s, t);
    spawn += dt * (motion ? 22 : 8);
    while (spawn > 1) {
      spawn -= 1;
      embers.push({
        x: f.x + (rnd() - 0.5) * 36 * f.s, y: f.y - 20 * f.s, vx: (rnd() - 0.5) * 14,
        vy: -(40 + rnd() * 90) * Math.max(0.7, f.s), life: 0, max: 2.4 + rnd() * 3, r: 0.8 + rnd() * 1.9, ph: rnd() * 6.28,
      });
    }
    g.globalCompositeOperation = "lighter";
    for (let i = embers.length - 1; i >= 0; i--) {
      const e = embers[i];
      e.life += dt;
      if (e.life >= e.max) { embers.splice(i, 1); continue; }
      e.x += (e.vx + Math.sin(t * 2.2 + e.ph) * 22 + 10) * dt;
      e.y += e.vy * dt;
      e.vy *= 1 - 0.12 * dt;
      const k = 1 - e.life / e.max;
      g.fillStyle = `rgba(255,${Math.round(90 + 130 * k)},${Math.round(30 + 50 * k)},${(k * 0.35).toFixed(3)})`;
      g.beginPath();
      g.arc(e.x, e.y, e.r * 3, 0, 6.283);
      g.fill();
      g.fillStyle = `rgba(255,${Math.round(170 + 80 * k)},${Math.round(90 + 60 * k)},${(k * 0.95).toFixed(3)})`;
      g.beginPath();
      g.arc(e.x, e.y, e.r, 0, 6.283);
      g.fill();
    }
    g.globalCompositeOperation = "source-over";
  };
  raf = requestAnimationFrame(frame);

  return {
    setMessage,
    panel,
    msg,
    button: mkBtn,
    destroy() {
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", resize);
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("deviceorientation", onTilt);
      audio.stop();
      root.remove();
      style.remove();
    },
  };
}
