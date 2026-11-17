import Phaser from "phaser";
import { Client, Room, getStateCallbacks } from "colyseus.js";
import {
  Msg, Evt, MAP_W, MAP_H, WARRIOR, SKELETON, xpToNext, ITEMS, RARITY_COLOR,
  type InventorySnapshot, type LootEvent, type NoticeEvent,
  type ActionId, type ActPayload, type SwingEvent, type TelegraphEvent, type HitEvent, type DiedEvent, type LevelUpEvent,
} from "@frixep/shared";
import { ensureLogin, logout, wsUrl } from "./auth";
import { ensureCharacter } from "./character";
import { mountGameMenu } from "./menu";
import { mountHud, type Hud } from "./hud";
import { mountInventory, type InventoryUi } from "./inventory";
import { sfx } from "./sfx";

const TILE_W = 64;
const TILE_H = 32;
// projeção iso: grade (x,y) -> tela, e inversa
const toScreen = (x: number, y: number) => ({ sx: (x - y) * (TILE_W / 2), sy: (x + y) * (TILE_H / 2) });
const toGrid = (sx: number, sy: number) => ({
  x: (sx / (TILE_W / 2) + sy / (TILE_H / 2)) / 2,
  y: (sy / (TILE_H / 2) - sx / (TILE_W / 2)) / 2,
});
// um círculo de raio r (tiles) vira uma elipse no chão isométrico
const ELL_W = Math.SQRT2 * TILE_W; // por unidade de raio => largura total
const ELL_H = Math.SQRT2 * TILE_H;
const dirScreen = (ang: number) => {
  const dx = (Math.cos(ang) - Math.sin(ang)) * (TILE_W / 2);
  const dy = (Math.cos(ang) + Math.sin(ang)) * (TILE_H / 2);
  const l = Math.hypot(dx, dy) || 1;
  return { x: dx / l, y: dy / l };
};
const menuOpen = () => !!document.querySelector(".gm-back.open");

class WorldScene extends Phaser.Scene {
  private room!: Room;
  private hud!: Hud;
  private inv!: InventoryUi;
  private sprites = new Map<string, Phaser.GameObjects.Arc>();
  private labels = new Map<string, Phaser.GameObjects.Text>();
  private bars!: Phaser.GameObjects.Graphics;
  private emitters!: { orange: Phaser.GameObjects.Particles.ParticleEmitter; red: Phaser.GameObjects.Particles.ParticleEmitter; gold: Phaser.GameObjects.Particles.ParticleEmitter };
  private hitstopUntil = 0;
  private touchMode = false;
  private deadUntil = 0;

  private get state(): any { return this.room?.state; }
  private me(): any { return this.state?.players?.get(this.room.sessionId); }

