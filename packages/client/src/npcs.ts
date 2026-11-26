import Phaser from "phaser";
import { NPC_REACH, type NpcDef } from "@frixep/shared";
import { gridAngleToDir, pickDirection, type Dir } from "./sprites-core";
import type { ActorAtlas } from "./sprites";

/**
 * NPCs da zona (comerciante e ferreira), desenhados por código até a arte chegar: figura simples + placa com nome e ofício.
 * Ficam parados num ponto fixo (os dados vêm de shared/economy.ts: o servidor valida a distância com os mesmos números).
 */
type ToScreen = (x: number, y: number) => { sx: number; sy: number };
interface View {
  def: NpcDef; sx: number; sy: number; ring: Phaser.GameObjects.Graphics; body: Phaser.GameObjects.Container;
  sprite?: Phaser.GameObjects.Sprite; atlas?: ActorAtlas; dir: Dir; cur: string; busyUntil: number; nextAct: number;
  mark?: Phaser.GameObjects.Text; // "?" acima da placa: prata = dá para conversar (perto); ouro = tem missão para entregar
}
/** animação de ofício de cada NPC (tocada de tempos em tempos) e escala do sprite (o quadro de 64 px é do tamanho dos personagens) */
const ACT: Record<string, string> = { smith: "work", merchant: "count", auctioneer: "gavel" };
const SPRITE_SCALE = 1.5;

export class NpcLayer {
  private views = new Map<string, View>();
  private entregas = new Set<string>(); // NPCs que recebem uma missão pronta do jogador

  /** NPCs com missão pronta para entregar: o "?" fica dourado e aparece mesmo de longe */
  setEntregas(ids: Iterable<string>) { this.entregas = new Set(ids); }

  constructor(private scene: Phaser.Scene, private toScreen: ToScreen, npcs: readonly NpcDef[], private atlases: ReadonlyMap<string, ActorAtlas> = new Map()) {
    for (const n of npcs) this.build(n);
  }

  /** placa de madeira pendurada por correntes, com um emblema do ofício (martelo, balança ou martelo de leilão), o nome e o ofício */
  private sign(n: NpcDef, y: number): Phaser.GameObjects.GameObject[] {
    const s = this.scene;
    const g = s.add.graphics();
    g.lineStyle(1, 0x8a93a3, 1).lineBetween(-40, y - 4, -40, y + 4).lineBetween(40, y - 4, 40, y + 4); // correntes
    g.fillStyle(0x2a1b10, 1).fillRoundedRect(-58, y + 2, 116, 38, 5);
    g.fillStyle(0x4a2e1a, 1).fillRoundedRect(-56, y + 4, 112, 34, 4);
    g.lineStyle(2, 0xc9a45c, 1).strokeRoundedRect(-56, y + 4, 112, 34, 4);
    g.fillStyle(0xc9a45c, 1).fillCircle(-52, y + 8, 1.5).fillCircle(52, y + 8, 1.5).fillCircle(-52, y + 34, 1.5).fillCircle(52, y + 34, 1.5); // pregos
    // emblema (esquerda)
    const ex = -42, ey = y + 21;
    g.fillStyle(0xe6c27a, 1);
    if (n.kind === "smith") { g.fillRect(ex - 6, ey - 7, 12, 6).fillRect(ex - 1, ey - 2, 3, 11); g.fillStyle(0x8a93a3, 1).fillRect(ex - 6, ey - 7, 12, 2); }
    else if (n.kind === "merchant") { g.fillRect(ex - 1, ey - 8, 3, 15).fillRect(ex - 8, ey - 6, 16, 2).fillRect(ex - 6, ey + 6, 12, 2); g.fillCircle(ex - 7, ey + 1, 3).fillCircle(ex + 7, ey + 1, 3); }
    else { g.fillRect(ex - 7, ey - 6, 9, 5).fillRect(ex - 2, ey - 1, 3, 10); g.fillStyle(0xb8462e, 1).fillRect(ex - 7, ey - 6, 2, 5); g.fillStyle(0xe6c27a, 1).fillRect(ex + 4, ey + 7, 8, 2); }
    const nm = s.add.text(8, y + 15, n.name, { fontFamily: "Cinzel, Georgia, serif", fontStyle: "bold", fontSize: "13px", color: "#f4e6b8", stroke: "#000", strokeThickness: 3 }).setOrigin(0.5);
    const tt = s.add.text(8, y + 30, n.title.toUpperCase(), { fontFamily: "Cinzel, Georgia, serif", fontSize: "9px", color: "#c9a45c", stroke: "#000", strokeThickness: 2 }).setOrigin(0.5);
    return [g, nm, tt];
  }

