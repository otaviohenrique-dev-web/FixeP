import { LEVEL_TIER_COLORS, LEVEL_TIER_TITLES, levelTier, CLASS_DEFS, PVP_CHANNEL_S, POTION_COOLDOWN_S, AUTO_POT_MAX, AUTO_POT_STEP, ITEMS, skillTooltip, type ActiveBuff, type SkillTooltipData, type ActionDef, type ActionId, type CharClass, type ResourceDef } from "@frixep/shared";

import { skillImage, skillCategory } from "./skill-art";
import { mountBuffs, type BuffStrip } from "./buffs";

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
  /** toque segurado numa habilidade: prévia de área; arrastar move a mira; soltar lança (o cliente decide o que mira) */
  aim?: { start(a: ActionId, x: number, y: number): void; move(x: number, y: number): void; end(): void };
  /** prioridade do alvo sem foco (botões < e > ao lado do ataque básico) e quando o jogador troca */
  targetMode?: "low" | "near";
  onTargetMode?(m: "low" | "near"): void;
  onNextTarget?(): void;
  /** botão de poção (no celular, onde não há tecla) */
  onPotion?(): void;
  /** o jogador escolheu o limiar da auto-poção (0 = desligada) ao soltar o controle "Auto" */
  onAutoPotion?(at: number): void;
  /** botão PvP: `true` pede para entrar, `false` para sair (o servidor canaliza e decide) */
  onPvp?(on: boolean): void;
  /** Clérigo: pede a troca do Q (0 = cura em área, 1 = cura focada); o servidor só aceita fora de combate */
  onQMode?(mode: 0 | 1): void;
}
export interface Hud {
  trigger(a: ActionId): void;
  /** o servidor não executou a ação: devolve a recarga que o botão mostrou */
  clearCd(a: ActionId): void;
  /** barra de vida vermelha (com a sombra que desce devagar ao levar dano) e os números "67/170" */
  setHp(hp: number, max: number): void;
  /** bolha de chegada: segundos restantes (-1 = protegido durante o carregamento, sem contagem; null = sem bolha) */
  setShield(secondsLeft: number | null): void;
  setMana(cur: number, max: number): void;
  setProgress(level: number, xp: number, need: number): void;
  /** desenha o retrato; `null` mantém o retrato provisório (inicial do nome) */
  setPortrait(source: CanvasImageSource | null, crop?: { x: number; y: number; w: number; h: number }): void;
  setDead(secondsLeft: number | null, place?: string): void;
  setBuff(on: boolean, label?: string): void;
  /** buffs próprios vindos do servidor (Evt.Buffs): fileira de ícones com tempo restante e acúmulos */
  setBuffs(list: ActiveBuff[]): void;
  /** liga o layout de toque: botões no canto direito, ao alcance do polegar */
  setTouch(on: boolean): void;
  /** estado do PvP vindo do servidor: `on` = está no modo; `chan` 0 nenhuma, 1 entrando, 2 saindo */
  setPvp(on: boolean, chan: number): void;
  /** quantidade de poções na bolsa (slot da poção); uma queda no estoque inicia a recarga local */
  setPotion(count: number): void;
  /** a poção não está em recarga? */
  potionReady(): boolean;
  /** mostra o limiar da auto-poção vindo do servidor (botão "Auto"; 0 = desligada) */
  setAutoPotion(at: number): void;
  /** aviso curto em destaque no alto da tela (ex.: "Canalização interrompida") */
  alert(text: string): void;
  /** Q ativo do Clérigo (vindo do servidor): troca nome, custo, recarga e ícone do botão */
  setQMode(mode: 0 | 1): void;
  /** alterna o Q do Clérigo (tecla Z ou botão ⇄) */
  toggleQ(): void;
}

