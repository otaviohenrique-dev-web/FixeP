import { mountWorldMap, type WorldMap } from "./worldmap";
import { viewSize } from "./viewport";
import { registerPwa } from "./pwa";
registerPwa();
import { isTypingTarget } from "./keys";
import Phaser from "phaser";
import { Client, Room, getStateCallbacks } from "colyseus.js";
import {
  Msg, Evt, CLASS_DEFS, classAction, RESPAWN_S, ZONES, START_ZONE, WORLD_GATE, zoneRoomName, enemyKind, xpToNext, ITEMS, RARITY_COLOR, RARITY_HEX, rarityIndex, zoneNpcs, NPC_REACH, COIN_OBOL,
  type CharClass, type SkillFx, type ChestEvent, type TravelEvent, type ZoneTheme, type HealEvent, type ProjEvent, type ProjEndEvent, type TrapEvent,
  type PartyEvent, type PartyInviteEvent, type PartyChatEvent, type InventorySnapshot, type ChatEvent, type PvpEvent, type LootEvent, type NoticeEvent, type CoinsEvent, type TradeEvent, type NpcDef, type MarketPage, type MarketPricesEvent, type MarketMineEvent, type MarketDoneEvent, type VaultSnapshot, type QuestEvent, type QuestDefsEvent,
  type ActionId, type ActPayload, type SwingEvent, type TelegraphEvent, type HitEvent, type DiedEvent, type LevelUpEvent, type XpEvent,
} from "@frixep/shared";
import { ensureLogin, logout, wsUrl } from "./auth";
import { ensureCharacter } from "./character";
import { mountGameMenu } from "./menu";
import { mountHudCamadas } from "./hudcamadas";
import { attachPerf, timed, count } from "./perf-probe";
import { mountBarraJogo, ICONES_JOGO, type AtalhoJogo } from "./barra-jogo";
import { mountConfiguracoes } from "./configuracoes";
import { aoMudarConfig, config, fatorEfeitos, iniciarConfig } from "./config";
import { modoQualidade } from "./quality";
import { mountHud, type Hud } from "./hud";
import { ehAdmin, gmVisivel, rotuloGm, indicadorGm } from "./gm/modo-deus";
import { mountInventory, type InventoryUi } from "./inventory";
import { sfx } from "./sfx";
import { mountStats } from "./stats";
import { mountJoystick } from "./touch";
import { setMobileUi } from "./mobile";
import { drawPlate, type PlateKind } from "./plate";
import { GateLayer, gateAxis } from "./gate";
import { drawShieldBubble } from "./shield";
import { mountLowHp, LOW_HP_RATIO, type LowHp } from "./lowhp";
import { mountChat, type ChatUi } from "./chat";
import { mountLoading, type LoadingScreen } from "./loading";
import { GroundLayer } from "./ground";
import { NpcLayer } from "./npcs";
import { mountEconomy, type EconomyUi } from "./economy";
import { mountDiario, type DiarioUi } from "./diario";
import { montarEntradaPainel } from "./painel/entrada";
import { mountVariacoes, type VariacoesUi } from "./variacoes";
import { mountTalentos, type TalentosUi } from "./talentos";
import { mountBuilds, type BuildsUi } from "./builds";
import { mountMedidor, type Medidor } from "./medidor";
import { modificadoresDaEscolha, limparEscolhas, type ActionModifier } from "@frixep/shared";
import { limparTalentos, pontosLivres, podeSubirTalento, talentosDaClasse, VARIACAO_SLOTS, VARIACAO_NIVEL } from "@frixep/shared";
import { mountTutorial, type TutorialUi } from "./tutorial";
import { mountRastreador, type RastreadorUi } from "./rastreador";
import { mountDicas, tutorialFaixaAberta, type Dicas } from "./dicas";
import type { DicasVistasEvent, ActiveBuff, QuestDef, QuestEstado } from "@frixep/shared";
import { mountVault, type VaultUi } from "./vault";
import { drawTown, type TownLayer } from "./town";
import { revealItem, showRarityReveal } from "./loot-fx";
import { showLevelUpBanner, levelUpGlow } from "./levelup-fx";
import { WeaponAuras } from "./weapon-aura";
import { mountParty, type PartyUi } from "./party";
import { checkGpu } from "./gpucheck";

import { loadAtlases, ActorView, type ActorAtlas, type ActionAnim, type AtlasSpec } from "./sprites";

const TILE_W = 64;
const AIM_DEAD_PX = 24; // arrasto menor que isso mantém a mira automática no alvo travado
const AIM_FULL_PX = 110; // arrasto que chega ao alcance máximo
const TILE_H = 32;
// projeção iso: grade (x,y) -> tela, e inversa
const toScreen = (x: number, y: number) => ({ sx: (x - y) * (TILE_W / 2), sy: (x + y) * (TILE_H / 2) });
const toGrid = (sx: number, sy: number) => ({
  x: (sx / (TILE_W / 2) + sy / (TILE_H / 2)) / 2,
  y: (sy / (TILE_H / 2) - sx / (TILE_W / 2)) / 2,
});
/** alcance máximo (tiles) para manter o foco e a seleção: mais longe que isso, o alvo se solta */
const TARGET_RANGE = 14;
/** prioridade do alvo sem foco: "low" = menos vida em % (padrão); "near" = mais próximo. Fica salva neste navegador */
const TMODE_KEY = "frixep.tmode";
function savedTargetMode(): "low" | "near" { try { return localStorage.getItem(TMODE_KEY) === "near" ? "near" : "low"; } catch { return "low"; } }
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
  town: { bg: "#1d1620", a: 0x8a7f6a, b: 0x93886f, line: 0x6f6453, fleck: 0xb4a98f, border: 0x8a6a45, portal: 0xffc873 },
};
const tileHash = (x: number, y: number) => { const h = Math.sin(x * 127.1 + y * 311.7) * 43758.5453; return h - Math.floor(h); };
/** densidade de pixels do canvas: nítido em telas retina, mas limitado (3) para não pesar em celular fraco */
const COARSE = typeof matchMedia === "function" && matchMedia("(pointer: coarse)").matches;
const MODO = modoQualidade(); // botão "Gráficos" do menu (teste A/B de FPS)
const SEM_DESENHOS = MODO === "sem-desenhos"; // Teste A
const SEM_SPRITES = MODO === "sem-sprites"; // Teste B
// alvo de desenho que aceita qualquer chamada e não faz nada (usado no Teste A)
const NO_DRAW: unknown = new Proxy({}, { get: () => () => NO_DRAW });
const DPR = Math.max(1, Math.min(COARSE ? 2 : 3, window.devicePixelRatio || 1)); // celular: no máximo 2x (menos pixels = mais FPS)
const rdpr = () => DPR * config().escalaRender; // resolução do canvas: DPR da tela × escala de renderização (Configurações > Gráficos)
const TOUCH_ZOOM = 0.7; // celular: câmera mais afastada (enxerga ~43% mais do mapa em cada direção)
const menuOpen = () => !!document.querySelector(".gm-back.open");

/** qual animação do personagem corresponde a cada ação (as 3 habilidades usam a mesma, "skill") */
const animFor = (a: ActionId): ActionAnim => (a === "attack" ? "attack" : a === "dodge" ? "dodge" : "skill");

