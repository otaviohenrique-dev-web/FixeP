import { apiUrl } from "../auth";
import { ABAS } from "./registro";
import { CSS, el, botao } from "./ui";
import type { InstanciaAba, Painel } from "./tipos";

/**
 * Janela do painel (carregada sob demanda). Duas partes:
 * 1) entrada de 2FA: pede o código (vai para o e-mail da conta) e confere;
 * 2) abas do painel, cada uma vinda de registro.ts.
 * O token do painel fica SÓ EM MEMÓRIA nesta página (12 horas, ou até recarregar/sair). Nada vai para o armazenamento do navegador.
 */

let tokenPainel: string | null = null;
let estiloMontado = false;
let fechar: (() => void) | null = null;

/** chamada à API do painel: sempre com o token do jogo; com o token do painel, quando já confirmado */
async function chamar<T = any>(jogoToken: string, metodo: "GET" | "POST", caminho: string, corpo?: unknown, comPainel = true): Promise<T> {
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
  janela.setAttribute("aria-label", "Painel de administração");
  const cabeca = el("div", "pn-head");
  const titulo = el("h2", "pn-title", "Painel");
  titulo.id = "pn-titulo";
  janela.setAttribute("aria-labelledby", "pn-titulo");
  const xis = el("button", "pn-x", "×");
  xis.type = "button";
  xis.setAttribute("aria-label", "Fechar painel");
  cabeca.append(titulo, xis);
  const barra = el("div", "pn-tabs");
  barra.setAttribute("role", "tablist");
  const aviso = el("p", "pn-aviso");
  aviso.hidden = true;
  aviso.setAttribute("role", "status");
  const corpo = el("div", "pn-body");
  janela.append(cabeca, barra, aviso, corpo);
  fundo.append(janela);
  document.body.append(fundo);

  let timerAviso: ReturnType<typeof setTimeout> | undefined;
  const mostrarAviso = (texto: string, tipo: "ok" | "erro" = "ok") => {
    aviso.textContent = texto;
    aviso.className = tipo === "erro" ? "pn-aviso erro" : "pn-aviso";
    aviso.hidden = false;
    clearTimeout(timerAviso);
    timerAviso = setTimeout(() => { aviso.hidden = true; }, 6000);
  };

  const sair = () => {
    for (const inst of instancias.values()) inst.fechar?.();
    document.removeEventListener("keydown", aoTecla);
    fundo.remove();
    fechar = null;
  };
  fechar = sair;
  const aoTecla = (e: KeyboardEvent) => { if (e.key === "Escape") sair(); };
  document.addEventListener("keydown", aoTecla);
  xis.onclick = sair;
  fundo.addEventListener("click", (e) => { if (e.target === fundo) sair(); });

  // ---- entrada (2FA)
  function mostrarEntrada(mensagem?: string) {
    barra.replaceChildren();
    const box = el("div", "pn-login");
    box.append(el("p", "", "Para entrar no painel, enviamos um código de 6 dígitos para o e-mail da sua conta. O código vale por 10 minutos e só pode ser usado uma vez."));
    const enviar = botao("Enviar código", async () => {
      enviar.disabled = true;
      try {
        await chamar(jogoToken, "POST", "/codigo", undefined, false);
        mostrarAviso("Código enviado. Confira a caixa de entrada do e-mail da conta.");
        campoCodigo.hidden = false;
        confirmar.hidden = false;
        campo.focus();
      } catch (e) {
        mostrarAviso((e as Error).message, "erro");
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
    const confirmar = botao("Confirmar", async () => {
      const codigo = campo.value.trim();
      if (!/^\d{6}$/.test(codigo)) return mostrarAviso("O código tem 6 dígitos.", "erro");
      confirmar.disabled = true;
      try {
        const { token } = await chamar<{ token: string }>(jogoToken, "POST", "/sessao", { codigo }, false);
        tokenPainel = token;
        mostrarPainel();
      } catch (e) {
        mostrarAviso((e as Error).message, "erro");
        if ((e as { status?: number }).status === 401) campo.value = "";
      } finally {
        confirmar.disabled = false;
      }
    }, "pn-btn perigo");
    confirmar.hidden = true;
    campo.onkeydown = (e) => { if (e.key === "Enter") confirmar.click(); };
    box.append(enviar, campoCodigo, confirmar);
    corpo.replaceChildren(box);
    if (mensagem) mostrarAviso(mensagem, "erro");
    if (!campoCodigo.hidden) campo.focus();
    else enviar.focus();
  }

  // ---- abas
  const instancias = new Map<string, InstanciaAba>();
  const botoesAba = new Map<string, HTMLButtonElement>();
  let abaAtual: string | null = null;

  const painel: Painel = {
    api: (metodo, caminho, dados) => chamar(jogoToken, metodo, caminho, dados).catch((e: Error & { status?: number }) => {
      if (e.status === 401 && tokenPainel) { // o token do painel venceu ou foi recusado: pede o código de novo
        tokenPainel = null;
        mostrarEntrada("Sua sessão do painel expirou. Confirme o código de novo.");
      }
      throw e;
    }),
    irPara: (id, param) => selecionar(id, param),
    aviso: mostrarAviso,
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
    void inst.abrir(param);
  }

  function mostrarPainel() {
    barra.replaceChildren();
    botoesAba.clear();
    for (const def of ABAS) {
      const b = el("button", "pn-tab", def.titulo);
      b.type = "button";
      b.setAttribute("role", "tab");
      b.setAttribute("aria-selected", "false");
      b.onclick = () => selecionar(def.id);
      botoesAba.set(def.id, b);
      barra.append(b);
    }
    corpo.replaceChildren();
    for (const i of instancias.values()) i.fechar?.();
    instancias.clear();
    abaAtual = null;
    selecionar(ABAS[0].id);
  }

  if (tokenPainel) mostrarPainel();
  else mostrarEntrada();
  xis.focus();
}
