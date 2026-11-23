import { BUFFS, type ActiveBuff, type BuffId } from "@frixep/shared";

/**
 * Fileira de buffs próprios (ao lado das barras de vida e de recurso do HUD).
 * Cada ícone: SVG simples de 26 px, anel de tempo que esvazia, segundos restantes embaixo e número de acúmulos no canto.
 * Tooltip com nome e descrição ao passar o mouse ou ao segurar o dedo (toque longo).
 * O servidor manda a lista (Evt.Buffs) e o cliente conta o tempo a partir dela.
 */

// desenhos em 16x16 (mesmo estilo pixelado do HUD); a cor vem da tabela compartilhada
const GLYPH: Record<string, string> = {
  bolt: `<path fill="currentColor" d="M9 1 3 9h4l-1 6 6-8H8z"/>`,
  plus: `<path fill="currentColor" d="M6.5 2h3v4.5H14v3H9.5V14h-3V9.5H2v-3h4.5z"/>`,
  shield: `<path fill="currentColor" d="M8 1.5 13.5 3v4.5c0 3-2.3 5-5.5 7-3.2-2-5.5-4-5.5-7V3z"/><path fill="#0b1018" opacity=".55" d="M7.5 5h1v6h-1z"/>`,
  hex: `<path fill="currentColor" d="M8 1.5 13.5 4.5v7L8 14.5 2.5 11.5v-7z"/><path fill="#0b1018" opacity=".45" d="M8 5 10.5 6.5v3L8 11 5.5 9.5v-3z"/>`,
  horn: `<path fill="currentColor" d="M3 6h7l3-3v10l-3-3H3z"/><path fill="#0b1018" opacity=".4" d="M4 8h5v1H4z"/>`,
  flame: `<path fill="currentColor" d="M8 1c1 3 4 4 4 8a4 4 0 0 1-8 0c0-2 1-3 2-4 0 2 1 3 2 3 0-3-1-5 0-7z"/>`,
};

const SVG_NS = "http://www.w3.org/2000/svg";
const RING_R = 11; // raio do anel (viewBox 26)
const RING_C = 2 * Math.PI * RING_R;

interface Entry {
  id: BuffId;
  endAt: number; // relógio do navegador em que acaba
  total: number; // duração de referência (para o anel)
  stacks: number;
  el: HTMLElement;
  ring: SVGCircleElement;
  secs: HTMLElement;
  count: HTMLElement;
}

export interface BuffStrip {
  set(list: ActiveBuff[]): void;
  /** atualiza anel e segundos (chamado pelo próprio módulo; exposto para testes) */
  refresh(): void;
}

const CSS = `
.bf{display:flex;flex-wrap:wrap;gap:4px;align-items:center;min-height:0;padding-bottom:12px;pointer-events:none} /* a folga embaixo é do texto de segundos, que não cobre o rótulo abaixo */
.bf:empty{display:none}
.hd-buffs:not(:empty)~.hd-buff{display:none} /* a fileira de ícones já diz o que está ativo: o rótulo "Escudo ativo" some para não repetir */
.bf-i{position:relative;width:28px;height:28px;display:grid;place-items:center;pointer-events:auto;touch-action:manipulation;-webkit-tap-highlight-color:transparent;cursor:default}
.bf-svg{position:absolute;inset:0;width:100%;height:100%;transform:rotate(-90deg)}
.bf-ring-bg{fill:rgba(6,9,15,.82);stroke:rgba(122,95,46,.6);stroke-width:1.5}
.bf-ring{fill:none;stroke-width:2.2;stroke-linecap:round;transition:stroke-dashoffset .25s linear}
.bf-glyph{position:relative;width:14px;height:14px;display:block}
.bf-glyph svg{width:100%;height:100%;display:block;shape-rendering:crispEdges}
.bf-secs{position:absolute;left:50%;top:100%;transform:translate(-50%,1px);font:800 9px/1 "Cinzel",Georgia,serif;color:#f0dfb8;text-shadow:0 1px 2px #000;white-space:nowrap;pointer-events:none}
.bf-n{position:absolute;right:-5px;top:-5px;min-width:14px;height:14px;padding:0 3px;border-radius:7px;background:#0d1420;border:1px solid var(--bf-c,#c9a45c);font:800 9px/12px "Cinzel",Georgia,serif;color:#fff4d6;text-align:center;box-shadow:0 0 0 1px #000}
.bf-n:empty{display:none}
.bf-tip{position:absolute;left:0;top:calc(100% + 14px);z-index:30;min-width:150px;max-width:210px;padding:6px 8px;border-radius:6px;background:rgba(8,12,20,.96);border:1px solid var(--bf-c,#c9a45c);box-shadow:0 4px 14px rgba(0,0,0,.6);font:600 11px/1.35 "Segoe UI",system-ui,sans-serif;color:#e9e2cf;pointer-events:none;display:none}
.bf-tip b{display:block;font:700 11px/1.2 "Cinzel",Georgia,serif;letter-spacing:.06em;color:#f0dfb8;margin-bottom:2px}
.bf-i.open .bf-tip{display:block}
.bf-i:last-child .bf-tip{left:auto;right:0}
@media (max-width:520px){.bf-i{width:26px;height:26px}.bf{gap:3px}}
`;

