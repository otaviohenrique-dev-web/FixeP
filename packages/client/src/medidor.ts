import { isTypingTarget } from "./keys";
/**
 * Medidor de dano e cura (estilo "Stats (dmg)" do Albion).
 * - Janela pequena, recolhível e arrastável (PC); no celular fica compacta e fecha com ✕.
 * - Duas abas separadas: Dano e Cura (nunca somadas).
 * - Lista só o GRUPO de quem mede (ou só ele, se estiver sozinho), do maior para o menor.
 * - Números vêm dos eventos do servidor: Evt.Hit (`by`, `dmg`) e Evt.Heal (`by` ou `from` ou o próprio `id`, `amount`).
 * - Tempo de combate: soma os intervalos entre eventos seguidos (um intervalo maior que 10 s para a contagem).
 * - Tecla M abre e fecha; também abre pelo menu ☰ (seção Jogo).
 */

export interface MembroMedidor { id: string; name: string; cls: string }

export interface Medidor {
  /** dano causado por `by` (sessão de quem bateu) */
  dano(by: string, valor: number): void;
  /** cura feita por `by` (sessão de quem curou) */
  cura(by: string, valor: number): void;
  toggle(): void;
  open(): void;
  close(): void;
  isOpen(): boolean;
}

export interface MedidorOpts {
  /** sessão de quem está jogando */
  meuId(): string;
  /** membros do grupo de quem está jogando (inclui ele); sozinho, só ele */
  grupo(): MembroMedidor[];
}

type Aba = "dano" | "cura";

const KEY_POS = "frixep.medidor.pos";
const KEY_REC = "frixep.medidor.rec";
const INATIVO_MS = 10_000; // mais que isso sem golpe/cura = fim do combate (o tempo para de contar)

const CLASSES: Record<string, { nome: string; letra: string; cor: string }> = {
  warrior: { nome: "Guerreiro", letra: "G", cor: "#b5462f" },
  archer: { nome: "Arqueiro", letra: "A", cor: "#5a9e3a" },
  cleric: { nome: "Clérigo", letra: "C", cor: "#d4b23e" },
  mage: { nome: "Mago", letra: "M", cor: "#4a7fd6" },
};
const classe = (c: string) => CLASSES[c] ?? { nome: "Aventureiro", letra: "?", cor: "#7a8aa0" };

