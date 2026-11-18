import { LEVEL_TIER_COLORS, levelTier, CLASS_DEFS, PVP_CHANNEL_S, type ActionId, type CharClass, type ResourceDef } from "@frixep/shared";

/**
 * HUD do combate em DOM (visual original do FrixeP: molduras quadradas de cantos suaves, ouro velho sobre azul-noite).
 *  - canto superior esquerdo: retrato, nome, barra de vida (coração) e barra do recurso da classe (Fúria, Foco ou Mana);
 *  - embaixo ao centro: barra de habilidades (Q W E, ultimate R, esquiva e ataque) com recarga, tecla, custo e aviso de recurso insuficiente;
 *  - linha fina de experiência na largura toda, no pé da tela, com o nível discreto.
 */

export interface HudOptions {
  cls: CharClass;
  name?: string;
  /** chamado quando o jogador aciona uma ação e ela não está em recarga local */
  onAction(a: ActionId): void;
  /** botão de poção (no celular, onde não há tecla) */
  onPotion?(): void;
  /** botão PvP: `true` pede para entrar, `false` para sair (o servidor canaliza e decide) */
  onPvp?(on: boolean): void;
}
export interface Hud {
  trigger(a: ActionId): void;
  setHp(hp: number, max: number): void;
  setMana(cur: number, max: number): void;
  setProgress(level: number, xp: number, need: number): void;
  /** desenha o retrato; `null` mantém o retrato provisório (inicial do nome) */
  setPortrait(source: CanvasImageSource | null, crop?: { x: number; y: number; w: number; h: number }): void;
  setDead(secondsLeft: number | null): void;
  setBuff(on: boolean, label?: string): void;
  /** liga o layout de toque: botões no canto direito, ao alcance do polegar */
  setTouch(on: boolean): void;
  /** estado do PvP vindo do servidor: `on` = está no modo; `chan` 0 nenhuma, 1 entrando, 2 saindo */
  setPvp(on: boolean, chan: number): void;
  /** aviso curto em destaque no alto da tela (ex.: "Canalização interrompida") */
  alert(text: string): void;
}

const ICON: Record<string, string> = {
  crown: `<svg viewBox="0 0 16 16" width="14" height="14" shape-rendering="crispEdges"><path fill="currentColor" d="M1 5h2v2h1V4h2V3h1V2h2v1h1v1h2v3h1V5h2v7H1z"/><path fill="#fff" opacity=".4" d="M2 6h1v5H2zM7 3h2v1H7z"/></svg>`,
  heart: `<svg viewBox="0 0 16 16" width="14" height="14" shape-rendering="crispEdges"><path fill="currentColor" d="M2 3h4v1h1v1h2V4h1V3h4v1h1v4h-1v1h-1v1h-1v1h-1v1H9v1H7v-1H6v-1H5v-1H4V9H3V8H2z"/><path fill="#fff" opacity=".45" d="M3 4h2v1H3z"/></svg>`,
  flame: `<svg viewBox="0 0 16 16" width="14" height="14" shape-rendering="crispEdges"><path fill="currentColor" d="M8 1h1v2h1v2h1v1h1v3h1v3h-1v2h-2v1H6v-1H4v-2H3V9h1V7h1V6h1V3h1z"/><path fill="#fff" opacity=".55" d="M8 8h1v1h1v3H8v1H7v-2h1z"/></svg>`,
  eye: `<svg viewBox="0 0 16 16" width="14" height="14" shape-rendering="crispEdges"><path fill="currentColor" d="M5 5h6v1h2v1h2v2h-2v1h-2v1H5v-1H3V9H1V7h2V6h2z"/><path fill="#0b1018" d="M7 6h2v4H7z"/><path fill="#fff" opacity=".6" d="M7 6h1v1H7z"/></svg>`,
  swords: `<svg viewBox="0 0 16 16" width="14" height="14" shape-rendering="crispEdges"><path fill="currentColor" d="M2 2h3l1 1 1 1 1 1 1 1-1 1-1-1-1-1-1-1-1-1H2zM14 2h-3l-1 1-1 1-1 1-1 1 1 1 1-1 1-1 1-1 1-1h3zM3 12l2-2 1 1-2 2zm10 0l-2-2-1 1 2 2zM7 8l1 1 1-1-1-1z"/><path fill="currentColor" d="M2 13h2v1H2zm10 0h2v1h-2z"/></svg>`,
  drop: `<svg viewBox="0 0 16 16" width="14" height="14" shape-rendering="crispEdges"><path fill="currentColor" d="M7 1h2v2h1v2h1v2h1v4h-1v2h-1v1H6v-1H5v-2H4V7h1V5h1V3h1z"/><path fill="#fff" opacity=".55" d="M6 8h1v3H6z"/></svg>`,
};

