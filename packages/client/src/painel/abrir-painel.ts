import { apiUrl } from "../auth";
import { ABAS } from "./registro";
import { CSS, el, botao, toast } from "./ui";
import type { InstanciaAba, MetodoPainel, Painel } from "./tipos";

/**
 * Janela do painel (carregada sob demanda). Estrutura: cabeçalho fixo, navegação fixa (lateral no PC; barra horizontal
 * rolável no celular) e UMA área de conteúdo com rolagem própria. A janela usa grid com linhas `auto minmax(0,1fr)`, então
 * o conteúdo cresce dentro da área e nunca cobre a navegação.
 * Duas partes: 1) entrada de 2FA (código enviado ao e-mail da conta); 2) abas, cada uma vinda de registro.ts.
 * O token do painel fica SÓ EM MEMÓRIA nesta página (12 horas, ou até recarregar/sair). Nada vai para o armazenamento do navegador.
 * Ctrl+K (ou Cmd+K) abre a busca rápida de jogador ou aba.
 */

let tokenPainel: string | null = null;
let estiloMontado = false;
let fechar: (() => void) | null = null;

/** ícone de cada aba (pelo id) na navegação */
const ICONES: Record<string, string> = { visao: "◈", jogadores: "☺", denuncias: "⚑", balanceamento: "⚖", auditoria: "≡" };

/** chamada à API do painel: sempre com o token do jogo; com o token do painel, quando já confirmado */
async function chamar<T = any>(jogoToken: string, metodo: MetodoPainel, caminho: string, corpo?: unknown, comPainel = true): Promise<T> {
  const cab: Record<string, string> = { Authorization: `Bearer ${jogoToken}` };
  if (corpo !== undefined) cab["Content-Type"] = "application/json";
  if (comPainel && tokenPainel) cab["X-Painel-Token"] = tokenPainel;
  let res: Response;
  try {
    res = await fetch(`${apiUrl}/api/admin${caminho}`, { method: metodo, headers: cab, body: corpo === undefined ? undefined : JSON.stringify(corpo) });
  } catch {
    throw new Error("Sem conexão com o servidor. Tente de novo.");
  }
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw Object.assign(new Error(json.error ?? "Erro ao falar com o servidor."), { status: res.status });
  return json as T;
}