let styled = false;
function injectCss() {
  if (styled) return;
  styled = true;
  const st = document.createElement("style");
  st.textContent = CSS;
  document.head.append(st);
}

const el = (tag: string, cls = "") => {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  return e;
};

/** Monta a fileira dentro de `host` (um contêiner vazio do HUD). */
export function mountBuffs(host: HTMLElement): BuffStrip {
  injectCss();
  host.classList.add("bf");
  const entries = new Map<BuffId, Entry>();

  const build = (id: BuffId): Entry => {
    const def = BUFFS[id];
    const wrap = el("div", "bf-i");
    wrap.style.setProperty("--bf-c", def.color);
    wrap.setAttribute("role", "img");
    wrap.setAttribute("aria-label", def.name);
    const svg = document.createElementNS(SVG_NS, "svg");
    svg.setAttribute("viewBox", "0 0 26 26");
    svg.setAttribute("class", "bf-svg");
    svg.setAttribute("aria-hidden", "true");
    const bg = document.createElementNS(SVG_NS, "circle");
    bg.setAttribute("cx", "13"); bg.setAttribute("cy", "13"); bg.setAttribute("r", String(RING_R));
    bg.setAttribute("class", "bf-ring-bg");
    const ring = document.createElementNS(SVG_NS, "circle");
    ring.setAttribute("cx", "13"); ring.setAttribute("cy", "13"); ring.setAttribute("r", String(RING_R));
    ring.setAttribute("class", "bf-ring");
    ring.setAttribute("stroke", def.color);
    ring.setAttribute("stroke-dasharray", String(RING_C));
    svg.append(bg, ring);
    const glyph = el("span", "bf-glyph");
    glyph.style.color = def.color;
    glyph.innerHTML = `<svg viewBox="0 0 16 16" aria-hidden="true">${GLYPH[def.icon] ?? ""}</svg>`;
    const count = el("span", "bf-n");
    const secs = el("span", "bf-secs");
    const tip = el("div", "bf-tip");
    tip.innerHTML = `<b></b>`;
    tip.querySelector("b")!.textContent = def.name;
    tip.append(document.createTextNode(def.desc));
    wrap.append(svg, glyph, count, secs, tip);
    // tooltip: passar o mouse, ou segurar o dedo (toque longo)
    let timer = 0;
    const open = () => wrap.classList.add("open");
    const close = () => { clearTimeout(timer); wrap.classList.remove("open"); };
    wrap.addEventListener("pointerenter", (e) => { if (e.pointerType === "mouse") open(); });
    wrap.addEventListener("pointerleave", close);
    wrap.addEventListener("pointerdown", (e) => { if (e.pointerType !== "mouse") timer = window.setTimeout(open, 420); });
    wrap.addEventListener("pointerup", close);
    wrap.addEventListener("pointercancel", close);
    wrap.addEventListener("contextmenu", (e) => e.preventDefault()); // o toque longo não abre o menu do navegador
    const entry: Entry = { id, endAt: 0, total: 1, stacks: 0, el: wrap, ring, secs, count };
    host.append(wrap);
    return entry;
  };

  const refresh = () => {
    const now = performance.now();
    for (const e of entries.values()) {
      const left = Math.max(0, (e.endAt - now) / 1000);
      const frac = e.total > 0 ? Math.min(1, left / e.total) : 0;
      e.ring.setAttribute("stroke-dashoffset", String(RING_C * (1 - frac)));
      e.secs.textContent = left >= 10 ? `${Math.ceil(left)}s` : `${left.toFixed(1)}s`;
    }
  };

  const set = (list: ActiveBuff[]) => {
    const now = performance.now();
    const seen = new Set<BuffId>();
    for (const b of list) {
      if (!BUFFS[b.id]) continue; // id desconhecido (servidor mais novo): ignora
      seen.add(b.id);
      let e = entries.get(b.id);
      if (!e) { e = build(b.id); entries.set(b.id, e); e.total = Math.max(0.1, b.ate); }
      const prevLeft = Math.max(0, (e.endAt - now) / 1000);
      // a referência do anel é a duração maior vista enquanto o buff estiver ativo (refrescar sobe a referência)
      e.total = prevLeft > 0 ? Math.max(e.total, b.ate) : Math.max(0.1, b.ate);
      e.endAt = now + Math.max(0, b.ate) * 1000;
      e.stacks = Number(b.stacks) || 0;
      e.count.textContent = e.stacks > 1 ? String(e.stacks) : "";
    }
    for (const [id, e] of entries) {
      if (seen.has(id)) continue;
      e.el.remove();
      entries.delete(id);
    }
    // a ordem da fileira segue a ordem da tabela (estável, sem pular quando um buff entra ou sai)
    const order = Object.keys(BUFFS) as BuffId[];
    for (const id of order) { const e = entries.get(id); if (e) host.append(e.el); }
    refresh();
  };

  window.setInterval(() => { if (entries.size) refresh(); }, 200);
  return { set, refresh };
}
