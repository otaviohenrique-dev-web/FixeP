/**
 * Atalhos de jogo (Diário, Mochila, Talentos, Variações, Builds): no computador, ícones redondos discretos no canto
 * superior direito, ao lado do ☰, com uma seta que recolhe/expande (a escolha fica salva). A tecla aparece na dica. No celular a mesma lista aparece na seção "Jogo" do menu ☰ (a gaveta).
 * Um ponto verde pulsante aparece no atalho que tem algo pendente. Cada atalho só LÊ o estado do seu painel.
 */
import { criarPonto, garantirEstiloUtil } from "./utilidades";

export interface AtalhoJogo {
  label: string;
  tecla: string; // tecla do teclado (J, I, T, V, B...) que o módulo já trata
  icone: string; // conteúdo SVG (sem <svg>), viewBox 0 0 24 24
  run(): void;
  /** o painel deste atalho está aberto? (realça o botão) */
  aberto?(): boolean;
  /** há algo pendente neste atalho? (mostra o ponto verde) */
  pendente?(): boolean;
  /** chamado quando o painel foi aberto: grava que o jogador já viu */
  visto?(): void;
}

const CSS = `
/* computador: fileira discreta de ícones redondos no canto superior direito, ao lado do ☰ (estilo Albion); a seta recolhe e expande */
.jg-bar{position:fixed;top:calc(max(14px,env(safe-area-inset-top)) + 5px);right:66px;z-index:20;display:flex;align-items:center;gap:6px;pointer-events:none}
.jg-list{display:flex;gap:6px;overflow:hidden;max-width:260px;transition:max-width .22s ease,opacity .18s ease}
.jg-bar.rec .jg-list{max-width:0;opacity:0}
.jg-btn{pointer-events:auto;position:relative;flex:none;width:34px;height:34px;border-radius:50%;display:grid;place-items:center;cursor:pointer;color:#e2c98e;padding:0;
  background:radial-gradient(circle at 50% 35%,rgba(40,52,72,.92),rgba(10,15,24,.92));border:1.5px solid rgba(201,164,92,.55);box-shadow:0 2px 6px rgba(0,0,0,.55);
  opacity:.82;transition:opacity .15s,border-color .15s,box-shadow .15s,color .15s}
.jg-btn svg{width:17px;height:17px}
.jg-btn:hover,.jg-btn:focus-visible{opacity:1;color:#fff3cf;border-color:#f0cf86;box-shadow:0 0 10px rgba(240,200,120,.35)}
.jg-btn:focus-visible{outline:2px solid #ffd2a3;outline-offset:2px}
.jg-btn.on{opacity:1;color:#fff6dc;border-color:#ffd45e;box-shadow:0 0 10px rgba(255,200,90,.4)}
.jg-btn .ut-dot{position:absolute;top:-3px;right:-3px}
.jg-tog{position:relative;pointer-events:auto;flex:none;width:22px;height:22px;padding:0;border-radius:50%;border:1px solid rgba(201,164,92,.5);background:rgba(10,15,24,.75);cursor:pointer;color:#e2c98e;opacity:.85;display:grid;place-items:center;box-shadow:0 1px 4px rgba(0,0,0,.5)}
.jg-tog:hover,.jg-tog:focus-visible{opacity:1;color:#f0cf86}
.jg-tog svg{width:13px;height:13px;transition:transform .2s}
.jg-bar.rec .jg-tog svg{transform:rotate(180deg)}
.jg-tog .ut-dot{position:absolute;top:-4px;right:-4px}
body.mob .jg-bar{display:none}
/* tela estreita (celular, mesmo sem toque detectado): os atalhos ficam no menu ☰ */
@media (max-width:620px){.jg-bar{display:none}}
/* os botões da bolsa e de Habilidades saíram do topo: ficam na barra (teclas I, T, V e B continuam valendo) */
.iv-btn,.ut-btn{display:none!important}
`;

