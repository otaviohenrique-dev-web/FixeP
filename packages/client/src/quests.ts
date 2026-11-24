import {
  ITEMS, ENEMY_KINDS, COIN_IRON, ZONE_NPCS, nomeNpcPorId, type NpcDef, type QuestDef, type QuestEstado, type QuestEvent, type QuestDefsEvent, type Objetivo,
} from "@frixep/shared";

/**
 * Caixa de quest do NPC (C1.2): mostra a oferta, o progresso, "pronta para entregar" ou "já entregue", com Aceitar,
 * Entregar e Fechar. Não decide nada: o servidor valida nível, pré-requisitos, distância, mochila e recompensa.
 * A caixa só mostra o que o servidor mandou (quest_estado e quest_defs) e a última recusa (notice).
 */
export interface QuestUi {
  /** abre a caixa se o NPC dá ou recebe alguma quest; devolve false se não tiver nenhuma (aí o painel comum abre) */
  open(npc: NpcDef): boolean;
  close(): void;
  isOpen(): boolean;
  setQuests(ev: QuestEvent): void;
  setDefs(ev: QuestDefsEvent): void;
  /** recusa ou aviso do servidor: aparece na caixa, se ela estiver aberta */
  notice(text: string, ok: boolean): void;
}

const CSS = `
.qst-back{position:fixed;inset:0;z-index:22;display:none;align-items:center;justify-content:center;background:rgba(2,5,11,.6);padding:12px;font-family:"Cinzel",Georgia,serif}
.qst-back.open{display:flex}
.qst-card{width:min(480px,100%);max-height:calc(100dvh - 24px);display:flex;flex-direction:column;border-radius:8px;color:#dbeaff;
  background:linear-gradient(180deg,rgba(20,34,52,.98),rgba(6,12,20,.99));border:1px solid rgba(255,150,70,.45);box-shadow:0 18px 50px rgba(0,0,0,.75)}
.qst-head{display:flex;align-items:center;gap:10px;padding:12px 14px 8px}
.qst-title{margin:0;flex:1;font-size:14px;font-weight:700;letter-spacing:.2em;text-transform:uppercase;color:#ffb072}
.qst-title small{display:block;margin-top:3px;font:400 11px/1.2 Georgia,serif;letter-spacing:.02em;text-transform:none;color:#9fc0e0}
.qst-x{min-width:44px;min-height:44px;border-radius:50%;cursor:pointer;color:#bcd8f5;background:transparent;border:1px solid rgba(160,200,240,.3);font:700 18px/1 Georgia,serif}
.qst-body{overflow:auto;padding:0 14px 6px;display:flex;flex-direction:column;gap:10px;min-height:0;-webkit-overflow-scrolling:touch}
.qst-q{padding:10px;border-radius:6px;background:rgba(6,12,20,.7);border:1px solid rgba(160,200,240,.18)}
.qst-q h3{margin:0 0 4px;font:700 13px/1.25 "Cinzel",Georgia,serif;color:#f4e6b8}
.qst-st{display:inline-block;margin:2px 0 6px;font:700 10px/1 "Cinzel",Georgia,serif;letter-spacing:.12em;text-transform:uppercase;color:#9fc0e0}
.qst-st.ok{color:#9fe0a8}.qst-st.go{color:#ffd08a}.qst-st.bad{color:#ff9d8a}
.qst-q p{margin:0 0 6px;font:400 13px/1.45 Georgia,serif;color:#dbeaff}
.qst-q ul{margin:0 0 6px;padding-left:18px;font:400 12px/1.5 Georgia,serif;color:#bcd8f5}
.qst-rew{font:400 12px/1.45 Georgia,serif;color:#e6c27a}
.qst-aviso{margin:0;padding:10px;border-radius:6px;font:400 13px/1.45 Georgia,serif;color:#c9b98f;border:1px dashed rgba(201,164,92,.45);background:rgba(6,12,20,.5)}
.qst-q .qst-act{margin-top:8px}
.qst-btn{min-height:44px;padding:0 16px;border-radius:6px;cursor:pointer;font:700 12px/1 "Cinzel",Georgia,serif;letter-spacing:.1em;text-transform:uppercase;color:#eaf4ff;
  background:linear-gradient(180deg,rgba(24,40,60,.85),rgba(7,13,22,.92));border:1px solid rgba(255,150,70,.4);touch-action:manipulation}
.qst-btn:hover:not(:disabled){border-color:#ff9a4d}
.qst-btn:disabled{opacity:.4;cursor:default}
.qst-btn.primary{border-color:#ffb072;color:#fff3dc}
.qst-btn:focus-visible,.qst-x:focus-visible{outline:2px solid #ffd2a3;outline-offset:2px}
.qst-msg{margin:0;padding:8px 14px;font:400 12px/1.4 Georgia,serif;color:#9fc0e0;min-height:0}
.qst-msg.bad{color:#ff9d8a}.qst-msg.ok{color:#9fe0a8}
.qst-foot{display:flex;gap:8px;flex-wrap:wrap;justify-content:flex-end;padding:10px 14px 14px;border-top:1px solid rgba(160,200,240,.15)}
@media (max-height:500px){.qst-card{max-height:calc(100dvh - 12px)}}
`;