  async create() {
    const g = this.add.graphics();
    g.lineStyle(1, 0x2a2a3a, 1);
    for (let x = 0; x < MAP_W; x++) {
      for (let y = 0; y < MAP_H; y++) {
        const { sx, sy } = toScreen(x, y);
        g.strokePoints(
          [
            new Phaser.Math.Vector2(sx, sy - TILE_H / 2),
            new Phaser.Math.Vector2(sx + TILE_W / 2, sy),
            new Phaser.Math.Vector2(sx, sy + TILE_H / 2),
            new Phaser.Math.Vector2(sx - TILE_W / 2, sy),
          ],
          true,
        );
      }
    }

    const token = (this.sys.settings.data as { token: string }).token;
    try {
      this.room = await new Client(wsUrl).joinOrCreate("zone", { token });
    } catch {
      logout(); // token inválido/recusado: volta ao login
      return;
    }
    // o primeiro estado chega logo depois do join: espera antes de ler as coleções
    if (!this.state?.players) await new Promise<void>((resolve) => this.room.onStateChange.once(() => resolve()));

    this.makeEffects();

    // colyseus.js 0.16: callbacks de coleção passam por getStateCallbacks
    const $ = getStateCallbacks(this.room);
    const st = $(this.state);

    st.players.onAdd((p: any, id: string) => {
      const me = id === this.room.sessionId;
      this.sprites.set(`p:${id}`, this.add.circle(0, 0, 10, me ? 0xff8a3d : 0x6fa8dc).setStrokeStyle(2, 0x000000, 0.5));
      this.labels.set(`p:${id}`, this.add.text(0, 0, p.name, { fontSize: "10px", color: "#ccc" }).setOrigin(0.5, 3.4));
      if (me) this.cameras.main.startFollow(this.sprites.get(`p:${id}`)!, true, 0.1, 0.1);
    });
    st.players.onRemove((_: any, id: string) => this.dropSprite(`p:${id}`));

    st.enemies.onAdd((e: any, id: string) => {
      this.sprites.set(`e:${id}`, this.add.circle(0, 0, 12, 0xd8d2c0).setStrokeStyle(2, 0x000000, 0.6));
      this.labels.set(`e:${id}`, this.add.text(0, 0, SKELETON.name, { fontSize: "10px", color: "#e8e2d0" }).setOrigin(0.5, 3.1));
    });
    st.enemies.onRemove((_: any, id: string) => this.dropSprite(`e:${id}`));

    // HUD, menu e entrada
    this.hud = mountHud({ onAction: (a) => this.act(a) });
    mountGameMenu({
      playerName: this.me()?.name ?? "Portador",
      onLogout: async () => {
        leaving = true;
        try { await this.room.leave(true); } catch { /* já desconectado */ }
        logout();
      },
    });
    let leaving = false;
    this.room.onLeave((code) => {
      if (leaving) return;
      if (code === 4001) logout(); // outra aba assumiu a conta: vai ao login sem disputar a sessão
      else location.reload(); // queda de rede ou servidor: recarrega mantendo o token
    });

    this.room.onMessage(Evt.Swing, (m: SwingEvent) => {
      if (m.id !== this.room.sessionId) this.playSwing(m.a, m.x, m.y, m.dir, false); // a própria ação já foi mostrada
    });
    this.room.onMessage(Evt.Telegraph, (m: TelegraphEvent) => this.onTelegraph(m));
    this.room.onMessage(Evt.Hit, (m: HitEvent) => this.onHit(m));
    this.room.onMessage(Evt.Died, (m: DiedEvent) => this.onDied(m));
    this.room.onMessage(Evt.LevelUp, (m: LevelUpEvent) => this.onLevelUp(m));

    // mochila: registra os receptores ANTES de pedir a fotografia (evita perder a mensagem inicial)
    this.inv = mountInventory({ send: (t, p) => this.room.send(t, p), getLevel: () => this.me()?.level ?? 1 });
    this.room.onMessage(Evt.Inv, (s: InventorySnapshot) => this.inv.setSnapshot(s));
    this.room.onMessage(Evt.Loot, (m: LootEvent) => {
      const d = ITEMS[m.id];
      if (!d) return;
      this.inv.toast(`+ ${d.name}${m.qty > 1 ? ` x${m.qty}` : ""}`, RARITY_COLOR[d.rarity]);
      sfx.pickup();
    });
    this.room.onMessage(Evt.Notice, (m: NoticeEvent) => this.inv.toast(String(m.text), "#ffb3a6"));
    this.room.send(Msg.InvSync, {});

    this.input.on("pointerdown", (ptr: Phaser.Input.Pointer) => {
      const { x, y } = toGrid(ptr.worldX, ptr.worldY);
      this.room.send(Msg.MoveTo, { x, y });
    });
    // distingue toque de mouse (define como a mira é escolhida)
    const kind = (e: PointerEvent) => { this.touchMode = e.pointerType === "touch"; };
    window.addEventListener("pointerdown", kind, true);
    window.addEventListener("pointermove", kind, true);

    // teclado: ESPAÇO ataque | 1 2 3 skills | SHIFT esquiva
    const keys: Record<string, ActionId> = {
      Space: "attack", Digit1: "skill1", Digit2: "skill2", Digit3: "skill3", Numpad1: "skill1", Numpad2: "skill2", Numpad3: "skill3",
      ShiftLeft: "dodge", ShiftRight: "dodge",
    };
    window.addEventListener("keydown", (e) => {
      if (e.code === "KeyQ" && !e.repeat && !menuOpen()) { // Q: bebe a primeira poção
        const slot = this.inv.firstPotionSlot();
        if (slot >= 0) this.room.send(Msg.InvUse, { slot });
        else this.inv.toast("Você não tem poções.", "#ffb3a6");
        return;
      }
      const a = keys[e.code];
      if (!a || e.repeat || menuOpen()) return;
      e.preventDefault();
      (document.activeElement as HTMLElement | null)?.blur?.(); // ESPAÇO não deve "clicar" no botão focado
      this.hud.trigger(a);
    });
  }