export function abrirPainel(jogoToken: string): void {
  if (fechar) return; // já aberto
  if (!estiloMontado) {
    const st = el("style");
    st.textContent = CSS;
    document.head.append(st);
    estiloMontado = true;
  }

  const fundo = el("div", "pn-back");
  const janela = el("div", "pn-win");
  janela.setAttribute("role", "dialog");
  janela.setAttribute("aria-modal", "true");
  janela.setAttribute("aria-labelledby", "pn-titulo");

  // cabeçalho fixo: título, conta e fechar
  const cabeca = el("div", "pn-head");
  const titulo = el("h2", "pn-title", "Painel de administração");
  titulo.id = "pn-titulo";
  const conta = el("span", "pn-conta", "administrador");
  const buscaBtn = botao("Buscar", () => abrirBusca());
  buscaBtn.setAttribute("aria-label", "Busca rápida (Ctrl+K)");
  buscaBtn.classList.add("pn-busca-abre");
  buscaBtn.append(el("span", "pn-btn-kbd", "Ctrl K"));
  const xis = el("button", "pn-x", "×");
  xis.type = "button";
  xis.setAttribute("aria-label", "Fechar painel");
  cabeca.append(titulo, conta, buscaBtn, xis);

  // corpo: navegação fixa + uma área de conteúdo com rolagem
  const shell = el("div", "pn-shell sem-nav");
  const nav = el("nav", "pn-nav");
  nav.setAttribute("role", "tablist");
  nav.setAttribute("aria-label", "Seções do painel");
  const corpo = el("main", "pn-main");
  shell.append(nav, corpo);

  janela.append(cabeca, shell);
  fundo.append(janela);
  document.body.append(fundo);

  const instancias = new Map<string, InstanciaAba>();
  const botoesAba = new Map<string, HTMLButtonElement>();
  let abaAtual: string | null = null;
  let busca: HTMLElement | null = null;

  const sair = () => {
    fecharBusca();
    for (const inst of instancias.values()) inst.fechar?.();
    document.removeEventListener("keydown", aoTecla, true);
    fundo.remove();
    fechar = null;
  };
  fechar = sair;
  const aoTecla = (e: KeyboardEvent) => {
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") {
      e.preventDefault();
      abrirBusca();
      return;
    }
    // Esc fecha primeiro a camada de cima (gaveta, diálogo ou busca); a janela só fecha quando não há nenhuma
    if (e.key === "Escape" && !document.querySelector(".pn-gaveta-back, .pn-modal-back")) sair();
  };
  document.addEventListener("keydown", aoTecla, true);
  xis.onclick = sair;
  fundo.addEventListener("click", (e) => { if (e.target === fundo) sair(); });

  // ---- entrada (2FA)
  function mostrarEntrada(mensagem?: string) {
    shell.classList.add("sem-nav");
    nav.replaceChildren();
    const box = el("div", "pn-login");
    box.append(el("p", "", "Para entrar no painel, enviamos um código de 6 dígitos para o e-mail da sua conta. O código vale por 10 minutos e só pode ser usado uma vez."));
    const enviar = botao("Enviar código", async () => {
      enviar.disabled = true;
      try {
        await chamar(jogoToken, "POST", "/codigo", undefined, false);
        toast("Código enviado. Confira a caixa de entrada do e-mail da conta.");
        campoCodigo.hidden = false;
        confirmarBtn.hidden = false;
        campo.focus();
      } catch (e) {
        toast((e as Error).message, "erro");
      } finally {
        enviar.disabled = false;
      }
    });
    const campo = el("input", "pn-in codigo");
    campo.type = "text";
    campo.inputMode = "numeric";
    campo.autocomplete = "one-time-code";
    campo.maxLength = 6;
    campo.placeholder = "000000";
    campo.setAttribute("aria-label", "Código de 6 dígitos");
    const campoCodigo = el("div");
    campoCodigo.append(campo);
    campoCodigo.hidden = true;
    const confirmarBtn = botao("Confirmar", async () => {
      const codigo = campo.value.trim();
      if (!/^\d{6}$/.test(codigo)) return toast("O código tem 6 dígitos.", "erro");
      confirmarBtn.disabled = true;
      try {
        const { token } = await chamar<{ token: string }>(jogoToken, "POST", "/sessao", { codigo }, false);
        tokenPainel = token;
        mostrarPainel();
      } catch (e) {
        toast((e as Error).message, "erro");
        if ((e as { status?: number }).status === 401) campo.value = "";
      } finally {
        confirmarBtn.disabled = false;
      }
    }, "pn-btn perigo");
    confirmarBtn.hidden = true;
    campo.onkeydown = (e) => { if (e.key === "Enter") confirmarBtn.click(); };
    box.append(enviar, campoCodigo, confirmarBtn);
    corpo.replaceChildren(box);
    if (mensagem) toast(mensagem, "erro");
    if (!campoCodigo.hidden) campo.focus();
    else enviar.focus();
  }

  // ---- abas
  const painel: Painel = {
    api: (metodo, caminho, dados) => chamar(jogoToken, metodo, caminho, dados).catch((e: Error & { status?: number }) => {
      if (e.status === 401 && tokenPainel) { // o token do painel venceu ou foi recusado: pede o código de novo
        tokenPainel = null;
        mostrarEntrada("Sua sessão do painel expirou. Confirme o código de novo.");
      }
      throw e;
    }),
    irPara: (id, param) => selecionar(id, param),
    aviso: (texto, tipo) => toast(texto, tipo === "erro" ? "erro" : "ok"),
  };

  function selecionar(id: string, param?: unknown) {
    const def = ABAS.find((a) => a.id === id);
    if (!def) return;
    if (abaAtual && abaAtual !== id) instancias.get(abaAtual)?.fechar?.();
    abaAtual = id;
    for (const [k, b] of botoesAba) {
      const ativo = k === id;
      b.setAttribute("aria-selected", String(ativo));
      b.tabIndex = ativo ? 0 : -1;
    }
    let inst = instancias.get(id);
    if (!inst) {
      inst = def.montar(painel);
      inst.el.setAttribute("role", "tabpanel");
      instancias.set(id, inst);
      corpo.append(inst.el);
    }
    for (const i of instancias.values()) i.el.classList.toggle("pn-hide", i !== inst);
    corpo.scrollTop = 0;
    void inst.abrir(param);
  }

  function mostrarPainel() {
    shell.classList.remove("sem-nav");
    nav.replaceChildren();
    botoesAba.clear();
    for (const def of ABAS) {
      const b = el("button", "pn-nav-btn");
      b.type = "button";
      b.setAttribute("role", "tab");
      b.setAttribute("aria-selected", "false");
      b.append(el("span", "ico", ICONES[def.id] ?? "•"), el("span", "", def.titulo));
      b.onclick = () => selecionar(def.id);
      botoesAba.set(def.id, b);
      nav.append(b);
    }
    corpo.replaceChildren();
    for (const i of instancias.values()) i.fechar?.();
    instancias.clear();
    abaAtual = null;
    selecionar(ABAS[0].id);
  }

  // ---- busca rápida (Ctrl+K): jogador pelo nome ou aba
  function fecharBusca() {
    if (!busca) return;
    busca.remove();
    busca = null;
  }

  function abrirBusca() {
    if (busca) return;
    const fundoB = el("div", "pn-modal-back pn-busca-back");
    const caixa = el("div", "pn-busca");
    caixa.setAttribute("role", "dialog");
    caixa.setAttribute("aria-label", "Busca rápida");
    const campo = el("input", "pn-in pn-busca-campo");
    campo.type = "search";
    campo.placeholder = "Buscar jogador ou aba…";
    campo.setAttribute("aria-label", "Buscar jogador ou aba");
    campo.autocomplete = "off";
    const lista = el("ul", "pn-busca-lista");
    caixa.append(campo, lista);
    fundoB.append(caixa);
    document.body.append(fundoB);
    busca = fundoB;

    type Item = { rot: string; acao: () => void };
    let itens: Item[] = [];
    let sel = 0;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let seq = 0;

    const fechar2 = () => {
      clearTimeout(timer);
      fecharBusca();
    };
    const desenhar = () => {
      if (!itens.length) { lista.replaceChildren(el("li", "pn-vazio", "Nada encontrado.")); return; }
      lista.replaceChildren(...itens.map((it, i) => {
        const li = el("li", i === sel ? "pn-busca-item on" : "pn-busca-item", it.rot);
        li.setAttribute("role", "option");
        li.onclick = () => { fechar2(); it.acao(); };
        return li;
      }));
    };
    const itensAbas = (q: string): Item[] => ABAS
      .filter((a) => !q || a.titulo.toLowerCase().includes(q))
      .map((a) => ({ rot: `Aba · ${a.titulo}`, acao: () => selecionar(a.id) }));

    const atualizar = () => {
      const q = campo.value.trim().toLowerCase();
      sel = 0;
      itens = itensAbas(q);
      desenhar();
      clearTimeout(timer);
      if (q.length < 2) return;
      const minha = ++seq;
      timer = setTimeout(async () => {
        try {
          const { itens: jogs } = await painel.api<{ itens: { id: string; nome: string; zona: number }[] }>("GET", `/jogadores?q=${encodeURIComponent(q)}`);
          if (minha !== seq || !busca) return;
          itens = [
            ...jogs.map((j): Item => ({ rot: `Jogador · ${j.nome} (zona ${j.zona})`, acao: () => painel.irPara("jogadores", { ficha: j.id }) })),
            ...itensAbas(q),
          ];
          sel = 0;
          desenhar();
        } catch {
          // sem resultado de jogador: as abas continuam na lista
        }
      }, 250);
    };

    campo.oninput = atualizar;
    campo.onkeydown = (e) => {
      e.stopPropagation(); // Esc e as teclas daqui não chegam à janela do painel
      if (e.key === "Escape") { fechar2(); return; }
      if (e.key === "ArrowDown" || e.key === "ArrowUp") {
        e.preventDefault();
        if (!itens.length) return;
        sel = (sel + (e.key === "ArrowDown" ? 1 : -1) + itens.length) % itens.length;
        desenhar();
      } else if (e.key === "Enter" && itens[sel]) {
        const it = itens[sel];
        fechar2();
        it.acao();
      }
    };
    fundoB.addEventListener("click", (e) => { if (e.target === fundoB) fechar2(); });
    atualizar();
    campo.focus();
  }

  if (tokenPainel) mostrarPainel();
  else mostrarEntrada();
  xis.focus();
}
