/**
 * Botão "Habilidades" ao lado do menu: reúne Talentos, Variações e Builds (antes escondidos no menu de desconectar).
 * Um ponto verde pulsante chama a atenção quando há algo a fazer (ponto de talento livre, variação nova, build ainda não vista).
 * O botão só LÊ o estado (o servidor continua sendo quem decide); a lista de pendências vem de cada item.
 */
import { isTypingTarget } from "./keys";

export interface UtilItem {
  label: string;
  tecla?: string;
  run(): void;
  /** há algo pendente neste item? (mostra o ponto verde) */
  pendente(): boolean;
  /** o painel deste item está aberto? (conta como "visto") */
  aberto(): boolean;
  /** chamado quando o painel foi aberto: grava que o jogador já viu */
  visto?(): void;
}

const CSS = `
.ut-btn{position:fixed;top:max(14px,env(safe-area-inset-top));right:118px;z-index:20;width:44px;height:44px;border-radius:50%;display:grid;place-items:center;cursor:pointer;color:#bcd8f5;
  background:rgba(8,16,28,.7);border:1px solid rgba(160,200,240,.3);backdrop-filter:blur(6px);-webkit-backdrop-filter:blur(6px);transition:border-color .18s,color .18s,box-shadow .18s}
.ut-btn:hover,.ut-btn:focus-visible{color:#fff;border-color:#ff9a4d;box-shadow:0 0 16px rgba(255,120,40,.35)}
.ut-btn:focus-visible,.ut-item:focus-visible{outline:2px solid #ffd2a3;outline-offset:2px}
.ut-btn svg{width:22px;height:22px}
.ut-dot{position:absolute;width:11px;height:11px;border-radius:50%;background:#3dff7a;border:2px solid #05110a;box-shadow:0 0 0 0 rgba(61,255,122,.7);animation:utPulse 1.4s ease-out infinite;pointer-events:none}
.ut-btn .ut-dot,.tl-plus .ut-dot{top:-3px;right:-3px}
.ut-dot[hidden]{display:none}
.ut-dot.inline{position:static;display:inline-block;flex:none;margin-left:8px;vertical-align:middle}
.ut-dot.inline[hidden]{display:none}
@keyframes utPulse{0%{box-shadow:0 0 0 0 rgba(61,255,122,.75)}70%{box-shadow:0 0 0 9px rgba(61,255,122,0)}100%{box-shadow:0 0 0 0 rgba(61,255,122,0)}}
@media (prefers-reduced-motion:reduce){.ut-dot{animation:none;box-shadow:0 0 6px 2px rgba(61,255,122,.6)}}
.ut-pop{position:fixed;z-index:22;top:calc(max(14px,env(safe-area-inset-top)) + 52px);right:14px;display:none;flex-direction:column;gap:6px;min-width:190px;padding:10px;border-radius:8px;
  background:linear-gradient(180deg,rgba(20,34,52,.97),rgba(6,12,20,.98));border:1px solid rgba(255,150,70,.4);box-shadow:0 12px 34px rgba(0,0,0,.7)}
.ut-pop.open{display:flex}
.ut-item{display:flex;align-items:center;justify-content:space-between;gap:8px;min-height:44px;padding:0 12px;border-radius:5px;cursor:pointer;font:700 13px/1 "Cinzel",Georgia,serif;letter-spacing:.12em;text-transform:uppercase;color:#eaf4ff;
  background:linear-gradient(180deg,rgba(24,40,60,.85),rgba(7,13,22,.92));border:1px solid rgba(255,150,70,.38);touch-action:manipulation}
.ut-item:hover,.ut-item:focus-visible{border-color:#ff9a4d;box-shadow:0 0 16px rgba(255,120,40,.3)}
.ut-item small{font:400 10px/1 Georgia,serif;letter-spacing:.04em;color:#9fc0e0}
`;

const ICON = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3l2.4 5.6 6 .5-4.6 4 1.4 5.9L12 15.8 6.8 19l1.4-5.9-4.6-4 6-.5z"/></svg>`;

/** estilo do ponto verde (também usado dentro dos painéis); injeta o CSS uma vez */
let cssPronto = false;
export function garantirEstiloUtil(): void {
  if (cssPronto || typeof document === "undefined") return;
  cssPronto = true;
  const st = document.createElement("style");
  st.textContent = CSS;
  document.head.append(st);
}
/** cria um ponto verde pulsante (`inline` = dentro de uma linha de texto/botão) */
export function criarPonto(inline = true): HTMLSpanElement {
  garantirEstiloUtil();
  const d = document.createElement("span");
  d.className = "ut-dot" + (inline ? " inline" : "");
  d.setAttribute("aria-hidden", "true");
  return d;
}

export function mountUtilidades(itens: UtilItem[]): { atualiza(): void } {
  garantirEstiloUtil();
  const btn = document.createElement("button");
  btn.type = "button";
  btn.className = "ut-btn";
  btn.setAttribute("aria-label", "Habilidades: talentos, variações e builds");
  btn.setAttribute("aria-haspopup", "menu");
  btn.innerHTML = ICON;
  const ponto = criarPonto(false);
  ponto.hidden = true;
  btn.append(ponto);

  const pop = document.createElement("div");
  pop.className = "ut-pop";
  pop.setAttribute("role", "menu");
  const linhas = itens.map((it) => {
    const b = document.createElement("button");
    b.type = "button";
    b.className = "ut-item";
    b.setAttribute("role", "menuitem");
    const nome = document.createElement("span");
    nome.textContent = it.label;
    if (it.tecla) { const k = document.createElement("small"); k.textContent = ` ${it.tecla}`; nome.append(k); }
    const dot = criarPonto(true);
    dot.hidden = true;
    b.append(nome, dot);
    b.onclick = () => { fechar(); it.run(); setTimeout(atualiza, 150); };
    pop.append(b);
    return { it, dot };
  });
  document.body.append(btn, pop);

  const aberto = () => pop.classList.contains("open");
  function fechar() { pop.classList.remove("open"); }
  btn.onclick = () => { pop.classList.toggle("open"); atualiza(); };
  document.addEventListener("pointerdown", (e) => {
    if (aberto() && !pop.contains(e.target as Node) && !btn.contains(e.target as Node)) fechar();
  });
  window.addEventListener("keydown", (e) => { if (e.key === "Escape" && aberto() && !isTypingTarget()) { e.preventDefault(); fechar(); } });

  function atualiza() {
    let algum = false;
    for (const { it, dot } of linhas) {
      if (it.aberto()) it.visto?.(); // abriu o painel (clique ou tecla): conta como visto
      const p = it.pendente();
      dot.hidden = !p;
      if (p) algum = true;
    }
    ponto.hidden = !algum;
  }
  atualiza();
  window.setInterval(atualiza, 700); // acompanha o servidor (nível, pontos gastos)
  return { atualiza };
}
