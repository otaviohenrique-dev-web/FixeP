import { CHAT_MAX_LEN } from "@frixep/shared";

/**
 * Chat da zona em DOM, no mesmo estilo da HUD (molduras de cantos suaves, ouro velho sobre azul-noite, Cinzel).
 *  - Enter abre o campo (e envia); Esc fecha; fechado, as mensagens aparecem e somem (fade);
 *  - no celular há um botão de balão que abre o painel e o teclado;
 *  - o texto SEMPRE entra por textContent (nunca innerHTML) e o servidor é quem decide nome e conteúdo.
 */
export interface ChatOptions {
  send(text: string): void;
}
export interface ChatUi {
  add(name: string, text: string, mine: boolean): void;
  /** mensagem do chat de grupo (/g), em outra cor */
  addGroup(name: string, text: string, mine: boolean): void;
  /** aviso do sistema (ex.: "fale mais devagar") */
  system(text: string): void;
  isTyping(): boolean;
}

const CSS = `
.ch{position:fixed;left:max(12px,env(safe-area-inset-left));bottom:calc(max(10px,env(safe-area-inset-bottom)) + 18px);z-index:16;width:min(380px,calc(100vw - 24px));
  font-family:"Cinzel",Georgia,serif;color:#e6eef9;pointer-events:none;--gold:#c9a45c;--gold-d:#7a5f2e;--ink:#0c121c;--ink2:#161f2e}
.ch-log{max-height:160px;overflow-y:auto;overscroll-behavior:contain;display:flex;flex-direction:column;gap:2px;padding:6px 8px;border-radius:10px;
  background:rgba(8,12,20,0);border:2px solid transparent;scrollbar-width:thin;scrollbar-color:var(--gold-d) transparent;transition:background .15s,border-color .15s}
.ch.open .ch-log{background:rgba(8,12,20,.82);border-color:var(--gold-d);pointer-events:auto;box-shadow:0 0 0 1px #000,inset 0 0 0 1px rgba(255,225,160,.18)}
.ch-line{font:600 12px/1.35 "Cinzel",Georgia,serif;word-break:break-word;text-shadow:0 1px 3px #000,0 0 4px #000;transition:opacity .6s}
.ch:not(.open) .ch-line.old{opacity:0;height:0;overflow:hidden}
.ch-line b{color:#f0dfb8;font-weight:800;margin-right:4px}
.ch-line.me b{color:#9fd0ff}
.ch-line.grp{color:#bfeccd}
.ch-line.grp b{color:#8fe0b0}
.ch-line.grp.me b{color:#9fd0ff}
.ch-line.sys{color:#ffb3a6;font-style:italic}
.ch-row{display:none;margin-top:6px;pointer-events:auto}
.ch.open .ch-row{display:block}
.ch-in{width:100%;box-sizing:border-box;padding:8px 10px;border-radius:10px;border:2px solid var(--gold);background:linear-gradient(180deg,var(--ink2),var(--ink));
  color:#f4ecd8;font:600 13px/1.2 "Cinzel",Georgia,serif;outline:none;box-shadow:0 0 0 1px #000,0 4px 12px rgba(0,0,0,.6)}
.ch-in::placeholder{color:#7d8aa0}
.ch-btn{display:none;position:absolute;left:0;bottom:calc(100% + 8px);width:44px;height:44px;border-radius:10px;border:2px solid var(--gold-d);padding:0;cursor:pointer;pointer-events:auto;
  background:linear-gradient(180deg,#22304a,#0d1522);color:var(--gold);box-shadow:inset 0 0 0 1px rgba(255,225,160,.2),0 2px 6px rgba(0,0,0,.6);touch-action:manipulation;-webkit-tap-highlight-color:transparent}
.ch-btn svg{display:block;margin:auto}
@media (min-width:821px) and (max-width:1100px){.ch{bottom:calc(max(10px,env(safe-area-inset-bottom)) + 92px);width:min(380px,calc(100vw - 24px))}}
@media (pointer:coarse){.ch-btn{display:block}.ch{bottom:calc(max(10px,env(safe-area-inset-bottom)) + 90px)}}
`;