const el = <K extends keyof HTMLElementTagNameMap>(tag: K, cls = "", text = ""): HTMLElementTagNameMap[K] => {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text) e.textContent = text;
  return e;
};

const SLOT_HABILIDADE: Record<string, string> = { skill1: "1 (Q)", skill2: "2 (W)", skill3: "3 (E)", ultimate: "final (R)" };
const SLOT_NOME: Record<string, string> = { weapon: "uma arma", armor: "uma armadura", helmet: "um elmo", boots: "botas", cape: "uma capa" };

/** texto de um objetivo com o progresso atual, ex.: "Esqueleto (zona 1): 1/3" */
function linhaObjetivo(o: Objetivo, valor: number): string {
  if (o.tipo === "abater") {
    const nome = ENEMY_KINDS[o.kind as keyof typeof ENEMY_KINDS]?.name ?? o.kind;
    return `Derrotar ${nome}${o.zona !== undefined ? ` na zona ${o.zona}` : ""}: ${Math.min(valor, o.qtd)}/${o.qtd}`;
  }
  if (o.tipo === "coletar") return `Ter ${ITEMS[o.itemId]?.name ?? o.itemId}: ${Math.min(valor, o.qtd)}/${o.qtd}`;
  if (o.tipo === "usar") return `Usar a habilidade ${SLOT_HABILIDADE[o.acao]}: ${Math.min(valor, o.qtd)}/${o.qtd}`;
  if (o.tipo === "equipar") return `Equipar ${SLOT_NOME[o.slot]}: ${valor >= 1 ? "feito" : "falta"}`;
  if (o.tipo === "falar") return `Conversar com ${nomeNpcPorId(o.npc, Object.values(ZONE_NPCS).flat())}: ${valor >= 1 ? "feito" : "falta"}`;
  return `Chegar ao ponto (zona ${o.zona}): ${valor >= 1 ? "feito" : "falta"}`;
}

