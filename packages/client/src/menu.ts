import { installMode, onInstallChange, runInstall } from "./pwa";
import { isTypingTarget } from "./keys";
import { type AtalhoJogo, ICONES_JOGO } from "./barra-jogo";
/**
 * Menu ☰ do jogo, separado em três seções:
 * - Jogo: Diário, Mochila, Talentos, Variações e Builds (ícone + tecla). É a gaveta do celular; no computador a barra no topo faz o mesmo.
 * - Sistema: Configurações (janela com abas), Instalar app e Desconectar.
 * - Administração: só aparece para admin (botão "Painel", via addAcao).
 */

export interface GameMenuOptions {
  playerName: string;
  onLogout(): void | Promise<void>;
  /** atalhos de jogo (mesma lista da barra do computador) */
  jogo: AtalhoJogo[];
  /** abre a janela de Configurações */
  onConfig(): void;
}

const CSS = `
.gm-btn{position:fixed;top:max(14px,env(safe-area-inset-top));right:14px;z-index:20;width:44px;height:44px;border-radius:50%;display:grid;place-items:center;cursor:pointer;color:#bcd8f5;
  background:rgba(8,16,28,.7);border:1px solid rgba(160,200,240,.3);backdrop-filter:blur(6px);-webkit-backdrop-filter:blur(6px);transition:border-color .18s,color .18s,box-shadow .18s}
.gm-btn:hover,.gm-btn:focus-visible{color:#fff;border-color:#ff9a4d;box-shadow:0 0 16px rgba(255,120,40,.35)}
.gm-btn:focus-visible,.gm-item:focus-visible,.gm-tile:focus-visible{outline:2px solid #ffd2a3;outline-offset:2px}
.gm-btn svg{width:22px;height:22px}
.gm-back{position:fixed;inset:0;z-index:21;display:none;flex-direction:column;align-items:center;overflow-x:hidden;overflow-y:auto;background:rgba(2,5,11,.6);backdrop-filter:blur(3px);-webkit-backdrop-filter:blur(3px);padding:12px;font-family:"Cinzel",Georgia,serif}
.gm-back.open{display:flex;animation:gm-in .18s ease-out}
.gm-card{flex:none;margin:auto 0;width:min(340px,calc(100% - 4px));min-width:0;box-sizing:border-box;padding:16px 18px 14px;border-radius:8px;color:#dbeaff;text-align:center;
  background:linear-gradient(180deg,rgba(20,34,52,.96),rgba(6,12,20,.98));border:1px solid rgba(255,150,70,.4);box-shadow:0 18px 50px rgba(0,0,0,.7),inset 0 1px 0 rgba(180,220,255,.12)}
.gm-title{margin:0;font-size:15px;font-weight:700;letter-spacing:.4em;text-indent:.4em;text-transform:uppercase;color:#ffb072;text-shadow:0 0 14px rgba(255,120,40,.5)}
.gm-who{margin:6px 0 4px;font:400 13px/1.3 Georgia,serif;color:#8fb0cf;word-break:break-word}
.gm-sec{margin-top:14px;text-align:left}
.gm-sec[hidden]{display:none}
.gm-sec h3{margin:0 0 7px;font:700 10px/1 "Cinzel",Georgia,serif;letter-spacing:.28em;text-transform:uppercase;color:#d9a46a;padding-bottom:5px;border-bottom:1px solid rgba(255,150,70,.25)}
.gm-grid{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1fr);gap:7px}
.gm-tile{display:flex;align-items:center;gap:7px;min-width:0;min-height:46px;padding:0 9px;border-radius:6px;cursor:pointer;position:relative;color:#eaf4ff;font:700 12px/1.1 "Cinzel",Georgia,serif;letter-spacing:.08em;text-align:left;
  background:linear-gradient(180deg,rgba(24,40,60,.85),rgba(7,13,22,.92));border:1px solid rgba(255,150,70,.36);transition:border-color .18s,box-shadow .18s,transform .18s}
.gm-tile svg{width:18px;height:18px;flex:none;color:#ffb072}
.gm-tile .gm-nome{min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:11px;letter-spacing:.01em}
.gm-tile.gm-on{border-color:#ffd45e;box-shadow:inset 0 0 0 1px rgba(255,212,94,.5)}
.gm-tile:hover,.gm-tile:focus-visible{border-color:#ff9a4d;box-shadow:0 0 18px rgba(255,120,40,.3);transform:translateY(-1px)}
.gm-tile kbd{margin-left:auto;flex:none;font:700 10px/1 "Cinzel",Georgia,serif;color:#ffd9a8;padding:3px 5px;border-radius:4px;background:#1a0f08;border:1px solid rgba(255,150,70,.6)}
.gm-tile .ut-dot{position:absolute;top:-4px;right:-4px}
.gm-list{display:flex;flex-direction:column;gap:7px}
.gm-item{display:flex;align-items:center;gap:10px;width:100%;min-height:44px;padding:0 12px;border-radius:5px;cursor:pointer;font:700 13px/1 "Cinzel",Georgia,serif;letter-spacing:.14em;text-transform:uppercase;color:#eaf4ff;text-align:left;
  background:linear-gradient(180deg,rgba(24,40,60,.85),rgba(7,13,22,.92));border:1px solid rgba(255,150,70,.38);transition:border-color .18s,box-shadow .18s,transform .18s}
.gm-item svg{width:18px;height:18px;flex:none;color:#ffb072}
.gm-item:hover,.gm-item:focus-visible{border-color:#ff9a4d;box-shadow:0 0 20px rgba(255,120,40,.3);transform:translateY(-1px)}
.gm-item.gm-danger{border-color:rgba(255,110,90,.5);color:#ffb3a6}
.gm-item.gm-danger svg{color:#ff9a8a}
.gm-item.gm-danger:hover,.gm-item.gm-danger:focus-visible{border-color:#ff6a5a;box-shadow:0 0 20px rgba(255,80,60,.3)}
.gm-item:disabled{opacity:.55;cursor:wait}
.gm-cont{margin-top:14px;width:100%;min-height:42px;border-radius:5px;cursor:pointer;font:700 12px/1 "Cinzel",Georgia,serif;letter-spacing:.2em;text-transform:uppercase;color:#ffe2bd;background:transparent;border:1px solid rgba(255,150,70,.5)}
.gm-cont:hover,.gm-cont:focus-visible{border-color:#ff9a4d;box-shadow:0 0 16px rgba(255,120,40,.25)}
.gm-hint{margin:6px 2px 0;font:400 12px/1.35 Georgia,serif;color:#8fb0cf}
@keyframes gm-in{from{opacity:0}to{opacity:1}}
@media (prefers-reduced-motion:reduce){.gm-back.open{animation:none}}
`;

