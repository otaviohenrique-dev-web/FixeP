import { LOADOUT_SLOTS, LOADOUT_NOME_MAX, limparLoadouts, resumoLoadout, resumoEquip, validarLoadout, type CharClass, type Loadouts } from "@frixep/shared";
import { isTypingTarget } from "./keys";

/**
 * Builds (C2.4). Até 3 slots por personagem; cada um guarda as variações de habilidade (C2.2) e os talentos (C2.3),
 * com nome editável. Três cartões: nome, resumo, e os botões Salvar (grava o que está equipado agora) e Aplicar
 * (troca tudo de uma vez, sem custo). Salvar e aplicar só na cidade e fora de combate; o servidor decide e recusa com o motivo.
 * Abre pela tecla B (PC) ou pelo item "Builds" do menu. Três colunas em tela larga (700 px de largura ou mais),
 * uma coluna em celular vertical. Os cartões ficam na mesma ordem e a lista rola sozinha em tela baixa.
 */

export interface BuildsUi {
  open(): void;
  close(): void;
  toggle(): void;
  isOpen(): boolean;
}

interface BuildsOpts {
  cls: CharClass;
  /** builds guardados e nível atual (null enquanto o jogador ainda não entrou) */
  estado(): { loadouts: string; level: number } | null;
  /** o jogador está numa zona segura (cidade)? */
  cidade(): boolean;
  salvar(slot: number): void;
  aplicar(slot: number): void;
  renomear(slot: number, nome: string): void;
  salvarEquip(slot: number): void;
  aplicarEquip(slot: number): void;
}

interface SlotUi {
  nome: HTMLInputElement;
  tag: HTMLElement;
  resumo: HTMLUListElement;
  erro: HTMLElement;
  salvar: HTMLButtonElement;
  aplicar: HTMLButtonElement;
  salvarEq: HTMLButtonElement;
  aplicarEq: HTMLButtonElement;
}

const CSS = `
.bd-card{width:min(760px,100%)}
.bd-card .qst-head{padding:10px 12px 6px 14px}
.bd-card .qst-title{font-size:13px;letter-spacing:.16em}
.bd-card .qst-x{flex:none;width:44px;height:44px;min-width:44px;min-height:44px}
.bd-em{margin-left:auto;margin-right:8px;font:700 12px/1 "Cinzel",Georgia,serif;letter-spacing:.06em;color:#ffd27a;white-space:nowrap;max-width:45%;overflow:hidden;text-overflow:ellipsis}
.bd-body{overflow-y:auto;overscroll-behavior:contain;-webkit-overflow-scrolling:touch;min-height:0;padding:0 14px 10px}
.bd-desc{margin:0 0 8px;font:400 12px/1.35 Georgia,serif;color:#9fc0e0}
.bd-grade{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:8px}
.bd-slot{display:flex;flex-direction:column;gap:6px;padding:10px;border-radius:8px;background:rgba(8,14,24,.7);border:1px solid rgba(160,200,240,.22);min-width:0}
.bd-top{display:flex;align-items:center;gap:6px;min-width:0}
.bd-nome{flex:1 1 auto;min-width:0;min-height:44px;padding:6px 8px;border-radius:6px;background:rgba(2,5,11,.7);color:#f0dfb8;border:1px solid rgba(160,200,240,.3);font:700 13px/1.2 "Cinzel",Georgia,serif;letter-spacing:.04em}
.bd-nome:focus-visible{outline:none;border-color:#ffd27a}
.bd-tag{flex:none;font:700 10px/1 Georgia,serif;letter-spacing:.06em;color:#7d93ad;text-transform:uppercase}
.bd-tag.on{color:#ffd27a}
.bd-lista{list-style:none;margin:0;padding:0;display:flex;flex-direction:column;gap:3px;min-height:72px}
.bd-lista li{font:400 11px/1.35 Georgia,serif;color:#c6d8ea;overflow-wrap:anywhere}
.bd-lista li.bd-vazio{color:#7d93ad;font-style:italic}
.bd-erro{margin:0;font:400 11px/1.35 Georgia,serif;color:#ffb072;min-height:0}
.bd-erro:empty{display:none}
.bd-acoes{display:flex;gap:6px;margin-top:auto}
.bd-btn{flex:1 1 0;min-height:44px;padding:6px 8px;border-radius:6px;cursor:pointer;background:#1a2636;color:#e9dcc0;border:1px solid rgba(160,200,240,.35);font:700 12px/1.2 "Cinzel",Georgia,serif;letter-spacing:.04em;touch-action:manipulation}
.bd-btn.primario{background:#2a1f10;color:#ffe9b0;border-color:#ffb072}
.bd-btn:disabled{opacity:.4;cursor:default}
.bd-btn:not(:disabled):hover,.bd-btn:not(:disabled):focus-visible{border-color:#ffd27a;outline:none}
.bd-rodape{padding:8px 14px 12px;border-top:1px solid rgba(255,150,70,.25)}
.bd-aviso{margin:0;font:400 12px/1.35 Georgia,serif;color:#ffd08a}
@media (max-width:620px){.bd-grade{grid-template-columns:1fr}.bd-em{display:none}.bd-lista{min-height:0}}
@media (max-height:500px){.bd-card .qst-head{padding-top:6px;padding-bottom:4px}.bd-desc{display:none}.bd-body{padding-bottom:6px}.bd-rodape{padding:6px 14px 8px}}
`;