  private build(n: NpcDef) {
    const atlas = this.atlases.get(`npc_${n.kind}`);
    if (atlas) return this.buildSprite(n, atlas);
    this.buildFallback(n);
  }

  private buildSprite(n: NpcDef, atlas: ActorAtlas) {
    const s = this.scene;
    const { sx, sy } = this.toScreen(n.x, n.y);
    const sprite = s.add.sprite(0, 0, atlas.key, atlas.firstFrame).setOrigin(0.5, 52 / 64).setScale(SPRITE_SCALE);
    const post = s.add.graphics();
    post.fillStyle(0x2a1b10, 1).fillRect(-2, -100, 4, 30); // poste da placa
    const body = s.add.container(sx, sy, [post, sprite, ...this.sign(n, -134)]).setDepth(sy);
    const ring = s.add.graphics().setDepth(0.7);
    const v: View = { def: n, sx, sy, ring, body, sprite, atlas, dir: "se", cur: "", busyUntil: 0, nextAct: 3000 + Math.random() * 5000 };
    this.views.set(n.id, v);
    this.play(v, "idle");
  }

  /** toca uma animação na direção atual (com espelhamento para SW/NW); só reinicia se mudou */
  private play(v: View, anim: string, force = false) {
    if (!v.sprite || !v.atlas) return;
    const pick = pickDirection(v.dir, (d) => v.atlas!.has.has(`${anim}_${d}`));
    if (!pick) return;
    const key = `${v.atlas.key}:${anim}:${pick.dir}`;
    v.sprite.setFlipX(pick.flip);
    if (key === v.cur && !force) return;
    v.cur = key;
    v.sprite.play(key, true);
    if (anim !== "idle") {
      v.busyUntil = this.scene.time.now + (v.atlas.durations.get(key) ?? 600);
      v.sprite.once(Phaser.Animations.Events.ANIMATION_COMPLETE, () => { v.busyUntil = 0; v.cur = ""; this.play(v, "idle"); });
    }
  }

  /** a conversa abriu: o NPC gesticula (animação "talk") */
  talk(id: string) {
    const v = this.views.get(id);
    if (v?.sprite) this.play(v, "talk", true);
  }

  private buildFallback(n: NpcDef) {
    const s = this.scene;
    const { sx, sy } = this.toScreen(n.x, n.y);
    const smith = n.kind === "smith";
    const g = s.add.graphics();
    // sombra
    g.fillStyle(0x000000, 0.35).fillEllipse(0, 2, 34, 12);
    if (smith) {
      // bigorna ao lado e brasa da forja
      g.fillStyle(0x2b2f38, 1).fillRect(14, -12, 22, 8).fillRect(18, -4, 14, 10).fillRect(15, 6, 20, 4);
      g.fillStyle(0x5d6471, 1).fillRect(14, -12, 22, 3);
      g.fillStyle(0xff7a2a, 0.9).fillCircle(-24, -4, 7);
      g.fillStyle(0xffd27a, 0.9).fillCircle(-24, -5, 3);
    } else {
      // pilha de caixas e sacos da barraca
      g.fillStyle(0x4a2e1a, 1).fillRect(14, -10, 18, 16).fillRect(-30, -6, 14, 12);
      g.fillStyle(0x7a4d2b, 1).fillRect(14, -10, 18, 4).fillRect(-30, -6, 14, 3);
      g.fillStyle(0x97703f, 1).fillCircle(-23, -12, 6);
    }
    // corpo (túnica), capuz/cabeça e braços
    const robe = smith ? 0x3a2f2f : 0x5a1f2a, trim = smith ? 0xb9824f : 0xc9a45c;
    g.fillStyle(robe, 1).fillTriangle(-12, 2, 12, 2, 0, -34);
    g.fillStyle(0x000000, 0.25).fillTriangle(0, 2, 12, 2, 0, -34);
    g.fillStyle(trim, 1).fillRect(-12, -2, 24, 3);
    g.fillStyle(smith ? 0xc08a62 : 0xb59a7a, 1).fillCircle(0, -38, 8);
    g.fillStyle(robe, 1).fillCircle(0, -42, 9).fillRect(-9, -42, 18, 4);
    g.fillStyle(0x0d121b, 1).fillRect(-5, -38, 3, 3).fillRect(2, -38, 3, 3); // olhos fundos
    if (smith) { g.fillStyle(0x6c7684, 1).fillRect(-16, -22, 5, 14); g.fillStyle(0x3a2819, 1).fillRect(-15, -10, 3, 12); } // martelo
    else { g.fillStyle(0xd9b25a, 1).fillCircle(16, -22, 5); g.fillStyle(0x2b2f38, 1).fillCircle(16, -22, 2); } // bolsa de moedas
    const sign = s.add.graphics();
    sign.fillStyle(0x2a1b10, 1).fillRect(-2, -92, 4, 40);
    const plate = this.sign(n, -112);
    const body = s.add.container(sx, sy, [g, sign, ...plate]).setDepth(sy);
    s.tweens.add({ targets: g, y: -1.5, duration: 1400 + Math.random() * 400, yoyo: true, repeat: -1, ease: "Sine.easeInOut" }); // respiração
    const ring = s.add.graphics().setDepth(0.7);
    this.views.set(n.id, { def: n, sx, sy, ring, body, dir: "se", cur: "", busyUntil: 0, nextAct: Infinity });
  }