  // ---------------------------------------------------------------- efeitos
  private makeEffects() {
    this.bars = this.add.graphics().setDepth(1e5);
    const tex = this.make.graphics({ x: 0, y: 0 }, false);
    tex.fillStyle(0xffffff, 1);
    tex.fillCircle(3, 3, 3);
    tex.generateTexture("spark", 6, 6);
    tex.destroy();
    const mk = (tint: number) =>
      this.add
        .particles(0, 0, "spark", {
          lifespan: { min: 220, max: 480 }, speed: { min: 60, max: 210 }, scale: { start: 1.2, end: 0 },
          alpha: { start: 1, end: 0 }, tint, blendMode: "ADD", emitting: false,
        })
        .setDepth(1e6);
    this.emitters = { orange: mk(0xffa040), red: mk(0xff3b2b), gold: mk(0xffe27a) };
  }

  private ring(gx: number, gy: number, r: number, color: number, ms: number, from = 1, fill = true) {
    const { sx, sy } = toScreen(gx, gy);
    const e = this.add.ellipse(sx, sy, r * ELL_W, r * ELL_H, color, fill ? 0.4 : 0).setStrokeStyle(2, color, 0.95).setDepth(0.6).setScale(from);
    this.tweens.add({ targets: e, scale: 1.15, alpha: 0, duration: ms, ease: "Cubic.easeOut", onComplete: () => e.destroy() });
  }

  private dropSprite(key: string) {
    this.sprites.get(key)?.destroy();
    this.sprites.delete(key);
    this.labels.get(key)?.destroy();
    this.labels.delete(key);
  }

  /** visual de uma ação; `mine` = ação do próprio jogador (toca o som) */
  private playSwing(a: ActionId, gx: number, gy: number, dir: number, mine: boolean) {
    const A = WARRIOR.actions;
    const dx = Math.cos(dir), dy = Math.sin(dir);
    switch (a) {
      case "attack":
        this.ring(gx + dx * A.attack.offset, gy + dy * A.attack.offset, A.attack.radius, 0xffffff, 150, 0.6);
        if (mine) sfx.swing();
        break;
      case "skill1":
        this.ring(gx, gy, A.skill1.radius, 0xffd9a0, 330, 0.3);
        if (mine) sfx.whirl();
        break;
      case "skill2":
        for (let i = 0; i <= 6; i++) {
          const k = (i / 6) * A.skill2.dash;
          const { sx, sy } = toScreen(gx + dx * k, gy + dy * k);
          this.emitters.orange.explode(3, sx, sy);
        }
        this.ring(gx + dx * A.skill2.dash, gy + dy * A.skill2.dash, A.skill2.radius, 0xffa040, 260, 0.5);
        if (mine) sfx.dash();
        break;
      case "skill3":
        this.ring(gx, gy, A.skill3.tauntRadius, 0xff9a4d, 650, 0.2, false);
        this.ring(gx, gy, 1.2, 0xffd08a, 400, 0.4);
        if (mine) sfx.shout();
        break;
      case "dodge": {
        const { sx, sy } = toScreen(gx, gy);
        this.emitters.gold.explode(8, sx, sy);
        if (mine) sfx.dash();
        break;
      }
    }
  }