const el = <K extends keyof HTMLElementTagNameMap>(tag: K, cls = "", text = ""): HTMLElementTagNameMap[K] => {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text) e.textContent = text;
  return e;
};

export function mountBuilds(opts: BuildsOpts): BuildsUi {
  const style = el("style");
  style.textContent = CSS;
  document.head.append(style);

  const back = el("div", "qst-back bd-back");
  const card = el("div", "qst-card bd-card");
  card.setAttribute("role", "dialog");
  card.setAttribute("aria-modal", "true");
  card.setAttribute("aria-label", "Builds");
  back.append(card);
  document.body.append(back);

  let aberto = false;
  let timer: number | undefined;

  // cabeçalho: título, build ativo e ×
  const topo = el("div", "qst-head");
  topo.append(el("h2", "qst-title", "Builds"));
  const em = el("span", "bd-em", "");
  topo.append(em);
  const x = el("button", "qst-x", "×");
  x.type = "button";
  x.setAttribute("aria-label", "Fechar");
  x.addEventListener("click", close);
  topo.append(x);

  // corpo rolável: explicação e os 3 cartões (montados uma vez; render só atualiza o conteúdo)
  const corpo = el("div", "bd-body");
  corpo.append(el("p", "bd-desc", "Até 3 builds por personagem: cada um guarda as variações de habilidade e os talentos. Aplicar troca tudo de uma vez e não custa tostões."));
  const grade = el("div", "bd-grade");
  const slots: SlotUi[] = [];
  for (let i = 0; i < LOADOUT_SLOTS; i++) {
    const sec = el("section", "bd-slot");
    sec.setAttribute("aria-label", `Build ${i + 1}`);
    const top = el("div", "bd-top");
    const nome = el("input", "bd-nome");
    nome.type = "text";
    nome.maxLength = LOADOUT_NOME_MAX;
    nome.setAttribute("aria-label", `Nome do build ${i + 1}`);
    const tag = el("span", "bd-tag");
    top.append(nome, tag);
    const resumo = el("ul", "bd-lista");
    const erro = el("p", "bd-erro");
    const acoes = el("div", "bd-acoes");
    const salvar = el("button", "bd-btn", "Salvar");
    salvar.type = "button";
    salvar.title = "Grava o que está equipado agora neste build";
    const aplicar = el("button", "bd-btn primario", "Aplicar");
    aplicar.type = "button";
    acoes.append(salvar, aplicar);
    // equipamento (C3.6): segunda linha de botões, separada dos talentos e variações
    const acoesEq = el("div", "bd-acoes");
    const salvarEq = el("button", "bd-btn", "Salvar equip.");
    salvarEq.type = "button";
    salvarEq.title = "Grava as peças que você veste agora neste build";
    const aplicarEq = el("button", "bd-btn primario", "Aplicar equip.");
    aplicarEq.type = "button";
    aplicarEq.title = "Veste o equipamento salvo neste build";
    acoesEq.append(salvarEq, aplicarEq);
    sec.append(top, resumo, erro, acoes, acoesEq);
    grade.append(sec);
    nome.addEventListener("change", () => opts.renomear(i, nome.value.trim()));
    nome.addEventListener("keydown", (e) => { if (e.key === "Enter") nome.blur(); });
    salvar.addEventListener("click", () => { opts.salvar(i); setTimeout(render, 250); });
    aplicar.addEventListener("click", () => { opts.aplicar(i); setTimeout(render, 250); });
    salvarEq.addEventListener("click", () => { opts.salvarEquip(i); setTimeout(render, 250); });
    aplicarEq.addEventListener("click", () => { opts.aplicarEquip(i); setTimeout(render, 250); });
    slots.push({ nome, tag, resumo, erro, salvar, aplicar, salvarEq, aplicarEq });
  }
  corpo.append(grade);

  // rodapé: diz se dá para salvar e aplicar agora
  const rodape = el("div", "bd-rodape");
  const aviso = el("p", "bd-aviso");
  rodape.append(aviso);
  card.append(topo, corpo, rodape);

  function render() {
    const st = opts.estado();
    const level = st?.level ?? 1;
    const lo: Loadouts = limparLoadouts(st?.loadouts ?? "{}", opts.cls);
    const cidade = opts.cidade();
    em.textContent = lo.ativo >= 0 ? `Em uso: ${lo.slots[lo.ativo].nome}` : "Nenhum build em uso";
    aviso.textContent = cidade
      ? "Você está na cidade: dá para salvar e aplicar (fora de combate)."
      : "Fora da cidade: builds só podem ser salvos e aplicados na cidade (Brasalume).";
    slots.forEach((s, i) => {
      const sl = lo.slots[i];
      if (document.activeElement !== s.nome) s.nome.value = sl.nome; // não atropela o que o jogador está digitando
      const emUso = lo.ativo === i;
      s.tag.textContent = emUso ? "Em uso" : sl.salvo ? "" : "Vazio";
      s.tag.className = "bd-tag" + (emUso ? " on" : "");
      s.resumo.replaceChildren();
      if (sl.salvo) {
        const r = resumoLoadout(sl, opts.cls);
        for (const linha of r.variacoes) s.resumo.append(el("li", "", linha));
        s.resumo.append(el("li", "", r.talentos.length ? `Talentos (${r.pontos} pts): ${r.talentos.join(", ")}` : "Sem talentos"));
      } else {
        s.resumo.append(el("li", "bd-vazio", "Nenhum build salvo neste slot."));
      }
      const ok = validarLoadout(sl, opts.cls, level);
      s.erro.textContent = sl.salvo && !ok.ok ? ok.error : "";
      s.salvar.disabled = !cidade;
      s.aplicar.disabled = !cidade || !sl.salvo || !ok.ok;
      s.aplicar.title = ok.ok ? "Troca as variações e os talentos por este build" : ok.error;
      const pecas = resumoEquip(sl);
      s.resumo.append(el("li", "", pecas.length ? `Equipamento: ${pecas.join(", ")}` : "Equipamento: sem salvar"));
      s.salvarEq.disabled = !cidade;
      s.aplicarEq.disabled = !cidade || !sl.equipSalvo;
    });
  }

  function open() {
    if (aberto) return;
    aberto = true;
    back.classList.add("open");
    render();
    timer = window.setInterval(render, 700); // acompanha o servidor (cidade, build aplicado, nível)
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
    if (e.code !== "KeyB" || e.repeat || isTypingTarget()) return;
    if (aberto) close(); else open();
  });

  return { open, close, toggle: () => (aberto ? close() : open()), isOpen: () => aberto };
}
