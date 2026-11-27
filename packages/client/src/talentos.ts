import {
  TALENTO_RAMOS, TALENTO_PORTA, talentosDaClasse, talentoEfeitoTexto, limparTalentos, podeSubirTalento, pontosLivres, pontosNoRamo, pontosGastos,
  resetCusto, type CharClass, type EscolhasTalentos, type RamoIdx,
} from "@frixep/shared";
import { isTypingTarget } from "./keys";
import { criarPonto } from "./utilidades";

/**
 * Talentos (C2.3). Painel em LISTA (sem árvore gráfica): 3 abas, uma por ramo da classe; em cada aba, os 4 talentos
 * com o efeito por rank, o nível do talento (a porta exige 3 ou 6 pontos no ramo), os ranks e o botão +.
 * O servidor decide tudo (pontos, máximo, porta, reset na cidade e tostões); o painel só mostra e pede.
 * Gastar vale em qualquer lugar; o reset (zerar tudo) só na cidade e pagando tostões.
 * Abre pela tecla T (PC) ou pelo item "Talentos" do menu. Layout: cabeçalho compacto, abas que quebram linha,
 * lista com rolagem própria; 2 colunas de cartões em tela larga e 1 em celular vertical. Alvos de toque com pelo menos 44px.
 */

export interface TalentosUi {
  open(): void;
  close(): void;
  toggle(): void;
  isOpen(): boolean;
}

interface TalentosOpts {
  cls: CharClass;
  /** escolhas, resets e nível atuais (null enquanto o jogador ainda não entrou) */
  estado(): { talentos: string; resets: number; level: number } | null;
  /** o jogador está numa zona segura (cidade)? */
  cidade(): boolean;
  /** pede ao servidor +1 rank no talento */
  subir(id: string): void;
  /** pede ao servidor o reset de todos os talentos (só na cidade, pagando tostões) */
  resetar(): void;
}

const CSS = `
.tl-card{width:min(600px,100%)}
.tl-card .qst-head{padding:10px 12px 6px 14px}
.tl-card .qst-title{font-size:13px;letter-spacing:.16em}
.tl-card .qst-x{flex:none;width:44px;height:44px;min-width:44px;min-height:44px}
.tl-pts{margin-left:auto;margin-right:8px;font:700 12px/1 "Cinzel",Georgia,serif;letter-spacing:.06em;color:#ffd27a;white-space:nowrap}
.tl-pts.zero{color:#7d93ad}
.tl-tabs{display:flex;flex-wrap:wrap;gap:6px;padding:0 14px 8px}
.tl-tab{flex:1 1 0;min-width:120px;min-height:44px;padding:6px 8px;border-radius:6px;cursor:pointer;background:rgba(8,14,24,.7);color:#e9dcc0;border:1px solid rgba(160,200,240,.22);font:700 12px/1.2 "Cinzel",Georgia,serif;letter-spacing:.06em;touch-action:manipulation}
.tl-tab.on{border-color:#ffd27a;box-shadow:inset 0 0 0 1px rgba(255,210,122,.5);color:#ffe9b0}
.tl-tab:focus-visible{outline:none;border-color:#ffb072}
.tl-desc{margin:0 14px 6px;font:400 12px/1.35 Georgia,serif;color:#9fc0e0}
.tl-body{overflow-y:auto;overscroll-behavior:contain;-webkit-overflow-scrolling:touch;min-height:0;padding:0 14px 10px}
.tl-list{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:6px}
.tl-row{display:flex;flex-direction:column;gap:4px;padding:8px;border-radius:6px;background:rgba(8,14,24,.7);border:1px solid rgba(160,200,240,.22);min-width:0}
.tl-row.lock{opacity:.6}
.tl-row.max{border-color:rgba(255,210,122,.45)}
.tl-top{display:flex;align-items:baseline;gap:6px;min-width:0}
.tl-name{font:700 12px/1.2 "Cinzel",Georgia,serif;color:#f0dfb8;overflow-wrap:anywhere;flex:1 1 auto;min-width:0}
.tl-tier{flex:none;font:400 10px/1 Georgia,serif;color:#9fc0e0;letter-spacing:.04em}
.tl-eff{font:400 11px/1.3 Georgia,serif;color:#c6d8ea}
.tl-foot{display:flex;align-items:center;gap:8px;margin-top:2px}
.tl-rank{flex:1 1 auto;font:700 12px/1 Georgia,serif;color:#ffd27a;font-variant-numeric:tabular-nums}
.tl-plus{flex:none;min-width:44px;min-height:44px;padding:0 10px;border-radius:6px;cursor:pointer;background:#2a1f10;color:#ffe9b0;border:1px solid #ffb072;font:700 18px/1 Georgia,serif;touch-action:manipulation}
.tl-plus:disabled{opacity:.4;cursor:default;border-color:rgba(160,200,240,.3);color:#9fc0e0}
.tl-plus:not(:disabled):hover,.tl-plus:not(:disabled):focus-visible{border-color:#ffd27a;outline:none}
.tl-req{font:400 11px/1.3 Georgia,serif;color:#ffb072}
.tl-rodape{display:flex;flex-wrap:wrap;align-items:center;gap:8px;padding:8px 14px 12px;border-top:1px solid rgba(255,150,70,.25)}
.tl-aviso{flex:1 1 220px;margin:0;font:400 12px/1.35 Georgia,serif;color:#ffd08a}
.tl-reset{flex:none;min-height:44px;padding:6px 12px;border-radius:6px;cursor:pointer;background:#2a1010;color:#ffd0c0;border:1px solid #c0604a;font:700 12px/1.2 "Cinzel",Georgia,serif;touch-action:manipulation}
.tl-reset:disabled{opacity:.45;cursor:default}
.tl-reset:not(:disabled):hover,.tl-reset:not(:disabled):focus-visible{border-color:#ff9a7a;outline:none}
@media (max-width:620px){.tl-list{grid-template-columns:1fr}.tl-tab{min-width:0}}
@media (max-height:500px){.tl-card .qst-head{padding-top:6px;padding-bottom:4px}.tl-tabs{padding-bottom:4px}.tl-desc{margin-bottom:4px}}
`;

