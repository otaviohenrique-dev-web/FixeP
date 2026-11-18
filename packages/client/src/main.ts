import { isTypingTarget } from "./keys";
import Phaser from "phaser";
import { Client, Room, getStateCallbacks } from "colyseus.js";
import {
  Msg, Evt, CLASS_DEFS, RESPAWN_S, ZONES, zoneRoomName, enemyKind, xpToNext, ITEMS, RARITY_COLOR,
  type CharClass, type TravelEvent, type ZoneTheme, type HealEvent, type ProjEvent, type ProjEndEvent, type TrapEvent,
  type PartyEvent, type PartyInviteEvent, type PartyChatEvent, type InventorySnapshot, type ChatEvent, type PvpEvent, type LootEvent, type NoticeEvent,
  type ActionId, type ActPayload, type SwingEvent, type TelegraphEvent, type HitEvent, type DiedEvent, type LevelUpEvent, type XpEvent,
} from "@frixep/shared";
import { ensureLogin, logout, wsUrl } from "./auth";
import { ensureCharacter } from "./character";
import { mountGameMenu } from "./menu";
import { mountHud, type Hud } from "./hud";
import { mountInventory, type InventoryUi } from "./inventory";
import { sfx } from "./sfx";
import { mountStats } from "./stats";
import { mountJoystick } from "./touch";
import { drawPlate, type PlateKind } from "./plate";
import { mountChat } from "./chat";
import { mountParty, type PartyUi } from "./party";

import { loadAtlases, ActorView, type ActorAtlas, type ActionAnim, type AtlasSpec } from "./sprites";

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
/** Cores provisórias de cada tema de zona (sem arte externa): chão em losangos 64x32 gerados por código. */
const THEMES: Record<ZoneTheme, { bg: string; a: number; b: number; line: number; fleck: number; border: number; portal: number }> = {
  ash: { bg: "#0b0b10", a: 0x25242b, b: 0x2c2b33, line: 0x3a3945, fleck: 0x4a4852, border: 0x6b5a45, portal: 0xc9a86a },
  frost: { bg: "#08111a", a: 0x2b3e52, b: 0x334a60, line: 0x4a6a84, fleck: 0xe3f0fa, border: 0x8fc4e8, portal: 0x7fd0ff },
  crypt: { bg: "#07050b", a: 0x221b2c, b: 0x2a2236, line: 0x3a2f4a, fleck: 0x54446e, border: 0x6a4a9a, portal: 0xb07aff },
};
const tileHash = (x: number, y: number) => { const h = Math.sin(x * 127.1 + y * 311.7) * 43758.5453; return h - Math.floor(h); };
const menuOpen = () => !!document.querySelector(".gm-back.open");

/** qual animação do personagem corresponde a cada ação (as 3 habilidades usam a mesma, "skill") */
const animFor = (a: ActionId): ActionAnim => (a === "attack" ? "attack" : a === "dodge" ? "dodge" : "skill");

class WorldScene extends Phaser.Scene {
  private room!: Room;
  private hud!: Hud;
  private pvpTag = new Map<string, string>(); // última marca de PvP aplicada ao nome de cada jogador
  private inv!: InventoryUi;
  private party!: PartyUi;
  private sprites = new Map<string, ActorView>();
  private atlases = new Map<string, ActorAtlas>();
  private prevSt = new Map<string, string>();
  private shadows!: Phaser.GameObjects.Graphics;
  private labels = new Map<string, Phaser.GameObjects.Text>();
  private levelTags = new Map<string, Phaser.GameObjects.Text>();
  private bubbles = new Map<string, { t: Phaser.GameObjects.Text; until: number }>();
  private bars!: Phaser.GameObjects.Graphics;
  private emitters!: { orange: Phaser.GameObjects.Particles.ParticleEmitter; red: Phaser.GameObjects.Particles.ParticleEmitter; gold: Phaser.GameObjects.Particles.ParticleEmitter; green: Phaser.GameObjects.Particles.ParticleEmitter };
  private hitstopUntil = 0;
  private touchMode = typeof matchMedia === "function" && matchMedia("(pointer: coarse)").matches;
  private joy!: ReturnType<typeof mountJoystick>;
  private joyAt = 0;
  private joyMoving = false;
  private deadUntil = 0;
  private cls: CharClass = "warrior";
  private projs = new Map<string, { x: number; y: number; dx: number; dy: number; speed: number; left: number; obj: Phaser.GameObjects.Shape }>();
  private traps = new Map<string, Phaser.GameObjects.Shape[]>();
  private zoneId = 1;
  private portalG!: Phaser.GameObjects.Graphics;
  private portalDefs: { x: number; y: number; r: number; color: number }[] = [];