  private onTelegraph(m: TelegraphEvent) {
    const { sx, sy } = toScreen(m.x, m.y);
    const w = m.r * ELL_W, h = m.r * ELL_H;
    const outline = this.add.ellipse(sx, sy, w, h, 0xff2a2a, 0.12).setStrokeStyle(2, 0xff5a4a, 0.95).setDepth(0.5);
    const inner = this.add.ellipse(sx, sy, w, h, 0xff2a2a, 0.38).setDepth(0.55).setScale(0.1);
    this.tweens.add({ targets: inner, scale: 1, duration: m.ms, ease: "Quad.easeIn" });
    this.time.delayedCall(m.ms + 120, () => { outline.destroy(); inner.destroy(); });
    sfx.warn();
  }

  private floatText(gx: number, gy: number, txt: string, color: string, size: number, pop: boolean) {
    const { sx, sy } = toScreen(gx, gy);
    const t = this.add
      .text(sx, sy - 26, txt, { fontFamily: "Cinzel, Georgia, serif", fontStyle: "bold", fontSize: `${size}px`, color, stroke: "#000", strokeThickness: 4 })
      .setOrigin(0.5).setDepth(1e6);
    if (pop) { t.setScale(1.6); this.tweens.add({ targets: t, scale: 1, duration: 120, ease: "Back.easeOut" }); }
    this.tweens.add({ targets: t, y: t.y - 38, alpha: 0, duration: 750, delay: 120, ease: "Cubic.easeOut", onComplete: () => t.destroy() });
  }

  private onHit(m: HitEvent) {
    const mine = m.by === this.room.sessionId;
    const toMe = m.k === "p" && m.id === this.room.sessionId;
    const { sx, sy } = toScreen(m.x, m.y);
    if (m.k === "e") {
      (m.crit ? this.emitters.gold : this.emitters.orange).explode(m.crit ? 16 : 9, sx, sy - 10);
      this.floatText(m.x, m.y, String(m.dmg) + (m.crit ? "!" : ""), m.crit ? "#ffd45e" : "#ffffff", m.crit ? 24 : 17, m.crit);
      if (mine || m.crit) sfx.hit(m.crit);
      if (mine) {
        this.cameras.main.shake(m.crit ? 130 : 80, m.crit ? 0.006 : 0.003);
        this.hitstopUntil = this.time.now + (m.crit ? 90 : 55);
      }
    } else {
      this.emitters.red.explode(12, sx, sy - 10);
      this.floatText(m.x, m.y, String(m.dmg), "#ff6a5a", 20, true);
      if (toMe) {
        this.cameras.main.shake(170, 0.008);
        this.cameras.main.flash(130, 255, 50, 40);
        this.hitstopUntil = this.time.now + 70;
        sfx.hurt();
      }
    }
  }

  private onLevelUp(m: LevelUpEvent) {
    const s = this.sprites.get(`p:${m.id}`);
    if (!s) return;
    this.emitters.gold.explode(30, s.x, s.y - 8);
    const g = toGrid(s.x, s.y);
    this.floatText(g.x, g.y - 1.2, `NÍVEL ${m.level}!`, "#ffd45e", 26, true);
    if (m.id === this.room.sessionId) sfx.levelUp();
  }

  private onDied(m: DiedEvent) {
    if (m.k === "e") {
      const s = this.sprites.get(`e:${m.id}`);
      if (s) this.emitters.orange.explode(26, s.x, s.y - 8);
      sfx.enemyDie();
    } else if (m.id === this.room.sessionId) {
      this.deadUntil = this.time.now + WARRIOR.respawnS * 1000;
      this.cameras.main.shake(300, 0.012);
      sfx.die();
    }
  }