  /** NPC mais próximo do ponto (em tiles) dentro de `maxD`, ou null */
  nearest(gx: number, gy: number, maxD: number): NpcDef | null {
    let best: NpcDef | null = null, bd = maxD;
    for (const v of this.views.values()) {
      const d = Math.hypot(v.def.x - gx, v.def.y - gy);
      if (d < bd) { bd = d; best = v.def; }
    }
    return best;
  }

  /** NPC sob o ponto do mundo (px): a figura é alta, então o clique vale em cima do corpo e da placa */
  hit(wx: number, wy: number): NpcDef | null {
    for (const v of this.views.values()) if (Math.abs(wx - v.sx) < 34 && wy > v.sy - 120 && wy < v.sy + 14) return v.def;
    return null;
  }

  /** NPC ao alcance de conversa de quem está em (gx, gy) */
  inReach(gx: number, gy: number): NpcDef | null {
    return this.nearest(gx, gy, NPC_REACH);
  }

  /** anel dourado no chão do NPC enquanto o jogador está ao alcance (convite para falar) */
  update(time: number, gx: number, gy: number) {
    for (const v of this.views.values()) {
      if (v.sprite) {
        // NPCs mantêm-se virados de frente ("se"); de tempos em tempos executam seu ofício
        if (!v.busyUntil && time > v.nextAct) {
          this.play(v, ACT[v.def.kind] ?? "idle", true);
          v.nextAct = time + 7000 + Math.random() * 6000;
        }
      }
      v.ring.clear();
      const perto = Math.hypot(v.def.x - gx, v.def.y - gy) <= NPC_REACH;
      const ouro = this.entregas.has(v.def.id);
      if (!v.mark) {
        v.mark = this.scene.add.text(8, -138, "?", { fontFamily: "Cinzel, Georgia, serif", fontStyle: "bold", fontSize: "26px", color: "#d9dee6", stroke: "#000", strokeThickness: 4 }).setOrigin(0.5, 1);
        v.body.add(v.mark);
      }
      v.mark.setVisible(perto || ouro);
      if (v.mark.visible) {
        v.mark.setColor(ouro ? "#ffd24a" : "#d9dee6").setY(-138 + Math.sin(time / 320) * 3);
        v.mark.setShadow(0, 0, ouro ? "#ffb000" : "#9aa6b8", ouro ? 10 : 4, true, true);
      }
      if (perto) {
        const a = 0.55 + 0.25 * Math.sin(time / 260);
        v.ring.lineStyle(3, 0xf0cf86, a).strokeEllipse(v.sx, v.sy + 2, 54, 24);
      }
    }
  }
}
