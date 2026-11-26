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
const FIRE = { x: 640, y: 598 }; // lanterna do viajante, em unidades do SVG (luz quente da cena)
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

// ---------------------------------------------------------------- cena (SVG)
/** relevo suave: soma de senoides (sem ruído), com preenchimento e fio de luz fria no topo */
function hills(base: number, amp: number, seed: number, fill: string, edge?: string): string {
  const r = rng(seed);
  const p1 = r() * 6, p2 = r() * 6, p3 = r() * 6;
  let d = `M-20,${VB_H}`;
  for (let x = -20; x <= VB_W + 20; x += 10) {
    const y = base - amp * (0.55 * Math.sin(x * 0.0031 + p1) + 0.3 * Math.sin(x * 0.0074 + p2) + 0.15 * Math.sin(x * 0.0152 + p3));
    d += ` L${x},${y.toFixed(1)}`;
  }
  d += ` L${VB_W + 20},${VB_H} Z`;
  const line = edge ? `<path d="${d}" fill="none" stroke="${edge}" stroke-width="1.6"/>` : "";
  return `<path d="${d}" fill="${fill}"/>${line}`;
}

/** árvore retorcida: galhos curvos e grossos que afinam, sem gravetos pontudos */
function gnarl(r: () => number, x: number, y: number, len: number, ang: number, depth: number, w: number, out: string[]) {
  const x2 = x + Math.sin(ang) * len;
  const y2 = y - Math.cos(ang) * len;
  const bend = (r() - 0.5) * len * 0.55;
  const mx = (x + x2) / 2 + Math.cos(ang) * bend, my = (y + y2) / 2 + Math.sin(ang) * bend;
  out.push(`<path d="M${x.toFixed(1)},${y.toFixed(1)} Q${mx.toFixed(1)},${my.toFixed(1)} ${x2.toFixed(1)},${y2.toFixed(1)}" stroke-width="${w.toFixed(1)}"/>`);
  if (depth <= 0) return;
  const n = depth > 2 ? 2 : r() < 0.5 ? 2 : 1;
  for (let i = 0; i < n; i++) {
    const da = (i === 0 ? -1 : 1) * (0.35 + r() * 0.5) * (n === 1 ? (r() < 0.5 ? -1 : 1) : 1);
    gnarl(r, x2, y2, len * (0.7 + r() * 0.1), ang + da, depth - 1, Math.max(2.6, w * 0.7), out);
  }
}
const gnarlSvg = (seed: number, x: number, y: number, len: number, depth: number, w: number, color: string, lean = 0) => {
  const out: string[] = [];
  gnarl(rng(seed), x, y, len, lean, depth, w, out);
  return `<g stroke="${color}" stroke-linecap="round" stroke-linejoin="round" fill="none">${out.join("")}</g>`;
};