/** cronômetro das etapas da entrada/travessia: no modo dev imprime o tempo de cada etapa no console */
function timeline(label: string) {
  const t = {
    t0: performance.now(), last: 0, steps: [] as [string, number][],
    mark(name: string) { const now = performance.now(); t.steps.push([name, Math.round(now - (t.last || t.t0))]); t.last = now; },
    log() {
      const total = Math.round(performance.now() - t.t0);
      (window as any).__frixepTravel = { label, total, steps: t.steps };
      if (import.meta.env.DEV) console.log(`[travessia] ${label}: ${total} ms`, Object.fromEntries(t.steps));
    },
  };
  return t;
}

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
  private weaponAuras?: WeaponAuras;
  private emitters!: Record<"orange" | "red" | "gold" | "green", { explode(n: number, x: number, y: number): void }>;
  private hitstopUntil = 0;
  private touchMode = typeof matchMedia === "function" && matchMedia("(pointer: coarse)").matches;
  private joy!: ReturnType<typeof mountJoystick>;
  private joyAt = 0;
  private joyMoving = false;
  private deadUntil = 0;
  private cls: CharClass = "warrior";
  private projs = new Map<string, { x: number; y: number; dx: number; dy: number; speed: number; left: number; blast?: number; obj: Phaser.GameObjects.Shape }>();
  private traps = new Map<string, Phaser.GameObjects.Shape[]>();
  private zoneId = 1;
  private tutorial!: TutorialUi; // bandeira do tutorial (C1.4)
  private rastreador!: RastreadorUi; // missões à esquerda: passo do tutorial e missões aceitas
  private dicas!: Dicas; // balão de dicas contextuais, uma vez por personagem (C1.6)
  private gates: GateLayer | null = null; // portões da zona (estruturas de pedra no lugar dos antigos anéis)
  private lowHp!: LowHp; // moldura vermelha de vida baixa
  private shieldEnd = 0; // fim da bolha de chegada (relógio do navegador); 0 = sem contagem (carregando ou sem bolha)
  private ground!: GroundLayer;
  private npcs!: NpcLayer;
  private town: TownLayer | null = null;
  private worldMap!: WorldMap;
  private vault!: VaultUi;
  private pendingVault = false; // clicou no baú longe: abre quando chegar perto
  private econ!: EconomyUi;
  private diario!: DiarioUi;
  private variacoes!: VariacoesUi;
  private talentos!: TalentosUi;
  private builds!: BuildsUi;
  private medidor?: Medidor; // medidor de dano e cura (tecla M / menu Jogo)
  private pendingNpc: NpcDef | null = null; // clicou num NPC longe: abre a conversa quando chegar perto
  private qDefs = new Map<string, QuestDef>(); // definições das missões (para o "?" dourado dos NPCs)
  private qEstados: QuestEstado[] = [];
  private nivelMarcas = 0; // nível usado na última conta das marcas (subir de nível pode liberar missões)
  private selGrupo = false; // a seleção veio da lista do grupo (não se desfaz pela distância)
  private selG!: Phaser.GameObjects.Graphics; // círculo de seleção (verde) e alvo travado (vermelho)
  private selId = ""; // jogador selecionado com o clique (só mostra o círculo e as opções ao lado do retrato)
  private lockKey = ""; // alvo travado ("e:id" ou "p:id"; toque ou clique): as ações mirram nele
  private aimG!: Phaser.GameObjects.Graphics; // prévia da área da habilidade de área (arrastada com o dedo)
  private aimA: ActionId | null = null; // habilidade de área sendo mirada (botão segurado)
  private aimScreen: { x: number; y: number } | null = null; // arrasto do dedo (px na tela, relativo ao toque inicial); null = mira automática no alvo
  private aimOrigin = { x: 0, y: 0 };
  private chase: { key: string } | null = null; // ataque básico: andando até o alvo travado que saiu do alcance
  private chaseMoveAt = 0; // próximo reenvio do destino enquanto anda atrás do alvo
  private nextBasicAt = 0; // quando o ataque básico volta a estar pronto (ms do navegador)
  private targetMode: "low" | "near" = savedTargetMode(); // prioridade sem foco (botões < e > do ataque básico)
  private uiScale = 1; // contra-escala dos textos quando a câmera se afasta (celular)

  private get state(): any { return this.room?.state; }
  private me(): any { return this.state?.players?.get(this.room.sessionId); }
  /** modificadores das variações escolhidas (C2.2): o cliente usa os mesmos da ação do servidor, para recarga e alcance na tela */
  private modsDe(me: any): ActionModifier[] { return me ? modificadoresDaEscolha(limparEscolhas(me.variacoes, this.cls, Number(me.level) || 1)) : []; }

  private artReady: Promise<void> | null = null;
  private uiMounted = false;
  private loader!: LoadingScreen;
  private busy = true; // entrada/travessia em curso: o jogador não age até a zona estar pronta
  private leaving = false; // saída voluntária (menu/sair): não tenta reconectar
  private stats!: ReturnType<typeof mountStats>;
  private chatUi!: ChatUi;
  private hudLast = { pvp: "", mana: "", prog: "", buff: "", q: -1, hp: "", ap: -1 as number, poder: -1 };
  private enterSeq = 0;
  private entering = false;
  private travelT0 = 0;
  private floatFree = new Map<string, Phaser.GameObjects.Text[]>(); // balões de dano/XP reaproveitados (criar Text a cada golpe é caro)
  private floatUsed = 0;

  /** tela de load: só depois que o servidor aprova a travessia (Evt.Travel); bloqueia novas entradas enquanto carrega */
  private beginTravel(zoneId: number, verb = "Viajando para") {
    if (this.busy && this.loader.visible) return;
    const z = ZONES[zoneId] ?? ZONES[START_ZONE];
    this.busy = true;
    this.travelT0 = performance.now();
    this.loader.progress(0.05);
    this.loader.show({ zone: z.name, theme: z.theme, verb });
  }

  /** travessia aprovada pelo servidor: sai da sala antiga e entra na da nova zona em paralelo ao fade (mesmo token, sem recarregar) */
  private travelTo(zoneId: number, from: Room) {
    if (this.leaving || from !== this.room || this.entering) return;
    this.beginTravel(zoneId);
    from.removeAllListeners();
    from.leave(true).catch(() => { /* já desconectado */ });
    void this.enterZone(zoneId, "travel");
  }

  private async enterZone(zoneId: number, why: "boot" | "travel" | "reconnect") {
    this.entering = true;
    // rede de segurança: se a entrada não terminar em 20 s (sala que não responde, estado que não chega), recarrega a página
    // mantendo o token; a zona já foi gravada, então o jogador volta ao jogo sozinho, sem precisar apertar F5
    const guard = window.setTimeout(() => { console.warn("[viagem] entrada travada; recarregando"); location.reload(); }, 20000);
    try { await this.enterZoneInner(zoneId, why); } finally { window.clearTimeout(guard); this.entering = false; }
  }

  async create() {
    // textos do Phaser são rasterizados na densidade da tela (senão ficam borrados em retina)
    this.sys.events.on("addedtoscene", (o: Phaser.GameObjects.GameObject) => {
      if (o instanceof Phaser.GameObjects.Text && DPR > 1) o.setResolution(rdpr());
    });
    this.loader = (this.sys.settings.data as { loader: LoadingScreen }).loader;
    attachPerf(this.game, () => ({ zone: ZONES[this.zoneId]?.name ?? "?", ents: this.sprites.size }));
    await this.enterZone((this.sys.settings.data as { zone?: number }).zone ?? START_ZONE, "boot");
  }

  /**
   * Entra numa zona SEM recarregar a página: descarta o mundo anterior, desenha o mapa, carrega a arte (uma vez só) e entra
   * na sala em paralelo, posiciona a câmera sobre o personagem e só então revela a tela. A interface (HUD, mochila, chat...)
   * é montada na primeira entrada e reaproveitada.
   */
  private async enterZoneInner(zoneId: number, why: "boot" | "travel" | "reconnect") {
    const seq = ++this.enterSeq;
    this.busy = true;
    const zone = ZONES[zoneId] ?? ZONES[START_ZONE];
    this.zoneId = zone.id;
    this.loader.show({ zone: zone.name, theme: zone.theme, verb: why === "boot" ? "Entrando em" : why === "reconnect" ? "Reconectando em" : "Viajando para" });
    const T = timeline(`${why} → ${zone.name}`);
    if (why === "travel" && this.travelT0) T.t0 = this.travelT0; // na viagem o cronômetro já começou no portal
    const token = (this.sys.settings.data as { token: string }).token;
    const charId = (this.sys.settings.data as { charId?: string }).charId; // personagem escolhido na seleção
    const gone = this.room; // sala anterior (já saindo)
    // 1) começa a entrar na sala JÁ: roda junto do desenho do mapa e da arte
    const joinP: Promise<Room | null> = (async () => { // a sala nova às vezes recusa de primeira (a sessão antiga ainda não soltou o personagem): tenta de novo
      for (let i = 0; i < 3; i++) {
        try { return await new Client(wsUrl).joinOrCreate(zoneRoomName(zone.id), { token, load: true, charId }); } catch { await new Promise((r) => setTimeout(r, 400 + i * 500)); }
      }
      return null;
    })();
    if (gone) this.room = undefined as unknown as Room; // as mensagens da sala antiga são ignoradas
    // 2) mundo anterior fora, mapa novo
    this.resetWorld();
    T.mark("limpeza");
    this.loader.progress(0.15);
    this.drawZoneMap(zone);
    T.mark("mapa");
    this.loader.progress(0.35);
    this.artReady ??= this.loadArt();
    await this.artReady; // atlas de sprites (uma vez por sessão); sem eles os personagens são círculos
    T.mark("arte");
    this.loader.progress(0.6);
    const room = await joinP;
    T.mark("sala");
    if (seq !== this.enterSeq) { void room?.leave(true); return; }
    if (!room) {
      if (why === "boot") { logout(); return; } // token inválido/recusado: volta ao login
      location.reload(); // não conseguiu reentrar (servidor caiu): recarrega mantendo o token
      return;
    }
    // o primeiro estado chega logo depois do join: espera antes de ler as coleções
    if (!room.state?.players) await new Promise<void>((resolve) => room.onStateChange.once(() => resolve()));
    T.mark("estado");
    this.room = room;
    this.loader.progress(0.8);
    this.makeEffects();
    this.ground = new GroundLayer(this, toScreen);
    this.npcs = new NpcLayer(this, toScreen, zoneNpcs(this.zoneId), this.atlases);
    this.marcarEntregas(); // a camada de NPCs é refeita a cada zona: reaplica as marcas
    this.tutorial = mountTutorial({ scene: this, toScreen, getZone: () => this.zoneId, getPlayer: () => { const m = this.me(); return m ? { x: Number(m.x), y: Number(m.y) } : null; } }); // bandeira e trilha no chão do tutorial (C1.4)
    this.rastreador = mountRastreador({ onAbrirDiario: () => this.diario.open() }); // rastreador de missões à esquerda (abre o diário ao clicar)
    this.dicas = mountDicas({ enviar: (id) => this.room?.send(Msg.DicaVista, { id }), tutorialAberto: tutorialFaixaAberta }); // dicas contextuais (C1.6)
    this.selG = this.add.graphics().setDepth(0.35);
    this.aimG = this.add.graphics().setDepth(0.36);
    if (import.meta.env.DEV) (window as any).__frixep = { scene: this }; // gancho de depuração: só no desenvolvimento
    this.cls = ((this.me()?.cls as CharClass) ?? "warrior");
    if (!this.uiMounted) { this.mountUi(); this.uiMounted = true; }
    else { this.econ.closeNpc(); this.vault.close(); this.econ.setTrade({ open: false }); this.party.clearTarget(); this.selId = ""; this.selGrupo = false; this.lockKey = ""; this.pendingNpc = null; this.pendingVault = false; }
    this.bindRoom(room, zone);
    T.mark("mundo");
    // 3) câmera exatamente sobre o personagem (sem deslizar), no zoom certo, antes de revelar
    this.centerCameraOnMe();
    this.hudLast = { pvp: "", mana: "", prog: "", buff: "", q: -1, hp: "", ap: -1, poder: -1 };
    await new Promise<void>((r) => { requestAnimationFrame(() => r()); setTimeout(r, 120); }); // 1 quadro já desenhado com a câmera no lugar (o timeout cobre aba em segundo plano)
    this.cameras.main.setLerp(0.1, 0.1); // a partir daqui o seguimento volta a ser suave
    this.zoneBanner(zone.name);
    this.busy = false;
    this.leaving = false;
    await this.loader.hide(why === "boot" ? 250 : 450);
    if (seq === this.enterSeq && this.room === room) room.send(Msg.Ready, {}); // a tela já sumiu e o jogador controla o personagem: começa a contar a bolha de chegada
    T.mark("pronto");
    T.log();
  }

  /** a câmera nasce centrada no personagem: scroll inicial, seguimento com lerp 1 no primeiro quadro, sem animação de deslize */
  private centerCameraOnMe() {
    const cam = this.cameras.main;
    const mine = this.sprites.get(`p:${this.room.sessionId}`);
    cam.stopFollow();
    this.applyTouch(); // zoom correto (e pixels arredondados) para esta câmera
    if (mine) {
      cam.startFollow(mine.obj, true, 1, 1);
      cam.centerOn(mine.obj.x, mine.obj.y);
    }
  }

  /** descarta tudo o que pertence à zona anterior (objetos, tweens, timers) mantendo texturas/atlas no cache do Phaser */
  private resetWorld() {
    this.tweens.killAll();
    this.time.removeAllEvents();
    for (const o of [...this.children.list]) o.destroy(); // destroy() de cada um (removeAll(true) deixa as texturas dos textos no cache)
    this.sprites.clear(); this.labels.clear(); this.levelTags.clear(); this.bubbles.clear(); this.prevSt.clear(); this.pvpTag.clear();
    this.projs.clear(); this.traps.clear(); this.floatFree.clear(); this.floatUsed = 0;
    this.town = null;
    this.gates = null;
    this.shieldEnd = 0;
    this.worldMap?.close();
    this.hitstopUntil = 0;
    this.deadUntil = 0;
    this.cameras.main.stopFollow();
    this.cameras.main.resetFX();
  }

  /** interface do DOM (HUD, mochila, loja, baú, chat, grupo, FPS) e entradas: montada UMA vez; as salas só trocam os receptores */
  private mountUi() {
    this.lowHp = mountLowHp();
    this.hud = mountHud({ cls: this.cls, name: this.me()?.name, onAction: (a) => this.act(a), aim: { start: (a, x, y) => this.aimStart(a, x, y), move: (x, y) => this.aimMove(x, y), end: () => this.aimEnd() }, onNextTarget: () => this.cycleTarget(), targetMode: this.targetMode, onTargetMode: (m) => this.setTargetMode(m), onPotion: () => this.drinkPotion(), onPvp: (on) => this.room.send(Msg.Pvp, { on }), onQMode: (m) => this.setQMode(m), onAutoPotion: (at) => this.setAutoPot(at) });
    this.joy = mountJoystick();
    this.applyTouch();
    this.paintPortrait();
    this.inv = mountInventory({ send: (t, p) => this.room?.send(t, p), getLevel: () => this.me()?.level ?? 1, getClass: () => this.cls, onBreak: (slot) => this.econ.confirmBreak(slot) });
    this.econ = mountEconomy({ send: (t, p) => this.room?.send(t, p), getClass: () => this.cls, getZone: () => this.zoneId, getLevel: () => this.me()?.level ?? 1, toast: (t, c) => this.inv.toast(t, c), onNpc: (n) => this.npcs.talk(n.id) });
    this.diario = mountDiario(); // rastreador e diário de quests (C1.3); depois do econ, que injeta o CSS de quests
    this.variacoes = mountVariacoes({ // variações de habilidade (C2.2): a escolha é do servidor; o painel só mostra e pede
      cls: this.cls,
      estado: () => { const me = this.me(); return me ? { variacoes: String(me.variacoes ?? "{}"), level: Number(me.level) || 1 } : null; },
      cidade: () => !!ZONES[this.zoneId]?.safe,
      escolher: (slot, id) => this.room?.send(Msg.Variacao, { slot, id }),
    });
    this.talentos = mountTalentos({ // talentos (C2.3): o servidor confere e grava; o painel só mostra e pede
      cls: this.cls,
      estado: () => { const me = this.me(); return me ? { talentos: String(me.talentos ?? "{}"), resets: Number(me.talentosResets) || 0, level: Number(me.level) || 1 } : null; },
      cidade: () => !!ZONES[this.zoneId]?.safe,
      subir: (id) => this.room?.send(Msg.Talento, { id }),
      resetar: () => this.room?.send(Msg.TalentoResetar, {}),
    });
    this.builds = mountBuilds({ // builds (C2.4): o servidor valida e grava; o painel só mostra e pede
      cls: this.cls,
      estado: () => { const me = this.me(); return me ? { loadouts: String(me.loadouts ?? "{}"), level: Number(me.level) || 1 } : null; },
      cidade: () => !!ZONES[this.zoneId]?.safe,
      salvar: (slot) => this.room?.send(Msg.LoadoutSalvar, { slot }),
      aplicar: (slot) => this.room?.send(Msg.LoadoutAplicar, { slot }),
      salvarEquip: (slot) => this.room?.send(Msg.LoadoutEquipSalvar, { slot }),
      aplicarEquip: (slot) => this.room?.send(Msg.LoadoutEquipAplicar, { slot }),
      renomear: (slot, nome) => this.room?.send(Msg.LoadoutNome, { slot, nome }),
    });
    this.montarJogo();
    this.worldMap = mountWorldMap((to) => { this.room.send(Msg.Travel, { to }); }); // o load só aparece quando o servidor aprova (Evt.Travel)
    this.vault = mountVault({ send: (t, p) => this.room?.send(t, p) });
    const chat = mountChat({
      send: (text) => {
        const cmd = /^\/(pt|g)(?:\s+([\s\S]*))?$/i.exec(text);
        if (!cmd) return this.room?.send(Msg.Chat, { text });
        const arg = (cmd[2] ?? "").trim();
        if (cmd[1].toLowerCase() === "pt") {
          if (arg) this.room?.send(Msg.PartyInvite, { name: arg });
          else chat.system("Use /pt nome_do_jogador para convidar para o grupo.");
        } else if (arg) this.room?.send(Msg.PartyChat, { text: arg });
        else chat.system("Use /g mensagem para falar só com o grupo.");
      },
    });
    this.chatUi = chat;
    this.party = mountParty({ send: (t, p) => this.room?.send(t, p), getZone: () => this.zoneId, myName: String(this.me()?.name ?? ""), onFocus: (nome) => this.focarMembro(nome) });
    this.party.setTouch(this.touchMode);
    // painel de FPS e ping (canto superior direito; F3 liga/desliga)
    this.stats = mountStats({ sendPing: (t) => this.room?.send(Msg.Ping, { t }), game: this.game });
    this.input.on("pointerdown", (ptr: Phaser.Input.Pointer) => {
      if (this.busy) return;
      const npc = this.npcs.hit(ptr.worldX, ptr.worldY); // clicar num NPC: conversa se estiver perto; senão, anda até ele
      if (npc) {
        const me = this.me();
        if (me && Math.hypot(me.x - npc.x, me.y - npc.y) <= NPC_REACH) this.econ.openNpc(npc);
        else if (me) { this.pendingNpc = npc; this.room.send(Msg.MoveTo, { x: npc.x, y: npc.y + 1.8 }); this.moveMarker(npc.x, npc.y + 1.8); }
        return;
      }
      if (this.town?.chestHit(ptr.worldX, ptr.worldY)) { // clicar no baú: abre se estiver perto; senão, anda até ele
        const me = this.me();
        if (me && this.town.nearChest(me.x, me.y)) this.vault.open();
        else if (me) { this.pendingVault = true; const v = this.town.chestPos; this.room.send(Msg.MoveTo, { x: v.x, y: v.y + 1.8 }); this.moveMarker(v.x, v.y + 1.8); }
        return;
      }
      this.pendingNpc = null;
      this.pendingVault = false;
      const other = this.playerAt(ptr.worldX, ptr.worldY); // clicar em outro jogador só o seleciona (círculo verde + opções ao lado do seu retrato)
      if (other) {
        const p = other.p;
        this.selId = other.id;
        this.selGrupo = !!p.party && String(p.party) === String(this.me()?.party ?? ""); // aliado do grupo: o foco não cai pela distância
        this.party.selectPlayer({ name: String(p.name), level: Number(p.level) || 1, cls: String(p.cls), inParty: !!p.party });
        if (ptr.wasTouch || this.touchMode) this.lockKey = `p:${other.id}`;
        return;
      }
      if (ptr.wasTouch || this.touchMode) { // no celular quem anda é o joystick; tocar num inimigo trava a mira nele, tocar no vazio solta
        this.lockKey = this.enemyAt(ptr.worldX, ptr.worldY) ?? "";
        this.chase = null;
        if (this.selId) this.deselect();
        return;
      }
      // no computador: clicar num inimigo trava o foco nele (sem andar até ele); clicar no chão mantém o foco (Esc solta)
      const foe = this.enemyAt(ptr.worldX, ptr.worldY);
      if (foe) { this.lockKey = foe; this.chase = null; return; } // travar um inimigo não tira o foco do aliado (o curador segue com ele)
      // clicar no chão só anda: o aliado selecionado continua em foco (Esc ou clicar em outro jogador troca)
      const { x, y } = toGrid(ptr.worldX, ptr.worldY);
      const near = this.ground.nearest(x, y, 0.9); // clicar num item no chão também pede para pegá-lo (se estiver ao alcance)
      const me = this.me();
      if (near && me) { const g = this.state.items.get(near); if (g && Math.hypot(g.x - me.x, g.y - me.y) <= 2.6) this.room.send(Msg.Pickup, { id: near }); }
      this.room.send(Msg.MoveTo, { x, y });
      this.moveMarker(x, y);
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
      if (isTypingTarget() || this.busy) return; // digitando no chat
      if (e.code === "Escape") {
        if (this.aimA) { e.preventDefault(); this.aimEnd(); return; } // ESC com a mira de uma skill aberta: cancela a skill (nada é gasto nem lançado)
        this.lockKey = ""; this.chase = null; if (this.selId) this.deselect();
      }
      if (e.code === "KeyS" && !e.repeat && !menuOpen()) { // S: para o personagem onde ele está (cancela o caminho em andamento)
        const me = this.me();
        if (me && this.room) {
          this.chase = null; this.pendingNpc = null; this.pendingVault = false;
          this.room.send(Msg.MoveTo, { x: me.x, y: me.y, stop: true });
        }
        return;
      }
      if (e.code === "KeyZ" && !e.repeat && !menuOpen() && this.cls === "cleric") { this.hud.toggleQ(); return; } // Z: alterna o Q do Clérigo
      if (e.code === "F10" && !e.repeat && ehAdmin() && !menuOpen()) { // F10 (admin): painel direto na aba Modo Deus
        e.preventDefault();
        const tk = (this.sys.settings.data as { token: string }).token;
        void import("./painel/abrir-painel").then((m) => m.abrirPainel(tk, "modo-deus")).catch(() => alert("Não foi possível abrir o painel agora. Tente de novo."));
        return;
      }
      if (e.code === "KeyF" && !e.repeat && !menuOpen()) { // F: bebe a primeira poção
        this.drinkPotion();
        return;
      }
      const a = keys[e.code];
      if (!a || e.repeat || menuOpen()) return;
      e.preventDefault();
      (document.activeElement as HTMLElement | null)?.blur?.(); // ESPAÇO não deve "clicar" no botão focado
      if (this.aimRange(a) > 0) { this.aimStart(a); return; } // com mira manual (área, Q, esquiva...): segurar a tecla mostra a prévia na direção do mouse; soltar lança. Sem mira (buffs, clérigo): lança na hora
      this.hud.trigger(a);
    });
    window.addEventListener("keyup", (e) => {
      const a = keys[e.code];
      if (a && this.aimA === a) { this.hud.trigger(a); this.aimEnd(); }
    });
    window.addEventListener("pointerdown", (e) => { if (e.button === 2 && this.aimA) this.aimEnd(); }); // botão direito com a mira aberta: cancela a skill
    // botão direito sobre o mundo não abre o menu do navegador (campos de texto e o resto da página continuam normais)
    window.addEventListener("contextmenu", (e) => { if (e.target instanceof HTMLCanvasElement) e.preventDefault(); });
    window.addEventListener("blur", () => this.aimEnd()); // perdeu o foco da janela com a tecla segurada: cancela a mira em vez de ficar presa
  }

  /** receptores da sala atual (cada zona é uma sala): estado, eventos de combate, mochila, grupo e chat */
  private bindRoom(room: Room, zone: (typeof ZONES)[number]) {
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
      this.labels.set(`p:${id}`, this.add.text(0, 0, rotuloGm(p.name, p), { fontSize: "11px", color: "#ddd", stroke: "#000", strokeThickness: 3 }).setOrigin(0.5, 1));
      if (me) this.cameras.main.startFollow(view.obj, true, 0.1, 0.1);
    });
    st.players.onRemove((_: any, id: string) => { this.dropSprite(`p:${id}`); if (id === this.room.sessionId) indicadorGm(false); });

    st.enemies.onAdd((e: any, id: string) => {
      const kd = enemyKind(String(e.kind));
      // os monstros têm kit de sprites; os chefes emprestam o corpo de um monstro, maior
      const view = new ActorView(this, this.atlases.get(String(e.kind)), { color: kd.color, radius: e.kind === "skeleton" ? 12 : kd.boss ? 18 : 11, scale: kd.scale });

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
    st.items.onAdd((g: any) => { const me = this.me(); if (me && Math.hypot(Number(g.x) - me.x, Number(g.y) - me.y) <= 8) this.dicas.gatilho("item_no_chao"); }); // dica de item no chão (C1.6)
    st.items.onAdd((g: any, id: string) => this.ground.add(id, { itemId: String(g.itemId), qty: Number(g.qty) || 1, x: g.x, y: g.y, owner: String(g.owner), party: String(g.party), lockS: Number(g.lockS) || 0 }));
    st.items.onRemove((_: any, id: string) => this.ground.remove(id));
    if (this.cls === "cleric" && this.savedQMode() === 1) room.send(Msg.QMode, { mode: 1 }); // lembra a escolha entre sessões
    // travessia aprovada pelo servidor: sai desta sala e entra na da nova zona, sem recarregar a página
    room.onMessage(Evt.WorldMap, () => { if (!this.busy && !this.entering) this.worldMap.open(); });
    room.onMessage(Evt.Travel, (m: TravelEvent) => this.travelTo(m.zone, room));
    room.onMessage(Evt.ActDenied, (m: { a: ActionId }) => this.hud.clearCd(m.a)); // o servidor não fez a ação: devolve a recarga do botão
    room.onMessage(Evt.TravelDenied, () => { // recusado (em combate): não houve load; só o aviso discreto do servidor
      if (this.entering) return;
      if (this.busy && this.loader.visible) { this.busy = false; void this.loader.hide(0); }
    });
    room.onMessage(Evt.Buffs, (m: { list: ActiveBuff[] }) => this.hud.setBuffs(Array.isArray(m?.list) ? m.list : [])); // buffs próprios: ícones com o tempo restante
    room.onMessage(Evt.Shield, (m: { ms: number }) => { this.shieldEnd = performance.now() + (Number(m?.ms) || 0); }); // a bolha começou a contar (a tela de load já acabou)
    room.onLeave((code) => {
      if (this.leaving || room !== this.room) return;
      if (code === 4001 || code === 4005) logout(); // 4001: outra aba assumiu a conta; 4005: expulso pelo painel. Vai ao login sem disputar a sessão
      else if (!this.entering) { this.beginTravel(this.zoneId, "Reconectando em"); void this.enterZone(this.zoneId, "reconnect"); } // queda de rede ou servidor: reentra mantendo o token
    });
    room.onMessage(Evt.Swing, (m: SwingEvent) => {
      const actor = this.sprites.get(`p:${m.id}`);
      if (actor) {
        actor.setFace(m.dir);
        if (m.id !== this.room.sessionId) actor.trigger(animFor(m.a), this.time.now); // a própria já tocou em act()
      }
      // a própria ação já foi mostrada na hora; as dos outros usam a classe de quem agiu
      if (m.id !== this.room.sessionId) this.playSwing((this.state.players.get(m.id)?.cls as CharClass) ?? "warrior", m.a, m.x, m.y, m.dir, false, Number(this.state.players.get(m.id)?.qMode) || 0);
    });
    room.onMessage(Evt.Proj, (m: ProjEvent) => this.onProj(m));
    room.onMessage(Evt.ProjEnd, (m: ProjEndEvent) => this.onProjEnd(m));
    room.onMessage(Evt.Trap, (m: TrapEvent) => this.onTrap(m));
    room.onMessage(Evt.Heal, (m: HealEvent) => this.onHeal(m));
    room.onMessage(Evt.Telegraph, (m: TelegraphEvent) => this.onTelegraph(m));
    room.onMessage(Evt.Hit, (m: HitEvent) => this.onHit(m));
    room.onMessage(Evt.Died, (m: DiedEvent) => this.onDied(m));
    // XP do abate: mesmo estilo do número de dano, no lugar onde o inimigo caiu
    room.onMessage(Evt.Xp, (m: XpEvent) => this.floatText(m.x, m.y - 0.5, `+${m.amount} XP`, "#ffd45e", 20, true));
    room.onMessage(Evt.LevelUp, (m: LevelUpEvent) => this.onLevelUp(m));

    room.onMessage(Evt.Coins, (m: CoinsEvent) => {
      if (m.iron) this.floatText(m.x, m.y - 0.9, `+${m.iron} Tostões`, "#cfd4dc", 16, false);
      if (m.obols) { this.floatText(m.x, m.y - 1.3, `+${m.obols} Óbolo${m.obols > 1 ? "s" : ""} de Sangue`, COIN_OBOL.color, 18, true); this.inv.toast(`+ ${m.obols} Óbolo${m.obols > 1 ? "s" : ""} de Sangue`, COIN_OBOL.color); }
      sfx.pickup();
    });
    room.onMessage(Evt.Vault, (m: VaultSnapshot) => this.vault.setVault(m));
    room.onMessage(Evt.Trade, (m: TradeEvent) => this.econ.setTrade(m));
    room.onMessage(Evt.TradeChat, (m: { name: string; text: string }) => this.econ.tradeChat(String(m.name), String(m.text)));
    room.onMessage(Evt.MarketPage, (m: MarketPage) => this.econ.setMarketPage(m));
    room.onMessage(Evt.MarketPrices, (m: MarketPricesEvent) => this.econ.setMarketPrices(m));
    room.onMessage(Evt.MarketMine, (m: MarketMineEvent) => this.econ.setMarketMine(m));
    room.onMessage(Evt.MarketDone, (m: MarketDoneEvent) => this.econ.setMarketDone(m));
    room.onMessage(Evt.TradeInvite, (m: { from: string }) => this.econ.showTradeInvite(String(m.from)));
    room.onMessage(Evt.TradeInviteEnd, () => this.econ.endTradeInvite());
    room.onMessage(Evt.Inv, (s: InventorySnapshot) => {
      this.inv.setSnapshot(s);
      this.econ.setSnapshot(s);
      this.vault.setInventory(s);
      let n = 0;
      for (const st of s.inv) if (st && ITEMS[st.id]?.kind === "potion") n += st.qty;
      this.hud.setPotion(n); // slot da poção na HUD: estoque e recarga
    });
    room.onMessage(Evt.Loot, (m: LootEvent) => {
      const d = ITEMS[m.id];
      if (!d) return;
      this.inv.toast(`+ ${d.name}${m.qty > 1 ? ` x${m.qty}` : ""}`, RARITY_COLOR[d.rarity]);
      sfx.pickup();
      if (rarityIndex(d.rarity) >= 2) revealItem(d); // raro ou melhor: animação no centro da tela, proporcional à raridade
    });
    room.onMessage(Evt.Chest, (m: ChestEvent) => this.onChest(m));
    room.onMessage(Evt.Pvp, (m: PvpEvent) => {
      const say: Record<string, [string, string]> = {
        cancel: ["Canalização interrompida", "#ffb3a6"], stop: ["Canalização cancelada", "#e6eef9"],
        on: ["Modo PvP ativado", "#ffb3a6"], off: ["Você saiu do modo PvP", "#9fe0a8"],
      };
      const t = say[m.s];
      if (!t) return;
      if (m.s === "cancel") this.hud.alert({ move: "Canalização cancelada: você se moveu", act: "Canalização cancelada: você agiu", damage: "Canalização interrompida: dano recebido" }[m.why ?? "damage"] ?? t[0]);
      else this.inv.toast(t[0], t[1]);
    });
    room.onMessage(Evt.Notice, (m: NoticeEvent) => { this.inv.toast(String(m.text), m.ok ? "#9fe0a8" : "#ffb3a6"); this.econ.questNotice(String(m.text), !!m.ok); if (!m.ok) this.dicaDoAviso(String(m.text)); });
    room.onMessage(Evt.Quests, (m: QuestEvent) => { this.qEstados = m?.quests ?? []; this.marcarEntregas(); this.econ.setQuests(m); this.diario.setQuests(m); this.tutorial.setQuests(m); this.rastreador.setQuests(m); });
    room.onMessage(Evt.QuestDefs, (m: QuestDefsEvent) => { this.qDefs = new Map((m?.defs ?? []).map((d) => [d.id, d])); this.marcarEntregas(); this.econ.setQuestDefs(m); this.diario.setDefs(m); this.tutorial.setDefs(m); this.rastreador.setDefs(m); });
    room.onMessage(Evt.DicasVistas, (m: DicasVistasEvent) => this.dicas.carregar(m)); // dicas já vistas por este personagem (C1.6)
    this.room.send(Msg.InvSync, {});
    this.room.send(Msg.QuestSync, {}); // pede o estado e as definições das quests (depois de registrar os receptores)
    this.room.send(Msg.DicasSync, {}); // pede as dicas já vistas (C1.6)
    room.onMessage(Evt.Chat, (m: ChatEvent) => {
      this.chatUi.add(String(m.name), String(m.text), m.id === this.room.sessionId);
      this.say(String(m.id), String(m.text)); // balão sobre a cabeça de quem falou
    });
    room.onMessage(Evt.Party, (m: PartyEvent) => this.party.setParty(m));
    room.onMessage(Evt.PartyInvite, (m: PartyInviteEvent) => this.party.showInvite(m));
    room.onMessage(Evt.PartyInviteEnd, () => this.party.endInvite());
    room.onMessage(Evt.PartyChat, (m: PartyChatEvent) => this.chatUi.addGroup(String(m.name), String(m.text), String(m.name) === String(this.me()?.name)));
    room.send(Msg.PartySync, {});
    room.onMessage(Evt.Pong, (m: { t: number; online?: number }) => this.stats.onPong(m.t, m.online));
  }


  /** chão da zona: losangos 64x32 em xadrez com variação por código, detalhes e borda do mapa */
  private drawZoneMap(zone: (typeof ZONES)[number]) {
    const th = THEMES[zone.theme];
    this.cameras.main.setBackgroundColor(th.bg);
    if (zone.theme === "town") this.town = drawTown(this, zone, toScreen, TILE_W, TILE_H); // a cidade tem arte própria (praça, casas, luzes)
    else this.drawGround(zone, th);
    this.gates = null;
    if (zone.theme === "town") return; // o portão da cidade é cenário próprio (town.ts) e abre o mapa-mundo
    // um portão de pedra em cada saída: pedra e tochas no tema desta zona; véu e runas na cor do destino
    this.gates = new GateLayer(this, toScreen, zone.portals.map((p) => ({ x: p.x, y: p.y, r: p.r, label: ZONES[p.to].name, axis: gateAxis(zone, p), stone: zone.theme, glow: THEMES[ZONES[p.to].theme].portal })));
  }

  /** o chão tem milhares de polígonos: é desenhado UMA vez numa textura (em cache por zona) e vira uma única imagem */
  private drawGround(zone: (typeof ZONES)[number], th: (typeof THEMES)[ZoneTheme]) {
    const key = `ground_${zone.id}`;
    const ox = zone.h * (TILE_W / 2) + 8, oy = TILE_H / 2 + 8; // deslocamento para que tudo caiba em coordenadas positivas
    const tw = Math.ceil((zone.w + zone.h) * (TILE_W / 2) + 16), tH = Math.ceil((zone.w + zone.h) * (TILE_H / 2) + 16);
    if (!this.textures.exists(key)) {
      const g = this.make.graphics({ x: 0, y: 0 }, false);
      const V = (x: number, y: number) => new Phaser.Math.Vector2(x + ox, y + oy);
      for (let x = 0; x < zone.w; x++) {
        for (let y = 0; y < zone.h; y++) {
          const { sx, sy } = toScreen(x, y);
          const h = tileHash(x, y);
          const base = (x + y) % 2 ? th.a : th.b;
          const pts = [V(sx, sy - TILE_H / 2), V(sx + TILE_W / 2, sy), V(sx, sy + TILE_H / 2), V(sx - TILE_W / 2, sy)];
          g.fillStyle(base, 1).fillPoints(pts, true);
          if (h < 0.12) g.fillStyle(th.fleck, zone.theme === "frost" ? 0.5 : 0.28).fillEllipse(sx + (h - 0.06) * 200 + ox, sy + oy, 10 + h * 40, 4 + h * 14);
          g.lineStyle(1, th.line, 0.45).strokePoints(pts, true);
        }
      }
      const c = (x: number, y: number) => { const p = toScreen(x, y); return V(p.sx, p.sy); };
      g.lineStyle(3, th.border, 0.9).strokePoints([c(-0.5, -0.5), c(zone.w - 0.5, -0.5), c(zone.w - 0.5, zone.h - 0.5), c(-0.5, zone.h - 0.5)], true);
      g.generateTexture(key, tw, tH);
      g.destroy();
    }
    this.add.image(-ox, -oy, key).setOrigin(0, 0).setDepth(-10);
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
      b.t.setScale(this.uiScale).setPosition(v.obj.x, v.obj.y - v.headY - 34 * this.uiScale).setVisible(v.obj.visible).setAlpha(Math.min(1, (b.until - time) / 600));
    }
  }

  /** define o limiar da auto-poção (0 = desligada): o servidor limita, grava e bebe; o cliente só pede e mostra o valor que vier do servidor */
  private setAutoPot(at: number) {
    if (!this.room) return;
    this.room.send(Msg.AutoPot, { at });
    this.inv.toast(at > 0 ? `Auto-poção: abaixo de ${at}% de vida` : "Auto-poção desligada", at > 0 ? "#7dff9a" : "#9fb3c8");
  }

  /** Avisos recusados do servidor que viram dica (C1.6): mochila cheia e falta de recurso (Fúria, Foco, Mana). */
  private dicaDoAviso(text: string) {
    if (/^Mochila cheia/.test(text)) this.dicas.gatilho("mochila_cheia");
    else if (/insuficiente.$/.test(text)) this.dicas.gatilho("recurso_insuficiente");
  }

  private drinkPotion() {
    if (this.busy) return;
    if (!this.hud.potionReady()) return; // em recarga: o slot da HUD já mostra a contagem
    const slot = this.inv.firstPotionSlot();
    if (slot >= 0) { this.room.send(Msg.InvUse, { slot }); this.dicas.gatilho("primeira_pocao"); }
    else this.inv.toast("Você não tem poções.", "#ffb3a6");
  }

  /** liga ou desliga o layout de toque (joystick à esquerda, botões em arco à direita) */
  private applyTouch() {
    this.hud?.setTouch(this.touchMode);
    this.joy?.setEnabled(this.touchMode);
    this.party?.setTouch(this.touchMode);
    // celular: câmera mais afastada para enxergar mais ao redor (os textos ganham contra-escala para continuarem legíveis)
    const zoom = this.touchMode ? TOUCH_ZOOM : 1;
    // zoom em múltiplos de 0,5 pixel de tela por pixel de arte (em DPR 3 o celular cai em 2,0 exato): sem escala fracionária que borre
    this.cameras.main.setZoom(Math.max(0.5, Math.round(zoom * rdpr() * 2) / 2));
    this.cameras.main.roundPixels = true;
    this.uiScale = Math.min(1.25, 1 / zoom);
    setMobileUi(this.touchMode);
    if (!this.touchMode) this.lockKey = "";
  }

  /** marcas nos NPCs: "!" dourado = missão pronta para entregar; "?" = missão que já dá para aceitar (requisitos e nível) */
  private marcarEntregas() {
    const est = new Map(this.qEstados.map((q) => [q.id, q.estado]));
    const nivel = Number(this.me()?.level) || 1;
    this.nivelMarcas = nivel;
    const entregar: string[] = [], aceitar: string[] = [];
    for (const d of this.qDefs.values()) {
      if (!d.npc) continue;
      const e = est.get(d.id);
      if (e === "pronta") entregar.push(d.npc);
      else if (!e && nivel >= d.nivelMin && d.preRequisitos.every((p) => est.get(p) === "entregue")) aceitar.push(d.npc);
    }
    this.npcs?.setMarcas(entregar, aceitar);
  }

  /** clicar no nome de um membro do grupo: seleciona ele (círculo verde, linha até ele e cartão do alvo); serve à Cura Focada */
  private focarMembro(nome: string) {
    let achou = "";
    this.state?.players?.forEach((p: any, id: string) => { if (!achou && String(p.name) === nome) achou = id; });
    if (!achou) { this.inv.toast(`${nome} não está nesta zona.`, "#ffb3a6"); return; }
    const p = this.state.players.get(achou);
    this.selId = achou;
    this.selGrupo = true;
    this.party.selectPlayer({ name: String(p.name), level: Number(p.level) || 1, cls: String(p.cls), inParty: !!p.party });
  }

  private deselect() {
    this.selId = "";
    this.selGrupo = false;
    this.party.clearTarget();
  }

  /** marcador de destino do clique (estilo RTS): anel que fecha sobre o ponto e some */
  private moveMarker(gx: number, gy: number) {
    const { sx, sy } = toScreen(gx, gy);
    const ring = this.add.ellipse(sx, sy, 46, 23, 0x000000, 0).setStrokeStyle(2, 0xbff5c8, 0.9).setDepth(0.6).setScale(1.5);
    const dot = this.add.ellipse(sx, sy, 8, 4, 0xbff5c8, 0.9).setDepth(0.6);
    this.tweens.add({ targets: ring, scale: 0.55, alpha: 0, duration: 520, ease: "Cubic.easeOut", onComplete: () => ring.destroy() });
    this.tweens.add({ targets: dot, alpha: 0, duration: 520, ease: "Quad.easeIn", onComplete: () => dot.destroy() });
  }

  /** inimigo vivo sob o ponto (pixels do mundo), como chave "e:id" */
  private enemyAt(wx: number, wy: number): string | null {
    let best: string | null = null, bd = Infinity;
    this.state?.enemies?.forEach((e: any, id: string) => {
      if (e.st === "dead") return;
      const v = this.sprites.get(`e:${id}`);
      if (!v || !v.obj.visible) return;
      const s = v.obj;
      if (Math.abs(wx - s.x) > 30 || wy < s.y - v.headY - 30 || wy > s.y + 14) return;
      const d = Math.hypot(wx - s.x, wy - (s.y - v.headY / 2));
      if (d < bd) { bd = d; best = `e:${id}`; }
    });
    return best;
  }

  /** outro jogador sob o ponto (em pixels do mundo): o corpo e a placa de nome/vida acima da cabeça */
  private playerAt(wx: number, wy: number): { id: string; p: any } | null {
    let best: { id: string; p: any } | null = null, bd = Infinity;
    this.state?.players?.forEach((p: any, id: string) => {
      if (id === this.room.sessionId) return;
      const v = this.sprites.get(`p:${id}`);
      if (!v || !v.obj.visible) return;
      const s = v.obj;
      if (Math.abs(wx - s.x) > 28 || wy < s.y - v.headY - 36 || wy > s.y + 12) return;
      const d = Math.hypot(wx - s.x, wy - (s.y - v.headY / 2));
      if (d < bd) { bd = d; best = { id, p }; }
    });
    return best;
  }

  /** joystick: manda um destino 4 tiles à frente na direção do polegar (10 vezes por segundo) e para ao soltar */
  private driveJoystick(time: number) {
    const me = this.me();
    if (!me || !this.room) return;
    const v = this.joy?.vector();
    if (!v || me.dead) {
      if (this.joyMoving) { this.joyMoving = false; this.room.send(Msg.MoveTo, { x: me.x, y: me.y, stop: true }); }
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
    const specs = [spec("warrior", "characters"), spec("archer", "characters"), spec("cleric", "characters"), spec("mage", "characters"), spec("skeleton", "monsters"), spec("wolf", "monsters"), spec("wraith", "monsters"), spec("bone_king", "monsters"), spec("frost_alpha", "monsters"), spec("crypt_lord", "monsters"), spec("npc_smith", "npcs"), spec("npc_merchant", "npcs"), spec("npc_auctioneer", "npcs")].filter((s): s is AtlasSpec => !!s);
    this.atlases = await loadAtlases(this, specs);
  }

  // ---------------------------------------------------------------- efeitos
  private makeEffects() {
    if (SEM_DESENHOS) { // Teste A: nenhum desenho de Graphics (placas, barras, sombras, efeitos)
      this.bars = this.shadows = NO_DRAW as Phaser.GameObjects.Graphics;
    } else {
      this.bars = this.add.graphics().setDepth(1e5);
      this.weaponAuras = new WeaponAuras(this); // brilho público da arma equipada
      this.shadows = this.add.graphics().setDepth(0.3); // sombra no chão dos sprites
    }
    if (!this.textures.exists("spark")) {
      const tex = this.make.graphics({ x: 0, y: 0 }, false);
      tex.fillStyle(0xffffff, 1);
      tex.fillCircle(3, 3, 3);
      tex.generateTexture("spark", 6, 6);
      tex.destroy();
    }
    // explode() respeita "Partículas e efeitos" (Configurações > Gráficos): nenhum = não emite; reduzido = metade das partículas
    const mk = (tint: number) => {
      const em = this.add
        .particles(0, 0, "spark", {
          lifespan: { min: 220, max: 480 }, speed: { min: 60, max: 210 }, scale: { start: 1.2, end: 0 },
          alpha: { start: 1, end: 0 }, tint, blendMode: "ADD", emitting: false,
        })
        .setDepth(1e6);
      return {
        explode: (n: number, x: number, y: number) => {
          const k = fatorEfeitos();
          if (k > 0) em.explode(Math.max(1, Math.round(n * k)), x, y);
        },
      };
    };
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
  private playSwing(cls: CharClass, a: ActionId, gx: number, gy: number, dir: number, mine: boolean, qMode = 0) {
    const def = classAction(cls, a, qMode);
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
        if (def.stunS) this.shockwave(gx + dx * (def.dash ?? 0), gy + dy * (def.dash ?? 0), (def.radius ?? 1) * 2.4, 0xffe9b0, 0.012);
        if (mine) sfx.dash();
        break;
      case "reflectBuff": { // cúpula de escudo: anel de provocação + brilho azul-aço
        this.ring(gx, gy, def.tauntRadius ?? 5, 0x8fd0ff, 650, 0.2, false);
        this.ring(gx, gy, 1.5, 0xcfeaff, 450, 0.3);
        this.shockwave(gx, gy, 2.6, 0x8fd0ff, 0.004);
        if (mine) sfx.shout();
        break;
      }
      case "healFocus": // o raio até o alvo vem no Evt.Heal
        this.ring(gx, gy, 1.2, 0xc8ffd4, 360, 0.4);
        if (mine) sfx.heal();
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
      case "pull": { // o servidor manda a área (Evt.Telegraph); aqui só o som e o brilho no conjurador
        this.ring(gx, gy, 1.2, 0xbfe4ff, 300, 0.4);
        if (mine) sfx.whirl();
        break;
      }
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

  /** onda de choque: três anéis que crescem rápido e somem, com um leve tremor */
  private shockwave(gx: number, gy: number, r: number, color: number, shake = 0.008) {
    for (let i = 0; i < 3; i++) {
      this.time.delayedCall(i * 90, () => {
        const { sx, sy } = toScreen(gx, gy);
        const e = this.add.ellipse(sx, sy, r * ELL_W * 0.5, r * ELL_H * 0.5, color, 0).setStrokeStyle(4 - i, color, 0.9 - i * 0.2).setDepth(0.7);
        this.tweens.add({ targets: e, scale: 2.4, alpha: 0, duration: 520, ease: "Cubic.easeOut", onComplete: () => e.destroy() });
      });
    }
    if (shake > 0) this.cameras.main.shake(180, shake);
  }

  /** raio entre dois pontos da grade (cura focada, reflexão): linha que brilha e some */
  private beam(ax: number, ay: number, bx: number, by: number, color: number, ms = 260) {
    const a = toScreen(ax, ay), b = toScreen(bx, by);
    const g = this.add.graphics().setDepth(1e6).setBlendMode(Phaser.BlendModes.ADD);
    g.lineStyle(7, color, 0.35).lineBetween(a.sx, a.sy - 22, b.sx, b.sy - 22);
    g.lineStyle(3, 0xffffff, 0.95).lineBetween(a.sx, a.sy - 22, b.sx, b.sy - 22);
    this.tweens.add({ targets: g, alpha: 0, duration: ms, onComplete: () => g.destroy() });
  }

  // ---------------------------------------------------------------- projéteis, armadilhas e cura
  private onProj(m: ProjEvent) {
    const color = m.look === "pierce" ? 0x9fe39f : m.look === "bolt" ? 0xfff2a8 : m.look === "fire" ? 0xff7a2a : m.look === "arcane" ? 0xb58cff : 0xe8d9a0;
    const obj: Phaser.GameObjects.Shape =
      m.look === "bolt" || m.look === "arcane" || m.look === "fire"
        ? this.add.circle(0, 0, m.look === "fire" ? 10 : 6, color).setBlendMode(Phaser.BlendModes.ADD)
        : this.add.ellipse(0, 0, m.look === "pierce" ? 26 : 18, m.look === "pierce" ? 6 : 4, color);
    const d = dirScreen(m.dir);
    obj.setRotation(Math.atan2(d.y, d.x)).setDepth(1e5);
    this.projs.set(m.id, { x: m.x, y: m.y, dx: Math.cos(m.dir), dy: Math.sin(m.dir), speed: m.speed, left: m.range, blast: m.blast, obj });
  }

  private onProjEnd(m: ProjEndEvent) {
    const pr = this.projs.get(m.id);
    if (!pr) return;
    pr.obj.destroy();
    this.projs.delete(m.id);
    if (pr.blast) { // projétil explosivo: a explosão acontece onde o servidor mandou
      const { sx, sy } = toScreen(m.x, m.y);
      this.ring(m.x, m.y, pr.blast, 0xff8a3a, 420, 0.2);
      this.ring(m.x, m.y, pr.blast * 0.55, 0xffe0a0, 300, 0.3);
      this.emitters.orange.explode(34, sx, sy - 8);
      this.emitters.gold.explode(14, sx, sy - 8);
      this.cameras.main.shake(140, 0.005);
      sfx.boom();
    }
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
    if (m.amount > 0) this.medidor?.cura(m.by ?? m.from ?? m.id, m.amount); // quem curou: a área manda `by`; a focada manda `from`; senão a própria vítima
    const { sx, sy } = toScreen(m.x, m.y);
    if (m.from) { // cura focada: raio do curandeiro até o alvo
      const caster = this.state.players.get(m.from);
      if (caster && m.from !== m.id) this.beam(caster.x, caster.y, m.x, m.y, 0x7dff9a);
      else if (caster) this.ring(m.x, m.y, 1.1, 0x7dff9a, 420, 0.3);
    }
    this.emitters.green.explode(m.revive ? 28 : 12, sx, sy - 10);
    if (m.revive) {
      this.emitters.gold.explode(20, sx, sy - 10);
      this.floatText(m.x, m.y - 0.6, "RENASCEU", "#fff2a8", 20, true);
      if (m.id === this.room.sessionId) { this.cameras.main.flash(250, 255, 240, 160); sfx.heal(); }
    } else {
      if (m.amount > 0) {
        if (config().numCura) this.healText(m.x, m.y - 1.1, `+${m.amount}`, false); // acima da cabeça (e do nome)
        if (m.id === this.room.sessionId) { sfx.heal(); this.hud.showHeal(m.amount); }
      } else if (m.excesso && config().numCura) this.healText(m.x, m.y - 1.1, `+${m.excesso}`, true); // vida cheia: a cura de habilidade aparece mais clara e menor

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
    if (m.fx) this.skyFx(m.fx, m.x, m.y, m.r, m.ms);
  }

  /** Skills que descem do céu (eixo Z, ideia do Diablo): objetos caem em diagonal até o alvo e o impacto acontece quando o servidor aplica o dano. */
  private skyFx(fx: SkillFx, gx: number, gy: number, r: number, ms: number) {
    const { sx, sy } = toScreen(gx, gy);
    const ground = (col: number, k: number) => this.ring(gx, gy, r * k, col, 420, 0.25);
    const fall = (x0: number, y0: number, x1: number, y1: number, delay: number, dur: number, make: () => Phaser.GameObjects.Shape, land: () => void, trail?: { explode(n: number, x: number, y: number): void }) => {
      const o = make().setPosition(x0, y0).setDepth(1e6);
      this.tweens.add({
        targets: o, x: x1, y: y1, delay, duration: dur, ease: "Quad.easeIn",
        onUpdate: () => trail?.explode(1, o.x, o.y),
        onComplete: () => { o.destroy(); land(); },
      });
    };
    switch (fx) {
      case "meteor": {
        const big = () => this.add.circle(0, 0, 18 + r * 2, 0xff6a1a).setStrokeStyle(4, 0xffd08a).setBlendMode(Phaser.BlendModes.ADD);
        fall(sx + 260, sy - 620, sx, sy, 0, ms, big, () => {
          ground(0xff6a1a, 1); ground(0xffd08a, 0.6);
          this.emitters.orange.explode(70, sx, sy - 6); this.emitters.gold.explode(30, sx, sy - 6);
          this.cameras.main.shake(380, 0.014); this.cameras.main.flash(160, 255, 170, 90); sfx.boom();
        }, this.emitters.orange);
        break;
      }
      case "firerain": {
        const n = Math.round(6 + r * 3);
        for (let i = 0; i < n; i++) {
          const a = Math.random() * Math.PI * 2, d = Math.sqrt(Math.random()) * r;
          const tx = sx + Math.cos(a) * d * ELL_W / 2, ty = sy + Math.sin(a) * d * ELL_H / 2;
          const delay = Math.random() * ms * 0.45, dur = ms * 0.55;
          fall(tx + 150, ty - 400, tx, ty, delay, dur, () => this.add.circle(0, 0, 6, 0xff7a2a).setBlendMode(Phaser.BlendModes.ADD),
            () => { this.emitters.orange.explode(8, tx, ty); this.ring(gx + Math.cos(a) * d, gy + Math.sin(a) * d, 0.7, 0xff8a3a, 260, 0.3); }, this.emitters.red);
        }
        this.time.delayedCall(ms, () => { ground(0xff7a2a, 1); this.cameras.main.shake(160, 0.006); sfx.boom(); });
        break;
      }
      case "lightning": {
        this.time.delayedCall(ms, () => {
          const g = this.add.graphics().setDepth(1e6).setBlendMode(Phaser.BlendModes.ADD);
          let x = sx + 40, y = sy - 640;
          const pts: [number, number][] = [[x, y]];
          while (y < sy) { y += 50 + Math.random() * 40; x += (sx - x) * 0.35 + (Math.random() - 0.5) * 50; pts.push([x, Math.min(y, sy)]); }
          pts[pts.length - 1] = [sx, sy];
          for (const [w, c, a] of [[9, 0x8a6bff, 0.5], [4, 0xe9e0ff, 1]] as const) {
            g.lineStyle(w, c, a).beginPath().moveTo(pts[0][0], pts[0][1]);
            for (const p of pts.slice(1)) g.lineTo(p[0], p[1]);
            g.strokePath();
          }
          ground(0xbfa8ff, 1);
          this.emitters.gold.explode(14, sx, sy - 6);
          this.cameras.main.flash(90, 220, 200, 255); this.cameras.main.shake(140, 0.007); sfx.boom();
          this.tweens.add({ targets: g, alpha: 0, duration: 220, onComplete: () => g.destroy() });
        });
        break;
      }
      case "holy": {
        const beam = this.add.rectangle(sx, sy - 300, r * ELL_W * 0.5, 600, 0xfff2a8, 0).setDepth(1e6).setBlendMode(Phaser.BlendModes.ADD);
        this.tweens.add({ targets: beam, alpha: 0.55, duration: ms, ease: "Quad.easeIn", onComplete: () => {
          this.emitters.gold.explode(24, sx, sy - 6); ground(0xfff2a8, 1);
          this.tweens.add({ targets: beam, alpha: 0, scaleX: 1.4, duration: 260, onComplete: () => beam.destroy() });
        } });
        break;
      }
      case "arrows": {
        const n = Math.round(5 + r * 3);
        for (let i = 0; i < n; i++) {
          const a = Math.random() * Math.PI * 2, d = Math.sqrt(Math.random()) * r;
          const tx = sx + Math.cos(a) * d * ELL_W / 2, ty = sy + Math.sin(a) * d * ELL_H / 2;
          const delay = Math.random() * ms * 0.5, dur = ms * 0.5;
          fall(tx + 90, ty - 330, tx, ty, delay, dur, () => this.add.ellipse(0, 0, 3, 24, 0xe8d9a0).setRotation(0.25), () => this.emitters.gold.explode(3, tx, ty));
        }
        break;
      }
      case "chains": { // correntes e raízes brotam do chão na área quando o servidor aplica o efeito
        ground(0x6a8a5a, 0.5);
        this.time.delayedCall(ms, () => {
          const n = Math.round(6 + r * 3);
          for (let i = 0; i < n; i++) {
            const a = (i / n) * Math.PI * 2 + Math.random() * 0.5, d = (i % 2 ? 0.95 : 0.45) * r * Math.sqrt(Math.random() * 0.6 + 0.4);
            const x = sx + Math.cos(a) * d * ELL_W / 2, y = sy + Math.sin(a) * d * ELL_H / 2;
            const g = this.add.graphics({ x, y }).setDepth(y + 2).setScale(1, 0.05);
            const links = 4 + Math.floor(Math.random() * 3);
            for (let k = 0; k < links; k++) {
              g.lineStyle(3, 0xc4cbd4, 1).strokeEllipse(0, -8 - k * 11, k % 2 ? 11 : 5, 14);
              g.lineStyle(1, 0x4a525c, 1).strokeEllipse(0, -8 - k * 11, k % 2 ? 11 : 5, 14);
            }
            g.fillStyle(0xe8edf3, 1).fillTriangle(-5, -8 - links * 11, 5, -8 - links * 11, 0, -26 - links * 11); // ponta do gancho
            g.fillStyle(0x4a3a22, 1).fillTriangle(-9, 0, -3, 0, -6, -12).fillTriangle(3, 0, 9, 0, 6, -14); // raízes na base
            this.tweens.add({ targets: g, scaleY: 1, duration: 170, ease: "Back.easeOut", delay: Math.random() * 120 });
            this.tweens.add({ targets: g, alpha: 0, duration: 400, delay: 1300 + Math.random() * 300, onComplete: () => g.destroy() });
          }
          ground(0x9aa6b2, 1);
          this.emitters.gold.explode(14, sx, sy - 6); this.emitters.orange.explode(10, sx, sy - 6);
          this.cameras.main.shake(160, 0.006); sfx.boom();
        });
        break;
      }
      case "colossus": { // Queda do Colosso: uma espada gigante desaba do alto (eixo Z), com sombra crescendo no chão
        const k = r / 4;
        // aviso no chão: sombra que cresce e anel pulsante
        const shadow = this.add.ellipse(sx, sy, r * ELL_W * 0.2, r * ELL_H * 0.2, 0x000000, 0.1).setDepth(0.6);
        this.tweens.add({ targets: shadow, scale: 5, alpha: 0.55, duration: ms, ease: "Quad.easeIn", onComplete: () => shadow.destroy() });
        const warn = this.add.ellipse(sx, sy, r * ELL_W, r * ELL_H, 0xffa040, 0).setStrokeStyle(3, 0xffc070, 1).setDepth(0.7);
        this.tweens.add({ targets: warn, alpha: { from: 1, to: 0.35 }, duration: 160, yoyo: true, repeat: Math.max(1, Math.floor(ms / 320)), onComplete: () => warn.destroy() });
        // a espada: lâmina de aço com brilho, guarda e cabo; cai inclinada
        const sw = this.add.graphics();
        const glow = this.add.circle(0, -300 * k, 120 * k, 0xffb060, 0.28).setBlendMode(Phaser.BlendModes.ADD);
        sw.fillStyle(0xcfd6df, 1).fillPoints([{ x: -26 * k, y: -520 * k }, { x: 26 * k, y: -520 * k }, { x: 20 * k, y: -60 * k }, { x: 0, y: 0 }, { x: -20 * k, y: -60 * k }], true);
        sw.fillStyle(0xffffff, 0.55).fillPoints([{ x: -6 * k, y: -520 * k }, { x: 6 * k, y: -520 * k }, { x: 3 * k, y: -70 * k }, { x: 0, y: -20 * k }], true);
        sw.fillStyle(0x6b4a2e, 1).fillRect(-70 * k, -548 * k, 140 * k, 30 * k); // guarda
        sw.fillStyle(0xf0c34a, 1).fillRect(-70 * k, -548 * k, 140 * k, 7 * k);
        sw.fillStyle(0x3a2a18, 1).fillRect(-12 * k, -700 * k, 24 * k, 152 * k); // cabo
        sw.fillStyle(0xf0c34a, 1).fillCircle(0, -712 * k, 20 * k);
        const sword = this.add.container(sx + 40, sy - 1100, [glow, sw]).setDepth(1e6).setRotation(-0.12);
        this.tweens.add({
          targets: sword, x: sx, y: sy, duration: ms, ease: "Cubic.easeIn",
          onUpdate: () => { this.emitters.gold.explode(1, sword.x, sword.y - 200 * k); this.emitters.orange.explode(1, sword.x, sword.y - 80 * k); },
          onComplete: () => {
            sword.setRotation(0);
            // impacto: tremor forte, clarão, ondas de choque, rachaduras, poeira e destroços
            this.cameras.main.shake(650, 0.03); this.cameras.main.flash(220, 255, 220, 160); sfx.boom();
            this.time.delayedCall(120, () => sfx.boom());
            ground(0xff8a2a, 1); ground(0xffe0a0, 0.6);
            this.shockwave(gx, gy, r * 1.1, 0xffc070, 0); this.shockwave(gx, gy, r * 1.8, 0xffe9c8, 0);
            this.emitters.orange.explode(90, sx, sy - 6); this.emitters.gold.explode(50, sx, sy - 6);
            const cr = this.add.graphics().setDepth(0.65);
            cr.lineStyle(4, 0x1a1008, 0.9);
            for (let i = 0; i < 11; i++) {
              const a = (i / 11) * Math.PI * 2 + Math.random() * 0.4;
              let x = sx, y = sy;
              cr.beginPath().moveTo(x, y);
              for (let j = 0; j < 4; j++) { x += Math.cos(a + (Math.random() - 0.5) * 0.7) * (r * 18 + 10); y += Math.sin(a + (Math.random() - 0.5) * 0.7) * (r * 9 + 5); cr.lineTo(x, y); }
              cr.strokePath();
            }
            this.tweens.add({ targets: cr, alpha: 0, duration: 1400, delay: 900, onComplete: () => cr.destroy() });
            const pillar = this.add.rectangle(sx, sy - 260, 50 + r * 16, 520, 0xffd9a0, 0.6).setBlendMode(Phaser.BlendModes.ADD).setDepth(1e6);
            this.tweens.add({ targets: pillar, alpha: 0, scaleX: 2.2, duration: 520, onComplete: () => pillar.destroy() });
            for (let i = 0; i < 14; i++) { // destroços que sobem e caem
              const rock = this.add.rectangle(sx, sy - 6, 6 + Math.random() * 8, 6 + Math.random() * 6, i % 2 ? 0x4a4258 : 0x7a6f66).setDepth(1e6);
              const dx = (Math.random() - 0.5) * r * 120, up = 90 + Math.random() * 160;
              this.tweens.add({ targets: rock, x: sx + dx, y: sy - up, angle: Math.random() * 360, duration: 320, ease: "Quad.easeOut",
                onComplete: () => this.tweens.add({ targets: rock, y: sy + (Math.random() - 0.5) * 20, alpha: 0, duration: 360, ease: "Quad.easeIn", onComplete: () => rock.destroy() }) });
            }
            // a espada fica cravada um instante e some
            this.tweens.add({ targets: sword, alpha: 0, duration: 500, delay: 650, onComplete: () => sword.destroy() });
          },
        });
        break;
      }
    }
  }

  /** número de cura: mais caprichado que o de dano (brilho verde, cruz, sobe devagar balançando) */
  private healText(gx: number, gy: number, txt: string, excesso: boolean) {
    if (this.floatUsed > 40) return;
    const { sx, sy } = toScreen(gx, gy);
    const cor = excesso ? "#c4f5d0" : "#8dffab";
    const t = this.add.text(sx, sy - 26, `✚ ${txt}`, { fontFamily: "Cinzel, Georgia, serif", fontStyle: "bold", fontSize: excesso ? "16px" : "22px", color: cor, stroke: "#0a2a14", strokeThickness: 5 })
      .setOrigin(0.5).setDepth(1e6).setScale(0.4).setAlpha(excesso ? 0.85 : 1);
    t.setShadow(0, 0, "#3dff7a", excesso ? 6 : 14, true, true);
    this.floatUsed++;
    const lado = Math.random() < 0.5 ? -1 : 1;
    this.tweens.add({ targets: t, scale: excesso ? 1 : 1.15, duration: 180, ease: "Back.easeOut", onComplete: () => { if (t.scene) this.tweens.add({ targets: t, scale: 1, duration: 160 }); } });
    this.tweens.add({ targets: t, x: sx + lado * 8, duration: 1100, ease: "Sine.easeInOut" });
    this.tweens.add({ targets: t, y: t.y - 46, alpha: 0, duration: 1100, delay: 200, ease: "Cubic.easeOut", onComplete: () => { this.floatUsed--; t.destroy(); } });
  }

  private floatText(gx: number, gy: number, txt: string, color: string, size: number, pop: boolean) {
    if (this.floatUsed > 40) return; // teto de números na tela (rajadas de área não travam o quadro)
    const { sx, sy } = toScreen(gx, gy);
    const key = `${size}|${color}`;
    const free = this.floatFree.get(key);
    let t = free?.pop();
    if (t) t.setText(txt).setActive(true).setVisible(true);
    else t = this.add.text(0, 0, txt, { fontFamily: "Cinzel, Georgia, serif", fontStyle: "bold", fontSize: `${size}px`, color, stroke: "#000", strokeThickness: 4 }).setOrigin(0.5);
    t.setPosition(sx, sy - 26).setDepth(1e6).setAlpha(1).setScale(pop ? 1.6 : 1);
    this.floatUsed++;
    if (pop) this.tweens.add({ targets: t, scale: 1, duration: 120, ease: "Back.easeOut" });
    const tx = t;
    this.tweens.add({ targets: tx, y: tx.y - 38, alpha: 0, duration: 750, delay: 120, ease: "Cubic.easeOut", onComplete: () => {
      this.floatUsed--;
      if (!tx.scene) return; // destruído pela troca de zona
      tx.setVisible(false).setActive(false);
      const arr = this.floatFree.get(key);
      if (arr) arr.push(tx); else this.floatFree.set(key, [tx]);
    } });
  }

  private onHit(m: HitEvent) {
    if (m.by) this.medidor?.dano(m.by, m.dmg); // medidor: dano de quem bateu (monstro ou jogador)
    const mine = m.by === this.room.sessionId;
    const toMe = m.k === "p" && m.id === this.room.sessionId;
    const { sx, sy } = toScreen(m.x, m.y);
    this.sprites.get(m.k === "e" ? `e:${m.id}` : `p:${m.id}`)?.trigger("hit", this.time.now);
    if (m.k === "e" && m.refl) { // dano devolvido pelo Escudo Refletor: raio azul do guerreiro ao inimigo
      const w = this.state.players.get(String(m.by));
      if (w) { this.beam(w.x, w.y, m.x, m.y, 0x8fd0ff, 200); this.ring(w.x, w.y, 1.2, 0x8fd0ff, 260, 0.5); }
      this.emitters.gold.explode(8, sx, sy - 10);
      if (config().numDano) this.floatText(m.x, m.y, String(m.dmg), "#8fd0ff", 18, true);
      return;
    }
    if (m.k === "e") {
      (m.crit ? this.emitters.gold : this.emitters.orange).explode(m.crit ? 16 : 9, sx, sy - 10);
      if (config().numDano) this.floatText(m.x, m.y, String(m.dmg) + (m.crit ? "!" : ""), m.crit ? "#ffd45e" : "#ffffff", m.crit ? 24 : 17, m.crit);
      if (mine || m.crit) sfx.hit(m.crit);
      if (mine) {
        this.cameras.main.shake(m.crit ? 130 : 80, m.crit ? 0.006 : 0.003);
        this.hitstopUntil = this.time.now + (m.crit ? 90 : 55);
      }
    } else {
      this.emitters.red.explode(12, sx, sy - 10);
      if (config().numDano) this.floatText(m.x, m.y, String(m.dmg), "#ff6a5a", 20, true);
      if (toMe) {
        this.cameras.main.shake(170, 0.008);
        this.cameras.main.flash(130, 255, 50, 40);
        this.hitstopUntil = this.time.now + 70;
        sfx.hurt();
      }
    }
  }

  /** o baú do chefe abre: coluna de luz e explosão na cor da melhor raridade, mais o anúncio no centro da tela */
  private onChest(m: ChestEvent) {
    const { sx, sy } = toScreen(m.x, m.y);
    const hex = RARITY_HEX[m.rarity];
    const t = rarityIndex(m.rarity);
    const box = this.add.rectangle(sx, sy - 6, 26, 18, 0x6b4a2e).setStrokeStyle(3, hex).setDepth(sy + 3);
    const beam = this.add.rectangle(sx, sy - 140, 36 + t * 8, 280, hex, 0.5).setBlendMode(Phaser.BlendModes.ADD).setDepth(sy + 2);
    this.tweens.add({ targets: beam, alpha: 0, scaleX: 2.2, duration: 1600, ease: "Cubic.easeOut", onComplete: () => beam.destroy() });
    this.tweens.add({ targets: box, alpha: 0, delay: 1500, duration: 600, onComplete: () => box.destroy() });
    this.ring(m.x, m.y, 2.6, hex, 900, 0.2);
    this.ring(m.x, m.y, 1.4, 0xffffff, 600, 0.3);
    this.emitters.gold.explode(30 + t * 8, sx, sy - 10);
    this.cameras.main.shake(260, 0.008);
    this.cameras.main.flash(180, (hex >> 16) & 255, (hex >> 8) & 255, hex & 255);
    sfx.boom();
    if (t >= 2) showRarityReveal(`Baú: ${m.boss}`, m.rarity, "Seus itens caíram ao redor");
    else this.inv.toast(`Baú de ${m.boss}`, RARITY_COLOR[m.rarity]);
  }

  private onLevelUp(m: LevelUpEvent) {
    const s = this.sprites.get(`p:${m.id}`)?.obj;
    if (!s) return;
    this.emitters.gold.explode(30, s.x, s.y - 8);
    const g = toGrid(s.x, s.y);
    this.floatText(g.x, g.y - 1.2, `NÍVEL ${m.level}!`, "#ffd45e", 26, true);
    levelUpGlow(this, s, m.level); // brilho na cor da faixa do nível, em todos que estão na tela
    if (m.id === this.room.sessionId) {
      sfx.levelUp();
      showLevelUpBanner(m.level);
    }
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
  private aim(a: ActionId): { x: number; y: number } {
    const me = this.me();
    if (!me) return { x: 0, y: 0 };
    if (a === "skill1" && this.cls === "cleric" && Number(me.qMode) === 1) { // Cura Focada: o jogador selecionado; no celular, o aliado mais ferido por perto; senão o próprio
      const sel = this.selId ? this.state.players.get(this.selId) : undefined;
      if (sel && !sel.dead) return { x: sel.x, y: sel.y };
      if (this.touchMode) {
        let best: any = me, bestRatio = me.hp / me.maxHp;
        this.state.players.forEach((p: any, id: string) => { if (id !== this.room.sessionId && !p.dead && Math.hypot(p.x - me.x, p.y - me.y) <= 9 && p.hp / p.maxHp < bestRatio) { best = p; bestRatio = p.hp / p.maxHp; } });
        return { x: best.x, y: best.y };
      }
    }
    // foco travado (toque ou clique): as habilidades mirram nele, mesmo com o mouse ou o polegar fora dele
    // (a esquiva e as ações sem alcance não mirram no foco: a esquiva vai para onde o polegar/mouse aponta, não para cima do inimigo)
    // No computador as habilidades (exceto o ataque básico) NÃO grudam no foco: vão para onde o ponteiro aponta (o alcance é limitado pelo servidor/prévia).
    // No toque, o toque curto mira o alvo travado; segurar e arrastar escolhe o ponto livremente (aimGrid).
    const focus = this.reach(a) > 0 && this.touchMode ? this.targets().find((t) => t.key === this.lockKey) : undefined;
    if (focus) return { x: focus.x, y: focus.y };
    if (!this.touchMode) {
      // ataque básico no teclado sem foco: mira no inimigo do alcance (como no toque), não no ponteiro nem na última direção
      // PC: tudo é livre, sem foco automático; o ataque também vai para o ponteiro
      const p = this.input.activePointer;
      p.updateWorldPoint(this.cameras.main);
      return toGrid(p.worldX, p.worldY);
    }
    // toque: mira assistida no alvo travado, ou no inimigo / jogador em PvP mais próximo ao alcance da ação
    const t = this.assistTarget(a);
    if (t) return { x: t.x, y: t.y };
    // sem alvo: direção do polegar (se está no joystick) ou para onde o personagem olha
    const v = this.joy?.vector();
    if (v) {
      const g = toGrid(v.x, v.y);
      const n = Math.hypot(g.x, g.y) || 1;
      return { x: me.x + (g.x / n) * 3, y: me.y + (g.y / n) * 3 };
    }
    return { x: me.x + Math.cos(me.face) * 3, y: me.y + Math.sin(me.face) * 3 };
  }

  /** até onde a ação alcança um alvo (tiles); 0 = ação sem alvo (esquiva, buffs, curas em área) */
  private reach(a: ActionId): number {
    const d = classAction(this.cls, a, Number(this.me()?.qMode) || 0, this.modsDe(this.me()));
    switch (d.kind) {
      case "melee": return (d.offset ?? 0) + (d.radius ?? 1) + 1;
      case "dashHit": return (d.dash ?? 0) + (d.radius ?? 1);
      case "projectile": case "blast": case "healFocus": return d.range ?? 8; // Bola de Fogo (mago) e Cura Focada (clérigo) também têm alcance
      case "trap": case "rain": return d.placeRange ?? 8;
      case "pull": return 6;
      default: return 0;
    }
  }

  /** alvos possíveis: inimigos vivos e, com você em PvP, outros jogadores em PvP que não são do seu grupo; `r` = vida (0 a 1) */
  private targets(): { key: string; x: number; y: number; r: number }[] {
    const me = this.me();
    const out: { key: string; x: number; y: number; r: number }[] = [];
    if (!me) return out;
    this.state.enemies.forEach((e: any, id: string) => { if (e.st !== "dead") out.push({ key: `e:${id}`, x: e.x, y: e.y, r: e.hp / Math.max(1, e.maxHp) }); });
    if (me.pvp) {
      const mine = String(me.party ?? "");
      this.state.players.forEach((p: any, id: string) => {
        if (id === this.room.sessionId || p.dead || !p.pvp || (mine && p.party === mine)) return;
        out.push({ key: `p:${id}`, x: p.x, y: p.y, r: p.hp / Math.max(1, p.maxHp) });
      });
    }
    return out;
  }

  /** sem foco: o alvo com menos vida dentro do alcance da ação (empate: o mais próximo); com foco, o foco se ele estiver no alcance */
  private assistTarget(a: ActionId): { key: string; x: number; y: number; r: number } | null {
    const me = this.me();
    const reach = this.reach(a);
    if (!me || reach <= 0) return null;
    let best: { key: string; x: number; y: number; r: number } | null = null, bd = Infinity;
    for (const t of this.targets()) {
      const d = Math.hypot(t.x - me.x, t.y - me.y);
      if (d > reach) continue;
      if (t.key === this.lockKey) return t;
      const better = !best || (this.targetMode === "near" ? d < bd : t.r < best.r || (t.r === best.r && d < bd));
      if (better) { best = t; bd = d; }
    }
    if (best) this.lockKey = best.key;
    return best;
  }

  /** solta o foco se o alvo saiu do PvP ou está longe demais; se ele morreu, o próximo alvo no alcance vira o foco; a seleção se desfaz ao se afastar */
  private checkLock() {
    const me = this.me();
    if (me && this.selId) {
      const s = this.state.players.get(this.selId);
      if (!s || (!this.selGrupo && Math.hypot(s.x - me.x, s.y - me.y) > TARGET_RANGE)) this.deselect(); // foco num membro do grupo vale na zona toda
    }
    if (!this.lockKey) { if (this.touchMode) this.assistTarget("attack"); return; } // sem foco: no celular já mostra o mais próximo ao alcance do ataque
    const t = this.targets().find((x) => x.key === this.lockKey);
    if (!me || !t) { this.lockKey = ""; if (me) this.assistTarget("attack"); return; } // morreu (ou saiu do PvP): pega o próximo
    if (Math.hypot(t.x - me.x, t.y - me.y) > TARGET_RANGE) this.lockKey = "";
  }

  /** botão ⟳ (celular): passa para o próximo alvo, do mais perto ao mais longe; clérigo com a Cura Focada percorre os aliados */
  private cycleTarget() {
    const me = this.me();
    if (!me || me.dead) return;
    const dist = (o: { x: number; y: number }) => Math.hypot(o.x - me.x, o.y - me.y);
    if (this.cls === "cleric" && Number(me.qMode) === 1) {
      const al: { id: string; p: any }[] = [];
      this.state.players.forEach((p: any, id: string) => { if (id !== this.room.sessionId && !p.dead && dist(p) <= TARGET_RANGE) al.push({ id, p }); });
      if (!al.length) return;
      al.sort((a, b) => dist(a.p) - dist(b.p));
      const nx = al[(al.findIndex((x) => x.id === this.selId) + 1) % al.length];
      this.selId = nx.id;
      this.selGrupo = false;
      this.party.selectPlayer({ name: String(nx.p.name), level: Number(nx.p.level) || 1, cls: String(nx.p.cls), inParty: !!nx.p.party });
      navigator.vibrate?.(8);
      return;
    }
    const ts = this.targets().filter((t) => dist(t) <= TARGET_RANGE).sort((a, b) => dist(a) - dist(b));
    if (!ts.length) return;
    this.lockKey = ts[(ts.findIndex((t) => t.key === this.lockKey) + 1) % ts.length].key;
    this.chase = null;
    if (this.selId) this.deselect();
    navigator.vibrate?.(8);
  }

  setTargetMode(m: "low" | "near") {
    this.targetMode = m;
    try { localStorage.setItem(TMODE_KEY, m); } catch { /* sem armazenamento */ }
  }

  /** habilidade de área (armadilha, chuva, puxada): a mira mostra a área */
  private isAreaSkill(a: ActionId): boolean {
    const me = this.me();
    const k = me ? classAction(this.cls, a, Number(me.qMode) || 0, this.modsDe(me)).kind : "";
    return k === "trap" || k === "rain" || k === "pull";
  }

  /** ataque básico em andamento: confere se o alvo ainda existe e se já está no alcance; então ataca (respeitando a recarga) */
  private updateChase(time: number) {
    if (!this.chase) return;
    const me = this.me();
    const t = this.targets().find((q) => q.key === this.chase!.key);
    if (!me || me.dead || !t || this.lockKey !== this.chase.key || this.joy?.vector()) { this.chase = null; return; }
    const reach = this.reach("attack");
    const d = Math.hypot(t.x - me.x, t.y - me.y);
    if (d <= reach) {
      if (performance.now() >= this.nextBasicAt) { this.chase = null; this.act("attack"); }
      return;
    }
    if (time >= this.chaseMoveAt) { // reenvia o destino (o alvo também anda): para a uma distância de ataque
      this.chaseMoveAt = time + 250;
      const k = (reach * 0.8) / d;
      this.room.send(Msg.MoveTo, { x: t.x - (t.x - me.x) * k, y: t.y - (t.y - me.y) * k });
    }
  }

  /** ponto da mira arrastada (em tiles): estilo joystick, a partir do personagem, na direção do arrasto (relativo ao ponto onde o dedo apertou) */
  private aimGrid(): { x: number; y: number } {
    const me = this.me();
    const v = this.aimScreen;
    if (!me || !v || !this.aimA) return me ? { x: me.x, y: me.y } : { x: 0, y: 0 };
    const g = toGrid(v.x, v.y);
    const n = Math.hypot(g.x, g.y) || 1;
    const L = this.aimRange(this.aimA) || 6;
    const dist = L * Math.min(1, Math.hypot(v.x, v.y) / AIM_FULL_PX); // arrasto curto = perto, longo = alcance máximo
    return { x: me.x + (g.x / n) * dist, y: me.y + (g.y / n) * dist };
  }

  /** toque segurado numa habilidade: a prévia aparece já seguindo o alvo travado; arrastar além da zona morta assume a mira manual; soltar lança */
  aimStart(a: ActionId, x = 0, y = 0) {
    // área: mostra a área; alcance/direção (corpo a corpo, projétil): mostra o alcance e a linha até a mira; básico e buffs: nada
    this.aimA = a !== "attack" && this.aimRange(a) > 0 ? a : null;
    this.aimScreen = null;
    this.aimOrigin = { x, y };
  }
  aimMove(x: number, y: number) {
    if (!this.aimA || this.cls === "cleric") return; // clérigo: o alvo da cura é o aliado selecionado/mais ferido, não se arrasta
    const dx = x - this.aimOrigin.x, dy = y - this.aimOrigin.y;
    this.aimScreen = Math.hypot(dx, dy) < AIM_DEAD_PX ? null : { x: dx, y: dy }; // dedo de volta ao centro: a mira volta a seguir o alvo
  }
  aimEnd() { this.aimA = null; this.aimScreen = null; this.aimG?.clear(); }

  /** prévia da área (armadilha, chuva, puxada) com o mesmo limite de alcance e a mesma regra de ponto do servidor */
  private drawAimPreview(time: number) {
    const me = this.me();
    if (!me || !this.aimA) return;
    const def = classAction(this.cls, this.aimA, Number(me.qMode) || 0, this.modsDe(me));
    if (!this.isAreaSkill(this.aimA)) { this.drawReachAim(me, this.aimA); return; }
    const range = def.placeRange ?? 8;
    const r = def.radius ?? (def.kind === "pull" ? 4 : def.kind === "rain" ? 2 : 1.5);
    const mira = this.aimScreen ? this.aimGrid() : this.aim(this.aimA);
    const dx = mira.x - me.x, dy = mira.y - me.y, dd = Math.hypot(dx, dy);
    const ux = dd < 0.01 ? Math.cos(me.face) : dx / dd, uy = dd < 0.01 ? Math.sin(me.face) : dy / dd;
    const d = Math.min(dd < 0.01 ? range * 0.5 : dd, range); // a área nunca passa do alcance
    const cx = me.x + ux * d, cy = me.y + uy * d;
    const ring = (x: number, y: number, rad: number) => {
      const pts: { x: number; y: number }[] = [];
      for (let i = 0; i < 48; i++) {
        const an = (i / 48) * Math.PI * 2;
        const p = toScreen(x + Math.cos(an) * rad, y + Math.sin(an) * rad);
        pts.push({ x: p.sx, y: p.sy });
      }
      return pts;
    };
    const col = def.kind === "pull" ? 0x9fd8ff : 0xff9a4d;
    const pulse = 0.7 + 0.2 * Math.sin(time / 150);
    this.aimG.lineStyle(2, 0xffffff, 0.3).strokePoints(ring(me.x, me.y, range), true, true); // alcance máximo
    this.aimG.fillStyle(col, 0.22 * pulse).fillPoints(ring(cx, cy, r), true, true);
    this.aimG.lineStyle(2, col, 0.95).strokePoints(ring(cx, cy, r), true, true);
  }

  /** alcance da mira manual (arrastar o dedo): habilidades de área, de alcance/direção e a esquiva (distância do pulo). 0 = sem mira manual.
   *  O clérigo fica como está: só as habilidades de área dele (Compressor de Ar e Julgamento) têm mira manual. */
  private aimRange(a: ActionId): number {
    if (a === "attack") return 0;
    if (this.isAreaSkill(a)) return this.reach(a);
    if (this.cls === "cleric") return classAction(this.cls, a, Number(this.me()?.qMode) || 0).kind === "healFocus" ? this.reach(a) : 0; // Cura Focada: mostra quem vai ser curado (sem mira manual)
    const d = classAction(this.cls, a, Number(this.me()?.qMode) || 0, this.modsDe(this.me()));
    return d.kind === "dodge" ? d.dash ?? 0 : this.reach(a);
  }

  /** habilidade de alcance ou direção: anel do alcance e uma linha até a mira (arrastar muda a direção) */
  private drawReachAim(me: any, a: ActionId) {
    const L = this.aimRange(a);
    if (L <= 0) return;
    const mira = this.aimScreen ? this.aimGrid() : this.aim(a);
    const dx = mira.x - me.x, dy = mira.y - me.y, dd = Math.hypot(dx, dy) || 1;
    const ux = dd < 0.01 ? Math.cos(me.face) : dx / dd, uy = dd < 0.01 ? Math.sin(me.face) : dy / dd;
    const pts: { x: number; y: number }[] = [];
    for (let i = 0; i < 48; i++) {
      const an = (i / 48) * Math.PI * 2;
      const p = toScreen(me.x + Math.cos(an) * L, me.y + Math.sin(an) * L);
      pts.push({ x: p.sx, y: p.sy });
    }
    this.aimG.lineStyle(2, 0xffffff, 0.3).strokePoints(pts, true, true);
    const from = toScreen(me.x, me.y), to = toScreen(me.x + ux * L, me.y + uy * L);
    this.aimG.lineStyle(3, 0xffe08a, 0.85).lineBetween(from.sx, from.sy, to.sx, to.sy);
    if (this.cls === "cleric" && !this.aimScreen) { // Cura Focada: anel verde no aliado que vai receber a cura
      const t = toScreen(mira.x, mira.y);
      this.aimG.lineStyle(3, 0x6fe08a, 0.95).strokeEllipse(t.sx, t.sy, 56, 28).lineBetween(from.sx, from.sy, t.sx, t.sy);
    }
  }

  /** círculo verde sutil sob o jogador selecionado e anel vermelho sob o alvo travado (toque e computador) */
  private drawMarks(time: number) {
    this.selG.clear();
    this.aimG.clear();
    if (this.aimA) this.drawAimPreview(time);
    if (this.selId) {
      const v = this.sprites.get(`p:${this.selId}`);
      if (!v || !this.state.players.has(this.selId)) this.deselect();
      else if (v.obj.visible) {
        this.selG.lineStyle(2, 0x6fe08a, 0.55 + 0.15 * Math.sin(time / 300)).strokeEllipse(v.obj.x, v.obj.y, 50, 25).fillStyle(0x6fe08a, 0.08).fillEllipse(v.obj.x, v.obj.y, 50, 25);
        // linha do próprio jogador até o alvo (mostra onde ele está em relação a você)
        const mine = this.sprites.get(`p:${this.room.sessionId}`);
        if (mine?.obj.visible) this.selG.lineStyle(2, 0x6fe08a, 0.5).lineBetween(mine.obj.x, mine.obj.y, v.obj.x, v.obj.y);
      }
    }
    if (this.lockKey) {
      const v = this.sprites.get(this.lockKey);
      if (v?.obj.visible) {
        const k = 1 + 0.06 * Math.sin(time / 180);
        // vermelho enquanto o alvo está ao alcance do ataque básico; apagado quando ele sai do alcance
        const me = this.me();
        const ft = this.targets().find((q) => q.key === this.lockKey);
        const inR = !!me && !!ft && Math.hypot(ft.x - me.x, ft.y - me.y) <= this.reach("attack");
        const col = inR ? 0xff5a4a : 0x9aa3b0, alpha = inR ? 1 : 0.5;
        this.selG.lineStyle(3, col, 0.9 * alpha).strokeEllipse(v.obj.x, v.obj.y, 54 * k, 27 * k).fillStyle(col, 0.12 * alpha).fillEllipse(v.obj.x, v.obj.y, 54 * k, 27 * k);
      }
    }
  }

  /**
   * Menu ☰ e atalhos de jogo: Diário (J), Mochila (I), Talentos (T), Variações (V) e Builds (B).
   * No computador vão numa barra no topo (com ícone, tecla e ponto verde de pendência); no celular ficam na seção "Jogo" do menu.
   * "visto" fica salvo neste navegador por personagem.
   */
  private montarJogo() {
    const chave = (k: string) => `frixep.ut.${k}.${this.me()?.name ?? ""}`;
    const lido = (k: string): number => { try { return Number(localStorage.getItem(chave(k)) || 0); } catch { return 0; } };
    const grava = (k: string, v: number) => { try { localStorage.setItem(chave(k), String(v)); } catch { /* sem armazenamento */ } };
    const nivel = () => Number(this.me()?.level) || 1;
    const nVariacoes = () => VARIACAO_SLOTS.filter((s) => nivel() >= VARIACAO_NIVEL[s]).length;
    this.medidor = mountMedidor({
      meuId: () => this.room?.sessionId ?? "",
      grupo: () => { // só o grupo de quem mede (sozinho, só ele)
        const eu = this.me();
        const out: { id: string; name: string; cls: string }[] = [];
        this.state?.players?.forEach((p: any, id: string) => {
          if (id === this.room.sessionId || (eu?.party && p.party === eu.party)) out.push({ id, name: String(p.name ?? ""), cls: String(p.cls ?? "") });
        });
        return out;
      },
    });
    const itens: AtalhoJogo[] = [
      { label: "Medidor", tecla: "M", icone: ICONES_JOGO.medidor, run: () => this.medidor?.toggle(), aberto: () => this.medidor?.isOpen() ?? false },
      { label: "Diário", tecla: "J", icone: ICONES_JOGO.diario, run: () => this.diario.toggle(), aberto: () => this.diario.isOpen() },
      { label: "Mochila", tecla: "I", icone: ICONES_JOGO.mochila, run: () => this.inv.toggle(), aberto: () => this.inv.isOpen() },
      {
        label: "Talentos", tecla: "T", icone: ICONES_JOGO.talento, run: () => this.talentos.toggle(), aberto: () => this.talentos.isOpen(),
        pendente: () => { // ponto livre E algum talento que dá para subir agora
          const me = this.me();
          if (!me) return false;
          const esc = limparTalentos(String(me.talentos ?? "{}"), this.cls, nivel());
          return pontosLivres(esc, this.cls, nivel()) > 0 && talentosDaClasse(this.cls).some((t) => podeSubirTalento(esc, this.cls, nivel(), t.id).ok);
        },
      },
      {
        label: "Variações", tecla: "V", icone: ICONES_JOGO.variacao, run: () => this.variacoes.toggle(), aberto: () => this.variacoes.isOpen(),
        pendente: () => nVariacoes() > lido("va"), // variação nova liberada que o jogador ainda não viu
        visto: () => grava("va", nVariacoes()),
      },
      {
        label: "Builds", tecla: "B", icone: ICONES_JOGO.build, run: () => this.builds.toggle(), aberto: () => this.builds.isOpen(),
        pendente: () => nivel() >= 6 && lido("bd") === 0, // builds guardam variações e talentos: aparece junto com os talentos, até abrir uma vez
        visto: () => grava("bd", 1),
      },
    ];
    mountBarraJogo(itens); // computador: barra no topo
    const configUi = mountConfiguracoes(); // janela ⚙ Configurações (abas Gráficos, Interface, Som, Controles)
    const menuJogo = mountGameMenu({
      playerName: this.me()?.name ?? "Portador",
      onLogout: async () => {
        this.leaving = true;
        try { await this.room.leave(true); } catch { /* já desconectado */ }
        logout();
      },
      jogo: itens, // celular: seção "Jogo" do menu ☰
      onConfig: () => configUi.abrir(),
    });
    mountHudCamadas(); // HUD flutuante some enquanto um painel grande está aberto
    void montarEntradaPainel((this.sys.settings.data as { token: string }).token, menuJogo.addAcao); // botão "Painel": só aparece para admin (o módulo do painel carrega sob demanda)
  }

  private savedQMode(): 0 | 1 { try { return localStorage.getItem("frixep.qmode") === "1" ? 1 : 0; } catch { return 0; } }
  /** Clérigo: pede ao servidor a troca do Q (ele só aceita fora de combate); a escolha fica salva neste navegador */
  private setQMode(mode: 0 | 1) {
    if (this.cls !== "cleric" || !this.room) return;
    this.room.send(Msg.QMode, { mode });
    try { localStorage.setItem("frixep.qmode", String(mode)); } catch { /* sem armazenamento */ }
  }

  private act(a: ActionId) {
    const me = this.me();
    if (!me || me.dead || !this.room || this.busy) return;
    // ataque básico com o alvo travado fora do alcance: anda até ele e ataca ao chegar (o joystick cancela)
    if (a === "attack" && this.lockKey && this.touchMode) {
      const t = this.targets().find((q) => q.key === this.lockKey);
      const reach = this.reach("attack");
      if (t && reach > 0 && Math.hypot(t.x - me.x, t.y - me.y) > reach) { this.chase = { key: this.lockKey }; this.chaseMoveAt = 0; return; }
    }
    if (a !== "attack") { this.chase = null; if (this.touchMode) navigator.vibrate?.(10); }
    if (a === "attack") this.dicas.gatilho("primeiro_ataque");
    else if (["skill1", "skill2", "skill3", "ultimate"].includes(a)) this.dicas.gatilho("primeira_skill");
    if (a === "attack") this.nextBasicAt = performance.now() + classAction(this.cls, "attack", Number(me.qMode) || 0, this.modsDe(me)).cd * 1000;
    const { x, y } = this.aimA === a && this.aimScreen ? this.aimGrid() : this.aim(a);
    const payload: ActPayload = { a, ax: x, ay: y };
    this.room.send(Msg.Act, payload);
    // resposta imediata no cliente (o servidor continua sendo quem decide o resultado)
    const angle = Math.atan2(y - me.y, x - me.x);
    this.playSwing(this.cls, a, me.x, me.y, angle, true, Number(me.qMode) || 0);
    const mine = this.sprites.get(`p:${this.room.sessionId}`);
    mine?.setFace(angle);
    mine?.trigger(animFor(a), this.time.now);
  }

  // ---------------------------------------------------------------- quadro
  update(time: number, delta: number) {
    const st = this.state;
    if (!st?.players || !st?.enemies) return;
    if (!this.busy) this.driveJoystick(time);
    timed("chao", () => this.ground?.update(time, this.room.sessionId, String(this.me()?.party ?? "")));
    if (!SEM_DESENHOS) timed("armas", () => this.weaponAuras?.update(time, st.players, this.sprites));
    const meNow = this.me();
    if (meNow && this.npcs) { // NPCs: anel e botão "Falar" ao alcance; a conversa fecha se o jogador se afastar
      if ((Number(meNow.level) || 1) !== this.nivelMarcas) this.marcarEntregas();
      timed("npcs", () => this.npcs.update(time, meNow.x, meNow.y));
      const near = this.npcs.inReach(meNow.x, meNow.y);
      this.econ.setNearNpc(near);
      if (this.pendingNpc && near?.id === this.pendingNpc.id) { this.econ.openNpc(this.pendingNpc); this.pendingNpc = null; }
      if (this.econ.isNpcOpen() && !near) this.econ.closeNpc();
    }
    if (meNow && this.town) { // baú da cidade: anel, botão "Abrir o baú" e animações do cenário
      timed("cidade", () => this.town?.update(time, this.cameras.main, meNow));
      const nearV = this.town.nearChest(meNow.x, meNow.y);
      this.vault.setNear(nearV);
      if (this.pendingVault && nearV) { this.pendingVault = false; this.vault.open(); }
    }
    this.checkLock();
    this.updateChase(time);
    timed("marcas", () => this.drawMarks(time));
    timed("portais", () => this.gates?.update(time));
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
    const wv = this.cameras.main.worldView; // fora da tela: sem placa, sombra nem efeitos (culling)
    const place = (key: string, x: number, y: number, face: number, hp: number, maxHp: number, o: { dead: boolean; level: number; kind: PlateKind; hideWhenDead?: boolean; ember?: boolean; windup?: boolean; reflect?: boolean; stun?: boolean; root?: boolean; shred?: boolean; slow?: boolean; shield?: number }) => {
      const v = this.sprites.get(key);
      if (!v) return;
      const s = v.obj;
      v.setFace(face);
      timed("sprites", () => v.update(time, { dead: o.dead, windup: o.windup }));
      const hidden = !!o.hideWhenDead && o.dead && v.deathDone; // com sprite, a morte toca antes de sumir
      s.setVisible(!hidden && !SEM_SPRITES); // Teste B: some com os sprites (nomes e placas continuam)
      this.labels.get(key)?.setVisible(!hidden && config().nomes); // Configurações > Interface: nomes sobre personagens
      this.levelTags.get(key)?.setVisible(!hidden);
      if (hidden) return;
      const { sx, sy } = toScreen(x, y);
      if (Math.hypot(sx - s.x, sy - s.y) > 1.5) v.markMoving(time); // ainda chegando na posição do servidor = andando
      if (Math.hypot(sx - s.x, sy - s.y) > 500) { // teleporte (renascer): sem deslizar pelo mapa
        s.setPosition(sx, sy);
        if (key === `p:${this.room.sessionId}`) this.cameras.main.centerOn(sx, sy);
      } else if (!frozen) {
        s.x += (sx - s.x) * 0.35;
        s.y += (sy - s.y) * 0.35;
      }
      if (s.x < wv.x - 140 || s.x > wv.right + 140 || s.y < wv.y - 160 || s.y > wv.bottom + 160) { this.labels.get(key)?.setVisible(false); this.levelTags.get(key)?.setVisible(false); return; }
      s.setDepth(s.y).setAlpha(o.dead && !o.hideWhenDead ? (v.isSprite ? 0.6 : 0.35) : 1);
      if (v.isSprite && !SEM_DESENHOS) timed("sombras", () => this.shadows.fillStyle(0x000000, 0.32).fillEllipse(s.x, s.y, 28 * s.scaleX, 12 * s.scaleX));
      // placa: nome, barra de vida e selo de nível (as bordas do selo mudam a cada 10 níveis)
      count("placas");
      const pg = timed("placas", () => drawPlate(this.bars, { x: s.x, y: s.y - v.headY - 2, hp, maxHp, level: o.level, kind: o.kind, time }));
      this.labels.get(key)?.setPosition(pg.nameX, pg.nameY).setScale(this.uiScale).setDepth(1e5 + 2);
      const nt = this.levelTags.get(key);
      if (nt) {
        if (nt.text !== String(o.level)) nt.setText(String(o.level));
        nt.setPosition(pg.numX, pg.numY).setScale(this.uiScale);
      }
      // marca de direção só nos círculos, que não têm rosto
      if (!v.isSprite) {
        const d = dirScreen(face);
        this.bars.lineStyle(3, 0xffffff, 0.85).lineBetween(s.x, s.y, s.x + d.x * 16, s.y + d.y * 16);
      }
      if (o.shield) drawShieldBubble(this.bars, s.x, s.y, time, o.shield); // bolha de chegada (imune a dano)
      if (o.ember) this.bars.lineStyle(2, 0xffc861, 0.9).strokeEllipse(s.x, s.y + (v.isSprite ? 0 : 8), 36, 18); // Brasa ativa
      if (o.reflect) { // Escudo Refletor: cúpula azul-aço que pulsa em volta do guerreiro
        const k = 1 + 0.05 * Math.sin(time / 160), cy = s.y - 16;
        this.bars.fillStyle(0x8fd0ff, 0.13).fillEllipse(s.x, cy, 54 * k, 66 * k).lineStyle(2, 0xcfeaff, 0.85).strokeEllipse(s.x, cy, 54 * k, 66 * k);
        this.bars.lineStyle(2, 0xffffff, 0.5).beginPath().arc(s.x, cy, 24 * k, Math.PI * 1.15, Math.PI * 1.55).strokePath();
        this.bars.lineStyle(2, 0x8fd0ff, 0.7).strokeEllipse(s.x, s.y + 2, 46 * k, 20 * k);
      }
      if (o.root) { // enraizado: elos de corrente e raízes em volta dos pés
        this.bars.lineStyle(2, 0x9aa3ad, 0.95).strokeEllipse(s.x, s.y + 2, 44, 20);
        for (let i = 0; i < 6; i++) {
          const a = (i / 6) * Math.PI * 2, x = s.x + Math.cos(a) * 22, y = s.y + 2 + Math.sin(a) * 10;
          this.bars.fillStyle(0xc4cbd4, 1).fillEllipse(x, y, i % 2 ? 8 : 5, 5).lineStyle(2, 0x4a3a22, 1).lineBetween(x, y, x + Math.cos(a) * 3, y - 9);
        }
      }
      if (o.shred || o.slow) { // ícones de efeito sobre a barra de vida: escudo rachado (armadura quebrada) e floco de gelo (lento)
        const icons = (o.shred ? 1 : 0) + (o.slow ? 1 : 0);
        let ix = s.x - ((icons - 1) * 15) / 2;
        const iy = s.y - v.headY - 50;
        if (o.shred) {
          const sh = [[-6, -7], [6, -7], [6, 1], [0, 8], [-6, 1]].map(([px, py]) => ({ x: ix + px, y: iy + py }));
          this.bars.fillStyle(0xff9d4d, 1).fillPoints(sh, true, true).lineStyle(1.5, 0x3a1a08, 1).strokePoints(sh, true, true);
          this.bars.lineStyle(2, 0xffffff, 1).beginPath().moveTo(ix + 1, iy - 7).lineTo(ix - 2, iy - 1).lineTo(ix + 2, iy + 2).lineTo(ix - 1, iy + 8).strokePath(); // rachadura
          ix += 15;
        }
        if (o.slow) {
          this.bars.fillStyle(0x16324a, 0.9).fillCircle(ix, iy, 7.5).lineStyle(1.5, 0x7fd0ff, 1).strokeCircle(ix, iy, 7.5);
          for (let i = 0; i < 3; i++) { const a = (i * Math.PI) / 3; this.bars.lineStyle(1.6, 0xcdeeff, 1).lineBetween(ix - Math.cos(a) * 5, iy - Math.sin(a) * 5, ix + Math.cos(a) * 5, iy + Math.sin(a) * 5); }
        }
      }
      if (o.stun) { // atordoado: estrelas girando sobre a cabeça
        for (let i = 0; i < 3; i++) {
          const a = time / 200 + (i * Math.PI * 2) / 3;
          this.bars.fillStyle(0xffe27a, 1).fillCircle(s.x + Math.cos(a) * 14, s.y - v.headY - 30 + Math.sin(a) * 4, 3.2);
        }
      }
    };

    const myParty = String(this.me()?.party ?? "");
    const mateOf = (p: any, id: string) => !!myParty && id !== this.room.sessionId && p.party === myParty; // colega de grupo
    st.players.forEach((p: any, id: string) => { // nome vermelho com espadas = em PvP; azul = colega de grupo; "..." enquanto canaliza a entrada
      const mate = mateOf(p, id);
      const tag = (p.pvp ? "pvp" : p.pvpChan === 1 ? "chan" : "") + (mate ? "|mate" : "") + (p.gm && ehAdmin() ? "|gm" : "");
      if (this.pvpTag.get(id) !== tag) {
        this.pvpTag.set(id, tag);
        const base = rotuloGm(p.pvp ? `⚔ ${p.name}` : p.pvpChan === 1 ? `${p.name} …` : p.name, p); // [GM] só aparece para admin
        this.labels.get(`p:${id}`)?.setText(base).setColor(mate ? "#8fd0ff" : p.pvp ? "#ff6a5a" : "#ccc");
      }
      // Modo Deus: invisível some para quem não é admin (o dono e os admins continuam vendo)
      const visivel = gmVisivel(p, id === this.room.sessionId);
      const sp = this.sprites.get(`p:${id}`);
      if (sp && sp.obj.visible !== visivel) {
        sp.obj.setVisible(visivel);
        this.labels.get(`p:${id}`)?.setVisible(visivel);
        this.levelTags.get(`p:${id}`)?.setVisible(visivel);
      }
      if (id === this.room.sessionId) indicadorGm(!!p.gm); // selo "GM" enquanto o próprio personagem está em Modo Deus
    });
    st.players.forEach((p: any, id: string) => {
      let shield = 0; // 0 = sem bolha; senão a opacidade (pisca de leve nos últimos 2 s, só para o dono, que sabe o tempo)
      if (p.shield && !p.dead) {
        shield = 1;
        if (id === this.room.sessionId && this.shieldEnd && this.shieldEnd - performance.now() < 2000) shield = 0.55 + 0.35 * Math.sin(time / 70);
      }
      place(`p:${id}`, p.x, p.y, p.face, p.hp, p.maxHp, { shield, dead: p.dead, ember: p.ember, reflect: !!p.reflect, stun: !!p.stunned, root: !!p.rooted, level: Number(p.level) || 1, kind: id === this.room.sessionId ? (p.pvp ? "pvp" : "me") : mateOf(p, id) ? "party" : p.pvp ? "pvp" : "ally" });
    });
    st.enemies.forEach((e: any, id: string) => {
      const key = `e:${id}`;
      // o golpe cai quando o aviso (windup) termina: dispara a animação de ataque nessa virada
      if (this.prevSt.get(key) === "windup" && e.st === "recover") this.sprites.get(key)?.trigger("attack", time);
      this.prevSt.set(key, e.st);
      place(key, e.x, e.y, e.face, e.hp, e.maxHp, { dead: e.st === "dead", hideWhenDead: true, windup: e.st === "windup", stun: !!e.stunned, root: !!e.rooted, shred: !!e.shredded, slow: !!e.slowed, level: Number(e.level) || 1, kind: "enemy" });
    });

    const me = this.me();
    if (me) {
      // a HUD (DOM) só é tocada quando um valor muda
      const H = this.hudLast;
      const pv = `${!!me.pvp}|${Number(me.pvpChan) || 0}`;
      if (H.pvp !== pv) { H.pvp = pv; this.hud.setPvp(!!me.pvp, Number(me.pvpChan) || 0); }
      const mn = `${me.mana}|${me.maxMana}`;
      if (H.mana !== mn) { H.mana = mn; this.hud.setMana(me.mana, me.maxMana); }
      const q = Number(me.qMode) === 1 ? 1 : 0;
      if (H.q !== q) { H.q = q; this.hud.setQMode(q); }
      const ap = Number(me.autoPotAt) || 0; // auto-poção: o valor vem do servidor (sincroniza ao reconectar)
      if (H.ap !== ap) { H.ap = ap; this.hud.setAutoPotion(ap); }
      const bf = `${!!me.buff}|${!!me.ember}`;
      if (H.buff !== bf) { H.buff = bf; this.hud.setBuff(!!me.buff || !!me.ember, me.buff ? "Escudo ativo" : "Brasa ativa"); }
      const hpk = `${me.hp}|${me.maxHp}`;
      if (H.hp !== hpk) { H.hp = hpk; this.hud.setHp(me.hp, me.maxHp); }
      this.hud.setShield(me.shield && !me.dead ? (this.shieldEnd ? Math.max(0, (this.shieldEnd - performance.now()) / 1000) : -1) : null);
      this.lowHp.set(!me.dead && !this.busy && !this.loader.visible && me.maxHp > 0 && me.hp / me.maxHp <= LOW_HP_RATIO); // vida baixa: moldura vermelha leve
    if (!me.dead && me.maxHp > 0 && me.hp / me.maxHp < 0.3) this.dicas.gatilho("vida_baixa"); // dica de vida baixa, uma vez por personagem (C1.6)
      const pg = `${me.level}|${me.xp}`;
      if (H.prog !== pg) { H.prog = pg; this.hud.setProgress(me.level, me.xp, xpToNext(me.level)); }
      if (H.poder !== me.poder) { H.poder = me.poder; this.hud.setPoder(me.poder); this.inv.setPoder(me.poder); } // poder total: oficial do servidor; anima ao equipar
      this.updateBubbles(time);
      if (me.dead) {
        if (!this.deadUntil) this.deadUntil = time + RESPAWN_S * 1000;
        this.hud.setDead((this.deadUntil - time) / 1000, ZONES[this.zoneId]?.safe ? undefined : "Brasalume");
      } else {
        this.deadUntil = 0;
        this.hud.setDead(null);
      }
    }
  }
}

// Primeiro o login; o Phaser só inicia depois que há um token válido.
iniciarConfig(); // escala da HUD (Configurações) antes de montar qualquer janela
checkGpu(); // avisa se o navegador está desenhando por software (sem a placa de vídeo)
const token = await ensureLogin();
const character = await ensureCharacter(token); // sem personagem, mostra a criação antes de entrar no jogo
const loader = mountLoading();
loader.show({ zone: ZONES[character.zone ?? START_ZONE]?.name ?? "Brasalume", theme: ZONES[character.zone ?? START_ZONE]?.theme, verb: "Entrando em" });
new Phaser.Game({
  type: Phaser.AUTO,
  parent: "game",
  backgroundColor: "#0b0b10",
  // canvas em resolução nativa: tamanho em pixels de dispositivo, exibido em CSS por 1/DPR (sem borrão); sprites sem suavização e posições arredondadas
  scale: { mode: Phaser.Scale.NONE, width: Math.round(viewSize().w * rdpr()), height: Math.round(viewSize().h * rdpr()), zoom: 1 / rdpr() },
  render: { roundPixels: true, powerPreference: "high-performance", antialias: !COARSE },
  scene: [],
  callbacks: {
    postBoot: (game) => {
      const fit = () => {
        const v = viewSize();
        game.scale.setZoom(1 / rdpr()); // a escala de renderização muda o tamanho do canvas, mas não o da tela
        game.scale.resize(Math.round(v.w * rdpr()), Math.round(v.h * rdpr()));
      };
      // limite de FPS (Configurações > Gráficos): o loop do Phaser só desenha quando passou o intervalo
      // o Phaser só usa o passo limitado (stepLimitFPS) se o limite existir quando o loop começa: muda os campos e reinicia o loop
      const loop = game.loop as unknown as { fpsLimit: number; hasFpsLimit: boolean; _limitRate: number; sleep(): void; wake(seamless?: boolean): void; running: boolean };
      let limiteAtual = -1;
      const limitarFps = () => {
        const t = config().fpsMax; // 0 = sem limite
        if (t === limiteAtual) return;
        limiteAtual = t;
        loop.fpsLimit = t;
        loop.hasFpsLimit = t > 0;
        loop._limitRate = t > 0 ? 1000 / t : 0;
        if (loop.running) { loop.sleep(); loop.wake(true); }
      };
      limitarFps();
      aoMudarConfig(() => { limitarFps(); fit(); }); // aplicar nas Configurações vale na hora
      window.addEventListener("resize", fit);
      window.addEventListener("orientationchange", () => setTimeout(fit, 200));
      window.visualViewport?.addEventListener("resize", fit);
      game.scene.add("world", WorldScene, true, { token, charId: character.id, zone: character.zone ?? START_ZONE, loader });
    },
  },
});
