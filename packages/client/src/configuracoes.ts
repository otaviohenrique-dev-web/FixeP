/**
 * Janela de Configurações (estilo MMORPG): abas Gráficos, Interface, Som e Controles.
 * O rascunho só vai para o jogo ao clicar em "Aplicar" (ou "Restaurar padrão", que aplica o padrão na hora).
 * O que é salvo e aplicado vem de config.ts; o modo de teste A/B (quality.ts) continua funcionando e recarrega a página.
 */
import { ESCALAS_UI, PADRAO, PRESETS, type Config, type Efeitos, type EscalaUi, type Qualidade, config, salvarConfig } from "./config";
import { type Modo, modoQualidade, NOME_MODO, setModo } from "./quality";

export interface ConfigUi {
  abrir(): void;
  fechar(): void;
}

type Aba = "graficos" | "interface" | "som" | "controles";
const ABAS: { id: Aba; label: string }[] = [
  { id: "graficos", label: "Gráficos" },
  { id: "interface", label: "Interface" },
  { id: "som", label: "Som" },
  { id: "controles", label: "Controles" },
];

const CSS = `
.cf-back{position:fixed;inset:0;z-index:23;display:none;align-items:center;justify-content:center;padding:12px;overflow-y:auto;background:rgba(2,5,11,.66);backdrop-filter:blur(3px);-webkit-backdrop-filter:blur(3px);font-family:"Cinzel",Georgia,serif}
.cf-back.open{display:flex;animation:cf-in .18s ease-out}
.cf-card{display:flex;flex-direction:column;width:min(680px,100%);max-height:calc(100vh - 24px);border-radius:10px;color:#dbeaff;overflow:hidden;
  background:linear-gradient(180deg,rgba(20,34,52,.97),rgba(6,12,20,.99));border:1px solid rgba(255,150,70,.45);box-shadow:0 22px 60px rgba(0,0,0,.75),inset 0 1px 0 rgba(180,220,255,.12)}
.cf-head{display:flex;align-items:center;justify-content:space-between;gap:12px;padding:12px 16px 10px;border-bottom:1px solid rgba(255,150,70,.25)}
.cf-title{margin:0;font-size:15px;font-weight:700;letter-spacing:.3em;text-transform:uppercase;color:#ffb072;text-shadow:0 0 14px rgba(255,120,40,.45)}
.cf-x{width:34px;height:34px;border-radius:50%;cursor:pointer;color:#ffd9a8;font:400 22px/1 Georgia,serif;background:rgba(8,16,28,.7);border:1px solid rgba(255,150,70,.4)}
.cf-x:hover,.cf-x:focus-visible,.cf-tab:focus-visible,.cf-seg:focus-visible,.cf-foot button:focus-visible,.cf-sel:focus-visible,.cf-chk:focus-visible input{outline:2px solid #ffd2a3;outline-offset:2px}
.cf-tabs{display:flex;gap:6px;padding:10px 12px 0;overflow-x:auto;-webkit-overflow-scrolling:touch;scrollbar-width:none}
.cf-tabs::-webkit-scrollbar{display:none}
.cf-tab{flex:1 0 auto;min-height:40px;padding:0 14px;cursor:pointer;font:700 12px/1 "Cinzel",Georgia,serif;letter-spacing:.14em;text-transform:uppercase;color:#bcd0e6;
  background:linear-gradient(180deg,rgba(24,40,60,.7),rgba(7,13,22,.8));border:1px solid rgba(160,200,240,.2);border-bottom:none;border-radius:6px 6px 0 0}
.cf-tab[aria-selected="true"]{color:#fff6dc;background:linear-gradient(180deg,rgba(72,52,28,.9),rgba(20,16,12,.96));border-color:rgba(255,190,100,.7);box-shadow:0 0 14px rgba(255,160,70,.25) inset}
.cf-tab:hover{color:#fff}
.cf-body{flex:1 1 auto;min-height:0;overflow-y:auto;padding:14px 16px 6px;border-top:1px solid rgba(255,150,70,.25);background:rgba(4,9,16,.45)}
.cf-panel[hidden]{display:none}
.cf-sec-t{margin:0 0 10px;font:700 11px/1 "Cinzel",Georgia,serif;letter-spacing:.24em;text-transform:uppercase;color:#d9a46a}
.cf-row{display:grid;grid-template-columns:minmax(0,1fr) auto;align-items:center;gap:6px 14px;min-height:44px;padding:6px 0;border-bottom:1px dashed rgba(255,150,70,.16)}
.cf-row>span:first-child{font:700 12px/1.2 "Cinzel",Georgia,serif;letter-spacing:.06em;color:#eaf4ff}
.cf-row small{display:block;margin-top:3px;font:400 12px/1.3 Georgia,serif;letter-spacing:0;color:#8fb0cf}
.cf-row.full{grid-template-columns:1fr}
.cf-seg-g{display:inline-flex;flex-wrap:wrap;gap:5px;justify-content:flex-end}
.cf-seg{min-height:36px;min-width:64px;padding:0 10px;cursor:pointer;font:700 11px/1 "Cinzel",Georgia,serif;letter-spacing:.1em;text-transform:uppercase;color:#cfe0f2;border-radius:5px;
  background:linear-gradient(180deg,rgba(24,40,60,.85),rgba(7,13,22,.92));border:1px solid rgba(160,200,240,.25)}
.cf-seg[aria-checked="true"]{color:#fff6dc;border-color:#ffc070;box-shadow:0 0 12px rgba(255,160,70,.35),inset 0 0 0 1px rgba(255,200,120,.35)}
.cf-seg:hover{border-color:#ff9a4d}
.cf-sel{min-height:36px;max-width:100%;padding:0 8px;border-radius:5px;font:600 13px/1 Georgia,serif;color:#eaf4ff;background:#0b1420;border:1px solid rgba(255,150,70,.45)}
.cf-chk{display:inline-flex;align-items:center;justify-content:flex-end;gap:8px;min-height:36px;cursor:pointer;font:700 11px/1 "Cinzel",Georgia,serif;letter-spacing:.1em;text-transform:uppercase;color:#cfe0f2}
.cf-chk input{width:20px;height:20px;accent-color:#ffb072;cursor:pointer}
.cf-range{display:flex;align-items:center;gap:10px;justify-content:flex-end;min-width:0}
.cf-range input{width:min(200px,42vw);accent-color:#ffb072}
.cf-range output{min-width:38px;text-align:right;font:700 12px/1 "Cinzel",Georgia,serif;color:#ffd9a8}
.cf-soon{font:700 10px/1 "Cinzel",Georgia,serif;letter-spacing:.14em;text-transform:uppercase;color:#8fb0cf;padding:6px 8px;border-radius:4px;border:1px dashed rgba(143,176,207,.5)}
.cf-row.off{opacity:.6}
.cf-keys{display:grid;gap:6px}
.cf-key{display:grid;grid-template-columns:minmax(92px,auto) 1fr;gap:12px;align-items:center;padding:7px 0;border-bottom:1px dashed rgba(255,150,70,.16);font:400 13px/1.3 Georgia,serif;color:#cfe0f2}
.cf-key kbd{justify-self:start;font:700 11px/1 "Cinzel",Georgia,serif;letter-spacing:.06em;color:#ffd9a8;padding:5px 8px;border-radius:4px;background:#1a0f08;border:1px solid rgba(255,150,70,.6);white-space:nowrap}
.cf-foot{display:flex;flex-wrap:wrap;align-items:center;gap:8px;padding:10px 16px 12px;border-top:1px solid rgba(255,150,70,.3);background:rgba(4,9,16,.7)}
.cf-msg{flex:1 1 160px;min-height:18px;font:400 12px/1.3 Georgia,serif;color:#9fd3a8}
.cf-msg.err{color:#ffb3a6}
.cf-foot button{min-height:42px;padding:0 16px;cursor:pointer;font:700 12px/1 "Cinzel",Georgia,serif;letter-spacing:.14em;text-transform:uppercase;border-radius:5px;color:#eaf4ff;background:linear-gradient(180deg,rgba(24,40,60,.85),rgba(7,13,22,.92));border:1px solid rgba(255,150,70,.4)}
.cf-foot button:hover{border-color:#ff9a4d;box-shadow:0 0 16px rgba(255,120,40,.25)}
.cf-foot .cf-pri{color:#fff6dc;border-color:#ffc070;background:linear-gradient(180deg,#8a5a24,#3d2610)}
.cf-foot .cf-pri:hover{box-shadow:0 0 18px rgba(255,170,70,.45)}
@keyframes cf-in{from{opacity:0}to{opacity:1}}
@media (max-width:620px){
  .cf-row{grid-template-columns:1fr;gap:8px}
  .cf-seg-g,.cf-range,.cf-chk{justify-content:flex-start}
  .cf-key{grid-template-columns:1fr;gap:4px}
  .cf-seg{flex:1 1 auto}
  .cf-foot button{flex:1 1 auto}
}
@media (max-height:460px){ .cf-body{padding-top:8px} .cf-row{min-height:38px} }
@media (prefers-reduced-motion:reduce){.cf-back.open{animation:none}}
`;

