import {
  ITEMS, ENEMY_KINDS, COIN_IRON, ZONE_NPCS, nomeNpcPorId, formatarProgresso, agruparDiario,
  type Objetivo, type QuestDef, type QuestEstado, type QuestEvent, type QuestDefsEvent, type EntradaDiario,
} from "@frixep/shared";
import { isTypingTarget } from "./keys";

/**
 * Diário e rastreador de quests (C1.3). Só mostra o que o servidor mandou (quest_estado e quest_defs);
 * as regras (progresso, quest do rastreador, seções) estão em packages/shared/src/diario.ts e são testadas no servidor.
 * - Rastreador: uma linha no canto (sob a carteira), com a quest ativa mais recente ou "Pronta: entregar a Garrick". Clique abre o diário.
 * - Diário: painel com as seções Ativas, Prontas para entregar e Entregues. Tecla J (PC) e botão "Diário" abrem e fecham.
 * Usa as classes .qst-* da caixa de NPC (quests.ts), que precisa estar montada antes (mountQuests injeta o CSS).
 */

export interface DiarioUi {
  setQuests(ev: QuestEvent): void;
  setDefs(ev: QuestDefsEvent): void;
  open(): void;
  close(): void;
  toggle(): void;
  isOpen(): boolean;
}

const CSS = `
.qd-sec{margin:4px 0 0;font:700 11px/1.2 "Cinzel",Georgia,serif;letter-spacing:.16em;text-transform:uppercase;color:#ffb072;border-bottom:1px solid rgba(255,150,70,.25);padding-bottom:4px}
.qd-none{margin:0;font:400 12px/1.4 Georgia,serif;color:#7d93ad}
.qd-go{margin:0 0 6px;font:700 12px/1.35 Georgia,serif;color:#ffd08a}
.qd-hint{font:400 12px/1.4 Georgia,serif;color:#9fc0e0}
/* abas na lateral: Em andamento / Concluídas */
.qd-row{display:flex;min-height:0;flex:1}
.qd-rail{display:flex;flex-direction:column;gap:8px;padding:4px 0 8px 12px;flex:none}
.qd-tab{position:relative;width:40px;height:40px;border-radius:10px;display:grid;place-items:center;cursor:pointer;padding:0;color:#8fa6c0;
  background:rgba(10,16,26,.6);border:1px solid rgba(160,200,240,.18);transition:color .15s,border-color .15s,background .15s;touch-action:manipulation;-webkit-tap-highlight-color:transparent}
.qd-tab svg{width:20px;height:20px}
.qd-tab:hover{color:#e9cf8f;border-color:rgba(201,164,92,.6)}
.qd-tab.on{color:#ffe3a0;border-color:#c9a45c;background:linear-gradient(180deg,rgba(60,44,20,.7),rgba(20,14,8,.7));box-shadow:inset 0 0 0 1px rgba(255,220,150,.15)}
.qd-tab:focus-visible{outline:2px solid #ffd2a3;outline-offset:2px}
.qd-tab b{position:absolute;right:-5px;top:-5px;min-width:16px;height:16px;padding:0 4px;box-sizing:border-box;border-radius:8px;background:#2a3a52;border:1px solid #000;
  color:#e6eef9;font:700 9px/14px "Cinzel",Georgia,serif;text-align:center}
.qd-tab b:empty{display:none}
.qd-row .qst-body{flex:1}
`;

const ICONE_ANDAMENTO = `<path d="M7 4h9a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H7"/><path d="M7 4a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2"/><path d="M9 9h6M9 13h6M9 17h3"/>`;
const ICONE_CONCLUIDAS = `<circle cx="12" cy="10" r="6"/><path d="M9.5 10l1.8 1.8L14.8 8.4"/><path d="M8.5 15l-1.5 6 5-2.5 5 2.5-1.5-6"/>`;

const el = <K extends keyof HTMLElementTagNameMap>(tag: K, cls = "", text = ""): HTMLElementTagNameMap[K] => {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text) e.textContent = text;
  return e;
};