  private get state(): any { return this.room?.state; }
  private me(): any { return this.state?.players?.get(this.room.sessionId); }

  async create() {
    this.zoneId = (this.sys.settings.data as { zone?: number }).zone ?? 1;
    const zone = ZONES[this.zoneId] ?? ZONES[1];
    this.drawZoneMap(zone);

    await this.loadArt(); // atlas de sprites (se existirem); sem eles os personagens são círculos

    const token = (this.sys.settings.data as { token: string }).token;
    try {
      this.room = await new Client(wsUrl).joinOrCreate(zoneRoomName(zone.id), { token });
    } catch {
      logout(); // token inválido/recusado: volta ao login
      return;
    }
    // o primeiro estado chega logo depois do join: espera antes de ler as coleções
    if (!this.state?.players) await new Promise<void>((resolve) => this.room.onStateChange.once(() => resolve()));

    this.makeEffects();
    if (import.meta.env.DEV) (window as any).__frixep = { scene: this }; // gancho de depuração: só no desenvolvimento
    this.cls = ((this.me()?.cls as CharClass) ?? "warrior");

    // colyseus.js 0.16: callbacks de coleção passam por getStateCallbacks
    const $ = getStateCallbacks(this.room);
    const st = $(this.state);

    st.players.onAdd((p: any, id: string) => {
      const me = id === this.room.sessionId;
      const view = new ActorView(this, this.atlases.get(p.cls as string), { color: CLASS_DEFS[p.cls as CharClass]?.color ?? 0x6fa8dc, radius: 10, mine: me });
      const at = toScreen(p.x, p.y);
      view.obj.setPosition(at.sx, at.sy); // nasce na posição certa (sem deslizar desde a origem)
      this.sprites.set(`p:${id}`, view);
      this.levelTags.set(`p:${id}`, this.add.text(0, 0, String(Number(p.level) || 1), { fontFamily: "Cinzel, Georgia, serif", fontStyle: "bold", fontSize: "16px", color: "#fff6dc", stroke: "#000", strokeThickness: 3 }).setOrigin(0.5).setDepth(1e5 + 2));
      this.labels.set(`p:${id}`, this.add.text(0, 0, p.name, { fontSize: "11px", color: "#ddd", stroke: "#000", strokeThickness: 3 }).setOrigin(0.5, 1));
      if (me) this.cameras.main.startFollow(view.obj, true, 0.1, 0.1);
    });
    st.players.onRemove((_: any, id: string) => this.dropSprite(`p:${id}`));

    st.enemies.onAdd((e: any, id: string) => {
      const kd = enemyKind(String(e.kind));
      const view = new ActorView(this, this.atlases.get(String(e.kind)), { color: kd.color, radius: e.kind === "skeleton" ? 12 : 11 }); // só o Esqueleto tem arte; os outros são corpos provisórios
      const at = toScreen(e.x, e.y);
      view.obj.setPosition(at.sx, at.sy);
      this.sprites.set(`e:${id}`, view);
      const lv = Number(e.level) || 1;
      const mine = Number(this.me()?.level) || 1;
      // cor pela diferença para o seu nível: cinza = fácil, branco = igual, laranja = difícil, vermelho = perigoso
      const col = lv >= mine + 3 ? "#ff6a5a" : lv > mine ? "#ffb072" : lv < mine - 2 ? "#9aa3ad" : "#e8e2d0";
      this.labels.set(`e:${id}`, this.add.text(0, 0, kd.name, { fontSize: "11px", color: "#e8e2d0", stroke: "#000", strokeThickness: 3 }).setOrigin(0.5, 1));
      // nível: só o número, à direita da barra de vida, grande e com contorno grosso
      this.levelTags.set(`e:${id}`, this.add.text(0, 0, String(lv), { fontFamily: "Cinzel, Georgia, serif", fontStyle: "bold", fontSize: "16px", color: col, stroke: "#000", strokeThickness: 3 }).setOrigin(0.5).setDepth(1e5 + 2));
    });
    st.enemies.onRemove((_: any, id: string) => this.dropSprite(`e:${id}`));

    // HUD, menu e entrada
    this.hud = mountHud({ cls: this.cls, name: this.me()?.name, onAction: (a) => this.act(a), onPotion: () => this.drinkPotion(), onPvp: (on) => this.room.send(Msg.Pvp, { on }) });
    this.joy = mountJoystick();
    this.applyTouch();
    this.paintPortrait();
    mountGameMenu({
      playerName: this.me()?.name ?? "Portador",
      onLogout: async () => {
        leaving = true;
        try { await this.room.leave(true); } catch { /* já desconectado */ }
        logout();
      },
    });
    let leaving = false;
    // travessia aprovada pelo servidor: sai desta sala e recarrega entrando na sala da nova zona (mesmo token)
    this.room.onMessage(Evt.Travel, async (m: TravelEvent) => {
      if (leaving) return;
      leaving = true;
      this.showLoading(`Viajando para ${ZONES[m.zone]?.name ?? "outra zona"}…`);
      try { await this.room.leave(true); } catch { /* já desconectado */ }
      location.reload();
    });
    this.zoneBanner(zone.name);
    this.room.onLeave((code) => {
      if (leaving) return;
      if (code === 4001) logout(); // outra aba assumiu a conta: vai ao login sem disputar a sessão
      else location.reload(); // queda de rede ou servidor: recarrega mantendo o token
    });

    this.room.onMessage(Evt.Swing, (m: SwingEvent) => {
      const actor = this.sprites.get(`p:${m.id}`);
      if (actor) {
        actor.setFace(m.dir);
        if (m.id !== this.room.sessionId) actor.trigger(animFor(m.a), this.time.now); // a própria já tocou em act()
      }
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
    // XP do abate: mesmo estilo do número de dano, no lugar onde o inimigo caiu
    this.room.onMessage(Evt.Xp, (m: XpEvent) => this.floatText(m.x, m.y - 0.5, `+${m.amount} XP`, "#ffd45e", 20, true));
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
    this.room.onMessage(Evt.Pvp, (m: PvpEvent) => {
      const say: Record<string, [string, string]> = {
        cancel: ["Canalização interrompida", "#ffb3a6"], stop: ["Canalização cancelada", "#e6eef9"],
        on: ["Modo PvP ativado", "#ffb3a6"], off: ["Você saiu do modo PvP", "#9fe0a8"],
      };
      const t = say[m.s];
      if (!t) return;
      if (m.s === "cancel") this.hud.alert(t[0]);
      else this.inv.toast(t[0], t[1]);
    });
    this.room.onMessage(Evt.Notice, (m: NoticeEvent) => this.inv.toast(String(m.text), "#ffb3a6"));
    this.room.send(Msg.InvSync, {});

    // chat da zona (Enter abre/envia, Esc fecha; o servidor decide nome e texto)
    // comandos: /pt nome (convida para o grupo) e /g texto (chat do grupo); o resto vai à zona
    const chat = mountChat({
      send: (text) => {
        const cmd = /^\/(pt|g)(?:\s+([\s\S]*))?$/i.exec(text);
        if (!cmd) return this.room.send(Msg.Chat, { text });
        const arg = (cmd[2] ?? "").trim();
        if (cmd[1].toLowerCase() === "pt") {
          if (arg) this.room.send(Msg.PartyInvite, { name: arg });
          else chat.system("Use /pt nome_do_jogador para convidar para o grupo.");
        } else if (arg) this.room.send(Msg.PartyChat, { text: arg });
        else chat.system("Use /g mensagem para falar só com o grupo.");
      },
    });
    this.room.onMessage(Evt.Chat, (m: ChatEvent) => {
      chat.add(String(m.name), String(m.text), m.id === this.room.sessionId);
      this.say(String(m.id), String(m.text)); // balão sobre a cabeça de quem falou
    });

    // grupo: painel, convite e chat de grupo (os receptores ficam prontos ANTES de pedir o estado)
    this.party = mountParty({ send: (t, p) => this.room.send(t, p), zoneId: this.zoneId, myName: String(this.me()?.name ?? "") });
    this.party.setTouch(this.touchMode);
    this.room.onMessage(Evt.Party, (m: PartyEvent) => this.party.setParty(m));
    this.room.onMessage(Evt.PartyInvite, (m: PartyInviteEvent) => this.party.showInvite(m));
    this.room.onMessage(Evt.PartyInviteEnd, () => this.party.endInvite());
    this.room.onMessage(Evt.PartyChat, (m: PartyChatEvent) => chat.addGroup(String(m.name), String(m.text), String(m.name) === String(this.me()?.name)));
    this.room.send(Msg.PartySync, {});

    // painel de FPS e ping (canto superior direito; F3 liga/desliga)
    const stats = mountStats({ sendPing: (t) => this.room.send(Msg.Ping, { t }) });
    this.room.onMessage(Evt.Pong, (m: { t: number }) => stats.onPong(m.t));

    this.input.on("pointerdown", (ptr: Phaser.Input.Pointer) => {
      const other = this.playerAt(ptr.worldX, ptr.worldY); // clicar/tocar em outro jogador abre o menu dele em vez de andar
      if (other) {
        const r = this.game.canvas.getBoundingClientRect();
        this.party.openPlayerMenu({ name: String(other.name), level: Number(other.level) || 1, cls: String(other.cls), inParty: !!other.party }, r.left + ptr.x + 14, r.top + ptr.y - 10);
        return;
      }
      if (ptr.wasTouch || this.touchMode) return; // no celular quem anda é o joystick (tocar no campo de visão não move)
      const { x, y } = toGrid(ptr.worldX, ptr.worldY);
      this.room.send(Msg.MoveTo, { x, y });
    });
    // distingue toque de mouse (define como a mira é escolhida)
    const kind = (e: PointerEvent) => {
      const t = e.pointerType === "touch";
      if (t !== this.touchMode) { this.touchMode = t; this.applyTouch(); }
    };
    window.addEventListener("pointerdown", kind, true);
    window.addEventListener("pointermove", kind, true);

    // teclado: ESPAÇO ataque | Q W E skills | R ultimate | SHIFT esquiva | F poção
    const keys: Record<string, ActionId> = {
      Space: "attack", KeyQ: "skill1", KeyW: "skill2", KeyE: "skill3", KeyR: "ultimate",
      ShiftLeft: "dodge", ShiftRight: "dodge",
    };
    window.addEventListener("keydown", (e) => {
      if (isTypingTarget()) return; // digitando no chat
      if (e.code === "KeyF" && !e.repeat && !menuOpen()) { // F: bebe a primeira poção
        this.drinkPotion();
        return;
      }
      const a = keys[e.code];
      if (!a || e.repeat || menuOpen()) return;
      e.preventDefault();
      (document.activeElement as HTMLElement | null)?.blur?.(); // ESPAÇO não deve "clicar" no botão focado
      this.hud.trigger(a);
    });
  }

  /** chão da zona: losangos 64x32 em xadrez com variação por código, detalhes e borda do mapa */
  private drawZoneMap(zone: (typeof ZONES)[number]) {
    const th = THEMES[zone.theme];
    this.cameras.main.setBackgroundColor(th.bg);
    const g = this.add.graphics().setDepth(-10);
    const V = (x: number, y: number) => new Phaser.Math.Vector2(x, y);
    for (let x = 0; x < zone.w; x++) {
      for (let y = 0; y < zone.h; y++) {
        const { sx, sy } = toScreen(x, y);
        const h = tileHash(x, y);
        const base = (x + y) % 2 ? th.a : th.b;
        g.fillStyle(base, 1).fillPoints([V(sx, sy - TILE_H / 2), V(sx + TILE_W / 2, sy), V(sx, sy + TILE_H / 2), V(sx - TILE_W / 2, sy)], true);
        if (h < 0.12) g.fillStyle(th.fleck, zone.theme === "frost" ? 0.5 : 0.28).fillEllipse(sx + (h - 0.06) * 200, sy, 10 + h * 40, 4 + h * 14); // neve, cinza ou lajes soltas
        g.lineStyle(1, th.line, 0.45).strokePoints([V(sx, sy - TILE_H / 2), V(sx + TILE_W / 2, sy), V(sx, sy + TILE_H / 2), V(sx - TILE_W / 2, sy)], true);
      }
    }
    const c = (x: number, y: number) => { const p = toScreen(x, y); return V(p.sx, p.sy); };
    g.lineStyle(3, th.border, 0.9).strokePoints([c(-0.5, -0.5), c(zone.w - 0.5, -0.5), c(zone.w - 0.5, zone.h - 0.5), c(-0.5, zone.h - 0.5)], true);
    // portais: anel pulsante (desenhado a cada quadro) e nome do destino
    this.portalG = this.add.graphics().setDepth(0.5);
    this.portalDefs = zone.portals.map((p) => ({ x: p.x, y: p.y, r: p.r, color: THEMES[ZONES[p.to].theme].portal }));
    zone.portals.forEach((p) => {
      const at = toScreen(p.x, p.y);
      this.add.text(at.sx, at.sy - p.r * TILE_H - 18, `➜ ${ZONES[p.to].name}`, { fontFamily: "Cinzel, Georgia, serif", fontSize: "13px", color: "#f4ecd2", stroke: "#000", strokeThickness: 3 }).setOrigin(0.5).setDepth(1e5);
    });
  }

  private drawPortals(time: number) {
    this.portalG.clear();
    for (const p of this.portalDefs) {
      const { sx, sy } = toScreen(p.x, p.y);
      const pulse = 0.5 + 0.5 * Math.sin(time / 350);
      const w = ELL_W * p.r, h = ELL_H * p.r;
      this.portalG.fillStyle(p.color, 0.1 + 0.1 * pulse).fillEllipse(sx, sy, w, h);
      this.portalG.lineStyle(3, p.color, 0.6 + 0.4 * pulse).strokeEllipse(sx, sy, w, h);
      this.portalG.lineStyle(2, p.color, 0.5).strokeEllipse(sx, sy, w * (0.45 + 0.3 * pulse), h * (0.45 + 0.3 * pulse));
    }
  }

  /** tela escura curta durante a travessia */
  private showLoading(text: string) {
    const d = document.createElement("div");
    d.textContent = text;
    d.style.cssText = "position:fixed;inset:0;z-index:9999;display:flex;align-items:center;justify-content:center;background:#05060a;color:#e8dfc4;font:600 22px Cinzel,Georgia,serif;letter-spacing:.06em;opacity:0;transition:opacity .25s";
    document.body.appendChild(d);
    requestAnimationFrame(() => (d.style.opacity = "1"));
  }

  /** nome da zona ao entrar (some sozinho) */
  private zoneBanner(name: string) {
    const d = document.createElement("div");
    d.textContent = name;
    d.style.cssText = "position:fixed;top:18%;left:0;right:0;text-align:center;z-index:50;pointer-events:none;color:#f1e6c4;font:600 34px Cinzel,Georgia,serif;letter-spacing:.14em;text-shadow:0 2px 10px #000,0 0 24px #000";
    document.body.appendChild(d);
    d.animate([{ opacity: 0 }, { opacity: 1, offset: 0.15 }, { opacity: 1, offset: 0.75 }, { opacity: 0 }], { duration: 3200 }).finished.then(() => d.remove(), () => d.remove());
  }

  /** balão de fala sobre a cabeça (some em 6 s; uma fala nova troca a anterior) */
  private say(id: string, text: string) {
    this.bubbles.get(id)?.t.destroy();
    const short = text.length > 90 ? text.slice(0, 89) + "…" : text;
    const t = this.add
      .text(0, 0, short, { fontSize: "11px", color: "#f4f1e6", align: "center", backgroundColor: "rgba(10,16,26,0.82)", padding: { x: 6, y: 3 }, wordWrap: { width: 150 } })
      .setOrigin(0.5, 1)
      .setDepth(1e5 + 5);
    this.bubbles.set(id, { t, until: this.game.loop.time + 6000 }); // mesmo relógio do update(time)
  }

  private updateBubbles(time: number) {
    for (const [id, b] of this.bubbles) {
      const v = this.sprites.get(`p:${id}`);
      if (!v || time > b.until) { b.t.destroy(); this.bubbles.delete(id); continue; }
      b.t.setPosition(v.obj.x, v.obj.y - v.headY - 16).setVisible(v.obj.visible).setAlpha(Math.min(1, (b.until - time) / 600));
    }
  }

  private drinkPotion() {
    const slot = this.inv.firstPotionSlot();
    if (slot >= 0) this.room.send(Msg.InvUse, { slot });
    else this.inv.toast("Você não tem poções.", "#ffb3a6");
  }

  /** liga ou desliga o layout de toque (joystick à esquerda, botões em arco à direita) */
  private applyTouch() {
    this.hud?.setTouch(this.touchMode);
    this.joy?.setEnabled(this.touchMode);
    this.party?.setTouch(this.touchMode);
  }

  /** outro jogador sob o ponto (em pixels do mundo): o corpo e a placa de nome/vida acima da cabeça */
  private playerAt(wx: number, wy: number): any | null {
    let best: any = null, bd = Infinity;
    this.state?.players?.forEach((p: any, id: string) => {
      if (id === this.room.sessionId) return;
      const v = this.sprites.get(`p:${id}`);
      if (!v || !v.obj.visible) return;
      const s = v.obj;
      if (Math.abs(wx - s.x) > 28 || wy < s.y - v.headY - 36 || wy > s.y + 12) return;
      const d = Math.hypot(wx - s.x, wy - (s.y - v.headY / 2));
      if (d < bd) { bd = d; best = p; }
    });
    return best;
  }

  /** joystick: manda um destino 4 tiles à frente na direção do polegar (10 vezes por segundo) e para ao soltar */
  private driveJoystick(time: number) {
    const me = this.me();
    if (!me || !this.room) return;
    const v = this.joy?.vector();
    if (!v || me.dead) {
      if (this.joyMoving) { this.joyMoving = false; this.room.send(Msg.MoveTo, { x: me.x, y: me.y }); }
      return;
    }
    if (time - this.joyAt < 100) return;
    this.joyAt = time;
    this.joyMoving = true;
    const g = toGrid(v.x, v.y);
    const n = Math.hypot(g.x, g.y) || 1;
    this.room.send(Msg.MoveTo, { x: me.x + (g.x / n) * 4, y: me.y + (g.y / n) * 4 });
  }

  // ---------------------------------------------------------------- arte
  /** Retrato = cabeça do primeiro quadro do atlas da classe (corpo provisório ou arte final). Sem atlas: inicial do nome. */
  private paintPortrait() {
    const at = this.atlases.get(this.cls);
    if (!at) return;
    const fr = this.textures.getFrame(at.key, at.firstFrame);
    const img = fr?.source?.image as CanvasImageSource | undefined;
    if (!fr || !img) return;
    // a cabeça fica na metade de cima do quadro de 64 px, no meio
    this.hud.setPortrait(img, { x: fr.cutX + 17, y: fr.cutY + 5, w: 30, h: 30 });
  }

  /**
   * Procura os atlas em /assets (a pasta assets/ do repositório) ou, com ?atlas=debug, em /debug-atlas.
   * O que não existir fica como círculo; a arte pode chegar aos poucos.
   */
  private async loadArt() {
    const debug = new URLSearchParams(location.search).get("atlas") === "debug";
    // a lista de atlas existentes vem do servidor: assim não pedimos arquivos que ainda não existem (sem 404 no console)
    let known: Set<string> | null = null;
    if (!debug) {
      try {
        const res = await fetch("/assets/_manifest.json", { cache: "no-cache" });
        if ((res.headers.get("content-type") ?? "").includes("json")) known = new Set(await res.json());
      } catch { /* sem lista: sem arte */ }
      if (!known || known.size === 0) return; // nenhuma arte entregue ainda: círculos
    }
    const spec = (name: string, dir: string): AtlasSpec | null =>
      debug
        ? { name, png: `/debug-atlas/${name}.png`, json: `/debug-atlas/${name}.json` }
        : known!.has(`${dir}/${name}`) // arte final tem prioridade
          ? { name, png: `/assets/${dir}/${name}.png`, json: `/assets/${dir}/${name}.json` }
          : known!.has(`placeholder/${name}`) // senão, o corpo provisório (assets/placeholder)
            ? { name, png: `/assets/placeholder/${name}.png`, json: `/assets/placeholder/${name}.json` }
            : null;
    const specs = [spec("warrior", "characters"), spec("archer", "characters"), spec("cleric", "characters"), spec("skeleton", "monsters")].filter((s): s is AtlasSpec => !!s);
    this.atlases = await loadAtlases(this, specs);
  }

  // ---------------------------------------------------------------- efeitos
  private makeEffects() {
    this.bars = this.add.graphics().setDepth(1e5);
    this.shadows = this.add.graphics().setDepth(0.3); // sombra no chão dos sprites
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
    this.levelTags.get(key)?.destroy();
    this.levelTags.delete(key);
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
    this.sprites.get(m.k === "e" ? `e:${m.id}` : `p:${m.id}`)?.trigger("hit", this.time.now);
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
    const s = this.sprites.get(`p:${m.id}`)?.obj;
    if (!s) return;
    this.emitters.gold.explode(30, s.x, s.y - 8);
    const g = toGrid(s.x, s.y);
    this.floatText(g.x, g.y - 1.2, `NÍVEL ${m.level}!`, "#ffd45e", 26, true);
    if (m.id === this.room.sessionId) sfx.levelUp();
  }

  private onDied(m: DiedEvent) {
    if (m.k === "e") {
      const s = this.sprites.get(`e:${m.id}`)?.obj;
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
    const angle = Math.atan2(y - me.y, x - me.x);
    this.playSwing(this.cls, a, me.x, me.y, angle, true);
    const mine = this.sprites.get(`p:${this.room.sessionId}`);
    mine?.setFace(angle);
    mine?.trigger(animFor(a), this.time.now);
  }

  // ---------------------------------------------------------------- quadro
  update(time: number, delta: number) {
    const st = this.state;
    if (!st?.players || !st?.enemies) return;
    this.driveJoystick(time);
    if (this.portalG) this.drawPortals(time);
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

    this.shadows.clear();
    const place = (key: string, x: number, y: number, face: number, hp: number, maxHp: number, o: { dead: boolean; level: number; kind: PlateKind; hideWhenDead?: boolean; ember?: boolean; windup?: boolean }) => {
      const v = this.sprites.get(key);
      if (!v) return;
      const s = v.obj;
      v.setFace(face);
      v.update(time, { dead: o.dead, windup: o.windup });
      const hidden = !!o.hideWhenDead && o.dead && v.deathDone; // com sprite, a morte toca antes de sumir
      s.setVisible(!hidden);
      this.labels.get(key)?.setVisible(!hidden);
      this.levelTags.get(key)?.setVisible(!hidden);
      if (hidden) return;
      const { sx, sy } = toScreen(x, y);
      if (Math.hypot(sx - s.x, sy - s.y) > 1.5) v.markMoving(time); // ainda chegando na posição do servidor = andando
      if (!frozen) {
        s.x += (sx - s.x) * 0.35;
        s.y += (sy - s.y) * 0.35;
      }
      s.setDepth(s.y).setAlpha(o.dead && !o.hideWhenDead ? (v.isSprite ? 0.6 : 0.35) : 1);
      if (v.isSprite) this.shadows.fillStyle(0x000000, 0.32).fillEllipse(s.x, s.y, 28, 12);
      // placa: nome, barra de vida e selo de nível (as bordas do selo mudam a cada 10 níveis)
      const pg = drawPlate(this.bars, { x: s.x, y: s.y - v.headY - 2, hp, maxHp, level: o.level, kind: o.kind, time });
      this.labels.get(key)?.setPosition(pg.nameX, pg.nameY).setDepth(1e5 + 2);
      const nt = this.levelTags.get(key);
      if (nt) {
        if (nt.text !== String(o.level)) nt.setText(String(o.level));
        nt.setPosition(pg.numX, pg.numY);
      }
      // marca de direção só nos círculos, que não têm rosto
      if (!v.isSprite) {
        const d = dirScreen(face);
        this.bars.lineStyle(3, 0xffffff, 0.85).lineBetween(s.x, s.y, s.x + d.x * 16, s.y + d.y * 16);
      }
      if (o.ember) this.bars.lineStyle(2, 0xffc861, 0.9).strokeEllipse(s.x, s.y + (v.isSprite ? 0 : 8), 36, 18); // Brasa ativa
    };

    const myParty = String(this.me()?.party ?? "");
    const mateOf = (p: any, id: string) => !!myParty && id !== this.room.sessionId && p.party === myParty; // colega de grupo
    st.players.forEach((p: any, id: string) => { // nome vermelho com espadas = em PvP; azul = colega de grupo; "..." enquanto canaliza a entrada
      const mate = mateOf(p, id);
      const tag = (p.pvp ? "pvp" : p.pvpChan === 1 ? "chan" : "") + (mate ? "|mate" : "");
      if (this.pvpTag.get(id) !== tag) {
        this.pvpTag.set(id, tag);
        const base = p.pvp ? `⚔ ${p.name}` : p.pvpChan === 1 ? `${p.name} …` : p.name;
        this.labels.get(`p:${id}`)?.setText(base).setColor(mate ? "#8fd0ff" : p.pvp ? "#ff6a5a" : "#ccc");
      }
    });
    st.players.forEach((p: any, id: string) => {
      place(`p:${id}`, p.x, p.y, p.face, p.hp, p.maxHp, { dead: p.dead, ember: p.ember, level: Number(p.level) || 1, kind: id === this.room.sessionId ? (p.pvp ? "pvp" : "me") : mateOf(p, id) ? "party" : p.pvp ? "pvp" : "ally" });
    });
    st.enemies.forEach((e: any, id: string) => {
      const key = `e:${id}`;
      // o golpe cai quando o aviso (windup) termina: dispara a animação de ataque nessa virada
      if (this.prevSt.get(key) === "windup" && e.st === "recover") this.sprites.get(key)?.trigger("attack", time);
      this.prevSt.set(key, e.st);
      place(key, e.x, e.y, e.face, e.hp, e.maxHp, { dead: e.st === "dead", hideWhenDead: true, windup: e.st === "windup", level: Number(e.level) || 1, kind: "enemy" });
    });

    const me = this.me();
    if (me) {
      this.hud.setPvp(!!me.pvp, Number(me.pvpChan) || 0);
      this.hud.setHp(me.hp, me.maxHp);
      this.hud.setMana(me.mana, me.maxMana);
      this.hud.setBuff(!!me.buff || !!me.ember, me.buff ? "Grito ativo" : "Brasa ativa");
      this.hud.setProgress(me.level, me.xp, xpToNext(me.level));
      this.updateBubbles(time);
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
const character = await ensureCharacter(token); // sem personagem, mostra a criação antes de entrar no jogo
new Phaser.Game({
  type: Phaser.AUTO,
  parent: "game",
  backgroundColor: "#0b0b10",
  scale: { mode: Phaser.Scale.RESIZE, width: "100%", height: "100%" },
  scene: [],
  callbacks: {
    postBoot: (game) => {
      game.scene.add("world", WorldScene, true, { token, zone: character.zone ?? 1 });
    },
  },
});