const ICON: Record<string, string> = {
  crown: `<svg viewBox="0 0 16 16" width="14" height="14" shape-rendering="crispEdges"><path fill="currentColor" d="M1 5h2v2h1V4h2V3h1V2h2v1h1v1h2v3h1V5h2v7H1z"/><path fill="#fff" opacity=".4" d="M2 6h1v5H2zM7 3h2v1H7z"/></svg>`,
  heart: `<svg viewBox="0 0 16 16" width="14" height="14" shape-rendering="crispEdges"><path fill="currentColor" d="M2 3h4v1h1v1h2V4h1V3h4v1h1v4h-1v1h-1v1h-1v1h-1v1H9v1H7v-1H6v-1H5v-1H4V9H3V8H2z"/><path fill="#fff" opacity=".45" d="M3 4h2v1H3z"/></svg>`,
  flame: `<svg viewBox="0 0 16 16" width="14" height="14" shape-rendering="crispEdges"><path fill="currentColor" d="M8 1h1v2h1v2h1v1h1v3h1v3h-1v2h-2v1H6v-1H4v-2H3V9h1V7h1V6h1V3h1z"/><path fill="#fff" opacity=".55" d="M8 8h1v1h1v3H8v1H7v-2h1z"/></svg>`,
  eye: `<svg viewBox="0 0 16 16" width="14" height="14" shape-rendering="crispEdges"><path fill="currentColor" d="M5 5h6v1h2v1h2v2h-2v1h-2v1H5v-1H3V9H1V7h2V6h2z"/><path fill="#0b1018" d="M7 6h2v4H7z"/><path fill="#fff" opacity=".6" d="M7 6h1v1H7z"/></svg>`,
  swords: `<svg viewBox="0 0 16 16" width="14" height="14" shape-rendering="crispEdges"><path fill="currentColor" d="M2 2h3l1 1 1 1 1 1 1 1-1 1-1-1-1-1-1-1-1-1H2zM14 2h-3l-1 1-1 1-1 1-1 1 1 1 1-1 1-1 1-1 1-1h3zM3 12l2-2 1 1-2 2zm10 0l-2-2-1 1 2 2zM7 8l1 1 1-1-1-1z"/><path fill="currentColor" d="M2 13h2v1H2zm10 0h2v1h-2z"/></svg>`,
  // frasco de vidro em pixel art (grade 16x16): rolha, gargalo, vidro escuro e líquido vermelho com brilho
  potion: `<svg viewBox="0 0 16 16" width="20" height="20" shape-rendering="crispEdges" aria-hidden="true"><rect x="6" y="0" width="4" height="2" fill="#9a6a34"/><rect x="6" y="1" width="4" height="1" fill="#5e3a1a"/><rect x="5" y="2" width="6" height="1" fill="#cfe3ef"/><rect x="5" y="3" width="1" height="2" fill="#cfe3ef"/><rect x="10" y="3" width="1" height="2" fill="#cfe3ef"/><rect x="6" y="3" width="4" height="2" fill="#2b3d52"/><rect x="4" y="5" width="1" height="1" fill="#cfe3ef"/><rect x="11" y="5" width="1" height="1" fill="#cfe3ef"/><rect x="5" y="5" width="6" height="1" fill="#2b3d52"/><rect x="3" y="6" width="1" height="7" fill="#cfe3ef"/><rect x="12" y="6" width="1" height="7" fill="#cfe3ef"/><rect x="4" y="6" width="8" height="2" fill="#2b3d52"/><rect x="5" y="6" width="1" height="1" fill="#9fb8cc"/><rect x="4" y="8" width="8" height="5" fill="#ff3b3b"/><rect x="4" y="8" width="8" height="1" fill="#ff8a8a"/><rect x="5" y="10" width="1" height="2" fill="#ffc2c2"/><rect x="4" y="13" width="8" height="1" fill="#b3161b"/><rect x="4" y="14" width="8" height="1" fill="#cfe3ef"/></svg>`,
  drop: `<svg viewBox="0 0 16 16" width="14" height="14" shape-rendering="crispEdges"><path fill="currentColor" d="M7 1h2v2h1v2h1v2h1v4h-1v2h-1v1H6v-1H5v-2H4V7h1V5h1V3h1z"/><path fill="#fff" opacity=".55" d="M6 8h1v3H6z"/></svg>`,
  // ícones das habilidades
  charge: `<svg viewBox="0 0 16 16" width="16" height="16" shape-rendering="crispEdges"><path fill="currentColor" d="M1 3h3l4 5-4 5H1l4-5zM8 3h3l4 5-4 5H8l4-5z"/></svg>`,
  chains: `<svg viewBox="0 0 16 16" width="16" height="16" shape-rendering="crispEdges"><path fill="currentColor" d="M1 5h7v1H2v4h6v1H1zM8 5h7v6H8v-1h6V6H8zM6 7h4v2H6z"/></svg>`,
  shield: `<svg viewBox="0 0 16 16" width="16" height="16" shape-rendering="crispEdges"><path fill="currentColor" d="M2 2h12v7h-1v2h-2v2H9v1H7v-1H5v-2H3V9H2z"/><path fill="#fff" opacity=".5" d="M4 4h3v5H4z"/><path fill="#0b1018" opacity=".5" d="M8 4h1v8H8z"/></svg>`,
  hammer: `<svg viewBox="0 0 16 16" width="16" height="16" shape-rendering="crispEdges"><path fill="currentColor" d="M7 0h2v2H7zM7 2h2v2H7zM3 4h10v2H3zM6 6h4v6H6zM7 12h2v3H7z"/><path fill="#fff" opacity=".55" d="M7 6h1v5H7z"/></svg>`,
  healAoe: `<svg viewBox="0 0 16 16" width="16" height="16" shape-rendering="crispEdges"><path fill="currentColor" d="M7 4h2v3h3v2H9v3H7V9H4V7h3zM1 1h2v1H1zM13 1h2v1h-2zM1 14h2v1H1zM13 14h2v1h-2z"/></svg>`,
  healFocus: `<svg viewBox="0 0 16 16" width="16" height="16" shape-rendering="crispEdges"><path fill="currentColor" d="M7 0h2v3H7zM7 13h2v3H7zM0 7h3v2H0zM13 7h3v2h-3zM7 5h2v2h2v2H9v2H7V9H5V7h2z"/></svg>`,
};