const el = <K extends keyof HTMLElementTagNameMap>(tag: K, cls = "", text = ""): HTMLElementTagNameMap[K] => {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text) e.textContent = text;
  return e;
};

const TIER_TXT: Record<1 | 2 | 3, string> = { 1: "nível 1", 2: "nível 2", 3: "nível 3" };

export function mountTalentos(opts: TalentosOpts): TalentosUi {
  const style = el("style");
  style.textContent = CSS;
  document.head.append(style);

  const back = el("div", "qst-back tl-back");
  const card = el("div", "qst-card tl-card");
  card.setAttribute("role", "dialog");
  card.setAttribute("aria-modal", "true");
  card.setAttribute("aria-label", "Talentos");
  back.append(card);
  document.body.append(back);

  let aberto = false;
  let timer: number | undefined;
  let ramo: RamoIdx = 0; // aba escolhida (só o painel guarda; o estado de verdade é do servidor)

  function render() {
    const st = opts.estado();
    const rolagem = (card.querySelector(".tl-body") as HTMLElement | null)?.scrollTop ?? 0; // o painel se redesenha a cada 700 ms: mantém a posição
    card.replaceChildren();
    const level = st?.level ?? 1;
    const esc: EscolhasTalentos = limparTalentos(st?.talentos, opts.cls, level);
    const livres = pontosLivres(esc, opts.cls, level);
    const cidade = opts.cidade();
    const ramos = TALENTO_RAMOS[opts.cls];

    // cabeçalho: título, pontos livres e × na mesma linha
    const topo = el("div", "qst-head");
    topo.append(el("h2", "qst-title", "Talentos"));
    topo.append(el("span", "tl-pts" + (livres > 0 ? "" : " zero"), livres > 0 ? `${livres} ponto${livres === 1 ? "" : "s"} livre${livres === 1 ? "" : "s"}` : "Sem pontos livres"));
    const x = el("button", "qst-x", "×");
    x.type = "button";
    x.setAttribute("aria-label", "Fechar");
    x.addEventListener("click", close);
    topo.append(x);

    // abas: um ramo por vez
    const abas = el("div", "tl-tabs");
    abas.setAttribute("role", "tablist");
    ramos.forEach((r, i) => {
      const b = el("button", "tl-tab" + (i === ramo ? " on" : ""), r.nome);
      b.type = "button";
      if (livres > 0 && talentosDaClasse(opts.cls).some((t) => t.ramo === i && podeSubirTalento(esc, opts.cls, level, t.id).ok)) b.append(criarPonto()); // ramo com talento que dá para subir
      b.setAttribute("role", "tab");
      b.setAttribute("aria-selected", String(i === ramo));
      b.addEventListener("click", () => { ramo = i as RamoIdx; render(); });
      abas.append(b);
    });

    const corpo = el("div", "tl-body");
    corpo.append(el("p", "tl-desc", ramos[ramo].descricao + ` Gastos no ramo: ${pontosNoRamo(esc, opts.cls, ramo)}.`));
    const lista = el("div", "tl-list");
    for (const t of talentosDaClasse(opts.cls).filter((x) => x.ramo === ramo)) {
      const rank = esc[t.id] ?? 0;
      const maximo = rank >= t.max;
      const pode = podeSubirTalento(esc, opts.cls, level, t.id);
      const falta = TALENTO_PORTA[t.tier] - pontosNoRamo(esc, opts.cls, ramo);
      const row = el("div", "tl-row" + (maximo ? " max" : "") + (falta > 0 && rank === 0 ? " lock" : ""));
      const top = el("div", "tl-top");
      top.append(el("span", "tl-name", t.nome), el("span", "tl-tier", TIER_TXT[t.tier]));
      row.append(top, el("span", "tl-eff", talentoEfeitoTexto(t) + ` · máx. ${t.max}`));
      if (falta > 0 && rank === 0) row.append(el("span", "tl-req", `Exige ${TALENTO_PORTA[t.tier]} pontos no ramo (faltam ${falta})`));
      const pe = el("div", "tl-foot");
      pe.append(el("span", "tl-rank", `${rank}/${t.max}`), el("span", "tl-eff", `${t.custo} pt por rank`));
      const mais = el("button", "tl-plus", "+");
      mais.type = "button";
      mais.disabled = !pode.ok;
      mais.title = pode.ok ? `Gastar 1 ponto em ${t.nome}` : pode.error;
      mais.setAttribute("aria-label", `Subir ${t.nome}`);
      if (pode.ok) { mais.style.position = "relative"; mais.append(criarPonto(false)); } // ponto verde pulsante no + que dá para usar
      mais.addEventListener("click", () => { opts.subir(t.id); setTimeout(render, 250); });
      pe.append(mais);
      row.append(pe);
      lista.append(row);
    }
    corpo.append(lista);

    // rodapé: reset (só na cidade, com o custo em tostões)
    const gastos = pontosGastos(esc, opts.cls);
    const rodape = el("div", "tl-rodape");
    const custo = resetCusto(st?.resets ?? 0);
    rodape.append(el("p", "tl-aviso", cidade
      ? (gastos > 0 ? `Resetar zera todos os talentos. Custa ${custo} tostões.` : "Nenhum talento gasto para resetar.")
      : "Só dá para resetar na cidade (Brasalume)."));
    const reset = el("button", "tl-reset", `Resetar (${custo} tostões)`);
    reset.type = "button";
    reset.disabled = !cidade || gastos === 0;
    reset.addEventListener("click", () => { opts.resetar(); setTimeout(render, 250); });
    rodape.append(reset);

    card.append(topo, abas, corpo, rodape);
    corpo.scrollTop = rolagem;
  }

  function open() {
    if (aberto) return;
    aberto = true;
    back.classList.add("open");
    render();
    timer = window.setInterval(render, 700); // acompanha o servidor (ponto gasto, nível, cidade)
    (card.querySelector(".qst-x") as HTMLElement | null)?.focus({ preventScroll: true });
  }
  function close() {
    if (!aberto) return;
    aberto = false;
    back.classList.remove("open");
    if (timer !== undefined) window.clearInterval(timer);
    timer = undefined;
  }

  back.addEventListener("click", (e) => { if (e.target === back) close(); });
  window.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && aberto) { e.preventDefault(); return close(); }
    if (e.code !== "KeyT" || e.repeat || isTypingTarget()) return;
    if (aberto) close(); else open();
  });

  return { open, close, toggle: () => (aberto ? close() : open()), isOpen: () => aberto };
}