/** todos os NPCs do jogo (para o nome aparecer em "Entregar a Garrick" mesmo fora da zona) */
const NPCS_TODOS = Object.values(ZONE_NPCS).flat();
const nomeNpc = (id: string) => nomeNpcPorId(id, NPCS_TODOS);

/** texto de um objetivo com o progresso atual, ex.: "Derrotar Esqueleto na zona 1: 1/3" */
function linhaObjetivo(o: Objetivo, valor: number): string {
  if (o.tipo === "abater") {
    const nome = ENEMY_KINDS[o.kind as keyof typeof ENEMY_KINDS]?.name ?? o.kind;
    return `Derrotar ${nome}${o.zona !== undefined ? ` na zona ${o.zona}` : ""}: ${formatarProgresso(o, valor)}`;
  }
  if (o.tipo === "coletar") return `Ter ${ITEMS[o.itemId]?.name ?? o.itemId}: ${formatarProgresso(o, valor)}`;
  if (o.tipo === "falar") return `Conversar com ${nomeNpc(o.npc)}: ${formatarProgresso(o, valor)}`;
  if (o.tipo === "usar") return `Usar a habilidade ${TECLA_HABILIDADE[o.acao]}: ${formatarProgresso(o, valor)}`;
  if (o.tipo === "equipar") return `Equipar ${o.slot === "armor" ? "uma armadura" : o.slot}: ${formatarProgresso(o, valor)}`;
  return `Chegar ao ponto (zona ${o.zona}): ${formatarProgresso(o, valor)}`;
}

const TECLA_HABILIDADE: Record<string, string> = { skill1: "1 (Q)", skill2: "2 (W)", skill3: "3 (E)", ultimate: "final (R)" };

/** uma quest no diário: nome, estado, texto, objetivos com progresso e recompensa */
function blocoQuest(e: EntradaDiario): HTMLElement {
  const { def: d, est: q } = e;
  const blk = el("div", "qst-q");
  blk.append(el("h3", "", d.nome));
  const rotulo = q.estado === "pronta" ? "Pronta para entregar" : q.estado === "entregue" ? "Entregue" : "Em andamento";
  const cls = q.estado === "entregue" ? "ok" : "go";
  blk.append(el("span", "qst-st " + cls, rotulo));
  blk.append(el("p", "", d.texto));
  const ul = el("ul");
  d.objetivos.forEach((o, i) => ul.append(el("li", "", linhaObjetivo(o, q.progresso[i] ?? 0))));
  blk.append(ul);
  if (q.estado === "pronta" && d.npc) blk.append(el("p", "qst-rew", `Entregar a ${nomeNpc(d.npc)}.`));
  blk.append(el("p", "qst-rew", `Recompensa: ${recompensaTexto(d)}`));
  return blk;
}

function recompensaTexto(d: QuestDef): string {
  const r = d.recompensa;
  const itens = r.itens.map((it) => `${ITEMS[it.id]?.name ?? it.id} ×${it.qtd}`);
  return [`${r.xp} XP`, `${r.ferro} ${COIN_IRON.name.toLowerCase()}`, ...itens].join(" · ");
}