const ICON = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round"><path d="M4 7h16M4 12h16M4 17h16"/></svg>`;
const svg = (inner: string) => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${inner}</svg>`;
const ICONE_CONFIG = `<circle cx="12" cy="12" r="3"/><path d="M12 2.5v3M12 18.5v3M2.5 12h3M18.5 12h3M5.3 5.3l2.1 2.1M16.6 16.6l2.1 2.1M5.3 18.7l2.1-2.1M16.6 7.4l2.1-2.1"/>`;
const ICONE_INSTALAR = `<path d="M12 4v11M7 10l5 5 5-5M5 20h14"/>`;
const ICONE_SAIR = `<path d="M10 4H5v16h5M14 8l4 4-4 4M18 12H9"/>`;
const ICONE_ADMIN = `<path d="M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6z"/>`;

export function mountGameMenu(opts: GameMenuOptions) {
  const style = document.createElement("style");
  style.textContent = CSS;
  document.head.append(style);

  const btn = document.createElement("button");
  btn.type = "button";
  btn.className = "gm-btn";
  btn.setAttribute("aria-label", "Abrir menu");
  btn.setAttribute("aria-haspopup", "dialog");
  btn.innerHTML = ICON;

  const back = document.createElement("div");
  back.className = "gm-back";
  const card = document.createElement("div");
  card.className = "gm-card";
  card.setAttribute("role", "dialog");
  card.setAttribute("aria-modal", "true");
  card.setAttribute("aria-label", "Menu do jogo");

  const title = document.createElement("h2");
  title.className = "gm-title";
  title.textContent = "Menu";
  const who = document.createElement("p");
  who.className = "gm-who";
  who.textContent = `Conectado como ${opts.playerName}`; // textContent: nome vem de conta externa

  // ---- Jogo ----
  const secJogo = document.createElement("section");
  secJogo.className = "gm-sec";
  secJogo.append(titulo("Jogo"));
  const grade = document.createElement("div");
  grade.className = "gm-grid";
  const tiles = opts.jogo.map((it) => {
    const b = document.createElement("button");
    b.type = "button";
    b.className = "gm-tile";
    b.setAttribute("aria-keyshortcuts", it.tecla);
    b.innerHTML = svg(it.icone);
    const nome = document.createElement("span");
    nome.textContent = it.label;
    nome.className = "gm-nome";
    const tecla = document.createElement("kbd");
    tecla.textContent = it.tecla;
    b.append(nome, tecla);
    b.onclick = () => { close(); it.run(); };
    grade.append(b);
    return { it, b };
  });
  secJogo.append(grade);

  // ---- Sistema ----
  const secSistema = document.createElement("section");
  secSistema.className = "gm-sec";
  secSistema.append(titulo("Sistema"));
  const lista = document.createElement("div");
  lista.className = "gm-list";

  const configBtn = botao("Configurações", ICONE_CONFIG, () => { close(); opts.onConfig(); });

  const inst = botao("Instalar app", ICONE_INSTALAR, async () => { if (installMode() === "ios") hint.hidden = !hint.hidden; else await runInstall(); });
  const hint = document.createElement("p"); // iPhone: a instalação é pelo menu do Safari
  hint.className = "gm-hint";
  hint.hidden = true;
  hint.textContent = "No iPhone/iPad: toque em Compartilhar e depois em \"Adicionar à Tela de Início\".";
  const syncInst = () => { const m = installMode(); inst.hidden = m === null; if (m === null) hint.hidden = true; };
  syncInst();
  onInstallChange(syncInst);

  // proteção contra clique acidental: o 1º clique só arma; o 2º (em até 4 s) é que desconecta
  let saidaArmada: number | undefined;
  const logout = botao("Desconectar", ICONE_SAIR, async () => {
    const rotulo = logout.querySelector("span")!;
    if (saidaArmada === undefined) {
      rotulo.textContent = "Clique de novo para sair";
      saidaArmada = window.setTimeout(() => { saidaArmada = undefined; rotulo.textContent = "Desconectar"; }, 4000);
      return;
    }
    window.clearTimeout(saidaArmada);
    saidaArmada = undefined;
    logout.disabled = true;
    rotulo.textContent = "Saindo...";
    await opts.onLogout();
  });
  logout.classList.add("gm-danger");
  lista.append(configBtn, inst, hint, logout);
  secSistema.append(lista);

  // ---- Administração (só aparece com addAcao, que o painel chama para admin) ----
  const secAdmin = document.createElement("section");
  secAdmin.className = "gm-sec";
  secAdmin.hidden = true;
  secAdmin.append(titulo("Administração"));
  const listaAdmin = document.createElement("div");
  listaAdmin.className = "gm-list";
  secAdmin.append(listaAdmin);

  const resume = document.createElement("button");
  resume.type = "button";
  resume.className = "gm-cont";
  resume.textContent = "Continuar";

  card.append(title, who, secJogo, secSistema, secAdmin, resume);
  back.append(card);
  document.body.append(btn, back);

  function titulo(t: string) {
    const h = document.createElement("h3");
    h.textContent = t;
    return h;
  }
  function botao(label: string, icone: string, run: () => void | Promise<void>) {
    const b = document.createElement("button");
    b.type = "button";
    b.className = "gm-item";
    b.innerHTML = svg(icone);
    const s = document.createElement("span");
    s.textContent = label;
    b.append(s);
    b.onclick = () => void run();
    return b;
  }

  const open = () => {
    back.classList.add("open");
    resume.focus();
  };
  const close = () => {
    back.classList.remove("open");
    btn.focus();
  };
  const isOpen = () => back.classList.contains("open");

  /** Painel (admin): entra na seção Administração, sem mexer no resto do menu */
  const addAcao = (label: string, run: () => void | Promise<void>) => {
    const b = botao(label, ICONE_ADMIN, () => { close(); return run(); });
    listaAdmin.append(b);
    secAdmin.hidden = false;
  };

  btn.onclick = () => (isOpen() ? close() : open());
  resume.onclick = close;
  back.onclick = (e) => {
    if (e.target === back) close(); // clique fora do cartão
  };
  window.addEventListener("keydown", (e) => {
    if (e.key !== "Escape" || isTypingTarget()) return;
    if (document.querySelector(".cf-back.open")) return; // com a janela de Configurações aberta, o ESC é dela
    (isOpen() ? close : open)();
  });
  // Atalhos do jogo que o menu mostra com a tecla: o ponto de pendência acompanha os painéis
  window.setInterval(() => {
    for (const { it, b } of tiles) b.classList.toggle("gm-on", !!it.aberto?.());
  }, 700);
  return { addAcao };
}
