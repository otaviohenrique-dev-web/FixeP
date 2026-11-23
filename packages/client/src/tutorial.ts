import Phaser from "phaser";
import type { QuestDef, QuestEstado, QuestEvent, QuestDefsEvent } from "@frixep/shared";

/**
 * Tutorial de 5 quests (C1.4): uma faixa no topo da tela com a instrução do passo atual e uma bandeira no chão
 * apontando o ponto da quest "chegar". Não decide nada: segue o que o servidor mandou (quest_estado e quest_defs).
 * - Passos: as quests com id "tutorial_*", na ordem dos pré-requisitos. Some quando todas estão entregues.
 * - Texto: para toque (celular) e para teclado/mouse (PC), vindo da "dica" de cada quest; antes de aceitar e
 *   para entregar, a faixa diz para falar com o NPC (texto geral, igual para toque e teclado, com a troca de verbo).
 * - A faixa é pequena e fica no alto, no centro, para não cobrir o joystick, as habilidades nem o rastreador.
 */

export interface TutorialUi {
  setQuests(ev: QuestEvent): void;
  setDefs(ev: QuestDefsEvent): void;
}

type ToScreen = (x: number, y: number) => { sx: number; sy: number };

const CSS = `
.tut{position:fixed;z-index:17;top:calc(max(6px,env(safe-area-inset-top)) + 40px);left:50%;transform:translateX(-50%);
  max-width:min(440px,calc(100vw - 280px));min-width:0;padding:5px 12px;border-radius:7px;pointer-events:none;
  font:700 12px/1.3 "Cinzel",Georgia,serif;color:#f4e6b8;text-align:center;
  background:linear-gradient(180deg,rgba(20,34,52,.9),rgba(6,12,20,.9));border:1px solid rgba(255,150,70,.55);box-shadow:0 6px 18px rgba(0,0,0,.55)}
.tut[hidden]{display:none}
.tut small{display:block;margin-bottom:1px;font:700 9px/1 "Cinzel",Georgia,serif;letter-spacing:.14em;text-transform:uppercase;color:#ffb072}
.tut-hd{display:flex;align-items:center;justify-content:space-between;gap:10px}
.tut-min{pointer-events:auto;cursor:pointer;width:22px;height:22px;margin:-3px -6px 0 0;padding:0;border-radius:50%;border:1px solid rgba(255,176,114,.6);background:rgba(10,16,26,.8);color:#ffb072;font:700 14px/1 Georgia,serif;touch-action:manipulation;-webkit-tap-highlight-color:transparent}
.tut.min{padding:3px 6px 3px 10px}
.tut.min .tut-min{margin:0}
@media (max-width:640px){.tut{max-width:calc(100vw - 280px);font-size:11px}}
@media (pointer:coarse) and (orientation:landscape){.tut{max-width:min(400px,calc(100vw - 300px))}}
`;

const MIN_KEY = "frixep.tut.min";
let minimizado = (() => { try { return localStorage.getItem(MIN_KEY) === "1"; } catch { return false; } })(); // a escolha vale também depois de trocar de zona

const COARSE = typeof matchMedia === "function" && matchMedia("(pointer: coarse)").matches;

/** Ordem dos passos do tutorial: a cadeia de pré-requisitos (a que começa sem pré-requisito, depois a que depende dela...). */
export function passosTutorial(defs: Iterable<QuestDef>): QuestDef[] {
  const tut = [...defs].filter((d) => d.id.startsWith("tutorial_"));
  const ordem: QuestDef[] = [];
  let atual = tut.find((d) => d.preRequisitos.length === 0);
  while (atual && !ordem.includes(atual)) {
    ordem.push(atual);
    const prox: QuestDef | undefined = atual;
    atual = tut.find((d) => d.preRequisitos.includes(prox.id));
  }
  return ordem;
}

/** Texto da faixa para o passo atual (null = nada a mostrar). `touch` escolhe o verbo e o texto de toque. */
export function textoPasso(def: QuestDef, estado: QuestEstado["estado"] | undefined, touch: boolean): string | null {
  if (!estado) return touch ? `Toque em Garrick e aceite: ${def.nome}.` : `Clique em Garrick e aceite: ${def.nome}.`;
  if (estado === "pronta") return touch ? "Toque em Garrick e depois em Entregar." : "Clique em Garrick e depois em Entregar.";
  if (estado === "ativa") return def.dica ? (touch ? def.dica.toque : def.dica.teclado) : def.texto;
  return null;
}