const TIER_NAMES = ["Bronze", "Prata", "Ouro", "Gelo", "Violeta", "Brasa"];
const hex = (n: number) => `#${n.toString(16).padStart(6, "0")}`;

const CSS = `
.hd{position:fixed;inset:0;z-index:15;pointer-events:none;font-family:"Cinzel",Georgia,serif;color:#e6eef9;
  --gold:#c9a45c;--gold-d:#7a5f2e;--ink:#0c121c;--ink2:#161f2e}
/* ---------- moldura quadrada de cantos suaves ---------- */
.hd-frame{position:relative;border-radius:10px;background:linear-gradient(180deg,var(--ink2),var(--ink));border:2px solid var(--gold-d);
  box-shadow:0 0 0 1px #000,inset 0 0 0 1px rgba(255,225,160,.22),0 6px 16px rgba(0,0,0,.6)}
/* ---------- unidade (retrato + barras) ---------- */
.hd-unit{position:absolute;left:max(12px,env(safe-area-inset-left));top:max(12px,env(safe-area-inset-top));display:flex;gap:10px;align-items:flex-start;width:min(300px,64vw)}
.hd-pwrap{position:relative;flex:none;width:72px;height:72px;--tc:#9a8460;--tl:#dccfb0}
.hd-portrait{position:absolute;inset:0;overflow:hidden;border:3px solid var(--tc);border-radius:11px;box-shadow:0 0 0 1px #000,inset 0 0 0 1px rgba(255,255,255,.14),0 6px 16px rgba(0,0,0,.6)}
.hd-pwrap.t0{--tc:#9a8460;--tl:#dccfb0}.hd-pwrap.t1{--tc:#c9d3df;--tl:#f4f8ff}.hd-pwrap.t2{--tc:#f0c34a;--tl:#fff0b8}
.hd-pwrap.t3{--tc:#4cc3ee;--tl:#d4f4ff}.hd-pwrap.t4{--tc:#b575f5;--tl:#ecd7ff}.hd-pwrap.t5{--tc:#ff6a3d;--tl:#ffd9b8}
.hd-pwrap.t3 .hd-portrait,.hd-pwrap.t4 .hd-portrait,.hd-pwrap.t5 .hd-portrait{box-shadow:0 0 0 1px #000,inset 0 0 0 1px rgba(255,255,255,.14),0 0 14px var(--tc),0 6px 16px rgba(0,0,0,.6)}
.hd-pwrap.t5 .hd-portrait{animation:hd-glow 1.6s ease-in-out infinite}
@keyframes hd-glow{0%,100%{box-shadow:0 0 0 1px #000,inset 0 0 0 1px rgba(255,255,255,.14),0 0 8px var(--tc),0 6px 16px rgba(0,0,0,.6)}50%{box-shadow:0 0 0 1px #000,inset 0 0 0 1px rgba(255,255,255,.14),0 0 22px var(--tc),0 6px 16px rgba(0,0,0,.6)}}
/* rebites nos cantos (ouro em diante) e gema no topo (violeta e brasa), como no selo da placa */
.hd-riv{display:none;position:absolute;width:6px;height:6px;background:var(--tl);border-radius:1px;box-shadow:0 0 0 1px #000;z-index:2}
.hd-riv:nth-of-type(1){left:-2px;top:-2px}.hd-riv:nth-of-type(2){right:-2px;top:-2px}.hd-riv:nth-of-type(3){left:-2px;bottom:-2px}.hd-riv:nth-of-type(4){right:-2px;bottom:-2px}
.hd-pwrap.t2 .hd-riv,.hd-pwrap.t3 .hd-riv,.hd-pwrap.t4 .hd-riv,.hd-pwrap.t5 .hd-riv{display:block}
.hd-gem{display:none;position:absolute;left:50%;top:-10px;width:14px;height:14px;margin-left:-7px;transform:rotate(45deg);background:linear-gradient(135deg,var(--tl),var(--tc) 60%);border:2px solid #05080d;border-radius:2px;z-index:3}
.hd-pwrap.t4 .hd-gem,.hd-pwrap.t5 .hd-gem{display:block}
.hd-lvb{position:absolute;right:-6px;bottom:-6px;min-width:26px;height:22px;padding:0 4px;display:grid;place-items:center;border-radius:6px;background:#0d1420;border:3px solid var(--tc);box-shadow:0 0 0 1px #000;font:900 13px/1 "Cinzel",Georgia,serif;color:var(--tl);z-index:4;text-shadow:0 1px 2px #000}
.hd-portrait canvas{position:absolute;inset:0;width:100%;height:100%;image-rendering:pixelated;display:none}
.hd-portrait.has canvas{display:block}
.hd-portrait.has .hd-ini{display:none}
.hd-ini{position:absolute;inset:0;display:grid;place-items:center;font:900 28px/1 "Cinzel",Georgia,serif;color:var(--gold);text-shadow:0 2px 6px #000}
.hd-bars{flex:1;min-width:0;display:flex;flex-direction:column;gap:5px;padding-top:2px}
.hd-name{font:700 12px/1 "Cinzel",Georgia,serif;letter-spacing:.14em;text-transform:uppercase;color:#f0dfb8;text-shadow:0 1px 3px #000;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.hd-name small{font-weight:600;letter-spacing:.1em;color:#9fb4cf;margin-left:6px;font-size:10px}
.hd-meter{display:flex;align-items:center;gap:6px}
.hd-meter>.ic{flex:none;width:20px;height:20px;display:grid;place-items:center;border-radius:6px;background:var(--ink);border:1px solid var(--gold-d)}
.hd-track{position:relative;flex:1;height:18px;border-radius:6px;overflow:hidden;background:#06090f;border:1px solid var(--gold-d);box-shadow:inset 0 2px 4px rgba(0,0,0,.7)}
.hd-fill,.hd-lag{position:absolute;inset:0;transform-origin:left;transform:scaleX(1)}
.hd-fill{transition:transform .15s}
.hd-lag{background:rgba(255,230,180,.5);transition:transform .7s .25s}
.hd-tr .hd-fill{background:linear-gradient(180deg,var(--tl),var(--tc))}
.hd-tr .hd-txt{letter-spacing:.14em;text-transform:uppercase}
.hd-track::after{content:"";position:absolute;left:0;right:0;top:0;height:40%;background:linear-gradient(180deg,rgba(255,255,255,.22),rgba(255,255,255,0))}
.hd-txt{position:absolute;inset:0;display:grid;place-items:center;font:700 10px/1 "Cinzel",Georgia,serif;letter-spacing:.1em;text-shadow:0 1px 3px #000,0 0 4px #000}
.hd-buff{margin-top:2px;font:700 9px/1 "Cinzel",Georgia,serif;letter-spacing:.25em;text-transform:uppercase;color:#ffb072;text-shadow:0 0 10px rgba(255,120,40,.6);opacity:0;transition:opacity .2s}
.hd-buff.on{opacity:1}
/* ---------- barra de habilidades ---------- */
.hd-bar{position:absolute;left:50%;bottom:calc(max(10px,env(safe-area-inset-bottom)) + 14px);transform:translateX(-50%);display:flex;gap:20px;align-items:flex-end;pointer-events:auto;padding:0;background:none;border:0;box-shadow:none}
.hd-btn{position:relative;width:56px;height:56px;border-radius:10px;cursor:pointer;color:#eaf4ff;overflow:hidden;touch-action:manipulation;-webkit-tap-highlight-color:transparent;user-select:none;padding:0;
  background:linear-gradient(180deg,#22304a,#0d1522);border:2px solid var(--gold-d);box-shadow:inset 0 0 0 1px rgba(255,225,160,.2),0 2px 6px rgba(0,0,0,.6);
  display:grid;place-items:center;transition:transform .1s,border-color .15s,box-shadow .15s,filter .15s}
.hd-btn.big{width:64px;height:64px;border-color:var(--gold)}
.hd-btn:active{transform:scale(.93)}
.hd-btn:hover{border-color:#f0cf86;box-shadow:inset 0 0 0 1px rgba(255,225,160,.3),0 0 14px rgba(255,190,90,.35)}
.hd-btn:focus-visible{outline:2px solid #ffd9a0;outline-offset:2px}
.hd-sn{font:700 8px/1.15 "Cinzel",Georgia,serif;letter-spacing:.05em;text-transform:uppercase;text-align:center;text-shadow:0 1px 3px #000;padding:0 3px;pointer-events:none}
.hd-key{position:absolute;top:2px;left:3px;min-width:12px;height:12px;display:grid;place-items:center;padding:0 2px;border-radius:4px;background:rgba(0,0,0,.65);font:700 8px/1 "Cinzel",Georgia,serif;color:#ffd9a0;pointer-events:none}
.hd-cost{position:absolute;right:3px;bottom:2px;font:700 9px/1 "Cinzel",Georgia,serif;text-shadow:0 1px 3px #000,0 0 3px #000;pointer-events:none}
.hd-cd{position:absolute;left:0;right:0;bottom:0;height:0;background:rgba(0,0,0,.78);pointer-events:none}
.hd-cdn{position:absolute;left:50%;top:50%;transform:translate(-50%,-50%);display:none;z-index:2;font:900 22px/1 "Cinzel",Georgia,serif;color:#fff;letter-spacing:0;white-space:nowrap;
  text-shadow:0 0 3px #000,0 0 3px #000,0 2px 6px #000;pointer-events:none}
.hd-btn.cool .hd-sn,.hd-btn.cool .hd-cost{opacity:.2}
.hd.touch .hd-btn:not(.big) .hd-cdn{font-size:19px}
.hd-btn.cool .hd-cdn{display:block}
.hd-btn.low{filter:saturate(.35) brightness(.7)}
.hd-btn.low .hd-cost{color:#ff7b6b!important}
.hd-btn.ready-pulse{animation:hd-pulse .45s ease-out}
@keyframes hd-pulse{0%{box-shadow:0 0 0 0 rgba(255,200,110,.8)}100%{box-shadow:0 0 0 12px rgba(255,200,110,0)}}
/* ---------- linha de experiência (largura toda, discreta) ---------- */
.hd-xp{position:absolute;left:0;right:0;bottom:0;height:calc(5px + env(safe-area-inset-bottom));background:rgba(4,7,12,.8);border-top:1px solid rgba(201,164,92,.35)}
.hd-xp i{position:absolute;left:0;top:0;height:5px;width:100%;transform-origin:left;transform:scaleX(0);background:linear-gradient(90deg,#3d7fc4,#a6d8ff);transition:transform .4s}
.hd-lv{position:absolute;left:max(12px,env(safe-area-inset-left));bottom:calc(env(safe-area-inset-bottom) + 8px);font:700 9px/1 "Cinzel",Georgia,serif;letter-spacing:.16em;color:rgba(220,205,170,.75);text-shadow:0 1px 3px #000}
/* ---------- aviso de morte ---------- */
.hd-dead{position:fixed;inset:0;z-index:16;display:none;flex-direction:column;align-items:center;justify-content:center;gap:10px;text-align:center;pointer-events:none;
  background:radial-gradient(ellipse at center,rgba(60,0,0,.35),rgba(10,0,0,.8));font-family:"Cinzel",Georgia,serif}
.hd-dead.on{display:flex}
.hd-dead h2{margin:0;font-size:clamp(28px,7vw,54px);font-weight:900;letter-spacing:.2em;text-indent:.2em;color:#ff6a5a;text-shadow:0 0 28px rgba(255,60,30,.6)}
.hd-dead p{margin:0;font-size:14px;letter-spacing:.3em;text-transform:uppercase;color:#cfdcec}
/* ---------- layout de toque: botões em arco no canto direito (polegar), a esquerda fica livre para o joystick ---------- */
.hd-pot{display:none}
.hd.touch .hd-pot{display:grid}
.hd.touch .hd-bar{left:auto;right:max(10px,env(safe-area-inset-right));bottom:calc(max(10px,env(safe-area-inset-bottom)) + 14px);transform:none;display:block;width:224px;height:232px;padding:0;background:none;border:0;box-shadow:none}
.hd.touch .hd-btn{position:absolute;width:54px;height:54px;border-radius:50%}
.hd.touch .hd-btn.big{width:80px;height:80px;right:0;bottom:0}
.hd.touch .hd-a-skill1{right:109px;bottom:13px}
.hd.touch .hd-a-skill2{right:81px;bottom:81px}
.hd.touch .hd-a-skill3{right:13px;bottom:109px}
.hd.touch .hd-a-ultimate{right:67px;bottom:149px;width:60px;height:60px}
.hd.touch .hd-a-dodge{right:144px;bottom:68px;width:48px;height:48px}
.hd.touch .hd-pot{right:8px;bottom:170px;width:40px;height:40px}
.hd.touch .hd-key{display:none}
.hd.touch .hd-cost{left:0;right:0;bottom:5px;text-align:center}
.hd-btn.ult{border-color:#f0cf86;box-shadow:inset 0 0 0 1px rgba(255,225,160,.35),0 0 10px rgba(255,190,90,.25)}
/* ---------- PvP: botão sob o retrato, barra de canalização e avisos ---------- */
.hd-pvp{position:absolute;left:max(12px,env(safe-area-inset-left));top:calc(max(12px,env(safe-area-inset-top)) + 78px);pointer-events:auto;display:flex;align-items:center;gap:6px;
  height:30px;padding:0 12px 0 8px;border-radius:10px;cursor:pointer;color:#e9c98a;font:700 11px/1 "Cinzel",Georgia,serif;letter-spacing:.16em;text-transform:uppercase;
  background:linear-gradient(180deg,#22304a,#0d1522);border:2px solid var(--gold-d);box-shadow:inset 0 0 0 1px rgba(255,225,160,.2),0 2px 6px rgba(0,0,0,.6);
  touch-action:manipulation;-webkit-tap-highlight-color:transparent;user-select:none;transition:border-color .15s,box-shadow .15s,color .15s}
.hd-pvp:hover{border-color:#f0cf86}
.hd-pvp:active{transform:scale(.96)}
.hd-pvp:focus-visible{outline:2px solid #ffd9a0;outline-offset:2px}
.hd-pvp.chan{color:#ffd9a0;border-color:#f0cf86;animation:hd-pvpc 1s ease-in-out infinite}
.hd-pvp.on{color:#ffb0a0;border-color:#c0392b;background:linear-gradient(180deg,#4a1a1a,#1a0b0b);box-shadow:inset 0 0 0 1px rgba(255,150,130,.3),0 0 14px rgba(220,60,40,.45)}
@keyframes hd-pvpc{50%{box-shadow:inset 0 0 0 1px rgba(255,225,160,.3),0 0 14px rgba(255,200,110,.55)}}
.hd-chan{position:absolute;left:50%;bottom:calc(max(10px,env(safe-area-inset-bottom)) + 100px);transform:translateX(-50%);width:min(260px,60vw);display:none;flex-direction:column;gap:4px;align-items:center;pointer-events:none}
.hd-chan.on{display:flex}
.hd.touch .hd-chan{bottom:calc(max(10px,env(safe-area-inset-bottom)) + 250px);left:calc(50% - 40px)}
.hd-chan-t{font:700 11px/1 "Cinzel",Georgia,serif;letter-spacing:.14em;text-transform:uppercase;color:#f0dfb8;text-shadow:0 1px 3px #000,0 0 6px #000}
.hd-chan .hd-track{flex:none;width:100%;height:12px}
.hd-chan-f{position:absolute;inset:0;transform-origin:left;transform:scaleX(0);background:linear-gradient(180deg,#e9c98a,#8d6a2a)}
.hd-chan.out .hd-chan-f{background:linear-gradient(180deg,#9fb4cf,#46618a)}
.hd-alert{position:absolute;left:50%;top:calc(max(12px,env(safe-area-inset-top)) + 118px);transform:translateX(-50%);padding:8px 16px;border-radius:10px;max-width:88vw;text-align:center;pointer-events:none;opacity:0;transition:opacity .25s;
  font:700 12px/1 "Cinzel",Georgia,serif;letter-spacing:.16em;text-transform:uppercase;color:#ffb0a0;background:linear-gradient(180deg,#3a1414,#160808);border:2px solid #c0392b;box-shadow:0 6px 16px rgba(0,0,0,.6)}
.hd-alert.on{opacity:1}
.hd.pvp .hd-pwrap{filter:drop-shadow(0 0 7px rgba(235,70,50,.9))}
@media (max-width:820px){
  .hd-bar{gap:10px}.hd-btn{width:48px;height:48px}.hd-btn.big{width:56px;height:56px}.hd-sn{font-size:7px}
  .hd-pwrap{width:60px;height:60px}.hd-track{height:16px}
}
`;

