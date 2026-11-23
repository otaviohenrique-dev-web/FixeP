/**
 * Altura real visível no celular. `100vh` ignora as barras do navegador e corta painéis; aqui medimos o visualViewport e
 * publicamos --vh/--vw no :root. Todos os painéis modais usam essas variáveis (regras abaixo), com rolagem interna no corpo
 * e cabeçalho/rodapé sempre à vista. Também impede puxar-para-recarregar e zoom por duplo toque sobre o jogo.
 */
export function viewSize(): { w: number; h: number } {
  const vv = window.visualViewport;
  return { w: Math.round(vv?.width ?? innerWidth), h: Math.round(vv?.height ?? innerHeight) };
}

const CSS = `
:root{--vh:100dvh;--vw:100vw}
html,body{position:fixed;inset:0;width:100%;height:var(--vh);margin:0;overflow:hidden;overscroll-behavior:none;touch-action:manipulation;-webkit-text-size-adjust:100%}
#game,#game canvas{touch-action:none;-webkit-touch-callout:none;user-select:none;-webkit-user-select:none}
.vt-back,.ec-back,.iv-back,.gm-back{inset:auto!important;top:0!important;left:0!important;width:100%!important;height:var(--vh)!important;box-sizing:border-box;
  padding:max(8px,env(safe-area-inset-top)) max(8px,env(safe-area-inset-right)) max(8px,env(safe-area-inset-bottom)) max(8px,env(safe-area-inset-left))!important;overscroll-behavior:contain}
.vt-card,.ec-card,.iv-card,.gm-card{max-height:100%!important;min-height:0;box-sizing:border-box}
.mk-card{height:min(640px,100%)!important}
.vt-card,.ec-card,.iv-card{display:flex!important;flex-direction:column;overflow:hidden!important}
.vt-head,.ec-head,.iv-head{flex:none;position:relative;z-index:2}
.iv-body{flex:1 1 auto;min-height:0;overflow-y:auto;overscroll-behavior:contain;-webkit-overflow-scrolling:touch}
.vt-body,.ec-list,.ec-cols,.ec-bagwrap,.gm-card{overscroll-behavior:contain;-webkit-overflow-scrolling:touch}
.ec-cols,.ec-bagwrap{min-height:0}
.gm-card{overflow-y:auto}
.gm-item[hidden]{display:none!important}
.vt-body::-webkit-scrollbar,.ec-list::-webkit-scrollbar,.iv-body::-webkit-scrollbar{width:4px}
@media (max-height:480px){.vt-head,.ec-head{padding-top:6px;padding-bottom:4px}.gm-card{padding:12px 16px}.gm-item{min-height:40px;margin-top:6px}.gm-who{margin-bottom:8px}}
/* celular (retrato e paisagem): leiloeiro, comerciante e baú rolam como um só painel. Antes, o cabeçalho, os filtros e o
   rodapé dividiam a altura curta da tela e a lista (ou o rodapé com a paginação) ficava cortada sem rolagem. */
@media (max-width:620px),(max-height:500px){
  .ec-card.mk-card,.ec-card,.vt-card{overflow-y:auto!important;overscroll-behavior:contain;-webkit-overflow-scrolling:touch}
  .ec-card>*,.vt-card>*{flex:none!important}
  .ec-card .ec-list,.vt-card .vt-body{overflow:visible!important;min-height:0}
}
`;

function apply() {
  const { w, h } = viewSize();
  const r = document.documentElement.style;
  r.setProperty("--vh", `${h}px`);
  r.setProperty("--vw", `${w}px`);
}

const st = document.createElement("style");
st.textContent = CSS;
document.head.appendChild(st);
apply();
for (const t of ["resize", "orientationchange"]) window.addEventListener(t, () => { apply(); setTimeout(apply, 250); });
window.visualViewport?.addEventListener("resize", apply);
// zoom por gesto de pinça (iOS) e duplo toque
for (const t of ["gesturestart", "gesturechange"]) document.addEventListener(t, (e) => e.preventDefault());
let lastTouch = 0;
document.addEventListener("touchend", (e) => {
  const n = Date.now();
  const el = e.target as HTMLElement | null;
  if (n - lastTouch < 300 && !(el && el.closest("input,textarea,select"))) e.preventDefault();
  lastTouch = n;
}, { passive: false });
