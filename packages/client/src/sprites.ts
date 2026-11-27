import Phaser from "phaser";
import {
  type Dir, FRAME, PIVOT_X, PIVOT_Y, LOOP_ANIMS, parseTag, pickDirection, animFallbacks, validateAtlasJson,
  gridAngleToDir, totalDuration, type AtlasCheck,
} from "./sprites-core";

/** Um atlas carregado: quais animações/direções existem e quanto cada uma dura. */
export interface ActorAtlas {
  key: string;
  firstFrame: string;
  has: Set<string>; // "walk_se"
  durations: Map<string, number>; // "chave:walk:se" -> ms
  quadro: number; // tamanho do quadro na imagem (64 ou 128); no mundo ele sempre ocupa FRAME (64)
}
export interface AtlasSpec { name: string; png: string; json: string }

type Ok = Extract<AtlasCheck, { ok: true }>;

/**
 * Tenta carregar cada atlas. Os ausentes ou inválidos ficam de fora e o jogo usa círculos no lugar,
 * então a arte pode chegar aos poucos (por exemplo, só o Guerreiro primeiro).
 */
export async function loadAtlases(scene: Phaser.Scene, specs: AtlasSpec[]): Promise<Map<string, ActorAtlas>> {
  const out = new Map<string, ActorAtlas>();
  const valid: { spec: AtlasSpec; json: unknown; check: Ok }[] = [];

  await Promise.all(
    specs.map(async (spec) => {
      try {
        const res = await fetch(spec.json, { cache: "no-cache" });
        if (!res.ok) return;
        // o servidor de desenvolvimento devolve a página inicial (HTML) para caminhos inexistentes
        if (!(res.headers.get("content-type") ?? "").includes("json")) return;
        const json = await res.json();
        const check = validateAtlasJson(json);
        if (!check.ok) {
          console.warn(`[sprites] ${spec.name}: ${check.reason}`);
          return;
        }
        valid.push({ spec, json, check });
      } catch {
        /* arquivo ainda não existe: normal */
      }
    }),
  );
  if (!valid.length) return out;

  const failed = new Set<string>();
  const onError = (file: Phaser.Loader.File) => failed.add(file.key);
  scene.load.on(Phaser.Loader.Events.FILE_LOAD_ERROR, onError);
  for (const v of valid) scene.load.atlas(v.spec.name, v.spec.png, v.json as object);
  await new Promise<void>((resolve) => {
    scene.load.once(Phaser.Loader.Events.COMPLETE, () => resolve());
    scene.load.start();
  });
  scene.load.off(Phaser.Loader.Events.FILE_LOAD_ERROR, onError);

  for (const v of valid) {
    if (failed.has(v.spec.name) || !scene.textures.exists(v.spec.name)) {
      console.warn(`[sprites] ${v.spec.name}: a imagem não carregou (se veio do GitHub, rode "git lfs pull").`);
      continue;
    }
    scene.textures.get(v.spec.name).setFilter(Phaser.Textures.FilterMode.NEAREST); // pixel art: sem suavizar
    out.set(v.spec.name, buildAnims(scene, v.spec.name, v.check));
    console.info(`[sprites] ${v.spec.name}: ${v.check.tags.length} animações carregadas`);
  }
  return out;
}

function buildAnims(scene: Phaser.Scene, key: string, check: Ok): ActorAtlas {
  const has = new Set<string>();
  const durations = new Map<string, number>();
  for (const t of check.tags) {
    const parsed = parseTag(t.name);
    if (!parsed) continue;
    const frames = check.frames.slice(t.from, t.to + 1);
    const animKey = `${key}:${parsed.anim}:${parsed.dir}`;
    if (scene.anims.exists(animKey)) scene.anims.remove(animKey);
    scene.anims.create({
      key: animKey,
      // frameRate alto = base de 1 ms por quadro; a duração real de cada quadro (do Aseprite) vem do campo duration
      frameRate: 1000,
      frames: frames.map((f) => ({ key, frame: f.filename, duration: Math.max(0, f.duration - 1) })),
      repeat: LOOP_ANIMS.has(parsed.anim) ? -1 : 0,
    });
    has.add(`${parsed.anim}_${parsed.dir}`);
    durations.set(animKey, totalDuration(frames));
  }
  return { key, firstFrame: check.frames[0].filename, has, durations, quadro: check.quadro };
}

export type ActionAnim = "attack" | "skill" | "dodge" | "hit" | "death";

/**
 * Como um personagem ou inimigo aparece na tela: sprite animado (se há atlas) ou o círculo provisório.
 * Escolhe a animação pelo estado (parado, andando, atacando...) e a direção pela face (com espelhamento).
 */
export class ActorView {
  readonly obj: Phaser.GameObjects.Sprite | Phaser.GameObjects.Arc;
  readonly isSprite: boolean;
  /** altura da cabeça acima dos pés (onde ficam a barra de vida e o nome) */
  readonly headY: number;
  /** escala do personagem no mundo (1 = normal; chefes maiores), independente do tamanho do quadro da arte */
  readonly escalaMundo: number;
  /** a animação de morte já terminou (círculos: sempre verdadeiro) */
  deathDone = true;

  private sprite?: Phaser.GameObjects.Sprite;
  private arc?: Phaser.GameObjects.Arc;
  private baseColor: number;
  private dir: Dir = "se";
  private curKey = "";
  private lockUntil = 0;
  private lockKind: "" | "action" | "hit" = "";
  private lastMove = -1e9;
  private wasDead = false;
  private deathEnd = 0;
  private first = true;
  private prevNow = 0;