function skyLayer(): string {
  const r = rng(7);
  let stars = "";
  for (let i = 0; i < 260; i++) {
    const x = r() * VB_W, y = Math.pow(r(), 1.6) * 480, rad = 0.35 + r() * 1.0, o = 0.2 + r() * 0.7;
    const tw = r() < 0.12 ? ` class="fx-tw" style="animation-delay:${(r() * 4).toFixed(2)}s"` : "";
    stars += `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="${rad.toFixed(2)}" fill="#d6e4ff" opacity="${o.toFixed(2)}"${tw}/>`;
  }
  return `<svg viewBox="0 0 ${VB_W} ${VB_H}" preserveAspectRatio="xMidYMax slice" aria-hidden="true">
  <defs>
    <linearGradient id="fxSky" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#02030a"/><stop offset=".38" stop-color="#0a0f26"/>
      <stop offset=".7" stop-color="#1b2347"/><stop offset=".9" stop-color="#3a3156"/><stop offset="1" stop-color="#4a3a5c"/>
    </linearGradient>
    <radialGradient id="fxMoonGlow"><stop offset="0" stop-color="#c9d8ff" stop-opacity=".5"/><stop offset=".35" stop-color="#8fa6e6" stop-opacity=".16"/><stop offset="1" stop-color="#8fa6e6" stop-opacity="0"/></radialGradient>
    <radialGradient id="fxMoon" cx=".38" cy=".35"><stop offset="0" stop-color="#fbfcff"/><stop offset=".7" stop-color="#cfd9ee"/><stop offset="1" stop-color="#97a8c9"/></radialGradient>
    <radialGradient id="fxAur" cx=".5" cy=".5"><stop offset="0" stop-color="#4fe0c0" stop-opacity=".16"/><stop offset="1" stop-color="#4fe0c0" stop-opacity="0"/></radialGradient>
    <radialGradient id="fxVio" cx=".5" cy=".5"><stop offset="0" stop-color="#8a5bd6" stop-opacity=".18"/><stop offset="1" stop-color="#8a5bd6" stop-opacity="0"/></radialGradient>
    <filter id="fxSoft" x="-30%" y="-30%" width="160%" height="160%"><feGaussianBlur stdDeviation="26"/></filter>
  </defs>
  <rect width="${VB_W}" height="${VB_H}" fill="url(#fxSky)"/>
  <ellipse cx="420" cy="250" rx="520" ry="120" fill="url(#fxVio)" transform="rotate(-8 420 250)"/>
  <ellipse cx="760" cy="150" rx="460" ry="70" fill="url(#fxAur)" transform="rotate(6 760 150)"/>
  ${stars}
  <circle cx="1190" cy="230" r="330" fill="url(#fxMoonGlow)"/>
  <g filter="url(#fxSoft)" fill="#1a2040" opacity=".75"><ellipse cx="1000" cy="300" rx="320" ry="30"/><ellipse cx="1390" cy="210" rx="260" ry="22"/><ellipse cx="560" cy="330" rx="380" ry="26"/></g>
  <circle cx="1190" cy="230" r="66" fill="url(#fxMoon)"/>
  <g fill="#7f90b4" opacity=".32"><circle cx="1172" cy="216" r="11"/><circle cx="1208" cy="246" r="7"/><circle cx="1198" cy="204" r="5"/><circle cx="1166" cy="248" r="5"/></g>
</svg>`;
}

function farLayer(): string {
  return `<svg viewBox="0 0 ${VB_W} ${VB_H}" preserveAspectRatio="xMidYMax slice" aria-hidden="true">
  <defs><linearGradient id="fxMtn" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#27325a"/><stop offset=".55" stop-color="#141b36"/><stop offset="1" stop-color="#0c1124"/></linearGradient></defs>
  ${hills(520, 150, 11, "url(#fxMtn)", "rgba(190,205,255,.30)")}
  ${hills(585, 105, 23, "#0e1428", "rgba(160,180,240,.20)")}
</svg>`;
}

/** fortaleza-catedral em ruínas: torres com ameias, arcos ogivais com luz fraca, rosácea fria */
function castle(): string {
  const body = "#070a16";
  const win = (x: number, y: number, w: number, h: number) =>
    `<path d="M${x},${y + h} L${x},${y + w * 0.55} Q${x},${y} ${x + w / 2},${y - w * 0.2} Q${x + w},${y} ${x + w},${y + w * 0.55} L${x + w},${y + h} Z" fill="#e0933c" opacity=".55"/>`;
  const crenel = (x: number, y: number, w: number) => {
    let c = "";
    for (let i = 0; i < w; i += 14) c += `<rect x="${x + i}" y="${y - 9}" width="8" height="10"/>`;
    return c;
  };
  return `
  <g fill="${body}">
    <rect x="1010" y="470" width="470" height="200"/>
    <rect x="1086" y="372" width="130" height="120"/>
    <path d="M1076,372 L1076,352 Q1151,296 1226,352 L1226,372 Z"/>
    <rect x="1038" y="338" width="64" height="334"/>${crenel(1034, 338, 72)}
    <rect x="1298" y="300" width="86" height="372"/>${crenel(1292, 300, 98)}
    <path d="M1304,300 L1304,260 Q1341,222 1378,260 L1378,300 Z"/>
    <rect x="1410" y="404" width="56" height="268"/>${crenel(1406, 404, 64)}
    <path d="M1230,430 L1236,402 L1252,414 L1262,388 L1280,408 L1292,396 L1298,470 L1230,470 Z"/>
    <ellipse cx="1250" cy="672" rx="320" ry="24"/>
  </g>
  <circle cx="1151" cy="420" r="22" fill="#8fb0ff" opacity=".28"/>
  <circle cx="1151" cy="420" r="22" fill="none" stroke="#02040a" stroke-width="3"/>
  <path d="M1129,420H1173M1151,398V442M1135,404L1167,436M1167,404L1135,436" stroke="#02040a" stroke-width="2"/>
  ${win(1052, 400, 14, 34)}${win(1074, 480, 12, 30)}${win(1320, 340, 16, 42)}${win(1342, 430, 14, 36)}
  ${win(1110, 500, 14, 34)}${win(1170, 500, 14, 34)}${win(1226, 520, 14, 34)}${win(1422, 450, 12, 30)}`;
}

