/**
 * Kit visual do painel. Tudo que vem do servidor entra por textContent (nomes de jogadores são texto livre).
 * Componentes exportados para todas as abas: cartão de métrica, selo, tabela (ordenação e filtro), gaveta lateral,
 * diálogo de confirmação (antes e depois), aviso rápido (toast), carregando e vazio.
 * O visual usa as variáveis --pn-* (fundo em camadas, dourado de destaque, Consolas nos números, Cinzel nos títulos).
 */

export const el = <K extends keyof HTMLElementTagNameMap>(tag: K, cls = "", texto = ""): HTMLElementTagNameMap[K] => {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (texto) e.textContent = texto;
  return e;
};

export function botao(texto: string, onclick: () => void, cls = "pn-btn"): HTMLButtonElement {
  const b = el("button", cls, texto);
  b.type = "button";
  b.onclick = onclick;
  return b;
}

export const fmtNum = (n: unknown) => Number(n ?? 0).toLocaleString("pt-BR");

export const fmtData = (iso?: string | null) =>
  iso ? new Date(iso).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short", timeZone: "America/Sao_Paulo" }) : "—";

/** linha "rótulo: valor" */
export function linha(rotulo: string, valor: string | number | null | undefined): HTMLElement {
  const d = el("div", "pn-linha");
  d.append(el("span", "pn-rot", rotulo), el("span", "pn-val", valor === null || valor === undefined || valor === "" ? "—" : String(valor)));
  return d;
}

/** bloco com título (seção da ficha ou da aba) */
export function secao(titulo: string, ...filhos: HTMLElement[]): HTMLElement {
  const s = el("section", "pn-sec");
  s.append(el("h3", "pn-h3", titulo), ...filhos);
  return s;
}

export function vazio(texto: string): HTMLElement {
  return el("p", "pn-vazio", texto);
}

/** estado "carregando" (com aviso para leitores de tela) */
export function carregando(texto = "Carregando…"): HTMLElement {
  const d = el("div", "pn-carregando", texto);
  d.setAttribute("role", "status");
  return d;
}

/** estado vazio em bloco, com ícone discreto */
export function estadoVazio(texto: string): HTMLElement {
  const d = el("div", "pn-estado-vazio");
  d.append(el("span", "pn-estado-ico", "◇"), el("p", "", texto));
  return d;
}

export type Tom = "ok" | "atencao" | "perigo" | "neutro";

/** selo de estado: ok (verde), atenção (dourado), perigo (vermelho), neutro (cinza) */
export function selo(texto: string, tom: Tom = "neutro"): HTMLElement {
  return el("span", `pn-selo ${tom}`, texto);
}

/** cartão de métrica: rótulo, número grande (monoespaçado) e variação opcional */
export function cartaoMetrica(valor: string, rotulo: string, variacao?: { texto: string; tom?: Tom }): HTMLElement {
  const c = el("div", "pn-metrica");
  c.append(el("span", "pn-metrica-rot", rotulo), el("b", "pn-num", valor));
  if (variacao) c.append(el("span", `pn-var ${variacao.tom ?? "neutro"}`, variacao.texto));
  return c;
}

export interface ColunaTabela<T> {
  chave: string;
  rotulo: string;
  /** se existir, a coluna ordena ao clicar no cabeçalho; devolve o valor usado na comparação */
  ordenar?: (linha: T) => string | number;
  render: (linha: T) => Node | string;
}

export interface TabelaPainel<T> {
  el: HTMLElement;
  /** troca as linhas (e redesenha com o filtro e a ordem atuais) */
  definir(linhas: T[]): void;
}

/**
 * Tabela com cabeçalho fixo, ordenação (clique ou Enter no cabeçalho) e filtro de texto.
 * `filtrarPor` diz em que texto o filtro procura. `aoClicarLinha` abre a linha (ex.: a ficha em gaveta).
 */
