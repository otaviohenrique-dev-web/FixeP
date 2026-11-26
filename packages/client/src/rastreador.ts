import { ZONE_NPCS, nomeNpcPorId, agruparDiario, objetivoAtual, type QuestDef, type QuestEstado, type QuestEvent, type QuestDefsEvent } from "@frixep/shared";
import { linhaObjetivo } from "./quests";
import { passosTutorial, textoPasso } from "./tutorial";

/**
 * Rastreador de missões à esquerda da tela (abaixo do PvP): o passo do tutorial (enquanto ele não terminou) e as
 * missões aceitas, com o objetivo e o progresso (ex.: "Derrotar Lobo do Gelo: 2/5"). Missão pronta aparece em destaque
 * ("Entregar a Garrick"). Clicar no nome abre o diário. Só mostra o que o servidor mandou (quest_estado e quest_defs).
 * - Discreto: texto com sombra sobre o mapa, sem caixa pesada; só os nomes e o botão de recolher recebem clique.
 * - Celular: mais compacto, até 3 missões; em tela baixa (paisagem) começa recolhido. A escolha de recolher fica no localStorage.
 */

export interface RastreadorUi {
  setQuests(ev: QuestEvent): void;
  setDefs(ev: QuestDefsEvent): void;
}

export interface RastreadorOpts {
  /** abre o diário (clique no nome da missão) */
  onAbrirDiario(): void;
}

const CSS = `
.rq{position:fixed;z-index:17;left:max(12px,env(safe-area-inset-left));top:calc(max(12px,env(safe-area-inset-top)) + 164px);
  width:min(250px,calc(100vw - 24px));box-sizing:border-box;padding:2px 8px 6px;border-radius:8px;pointer-events:none;
  font-family:"Cinzel",Georgia,serif;color:#e6eef9;background:linear-gradient(90deg,rgba(6,12,20,.5),rgba(6,12,20,0) 92%);
  text-shadow:0 1px 2px #000,0 0 6px rgba(0,0,0,.85)}
.rq[hidden]{display:none}
.rq-hd{display:flex;align-items:center;gap:6px;min-height:22px}
.rq-tit{font:700 10px/1 "Cinzel",Georgia,serif;letter-spacing:.16em;text-transform:uppercase;color:#c9a45c}
.rq-n{font:600 10px/1 Georgia,serif;color:#8fa6c0}
.rq-n:empty{display:none}
.rq-tog{pointer-events:auto;margin-left:auto;width:20px;height:20px;padding:0;border:1px solid rgba(201,164,92,.55);border-radius:50%;background:rgba(10,16,26,.5);color:#e0c27a;
  font:700 13px/1 Georgia,serif;cursor:pointer;touch-action:manipulation;-webkit-tap-highlight-color:transparent;text-shadow:none}
.rq-tog:focus-visible,.rq-nome:focus-visible,.rq-mais:focus-visible{outline:1px solid #ffd2a3;outline-offset:2px}
.rq-body{display:flex;flex-direction:column;gap:7px;margin-top:4px;overflow:hidden}
.rq-tut small{display:block;margin-bottom:2px;font:700 9px/1 "Cinzel",Georgia,serif;letter-spacing:.14em;text-transform:uppercase;color:#ffb072}
.rq-tut p{margin:0;font:400 12px/1.35 Georgia,serif;color:#f4e6b8}
.rq-m{display:flex;flex-direction:column;gap:1px;padding-left:7px;border-left:2px solid rgba(201,164,92,.35)}
.rq-m.pronta{border-left-color:#ffd27a}
.rq-nome{pointer-events:auto;align-self:flex-start;max-width:100%;padding:0;margin:0;border:0;background:none;cursor:pointer;text-align:left;
  font:700 12px/1.25 "Cinzel",Georgia,serif;letter-spacing:.02em;color:#e9cf8f;touch-action:manipulation;-webkit-tap-highlight-color:transparent}
.rq-m.pronta .rq-nome{color:#ffe3a0}
.rq-nome:hover{color:#fff3cf;text-decoration:underline;text-decoration-color:rgba(255,210,140,.5)}
.rq-obj{margin:0;font:400 12px/1.35 Georgia,serif;color:#bcc9d8}
.rq-m.pronta .rq-obj{color:#ffd08a;font-weight:700}
.rq-mais{pointer-events:auto;align-self:flex-start;padding:0;border:0;background:none;cursor:pointer;font:400 11px/1.2 Georgia,serif;color:#9fb4cf}
@media (max-width:620px),(pointer:coarse){
  .rq{width:min(45vw,180px);padding:2px 6px 4px;font-size:11px}
  .rq-nome{font-size:11px}
  .rq-obj,.rq-tut p{font-size:11px}
  .rq-tut small{font-size:8px}
  .rq-tit{font-size:9px}
}
body.mob .rq{top:calc(max(8px,env(safe-area-inset-top)) + 104px*var(--hs))}
`;