export function mountDiario(): DiarioUi {
  const style = el("style");
  style.textContent = CSS;
  document.head.append(style);

  // o rastreador de missões fica à esquerda (rastreador.ts); o diário abre pelo menu, pela tecla J ou clicando numa missão de lá

  // painel do diário
  const back = el("div", "qst-back qd-back");
  const card = el("div", "qst-card");
  card.setAttribute("role", "dialog");
  card.setAttribute("aria-modal", "true");
  card.setAttribute("aria-label", "Diário de quests");
  back.append(card);
  document.body.append(back);

  let estados: QuestEstado[] = [];
  let defs: QuestDef[] = [];
  let isOpenFlag = false;
  let aba: "andamento" | "concluidas" = "andamento";

  const fechar = () => {
    if (!isOpenFlag) return;
    isOpenFlag = false;
    back.classList.remove("open");
  };
  const abrir = () => {
    if (isOpenFlag) return;
    isOpenFlag = true;
    aba = "andamento"; // abre sempre no que está em andamento
    back.classList.add("open");
    renderDiario();
    (card.querySelector(".qst-x") as HTMLElement | null)?.focus({ preventScroll: true });
  };

  function renderDiario() {
    if (!isOpenFlag) return;
    card.replaceChildren();
    const head = el("div", "qst-head");
    const t = el("h2", "qst-title", "Diário");
    t.append(el("small", "", aba === "andamento" ? "Missões em andamento" : "Missões concluídas"));
    const x = el("button", "qst-x", "×");
    x.type = "button";
    x.setAttribute("aria-label", "Fechar");
    x.onclick = fechar;
    head.append(t, x);
    card.append(head);

    const d = agruparDiario(defs, estados);
    const rail = el("div", "qd-rail");
    rail.setAttribute("role", "tablist");
    rail.setAttribute("aria-orientation", "vertical");
    const aba_ = (id: typeof aba, rotulo: string, icone: string, qtd: number) => {
      const b = el("button", "qd-tab" + (aba === id ? " on" : ""));
      b.type = "button";
      b.setAttribute("role", "tab");
      b.setAttribute("aria-selected", String(aba === id));
      b.title = b.ariaLabel = rotulo;
      b.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${icone}</svg>`;
      b.append(el("b", "", qtd ? String(qtd) : ""));
      b.onclick = () => { if (aba !== id) { aba = id; renderDiario(); } };
      rail.append(b);
    };
    aba_("andamento", "Em andamento", ICONE_ANDAMENTO, d.ativas.length + d.prontas.length);
    aba_("concluidas", "Concluídas", ICONE_CONCLUIDAS, d.entregues.length);

    const body = el("div", "qst-body");
    body.setAttribute("role", "tabpanel");
    const secao = (titulo: string, lista: EntradaDiario[], vazio: string) => {
      body.append(el("h4", "qd-sec", `${titulo} (${lista.length})`));
      if (!lista.length) body.append(el("p", "qd-none", vazio));
      for (const e of lista) body.append(blocoQuest(e));
    };
    if (aba === "andamento") {
      if (d.prontas.length) secao("Prontas para entregar", d.prontas, "");
      secao("Em andamento", d.ativas, "Nenhuma missão em andamento. Fale com os NPCs para aceitar uma.");
    } else {
      secao("Concluídas", d.entregues, "Nenhuma missão concluída ainda.");
    }
    const row = el("div", "qd-row");
    row.append(rail, body);
    card.append(row);

    const foot = el("div", "qst-foot");
    const fechou = el("button", "qst-btn", "Fechar");
    fechou.type = "button";
    fechou.onclick = fechar;
    foot.append(fechou);
    card.append(foot);
  }

  back.onclick = (e) => { if (e.target === back) fechar(); };

  // J abre e fecha; Esc fecha o diário antes de outras janelas (captura, como na caixa do NPC)
  window.addEventListener("keydown", (e) => {
    if (e.code === "Escape" && isOpenFlag) { e.stopImmediatePropagation(); e.preventDefault(); fechar(); return; }
    if (e.code !== "KeyJ" || e.repeat || isTypingTarget()) return;
    if (isOpenFlag) { e.preventDefault(); fechar(); return; }
    // não abre por cima de outra janela (inventário, comércio, grupo, caixa de NPC, menu)
    if (document.querySelector(".gm-back.open, .iv-back.open, .ec-back.open, .qst-back.open")) return;
    e.preventDefault();
    abrir();
  }, true);

  return {
    setQuests(ev) {
      estados = ev?.quests ?? [];
      renderDiario();
    },
    setDefs(ev) {
      defs = ev?.defs ?? [];
      renderDiario();
    },
    open: abrir,
    close: fechar,
    toggle: () => (isOpenFlag ? fechar() : abrir()),
    isOpen: () => isOpenFlag,
  };
}
