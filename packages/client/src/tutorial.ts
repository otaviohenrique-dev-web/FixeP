import Phaser from "phaser";
import { zoneNpcs, objetivoAtual, type QuestDef, type QuestEstado, type QuestEvent, type QuestDefsEvent } from "@frixep/shared";

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

/** Destino da trilha: o ponto do passo "chegar", ou o NPC para aceitar/entregar/conversar (só na zona atual). */
export function destinoTrilha(
  defs: Map<string, QuestDef>, estados: Map<string, QuestEstado>, zona: number,
): { x: number; y: number; raio: number } | null {
  const npc = (id: string | null | undefined) => { const n = id ? zoneNpcs(zona).find((d) => d.id === id) : undefined; return n ? { x: n.x, y: n.y, raio: 2.5 } : null; };
  const passos = passosTutorial(defs.values());
  const pendente = passos.find((d) => estados.get(d.id)?.estado !== "entregue");
  if (pendente) {
    const est = estados.get(pendente.id);
    if (!est || est.estado === "pronta") return npc(pendente.npc ?? "merchant");
    const o = pendente.objetivos[objetivoAtual(pendente, est.progresso)];
    if (o?.tipo === "chegar") return o.zona === zona ? { x: o.x, y: o.y, raio: o.raio } : null;
    if (o?.tipo === "falar") return npc(o.npc);
    return null;
  }
  // fora do tutorial: a primeira missão pronta aponta para quem recebe
  for (const est of estados.values()) if (est.estado === "pronta") { const d = defs.get(est.id); const alvo = npc(d?.npc); if (alvo) return alvo; }
  return null;
}

export function mountTutorial(opts: { scene?: Phaser.Scene; toScreen: ToScreen; getZone(): number; getPlayer?(): { x: number; y: number } | null }): TutorialUi {
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

  // trilha tracejada no chão até o destino: só mostra o caminho, nunca anda pelo jogador; some ao chegar perto
  let destino: { x: number; y: number; raio: number } | null = null;
  const trilha = opts.scene?.add.graphics().setDepth(0.29);
  if (opts.scene && trilha) {
    const desenhar = (time: number) => {
      trilha.clear();
      const p = opts.getPlayer?.();
      if (!destino || !p) return;
      const dx = destino.x - p.x, dy = destino.y - p.y;
      const dist = Math.hypot(dx, dy);
      if (dist <= destino.raio + 0.5) return; // chegou
      const passo = 0.7; // tiles entre os pontos
      const desloc = ((time / 900) % 1) * passo; // anda devagar na direção do destino
      const ux = dx / dist, uy = dy / dist;
      for (let d = 1 + desloc; d < dist - 0.6; d += passo) {
        const fade = Math.min(1, (d - 0.6) / 1.5) * Math.min(1, (dist - d) / 1.2);
        const a = toS(p.x + ux * d, p.y + uy * d);
        const b = toS(p.x + ux * (d + 0.38), p.y + uy * (d + 0.38));
        trilha.lineStyle(6, 0x000000, 0.35 * fade).lineBetween(a.sx, a.sy + 1, b.sx, b.sy + 1);
        trilha.lineStyle(3.5, 0xffe08a, 0.95 * fade).lineBetween(a.sx, a.sy, b.sx, b.sy);
      }
    };
    const toS = opts.toScreen;
    const onUpdate = (time: number) => desenhar(time);
    opts.scene.events.on("update", onUpdate);
    opts.scene.events.once("shutdown", () => opts.scene?.events.off("update", onUpdate));
  }

  /** a bandeira aparece só no passo "chegar" ativo, na zona onde o ponto está */
  function atualizar() {
    destino = destinoTrilha(defs, estados, opts.getZone());
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