export function tabela<T>(opts: {
  colunas: ColunaTabela<T>[];
  filtroRotulo?: string;
  filtrarPor?: (linha: T) => string;
  aoClicarLinha?: (linha: T) => void;
  vazioTexto?: string;
}): TabelaPainel<T> {
  const raiz = el("div", "pn-tabela");
  const ferramentas = el("div", "pn-row pn-tab-tools");
  const filtro = el("input", "pn-in pn-filtro");
  filtro.type = "search";
  filtro.placeholder = opts.filtroRotulo ?? "Filtrar…";
  filtro.setAttribute("aria-label", opts.filtroRotulo ?? "Filtrar");
  filtro.autocomplete = "off";
  const contagem = el("span", "pn-small pn-mono-num");
  ferramentas.append(filtro, contagem);

  const rolagem = el("div", "pn-tab-scroll");
  const tb = el("table", "pn-table");
  const cabeca = el("thead");
  const trCab = el("tr");
  const corpo = el("tbody");
  let dados: T[] = [];
  let ordem: { col: number; desc: boolean } | null = null;

  opts.colunas.forEach((c, i) => {
    const th = el("th", c.ordenar ? "ord" : "", c.rotulo);
    th.scope = "col";
    if (c.ordenar) {
      th.tabIndex = 0;
      const alternar = () => {
        ordem = ordem?.col === i ? { col: i, desc: !ordem.desc } : { col: i, desc: false };
        desenhar();
      };
      th.onclick = alternar;
      th.onkeydown = (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); alternar(); } };
      th.dataset.ordem = "";
    }
    trCab.append(th);
  });
  cabeca.append(trCab);
  tb.append(cabeca, corpo);
  rolagem.append(tb);
  raiz.append(ferramentas, rolagem);

  function desenhar() {
    const q = filtro.value.trim().toLowerCase();
    let lista = opts.filtrarPor && q ? dados.filter((l) => opts.filtrarPor!(l).toLowerCase().includes(q)) : dados.slice();
    if (ordem) {
      const col = opts.colunas[ordem.col];
      const sentido = ordem.desc ? -1 : 1;
      lista.sort((a, b) => {
        const x = col.ordenar!(a);
        const y = col.ordenar!(b);
        return (x < y ? -1 : x > y ? 1 : 0) * sentido;
      });
    }
    // indica a coluna ordenada no cabeçalho
    Array.from(trCab.children).forEach((th, i) => {
      if (!(th instanceof HTMLElement) || !opts.colunas[i].ordenar) return;
      th.dataset.ordem = ordem?.col === i ? (ordem.desc ? "desc" : "asc") : "";
    });
    contagem.textContent = `${fmtNum(lista.length)} de ${fmtNum(dados.length)}`;
    if (!lista.length) {
      const tr = el("tr", "pn-tr-vazio");
      const td = el("td", "", dados.length ? "Nenhum resultado com esse filtro." : (opts.vazioTexto ?? "Nada por aqui ainda."));
      td.colSpan = opts.colunas.length;
      tr.append(td);
      corpo.replaceChildren(tr);
      return;
    }
    corpo.replaceChildren(...lista.map((l) => {
      const tr = el("tr");
      if (opts.aoClicarLinha) {
        tr.classList.add("clicavel");
        tr.tabIndex = 0;
        tr.onclick = () => opts.aoClicarLinha!(l);
        tr.onkeydown = (e) => { if (e.key === "Enter") opts.aoClicarLinha!(l); };
      }
      for (const c of opts.colunas) {
        const td = el("td");
        const v = c.render(l);
        if (typeof v === "string") td.textContent = v;
        else td.append(v);
        tr.append(td);
      }
      return tr;
    }));
  }

  filtro.oninput = () => desenhar();
  return {
    el: raiz,
    definir(linhas: T[]) {
      dados = linhas;
      desenhar();
    },
  };
}

/**
 * Gaveta lateral (ficha do jogador). Abre por cima da janela; Esc e o fundo fecham só a gaveta.
 * Devolve a função de fechar.
 */
