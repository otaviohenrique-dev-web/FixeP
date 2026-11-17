import Phaser from "phaser";
import { Client, Room, getStateCallbacks } from "colyseus.js";
import {
  Msg, Evt, MAP_W, MAP_H, CLASS_DEFS, RESPAWN_S, SKELETON, xpToNext, ITEMS, RARITY_COLOR,
  type CharClass, type HealEvent, type ProjEvent, type ProjEndEvent, type TrapEvent,
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
  private emitters!: { orange: Phaser.GameObjects.Particles.ParticleEmitter; red: Phaser.GameObjects.Particles.ParticleEmitter; gold: Phaser.GameObjects.Particles.ParticleEmitter; green: Phaser.GameObjects.Particles.ParticleEmitter };
  private hitstopUntil = 0;
  private touchMode = false;
  private deadUntil = 0;
  private cls: CharClass = "warrior";
  private projs = new Map<string, { x: number; y: number; dx: number; dy: number; speed: number; left: number; obj: Phaser.GameObjects.Shape }>();
  private traps = new Map<string, Phaser.GameObjects.Shape[]>();

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
    this.cls = ((this.me()?.cls as CharClass) ?? "warrior");

    // colyseus.js 0.16: callbacks de coleção passam por getStateCallbacks
    const $ = getStateCallbacks(this.room);
    const st = $(this.state);

    st.players.onAdd((p: any, id: string) => {
      const me = id === this.room.sessionId;
      this.sprites.set(`p:${id}`, this.add.circle(0, 0, 10, CLASS_DEFS[p.cls as CharClass]?.color ?? 0x6fa8dc).setStrokeStyle(me ? 3 : 2, me ? 0xffffff : 0x000000, me ? 0.9 : 0.5));
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
    this.hud = mountHud({ cls: this.cls, onAction: (a) => this.act(a) });
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
      // a própria ação já foi mostrada na hora; as dos outros usam a classe de quem agiu
      if (m.id !== this.room.sessionId) this.playSwing((this.state.players.get(m.id)?.cls as CharClass) ?? "warrior", m.a, m.x, m.y, m.dir, false);
    });
    this.room.onMessage(Evt.Proj, (m: ProjEvent) => this.onProj(m));
    this.room.onMessage(Evt.ProjEnd, (m: ProjEndEvent) => this.onProjEnd(m));
    this.room.onMessage(Evt.Trap, (m: TrapEvent) => this.onTrap(m));
    this.room.onMessage(Evt.Heal, (m: HealEvent) => this.onHeal(m));
    this.room.onMessage(Evt.Telegraph, (m: TelegraphEvent) => this.onTelegraph(m));
    this.room.onMessage(Evt.Hit, (m: HitEvent) => this.onHit(m));
    this.room.onMessage(Evt.Died, (m: DiedEvent) => this.onDied(m));
    this.room.onMessage(Evt.LevelUp, (m: LevelUpEvent) => this.onLevelUp(m));

    // mochila: registra os receptores ANTES de pedir a fotografia (evita perder a mensagem inicial)
    this.inv = mountInventory({ send: (t, p) => this.room.send(t, p), getLevel: () => this.me()?.level ?? 1, getClass: () => this.cls });
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
    this.emitters = { orange: mk(0xffa040), red: mk(0xff3b2b), gold: mk(0xffe27a), green: mk(0x7dff9a) };
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

  /** visual de uma ação, escolhido pelo TIPO da ação; `mine` = ação do próprio jogador (toca o som) */
  private playSwing(cls: CharClass, a: ActionId, gx: number, gy: number, dir: number, mine: boolean) {
    const def = CLASS_DEFS[cls].actions[a];
    const dx = Math.cos(dir), dy = Math.sin(dir);
    switch (def.kind) {
      case "melee":
        this.ring(gx + dx * (def.offset ?? 0), gy + dy * (def.offset ?? 0), def.radius ?? 1, 0xffffff, 150, 0.6);
        if (mine) sfx.swing();
        break;
      case "ring":
        this.ring(gx, gy, def.radius ?? 2, 0xffd9a0, 330, 0.3);
        if (mine) sfx.whirl();
        break;
      case "dashHit":
        for (let i = 0; i <= 6; i++) {
          const k = (i / 6) * (def.dash ?? 0);
          const { sx, sy } = toScreen(gx + dx * k, gy + dy * k);
          this.emitters.orange.explode(3, sx, sy);
        }
        this.ring(gx + dx * (def.dash ?? 0), gy + dy * (def.dash ?? 0), def.radius ?? 1, 0xffa040, 260, 0.5);
        if (mine) sfx.dash();
        break;
      case "tauntBuff":
        this.ring(gx, gy, def.tauntRadius ?? 5, 0xff9a4d, 650, 0.2, false);
        this.ring(gx, gy, 1.2, 0xffd08a, 400, 0.4);
        if (mine) sfx.shout();
        break;
      case "dodge": {
        const n = Math.max(2, Math.round((def.dash ?? 3) * 2));
        for (let i = 0; i < n; i++) {
          const k = (i / n) * (def.dash ?? 3);
          const { sx, sy } = toScreen(gx + dx * k, gy + dy * k);
          this.emitters.gold.explode(2, sx, sy);
        }
        if (mine) sfx.dash();
        break;
      }
      case "projectile": // o voo do projétil vem do servidor (Evt.Proj)
        if (mine) sfx.shoot();
        break;
      case "trap": // a armadilha aparece quando o servidor confirma (Evt.Trap)
        if (mine) sfx.trapSet();
        break;
      case "rain":
        if (mine) sfx.shoot();
        break;
      case "healAoe":
        this.ring(gx, gy, def.radius ?? 4, 0x7dff9a, 500, 0.2, false);
        this.ring(gx, gy, 1.4, 0xc8ffd4, 380, 0.4);
        if (mine) sfx.heal();
        break;
      case "emberBuff":
        this.ring(gx, gy, def.radius ?? 5, 0xffb347, 600, 0.2, false);
        this.ring(gx, gy, 1.4, 0xffd08a, 420, 0.4);
        if (mine) sfx.ember();
        break;
      case "revive":
        this.ring(gx, gy, 1.6, 0xfff2a8, 500, 0.3);
        if (mine) sfx.heal();
        break;
    }
  }

  // ---------------------------------------------------------------- projéteis, armadilhas e cura
  private onProj(m: ProjEvent) {
    const color = m.look === "pierce" ? 0x9fe39f : m.look === "bolt" ? 0xfff2a8 : 0xe8d9a0;
    const obj: Phaser.GameObjects.Shape =
      m.look === "bolt"
        ? this.add.circle(0, 0, 6, color).setBlendMode(Phaser.BlendModes.ADD)
        : this.add.ellipse(0, 0, m.look === "pierce" ? 26 : 18, m.look === "pierce" ? 6 : 4, color);
    const d = dirScreen(m.dir);
    obj.setRotation(Math.atan2(d.y, d.x)).setDepth(1e5);
    this.projs.set(m.id, { x: m.x, y: m.y, dx: Math.cos(m.dir), dy: Math.sin(m.dir), speed: m.speed, left: m.range, obj });
  }

  private onProjEnd(m: ProjEndEvent) {
    const pr = this.projs.get(m.id);
    if (!pr) return;
    pr.obj.destroy();
    this.projs.delete(m.id);
  }

  private onTrap(m: TrapEvent) {
    const { sx, sy } = toScreen(m.x, m.y);
    if (m.s === "set") {
      const ring = this.add.ellipse(sx, sy, m.r * ELL_W, m.r * ELL_H, 0x7dff9a, 0.08).setStrokeStyle(2, 0x7dff9a, 0.7).setDepth(0.4);
      const core = this.add.ellipse(sx, sy, 22, 11, 0xd9c58a, 0.9).setStrokeStyle(2, 0x3a2f12, 1).setDepth(0.45);
      this.tweens.add({ targets: ring, alpha: { from: 0.5, to: 1 }, duration: 700, yoyo: true, repeat: -1 });
      this.traps.set(m.id, [ring, core]);
      return;
    }
    const parts = this.traps.get(m.id);
    parts?.forEach((o) => o.destroy());
    this.traps.delete(m.id);
    if (m.s === "boom") {
      this.ring(m.x, m.y, m.r, 0xffa040, 380, 0.2);
      this.emitters.orange.explode(26, sx, sy);
      this.cameras.main.shake(120, 0.004);
      sfx.boom();
    }
  }

  private onHeal(m: HealEvent) {
    const { sx, sy } = toScreen(m.x, m.y);
    this.emitters.green.explode(m.revive ? 28 : 12, sx, sy - 10);
    if (m.revive) {
      this.emitters.gold.explode(20, sx, sy - 10);
      this.floatText(m.x, m.y - 0.6, "RENASCEU", "#fff2a8", 20, true);
      if (m.id === this.room.sessionId) { this.cameras.main.flash(250, 255, 240, 160); sfx.heal(); }
    } else {
      this.floatText(m.x, m.y, `+${m.amount}`, "#7dff9a", 18, true);
      if (m.id === this.room.sessionId) sfx.heal();
    }
  }

  private onTelegraph(m: TelegraphEvent) {
    const { sx, sy } = toScreen(m.x, m.y);
    const w = m.r * ELL_W, h = m.r * ELL_H;
    const col = m.friendly ? 0x66ccff : 0xff2a2a;
    const edge = m.friendly ? 0x9fe0ff : 0xff5a4a;
    const outline = this.add.ellipse(sx, sy, w, h, col, 0.12).setStrokeStyle(2, edge, 0.95).setDepth(0.5);
    const inner = this.add.ellipse(sx, sy, w, h, col, 0.38).setDepth(0.55).setScale(0.1);
    this.tweens.add({ targets: inner, scale: 1, duration: m.ms, ease: "Quad.easeIn" });
    this.time.delayedCall(m.ms + 120, () => { outline.destroy(); inner.destroy(); });
    if (!m.friendly) sfx.warn();
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
      this.deadUntil = this.time.now + RESPAWN_S * 1000;
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
    this.playSwing(this.cls, a, me.x, me.y, Math.atan2(y - me.y, x - me.x), true);
  }

  // ---------------------------------------------------------------- quadro
  update(time: number, delta: number) {
    const st = this.state;
    if (!st?.players || !st?.enemies) return;
    const frozen = time < this.hitstopUntil; // hitstop: congela a interpolação por instantes
    this.bars.clear();

    // projéteis: o servidor decide os acertos; aqui só animamos o voo com a mesma velocidade
    const dts = delta / 1000;
    for (const [id, pr] of this.projs) {
      const step = Math.min(pr.speed * dts, pr.left);
      pr.x += pr.dx * step;
      pr.y += pr.dy * step;
      pr.left -= step;
      const { sx, sy } = toScreen(pr.x, pr.y);
      pr.obj.setPosition(sx, sy - 10);
      if (pr.left <= 0.001) { pr.obj.destroy(); this.projs.delete(id); }
    }

    const place = (key: string, x: number, y: number, face: number, hp: number, maxHp: number, hidden: boolean, dim = false, ember = false) => {
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
      if (ember) this.bars.lineStyle(2, 0xffc861, 0.9).strokeEllipse(s.x, s.y + 8, 36, 18); // Brasa ativa
    };

    st.players.forEach((p: any, id: string) => place(`p:${id}`, p.x, p.y, p.face, p.hp, p.maxHp, false, p.dead, p.ember));
    st.enemies.forEach((e: any, id: string) => {
      place(`e:${id}`, e.x, e.y, e.face, e.hp, e.maxHp, e.st === "dead");
      const s = this.sprites.get(`e:${id}`);
      if (s) s.setFillStyle(e.st === "windup" ? 0xff6a5a : 0xd8d2c0);
    });

    const me = this.me();
    if (me) {
      this.hud.setHp(me.hp, me.maxHp);
      this.hud.setBuff(!!me.buff || !!me.ember, me.buff ? "Grito ativo" : "Brasa ativa");
      this.hud.setProgress(me.level, me.xp, xpToNext(me.level));
      if (me.dead) {
        if (!this.deadUntil) this.deadUntil = time + RESPAWN_S * 1000;
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