export function mountQuests(opts: {
  send(type: string, payload: unknown): void;
  getLevel(): number;
  /** abre o comércio do NPC (botão "Negociar"), para quem tem loja ou ferraria */
  onTrade(npc: NpcDef): void;
}): QuestUi {
  const style = el("style");
  style.textContent = CSS;
  document.head.append(style);

  const back = el("div", "qst-back");
  const card = el("div", "qst-card");
  card.setAttribute("role", "dialog");
  card.setAttribute("aria-modal", "true");
  back.append(card);
  document.body.append(back);

  let npc: NpcDef | null = null;
  let msg = { text: "", ok: true };
  let estados = new Map<string, QuestEstado>();
  let defs = new Map<string, QuestDef>();

  const close = () => {
    back.classList.remove("open");
    npc = null;
    msg = { text: "", ok: true };
  };
  back.onclick = (e) => { if (e.target === back) close(); };
  // Esc fecha esta caixa antes que outras janelas
  window.addEventListener("keydown", (e) => {
    if (e.code === "Escape" && npc && back.classList.contains("open")) { e.stopImmediatePropagation(); e.preventDefault(); close(); }
  }, true);

  /** quests que este NPC dá ou recebe (na ordem: tutorial primeiro, depois as outras) */
  // Tutorial (C1.4) vem antes das outras; no resto, a ordem é a das definições.
  const entregue = (qid: string) => estados.get(qid)?.estado === "entregue";
  const liberada = (d: QuestDef) => d.preRequisitos.every(entregue);
  const todasDoNpc = (id: string) => {
    const todas = [...defs.values()].filter((d) => d.npc === id);
    return [...todas.filter((d) => d.id.startsWith("tutorial_")), ...todas.filter((d) => !d.id.startsWith("tutorial_"))];
  };
  const nomeQuest = (qid: string) => defs.get(qid)?.nome ?? qid;

  function render() {
    if (!npc || !back.classList.contains("open")) return;
    card.replaceChildren();
    const head = el("div", "qst-head");
    const t = el("h2", "qst-title", `${npc.name} · ${npc.title}`);
    t.append(el("small", "", "Missões"));
    const x = el("button", "qst-x", "×");
    x.type = "button";
    x.setAttribute("aria-label", "Fechar");
    x.onclick = close;
    head.append(t, x);
    card.append(head);

    const body = el("div", "qst-body");
    // as concluídas saem daqui (ficam no Diário, em Entregues); a próxima só aparece depois da anterior
    const pendentes = todasDoNpc(npc.id).filter((d) => !entregue(d.id));
    const liberadas = pendentes.filter(liberada);
    const bloqueada = pendentes.find((d) => !liberada(d));
    for (const d of liberadas) body.append(questBlock(d));
    if (bloqueada) {
      const falta = bloqueada.preRequisitos.find((p) => !entregue(p)) ?? "";
      body.append(el("p", "qst-aviso", `Complete a missão «${nomeQuest(falta)}» primeiro.`));
    }
    if (!liberadas.length && !bloqueada) body.append(el("p", "qst-q", todasDoNpc(npc.id).length ? "Você concluiu as missões deste NPC. Veja no Diário, em Entregues." : "Nenhuma missão por aqui."));
    card.append(body);

    if (msg.text) card.append(el("p", "qst-msg" + (msg.ok ? " ok" : " bad"), msg.text));

    const foot = el("div", "qst-foot");
    if (npc.kind !== "auctioneer") {
      const shop = el("button", "qst-btn", npc.kind === "smith" ? "Ferraria" : "Comércio");
      shop.type = "button";
      shop.onclick = () => { const n = npc!; close(); opts.onTrade(n); };
      foot.append(shop);
    }
    const fechar = el("button", "qst-btn", "Fechar");
    fechar.type = "button";
    fechar.onclick = close;
    foot.append(fechar);
    card.append(foot);
    (card.querySelector(".qst-btn.primary, .qst-btn:not(:disabled)") as HTMLElement | null)?.focus({ preventScroll: true });
  }

  function questBlock(d: QuestDef): HTMLElement {
    const q = estados.get(d.id);
    const estado = q?.estado; // undefined = ainda não aceitou
    const blk = el("div", "qst-q");
    blk.append(el("h3", "", d.nome));
    let rotulo = "Disponível", cls = "";
    if (estado === "ativa") { rotulo = "Em andamento"; cls = "go"; }
    if (estado === "pronta") { rotulo = "Pronta para entregar"; cls = "go"; }
    if (estado === "entregue") { rotulo = "Já entregue"; cls = "ok"; }
    blk.append(el("span", "qst-st " + cls, rotulo));
    blk.append(el("p", "", d.texto));
    const ul = el("ul");
    d.objetivos.forEach((o, i) => ul.append(el("li", "", linhaObjetivo(o, q?.progresso[i] ?? 0))));
    blk.append(ul);
    if (!estado && opts.getLevel() < d.nivelMin) blk.append(el("p", "qst-rew", `Requer nível ${d.nivelMin} (você é nível ${opts.getLevel()}).`));
    const r = d.recompensa;
    const itens = r.itens.map((it) => `${ITEMS[it.id]?.name ?? it.id} ×${it.qtd}`);
    const partes = [`${r.xp} XP`, `${r.ferro} ${COIN_IRON.name.toLowerCase()}`, ...itens];
    blk.append(el("p", "qst-rew", `Recompensa: ${partes.join(" · ")}`));

    const act = el("div", "qst-act");
    if (!estado) {
      const b = el("button", "qst-btn primary", "Aceitar");
      b.type = "button";
      b.disabled = opts.getLevel() < d.nivelMin;
      b.onclick = () => { msg = { text: "", ok: true }; opts.send("quest_aceitar", { id: d.id }); };
      act.append(b);
    } else if (estado === "pronta") {
      const b = el("button", "qst-btn primary", "Entregar");
      b.type = "button";
      b.onclick = () => { msg = { text: "", ok: true }; opts.send("quest_entregar", { id: d.id }); };
      act.append(b);
    }
    if (act.childElementCount) blk.append(act);
    return blk;
  }

  return {
    open(n: NpcDef) {
      if (!todasDoNpc(n.id).length) return false;
      npc = n;
      msg = { text: "", ok: true };
      back.classList.add("open");
      render();
      return true;
    },
    close,
    isOpen: () => back.classList.contains("open"),
    setQuests(ev) {
      estados = new Map((ev?.quests ?? []).map((q) => [q.id, q]));
      render();
    },
    setDefs(ev) {
      defs = new Map((ev?.defs ?? []).map((d) => [d.id, d]));
      render();
    },
    notice(text, ok) {
      if (!back.classList.contains("open")) return;
      msg = { text, ok };
      render();
    },
  };
}