const CSS = `
.md-win{position:fixed;top:max(66px,calc(env(safe-area-inset-top) + 62px));right:14px;z-index:19;width:272px;box-sizing:border-box;display:none;
  font-family:"Cinzel",Georgia,serif;color:#e6eef9;border-radius:8px;overflow:hidden;background:linear-gradient(180deg,rgba(18,28,44,.96),rgba(6,11,19,.97));
  border:1px solid rgba(201,164,92,.5);box-shadow:0 10px 28px rgba(0,0,0,.6);user-select:none;-webkit-user-select:none}
.md-win.open{display:block}
.md-head{display:flex;align-items:center;gap:6px;padding:6px 8px;cursor:move;background:rgba(0,0,0,.35);border-bottom:1px solid rgba(201,164,92,.25);touch-action:none}
.md-title{flex:1;font:700 11px/1 "Cinzel",Georgia,serif;letter-spacing:.16em;text-transform:uppercase;color:#f0dfb8}
.md-b{display:grid;place-items:center;min-width:24px;height:22px;padding:0 6px;border-radius:5px;cursor:pointer;color:#e9c98a;background:#131d2d;border:1px solid rgba(201,164,92,.5);
  font:700 11px/1 "Cinzel",Georgia,serif;touch-action:manipulation;-webkit-tap-highlight-color:transparent}
.md-b:hover,.md-b:focus-visible{border-color:#f0cf86;color:#fff3cf;outline:none}
.md-col{transition:transform .2s}
.md-win.rec .md-col{transform:rotate(-90deg)}
.md-body{padding:8px 9px 9px}
.md-win.rec .md-body{display:none}
.md-top{display:flex;align-items:center;gap:6px}
.md-tabs{display:flex;flex:1;gap:4px}
.md-tab{flex:1;height:24px;border-radius:5px;cursor:pointer;color:#c9b789;background:#101a28;border:1px solid rgba(201,164,92,.35);font:700 10px/1 "Cinzel",Georgia,serif;letter-spacing:.12em;text-transform:uppercase}
.md-tab.on{color:#fff3cf;border-color:#f0cf86;background:#22304a}
.md-tab:focus-visible{outline:2px solid #ffd9a0;outline-offset:2px}
.md-zero{height:24px;padding:0 8px;border-radius:5px;cursor:pointer;color:#ffb3a6;background:#1d1414;border:1px solid rgba(255,110,90,.45);font:700 10px/1 "Cinzel",Georgia,serif;letter-spacing:.1em;text-transform:uppercase}
.md-zero:hover,.md-zero:focus-visible{border-color:#ff6a5a;outline:none}
.md-info{margin:7px 1px 6px;font:600 11px/1.4 ui-monospace,Consolas,"Courier New",monospace;color:#9fb4cf;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.md-info b{color:#f0dfb8}
.md-list{display:flex;flex-direction:column;gap:4px}
.md-row{position:relative;height:30px;border-radius:4px;overflow:hidden;background:rgba(255,255,255,.04);border:1px solid rgba(255,255,255,.06)}
.md-bar{position:absolute;left:0;top:0;bottom:0;background:var(--c);opacity:.85;transition:width .3s ease}
.md-cell{position:relative;display:flex;align-items:center;gap:6px;height:100%;padding:0 7px;font:600 11px/1 "Cinzel",Georgia,serif;text-shadow:0 1px 2px #000;white-space:nowrap}
.md-cls{flex:none;display:grid;place-items:center;width:17px;height:17px;border-radius:4px;background:rgba(0,0,0,.45);border:1px solid var(--c);color:#fff;font-size:10px}
.md-nome{flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;color:#fff}
.md-val{font:700 11px/1 ui-monospace,Consolas,"Courier New",monospace;color:#fff}
.md-rate{font:600 10px/1 ui-monospace,Consolas,"Courier New",monospace;color:#e4ecf7;opacity:.9;min-width:44px;text-align:right}
.md-pct{font:600 10px/1 ui-monospace,Consolas,"Courier New",monospace;color:#f0dfb8;min-width:40px;text-align:right}
.md-vazio{padding:10px 4px;font:400 12px/1.4 Georgia,serif;color:#8fb0cf;text-align:center}
@media (max-width:620px){
  .md-win{width:206px;top:max(104px,calc(env(safe-area-inset-top) + 100px));right:8px}
  .md-row{height:26px}
  .md-cell{gap:4px;padding:0 5px;font-size:10px}
  .md-cls{width:14px;height:14px;font-size:9px}
  .md-rate{display:none}
  .md-pct{min-width:34px}
  .md-head{cursor:default}
}
@media (prefers-reduced-motion:reduce){.md-bar,.md-col{transition:none}}
`;

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c] as string));

/** 2.8K, 1.20M, 743 */
export function fmtNum(n: number): string {
  if (!Number.isFinite(n) || n <= 0) return "0";
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(2)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(2)}K`;
  return String(Math.round(n));
}

const fmtTempo = (ms: number) => {
  const s = Math.floor(ms / 1000);
  return `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;
};