const REC_KEY = "frixep.rastreador.rec";
const COARSE = typeof matchMedia === "function" && matchMedia("(pointer: coarse)").matches;
const BAIXA = typeof matchMedia === "function" && matchMedia("(max-height: 500px) and (pointer: coarse)").matches; // paisagem no celular
const NPCS_TODOS = Object.values(ZONE_NPCS).flat();
const nomeNpc = (id: string) => nomeNpcPorId(id, NPCS_TODOS);

/** recolhido: a escolha guardada vale; sem escolha, recolhe só em tela baixa (paisagem) */
let recolhido = (() => { try { const v = localStorage.getItem(REC_KEY); return v === null ? BAIXA : v === "1"; } catch { return BAIXA; } })();

const el = (tag: string, cls = "", text = ""): HTMLElement => {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text) e.textContent = text;
  return e;
};

export function mountRastreador(opts: RastreadorOpts): RastreadorUi {
  // a cena é refeita a cada travessia de zona: remove o rastreador e o estilo da montagem anterior
  document.querySelectorAll(".rq, style[data-rq]").forEach((e) => e.remove());
  const style = document.createElement("style");
  style.dataset.rq = "1";
  style.textContent = CSS;
  document.head.append(style);

  const painel = document.createElement("section");
  painel.className = "rq";
  painel.setAttribute("aria-label", "Missões");
  painel.hidden = true;
  document.body.append(painel);

  let defs = new Map<string, QuestDef>();
  let estados = new Map<string, QuestEstado>();

  function itemMissao(def: QuestDef, est: QuestEstado): HTMLElement {
    const item = el("div", "rq-m" + (est.estado === "pronta" ? " pronta" : ""));
    const nome = el("button", "rq-nome", def.nome) as HTMLButtonElement;
    nome.type = "button";
    nome.title = `Abrir o diário: ${def.nome}`;
    nome.addEventListener("pointerdown", (e) => e.stopPropagation()); // não repassa o toque ao jogo (não anda nem ataca)
    nome.onclick = () => opts.onAbrirDiario();
    let linha: string;
    if (est.estado === "pronta") linha = def.npc ? `Entregar a ${nomeNpc(def.npc)}` : "Entregar a missão";
    else {
      const i = objetivoAtual(def, est.progresso);
      linha = i < 0 ? "Concluída" : linhaObjetivo(def.objetivos[i], est.progresso[i] ?? 0);
    }
    item.append(nome, el("p", "rq-obj", linha));
    return item;
  }

  function render() {
    const todas = [...defs.values()];
    const passos = passosTutorial(todas);
    const pendente = passos.find((d) => estados.get(d.id)?.estado !== "entregue");
    const grupos = agruparDiario(todas, [...estados.values()]);
    // prontas primeiro (o que falta entregar); missões do tutorial ficam só no passo, sem repetir na lista
    const missoes = [...grupos.prontas, ...grupos.ativas].filter((e) => !e.def.id.startsWith("tutorial_"));
    const textoT = pendente ? textoPasso(pendente, estados.get(pendente.id)?.estado, COARSE) : null;
    if (!textoT && !missoes.length) {
      painel.hidden = true;
      painel.replaceChildren();
      return;
    }
    painel.hidden = false;

    const hd = el("div", "rq-hd");
    const tog = el("button", "rq-tog", recolhido ? "+" : "–") as HTMLButtonElement;
    tog.type = "button";
    tog.setAttribute("aria-expanded", String(!recolhido));
    tog.setAttribute("aria-label", recolhido ? "Mostrar missões" : "Recolher missões");
    tog.title = tog.getAttribute("aria-label")!;
    tog.addEventListener("pointerdown", (e) => e.stopPropagation());
    tog.onclick = () => {
      recolhido = !recolhido;
      try { localStorage.setItem(REC_KEY, recolhido ? "1" : "0"); } catch { /* sem armazenamento */ }
      render();
    };
    hd.append(el("span", "rq-tit", "Missões"), el("span", "rq-n", missoes.length ? String(missoes.length) : ""), tog);
    painel.replaceChildren(hd);
    if (recolhido) return;

    const corpo = el("div", "rq-body");
    if (pendente && textoT) {
      const bloco = el("div", "rq-tut");
      bloco.append(el("small", "", `Tutorial · ${passos.indexOf(pendente) + 1}/${passos.length}`), el("p", "", textoT));
      corpo.append(bloco);
    }
    const compacto = typeof matchMedia === "function" && matchMedia("(max-width: 620px), (pointer: coarse)").matches;
    const max = compacto ? 3 : 5;
    for (const e of missoes.slice(0, max)) corpo.append(itemMissao(e.def, e.est));
    const resto = missoes.length - max;
    if (resto > 0) {
      const mais = el("button", "rq-mais", `+${resto} no Diário`) as HTMLButtonElement;
      mais.type = "button";
      mais.addEventListener("pointerdown", (e) => e.stopPropagation());
      mais.onclick = () => opts.onAbrirDiario();
      corpo.append(mais);
    }
    painel.append(corpo);
  }

  return {
    setQuests(ev) {
      estados = new Map((ev?.quests ?? []).map((q) => [q.id, q]));
      render();
    },
    setDefs(ev) {
      defs = new Map((ev?.defs ?? []).map((d) => [d.id, d]));
      render();
    },
  };
}
