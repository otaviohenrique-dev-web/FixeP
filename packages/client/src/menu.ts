import { installMode, onInstallChange, runInstall } from "./pwa";
import { isTypingTarget } from "./keys";
import { cycleHudScale, hudScaleLabel } from "./mobile";
import { modoQualidade, NOME_MODO, proximoModo, setModo } from "./quality";
/** Menu simples dentro do jogo: continuar ou desconectar (volta para a tela de login). */

export interface GameMenuOptions {
  playerName: string;
  onLogout(): void | Promise<void>;
  onPerf?(): void; // medir desempenho (30 s e relatório para copiar)
  /** atalhos de painéis que ficam no menu (Diário, Variações...): fecham o menu e abrem o painel */
  acoes?: { label: string; run(): void }[];
}

const CSS = `
.gm-btn{position:fixed;top:max(14px,env(safe-area-inset-top));right:14px;z-index:20;width:44px;height:44px;border-radius:50%;display:grid;place-items:center;cursor:pointer;color:#bcd8f5;
  background:rgba(8,16,28,.7);border:1px solid rgba(160,200,240,.3);backdrop-filter:blur(6px);-webkit-backdrop-filter:blur(6px);transition:border-color .18s,color .18s,box-shadow .18s}
.gm-btn:hover,.gm-btn:focus-visible{color:#fff;border-color:#ff9a4d;box-shadow:0 0 16px rgba(255,120,40,.35)}
.gm-btn:focus-visible,.gm-item:focus-visible{outline:2px solid #ffd2a3;outline-offset:2px}
.gm-btn svg{width:22px;height:22px}
.gm-back{position:fixed;inset:0;z-index:21;display:none;flex-direction:column;align-items:center;overflow-y:auto;background:rgba(2,5,11,.6);backdrop-filter:blur(3px);-webkit-backdrop-filter:blur(3px);padding:12px;font-family:"Cinzel",Georgia,serif}
.gm-back.open{display:flex;animation:gm-in .18s ease-out}
.gm-card{flex:none;margin:auto 0;width:min(320px,100%);padding:18px 20px 14px;border-radius:8px;color:#dbeaff;text-align:center;
  background:linear-gradient(180deg,rgba(20,34,52,.96),rgba(6,12,20,.98));border:1px solid rgba(255,150,70,.4);box-shadow:0 18px 50px rgba(0,0,0,.7),inset 0 1px 0 rgba(180,220,255,.12)}
.gm-title{margin:0;font-size:15px;font-weight:700;letter-spacing:.4em;text-indent:.4em;text-transform:uppercase;color:#ffb072;text-shadow:0 0 14px rgba(255,120,40,.5)}
.gm-who{margin:8px 0 18px;font:400 13px/1.3 Georgia,serif;color:#8fb0cf;word-break:break-word}
.gm-item{display:block;width:100%;min-height:48px;margin-top:10px;border-radius:5px;cursor:pointer;font:700 13px/1 "Cinzel",Georgia,serif;letter-spacing:.14em;text-transform:uppercase;color:#eaf4ff;
  background:linear-gradient(180deg,rgba(24,40,60,.85),rgba(7,13,22,.92));border:1px solid rgba(255,150,70,.38);transition:border-color .18s,box-shadow .18s,transform .18s}
.gm-item:hover,.gm-item:focus-visible{border-color:#ff9a4d;box-shadow:0 0 20px rgba(255,120,40,.3);transform:translateY(-1px)}
.gm-item.gm-danger{border-color:rgba(255,110,90,.5);color:#ffb3a6}
.gm-item.gm-danger:hover,.gm-item.gm-danger:focus-visible{border-color:#ff6a5a;box-shadow:0 0 20px rgba(255,80,60,.3)}
.gm-item:disabled{opacity:.55;cursor:wait}
@keyframes gm-in{from{opacity:0}to{opacity:1}}
@media (prefers-reduced-motion:reduce){.gm-back.open{animation:none}}
`;

const ICON = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round"><path d="M4 7h16M4 12h16M4 17h16"/></svg>`;

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

  const resume = document.createElement("button");
  resume.type = "button";
  resume.className = "gm-item";
  resume.textContent = "Continuar";

  const logout = document.createElement("button");
  logout.type = "button";
  logout.className = "gm-item gm-danger";
  logout.textContent = "Desconectar";

  const hs = document.createElement("button"); // tamanho da HUD (só aparece no celular)
  hs.type = "button";
  hs.className = "gm-item gm-hs";
  hs.textContent = `HUD: ${hudScaleLabel()}`;
  hs.onclick = () => { hs.textContent = `HUD: ${cycleHudScale()}`; };

  const inst = document.createElement("button"); // "Instalar app" (some quando já está instalado)
  inst.type = "button";
  inst.className = "gm-item";
  const hint = document.createElement("p");
  hint.className = "gm-who";
  hint.hidden = true;
  hint.textContent = "No iPhone/iPad: toque em Compartilhar e depois em \"Adicionar à Tela de Início\".";
  const syncInst = () => { const m = installMode(); inst.hidden = m === null; if (m === null) hint.hidden = true; inst.textContent = "Instalar app"; };
  syncInst();
  onInstallChange(syncInst);
  inst.onclick = async () => { if (installMode() === "ios") hint.hidden = !hint.hidden; else await runInstall(); };

  const qual = document.createElement("button"); // Gráficos: Bom / Teste A / Teste B (recarrega para aplicar)
  qual.type = "button";
  qual.className = "gm-item";
  qual.textContent = `Gráficos: ${NOME_MODO[modoQualidade()]}`;
  qual.onclick = () => { setModo(proximoModo()); location.reload(); };

  const perf = document.createElement("button"); // medição de FPS/desempenho para mandar o relatório
  perf.type = "button";
  perf.className = "gm-item";
  perf.textContent = "Medir desempenho";
  perf.onclick = () => { close(); opts.onPerf?.(); };

  const extras = (opts.acoes ?? []).map((a) => {
    const b = document.createElement("button");
    b.type = "button";
    b.className = "gm-item";
    b.textContent = a.label;
    b.onclick = () => { close(); a.run(); };
    return b;
  });

  card.append(title, who, resume, ...extras, hs, qual, perf, inst, hint, logout);
  back.append(card);
  document.body.append(btn, back);

  const open = () => {
    back.classList.add("open");
    resume.focus();
  };
  const close = () => {
    back.classList.remove("open");
    btn.focus();
  };
  const isOpen = () => back.classList.contains("open");

  btn.onclick = () => (isOpen() ? close() : open());
  resume.onclick = close;
  back.onclick = (e) => {
    if (e.target === back) close(); // clique fora do cartão
  };
  logout.onclick = async () => {
    logout.disabled = true;
    resume.disabled = true;
    logout.textContent = "Saindo...";
    await opts.onLogout();
  };
  window.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && !isTypingTarget()) (isOpen() ? close : open)();
  });
}