export function mountMedidor(opts: MedidorOpts): Medidor {
  const dano = new Map<string, number>();
  const cura = new Map<string, number>();
  let tempo = 0; // ms de combate acumulados
  let ultimo = 0; // instante (performance.now) do último golpe/cura contado
  let aba: Aba = "dano";
  let aberto = false;
  let recolhido = false;
  try { recolhido = localStorage.getItem(KEY_REC) === "1"; } catch { /* sem armazenamento */ }

  const style = document.createElement("style");
  style.textContent = CSS;
  document.head.append(style);

  const win = document.createElement("div");
  win.className = "md-win" + (recolhido ? " rec" : "");
  win.setAttribute("role", "dialog");
  win.setAttribute("aria-label", "Medidor de dano e cura");
  win.innerHTML = `
    <div class="md-head">
      <span class="md-title">Medidor</span>
      <button type="button" class="md-b md-col" aria-label="Recolher ou expandir" title="Recolher">▾</button>
      <button type="button" class="md-b md-fechar" aria-label="Fechar medidor" title="Fechar">✕</button>
    </div>
    <div class="md-body">
      <div class="md-top">
        <div class="md-tabs">
          <button type="button" class="md-tab" data-aba="dano">Dano</button>
          <button type="button" class="md-tab" data-aba="cura">Cura</button>
        </div>
        <button type="button" class="md-zero" title="Zerar medição">Zerar</button>
      </div>
      <div class="md-info"></div>
      <div class="md-list"></div>
    </div>`;
  document.body.append(win);

  const head = win.querySelector<HTMLElement>(".md-head")!;
  const info = win.querySelector<HTMLElement>(".md-info")!;
  const lista = win.querySelector<HTMLElement>(".md-list")!;
  const tabs = Array.from(win.querySelectorAll<HTMLButtonElement>(".md-tab"));

  /** tempo de combate agora (inclui o trecho em andamento, enquanto não passou o limite de inatividade) */
  const tempoAgora = (): number => {
    if (!ultimo) return tempo;
    const gap = performance.now() - ultimo;
    return tempo + (gap < INATIVO_MS ? gap : 0);
  };

  /** conta o tempo de combate: o intervalo desde o último evento entra se for curto (senão é uma pausa) */
  const marcar = () => {
    const agora = performance.now();
    if (ultimo && agora - ultimo < INATIVO_MS) tempo += agora - ultimo;
    ultimo = agora;
  };

  const render = () => {
    if (!aberto) return;
    const eu = opts.meuId();
    const membros = opts.grupo().filter((m, i, arr) => arr.findIndex((x) => x.id === m.id) === i);
    const mapa = aba === "dano" ? dano : cura;
    const linhas = membros
      .map((m) => ({ m, v: mapa.get(m.id) ?? 0 }))
      .sort((a, b) => b.v - a.v || (a.m.id === eu ? -1 : 1));
    const total = linhas.reduce((s, l) => s + l.v, 0);
    const maior = linhas.length ? Math.max(1, linhas[0].v) : 1;
    const seg = Math.max(1, tempoAgora() / 1000);
    const rotulo = aba === "dano" ? "dano" : "cura";
    const taxa = aba === "dano" ? "DPS" : "HPS";

    tabs.forEach((t) => {
      const on = t.dataset.aba === aba;
      t.classList.toggle("on", on);
      t.setAttribute("aria-pressed", on ? "true" : "false");
    });
    info.innerHTML = `${fmtTempo(tempoAgora())} | Total de ${rotulo}: <b>${fmtNum(total)}</b> | ${membros.length > 1 ? `${membros.length} do grupo` : "sozinho"}`;

    if (total <= 0) {
      lista.innerHTML = `<div class="md-vazio">Nenhum ${rotulo} ainda. Os números aparecem durante o combate.</div>`;
      return;
    }
    lista.innerHTML = linhas.map(({ m, v }) => {
      const c = classe(m.cls);
      const pct = (v / maior) * 100;
      const share = total > 0 ? (v / total) * 100 : 0;
      return `<div class="md-row" style="--c:${c.cor}" title="${esc(c.nome)}">
        <div class="md-bar" style="width:${pct.toFixed(1)}%"></div>
        <div class="md-cell">
          <span class="md-cls">${c.letra}</span>
          <span class="md-nome">${esc(m.name || "Aventureiro")}</span>
          <span class="md-val">${fmtNum(v)}</span>
          <span class="md-rate">${fmtNum(v / seg)} ${taxa}</span>
          <span class="md-pct">${share.toFixed(2)}%</span>
        </div>
      </div>`;
    }).join("");
  };

  const abrir = () => {
    aberto = true;
    win.classList.add("open");
    render();
  };
  const fechar = () => {
    aberto = false;
    win.classList.remove("open");
  };

  // ---- eventos
  const add = (mapa: Map<string, number>, id: string, v: number) => {
    if (!id || !(v > 0)) return;
    mapa.set(id, (mapa.get(id) ?? 0) + v);
  };

  // ---- botões
  win.querySelector<HTMLButtonElement>(".md-col")!.onclick = () => {
    recolhido = !recolhido;
    win.classList.toggle("rec", recolhido);
    try { localStorage.setItem(KEY_REC, recolhido ? "1" : "0"); } catch { /* ignore */ }
  };
  win.querySelector<HTMLButtonElement>(".md-fechar")!.onclick = () => fechar();
  win.querySelector<HTMLButtonElement>(".md-zero")!.onclick = () => {
    dano.clear();
    cura.clear();
    tempo = 0;
    ultimo = 0;
    render();
  };
  tabs.forEach((t) => {
    t.onclick = () => {
      aba = t.dataset.aba === "cura" ? "cura" : "dano";
      render();
    };
  });

  // ---- arrastar (PC): pela barra de título; posição fica salva
  try {
    const s = JSON.parse(localStorage.getItem(KEY_POS) || "null");
    if (s && Number.isFinite(s.x) && Number.isFinite(s.y)) {
      win.style.left = `${Math.max(0, Math.min(window.innerWidth - 120, s.x))}px`;
      win.style.top = `${Math.max(0, Math.min(window.innerHeight - 40, s.y))}px`;
      win.style.right = "auto";
    }
  } catch { /* ignore */ }
  let arr: { dx: number; dy: number } | null = null;
  head.addEventListener("pointerdown", (e) => {
    if ((e.target as HTMLElement).closest("button") || window.matchMedia("(max-width: 620px)").matches) return;
    const r = win.getBoundingClientRect();
    arr = { dx: e.clientX - r.left, dy: e.clientY - r.top };
    head.setPointerCapture(e.pointerId);
  });
  head.addEventListener("pointermove", (e) => {
    if (!arr) return;
    const x = Math.max(0, Math.min(window.innerWidth - 60, e.clientX - arr.dx));
    const y = Math.max(0, Math.min(window.innerHeight - 30, e.clientY - arr.dy));
    win.style.left = `${x}px`;
    win.style.top = `${y}px`;
    win.style.right = "auto";
  });
  const soltar = () => {
    if (!arr) return;
    arr = null;
    const r = win.getBoundingClientRect();
    try { localStorage.setItem(KEY_POS, JSON.stringify({ x: Math.round(r.left), y: Math.round(r.top) })); } catch { /* ignore */ }
  };
  head.addEventListener("pointerup", soltar);
  head.addEventListener("pointercancel", soltar);

  // ---- tecla M (abre/fecha); não abre por cima de outra janela
  window.addEventListener("keydown", (e) => {
    if (e.code !== "KeyM" || e.repeat || isTypingTarget()) return;
    if (aberto) { e.preventDefault(); fechar(); return; }
    if (document.querySelector(".gm-back.open, .iv-back.open, .ec-back.open, .qst-back.open")) return;
    e.preventDefault();
    abrir();
  });

  // o tempo e as taxas andam sozinhos enquanto a janela está aberta
  window.setInterval(() => { if (aberto) render(); }, 1000);

  return {
    dano(by, valor) {
      add(dano, by, valor);
      marcar();
      render();
    },
    cura(by, valor) {
      add(cura, by, valor);
      marcar();
      render();
    },
    toggle: () => (aberto ? fechar() : abrir()),
    open: abrir,
    close: fechar,
    isOpen: () => aberto,
  };
}
