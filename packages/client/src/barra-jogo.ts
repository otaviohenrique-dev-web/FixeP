/**
 * Atalhos de jogo (Diário, Mochila, Talentos, Variações, Builds): uma barra com ícone e tecla no computador,
 * no topo, no meio da tela. No celular a mesma lista aparece na seção "Jogo" do menu ☰ (a gaveta).
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
.jg-bar{position:fixed;top:max(14px,env(safe-area-inset-top));left:50%;transform:translateX(-50%);z-index:20;display:flex;gap:8px;padding:5px 8px;border-radius:12px;
  background:linear-gradient(180deg,rgba(20,34,52,.9),rgba(6,12,20,.92));border:1px solid rgba(255,150,70,.4);box-shadow:0 8px 22px rgba(0,0,0,.55),inset 0 1px 0 rgba(180,220,255,.12)}
.jg-btn{position:relative;width:44px;height:44px;border-radius:8px;display:grid;place-items:center;cursor:pointer;color:#cfe3f8;padding:0;
  background:linear-gradient(180deg,rgba(24,40,60,.9),rgba(8,14,24,.95));border:1px solid rgba(255,150,70,.35);transition:border-color .18s,box-shadow .18s,color .18s}
.jg-btn svg{width:23px;height:23px}
.jg-btn:hover,.jg-btn:focus-visible{color:#fff;border-color:#ff9a4d;box-shadow:0 0 16px rgba(255,120,40,.35)}
.jg-btn:focus-visible{outline:2px solid #ffd2a3;outline-offset:2px}
.jg-btn.on{border-color:#ffd45e;box-shadow:inset 0 0 0 1px rgba(255,212,94,.55),0 0 12px rgba(255,200,90,.3);color:#fff6dc}
.jg-key{position:absolute;right:-5px;bottom:-5px;min-width:17px;height:16px;padding:0 4px;border-radius:4px;font:700 10px/16px "Cinzel",Georgia,serif;text-align:center;color:#ffd9a8;background:#1a0f08;border:1px solid rgba(255,150,70,.7);pointer-events:none}
.jg-btn .ut-dot{position:absolute;top:-4px;right:-4px}
body.mob .jg-bar{display:none}
/* tela estreita (celular, mesmo sem toque detectado): a barra disputaria o canto da HUD; os atalhos ficam no menu ☰ */
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

  const linhas = itens.map((it) => {
    const b = document.createElement("button");
    b.type = "button";
    b.className = "jg-btn";
    b.title = `${it.label} (${it.tecla})`;
    b.setAttribute("aria-label", it.label);
    b.setAttribute("aria-keyshortcuts", it.tecla);
    b.innerHTML = svg(it.icone);
    const tecla = document.createElement("span");
    tecla.className = "jg-key";
    tecla.textContent = it.tecla;
    const dot = criarPonto(false);
    dot.hidden = true;
    b.append(tecla, dot);
    b.onclick = () => { it.run(); setTimeout(atualiza, 150); };
    barra.append(b);
    return { it, b, dot };
  });
  document.body.append(barra);

  function atualiza() {
    for (const { it, b, dot } of linhas) {
      const aberto = it.aberto?.() ?? false;
      if (aberto) it.visto?.(); // abriu o painel (clique ou tecla): conta como visto
      b.classList.toggle("on", aberto);
      b.setAttribute("aria-pressed", String(aberto));
      dot.hidden = !(it.pendente?.() ?? false);
    }
  }
  atualiza();
  window.setInterval(atualiza, 700); // acompanha o servidor (nível, pontos gastos)
  return { atualiza };
}