const BUBBLE = `<svg viewBox="0 0 16 16" width="22" height="22" shape-rendering="crispEdges"><path fill="currentColor" d="M2 2h12v1h1v8h-1v1H9v1H8v1H7v-1H6v-1H4v-1H3v-1H2v-1H1V3h1z"/><path fill="#0c121c" d="M4 5h8v1H4zM4 8h5v1H4z"/></svg>`;

const MAX_LINES = 80;
const FADE_AFTER_MS = 8000;

export function mountChat(opts: ChatOptions): ChatUi {
  const style = document.createElement("style");
  style.textContent = CSS;
  document.head.appendChild(style);

  const root = document.createElement("div");
  root.className = "ch";
  const log = document.createElement("div");
  log.className = "ch-log";
  log.setAttribute("role", "log");
  log.setAttribute("aria-live", "polite");
  const row = document.createElement("div");
  row.className = "ch-row";
  const input = document.createElement("input");
  input.className = "ch-in";
  input.type = "text";
  input.maxLength = CHAT_MAX_LEN;
  input.autocomplete = "off";
  input.spellcheck = false;
  input.placeholder = "Falar à zona… (/g grupo · /pt nome convida)";
  input.setAttribute("aria-label", "Mensagem de chat");
  row.appendChild(input);
  const btn = document.createElement("button");
  btn.className = "ch-btn";
  btn.type = "button";
  btn.setAttribute("aria-label", "Abrir chat");
  btn.innerHTML = BUBBLE; // ícone fixo do próprio código (nenhum dado de jogador)
  root.append(btn, log, row);
  document.body.appendChild(root);

  const isOpen = () => root.classList.contains("open");
  const typing = () => isOpen() && document.activeElement === input;

  function open() {
    root.classList.add("open");
    for (const l of Array.from(log.children)) l.classList.remove("old");
    log.scrollTop = log.scrollHeight;
    input.focus();
  }
  function close() {
    root.classList.remove("open");
    input.value = "";
    input.blur();
    for (const l of Array.from(log.children)) l.classList.add("old");
  }

  function push(line: HTMLElement) {
    const stick = log.scrollTop + log.clientHeight >= log.scrollHeight - 8;
    log.appendChild(line);
    while (log.children.length > MAX_LINES) log.firstElementChild?.remove();
    if (stick || !isOpen()) log.scrollTop = log.scrollHeight;
    if (!isOpen()) setTimeout(() => { if (!isOpen()) line.classList.add("old"); }, FADE_AFTER_MS);
    else setTimeout(() => line.classList.add("old"), FADE_AFTER_MS); // ao fechar, já está "velha" se passou o tempo
  }

  // Capture: roda antes do menu (Esc) e do teclado de combate, e segura as teclas enquanto se digita.
  window.addEventListener("keydown", (e) => {
    if (typing()) {
      e.stopImmediatePropagation(); // nada de combate (Espaço, 1-3, Q, Shift) enquanto digita
      if (e.key === "Escape") { e.preventDefault(); close(); }
      else if (e.key === "Enter") {
        e.preventDefault();
        const text = input.value.trim();
        if (text) opts.send(text);
        close();
      }
      return;
    }
    if (e.key === "Enter" && !e.repeat && !document.querySelector(".gm-back.open") && !(document.activeElement instanceof HTMLInputElement)) {
      e.preventDefault();
      e.stopImmediatePropagation();
      open();
    }
  }, true);
  window.addEventListener("keyup", (e) => { if (typing()) e.stopImmediatePropagation(); }, true);

  btn.addEventListener("click", () => (isOpen() ? close() : open()));

  return {
    add(name, text, mine) {
      const line = document.createElement("div");
      line.className = "ch-line" + (mine ? " me" : "");
      const who = document.createElement("b");
      who.textContent = `${name}:`;
      const body = document.createElement("span");
      body.textContent = text;
      line.append(who, body);
      push(line);
    },
    addGroup(name, text, mine) {
      const line = document.createElement("div");
      line.className = "ch-line grp" + (mine ? " me" : "");
      const who = document.createElement("b");
      who.textContent = `[Grupo] ${name}:`;
      const body = document.createElement("span");
      body.textContent = text;
      line.append(who, body);
      push(line);
    },
    system(text) {
      const line = document.createElement("div");
      line.className = "ch-line sys";
      line.textContent = text;
      push(line);
    },
    isTyping: typing,
  };
}