function midLayer(): string {
  return `<svg viewBox="0 0 ${VB_W} ${VB_H}" preserveAspectRatio="xMidYMax slice" aria-hidden="true">
  <defs>
    <linearGradient id="fxMist" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#7f8fcf" stop-opacity="0"/><stop offset="1" stop-color="#7f8fcf" stop-opacity=".34"/></linearGradient>
    <filter id="fxSoft2" x="-20%" y="-50%" width="140%" height="200%"><feGaussianBlur stdDeviation="14"/></filter>
  </defs>
  ${hills(655, 60, 37, "#090d1c", "rgba(140,160,225,.20)")}
  ${castle()}
  <rect x="900" y="560" width="700" height="130" fill="url(#fxMist)" filter="url(#fxSoft2)"/>
  ${gnarlSvg(31, 250, 706, 110, 4, 12, "#05070f", -0.06)}
  ${gnarlSvg(47, 600, 696, 80, 4, 8, "#060913", 0.08)}
  ${hills(704, 36, 41, "#050710")}
</svg>`;
}

/** viajante encapuzado com lanterna (a única luz quente da cena) */
function wanderer(): string {
  const { x, y } = FIRE; // topo da lanterna
  const bx = x - 34, by = y + 70; // pés
  return `
  <g transform="translate(${bx} ${by}) scale(1.3) translate(${-bx} ${-by})">
    <path d="M${bx - 20},${by} Q${bx - 22},${by - 34} ${bx - 8},${by - 54} Q${bx},${by - 62} ${bx + 8},${by - 54} Q${bx + 22},${by - 34} ${bx + 20},${by} Q${bx},${by + 5} ${bx - 20},${by} Z" fill="#05070e"/>
    <circle cx="${bx}" cy="${by - 62}" r="10" fill="#05070e"/>
    <path d="M${bx - 9},${by - 60} Q${bx},${by - 78} ${bx + 9},${by - 60} Q${bx},${by - 66} ${bx - 9},${by - 60} Z" fill="#05070e"/>
    <path d="M${bx + 12},${by - 40} L${x - 6},${y + 8}" stroke="#05070e" stroke-width="4" stroke-linecap="round"/>
    <line x1="${x - 6}" y1="${y + 4}" x2="${x - 6}" y2="${by + 2}" stroke="#05070e" stroke-width="3" stroke-linecap="round"/>
    <rect x="${x - 14}" y="${y - 6}" width="16" height="20" rx="3" fill="#2a1608" stroke="#0a0604" stroke-width="2"/>
    <rect x="${x - 11}" y="${y - 3}" width="10" height="14" rx="2" fill="#ffb55a"/>
  </g>`;
}

