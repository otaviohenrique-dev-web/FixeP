import Phaser from "phaser";
import type { QuestDef, QuestEstado, QuestEvent, QuestDefsEvent } from "@frixep/shared";

/**
 * Tutorial de 5 quests (C1.4): a bandeira no chão apontando o ponto da quest "chegar". O texto do passo atual
 * mora no rastreador de missões (rastreador.ts), que usa `passosTutorial` e `textoPasso` daqui.
 * Não decide nada: segue o que o servidor mandou (quest_estado e quest_defs).
 * - Passos: as quests com id "tutorial_*", na ordem dos pré-requisitos. Some quando todas estão entregues.
 * - Texto: para toque (celular) e para teclado/mouse (PC), vindo da "dica" de cada quest; antes de aceitar e
 *   para entregar, o texto diz para falar com o NPC (texto geral, igual para toque e teclado, com a troca de verbo).
 */

export interface TutorialUi {
  setQuests(ev: QuestEvent): void;
  setDefs(ev: QuestDefsEvent): void;
}

type ToScreen = (x: number, y: number) => { sx: number; sy: number };

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

/** Texto do passo atual (null = nada a mostrar). `touch` escolhe o verbo e o texto de toque. */
export function textoPasso(def: QuestDef, estado: QuestEstado["estado"] | undefined, touch: boolean): string | null {
  if (!estado) return touch ? `Toque em Garrick e aceite: ${def.nome}.` : `Clique em Garrick e aceite: ${def.nome}.`;
  if (estado === "pronta") return touch ? "Toque em Garrick e depois em Entregar." : "Clique em Garrick e depois em Entregar.";
  if (estado === "ativa") return def.dica ? (touch ? def.dica.toque : def.dica.teclado) : def.texto;
  return null;
}

export function mountTutorial(opts: { scene?: Phaser.Scene; toScreen: ToScreen; getZone(): number }): TutorialUi {
  // a cena é refeita a cada travessia de zona: remove a bandeira e o estilo da montagem anterior
  document.querySelectorAll("style[data-tut]").forEach((e) => e.remove());

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

  /** a bandeira aparece só no passo "chegar" ativo, na zona onde o ponto está */
  function atualizar() {
    const passos = passosTutorial(defs.values());
    const pendente = passos.find((d) => estados.get(d.id)?.estado !== "entregue");
    if (!pendente) {
      flag?.setVisible(false);
      return;
    }
    const est = estados.get(pendente.id)?.estado;
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
