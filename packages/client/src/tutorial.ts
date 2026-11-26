import type Phaser from "phaser";
import { ZONES, ZONE_NPCS, WORLD_GATE, HUB_ZONE, PORTAL_TRIGGER_RADIUS, objetivoAtual, type QuestDef, type QuestEstado, type QuestEvent, type QuestDefsEvent } from "@frixep/shared";

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

const TOWN = HUB_ZONE; // a cidade segura (onde ficam os NPCs)
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

type Ponto = { x: number; y: number; raio: number };

/** Portal da zona atual que leva na direção de `alvo`: direto; senão o portão da cidade (mapa-mundo); senão volta à cidade. */
function portalPara(zona: number, alvo: number): Ponto | null {
  const ps = ZONES[zona]?.portals ?? [];
  const p = ps.find((q) => q.to === alvo) ?? (alvo !== TOWN ? ps.find((q) => q.to === WORLD_GATE) : undefined) ?? ps.find((q) => q.to === TOWN);
  return p ? { x: p.x, y: p.y, raio: PORTAL_TRIGGER_RADIUS } : null;
}

/** Destinos da trilha (o mais perto do jogador é usado): ponto do "chegar", NPC, pontos de caça do "abater";
 *  se o objetivo é em outra zona, o portal que leva até lá. */
export function destinoTrilha(defs: Map<string, QuestDef>, estados: Map<string, QuestEstado>, zona: number): Ponto[] {
  const naZona = (z: number | undefined, pts: Ponto[]): Ponto[] => (z === undefined || z === zona ? pts : (() => { const p = portalPara(zona, z); return p ? [p] : []; })());
  const zonaDoNpc = (id: string) => Number(Object.keys(ZONE_NPCS).find((z) => ZONE_NPCS[Number(z)].some((n) => n.id === id)) ?? TOWN);
  const npc = (id: string | null | undefined): Ponto[] => {
    if (!id) return [];
    const z = zonaDoNpc(id);
    const n = (ZONE_NPCS[z] ?? []).find((d) => d.id === id);
    return n ? naZona(z, [{ x: n.x, y: n.y, raio: 2.5 }]) : [];
  };
  const objetivo = (def: QuestDef, est: QuestEstado): Ponto[] => {
    if (est.estado === "pronta") return npc(def.npc ?? "merchant");
    const o = def.objetivos[objetivoAtual(def, est.progresso)];
    if (!o) return [];
    if (o.tipo === "chegar") return naZona(o.zona, [{ x: o.x, y: o.y, raio: o.raio }]);
    if (o.tipo === "falar") return npc(o.npc);
    if (o.tipo === "abater") {
      const z = o.zona ?? zona;
      const pts = (ZONES[z]?.enemies ?? []).filter((e) => e.kind === o.kind).map((e) => ({ x: e.x, y: e.y, raio: (e.spread ?? 0) + 1.5 }));
      return naZona(z, pts);
    }
    return [];
  };
  const passos = passosTutorial(defs.values());
  const pendente = passos.find((d) => estados.get(d.id)?.estado !== "entregue");
  if (pendente) {
    const est = estados.get(pendente.id);
    return est ? objetivo(pendente, est) : []; // só depois de aceitar a missão (antes disso o "?" do NPC já indica)
  }
  // fora do tutorial: primeiro o que está pronto para entregar, depois a primeira missão ativa
  const lista = [...estados.values()];
  for (const est of [...lista.filter((e) => e.estado === "pronta"), ...lista.filter((e) => e.estado === "ativa")]) {
    const d = defs.get(est.id);
    const pts = d ? objetivo(d, est) : [];
    if (pts.length) return pts;
  }
  return [];
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
  let destinos: Ponto[] = [];
  const trilha = opts.scene?.add.graphics().setDepth(0.29);
  if (opts.scene && trilha) {
    const desenhar = (time: number) => {
      trilha.clear();
      const p = opts.getPlayer?.();
      if (!destinos.length || !p) return;
      let destino = destinos[0];
      for (const d of destinos) if (Math.hypot(d.x - p.x, d.y - p.y) < Math.hypot(destino.x - p.x, destino.y - p.y)) destino = d;
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
    destinos = destinoTrilha(defs, estados, opts.getZone());
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