export function mountTutorial(opts: { scene?: Phaser.Scene; toScreen: ToScreen; getZone(): number }): TutorialUi {
  // a cena é refeita a cada travessia de zona: remove faixa e estilo da montagem anterior (senão a faixa velha fica na tela, parada no texto antigo)
  document.querySelectorAll(".tut, style[data-tut]").forEach((e) => e.remove());
  const style = document.createElement("style");
  style.dataset.tut = "1";
  style.textContent = CSS;
  document.head.append(style);

  const band = document.createElement("div");
  band.className = "tut";
  band.setAttribute("role", "status");
  band.setAttribute("aria-live", "polite");
  band.hidden = true;
  document.body.append(band);

  // bandeira no chão (desenhada por código, como os portões): mastro, pano que tremula e anel pulsante
  const flag = opts.scene?.add.container(0, 0).setDepth(0.3).setVisible(false);
  if (flag && opts.scene) {
    const g = opts.scene.add.graphics();
    g.fillStyle(0x000000, 0.35).fillEllipse(0, 2, 26, 9);
    g.lineStyle(2, 0xffe2a8, 0.9).strokeEllipse(0, 2, 30, 11);
    g.fillStyle(0x4a2e18, 1).fillRect(-1.5, -40, 3, 42);
    g.fillStyle(0xd8462c, 1).fillTriangle(1.5, -40, 1.5, -22, 24, -31);
    g.fillStyle(0xffd27a, 1).fillCircle(0, -41, 2.5);
    flag.add(g);
    opts.scene.tweens.add({ targets: flag, alpha: { from: 0.75, to: 1 }, duration: 700, yoyo: true, repeat: -1 });
  }

  let defs = new Map<string, QuestDef>();
  let estados = new Map<string, QuestEstado>();

  /** Passo atual e o que mostrar. */
  function atualizar() {
    const passos = passosTutorial(defs.values());
    const pendente = passos.find((d) => estados.get(d.id)?.estado !== "entregue");
    if (!pendente) {
      band.hidden = true;
      flag?.setVisible(false);
      return;
    }
    const est = estados.get(pendente.id)?.estado;
    const texto = textoPasso(pendente, est, COARSE);
    band.replaceChildren();
    if (texto) {
      const s = document.createElement("small");
      s.textContent = `Tutorial · ${passos.indexOf(pendente) + 1}/${passos.length}`;
      const btn = document.createElement("button"); // – minimiza a faixa para uma pílula; + abre de novo
      btn.type = "button";
      btn.className = "tut-min";
      btn.textContent = minimizado ? "+" : "–";
      btn.title = btn.ariaLabel = minimizado ? "Mostrar o tutorial" : "Minimizar o tutorial";
      btn.addEventListener("pointerdown", (e) => e.stopPropagation()); // não repassa o toque ao jogo (não anda nem ataca)
      btn.addEventListener("click", () => {
        minimizado = !minimizado;
        try { localStorage.setItem(MIN_KEY, minimizado ? "1" : "0"); } catch { /* sem armazenamento */ }
        atualizar();
      });
      band.classList.toggle("min", minimizado);
      const hd = document.createElement("div");
      hd.className = "tut-hd";
      hd.append(s, btn);
      band.append(hd);
      if (!minimizado) band.append(document.createTextNode(texto));
      band.hidden = false;
    } else {
      band.hidden = true;
    }
    // bandeira: só no passo "chegar" ativo, na zona onde o ponto está
    const obj = pendente.objetivos.find((o) => o.tipo === "chegar");
    const indice = pendente.objetivos.findIndex((o) => o.tipo === "chegar");
    const progresso = estados.get(pendente.id)?.progresso[indice] ?? 0;
    if (flag && opts.scene && obj?.tipo === "chegar" && est === "ativa" && progresso < 1 && obj.zona === opts.getZone()) {
      const { sx, sy } = opts.toScreen(obj.x, obj.y);
      flag.setPosition(sx, sy).setVisible(true);
    } else {
      flag?.setVisible(false);
    }
  }

  return {
    setQuests(ev) {
      estados = new Map((ev?.quests ?? []).map((q) => [q.id, q]));
      atualizar();
    },
    setDefs(ev) {
      defs = new Map((ev?.defs ?? []).map((d) => [d.id, d]));
      atualizar();
    },
  };
}