const TIER_VARS = [["#9a8460", "#dccfb0"], ["#c9d3df", "#f4f8ff"], ["#f0c34a", "#fff0b8"], ["#4cc3ee", "#d4f4ff"], ["#b575f5", "#ecd7ff"], ["#ff6a3d", "#ffd9b8"]]; // as mesmas cores das molduras (.hd-pwrap.tN)
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
/* vida: vermelha, no padrão clássico de RPG (a mesma cor da placa do jogador); a sombra clara é o dano recém-levado, que desce mais devagar */
.hd-hp .hd-track{height:20px;border-color:#6b1d24;background:#12060a}
.hd-hp .hd-hpf{background:linear-gradient(180deg,#ff6b74 0%,#e5202e 46%,#9d1220 100%);transition:transform .22s cubic-bezier(.2,.8,.2,1)}
.hd-hp .hd-hlag{position:absolute;inset:0;transform-origin:left;transform:scaleX(1);background:linear-gradient(180deg,#ffd9a8,#e59a62);opacity:.9;transition:transform .8s ease-out .3s}
.hd-hp .hd-txt{font-size:11px;letter-spacing:.05em;color:#fff4f2}
.hd-hp.low .hd-track{animation:hd-hplow 1s ease-in-out infinite}
@keyframes hd-hplow{0%,100%{box-shadow:inset 0 2px 4px rgba(0,0,0,.7),0 0 0 rgba(255,40,50,0)}50%{box-shadow:inset 0 2px 4px rgba(0,0,0,.7),0 0 10px rgba(255,40,50,.7)}}
@media (prefers-reduced-motion:reduce){.hd-hp.low .hd-track{animation:none;box-shadow:inset 0 2px 4px rgba(0,0,0,.7),0 0 8px rgba(255,40,50,.6)}}
/* faixa de nível: linha fina de XP com texto pequeno, sem competir com a vida */
.hd-tr{flex-direction:column;align-items:stretch;gap:2px;margin-top:-1px} /* o nome da zona fica numa linha própria, abaixo da barra de XP (não passa por cima dela) */
.hd-tr .hd-thin{flex:none}
.hd-thin{position:relative;flex:1;height:4px;border-radius:2px;overflow:hidden;background:rgba(0,0,0,.6);box-shadow:0 0 0 1px rgba(122,95,46,.55)}
.hd-thin .hd-fill{background:linear-gradient(90deg,var(--tc),var(--tl))}
.hd-tt{flex:none;font:700 8px/1 "Cinzel",Georgia,serif;letter-spacing:.1em;text-transform:uppercase;color:var(--tl);opacity:.85;text-shadow:0 1px 2px #000;white-space:nowrap}
.hd-shd{margin-top:1px;font:700 9px/1 "Cinzel",Georgia,serif;letter-spacing:.2em;text-transform:uppercase;color:#bfe6ff;text-shadow:0 0 10px rgba(120,190,255,.7);opacity:0;transition:opacity .25s}
.hd-shd.on{opacity:1}
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
.hd-btn.hasic{place-items:end center}
.hd-btn.hasic .hd-sn{padding-bottom:4px}
.hd-btn.hasic .hd-cost,.hd.touch .hd-btn.hasic .hd-cost{top:2px;bottom:auto;left:auto;right:3px;text-align:right}
.hd-ic{position:absolute;left:50%;top:11px;margin-left:-8px;pointer-events:none;color:#ffe3a8;filter:drop-shadow(0 1px 2px #000)}
.hd-art{position:absolute;inset:0;pointer-events:none;display:none}
.hd-art img{width:100%;height:100%;display:block;object-fit:cover}
.hd-btn.cat-dano{border-color:#ffd86b;box-shadow:inset 0 0 0 1px rgba(255,216,107,.35),0 2px 6px rgba(0,0,0,.6)}
.hd-btn.cat-cura{border-color:#9ad66b;box-shadow:inset 0 0 0 1px rgba(154,214,107,.35),0 2px 6px rgba(0,0,0,.6)}
.hd-btn.cat-controle{border-color:#8fd8ff;box-shadow:inset 0 0 0 1px rgba(143,216,255,.35),0 2px 6px rgba(0,0,0,.6)}
.hd-btn.hasart .hd-art{display:block}
.hd-btn.hasart .hd-sn{display:none}
.hd-btn.hasart .hd-key{z-index:2;background:rgba(0,0,0,.8)}
.hd-btn.hasart .hd-cost{z-index:2;background:rgba(0,0,0,.7);border-radius:3px;padding:0 2px}
.hd-qs{position:absolute;left:2px;top:17px;z-index:3;width:18px;height:14px;display:grid;place-items:center;border-radius:4px;background:rgba(0,0,0,.7);border:1px solid var(--gold-d);color:#ffd9a0;font:700 9px/1 "Cinzel",Georgia,serif;cursor:pointer}
.hd-qs:hover{border-color:#f0cf86;color:#fff}
.hd.touch .hd-qs{width:22px;height:18px;left:50%;margin-left:-11px;top:-1px}
.hd-tip{position:fixed;z-index:60;left:0;top:0;width:min(250px,calc(100vw - 16px));box-sizing:border-box;padding:9px 11px;border-radius:8px;background:linear-gradient(#141b2a,#0b1018);border:1px solid #b89458;box-shadow:0 6px 22px rgba(0,0,0,.7),inset 0 0 0 1px rgba(255,225,160,.12);color:#dfe8f2;font:12px/1.35 Georgia,serif;pointer-events:none;opacity:0;visibility:hidden;transition:opacity .12s}
.hd-tip.on{opacity:1;visibility:visible}
.hd-tip-h{display:flex;justify-content:space-between;align-items:center;gap:8px;font:700 14px/1.2 "Cinzel",Georgia,serif;color:#ffd9a0}
.hd-tip-k{font-size:10px;padding:1px 6px;border-radius:4px;background:rgba(0,0,0,.6);border:1px solid #6b5636}
.hd-tip-t{font-size:10px;letter-spacing:.08em;text-transform:uppercase;color:#e0742a;margin:2px 0 5px}
.hd-tip p{margin:0 0 5px}.hd-tip ul{margin:0 0 5px;padding:0;list-style:none}.hd-tip li{padding:1px 0;color:#bcd0e4}
.hd-tip .hd-tip-d{color:#9fd6a8;margin:6px 0 0;font-style:italic}
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
.hd-pot{margin-left:14px;border-color:#5f9a6a}
.hd-auto{margin-left:6px;width:44px;font-size:10px;color:#9fb3c8;border-color:#4a5a6a}
.hd-auto .hd-sn{position:static;font-size:10px;letter-spacing:.04em}
.hd-aval{display:none;font:700 9px/1 "Cinzel",Georgia,serif;color:#7dff9a;pointer-events:none}
.hd-auto.on .hd-aval{display:block}
.hd-auto.on{color:#7dff9a;border-color:#7dff9a;box-shadow:0 0 8px rgba(125,255,154,.55)}
.hd-apop{position:absolute;right:0;bottom:calc(100% + 12px);width:210px;padding:10px 12px;box-sizing:border-box;display:none;pointer-events:auto;z-index:5;border:1px solid #c9a34a;border-radius:8px;background:rgba(10,16,26,.96);box-shadow:0 6px 18px rgba(0,0,0,.6);font:700 11px/1.2 "Cinzel",Georgia,serif;color:#f1e3c2}
.hd-apop.open{display:block}
.hd-apop-t{display:flex;justify-content:space-between;align-items:baseline;gap:8px;margin-bottom:8px}
.hd-apop-v{color:#7dff9a;font-weight:700;white-space:nowrap}
.hd-apop-r{display:block;width:100%;margin:0;accent-color:#7dff9a}
.hd-apop-s{display:flex;justify-content:space-between;margin-top:4px;font:600 9px/1 system-ui,sans-serif;color:#9fb3c8}
.hd-pot svg{position:absolute;left:50%;top:9px;margin-left:-10px;pointer-events:none}
.hd-pot .hd-key{opacity:.7;left:3px;top:3px;background:rgba(0,0,0,.55)}
.hd-pot .hd-sn{position:absolute;left:0;right:0;bottom:3px;font-size:7px}
.hd-qty{position:absolute;right:3px;top:3px;min-width:14px;padding:2px 3px;box-sizing:border-box;border-radius:4px;background:rgba(0,0,0,.72);text-align:center;font:900 11px/1 "Cinzel",Georgia,serif;color:#c8ffd2;pointer-events:none}
.hd-pot.empty{filter:saturate(.3) brightness(.65)}
.hd-pot.empty .hd-qty{color:#ff7b6b}
.hd.touch .hd-bar{left:auto;right:max(10px,env(safe-area-inset-right));bottom:calc(max(10px,env(safe-area-inset-bottom)) + 14px);transform:none;display:block;width:224px;height:232px;padding:0;background:none;border:0;box-shadow:none}
.hd.touch .hd-btn{position:absolute;width:54px;height:54px;border-radius:50%}
.hd.touch .hd-btn.big{width:80px;height:80px;right:0;bottom:0}
.hd-tm{display:none;position:absolute;width:30px;height:30px;padding:0;border-radius:50%;place-items:center;cursor:pointer;font:700 15px/1 "Cinzel",Georgia,serif;color:#f0dfb8;background:rgba(12,18,28,.85);border:2px solid #7a5f2e;opacity:.55;touch-action:manipulation;-webkit-tap-highlight-color:transparent;z-index:3}
.hd.touch .hd-tm{display:grid}
.hd-tm.on{opacity:1;border-color:#f0cf86;box-shadow:0 0 0 2px rgba(255,225,160,.35)}
.hd.touch .hd-tm-low{right:200px;bottom:10px}
.hd.touch .hd-tm-near{right:200px;bottom:52px}
.hd.touch .hd-tm-next{right:200px;bottom:94px}
.hd-cancel{display:none;position:fixed;right:max(26px,env(safe-area-inset-right));top:30%;width:58px;height:58px;border-radius:50%;place-items:center;font:700 26px/1 Georgia,serif;color:#ffd9d3;background:rgba(40,10,12,.72);border:3px solid #c25a4e;pointer-events:none;z-index:60}
.hd-cancel.on{display:grid}
.hd-cancel.hot{background:rgba(190,40,30,.9);color:#fff;border-color:#ffb0a4;transform:scale(1.15)}
.hd-tm svg{width:17px;height:17px;display:block;fill:none;stroke:currentColor;stroke-width:1.8;stroke-linecap:round;stroke-linejoin:round}
.hd.touch .hd-a-skill1{right:109px;bottom:13px}
.hd.touch .hd-a-skill2{right:81px;bottom:81px}
.hd.touch .hd-a-skill3{right:13px;bottom:109px}
.hd.touch .hd-a-ultimate{right:67px;bottom:149px;width:60px;height:60px}
.hd.touch .hd-a-dodge{right:144px;bottom:68px;width:48px;height:48px}
.hd.touch .hd-pot{right:4px;bottom:166px;width:46px;height:46px;margin:0}
.hd.touch .hd-pot .hd-sn{display:none}
.hd.touch .hd-key{display:none}
.hd.touch .hd-pot svg{top:9px}
.hd.touch .hd-cost{left:0;right:0;bottom:5px;text-align:center}
.hd-btn.ult{border-color:#f0cf86;box-shadow:inset 0 0 0 1px rgba(255,225,160,.35),0 0 10px rgba(255,190,90,.25)}
/* ---------- PvP: botão sob o retrato, barra de canalização e avisos ---------- */
.hd-pvp{position:absolute;left:max(12px,env(safe-area-inset-left));top:calc(max(12px,env(safe-area-inset-top)) + 124px);pointer-events:auto;display:flex;align-items:center;gap:6px;
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
/* ---------- limpeza: habilidades só com ícone e recarga (o nome aparece na dica) ---------- */
.hd-sn,.hd-cost{display:none}
.hd-auto .hd-sn{display:block;position:static;font-size:10px;letter-spacing:.04em}
.hd-ic{top:50%;left:50%;margin-left:0;transform:translate(-50%,-50%)}
.hd-ic svg{width:26px;height:26px}
.hd-lv{display:none}
.hd.touch .hd-ic svg{width:28px;height:28px}
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
        <div class="hd-meter hd-hp"><span class="ic" style="color:#ff5a64">${ICON.heart}</span><div class="hd-track"><div class="hd-hlag"></div><div class="hd-fill hd-hpf" style="transform:scaleX(0)"></div><div class="hd-txt hd-hp-t">—</div></div></div>
        <div class="hd-meter hd-tr"><div class="hd-thin"><div class="hd-fill"></div></div><span class="hd-tt"></span></div>
        <div class="hd-meter hd-rs"><span class="ic" style="color:${resColor}">${ICON[res.icon] ?? ""}</span><div class="hd-track"><div class="hd-fill" style="background:linear-gradient(180deg,${resColor},color-mix(in srgb,${resColor} 45%,#000))"></div><div class="hd-txt hd-rs-t"></div></div></div>
        <div class="hd-buffs"></div>
        <div class="hd-buff">Escudo ativo</div>
        <div class="hd-shd"></div>
      </div>
    </div>
    <button type="button" class="hd-pvp" aria-label="Modo PvP"><span class="ic"></span><span class="hd-pvp-t">PvP</span></button>
    <div class="hd-chan"><div class="hd-chan-t"></div><div class="hd-track"><div class="hd-chan-f"></div></div></div>
    <div class="hd-alert" role="status"></div>
    <div class="hd-bar"></div>
    <div class="hd-lv">NV 1</div>
    <div class="hd-xp"><i></i></div>`;
  document.body.append(root);
  const cancelEl = document.createElement("div"); // ✕ no canto: arrastar a skill até aqui e soltar cancela o lançamento
  cancelEl.className = "hd-cancel"; cancelEl.textContent = "✕"; cancelEl.setAttribute("aria-hidden", "true");
  document.body.append(cancelEl);
  const overCancel = (x: number, y: number) => { const r = cancelEl.getBoundingClientRect(); return x >= r.left - 18 && x <= r.right + 18 && y >= r.top - 18 && y <= r.bottom + 18; };

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
  const unit = q(".hd-unit");
  const trFill = q(".hd-tr .hd-fill");
  const trTxt = q(".hd-tt");
  const hpRoot = q(".hd-hp");
  const hpFill = q(".hd-hpf");
  const hpLag = q(".hd-hlag");
  const hpTxt = q(".hd-hp-t");
  const shdEl = q(".hd-shd");
  let hpRatio = -1;
  const rsFill = q(".hd-rs .hd-fill");
  const rsTxt = q(".hd-rs-t");
  const buffStrip = mountBuffs(q(".hd-buffs")); // buffs próprios (ícones com tempo), abaixo das barras
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

  const defs: Record<ActionId, ActionDef> = { ...cdef.actions };
  let qMode: 0 | 1 = 0;
  const cdUntil: Partial<Record<ActionId, number>> = {};
  const els = new Map<ActionId, { btn: HTMLElement; cd: HTMLElement; n: HTMLElement }>();
  let curRes = Infinity;

  // ---- balão de descrição: mouse = passar e esperar; toque = pressionar e segurar (sem disparar)
  const TIP_MS = 400;
  const tipEl = document.createElement("div");
  tipEl.className = "hd-tip";
  tipEl.setAttribute("role", "tooltip");
  document.body.append(tipEl);
  let tipFor: HTMLElement | null = null;
  const esc = (t: string) => t.replace(/[&<>]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" })[c]!);
  function tipHtml(d: SkillTooltipData): string {
    return `<div class="hd-tip-h"><b>${esc(d.name)}</b><span class="hd-tip-k">${esc(d.key)}</span></div><div class="hd-tip-t">${esc(d.type)}</div>` +
      (d.desc ? `<p>${esc(d.desc)}</p>` : "") + `<ul>${d.stats.map((x) => `<li>${esc(x)}</li>`).join("")}</ul>` + (d.tip ? `<p class="hd-tip-d">Dica: ${esc(d.tip)}</p>` : "");
  }
  function showTip(el: HTMLElement, html: string) {
    tipEl.innerHTML = html;
    tipEl.classList.add("on");
    tipFor = el;
    const r = el.getBoundingClientRect(), w = tipEl.offsetWidth, h = tipEl.offsetHeight, m = 8;
    let x = r.left + r.width / 2 - w / 2;
    x = Math.max(m, Math.min(window.innerWidth - w - m, x));
    let y = r.top - h - 10; // por cima do botão
    if (y < m) y = Math.min(window.innerHeight - h - m, r.bottom + 10); // sem espaço: por baixo
    tipEl.style.left = `${x}px`;
    tipEl.style.top = `${y}px`;
  }
  function hideTip() { tipEl.classList.remove("on"); tipFor = null; }
  document.addEventListener("pointerdown", (e) => { if (tipFor && !tipFor.contains(e.target as Node)) hideTip(); }, true);
  window.addEventListener("blur", hideTip);
  function pressable(el: HTMLElement, act: () => void, html: () => string, aimOf?: ActionId) {
    let timer: ReturnType<typeof setTimeout> | undefined;
    let held = false, touching = false, moved = false, sx = 0, sy = 0, lx = 0, ly = 0, pid = -1, inCancel = false; // pid: só o dedo que apertou o botão mexe na mira (o outro dedo é o do joystick)
    const clear = () => { clearTimeout(timer); timer = undefined; };
    el.addEventListener("contextmenu", (e) => e.preventDefault());
    el.addEventListener("pointerenter", (e) => {
      if (e.pointerType !== "mouse") return;
      clear(); timer = setTimeout(() => showTip(el, html()), TIP_MS);
    });
    el.addEventListener("pointerleave", (e) => { if (e.pointerType === "mouse") { clear(); hideTip(); } });
    el.addEventListener("pointerdown", (e) => {
      e.preventDefault();
      if (e.pointerType === "mouse") { clear(); hideTip(); act(); return; }
      touching = true; held = false; moved = false; pid = e.pointerId; inCancel = false; sx = e.clientX; sy = e.clientY; clear();
      if (aimOf) opts.aim?.start(aimOf, e.clientX, e.clientY); // prévia de área aparece já ao apertar
      timer = setTimeout(() => { if (moved) return; held = true; showTip(el, html()); navigator.vibrate?.(8); }, TIP_MS);
    });
    // arrastar com o dedo move a mira (habilidades de área); só vira balão se o dedo ficar parado
    window.addEventListener("pointermove", (e) => {
      if (!touching || e.pointerType === "mouse" || e.pointerId !== pid) return; // ignora o dedo do joystick
      if (!moved && Math.hypot(e.clientX - sx, e.clientY - sy) > 10) { moved = true; clear(); }
      lx = e.clientX; ly = e.clientY;
      if (moved && aimOf) { const hot = inCancel = overCancel(e.clientX, e.clientY); cancelEl.classList.add("on"); cancelEl.classList.toggle("hot", hot); opts.aim?.move(e.clientX, e.clientY); }
    });
    const end = (fire: boolean) => {
      if (!touching) return;
      touching = false; clear(); cancelEl.classList.remove("on", "hot");
      if (held) { hideTip(); held = false; if (aimOf) opts.aim?.end(); return; } // soltar fecha o balão, sem disparar
      // arrastou e soltou em cima do próprio botão: cancela o lançamento
      const r = el.getBoundingClientRect();
      const cancel = !!aimOf && moved && (inCancel || lx >= r.left - 12 && lx <= r.right + 12 && ly >= r.top - 12 && ly <= r.bottom + 12);
      if (fire && !cancel) act();
      if (aimOf) opts.aim?.end();
    };
    el.addEventListener("pointerup", (e) => { if (e.pointerType !== "mouse") end(true); });
    el.addEventListener("pointercancel", () => end(false));
  }

  // ordem visual: esquiva, skills, ataque (maior) à direita
  const order: ActionId[] = ["dodge", "skill1", "skill2", "skill3", "ultimate", "attack"];
  for (const a of order) {
    const def = defs[a];
    const cost = def.cost ?? 0;
    const b = document.createElement("button");
    b.type = "button";
    const art = skillImage(def.name); // arte final (assets/ui/skills); sem arte, usa o ícone pequeno
    const cat = skillCategory(def.name);
    b.className = `hd-btn hd-a-${a}` + (a === "attack" ? " big" : "") + (a === "ultimate" ? " ult" : "") + (art ? " hasart" : def.icon ? " hasic" : "") + (cat ? ` cat-${cat}` : "");
    b.setAttribute("aria-label", `${def.name} (${def.key})${cost ? `, custa ${cost} de ${res.name}` : ""}`);
    b.innerHTML = `<span class="hd-key">${def.key}</span>${art ? `<span class="hd-art"><img src="${art}" alt="" draggable="false"></span>` : def.icon ? `<span class="hd-ic">${ICON[def.icon] ?? ""}</span>` : ""}<span class="hd-sn">${def.name}</span>${cost ? `<span class="hd-cost" style="color:${resColor}">${cost}</span>` : ""}<span class="hd-cd"></span><span class="hd-cdn"></span>`;
    // pointerdown: resposta imediata no toque, sem esperar o "click"
    // toque: dispara ao soltar (um toque longo abre o balão em vez de disparar); mouse: dispara ao apertar
    pressable(b, () => trigger(a), () => tipHtml(skillTooltip(defs[a], res.name)), a);
    bar.append(b);
    els.set(a, { btn: b, cd: b.querySelector(".hd-cd")!, n: b.querySelector(".hd-cdn")! });
  }

  const TM_ICON = {
    low: '<svg viewBox="0 0 24 24"><path d="M12 20.5s-7.5-4.6-7.5-10.2A4.3 4.3 0 0 1 12 7.6a4.3 4.3 0 0 1 7.5 2.7c0 5.6-7.5 10.2-7.5 10.2z"/><path d="M12 11v5M9.8 14l2.2 2.2 2.2-2.2"/></svg>',
    near: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="6.5"/><circle cx="12" cy="12" r="1.6"/><path d="M12 2.5v4M12 17.5v4M2.5 12h4M17.5 12h4"/></svg>',
    next: '<svg viewBox="0 0 24 24"><path d="M19.5 8A8 8 0 0 0 5 7.5M4.5 16a8 8 0 0 0 14.5.5"/><path d="M19.5 3.5V8H15M4.5 20.5V16H9"/></svg>',
  };
  // prioridade do alvo sem foco: "<" menos vida em % (padrão) e ">" mais próximo; ficam ao lado do ataque básico (só no celular)
  let tMode: "low" | "near" = opts.targetMode ?? "low";
  const tmBtns: [HTMLButtonElement, "low" | "near", string][] = [];
  for (const [m, label, title] of [["low", TM_ICON.low, "Prioridade: alvo com menos vida"], ["near", TM_ICON.near, "Prioridade: alvo mais próximo"]] as const) {
    const t = document.createElement("button");
    t.type = "button";
    t.className = `hd-tm hd-tm-${m}`;
    t.innerHTML = label;
    t.title = title;
    t.setAttribute("aria-label", title);
    t.addEventListener("pointerdown", (e) => {
      e.preventDefault(); e.stopPropagation();
      tMode = m;
      paintTm();
      opts.onTargetMode?.(m);
    });
    tmBtns.push([t, m, title]);
    bar.append(t);
  }
  { // botão ⟳: passa o foco para o próximo alvo (inimigo mais próximo depois do atual; clérigo na Cura Focada: próximo aliado)
    const n = document.createElement("button");
    n.type = "button";
    n.className = "hd-tm hd-tm-next";
    n.innerHTML = TM_ICON.next;
    n.title = "Próximo alvo";
    n.setAttribute("aria-label", "Próximo alvo");
    n.addEventListener("pointerdown", (e) => { e.preventDefault(); e.stopPropagation(); opts.onNextTarget?.(); });
    bar.append(n);
  }
  function paintTm() {
    for (const [t, m] of tmBtns) { t.classList.toggle("on", m === tMode); t.setAttribute("aria-pressed", String(m === tMode)); }
  }
  paintTm();

  // Clérigo: botão ⇄ no Q para alternar entre Cura em Área e Cura Focada (também a tecla Z); o servidor só troca fora de combate
  const qBtn = els.get("skill1")!.btn;
  if (opts.cls === "cleric" && cdef.skill1Alt) {
    const sw = document.createElement("span");
    sw.className = "hd-qs";
    sw.textContent = "⇄";
    sw.title = "Alternar o Q: Cura em Área / Cura Focada (Z)";
    sw.addEventListener("pointerdown", (e) => { e.preventDefault(); e.stopPropagation(); toggleQ(); });
    qBtn.append(sw);
  }
  function applyQ() {
    const d = qMode === 1 && cdef.skill1Alt ? cdef.skill1Alt : cdef.actions.skill1;
    defs.skill1 = d;
    qBtn.querySelector(".hd-sn")!.textContent = d.name;
    const art = skillImage(d.name);
    const artEl = qBtn.querySelector(".hd-art");
    if (artEl) artEl.innerHTML = art ? `<img src="${art}" alt="" draggable="false">` : "";
    qBtn.classList.toggle("hasart", !!art);
    qBtn.classList.remove("cat-dano", "cat-cura", "cat-controle");
    const cat = skillCategory(d.name);
    if (cat) qBtn.classList.add(`cat-${cat}`);
    const ic = qBtn.querySelector(".hd-ic");
    if (ic && d.icon) ic.innerHTML = ICON[d.icon] ?? "";
    const c = qBtn.querySelector(".hd-cost");
    if (c) c.textContent = String(d.cost ?? 0);
    qBtn.setAttribute("aria-label", `${d.name} (${d.key}), custa ${d.cost ?? 0} de ${res.name}`);
  }
  function toggleQ() {
    if (opts.cls !== "cleric") return;
    opts.onQMode?.(qMode === 1 ? 0 : 1);
  }

  // slot da poção: ao lado da barra de habilidades, com ícone, estoque e contagem de recarga (a tecla F e o toque bebem)
  let potCount = 0, potUntil = 0;
  const pb = document.createElement("button");
  pb.type = "button";
  pb.className = "hd-btn hd-pot empty";
  pb.setAttribute("aria-label", "Beber poção (F)");
  pb.innerHTML = `<span class="hd-key">F</span>${ICON.potion}<span class="hd-qty">0</span><span class="hd-sn">Poção</span><span class="hd-cd"></span><span class="hd-cdn"></span>`;
  pressable(pb, () => opts.onPotion?.(), () => {
    const heal = ITEMS.pocao_de_vida?.heal ?? 40;
    return tipHtml({ name: "Poção de Vida", key: "F", type: "Cura", stats: [`Cura: ${heal} de vida`, `Estoque: ${potCount}`, `Recarga: ${POTION_COOLDOWN_S} s`], desc: "Bebe uma poção do inventário e recupera vida na hora.", tip: "Compartilha a recarga com todas as poções: não desperdice com a vida cheia." });
  });
  bar.append(pb);
  // auto-poção: o botão "Auto" abre um controle (0 = desligada, passo 5, até 90% de vida). O servidor decide, grava e bebe.
  let autoAt = 0;
  const ab = document.createElement("button");
  ab.type = "button";
  ab.className = "hd-btn hd-auto";
  ab.innerHTML = `<span class="hd-sn">Auto</span><span class="hd-aval"></span>`;
  const apop = document.createElement("div");
  apop.className = "hd-apop";
  apop.innerHTML = `<div class="hd-apop-t"><span>Auto-poção</span><b class="hd-apop-v"></b></div>`
    + `<input class="hd-apop-r" type="range" min="0" max="${AUTO_POT_MAX}" step="${AUTO_POT_STEP}" aria-label="Beber a poção sozinho abaixo de quantos % de vida (0 = desligada)">`
    + `<div class="hd-apop-s"><span>Desligada</span><span>${AUTO_POT_MAX}%</span></div>`;
  const apRange = apop.querySelector<HTMLInputElement>(".hd-apop-r")!;
  const apVal = apop.querySelector<HTMLElement>(".hd-apop-v")!;
  const paintAuto = () => {
    ab.classList.toggle("on", autoAt > 0);
    ab.setAttribute("aria-pressed", String(autoAt > 0));
    ab.setAttribute("aria-label", autoAt > 0 ? `Auto-poção abaixo de ${autoAt}% de vida: abrir ajuste` : "Auto-poção desligada: abrir ajuste");
    ab.title = autoAt > 0 ? `Auto-poção: bebe sozinho abaixo de ${autoAt}% de vida` : "Auto-poção desligada (toque para ajustar)";
    ab.querySelector<HTMLElement>(".hd-aval")!.textContent = autoAt > 0 ? `${autoAt}%` : "";
    apRange.value = String(autoAt);
    apVal.textContent = autoAt > 0 ? `${autoAt}% de vida` : "Desligada";
  };
  const apOpen = (open: boolean) => apop.classList.toggle("open", open);
  ab.addEventListener("click", () => apOpen(!apop.classList.contains("open")));
  apRange.addEventListener("input", () => { autoAt = Number(apRange.value); paintAuto(); }); // mostra enquanto arrasta
  apRange.addEventListener("change", () => opts.onAutoPotion?.(Number(apRange.value))); // manda ao soltar: o servidor limita e grava
  document.addEventListener("pointerdown", (e) => { if (!apop.contains(e.target as Node) && !ab.contains(e.target as Node)) apOpen(false); });
  bar.append(ab, apop);
  paintAuto();
  const potCd = pb.querySelector<HTMLElement>(".hd-cd")!;
  const potN = pb.querySelector<HTMLElement>(".hd-cdn")!;
  const potQty = pb.querySelector<HTMLElement>(".hd-qty")!;

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
    const pl = potUntil - now;
    if (pl > 0) {
      pb.classList.add("cool");
      potCd.style.height = `${Math.min(100, (pl / (POTION_COOLDOWN_S * 1000)) * 100)}%`;
      potN.textContent = pl > 950 ? String(Math.ceil(pl / 1000)) : (pl / 1000).toFixed(1);
    } else if (pb.classList.contains("cool")) {
      pb.classList.remove("cool");
      potCd.style.height = "0";
    }
    for (const [a, e] of els) {
      const left = a === "attack" ? 0 : (cdUntil[a] ?? 0) - now; // o ataque básico não tem recarga na tela: só o ritmo (velocidade de ataque), sem relógio no botão
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
    clearCd(a) { delete cdUntil[a]; },
    setHp(hp, max) {
      const m = Math.max(1, max), r = Math.max(0, Math.min(1, hp / m));
      hpFill.style.transform = `scaleX(${r})`;
      if (r >= hpRatio) { // ganhou vida (ou primeira leitura): a sombra acompanha na hora; ao perder, ela fica para trás e desce devagar
        hpLag.style.transition = "none";
        hpLag.style.transform = `scaleX(${r})`;
        void hpLag.offsetWidth;
        hpLag.style.transition = "";
      } else hpLag.style.transform = `scaleX(${r})`;
      hpRatio = r;
      hpTxt.textContent = `${Math.max(0, Math.ceil(hp))}/${m}`;
      hpRoot.classList.toggle("low", r <= 0.2 && hp > 0);
    },
    setShield(s) {
      shdEl.classList.toggle("on", s !== null);
      if (s !== null) shdEl.textContent = s < 0 ? "Protegido" : `Proteção ${Math.ceil(s)}s`;
    },
    setMana(cur, max) {
      curRes = cur;
      rsFill.style.transform = `scaleX(${max > 0 ? Math.max(0, Math.min(1, cur / max)) : 0})`;
      rsTxt.textContent = `${Math.floor(cur)} / ${max}`;
      for (const [a, e] of els) e.btn.classList.toggle("low", cur < (defs[a].cost ?? 0));
    },
    setProgress(level, xp, need) {
      const tier = levelTier(level);
      unit.style.setProperty("--tc", TIER_VARS[tier][0]);
      unit.style.setProperty("--tl", TIER_VARS[tier][1]);
      pwrap.className = `hd-pwrap t${tier}`; // a moldura do retrato (cor, rebites, gema, brilho) acompanha a faixa de nível
      lvb.textContent = String(level);
      // barra da faixa: quanto falta para a próxima borda (o incentivo para continuar subindo)
      const start = tier === 0 ? 1 : tier * 10;
      const next = (tier + 1) * 10;
      const rr = need > 0 ? Math.min(1, xp / need) : 1;
      if (tier >= 5) { trFill.style.transform = "scaleX(1)"; trTxt.textContent = `${LEVEL_TIER_TITLES[tier]} · máx`; }
      else { trFill.style.transform = `scaleX(${Math.min(1, (level - start + rr) / (next - start))})`; trTxt.textContent = `${LEVEL_TIER_TITLES[tier]} ${level}/${next}`; }
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
    setDead(secondsLeft, place) {
      dead.classList.toggle("on", secondsLeft !== null);
      if (secondsLeft === null) return;
      const n = Math.max(0, Math.ceil(secondsLeft));
      const txt = place ? `Renascendo em ${place} em ${n}s...` : `Renascendo em ${n}s...`;
      if (deadSub.textContent !== txt) deadSub.textContent = txt; // só mexe no DOM quando o segundo muda
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
    setPotion(count) {
      if (count < potCount && potCount > 0) potUntil = performance.now() + POTION_COOLDOWN_S * 1000; // gastou uma: recarga (o servidor também aplica)
      potCount = count;
      potQty.textContent = String(count);
      pb.classList.toggle("empty", count <= 0);
    },
    potionReady: () => performance.now() >= potUntil,
    setAutoPotion(at) { autoAt = at; paintAuto(); },
    setQMode(mode) {
      if (mode === qMode) return;
      qMode = mode;
      applyQ();
    },
    toggleQ,
    alert(text) {
      alertEl.textContent = text;
      alertEl.classList.add("on");
      clearTimeout(alertTimer);
      alertTimer = setTimeout(() => alertEl.classList.remove("on"), 2600);
    },
    setBuff(on, label = "Escudo ativo") {
      if (on) buff.textContent = label;
      buff.classList.toggle("on", on);
    },
    setBuffs(list) { buffStrip.set(list); },
  };
}