export function gaveta(titulo: string, conteudo: HTMLElement): () => void {
  const fundo = el("div", "pn-gaveta-back");
  const painel = el("aside", "pn-gaveta");
  painel.setAttribute("role", "dialog");
  painel.setAttribute("aria-modal", "true");
  painel.setAttribute("aria-label", titulo);
  const cab = el("div", "pn-gaveta-cab");
  const xis = botao("×", () => fechar(), "pn-x");
  xis.setAttribute("aria-label", "Fechar ficha");
  cab.append(el("h3", "pn-gaveta-tit", titulo), xis);
  const corpoG = el("div", "pn-gaveta-corpo");
  corpoG.append(conteudo);
  painel.append(cab, corpoG);
  fundo.append(painel);
  document.body.append(fundo);

  const aoTecla = (e: KeyboardEvent) => {
    if (e.key === "Escape") { // captura: o Esc fecha só a gaveta, não a janela do painel
      e.stopPropagation();
      fechar();
    }
  };
  function fechar() {
    document.removeEventListener("keydown", aoTecla, true);
    fundo.remove();
  }
  document.addEventListener("keydown", aoTecla, true);
  fundo.addEventListener("click", (e) => { if (e.target === fundo) fechar(); });
  xis.focus();
  return fechar;
}

export interface OpcoesConfirmacao {
  titulo: string;
  texto: string;
  /** estado antes e depois da mudança (mostrados lado a lado) */
  antes?: string;
  depois?: string;
  confirmar: string;
  perigoso?: boolean;
}

/** diálogo de confirmação para ações perigosas: mostra o antes e o depois. Resolve true só se confirmar. */
export function confirmar(o: OpcoesConfirmacao): Promise<boolean> {
  return new Promise((resolver) => {
    const fundo = el("div", "pn-modal-back");
    const caixa = el("div", "pn-modal");
    caixa.setAttribute("role", "alertdialog");
    caixa.setAttribute("aria-modal", "true");
    caixa.setAttribute("aria-label", o.titulo);
    caixa.append(el("h3", "pn-modal-tit", o.titulo), el("p", "pn-modal-texto", o.texto));
    if (o.antes !== undefined || o.depois !== undefined) {
      const cmp = el("div", "pn-antesdepois");
      cmp.append(bloco("Antes", o.antes ?? "—"), el("span", "pn-seta", "→"), bloco("Depois", o.depois ?? "—", true));
      caixa.append(cmp);
    }
    const cancelar = botao("Cancelar", () => feito(false));
    const ok = botao(o.confirmar, () => feito(true), o.perigoso ? "pn-btn perigo" : "pn-btn");
    caixa.append(el("div", "pn-row pn-modal-acoes", ""));
    caixa.lastElementChild!.append(cancelar, ok);
    fundo.append(caixa);
    document.body.append(fundo);

    const aoTecla = (e: KeyboardEvent) => {
      if (e.key === "Escape") { e.stopPropagation(); feito(false); }
    };
    function feito(valor: boolean) {
      document.removeEventListener("keydown", aoTecla, true);
      fundo.remove();
      resolver(valor);
    }
    document.addEventListener("keydown", aoTecla, true);
    cancelar.focus();
  });
}

function bloco(rotulo: string, valor: string, depois = false): HTMLElement {
  const d = el("div", depois ? "pn-ad depois" : "pn-ad");
  d.append(el("span", "pn-ad-rot", rotulo), el("b", "pn-num", valor));
  return d;
}

/** aviso rápido no canto da tela (some sozinho). */
export function toast(texto: string, tom: "ok" | "erro" = "ok"): void {
  let pilha = document.querySelector<HTMLElement>(".pn-toasts");
  if (!pilha) {
    pilha = el("div", "pn-toasts");
    pilha.setAttribute("role", "status");
    pilha.setAttribute("aria-live", "polite");
    document.body.append(pilha);
  }
  const t = el("div", `pn-toast ${tom}`, texto);
  pilha.append(t);
  setTimeout(() => t.remove(), 5000);
}