function nearLayer(): string {
  const left = gnarlSvg(101, 90, 930, 200, 5, 20, "#02040a", 0.1);
  const right = gnarlSvg(131, 1540, 930, 190, 5, 22, "#02040a", -0.12);
  return `<svg viewBox="0 0 ${VB_W} ${VB_H}" preserveAspectRatio="xMidYMax slice" aria-hidden="true">
  <defs>
    <linearGradient id="fxGround" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#1a2240"/><stop offset=".22" stop-color="#0a0e1f"/><stop offset="1" stop-color="#03040a"/></linearGradient>
    <radialGradient id="fxLit" cx=".5" cy=".5"><stop offset="0" stop-color="#ff9a4a" stop-opacity=".42"/><stop offset=".5" stop-color="#ff7a30" stop-opacity=".12"/><stop offset="1" stop-color="#ff8a3d" stop-opacity="0"/></radialGradient>
    <linearGradient id="fxPath" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#8fa0d8" stop-opacity=".2"/><stop offset="1" stop-color="#8fa0d8" stop-opacity=".05"/></linearGradient>
  </defs>
  ${hills(655, 22, 53, "url(#fxGround)", "rgba(200,215,255,.5)")}
  <path d="M640,900 Q700,760 760,700 Q900,650 1180,664 L1180,676 Q930,672 800,716 Q760,780 760,900 Z" fill="url(#fxPath)"/>
  <ellipse cx="${FIRE.x - 20}" cy="${FIRE.y + 70}" rx="190" ry="26" fill="url(#fxLit)"/>
  ${left}${right}
  ${wanderer()}
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
/* conteúdo rola dentro da tela quando não cabe (altura baixa, zoom alto); os espaçadores ::before/::after empurram o conteúdo para o meio/rodapé e encolhem a zero quando não há folga */
.fx-ui{position:absolute;inset:0;box-sizing:border-box;display:flex;flex-direction:column;align-items:center;gap:clamp(4px,1.5vh,22px);overflow:hidden;padding:max(clamp(10px,3vh,64px),env(safe-area-inset-top)) max(14px,env(safe-area-inset-right)) max(clamp(10px,3vh,56px),env(safe-area-inset-bottom)) max(14px,env(safe-area-inset-left))}
.fx-ui::before,.fx-ui::after{content:"";flex:1 0 0;min-height:0}
.fx-ui > *{flex-shrink:0}
.fx-logo{text-align:center;animation:fx-rise 1.6s .35s cubic-bezier(.2,.7,.2,1) both}
.fx-pre{display:block;font-weight:400;font-size:clamp(9px,min(1.5vw,2.2vh),13px);letter-spacing:.5em;text-transform:uppercase;color:#7fa6cc;opacity:.85;margin-bottom:6px;text-indent:.5em}
.fx-logo h1{margin:0;font-weight:900;font-size:clamp(40px,min(9vw,11.5vh),116px);line-height:1;letter-spacing:.07em;text-indent:.07em;
  background:linear-gradient(180deg,#ffffff 0%,#bfe3ff 38%,#6fb0e6 62%,#ff9a4d 100%);-webkit-background-clip:text;background-clip:text;color:transparent;
  filter:drop-shadow(0 0 18px rgba(120,190,255,.35)) drop-shadow(0 4px 22px rgba(255,120,40,.28))}
.fx-logo h1 b{font-weight:900;background:linear-gradient(180deg,#fff2c9 0%,#ffb35c 45%,#ff5a1a 100%);-webkit-background-clip:text;background-clip:text;color:transparent;animation:fx-flick 2.6s infinite}
.fx-emb{display:block;margin:0 auto 10px;width:clamp(52px,min(17vh,25vw),180px);height:auto;filter:drop-shadow(0 4px 14px rgba(0,0,0,.8)) drop-shadow(0 0 16px rgba(255,150,60,.25))}
.fx-orn{display:flex;align-items:center;justify-content:center;gap:12px;margin:10px auto 0;width:min(340px,70vw)}
.fx-orn::before,.fx-orn::after{content:"";flex:1;height:1px;background:linear-gradient(90deg,transparent,rgba(230,190,120,.7))}
.fx-orn::after{transform:scaleX(-1)}
.fx-orn i{width:7px;height:7px;transform:rotate(45deg);background:#e6be78;box-shadow:0 0 10px rgba(255,170,70,.7)}
.fx-tag{margin:10px 0 0;font-weight:400;font-size:clamp(9px,min(1.7vw,2.6vh),16px);letter-spacing:.32em;text-transform:uppercase;color:#a9c7e6;text-indent:.32em;text-shadow:0 2px 12px #000}
.fx-panel{width:min(360px,100%);box-sizing:border-box;display:flex;flex-direction:column;align-items:stretch;gap:clamp(5px,1.2vh,12px);animation:fx-rise 1.6s .9s cubic-bezier(.2,.7,.2,1) both}
.fx-head{display:flex;align-items:center;gap:12px;font-size:12px;font-weight:700;letter-spacing:.4em;text-transform:uppercase;color:#ffb072;margin-bottom:2px;text-shadow:0 0 14px rgba(255,120,40,.5);justify-content:center;text-indent:.4em}
.fx-head::before,.fx-head::after{content:"";flex:1;height:1px;background:linear-gradient(90deg,transparent,rgba(255,150,70,.7))}
.fx-head::after{transform:scaleX(-1)}
.fx-btn{position:relative;display:flex;align-items:center;justify-content:center;gap:12px;min-height:clamp(38px,6vh,52px);padding:0 18px;border-radius:5px;cursor:pointer;
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
.fx-copy{margin:0;text-align:center;font:400 11px/1.3 Georgia,serif;letter-spacing:.06em;color:rgba(188,216,245,.45);text-shadow:0 1px 6px #000}
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
@media (max-width:520px){.fx-ui{padding-top:max(60px,env(safe-area-inset-top))}.fx-pre{letter-spacing:.32em;text-indent:.32em}.fx-tag{letter-spacing:.2em;text-indent:.2em}}
@media (max-height:800px){.fx-emb{margin-bottom:4px}.fx-orn{margin-top:4px}.fx-tag{margin-top:4px}}
@media (max-height:620px){.fx-panel{gap:6px}.fx-head{margin-bottom:0}.fx-orn{margin-top:2px}}
@media (max-height:420px){.fx-emb{display:none}.fx-orn{display:none}}
@media (max-height:340px){.fx-ui{overflow-y:auto;padding-top:6px;padding-bottom:6px;gap:3px}.fx-logo h1{font-size:30px}.fx-pre,.fx-tag{font-size:8px;margin:0}.fx-panel{gap:4px}.fx-head{font-size:10px}.fx-btn{min-height:34px;font-size:12px}.fx-link,.fc-link{padding:2px}}
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
        <img class="fx-emb" src="/icon-512.png?v=4" alt="" width="200" height="200" draggable="false">
        <span class="fx-pre">A Geada Negra consome Vael</span>
        <h1 aria-label="FrixeP">Frixe<b>P</b></h1>
        <div class="fx-orn" aria-hidden="true"><i></i></div>
        <p class="fx-tag">Acenda a Brasa &middot; Desperte o mundo</p>
      </header>
      <section class="fx-panel">
        <div class="fx-head"></div>
        <p class="fx-msg" role="alert"></p>
      </section>
      <p class="fx-copy">&copy; 2026 FrixeP. Todos os direitos reservados.</p>
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

  // lanterna: brilho quente que respira (única luz quente da cena)
  const lanternStep = (x: number, y: number, sc: number, t: number) => {
    g.globalCompositeOperation = "lighter";
    const flick = 0.9 + 0.06 * Math.sin(t * 5.1) + 0.04 * Math.sin(t * 13 + 1);
    const R = 150 * sc * flick;
    const gl = g.createRadialGradient(x, y, 0, x, y, R);
    gl.addColorStop(0, "rgba(255,190,100,.55)");
    gl.addColorStop(0.3, "rgba(255,140,50,.2)");
    gl.addColorStop(1, "rgba(255,100,30,0)");
    g.fillStyle = gl;
    g.fillRect(x - R, y - R, R * 2, R * 2);
    g.globalCompositeOperation = "source-over";
  };

  let raf = 0, last = performance.now(), t = 0;
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

    // lanterna
    const f = fireAt();
    lanternStep(f.x, f.y, f.s, t);
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