  // ---------------------------------------------------------------- ações
  /** ponto de mira em tiles: mouse = ponteiro; toque = inimigo mais próximo ou direção atual */
  private aim(): { x: number; y: number } {
    const me = this.me();
    if (!me) return { x: 0, y: 0 };
    if (!this.touchMode) {
      const p = this.input.activePointer;
      p.updateWorldPoint(this.cameras.main);
      return toGrid(p.worldX, p.worldY);
    }
    let best: any = null;
    let bd = 8;
    this.state.enemies.forEach((e: any) => {
      if (e.st === "dead") return;
      const d = Math.hypot(e.x - me.x, e.y - me.y);
      if (d < bd) { bd = d; best = e; }
    });
    if (best) return { x: best.x, y: best.y };
    return { x: me.x + Math.cos(me.face) * 3, y: me.y + Math.sin(me.face) * 3 };
  }

  private act(a: ActionId) {
    const me = this.me();
    if (!me || me.dead || !this.room) return;
    const { x, y } = this.aim();
    const payload: ActPayload = { a, ax: x, ay: y };
    this.room.send(Msg.Act, payload);
    // resposta imediata no cliente (o servidor continua sendo quem decide o resultado)
    this.playSwing(a, me.x, me.y, Math.atan2(y - me.y, x - me.x), true);
  }

  // ---------------------------------------------------------------- quadro
  update(time: number) {
    const st = this.state;
    if (!st?.players || !st?.enemies) return;
    const frozen = time < this.hitstopUntil; // hitstop: congela a interpolação por instantes
    this.bars.clear();

    const place = (key: string, x: number, y: number, face: number, hp: number, maxHp: number, hidden: boolean, dim = false) => {
      const s = this.sprites.get(key);
      if (!s) return;
      s.setVisible(!hidden);
      this.labels.get(key)?.setVisible(!hidden);
      if (hidden) return;
      const { sx, sy } = toScreen(x, y);
      if (!frozen) {
        s.x += (sx - s.x) * 0.35;
        s.y += (sy - s.y) * 0.35;
      }
      s.setDepth(s.y).setAlpha(dim ? 0.35 : 1);
      this.labels.get(key)?.setPosition(s.x, s.y).setDepth(s.y + 1);
      // barra de vida + marca de direção
      const w = 30;
      const ratio = Math.max(0, hp / maxHp);
      this.bars.fillStyle(0x000000, 0.7).fillRect(s.x - w / 2 - 1, s.y - 27, w + 2, 6);
      this.bars.fillStyle(key.startsWith("e:") ? 0xc0392b : 0x4cc26a, 1).fillRect(s.x - w / 2, s.y - 26, w * ratio, 4);
      const d = dirScreen(face);
      this.bars.lineStyle(3, 0xffffff, 0.85).lineBetween(s.x, s.y, s.x + d.x * 16, s.y + d.y * 16);
    };

    st.players.forEach((p: any, id: string) => place(`p:${id}`, p.x, p.y, p.face, p.hp, p.maxHp, false, p.dead));
    st.enemies.forEach((e: any, id: string) => {
      place(`e:${id}`, e.x, e.y, e.face, e.hp, e.maxHp, e.st === "dead");
      const s = this.sprites.get(`e:${id}`);
      if (s) s.setFillStyle(e.st === "windup" ? 0xff6a5a : 0xd8d2c0);
    });

    const me = this.me();
    if (me) {
      this.hud.setHp(me.hp, me.maxHp);
      this.hud.setBuff(!!me.buff);
      this.hud.setProgress(me.level, me.xp, xpToNext(me.level));
      if (me.dead) {
        if (!this.deadUntil) this.deadUntil = time + WARRIOR.respawnS * 1000;
        this.hud.setDead((this.deadUntil - time) / 1000);
      } else {
        this.deadUntil = 0;
        this.hud.setDead(null);
      }
    }
  }
}

// Primeiro o login; o Phaser só inicia depois que há um token válido.
const token = await ensureLogin();
await ensureCharacter(token); // sem personagem, mostra a criação antes de entrar no jogo
new Phaser.Game({
  type: Phaser.AUTO,
  parent: "game",
  backgroundColor: "#0b0b10",
  scale: { mode: Phaser.Scale.RESIZE, width: "100%", height: "100%" },
  scene: [],
  callbacks: {
    postBoot: (game) => {
      game.scene.add("world", WorldScene, true, { token });
    },
  },
});