export const ACOES_LEGIVEIS: Record<string, string> = {
  entrar_painel: "Entrou no painel",
  revelar_email: "Revelou o e-mail",
  silenciar: "Silenciou",
  dessilenciar: "Retirou o silêncio",
  banir: "Baniu",
  desbanir: "Desbaniu",
  expulsar: "Expulsou da sessão",
  resolver_denuncia: "Resolveu denúncia",
  alterar_balanceamento: "Alterou balanceamento",
  voltar_padrao_balanceamento: "Voltou ao padrão (balanceamento)",
  desfazer_balanceamento: "Desfez mudança de balanceamento",
};

export const CSS = `
:root{--pn-bg0:#02050b;--pn-bg1:#070e18;--pn-bg2:#0d1828;--pn-bg3:#15243a;--pn-linha:rgba(160,200,240,.14);
  --pn-ouro:#e6b960;--pn-ouro-2:#ffd58a;--pn-brasa:#ff9a4d;--pn-txt:#e4eefb;--pn-txt-2:#9bb6d2;--pn-ok:#7fe3a4;--pn-perigo:#ff8a78;
  --pn-titulo:"Cinzel",Georgia,serif;--pn-mono:Consolas,"SFMono-Regular",Menlo,monospace;--pn-r:8px}
.pn-back{position:fixed;inset:0;z-index:40;display:flex;align-items:center;justify-content:center;background:rgba(2,5,11,.72);
  backdrop-filter:blur(3px);-webkit-backdrop-filter:blur(3px);padding:12px;font-family:var(--pn-titulo);color:var(--pn-txt)}
.pn-win{display:grid;grid-template-rows:auto minmax(0,1fr);width:min(1040px,100%);height:min(88vh,800px);height:min(88dvh,800px);
  border-radius:12px;overflow:hidden;background:linear-gradient(180deg,var(--pn-bg3),var(--pn-bg1) 40%,var(--pn-bg0));
  border:1px solid rgba(230,185,96,.35);box-shadow:0 24px 60px rgba(0,0,0,.8),inset 0 1px 0 rgba(255,213,138,.08)}
.pn-head{display:flex;align-items:center;gap:12px;padding:10px 16px;background:linear-gradient(180deg,rgba(255,213,138,.06),transparent);border-bottom:1px solid rgba(230,185,96,.22)}
.pn-title{flex:1;margin:0;font:700 13px/1.2 var(--pn-titulo);letter-spacing:.28em;text-transform:uppercase;color:var(--pn-ouro)}
.pn-conta{font:400 11px/1 var(--pn-mono);color:var(--pn-txt-2);letter-spacing:.04em;padding:6px 8px;border:1px solid var(--pn-linha);border-radius:999px}
.pn-x{width:40px;height:40px;border-radius:50%;cursor:pointer;color:var(--pn-txt);background:rgba(8,16,28,.8);border:1px solid rgba(160,200,240,.3);font-size:20px;line-height:1;flex:none}
.pn-x:focus-visible,.pn-btn:focus-visible,.pn-tab:focus-visible,.pn-in:focus-visible,.pn-sel:focus-visible,.pn-item:focus-visible,th.ord:focus-visible,tr.clicavel:focus-visible,.pn-nav-btn:focus-visible,.pn-busca-item:focus-visible{outline:2px solid var(--pn-ouro-2);outline-offset:2px}
.pn-shell{display:grid;grid-template-columns:200px minmax(0,1fr);min-height:0;height:100%}
.pn-shell.sem-nav{grid-template-columns:minmax(0,1fr)}
.pn-shell.sem-nav .pn-nav{display:none}
.pn-nav{display:flex;flex-direction:column;gap:4px;padding:10px;overflow-y:auto;min-height:0;border-right:1px solid rgba(230,185,96,.18);background:rgba(3,8,14,.55)}
.pn-nav-btn{display:flex;align-items:center;gap:10px;width:100%;min-height:42px;padding:0 10px;border-radius:6px;cursor:pointer;text-align:left;color:var(--pn-txt-2);
  background:transparent;border:1px solid transparent;font:700 11px/1.2 var(--pn-titulo);letter-spacing:.12em;text-transform:uppercase}
.pn-nav-btn .ico{width:22px;text-align:center;font-size:15px;color:var(--pn-ouro);flex:none}
.pn-nav-btn:hover{background:rgba(255,213,138,.05);color:var(--pn-txt)}
.pn-nav-btn[aria-selected="true"]{color:#fff;background:linear-gradient(90deg,rgba(230,185,96,.22),rgba(230,185,96,.04));border-color:rgba(230,185,96,.45)}
.pn-nav-btn .ct{margin-left:auto}
.pn-main{position:relative;min-width:0;min-height:0;overflow-y:auto;overflow-x:hidden;padding:16px 18px;font:400 14px/1.45 Georgia,serif;color:var(--pn-txt);-webkit-overflow-scrolling:touch;overscroll-behavior:contain}
.pn-aviso{display:none}
.pn-btn{min-height:40px;padding:0 14px;border-radius:6px;cursor:pointer;color:var(--pn-txt);background:linear-gradient(180deg,#1b2d45,#0b1524);
  border:1px solid rgba(230,185,96,.4);font:700 12px/1 var(--pn-titulo);letter-spacing:.1em;text-transform:uppercase;white-space:nowrap}
.pn-btn:hover{border-color:var(--pn-ouro-2)}
.pn-btn.perigo{border-color:rgba(255,138,120,.6);color:#ffc2b8;background:linear-gradient(180deg,#3a1614,#160908)}
.pn-btn:disabled{opacity:.55;cursor:wait}
.pn-in,.pn-sel{min-height:40px;padding:0 10px;border-radius:6px;background:rgba(3,8,14,.9);color:var(--pn-txt);border:1px solid rgba(160,200,240,.28);font:400 14px Georgia,serif;box-sizing:border-box;max-width:100%}
.pn-in:focus,.pn-sel:focus{border-color:var(--pn-ouro)}
.pn-in.codigo{letter-spacing:.4em;font-size:20px;text-align:center;width:180px;font-family:var(--pn-mono)}
.pn-row{display:flex;flex-wrap:wrap;gap:8px;align-items:center;margin-bottom:12px}
.pn-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(160px,1fr));gap:10px;margin-bottom:14px}
.pn-metrica{position:relative;padding:14px 14px 12px;border-radius:var(--pn-r);background:linear-gradient(180deg,rgba(21,36,58,.85),rgba(8,14,24,.9));border:1px solid var(--pn-linha);overflow:hidden}
.pn-metrica::before{content:"";position:absolute;left:0;top:0;bottom:0;width:3px;background:linear-gradient(var(--pn-ouro-2),var(--pn-brasa))}
.pn-metrica-rot{display:block;font:700 10px/1 var(--pn-titulo);letter-spacing:.16em;text-transform:uppercase;color:var(--pn-txt-2)}
.pn-num{display:block;margin:8px 0 4px;font:700 26px/1 var(--pn-mono);color:var(--pn-ouro-2);font-variant-numeric:tabular-nums}
.pn-var{font:400 11px/1.2 var(--pn-mono)}
.pn-var.ok{color:var(--pn-ok)}.pn-var.perigo{color:var(--pn-perigo)}.pn-var.atencao{color:var(--pn-ouro)}.pn-var.neutro{color:var(--pn-txt-2)}
.pn-mono-num{font-family:var(--pn-mono);font-variant-numeric:tabular-nums}
.pn-selo{display:inline-flex;align-items:center;gap:6px;min-height:22px;padding:3px 8px;border-radius:999px;font:700 10px/1 var(--pn-titulo);letter-spacing:.1em;text-transform:uppercase;border:1px solid;white-space:nowrap}
.pn-selo::before{content:"";width:6px;height:6px;border-radius:50%;background:currentColor}
.pn-selo.ok{color:var(--pn-ok);border-color:rgba(127,227,164,.45);background:rgba(20,70,45,.25)}
.pn-selo.atencao{color:var(--pn-ouro-2);border-color:rgba(230,185,96,.5);background:rgba(90,66,20,.25)}
.pn-selo.perigo{color:var(--pn-perigo);border-color:rgba(255,138,120,.5);background:rgba(90,25,20,.3)}
.pn-selo.neutro{color:var(--pn-txt-2);border-color:rgba(160,200,240,.3);background:rgba(10,20,34,.6)}
.pn-tabela{margin-bottom:14px}
.pn-tab-scroll{overflow:auto;max-height:min(62dvh,560px);min-height:0;border-radius:var(--pn-r);border:1px solid var(--pn-linha);background:rgba(3,8,14,.6);-webkit-overflow-scrolling:touch}
.pn-table{width:100%;border-collapse:separate;border-spacing:0;font:400 13px/1.35 Georgia,serif}
.pn-table thead th{position:sticky;top:0;z-index:1;padding:10px;text-align:left;white-space:nowrap;font:700 10px/1 var(--pn-titulo);letter-spacing:.14em;text-transform:uppercase;color:var(--pn-ouro);background:linear-gradient(180deg,#16263d,#0c1625);border-bottom:1px solid rgba(230,185,96,.35)}
.pn-table th.ord{cursor:pointer;user-select:none}
.pn-table th.ord::after{content:"↕";margin-left:6px;opacity:.4}
.pn-table th.ord[data-ordem="asc"]::after{content:"↑";opacity:1}
.pn-table th.ord[data-ordem="desc"]::after{content:"↓";opacity:1}
.pn-table td{padding:9px 10px;border-bottom:1px solid rgba(160,200,240,.08);vertical-align:middle;word-break:break-word}
.pn-table tbody tr:nth-child(even) td{background:rgba(255,255,255,.012)}
.pn-table tr.clicavel{cursor:pointer}
.pn-table tr.clicavel:hover td{background:rgba(230,185,96,.07)}
.pn-table td.pn-tr-vazio,.pn-table tr.pn-tr-vazio td{text-align:center;color:var(--pn-txt-2);font-style:italic;padding:22px}
.pn-tab-tools{align-items:center}
.pn-filtro{flex:1;min-width:160px}
.pn-carregando{padding:18px;text-align:center;color:var(--pn-txt-2);font-style:italic;position:relative}
.pn-carregando::after{content:"";display:block;width:120px;height:2px;margin:10px auto 0;background:linear-gradient(90deg,transparent,var(--pn-ouro),transparent);animation:pn-varre 1.2s linear infinite}
@keyframes pn-varre{0%{transform:translateX(-60%)}100%{transform:translateX(60%)}}
.pn-estado-vazio{display:flex;flex-direction:column;align-items:center;gap:6px;padding:26px 10px;color:var(--pn-txt-2);text-align:center}
.pn-estado-vazio p{margin:0;font-style:italic}
.pn-estado-ico{font-size:22px;color:var(--pn-ouro);opacity:.7}
.pn-gaveta-back,.pn-modal-back{position:fixed;inset:0;z-index:50;background:rgba(2,5,11,.6);font-family:var(--pn-titulo);color:var(--pn-txt)}
.pn-gaveta{position:absolute;top:0;right:0;bottom:0;width:min(560px,100%);display:flex;flex-direction:column;background:linear-gradient(180deg,var(--pn-bg3),var(--pn-bg0));border-left:1px solid rgba(230,185,96,.4);box-shadow:-18px 0 40px rgba(0,0,0,.6);
  padding-top:env(safe-area-inset-top);padding-bottom:env(safe-area-inset-bottom);animation:pn-entra .22s ease-out}
@keyframes pn-entra{from{transform:translateX(30px);opacity:0}to{transform:none;opacity:1}}
.pn-gaveta-cab{display:flex;align-items:center;gap:10px;padding:12px 14px;border-bottom:1px solid rgba(230,185,96,.22)}
.pn-gaveta-tit{flex:1;margin:0;font:700 14px/1.2 var(--pn-titulo);letter-spacing:.14em;text-transform:uppercase;color:var(--pn-ouro)}
.pn-gaveta-corpo{flex:1;min-height:0;overflow-y:auto;padding:14px;font:400 14px/1.45 Georgia,serif;overscroll-behavior:contain}
.pn-modal-back{display:flex;align-items:center;justify-content:center;padding:14px}
.pn-modal{width:min(460px,100%);max-height:100%;overflow:auto;padding:18px;border-radius:12px;background:linear-gradient(180deg,var(--pn-bg3),var(--pn-bg0));border:1px solid rgba(230,185,96,.4);box-shadow:0 20px 50px rgba(0,0,0,.8)}
.pn-modal-tit{margin:0 0 8px;font:700 14px/1.2 var(--pn-titulo);letter-spacing:.12em;text-transform:uppercase;color:var(--pn-ouro)}
.pn-modal-texto{margin:0 0 12px;font:400 14px/1.45 Georgia,serif;color:var(--pn-txt)}
.pn-antesdepois{display:grid;grid-template-columns:1fr auto 1fr;gap:8px;align-items:center;margin-bottom:12px}
.pn-ad{padding:10px;border-radius:var(--pn-r);background:rgba(3,8,14,.8);border:1px solid var(--pn-linha);min-width:0}
.pn-ad.depois{border-color:rgba(230,185,96,.5)}
.pn-ad-rot{display:block;font:700 9px/1 var(--pn-titulo);letter-spacing:.16em;text-transform:uppercase;color:var(--pn-txt-2);margin-bottom:6px}
.pn-ad b{display:block;font-size:14px;word-break:break-word;color:var(--pn-txt)}
.pn-seta{color:var(--pn-ouro);font-size:18px}
.pn-modal-acoes{justify-content:flex-end;margin:0}
.pn-toasts{position:fixed;right:14px;bottom:14px;z-index:70;display:flex;flex-direction:column;gap:8px;max-width:min(380px,calc(100% - 28px));font:400 13px/1.35 Georgia,serif}
.pn-toast{padding:10px 12px;border-radius:8px;background:rgba(10,22,20,.95);border:1px solid rgba(127,227,164,.5);color:#d4f7e2;box-shadow:0 10px 26px rgba(0,0,0,.6);animation:pn-entra .2s ease-out}
.pn-toast.erro{background:rgba(40,12,10,.96);border-color:rgba(255,138,120,.6);color:#ffd2ca}
.pn-busca-back{align-items:flex-start;padding-top:12vh}
.pn-busca{width:min(560px,100%);padding:12px;border-radius:12px;background:linear-gradient(180deg,var(--pn-bg3),var(--pn-bg0));border:1px solid rgba(230,185,96,.45);box-shadow:0 20px 50px rgba(0,0,0,.8)}
.pn-busca-campo{width:100%;min-height:46px;font-size:15px}
.pn-busca-lista{list-style:none;margin:8px 0 0;padding:0;max-height:50vh;overflow:auto}
.pn-busca-item{padding:10px;border-radius:6px;cursor:pointer;color:var(--pn-txt);font:400 14px Georgia,serif;border:1px solid transparent}
.pn-busca-item.on,.pn-busca-item:hover{background:rgba(230,185,96,.12);border-color:rgba(230,185,96,.4)}
.pn-btn-kbd{font:400 10px/1 var(--pn-mono);color:var(--pn-txt-2);border:1px solid var(--pn-linha);border-radius:4px;padding:3px 5px;margin-left:6px}
.pn-login{display:flex;flex-direction:column;gap:12px;align-items:center;text-align:center;padding:24px 8px}
.pn-login p{margin:0;max-width:420px}
.pn-h3{margin:0 0 8px;font:700 11px/1.2 var(--pn-titulo);letter-spacing:.16em;text-transform:uppercase;color:var(--pn-ouro)}
.pn-sec{margin:0 0 14px;padding:12px 14px;border-radius:var(--pn-r);background:rgba(8,14,24,.65);border:1px solid var(--pn-linha)}
.pn-grid .pn-sec{margin:0}
.pn-linha{display:flex;justify-content:space-between;gap:12px;padding:4px 0;border-bottom:1px dashed rgba(160,200,240,.12)}
.pn-rot{color:var(--pn-txt-2);font-size:13px}
.pn-val{text-align:right;word-break:break-word;font-family:var(--pn-mono);font-size:13px}
.pn-list{list-style:none;margin:0;padding:0}
.pn-list li{padding:7px 0;border-bottom:1px dashed rgba(160,200,240,.12)}
.pn-item{display:flex;flex-wrap:wrap;gap:8px;align-items:center;justify-content:space-between;width:100%;min-height:48px;padding:8px 10px;margin-bottom:6px;border-radius:6px;cursor:pointer;text-align:left;color:var(--pn-txt);background:rgba(10,20,34,.75);border:1px solid rgba(160,200,240,.18);font:400 14px Georgia,serif}
.pn-item:hover{border-color:var(--pn-ouro)}
.pn-tag{font:700 10px/1 var(--pn-titulo);letter-spacing:.1em;text-transform:uppercase;padding:4px 7px;border-radius:4px;color:#bdf0cf;border:1px solid rgba(120,220,150,.4)}
.pn-tag.off{color:var(--pn-txt-2);border-color:rgba(160,200,240,.25)}
.pn-tag.ban{color:#ffc2b8;border-color:rgba(255,110,90,.5)}
.pn-tag.mute{color:#ffd08a;border-color:rgba(255,190,90,.5)}
.pn-vazio{margin:8px 0;color:var(--pn-txt-2);font-style:italic}
.pn-mono{font-family:var(--pn-mono);font-size:12px;color:#9fc0e0;word-break:break-all}
.pn-campo{display:flex;flex-direction:column;gap:4px;margin-bottom:10px}
.pn-campo>span{font:700 11px/1 var(--pn-titulo);letter-spacing:.12em;text-transform:uppercase;color:var(--pn-txt-2)}
.pn-hide{display:none!important}
.pn-small{font-size:12px;color:var(--pn-txt-2)}
.pn-sub{margin:0 0 10px;padding:10px;border-radius:6px;background:rgba(10,20,34,.55);border:1px solid rgba(160,200,240,.14)}
.pn-tabs{display:none}
@media (max-width:720px){
  .pn-back{padding:0}
  .pn-win{width:100%;height:100vh;height:100dvh;border-radius:0;border:0}
  .pn-head{gap:8px;padding:calc(8px + env(safe-area-inset-top)) max(12px,env(safe-area-inset-right)) 8px max(12px,env(safe-area-inset-left))}
  .pn-title{font-size:11px;letter-spacing:.14em;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;min-width:0}
  .pn-conta,.pn-btn-kbd{display:none}
  .pn-busca-abre{font-size:0;min-width:44px;padding:0 10px}
  .pn-busca-abre::before{content:"⌕";font-size:18px;color:var(--pn-ouro-2)}
  .pn-shell{grid-template-columns:minmax(0,1fr);grid-template-rows:auto minmax(0,1fr)}
  .pn-nav{flex-direction:row;overflow-x:auto;overflow-y:hidden;padding:8px max(10px,env(safe-area-inset-left));border-right:0;border-bottom:1px solid rgba(230,185,96,.18);scrollbar-width:thin}
  .pn-nav-btn{flex:none;width:auto;min-height:44px;padding:0 12px}
  .pn-nav-btn .ct{display:none}
  .pn-main{padding:12px max(12px,env(safe-area-inset-right)) calc(14px + env(safe-area-inset-bottom)) max(12px,env(safe-area-inset-left))}
  .pn-in,.pn-sel{font-size:16px}
  .pn-btn{min-height:44px}
  .pn-tab-scroll{max-height:55dvh}
  .pn-gaveta{width:100%}
  .pn-antesdepois{grid-template-columns:1fr}
  .pn-seta{transform:rotate(90deg);justify-self:center}
  .pn-toasts{left:12px;right:12px;bottom:calc(12px + env(safe-area-inset-bottom));max-width:none}
}
@media (max-height:480px) and (min-width:721px){
  .pn-win{height:100dvh;border-radius:0;border:0}
  .pn-nav-btn{min-height:36px}
  .pn-head{padding:6px 12px}
}
@media (prefers-reduced-motion:reduce){.pn-back,.pn-gaveta-back{backdrop-filter:none}.pn-gaveta,.pn-toast{animation:none}.pn-carregando::after{animation:none}}
`;
