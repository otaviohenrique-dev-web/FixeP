import {
  ITEMS, ENEMY_KINDS, COIN_IRON, ZONE_NPCS, nomeNpcPorId, formatarProgresso, escolherRastreada, atualizarOrdem, agruparDiario,
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
.qd-dock{position:fixed;z-index:19;top:66px;right:14px;display:flex;align-items:center;gap:6px;max-width:calc(100vw - 28px);font-family:"Cinzel",Georgia,serif;pointer-events:none}
.qd-track{pointer-events:auto;min-width:0;max-width:min(240px,44vw);height:30px;padding:0 10px;border-radius:8px;cursor:pointer;color:#f0dfb8;text-align:left;
  font:700 11px/1 "Cinzel",Georgia,serif;letter-spacing:.04em;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;text-shadow:0 1px 3px #000;
  background:rgba(8,14,24,.82);border:1px solid rgba(255,150,70,.45);box-shadow:0 2px 8px rgba(0,0,0,.6);touch-action:manipulation}
.qd-track[hidden]{display:none}
.qd-track.pronta{color:#ffe1a0;border-color:#ffd27a}
.qd-track:hover,.qd-track:focus-visible{border-color:#ffb072;outline:none}
.qd-open{pointer-events:auto;flex:none;height:30px;padding:0 10px;border-radius:8px;cursor:pointer;color:#e9c98a;
  font:700 10px/1 "Cinzel",Georgia,serif;letter-spacing:.14em;text-transform:uppercase;background:rgba(8,14,24,.82);border:1px solid rgba(160,200,240,.3);touch-action:manipulation}
.qd-open:hover,.qd-open:focus-visible{border-color:#ffb072;outline:none}
.qd-open kbd{margin-left:5px;font:700 9px/1 "Cinzel",Georgia,serif;color:#9fc0e0;opacity:.8}
.qd-sec{margin:4px 0 0;font:700 11px/1.2 "Cinzel",Georgia,serif;letter-spacing:.16em;text-transform:uppercase;color:#ffb072;border-bottom:1px solid rgba(255,150,70,.25);padding-bottom:4px}
.qd-none{margin:0;font:400 12px/1.4 Georgia,serif;color:#7d93ad}
.qd-go{margin:0 0 6px;font:700 12px/1.35 Georgia,serif;color:#ffd08a}
.qd-hint{font:400 12px/1.4 Georgia,serif;color:#9fc0e0}
body.mob .qd-dock{top:calc(max(8px,env(safe-area-inset-top)) + 72px);right:max(8px,env(safe-area-inset-right))}
body.mob .qd-track{height:28px;font-size:10px;max-width:min(210px,40vw)}
body.mob .qd-open{height:28px;min-width:44px;padding:0 8px;font-size:9px}
body.mob .qd-open kbd{display:none}
`;

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

  // rastreador e botão do diário (sempre visível quando há quests)
  const dock = el("div", "qd-dock");
  const track = el("button", "qd-track");
  track.type = "button";
  track.hidden = true;
  const abrirBtn = el("button", "qd-open", "Diário");
  abrirBtn.type = "button";
  abrirBtn.title = "Diário de quests (J)";
  abrirBtn.setAttribute("aria-label", "Abrir diário de quests");
  abrirBtn.append(el("kbd", "", "J"));
  dock.append(track, abrirBtn);
  document.body.append(dock);

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
  let ordem: string[] = [];
  let isOpenFlag = false;

  const fechar = () => {
    if (!isOpenFlag) return;
    isOpenFlag = false;
    back.classList.remove("open");
  };
  const abrir = () => {
    if (isOpenFlag) return;
    isOpenFlag = true;
    back.classList.add("open");
    renderDiario();
    (card.querySelector(".qst-x") as HTMLElement | null)?.focus({ preventScroll: true });
  };

  function renderTrack() {
    const r = escolherRastreada(defs, estados, ordem, nomeNpc);
    track.hidden = !r;
    if (!r) return;
    track.textContent = r.linha;
    track.title = r.linha;
    track.classList.toggle("pronta", r.pronta);
  }

  function renderDiario() {
    if (!isOpenFlag) return;
    card.replaceChildren();
    const head = el("div", "qst-head");
    const t = el("h2", "qst-title", "Diário");
    t.append(el("small", "", "Quests aceitas"));
    const x = el("button", "qst-x", "×");
    x.type = "button";
    x.setAttribute("aria-label", "Fechar");
    x.onclick = fechar;
    head.append(t, x);
    card.append(head);

    const body = el("div", "qst-body");
    const d = agruparDiario(defs, estados);
    const secao = (titulo: string, lista: EntradaDiario[], vazio: string) => {
      body.append(el("h4", "qd-sec", `${titulo} (${lista.length})`));
      if (!lista.length) body.append(el("p", "qd-none", vazio));
      for (const e of lista) body.append(blocoQuest(e));
    };
    secao("Ativas", d.ativas, "Nenhuma quest em andamento. Fale com os NPCs para aceitar uma.");
    secao("Prontas para entregar", d.prontas, "Nenhuma quest pronta.");
    secao("Entregues", d.entregues, "Nenhuma quest entregue ainda.");
    card.append(body);

    const foot = el("div", "qst-foot");
    const fechou = el("button", "qst-btn", "Fechar");
    fechou.type = "button";
    fechou.onclick = fechar;
    foot.append(fechou);
    card.append(foot);
  }

  track.onclick = () => (isOpenFlag ? fechar() : abrir());
  abrirBtn.onclick = () => (isOpenFlag ? fechar() : abrir());
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
      ordem = atualizarOrdem(ordem, estados);
      renderTrack();
      renderDiario();
    },
    setDefs(ev) {
      defs = ev?.defs ?? [];
      renderTrack();
      renderDiario();
    },
    open: abrir,
    close: fechar,
    toggle: () => (isOpenFlag ? fechar() : abrir()),
    isOpen: () => isOpenFlag,
  };
}
