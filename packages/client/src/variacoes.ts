import {
  CLASS_DEFS, VARIACAO_SLOTS, VARIACAO_NIVEL, VARIACAO_TEXT, variacoesDaClasse, variacaoDesbloqueada, limparEscolhas,
  type CharClass, type VariacaoSlot, type ActionId,
} from "@frixep/shared";
import { isTypingTarget } from "./keys";

/**
 * Variações de habilidade (C2.2). Painel em lista: as 4 habilidades, o nível de desbloqueio, a base e as 3 variações.
 * Escolher só funciona na cidade (o servidor confere de novo). Fora da cidade o painel mostra o aviso e fica travado.
 * Abre pela tecla V (PC) ou pelo item "Variações" do menu (botão de 3 linhas). O estado vem do servidor (campo variacoes do jogador).
 * Layout: cabeçalho compacto (título e × na mesma linha) e lista com rolagem própria; 2 colunas de cartões em tela
 * larga/horizontal e 1 coluna em celular vertical. Alvos de toque com pelo menos 44px.
 */

export interface VariacoesUi {
  open(): void;
  close(): void;
  toggle(): void;
  isOpen(): boolean;
}

interface VariacoesOpts {
  cls: CharClass;
  /** escolhas e nível atuais (null enquanto o jogador ainda não entrou) */
  estado(): { variacoes: string; level: number } | null;
  /** o jogador está numa zona segura (cidade)? */
  cidade(): boolean;
  /** pede ao servidor a variação (id null = base) */
  escolher(slot: VariacaoSlot, id: string | null): void;
}

const CSS = `
.va-card{width:min(560px,100%)}
.va-card .qst-head{padding:10px 12px 6px 14px}
.va-card .qst-title{font-size:13px;letter-spacing:.16em}
.va-card .qst-x{flex:none;width:44px;height:44px;min-width:44px;min-height:44px}
.va-body{overflow-y:auto;overscroll-behavior:contain;-webkit-overflow-scrolling:touch;min-height:0;padding:0 14px 14px}
.va-sec{margin:10px 0 4px;font:700 12px/1.2 "Cinzel",Georgia,serif;letter-spacing:.12em;text-transform:uppercase;color:#ffb072;border-bottom:1px solid rgba(255,150,70,.25);padding-bottom:4px}
.va-sec small{margin-left:8px;font:400 11px/1 Georgia,serif;letter-spacing:0;text-transform:none;color:#9fc0e0}
.va-sec.lock{color:#7d93ad}
.va-opts{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:6px}
.va-opt{text-align:left;min-height:44px;padding:6px 8px;border-radius:6px;cursor:pointer;background:rgba(8,14,24,.7);color:#e9dcc0;border:1px solid rgba(160,200,240,.22);font:400 12px/1.3 Georgia,serif;touch-action:manipulation;overflow-wrap:anywhere}
.va-opt b{display:block;font:700 12px/1.2 "Cinzel",Georgia,serif;color:#f0dfb8}
.va-opt span{display:block;color:#9fc0e0;font-size:11px}
.va-opt.on{border-color:#ffd27a;box-shadow:inset 0 0 0 1px rgba(255,210,122,.5)}
.va-opt:disabled{opacity:.5;cursor:default}
.va-opt:not(:disabled):hover,.va-opt:not(:disabled):focus-visible{border-color:#ffb072;outline:none}
.va-aviso{margin:6px 0 0;font:700 12px/1.35 Georgia,serif;color:#ffd08a}
.va-aviso.ok{color:#9fe0a8}
@media (max-width:620px){.va-opts{grid-template-columns:1fr}}
@media (max-height:500px){.va-sec{margin-top:8px}.va-card .qst-head{padding-top:6px;padding-bottom:4px}}
`;

const el = <K extends keyof HTMLElementTagNameMap>(tag: K, cls = "", text = ""): HTMLElementTagNameMap[K] => {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text) e.textContent = text;
  return e;
};