  constructor(private scene: Phaser.Scene, private atlas: ActorAtlas | undefined, opts: { color: number; radius: number; mine?: boolean; scale?: number }) {
    this.baseColor = opts.color;
    this.escalaMundo = opts.scale ?? 1;
    if (atlas) {
      this.sprite = scene.add.sprite(0, 0, atlas.key, atlas.firstFrame).setOrigin(PIVOT_X / FRAME, PIVOT_Y / FRAME);
      this.obj = this.sprite;
      this.isSprite = true;
      this.headY = 58 * this.escalaMundo;
      this.sprite.setScale(this.escalaMundo * (FRAME / atlas.quadro)); // quadro de 128 vira 0,5: mesmo tamanho na tela, mais detalhe
      this.show("idle");
    } else {
      this.arc = scene.add.circle(0, 0, opts.radius, opts.color).setStrokeStyle(opts.mine ? 3 : 2, opts.mine ? 0xffffff : 0x000000, opts.mine ? 0.9 : 0.5);
      this.obj = this.arc;
      this.isSprite = false;
      this.headY = 27;
    }
  }

  /** ângulo em que o personagem olha, no espaço da grade (o mesmo que o servidor usa) */
  setFace(gridAngle: number) {
    this.dir = gridAngleToDir(gridAngle);
  }

  /** marca que o corpo se moveu agora (para escolher andar em vez de parado) */
  markMoving(now: number) {
    this.lastMove = now;
  }

  /** ações pontuais: ataque, habilidade, esquiva, dano e morte */
  trigger(kind: ActionAnim, now: number) {
    if (!this.sprite) return;
    if (kind === "hit" && this.lockKind === "action" && now < this.lockUntil) return; // dano não interrompe um ataque
    const key = this.show(kind);
    if (!key) return;
    this.lockUntil = now + (this.atlas!.durations.get(key) ?? 300);
    this.lockKind = kind === "hit" ? "hit" : "action";
  }

  /** a cada quadro: escolhe a animação base (parado, andando, aviso do golpe, morto) */
  update(now: number, o: { dead: boolean; windup?: boolean }) {
    const prevNow = this.prevNow;
    this.prevNow = now;
    if (this.arc) {
      this.arc.setFillStyle(o.windup ? 0xff6a5a : this.baseColor);
      return;
    }
    if (!this.sprite) return;
    if (this.first) {
      this.first = false;
      if (o.dead) { this.wasDead = true; this.deathDone = true; this.show("death"); return; } // já estava morto: não repete a animação
    }
    if (o.dead) {
      if (!this.wasDead) {
        this.wasDead = true;
        this.deathDone = false;
        const key = this.show("death");
        this.deathEnd = now + (key ? this.atlas!.durations.get(key) ?? 400 : 0) + 250;
      } else if (!this.deathDone && now >= this.deathEnd) {
        this.deathDone = true;
      }
      return;
    }
    if (this.wasDead) { // renasceu
      this.wasDead = false;
      this.deathDone = false;
      this.lockUntil = 0;
      this.curKey = "";
    }
    if (now < this.lockUntil) { this.applyFlip(); return; } // ataque, esquiva ou dano em andamento
    // "andando" = o corpo se mexeu há pouco. A janela acompanha o intervalo real entre quadros,
    // senão um aparelho lento (poucos quadros por segundo) nunca pareceria estar andando.
    const frameMs = prevNow > 0 ? now - prevNow : 16;
    const moving = now - this.lastMove < Math.max(150, frameMs * 2.5);
    this.show(o.windup ? "windup" : moving ? "walk" : "idle");
  }

  destroy() {
    this.obj.destroy();
  }

  // ------------------------------------------------------------ internos
  private resolve(anim: string): { key: string; flip: boolean } | null {
    const a = this.atlas!;
    for (const name of animFallbacks(anim)) {
      const pick = pickDirection(this.dir, (d) => a.has.has(`${name}_${d}`));
      if (pick) return { key: `${a.key}:${name}:${pick.dir}`, flip: pick.flip };
    }
    return null;
  }

  private flip = false;
  private applyFlip() {
    this.sprite?.setFlipX(this.flip);
  }

  /** toca a animação (se mudou) e devolve a chave usada */
  private show(anim: string): string | null {
    if (!this.sprite || !this.atlas) return null;
    const r = this.resolve(anim);
    if (!r) return null;
    this.flip = r.flip;
    this.applyFlip();
    if (r.key !== this.curKey) {
      const prev = this.sprite.anims.currentAnim;
      const name = r.key.split(":")[1];
      const sameLoop = !!prev && this.curKey !== "" && prev.key.split(":")[1] === name && LOOP_ANIMS.has(name);
      // só a direção mudou num ciclo contínuo: mantém o ponto do ciclo (pelo progresso 0..1) para não "engasgar"
      let startFrame = 0;
      if (sameLoop) {
        const total = this.scene.anims.get(r.key)?.getTotalFrames() ?? 1;
        const prog = this.sprite.anims.getProgress();
        // animação de 1 quadro (folhas com uma pose só) dá progresso NaN: sem a guarda o Phaser quebra
        startFrame = total > 1 && Number.isFinite(prog) ? Math.max(0, Math.min(total - 1, Math.floor(prog * total))) : 0;
      }
      this.sprite.play({ key: r.key, startFrame }, true);
      this.curKey = r.key;
    }
    return r.key;
  }
}