const CONTROLES: [string, string][] = [
  ["Espaço", "Ataque básico"],
  ["Q · W · E", "Habilidades 1, 2 e 3"],
  ["R", "Habilidade suprema (ultimate)"],
  ["Shift", "Esquiva"],
  ["F", "Beber a primeira poção"],
  ["Z", "Trocar o Q do Clérigo"],
  ["J · I · T · V · B", "Diário, Mochila, Talentos, Variações e Builds"],
  ["F3", "Mostrar ou ocultar FPS e ping"],
  ["Esc", "Abrir o menu ou fechar a janela aberta"],
  ["Clique no chão", "Andar até o ponto (no celular: joystick)"],
  ["Clique num alvo", "Escolher alvo e usar a habilidade"],
];

const DESCRICAO_QUAL: Record<Qualidade, string> = { baixa: "Baixa", media: "Média", alta: "Alta" };
const DESCRICAO_EFEITOS: Record<Efeitos, string> = { nenhum: "Nenhum", reduzido: "Reduzido", todos: "Todos" };
const MODOS: Modo[] = ["bom", "sem-desenhos", "sem-sprites"];

export function mountConfiguracoes(): ConfigUi {
  const style = document.createElement("style");
  style.textContent = CSS;
  document.head.append(style);

  let rascunho: Config = { ...config() };
  let modo: Modo = modoQualidade();
  let aba: Aba = "graficos";

  const back = document.createElement("div");
  back.className = "cf-back";
  back.onclick = (e) => { if (e.target === back) fechar(); };

  const card = document.createElement("div");
  card.className = "cf-card";
  card.setAttribute("role", "dialog");
  card.setAttribute("aria-modal", "true");
  card.setAttribute("aria-labelledby", "cf-title");

  const head = document.createElement("header");
  head.className = "cf-head";
  const h = document.createElement("h2");
  h.id = "cf-title";
  h.className = "cf-title";
  h.textContent = "Configurações";
  const x = document.createElement("button");
  x.type = "button";
  x.className = "cf-x";
  x.setAttribute("aria-label", "Fechar configurações");
  x.textContent = "×";
  x.onclick = () => fechar();
  head.append(h, x);

  const nav = document.createElement("nav");
  nav.className = "cf-tabs";
  nav.setAttribute("role", "tablist");
  const tabBtns = new Map<Aba, HTMLButtonElement>();
  for (const a of ABAS) {
    const b = document.createElement("button");
    b.type = "button";
    b.className = "cf-tab";
    b.setAttribute("role", "tab");
    b.id = `cf-tab-${a.id}`;
    b.setAttribute("aria-controls", `cf-pan-${a.id}`);
    b.textContent = a.label;
    b.onclick = () => trocaAba(a.id);
    tabBtns.set(a.id, b);
    nav.append(b);
  }

  const body = document.createElement("div");
  body.className = "cf-body";
  const paineis = new Map<Aba, HTMLElement>();
  for (const a of ABAS) {
    const p = document.createElement("section");
    p.className = "cf-panel";
    p.id = `cf-pan-${a.id}`;
    p.setAttribute("role", "tabpanel");
    p.setAttribute("aria-labelledby", `cf-tab-${a.id}`);
    paineis.set(a.id, p);
    body.append(p);
  }

  const foot = document.createElement("footer");
  foot.className = "cf-foot";
  const msg = document.createElement("span");
  msg.className = "cf-msg";
  msg.setAttribute("role", "status");
  const padrao = document.createElement("button");
  padrao.type = "button";
  padrao.textContent = "Restaurar padrão";
  padrao.onclick = () => restaurar();
  const aplicar = document.createElement("button");
  aplicar.type = "button";
  aplicar.className = "cf-pri";
  aplicar.textContent = "Aplicar";
  aplicar.onclick = () => aplicarRascunho();
  foot.append(msg, padrao, aplicar);

  card.append(head, nav, body, foot);
  back.append(card);
  document.body.append(back);

  function dicaMsg(t: string, erro = false) {
    msg.textContent = t;
    msg.classList.toggle("err", erro);
  }

  // ---- controles reutilizados ----
  function linha(titulo: string, controle: HTMLElement, dica?: string): HTMLElement {
    const r = document.createElement("div");
    r.className = "cf-row";
    const t = document.createElement("span");
    t.textContent = titulo;
    if (dica) { const s = document.createElement("small"); s.textContent = dica; t.append(s); }
    r.append(t, controle);
    return r;
  }
  /** grupo de botões (escolha única), como os de Qualidade e Escala */
  function segmentos<T extends string>(opcoes: [T, string][], atual: T, onPick: (v: T) => void, nome: string): HTMLElement {
    const g = document.createElement("div");
    g.className = "cf-seg-g";
    g.setAttribute("role", "radiogroup");
    g.setAttribute("aria-label", nome);
    for (const [v, t] of opcoes) {
      const b = document.createElement("button");
      b.type = "button";
      b.className = "cf-seg";
      b.setAttribute("role", "radio");
      b.setAttribute("aria-checked", String(v === atual));
      b.textContent = t;
      b.onclick = () => onPick(v);
      g.append(b);
    }
    return g;
  }
  function select<T extends string | number>(opcoes: [T, string][], atual: T, onPick: (v: T) => void, nome: string): HTMLSelectElement {
    const s = document.createElement("select");
    s.className = "cf-sel";
    s.setAttribute("aria-label", nome);
    for (const [v, t] of opcoes) {
      const o = document.createElement("option");
      o.value = String(v);
      o.textContent = t;
      if (v === atual) o.selected = true;
      s.append(o);
    }
    s.onchange = () => {
      const pick = opcoes.find(([v]) => String(v) === s.value);
      if (pick) onPick(pick[0]);
    };
    return s;
  }
  function marca(titulo: string, atual: boolean, onPick: (v: boolean) => void, dica?: string): HTMLElement {
    const l = document.createElement("label");
    l.className = "cf-chk";
    const c = document.createElement("input");
    c.type = "checkbox";
    c.checked = atual;
    c.onchange = () => onPick(c.checked);
    const t = document.createElement("span");
    t.textContent = atual ? "Ligado" : "Desligado";
    c.addEventListener("change", () => { t.textContent = c.checked ? "Ligado" : "Desligado"; });
    l.append(c, t);
    return linha(titulo, l, dica);
  }
  function deslizador(titulo: string, atual: number, onPick: (v: number) => void, opts: { desativado?: boolean; dica?: string } = {}): HTMLElement {
    const w = document.createElement("div");
    w.className = "cf-range";
    const r = document.createElement("input");
    r.type = "range";
    r.min = "0";
    r.max = "100";
    r.step = "5";
    r.value = String(atual);
    r.disabled = !!opts.desativado;
    r.setAttribute("aria-label", titulo);
    const out = document.createElement("output");
    out.textContent = `${atual}%`;
    r.oninput = () => { out.textContent = `${r.value}%`; onPick(Number(r.value)); };
    w.append(r, out);
    if (opts.desativado) {
      const s = document.createElement("span");
      s.className = "cf-soon";
      s.textContent = "em breve";
      w.replaceChildren(s);
      return linha(titulo, w, opts.dica ?? "Ainda não há música no jogo.");
    }
    return linha(titulo, w, opts.dica);
  }

  // ---- abas ----
  function desenharGraficos() {
    const p = paineis.get("graficos")!;
    p.replaceChildren();
    const sec = document.createElement("h3");
    sec.className = "cf-sec-t";
    sec.textContent = "Qualidade";
    p.append(sec);
    p.append(linha("Qualidade geral", segmentos<Qualidade>(
      (["baixa", "media", "alta"] as Qualidade[]).map((q) => [q, DESCRICAO_QUAL[q]]),
      rascunho.qualidade,
      (q) => { rascunho = { ...rascunho, qualidade: q, ...PRESETS[q] }; desenharGraficos(); },
      "Qualidade geral",
    ), "Ajusta os itens abaixo de uma vez. Você pode mudar cada um depois."));
    p.append(linha("Limite de FPS", select<number>([[30, "30 FPS"], [60, "60 FPS"], [120, "120 FPS"], [0, "Sem limite"]], rascunho.fpsMax, (v) => { rascunho.fpsMax = v; }, "Limite de FPS"), "Menos FPS economiza bateria e aquece menos o aparelho."));
    p.append(linha("Escala de renderização", select<number>([[0.5, "50%"], [0.75, "75%"], [1, "100%"]], rascunho.escalaRender, (v) => { rascunho.escalaRender = v; }, "Escala de renderização"), "Abaixo de 100% o jogo fica mais leve e a imagem fica um pouco mais suave."));
    p.append(linha("Partículas e efeitos", segmentos<Efeitos>(
      (["nenhum", "reduzido", "todos"] as Efeitos[]).map((e) => [e, DESCRICAO_EFEITOS[e]]),
      rascunho.efeitos,
      (e) => { rascunho.efeitos = e; desenharGraficos(); },
      "Partículas e efeitos",
    ), "Faíscas e brilhos de combate."));
    const sec2 = document.createElement("h3");
    sec2.className = "cf-sec-t";
    sec2.textContent = "Informações na tela";
    p.append(sec2);
    p.append(marca("Mostrar FPS", rascunho.mostrarFps, (v) => { rascunho.mostrarFps = v; }, "Contador de quadros por segundo (canto superior direito). F3 liga ou desliga o painel."));
    p.append(marca("Mostrar ping", rascunho.mostrarPing, (v) => { rascunho.mostrarPing = v; }, "Tempo de resposta até o servidor e jogadores online."));
    const sec3 = document.createElement("h3");
    sec3.className = "cf-sec-t";
    sec3.textContent = "Diagnóstico";
    p.append(sec3);
    p.append(linha("Modo de teste", select<Modo>(
      MODOS.map((m) => [m, NOME_MODO[m]]),
      modo,
      (m) => { modo = m; },
      "Modo de teste",
    ), "Teste A e B servem para achar o gargalo de FPS. Ao aplicar, a página recarrega."));
  }

  function desenharInterface() {
    const p = paineis.get("interface")!;
    p.replaceChildren();
    const sec = document.createElement("h3");
    sec.className = "cf-sec-t";
    sec.textContent = "Interface";
    p.append(sec);
    p.append(linha("Escala da interface", segmentos<EscalaUi>(
      ESCALAS_UI.map((e) => [e.id, e.label]),
      rascunho.escalaUi,
      (v) => { rascunho.escalaUi = v; desenharInterface(); },
      "Escala da interface",
    ), "Tamanho dos botões e da HUD, no computador e no celular."));
    const sec2 = document.createElement("h3");
    sec2.className = "cf-sec-t";
    sec2.textContent = "Combate";
    p.append(sec2);
    p.append(marca("Números de dano", rascunho.numDano, (v) => { rascunho.numDano = v; }, "Valores que sobem ao acertar ou ser atingido."));
    p.append(marca("Números de cura", rascunho.numCura, (v) => { rascunho.numCura = v; }, "Valores de cura que sobem sobre o personagem."));
    p.append(marca("Nomes sobre personagens", rascunho.nomes, (v) => { rascunho.nomes = v; }, "Nome e nível de jogadores e monstros."));
    const sec3 = document.createElement("h3");
    sec3.className = "cf-sec-t";
    sec3.textContent = "Posição da HUD";
    p.append(sec3);
    const r = document.createElement("div");
    r.className = "cf-row full";
    const s = document.createElement("span");
    s.textContent = "Mover os blocos da HUD";
    const small = document.createElement("small");
    small.textContent = "Ainda não é possível arrastar os blocos. Por enquanto a escala acima é o único ajuste de tamanho.";
    s.append(small);
    const tag = document.createElement("span");
    tag.className = "cf-soon";
    tag.textContent = "em breve";
    r.append(s, tag);
    p.append(r);
  }

  function desenharSom() {
    const p = paineis.get("som")!;
    p.replaceChildren();
    const sec = document.createElement("h3");
    sec.className = "cf-sec-t";
    sec.textContent = "Volumes";
    p.append(sec);
    p.append(deslizador("Volume geral", rascunho.somGeral, (v) => { rascunho.somGeral = v; }, { dica: "Zero desliga todo o som." }));
    p.append(deslizador("Efeitos", rascunho.somEfeitos, (v) => { rascunho.somEfeitos = v; }, { dica: "Golpes, magias, cura e sons de interface." }));
    p.append(deslizador("Música", rascunho.somMusica, (v) => { rascunho.somMusica = v; }, { desativado: true }));
  }

  function desenharControles() {
    const p = paineis.get("controles")!;
    p.replaceChildren();
    const sec = document.createElement("h3");
    sec.className = "cf-sec-t";
    sec.textContent = "Atalhos";
    p.append(sec);
    const lista = document.createElement("div");
    lista.className = "cf-keys";
    for (const [tecla, acao] of CONTROLES) {
      const r = document.createElement("div");
      r.className = "cf-key";
      const k = document.createElement("kbd");
      k.textContent = tecla;
      const t = document.createElement("span");
      t.textContent = acao;
      r.append(k, t);
      lista.append(r);
    }
    p.append(lista);
  }

  function desenharTudo() {
    desenharGraficos();
    desenharInterface();
    desenharSom();
    desenharControles();
  }

  function trocaAba(a: Aba) {
    aba = a;
    for (const [id, b] of tabBtns) {
      const on = id === a;
      b.setAttribute("aria-selected", String(on));
      b.tabIndex = on ? 0 : -1;
    }
    for (const [id, p] of paineis) p.hidden = id !== a;
  }

  /** "Aplicar": salva e avisa o jogo; se o modo de teste mudou, recarrega (ele só vale na carga da página) */
  function aplicarRascunho() {
    const mudouModo = modo !== modoQualidade();
    salvarConfig(rascunho);
    if (mudouModo) {
      setModo(modo);
      dicaMsg("Aplicado. Recarregando para o modo de teste…");
      setTimeout(() => location.reload(), 300);
      return;
    }
    dicaMsg("Configurações aplicadas.");
  }

  /** "Restaurar padrão": volta tudo ao padrão e aplica na hora */
  function restaurar() {
    rascunho = { ...PADRAO };
    const mudouModo = modoQualidade() !== "bom";
    salvarConfig(rascunho);
    desenharTudo();
    if (mudouModo) {
      setModo("bom");
      dicaMsg("Padrão restaurado. Recarregando…");
      setTimeout(() => location.reload(), 300);
      return;
    }
    modo = "bom";
    dicaMsg("Padrão restaurado.");
  }

  function abrir() {
    rascunho = { ...config() };
    modo = modoQualidade();
    desenharTudo();
    trocaAba(aba);
    dicaMsg("");
    back.classList.add("open");
    tabBtns.get(aba)?.focus();
  }
  function fechar() {
    back.classList.remove("open");
  }

  trocaAba(aba);
  window.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && back.classList.contains("open")) { e.preventDefault(); fechar(); }
  });
  return { abrir, fechar };
}