export function mountHud(opts: HudOptions): Hud {
  const style = document.createElement("style");
  style.textContent = CSS;
  document.head.append(style);

  const cdef = CLASS_DEFS[opts.cls];
  const res: ResourceDef = cdef.resource;
  const resColor = hex(res.color);

  const root = document.createElement("div");
  root.className = "hd";
  root.innerHTML = `
    <div class="hd-unit">
      <div class="hd-pwrap t0"><div class="hd-frame hd-portrait"><canvas width="48" height="48"></canvas><span class="hd-ini"></span></div><i class="hd-riv"></i><i class="hd-riv"></i><i class="hd-riv"></i><i class="hd-riv"></i><i class="hd-gem"></i><span class="hd-lvb">1</span></div>
      <div class="hd-bars">
        <div class="hd-name"><span class="hd-nm"></span><small>${cdef.name}</small></div>
        <div class="hd-meter hd-tr"><span class="ic" style="color:var(--tc)">${ICON.crown}</span><div class="hd-track"><div class="hd-fill"></div><div class="hd-txt hd-tr-t"></div></div></div>
        <div class="hd-meter hd-rs"><span class="ic" style="color:${resColor}">${ICON[res.icon] ?? ""}</span><div class="hd-track"><div class="hd-fill" style="background:linear-gradient(180deg,${resColor},color-mix(in srgb,${resColor} 45%,#000))"></div><div class="hd-txt hd-rs-t"></div></div></div>
        <div class="hd-buff">Grito ativo</div>
      </div>
    </div>
    <button type="button" class="hd-pvp" aria-label="Modo PvP"><span class="ic"></span><span class="hd-pvp-t">PvP</span></button>
    <div class="hd-chan"><div class="hd-chan-t"></div><div class="hd-track"><div class="hd-chan-f"></div></div></div>
    <div class="hd-alert" role="status"></div>
    <div class="hd-bar"></div>
    <div class="hd-lv">NV 1</div>
    <div class="hd-xp"><i></i></div>`;
  document.body.append(root);

  const dead = document.createElement("div");
  dead.className = "hd-dead";
  dead.innerHTML = `<h2>Você caiu</h2><p></p>`;
  document.body.append(dead);

  const q = <T extends HTMLElement>(s: string) => root.querySelector<T>(s)!;
  const nm = q(".hd-nm");
  nm.textContent = opts.name ?? "";
  const portrait = q(".hd-portrait");
  const pCanvas = q<HTMLCanvasElement>(".hd-portrait canvas");
  q(".hd-ini").textContent = (opts.name ?? cdef.name).slice(0, 1).toUpperCase();
  const pwrap = q(".hd-pwrap");
  const lvb = q(".hd-lvb");
  const trFill = q(".hd-tr .hd-fill");
  const trTxt = q(".hd-tr-t");
  const rsFill = q(".hd-rs .hd-fill");
  const rsTxt = q(".hd-rs-t");
  const buff = q(".hd-buff");
  const lvTxt = q(".hd-lv");
  const xpFill = q(".hd-xp i");
  const bar = q(".hd-bar");
  const pvpBtn = q<HTMLButtonElement>(".hd-pvp");
  pvpBtn.querySelector(".ic")!.innerHTML = ICON.swords;
  const pvpTxt = q(".hd-pvp-t");
  const chanBox = q(".hd-chan");
  const chanTxt = q(".hd-chan-t");
  const chanFill = q(".hd-chan-f");
  const alertEl = q(".hd-alert");
  let pvpOn = false, pvpChan = 0, chanStart = 0, alertTimer: ReturnType<typeof setTimeout> | undefined;
  // um clique: se está no modo (ou saindo), pede para sair; senão pede para entrar. Durante a canalização, o clique pede o contrário e cancela.
  pvpBtn.addEventListener("pointerdown", (e) => {
    e.preventDefault();
    opts.onPvp?.(pvpChan === 1 ? false : pvpChan === 2 ? true : !pvpOn);
  });
  const deadSub = dead.querySelector("p")!;

  const defs = cdef.actions;
  const cdUntil: Partial<Record<ActionId, number>> = {};
  const els = new Map<ActionId, { btn: HTMLElement; cd: HTMLElement; n: HTMLElement }>();
  let curRes = Infinity;

  // ordem visual: esquiva, skills, ataque (maior) à direita
  const order: ActionId[] = ["dodge", "skill1", "skill2", "skill3", "ultimate", "attack"];
  for (const a of order) {
    const def = defs[a];
    const cost = def.cost ?? 0;
    const b = document.createElement("button");
    b.type = "button";
    b.className = `hd-btn hd-a-${a}` + (a === "attack" ? " big" : "") + (a === "ultimate" ? " ult" : "");
    b.setAttribute("aria-label", `${def.name} (${def.key})${cost ? `, custa ${cost} de ${res.name}` : ""}`);
    b.innerHTML = `<span class="hd-key">${def.key}</span><span class="hd-sn">${def.name}</span>${cost ? `<span class="hd-cost" style="color:${resColor}">${cost}</span>` : ""}<span class="hd-cd"></span><span class="hd-cdn"></span>`;
    // pointerdown: resposta imediata no toque, sem esperar o "click"
    b.addEventListener("pointerdown", (e) => {
      e.preventDefault();
      trigger(a);
    });
    bar.append(b);
    els.set(a, { btn: b, cd: b.querySelector(".hd-cd")!, n: b.querySelector(".hd-cdn")! });
  }

  if (opts.onPotion) {
    const pb = document.createElement("button");
    pb.type = "button";
    pb.className = "hd-btn hd-pot";
    pb.setAttribute("aria-label", "Beber poção (F)");
    pb.innerHTML = `<span class="hd-key">F</span><span class="hd-sn">Poção</span>`;
    pb.addEventListener("pointerdown", (e) => { e.preventDefault(); opts.onPotion!(); });
    bar.append(pb);
  }

  function trigger(a: ActionId) {
    const now = performance.now();
    if (now < (cdUntil[a] ?? 0)) return;
    // sem recurso o servidor recusa (e avisa): não gastamos a recarga aqui para a tecla não "travar"
    if (curRes < (defs[a].cost ?? 0)) {
      opts.onAction(a);
      return;
    }
    cdUntil[a] = now + defs[a].cd * 1000;
    opts.onAction(a);
  }

  const tick = () => {
    requestAnimationFrame(tick);
    const now = performance.now();
    if (pvpChan) {
      const spent = Math.min(PVP_CHANNEL_S, (now - chanStart) / 1000);
      chanFill.style.transform = `scaleX(${spent / PVP_CHANNEL_S})`;
      chanTxt.textContent = `${pvpChan === 1 ? "Entrando em PvP" : "Saindo do PvP"} · ${Math.max(0, PVP_CHANNEL_S - spent).toFixed(1)} s`;
    }
    for (const [a, e] of els) {
      const left = (cdUntil[a] ?? 0) - now;
      const total = defs[a].cd * 1000;
      if (left > 0) {
        e.btn.classList.add("cool");
        e.cd.style.height = `${Math.min(100, (left / total) * 100)}%`;
        e.n.textContent = left > 950 ? String(Math.ceil(left / 1000)) : (left / 1000).toFixed(1);
      } else if (e.btn.classList.contains("cool")) {
        e.btn.classList.remove("cool");
        e.cd.style.height = "0";
        e.btn.classList.remove("ready-pulse");
        void e.btn.offsetWidth; // reinicia a animação
        e.btn.classList.add("ready-pulse");
      }
    }
  };
  requestAnimationFrame(tick);

  return {
    trigger,
    setHp() {
      /* a vida agora fica só na placa sobre a cabeça (plate.ts): sem barra repetida aqui */
    },
    setMana(cur, max) {
      curRes = cur;
      rsFill.style.transform = `scaleX(${max > 0 ? Math.max(0, Math.min(1, cur / max)) : 0})`;
      rsTxt.textContent = `${Math.floor(cur)} / ${max}`;
      for (const [a, e] of els) e.btn.classList.toggle("low", cur < (defs[a].cost ?? 0));
    },
    setProgress(level, xp, need) {
      const tier = levelTier(level);
      pwrap.className = `hd-pwrap t${tier}`; // a moldura do retrato (cor, rebites, gema, brilho) acompanha a faixa de nível
      lvb.textContent = String(level);
      // barra da faixa: quanto falta para a próxima borda (o incentivo para continuar subindo)
      const start = tier === 0 ? 1 : tier * 10;
      const next = (tier + 1) * 10;
      const rr = need > 0 ? Math.min(1, xp / need) : 1;
      if (tier >= 5) { trFill.style.transform = "scaleX(1)"; trTxt.textContent = `${TIER_NAMES[tier]} · máx`; }
      else { trFill.style.transform = `scaleX(${Math.min(1, (level - start + rr) / (next - start))})`; trTxt.textContent = `${TIER_NAMES[tier]} · ${level} / ${next}`; }
      const r = need > 0 ? Math.min(1, xp / need) : 1;
      lvTxt.textContent = need > 0 ? `NV ${level}  ·  ${Math.floor(xp)} / ${need}` : `NV ${level}  ·  MÁX`;
      xpFill.style.transform = `scaleX(${r})`;
    },
    setPortrait(source, crop) {
      const ctx = pCanvas.getContext("2d");
      if (!ctx || !source) return;
      ctx.imageSmoothingEnabled = false;
      ctx.clearRect(0, 0, pCanvas.width, pCanvas.height);
      if (crop) ctx.drawImage(source, crop.x, crop.y, crop.w, crop.h, 0, 0, pCanvas.width, pCanvas.height);
      else ctx.drawImage(source, 0, 0, pCanvas.width, pCanvas.height);
      portrait.classList.add("has");
    },
    setDead(secondsLeft) {
      dead.classList.toggle("on", secondsLeft !== null);
      if (secondsLeft !== null) deadSub.textContent = `Renascendo em ${Math.max(0, Math.ceil(secondsLeft))}`;
    },
    setTouch(on) {
      root.classList.toggle("touch", on);
    },
    setPvp(on, chan) {
      if (chan !== 0 && pvpChan === 0) chanStart = performance.now(); // a contagem começa quando o servidor inicia a canalização
      pvpOn = on;
      pvpChan = chan;
      root.classList.toggle("pvp", on);
      pvpBtn.classList.toggle("on", on && chan === 0);
      pvpBtn.classList.toggle("chan", chan !== 0);
      pvpTxt.textContent = chan === 1 ? "Entrando…" : chan === 2 ? "Saindo…" : on ? "PvP ativo" : "PvP";
      pvpBtn.setAttribute("aria-pressed", String(on));
      chanBox.classList.toggle("on", chan !== 0);
      chanBox.classList.toggle("out", chan === 2);
    },
    alert(text) {
      alertEl.textContent = text;
      alertEl.classList.add("on");
      clearTimeout(alertTimer);
      alertTimer = setTimeout(() => alertEl.classList.remove("on"), 2600);
    },
    setBuff(on, label = "Grito ativo") {
      if (on) buff.textContent = label;
      buff.classList.toggle("on", on);
    },
  };
}