const ICONE_DIARIO = `<path d="M5 4h10a3 3 0 0 1 3 3v13H8a3 3 0 0 1-3-3z"/><path d="M5 17a3 3 0 0 1 3-3h10"/><path d="M9 8h5"/>`;
const ICONE_MOCHILA = `<path d="M6 9h12l1 11H5z"/><path d="M9 9V6a3 3 0 0 1 6 0v3"/><path d="M9 13v3M15 13v3"/>`;
const ICONE_TALENTO = `<path d="M12 3l2.4 5.6 6 .5-4.6 4 1.4 5.9L12 15.8 6.8 19l1.4-5.9-4.6-4 6-.5z"/>`;
const ICONE_VARIACAO = `<path d="M12 3l8 9-8 9-8-9z"/><path d="M4 12h16"/>`;
const ICONE_BUILD = `<path d="M6 4h9l3 3v13H6z"/><path d="M9 11h6M9 15h6M9 7h3"/>`;

/** ícones dos atalhos de jogo, reaproveitados pelo menu */
export const ICONES_JOGO = { diario: ICONE_DIARIO, mochila: ICONE_MOCHILA, talento: ICONE_TALENTO, variacao: ICONE_VARIACAO, build: ICONE_BUILD };

const REC_KEY = "frixep.atalhos.rec";
let cssPronto = false;
function garantirCss() {
  if (cssPronto || typeof document === "undefined") return;
  cssPronto = true;
  garantirEstiloUtil();
  const st = document.createElement("style");
  st.textContent = CSS;
  document.head.append(st);
}

const svg = (inner: string) => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${inner}</svg>`;

/** monta a barra (computador) e mantém o ponto verde e o realce em dia, como o botão Habilidades fazia */
export function mountBarraJogo(itens: AtalhoJogo[]): { atualiza(): void } {
  garantirCss();
  const barra = document.createElement("nav");
  barra.className = "jg-bar";
  barra.setAttribute("aria-label", "Atalhos de jogo");
  const lista = document.createElement("div");
  lista.className = "jg-list";
  lista.id = "jg-list";

  const linhas = itens.map((it) => {
    const b = document.createElement("button");
    b.type = "button";
    b.className = "jg-btn";
    b.title = `${it.label} (${it.tecla})`;
    b.setAttribute("aria-label", it.label);
    b.setAttribute("aria-keyshortcuts", it.tecla);
    b.innerHTML = svg(it.icone);
    const dot = criarPonto(false);
    dot.hidden = true;
    b.append(dot);
    b.addEventListener("pointerdown", (e) => e.stopPropagation()); // não repassa o clique ao jogo
    b.onclick = () => { it.run(); setTimeout(atualiza, 150); };
    lista.append(b);
    return { it, b, dot };
  });

  // seta que recolhe/expande a fileira (lembrada entre sessões)
  let recolhida = (() => { try { return localStorage.getItem(REC_KEY) === "1"; } catch { return false; } })();
  const tog = document.createElement("button");
  tog.type = "button";
  tog.className = "jg-tog";
  tog.setAttribute("aria-controls", "jg-list");
  tog.innerHTML = svg(`<path d="M9 6l6 6-6 6"/>`);
  tog.addEventListener("pointerdown", (e) => e.stopPropagation());
  const togDot = criarPonto(false); // recolhida: o ponto verde de qualquer atalho aparece na seta
  togDot.hidden = true;
  tog.append(togDot);
  const aplicar = () => {
    barra.classList.toggle("rec", recolhida);
    lista.toggleAttribute("inert", recolhida);
    tog.setAttribute("aria-expanded", String(!recolhida));
    tog.title = tog.ariaLabel = recolhida ? "Mostrar atalhos" : "Recolher atalhos";
    atualizaPonto();
  };
  const atualizaPonto = () => { togDot.hidden = !(recolhida && linhas.some(({ dot }) => !dot.hidden)); };
  tog.onclick = () => {
    recolhida = !recolhida;
    try { localStorage.setItem(REC_KEY, recolhida ? "1" : "0"); } catch { /* sem armazenamento */ }
    aplicar();
  };
  aplicar();
  barra.append(tog, lista);
  document.body.append(barra);

  function atualiza() {
    for (const { it, b, dot } of linhas) {
      const aberto = it.aberto?.() ?? false;
      if (aberto) it.visto?.(); // abriu o painel (clique ou tecla): conta como visto
      b.classList.toggle("on", aberto);
      b.setAttribute("aria-pressed", String(aberto));
      dot.hidden = !(it.pendente?.() ?? false);
    }
    atualizaPonto();
  }
  atualiza();
  window.setInterval(atualiza, 700); // acompanha o servidor (nível, pontos gastos)
  return { atualiza };
}
