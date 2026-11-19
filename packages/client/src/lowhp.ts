/**
 * Alerta de vida baixa: com 20% da vida ou menos, uma vinheta vermelha bem leve pulsa nas bordas da tela (~1 Hz, sem flash forte).
 * Com `prefers-reduced-motion` a vinheta fica parada. Fica abaixo da HUD (z-index 14) e não captura toques.
 */
export const LOW_HP_RATIO = 0.2;

const CSS = `
.lh{position:fixed;inset:0;z-index:14;pointer-events:none;opacity:0;visibility:hidden;transition:opacity .4s ease,visibility 0s linear .4s;
  background:radial-gradient(ellipse at 50% 50%,rgba(140,0,12,0) 55%,rgba(170,8,20,.22) 82%,rgba(200,14,26,.42) 100%)}
.lh.on{opacity:1;visibility:visible;transition:opacity .4s ease,visibility 0s;animation:lh-pulse 1s ease-in-out infinite}
@keyframes lh-pulse{0%,100%{opacity:.5}50%{opacity:1}}
@media (prefers-reduced-motion:reduce){.lh.on{animation:none;opacity:.8}}
`;

export interface LowHp {
  /** liga ou desliga a moldura (só mexe no DOM quando o estado muda) */
  set(on: boolean): void;
}

export function mountLowHp(): LowHp {
  const style = document.createElement("style");
  style.textContent = CSS;
  document.head.append(style);
  const el = document.createElement("div");
  el.className = "lh";
  el.setAttribute("aria-hidden", "true");
  document.body.append(el);
  let on = false;
  return {
    set(v) {
      if (v === on) return;
      on = v;
      el.classList.toggle("on", v);
    },
  };
}