const TECLA: Record<VariacaoSlot, string> = { skill1: "Q", skill2: "W", skill3: "E", ultimate: "R" };
const ACAO: Record<VariacaoSlot, ActionId> = { skill1: "skill1", skill2: "skill2", skill3: "skill3", ultimate: "ultimate" };

export function mountVariacoes(opts: VariacoesOpts): VariacoesUi {
  const style = el("style");
  style.textContent = CSS;
  document.head.append(style);

  const back = el("div", "qst-back va-back");
  const card = el("div", "qst-card va-card");
  card.setAttribute("role", "dialog");
  card.setAttribute("aria-modal", "true");
  card.setAttribute("aria-label", "Variações de habilidade");
  back.append(card);
  document.body.append(back);

  let aberto = false;
  let timer: number | undefined;

  function render() {
    const st = opts.estado();
    const rolagem = (card.querySelector(".va-body") as HTMLElement | null)?.scrollTop ?? 0; // o painel se redesenha a cada 700 ms: mantém a posição da lista
    card.replaceChildren();

    // cabeçalho compacto: título e × na mesma linha (fica fixo; só o corpo rola)
    const topo = el("div", "qst-head");
    topo.append(el("h2", "qst-title", "Variações de habilidade"));
    const x = el("button", "qst-x", "×");
    x.type = "button";
    x.setAttribute("aria-label", "Fechar");
    x.addEventListener("click", close);
    topo.append(x);

    const corpo = el("div", "va-body");
    const cidade = opts.cidade();
    corpo.append(el("p", "va-aviso" + (cidade ? " ok" : ""), cidade
      ? "Você está na cidade: pode trocar à vontade, sem custo."
      : "Só dá para trocar na cidade (Brasalume). Volte para lá para escolher."));

    const level = st?.level ?? 1;
    const escolhas = limparEscolhas(st?.variacoes, opts.cls, level);
    for (const slot of VARIACAO_SLOTS) {
      const liberada = variacaoDesbloqueada(slot, level);
      const nomeHab = CLASS_DEFS[opts.cls].actions[ACAO[slot]]?.name ?? slot;
      const sec = el("div", "va-sec" + (liberada ? "" : " lock"));
      sec.append(`${TECLA[slot]} · ${nomeHab}`);
      sec.append(el("small", "", liberada ? "" : `libera no nível ${VARIACAO_NIVEL[slot]}`));
      corpo.append(sec);

      const grade = el("div", "va-opts");
      const opcoes: { id: string | null; nome: string; txt: string }[] = [
        { id: null, nome: "Base", txt: "A habilidade como é." },
        ...variacoesDaClasse(opts.cls).filter((v) => v.slot === slot).map((v) => ({ id: v.id, nome: v.nome, txt: VARIACAO_TEXT[v.id] ?? "" })),
      ];
      for (const o of opcoes) {
        const atual = (escolhas[slot] ?? null) === o.id;
        const b = el("button", "va-opt" + (atual ? " on" : ""));
        b.type = "button";
        b.disabled = !liberada || !cidade || atual;
        b.append(el("b", "", o.nome), el("span", "", o.txt));
        b.setAttribute("aria-pressed", String(atual));
        b.addEventListener("click", () => { opts.escolher(slot, o.id); setTimeout(render, 250); });
        grade.append(b);
      }
      corpo.append(grade);
    }
    card.append(topo, corpo);
    corpo.scrollTop = rolagem;
  }

  function open() {
    if (aberto) return;
    aberto = true;
    back.classList.add("open");
    render();
    timer = window.setInterval(render, 700); // acompanha o servidor (escolha confirmada, nível, cidade)
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
    if (e.code !== "KeyV" || e.repeat || isTypingTarget()) return;
    if (aberto) close(); else open();
  });

  return { open, close, toggle: () => (aberto ? close() : open()), isOpen: () => aberto };
}
