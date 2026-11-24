import { isTypingTarget } from "./keys";
import { silhouetteSvg } from "./silhouette";
import { animatePoder, previewPoderDelta } from "./poder";
import { bindItemTip, bindDoubleTap, COARSE, hideItemTip, setItemTipContext, compareStats, type ItemTipData } from "./itemtip";
import {
  ITEMS, INV_SLOTS, Msg, COIN_IRON, COIN_OBOL, breakValue, RARITY_COLOR, RARITY_NAME, CLASS_DEFS, EQUIP_SLOTS, EQUIP_SLOT_NAME, WEAPON_TYPES, gearBonuses, kitLines, type CharClass,
  type InventorySnapshot, type ItemDef, type EquipSlot,
} from "@frixep/shared";

/** Mochila + equipamento (DOM). O servidor decide tudo: aqui só mostramos e pedimos. */
export interface InventoryUi {
  setSnapshot(s: InventorySnapshot): void;
  /** poder total oficial (vem do servidor): anima a mudança no painel de status */
  setPoder(n: number): void;
  toggle(): void;
  isOpen(): boolean;
  firstPotionSlot(): number;
  toast(text: string, color?: string): void;
}

const CSS = `
.iv-btn{position:fixed;top:max(14px,env(safe-area-inset-top));right:66px;z-index:20;width:44px;height:44px;border-radius:50%;display:grid;place-items:center;cursor:pointer;color:#bcd8f5;
  background:rgba(8,16,28,.7);border:1px solid rgba(160,200,240,.3);backdrop-filter:blur(6px);-webkit-backdrop-filter:blur(6px);transition:border-color .18s,color .18s,box-shadow .18s}
.iv-btn:hover,.iv-btn:focus-visible{color:#fff;border-color:#ff9a4d;box-shadow:0 0 16px rgba(255,120,40,.35)}
.iv-btn:focus-visible,.iv-slot:focus-visible,.iv-act:focus-visible,.iv-x:focus-visible{outline:2px solid #ffd2a3;outline-offset:2px}
.iv-btn svg{width:22px;height:22px}
.iv-back{position:fixed;inset:0;z-index:19;display:none;align-items:center;justify-content:center;background:rgba(2,5,11,.55);padding:12px;font-family:"Cinzel",Georgia,serif}
.iv-back.open{display:flex}
.iv-card{width:min(660px,100%);max-height:calc(100vh - 24px);overflow:auto;padding:16px;border-radius:8px;color:#dbeaff;
  background:linear-gradient(180deg,rgba(20,34,52,.97),rgba(6,12,20,.98));border:1px solid rgba(255,150,70,.4);box-shadow:0 18px 50px rgba(0,0,0,.7),inset 0 1px 0 rgba(180,220,255,.12)}
.iv-head{display:flex;align-items:center;justify-content:space-between;margin-bottom:10px}
.iv-id{display:flex;align-items:center;gap:12px}
.iv-medal{position:relative;width:46px;height:46px;flex:none;border-radius:50%;padding:3px;background:conic-gradient(from 200deg,#6b7a8c,#2a3442,#8a97a6,#2a3442,#6b7a8c);box-shadow:0 0 0 1px #000,0 0 12px rgba(255,130,50,.35)}
.iv-medal canvas{display:block;width:100%;height:100%;border-radius:50%;image-rendering:pixelated;background:#1a1410;box-shadow:inset 0 0 6px #000}
.iv-title{margin:0;font-size:14px;font-weight:700;letter-spacing:.35em;text-transform:uppercase;color:#ffb072;text-shadow:0 0 14px rgba(255,120,40,.5)}
.iv-x{width:34px;height:34px;border-radius:50%;cursor:pointer;color:#bcd8f5;background:transparent;border:1px solid rgba(160,200,240,.3);font:700 16px/1 Georgia,serif}
.iv-body{display:grid;grid-template-columns:272px 1fr;gap:14px}
@media (max-width:640px){.iv-body{grid-template-columns:1fr}.iv-card{padding:12px}}
.iv-left{display:flex;flex-direction:column;gap:6px;align-items:center}
.iv-poder{display:flex;flex-direction:column;align-items:center;gap:2px;margin:4px 0 2px;padding:6px 8px;border-radius:8px;background:linear-gradient(180deg,rgba(20,30,46,.7),rgba(8,12,20,.7));border:1px solid rgba(201,168,90,.35)}
.iv-poder .iv-pl{font:700 10px/1 "Cinzel",Georgia,serif;letter-spacing:.22em;color:#c9b07a;text-transform:uppercase}
.iv-poder .pw-n{font:800 30px/1 Georgia,serif;color:#f3d77a;text-shadow:0 2px 6px #000}
.iv-stats{white-space:pre-line}
.iv-wallet{display:flex;gap:14px;align-items:center;margin:0 0 8px;font:700 12px/1 "Cinzel",Georgia,serif;color:#e6eef9}
.iv-wallet span{display:flex;align-items:center;gap:5px}
.iv-wallet img{width:20px;height:20px;image-rendering:pixelated}
.iv-sort{width:34px;height:34px;border-radius:50%;cursor:pointer;color:#8fb0cf;background:transparent;border:1px solid rgba(160,200,240,.18);display:grid;place-items:center;margin-right:8px;opacity:.75}
.iv-sort:hover,.iv-sort:focus-visible{opacity:1;color:#fff;border-color:#ff9a4d;outline:none}
.iv-sort svg{width:16px;height:16px}
.iv-head-r{display:flex;align-items:center}
/* boneco: silhueta com os espaços de equipamento sobre o corpo */
.iv-doll{--s:72px;position:relative;width:100%;max-width:262px;aspect-ratio:262/292;border-radius:10px;overflow:hidden;
  background:linear-gradient(180deg,rgba(14,14,16,.94),rgba(6,6,9,.97));border:1px solid rgba(255,150,70,.22);
  box-shadow:inset 0 0 40px rgba(0,0,0,.7)}
@media (max-width:640px){.iv-doll{--s:56px;max-width:232px}.iv-es .lbl{display:none}.iv-acc{padding:6px 0 0}.iv-acc .iv-es{--s:34px;width:34px;height:34px}.iv-stats{margin:2px 0 0;font-size:11px}}
.iv-sil{position:absolute;inset:0;width:100%;height:100%;pointer-events:none}
.iv-es{position:absolute;width:var(--s);height:var(--s);transform:translate(-50%,-50%);display:grid;place-items:center;padding:0;border-radius:7px;cursor:pointer;color:#7a8da3;
  --rc:rgba(160,200,240,.35);background:radial-gradient(circle at 50% 35%,rgba(26,38,56,.92),rgba(5,9,15,.96));border:2px solid var(--rc);box-shadow:inset 0 0 10px rgba(0,0,0,.8);
  transition:transform .12s,box-shadow .18s,border-color .15s}
.iv-es:hover:not(:disabled){transform:translate(-50%,-50%) scale(1.07);border-color:#ffd08a}
.iv-es.full{box-shadow:0 0 9px var(--rc),inset 0 0 10px rgba(0,0,0,.7)}
.iv-es[aria-pressed=true]{border-color:#ffd08a;box-shadow:0 0 14px rgba(255,190,100,.55),inset 0 0 8px rgba(0,0,0,.7)}
.iv-es svg{width:56%;height:56%;opacity:.55}
.iv-es .iv-ic{width:82%;height:82%}
.iv-es:disabled{cursor:not-allowed;border-style:dashed;border-color:rgba(160,200,240,.16);opacity:.55}
.iv-es:disabled svg{opacity:.3}
.iv-es.can{border-color:#7dd68a;animation:iv-can 1s ease-in-out infinite}
.iv-es.no{opacity:.35}
.iv-es .lbl{position:absolute;left:50%;bottom:-13px;transform:translateX(-50%);font:700 8px/1 "Cinzel",Georgia,serif;letter-spacing:.1em;text-transform:uppercase;color:#6f8eab;white-space:nowrap;pointer-events:none}
.iv-es .qn{position:absolute;right:2px;bottom:1px;font:700 10px/1 "Cinzel",Georgia,serif;text-shadow:0 1px 3px #000;color:#fff}
@keyframes iv-can{0%,100%{box-shadow:0 0 4px #7dd68a}50%{box-shadow:0 0 16px #7dd68a}}
@keyframes iv-pulse{0%,100%{box-shadow:0 0 5px var(--rc),inset 0 0 8px rgba(0,0,0,.6)}50%{box-shadow:0 0 16px var(--rc),inset 0 0 8px rgba(0,0,0,.6)}}
.iv-es.p1,.iv-slot.p1{animation:iv-pulse 3.2s ease-in-out infinite}
.iv-es.p2,.iv-slot.p2{animation:iv-pulse 2.2s ease-in-out infinite}
.iv-es.p3,.iv-slot.p3{animation:iv-pulse 1.5s ease-in-out infinite}
/* arma equipada: brilho pela raridade (comum sem brilho; a cada raridade o halo cresce e pulsa mais rápido) */
@keyframes iv-w1{0%,100%{box-shadow:0 0 6px var(--rc),inset 0 0 8px rgba(0,0,0,.7)}50%{box-shadow:0 0 12px var(--rc),inset 0 0 8px rgba(0,0,0,.7)}}
@keyframes iv-w2{0%,100%{box-shadow:0 0 10px var(--rc),0 0 2px var(--rc),inset 0 0 10px rgba(0,0,0,.7)}50%{box-shadow:0 0 22px var(--rc),0 0 6px var(--rc),inset 0 0 10px rgba(0,0,0,.7)}}
@keyframes iv-w3{0%,100%{box-shadow:0 0 14px var(--rc),0 0 4px #fff,inset 0 0 12px rgba(0,0,0,.7)}50%{box-shadow:0 0 34px var(--rc),0 0 10px var(--rc),inset 0 0 12px rgba(0,0,0,.7)}}
.iv-es.wglow.w1{animation:iv-w1 3.2s ease-in-out infinite}
.iv-es.wglow.w2{animation:iv-w1 2.4s ease-in-out infinite}
.iv-es.wglow.w3{animation:iv-w2 2.0s ease-in-out infinite}
.iv-es.wglow.w4{animation:iv-w2 1.5s ease-in-out infinite}
.iv-es.wglow.w5{animation:iv-w3 1.1s ease-in-out infinite}
.iv-es.wglow .iv-ic{filter:drop-shadow(0 0 3px var(--rc))}
.iv-es.wglow.w3 .iv-ic,.iv-es.wglow.w4 .iv-ic{filter:drop-shadow(0 0 6px var(--rc))}
.iv-es.wglow.w5 .iv-ic{filter:drop-shadow(0 0 10px var(--rc)) brightness(1.15)}
.iv-es.can,.iv-es.no{animation-name:iv-can}
@media (prefers-reduced-motion:reduce){.iv-es,.iv-slot{animation:none!important}}
.iv-acc{display:flex;gap:18px;justify-content:center;padding:12px 0 2px}
.iv-acc .iv-es{position:relative;transform:none;left:auto;top:auto;--s:48px;width:48px;height:48px}
.iv-acc .iv-es:hover:not(:disabled){transform:scale(1.07)}
.iv-tip{position:fixed;z-index:40;max-width:260px;padding:9px 11px;border-radius:6px;pointer-events:none;color:#dbeaff;font:400 12px/1.4 Georgia,serif;
  background:linear-gradient(180deg,rgba(18,28,44,.98),rgba(6,10,18,.99));border:1px solid var(--rc,#ff9a4d);box-shadow:0 8px 24px rgba(0,0,0,.8),0 0 14px var(--rc,transparent)}
.iv-tip h4{margin:0 0 1px;font:700 13px/1.2 "Cinzel",Georgia,serif}
.iv-tip small{display:block;color:#8fb0cf;margin-bottom:4px}
.iv-tip .row{display:flex;justify-content:space-between;gap:10px;color:#b9d2ea}
.iv-tip .up{color:#7dd68a}.iv-tip .dn{color:#ff8f7e}.iv-tip .eq{color:#8fb0cf}
.iv-tip hr{border:0;border-top:1px solid rgba(160,200,240,.18);margin:5px 0}
.iv-tip .bad{color:#ff9d8a}
.iv-stats{font:400 12px/1.5 Georgia,serif;color:#9fc0e0;margin:6px 0 0;text-align:center}
.iv-grid{display:grid;grid-template-columns:repeat(5,1fr);gap:6px}
.iv-slot{position:relative;aspect-ratio:1;border-radius:5px;cursor:pointer;display:grid;place-items:center;padding:0;color:inherit;--rc:rgba(160,200,240,.2);
  background:radial-gradient(circle at 50% 35%,rgba(20,30,46,.9),rgba(5,9,15,.9));border:1.5px solid var(--rc);transition:border-color .15s,transform .12s}
.iv-slot.full{box-shadow:0 0 6px var(--rc)}
.iv-slot.drop{border-color:#7dd68a}
.iv-slot:hover{border-color:#ff9a4d;transform:scale(1.04)}
.iv-slot[aria-pressed=true]{border-color:#ffd08a;box-shadow:0 0 14px rgba(255,170,80,.4)}
.iv-slot svg,.iv-eqs svg{width:70%;height:70%}
.iv-eqs svg{width:34px;height:34px;flex:none}
.iv-ic{image-rendering:pixelated;object-fit:contain;flex:none;pointer-events:none;filter:drop-shadow(0 2px 3px rgba(0,0,0,.7))}
.iv-qty{position:absolute;right:3px;bottom:2px;font:700 10px/1 "Cinzel",Georgia,serif;text-shadow:0 1px 3px #000}
.iv-det{margin-top:10px;min-height:92px;padding:10px;border-radius:5px;background:rgba(6,12,20,.7);border:1px solid rgba(160,200,240,.2)}
.iv-det h3{margin:0 0 2px;font:700 13px/1.2 "Cinzel",Georgia,serif}
.iv-det p{margin:2px 0;font:400 12px/1.35 Georgia,serif;color:#9fc0e0}
.iv-det .iv-bad{color:#ff9d8a}
.iv-acts{display:flex;gap:8px;margin-top:8px}
.iv-act{flex:1;min-height:40px;border-radius:5px;cursor:pointer;font:700 11px/1 "Cinzel",Georgia,serif;letter-spacing:.12em;text-transform:uppercase;color:#eaf4ff;
  background:linear-gradient(180deg,rgba(24,40,60,.85),rgba(7,13,22,.92));border:1px solid rgba(255,150,70,.4)}
.iv-act:hover{border-color:#ff9a4d}
.iv-act.iv-danger{border-color:rgba(255,110,90,.5);color:#ffb3a6}
.iv-toasts{position:fixed;top:max(70px,env(safe-area-inset-top));left:50%;transform:translateX(-50%);z-index:25;display:flex;flex-direction:column;gap:6px;align-items:center;pointer-events:none}
.iv-toast{padding:7px 14px;border-radius:5px;font:700 12px/1.2 "Cinzel",Georgia,serif;letter-spacing:.08em;color:#fff;background:rgba(8,14,24,.88);border:1px solid rgba(255,150,70,.5);
  text-shadow:0 1px 3px #000;animation:iv-t 2.8s ease-out forwards}
@keyframes iv-t{0%{opacity:0;transform:translateY(-6px)}10%{opacity:1;transform:none}80%{opacity:1}100%{opacity:0}}
@media (prefers-reduced-motion:reduce){.iv-toast{animation-duration:2.8s}}
`;

/** desenhos provisórios por tipo (usados enquanto o PNG final do item não existe); o baú também usa */
export const ICONS = {
  weapon: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M14.5 4l5.5-.5-.5 5.5L9 19.5 4.5 15z"/><path d="M5 19l-2 2M7.5 16.5l-3 3"/></svg>`,
  armor: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3l7 3v6c0 4.5-3 7.5-7 9-4-1.5-7-4.5-7-9V6z"/><path d="M12 8v8"/></svg>`,
  potion: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M9 3h6M10 3v5l-4.5 8.5A2.5 2.5 0 0 0 7.7 20h8.6a2.5 2.5 0 0 0 2.2-3.5L14 8V3"/><path d="M7.5 15h9"/></svg>`,
  offhand: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M5 4h14v7c0 5-3 8-7 9-4-1-7-4-7-9z"/></svg>`,
  helmet: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M4 14a8 8 0 0 1 16 0v5h-4v-4H8v4H4z"/></svg>`,
  boots: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M8 4h6v8l6 3v5H5v-4l3-2z"/></svg>`,
  cape: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M8 3h8l4 17H4z"/><path d="M8 3c1 3 7 3 8 0"/></svg>`,
  material: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3l8 4.5v9L12 21l-8-4.5v-9z"/><path d="M12 12l8-4.5M12 12v9M12 12L4 7.5"/></svg>`,
} as const;
const SORT = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M7 4v16M7 4L4 7M7 4l3 3M17 20V4M17 20l-3-3M17 20l3-3"/></svg>`;
const BAG = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M6 8h12l1.5 12H4.5z"/><path d="M9 8V6a3 3 0 0 1 6 0v2"/></svg>`;

/** Ícone final em assets/items/item_<id>.png (48x48); se o arquivo ainda não existe, mostra o desenho provisório (SVG). */
const icon = (d: ItemDef) =>
  `<img class="iv-ic" src="/assets/items/item_${d.id}.png" alt="" width="40" height="40" draggable="false" data-fb="${d.kind}" data-c="${RARITY_COLOR[d.rarity]}">`;
document.addEventListener("error", (e) => {
  const img = e.target;
  if (!(img instanceof HTMLImageElement) || !img.classList.contains("iv-ic")) return;
  const k = img.dataset.fb as keyof typeof ICONS | undefined;
  if (!k || !(k in ICONS)) return;
  const span = document.createElement("span");
  span.style.cssText = `color:${img.dataset.c ?? "#b8c4d0"};display:contents`;
  span.innerHTML = ICONS[k]; // SVG fixo do próprio código
  img.replaceWith(span);
}, true);

/** linhas de atributos de um item (só os que ele tem) */
function statLines(d: ItemDef): string[] {
  const o: string[] = [];
  if (d.dmgPct) o.push(`+${d.dmgPct}% de poder`);
  if (d.hp) o.push(`+${d.hp} de vida`);
  if (d.crit) o.push(`+${d.crit}% de crítico`);
  if (d.dr) o.push(`−${d.dr}% de dano recebido`);
  if (d.cdr) o.push(`−${d.cdr}% de recarga`);
  if (d.mana) o.push(`+${d.mana} de recurso máximo`);
  if (d.regen) o.push(`+${d.regen}/s de recurso`);
  if (d.heal) o.push(`Cura ${d.heal} de vida`);
  return o;
}

/** 0 = sem brilho; épico pulsa leve, lendário médio, mítico forte */
const RARITY_ORDER = ["common", "uncommon", "rare", "epic", "legendary", "mythic"];
const pulse = (d: ItemDef): string[] => { const r = RARITY_ORDER.indexOf(d.rarity); return r >= 3 ? [`p${r - 2}`] : []; };

/** posições (em % do boneco) de cada espaço */
const EQ_POS: Record<EquipSlot | "potion", [number, number]> = {
  helmet: [50, 19], armor: [50, 50], boots: [50, 81], weapon: [17, 50], offhand: [83, 50], cape: [17, 19], potion: [17, 81],
};
interface Ph { key: string; label: string; icon: string; pos?: [number, number]; acc?: boolean }
const PLACEHOLDERS: Ph[] = [
  { key: "bag", label: "Bolsa", icon: "bag", pos: [83, 19] }, { key: "food", label: "Comida", icon: "food", pos: [83, 81] },
  { key: "ring", label: "Anel", icon: "ring", acc: true }, { key: "amulet", label: "Amuleto", icon: "amulet", acc: true },
];
const PH_ICONS: Record<string, string> = {
  bag: ICONS_BAG(), food: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M5 11h14a7 7 0 0 1-14 0z"/><path d="M9 7c0-2 2-1.5 2-3.5M13 7c0-2 2-1.5 2-3.5"/></svg>`,
  ring: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="14" r="6"/><path d="M9.5 6.5L12 3l2.5 3.5z"/></svg>`,
  amulet: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M6 3c0 6 12 6 12 0"/><path d="M12 11l3 4-3 5-3-5z"/></svg>`,
};
function ICONS_BAG() { return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M6 8h12l1.5 12H4.5z"/><path d="M9 8V6a3 3 0 0 1 6 0v2"/></svg>`; }

export function mountInventory(opts: { send(type: string, payload: unknown): void; getLevel(): number; getClass(): CharClass; onBreak?(slot: number): void }): InventoryUi {
  const style = document.createElement("style");
  style.textContent = CSS;
  document.head.append(style);

  const btn = document.createElement("button");
  btn.type = "button";
  btn.className = "iv-btn";
  btn.setAttribute("aria-label", "Abrir mochila (I)");
  btn.innerHTML = BAG;

  const back = document.createElement("div");
  back.className = "iv-back";
  back.innerHTML = `
    <div class="iv-card" role="dialog" aria-modal="true" aria-label="Mochila">
      <div class="iv-head"><div class="iv-id"><div class="iv-medal"><canvas width="47" height="47" aria-hidden="true"></canvas></div><h2 class="iv-title">Mochila</h2></div><div class="iv-head-r"><button type="button" class="iv-sort" aria-label="Organizar mochila" title="Organizar mochila">${SORT}</button><button type="button" class="iv-x" aria-label="Fechar">&times;</button></div></div>
      <div class="iv-body">
        <div class="iv-left"><div class="iv-doll"></div><div class="iv-acc"></div><div class="iv-poder pw-host" aria-label="Poder total"><span class="iv-pl">Poder</span><b class="pw-n">0</b></div><p class="iv-stats"></p></div>
        <div><div class="iv-wallet" aria-label="Moedas"></div><div class="iv-grid" role="group" aria-label="Espaços da mochila"></div><div class="iv-det"></div></div>
      </div>
    </div>`;
  const toasts = document.createElement("div");
  toasts.className = "iv-toasts";
  toasts.setAttribute("aria-live", "polite");
  document.body.append(btn, back, toasts);

  const dollEl = back.querySelector<HTMLElement>(".iv-doll")!;
  const accEl = back.querySelector<HTMLElement>(".iv-acc")!;
  const statsEl = back.querySelector<HTMLElement>(".iv-stats")!;
  const gridEl = back.querySelector<HTMLElement>(".iv-grid")!;
  const detEl = back.querySelector<HTMLElement>(".iv-det")!;
  const walletEl = back.querySelector<HTMLElement>(".iv-wallet")!;
  const poderBox = back.querySelector<HTMLElement>(".iv-poder")!;
  const poderNum = poderBox.querySelector<HTMLElement>(".pw-n")!;
  let poderNow = 0;
  let poderShown: number | null = null;

  let snap: InventorySnapshot = { inv: Array.from({ length: INV_SLOTS }, () => null), equip: { weapon: null, offhand: null, helmet: null, armor: null, boots: null, cape: null }, iron: 0, obols: 0 };
  let sel: { kind: "slot"; i: number } | { kind: "equip"; s: EquipSlot } | null = null;
  let confirmDrop = false;

  const isOpen = () => back.classList.contains("open");
  const portrait = back.querySelector<HTMLCanvasElement>(".iv-medal canvas")!;
  /** copia o retrato real do jogador (o mesmo da HUD) para o medalhão */
  const drawPortrait = () => {
    const src = document.querySelector<HTMLCanvasElement>(".hd-portrait canvas");
    const cx = portrait.getContext("2d")!;
    cx.imageSmoothingEnabled = false;
    cx.clearRect(0, 0, portrait.width, portrait.height);
    if (src && src.width) cx.drawImage(src, 0, 0, src.width, src.height, 0, 0, portrait.width, portrait.height);
  };
  const open = () => { back.classList.add("open"); drawPortrait(); render(); };
  const close = () => { back.classList.remove("open"); btn.focus(); };
  const toggle = () => (isOpen() ? close() : open());

  function toast(text: string, color = "#ffffff") {
    const t = document.createElement("div");
    t.className = "iv-toast";
    t.textContent = text; // textContent: nunca interpretar HTML vindo do servidor
    t.style.color = color;
    toasts.append(t);
    while (toasts.children.length > 4) toasts.firstElementChild?.remove();
    setTimeout(() => t.remove(), 2900);
  }

  const equippedDef = (k: EquipSlot): ItemDef | null => (snap.equip[k] ? ITEMS[snap.equip[k]!] ?? null : null);

  // ---- dica flutuante (mouse e toque): a ficha fica em itemtip.ts, igual em todo lugar
  setItemTipContext({
    getClass: () => opts.getClass(),
    getLevel: () => opts.getLevel(),
    previewPoder: (d) => {
      const delta = previewPoderDelta(opts.getClass(), opts.getLevel(), snap.equip, d);
      return delta === null ? null : { now: poderNow, delta };
    },
  });
  const hideTip = hideItemTip;
  const attachTip = (b: HTMLElement, get: () => ItemTipData) => bindItemTip(b, get);

  // ---- arrastar e soltar (mouse): destaca os espaços compatíveis
  type Drag = { from: "slot"; i: number } | { from: "equip"; s: EquipSlot };
  let drag: Drag | null = null;
  const dragDef = (): ItemDef | null => (!drag ? null : drag.from === "slot" ? (snap.inv[drag.i] ? ITEMS[snap.inv[drag.i]!.id] : null) : equippedDef(drag.s));
  function startDrag(e: DragEvent, d: Drag) {
    drag = d;
    hideTip();
    e.dataTransfer?.setData("text/plain", "item");
    if (e.dataTransfer) e.dataTransfer.effectAllowed = "move";
    const def = dragDef();
    dollEl.querySelectorAll<HTMLElement>(".iv-es[data-eq]").forEach((n) => {
      const ok = !!def && (n.dataset.eq === def.kind || (n.dataset.eq === "potion" && def.kind === "potion"));
      const usable = ok && (n.dataset.eq === "potion" || (!def!.cls || def!.cls === opts.getClass()));
      n.classList.toggle("can", d.from === "slot" && usable);
      n.classList.toggle("no", !(d.from === "slot" && ok));
    });
    if (d.from === "equip") gridEl.classList.add("dropping");
  }
  function endDrag() {
    drag = null;
    dollEl.querySelectorAll<HTMLElement>(".iv-es").forEach((n) => n.classList.remove("can", "no"));
    gridEl.classList.remove("dropping");
  }
  gridEl.ondragover = (e) => { if (drag?.from === "equip") e.preventDefault(); };
  gridEl.ondrop = (e) => { e.preventDefault(); if (drag?.from === "equip") opts.send(Msg.InvUnequip, { slot: drag.s }); endDrag(); };

  function slotButton(key: string, label: string): HTMLButtonElement {
    const b = document.createElement("button");
    b.type = "button";
    b.className = "iv-es";
    b.dataset.slot = key;
    const lb = document.createElement("span"); lb.className = "lbl"; lb.textContent = label;
    b.append(lb);
    return b;
  }
  const place = (b: HTMLElement, pos?: [number, number]) => { if (pos) { b.style.left = `${pos[0]}%`; b.style.top = `${pos[1]}%`; } };

  function placeholderSlot(ph: Ph): HTMLElement {
    const b = slotButton(ph.key, ph.label);
    b.disabled = true;
    b.title = `${ph.label}: em breve`;
    b.setAttribute("aria-label", `${ph.label} (em breve)`);
    b.insertAdjacentHTML("afterbegin", PH_ICONS[ph.icon]);
    place(b, ph.pos);
    return b;
  }

  function equipSlot(s: EquipSlot): HTMLElement {
    const def = equippedDef(s);
    const b = slotButton(s, EQUIP_SLOT_NAME[s] === "Mão secundária" ? "Secundária" : EQUIP_SLOT_NAME[s]);
    b.dataset.eq = s;
    b.setAttribute("aria-pressed", String(sel?.kind === "equip" && sel.s === s));
    b.setAttribute("aria-label", def ? `${EQUIP_SLOT_NAME[s]}: ${def.name}` : `${EQUIP_SLOT_NAME[s]} vazio`);
    if (def) {
      b.insertAdjacentHTML("afterbegin", icon(def));
      b.classList.add("full", ...pulse(def));
      b.style.setProperty("--rc", RARITY_COLOR[def.rarity]);
      if (s === "weapon") b.classList.add("wglow", `w${RARITY_ORDER.indexOf(def.rarity)}`); // a arma brilha pela raridade: mais forte a cada nível
      b.draggable = !COARSE;
      b.ondragstart = (e) => startDrag(e, { from: "equip", s });
      b.ondragend = endDrag;
      bindDoubleTap(b, `e${s}`, () => opts.send(Msg.InvUnequip, { slot: s }));
      attachTip(b, () => ({ def, af: snap.equipAf?.[s], extra: "Duplo clique: desequipar" }));
    } else b.insertAdjacentHTML("afterbegin", ICONS[s]);
    b.onclick = () => { sel = def ? { kind: "equip", s } : null; confirmDrop = false; render(); };
    b.ondragover = (e) => { if (drag?.from === "slot" && dragDef()?.kind === s) e.preventDefault(); };
    b.ondrop = (e) => {
      e.preventDefault();
      if (drag?.from === "slot" && dragDef()?.kind === s) opts.send(Msg.InvEquip, { slot: drag.i });
      endDrag();
    };
    place(b, EQ_POS[s]);
    return b;
  }

  /** espaço da poção: mostra a pilha de poções que a tecla de atalho usa (a poção entra aqui sozinha, de qualquer espaço da mochila) */
  function potionSlot(): HTMLElement {
    const i = snap.inv.findIndex((x) => x && ITEMS[x.id]?.kind === "potion");
    const total = snap.inv.reduce((n, x) => n + (x && ITEMS[x.id]?.kind === "potion" ? x.qty : 0), 0);
    const b = slotButton("potion", "Poção");
    b.dataset.eq = "potion";
    b.setAttribute("aria-label", i >= 0 ? `Poção: ${total} (usar)` : "Poção vazia");
    if (i >= 0) {
      const def = ITEMS[snap.inv[i]!.id];
      b.insertAdjacentHTML("afterbegin", icon(def));
      b.classList.add("full");
      b.style.setProperty("--rc", RARITY_COLOR[def.rarity]);
      const q = document.createElement("span"); q.className = "qn"; q.textContent = String(total);
      b.append(q);
      attachTip(b, () => ({ def, extra: "Clique: usar · tecla F" }));
      b.onclick = () => opts.send(Msg.InvUse, { slot: i });
    } else b.insertAdjacentHTML("afterbegin", ICONS.potion);
    b.ondragover = (e) => { if (drag?.from === "slot" && dragDef()?.kind === "potion") e.preventDefault(); };
    b.ondrop = (e) => { e.preventDefault(); if (drag?.from === "slot" && dragDef()?.kind === "potion") toast("A poção já fica pronta aqui sozinha. Clique para usar.", "#9fe0a8"); endDrag(); };
    place(b, EQ_POS.potion);
    return b;
  }

  function renderWallet() {
    walletEl.replaceChildren();
    for (const [c, n, color] of [[COIN_IRON, snap.iron, "#e6eef9"], [COIN_OBOL, snap.obols, COIN_OBOL.color]] as const) {
      const s = document.createElement("span");
      s.style.color = color;
      s.title = c.name;
      const im = document.createElement("img");
      im.src = `/assets/items/item_${c.id}.png`;
      im.alt = "";
      s.append(im, document.createTextNode(`${n.toLocaleString("pt-BR")} ${c.short}`));
      walletEl.append(s);
    }
  }

  function render() {
    hideTip();
    renderWallet();
    // equipamento: silhueta com os espaços sobre o corpo
    const rc: Partial<Record<EquipSlot, string>> = {};
    for (const s of EQUIP_SLOTS) { const d = equippedDef(s); if (d && d.rarity !== "common") rc[s] = RARITY_COLOR[d.rarity]; else if (d) rc[s] = "#8fa6c0"; }
    dollEl.innerHTML = silhouetteSvg(rc);
    accEl.replaceChildren();
    for (const ph of PLACEHOLDERS) (ph.acc ? accEl : dollEl).append(placeholderSlot(ph));
    for (const s of EQUIP_SLOTS) dollEl.append(equipSlot(s));
    dollEl.append(potionSlot());
    // bônus totais do que está equipado
    const g = gearBonuses(snap.equip, opts.getClass());
    const lines = [`Poder +${g.dmgPct}%`, `Vida +${g.hp}`];
    if (g.crit + (g.kit.crit ?? 0)) lines.push(`Crítico +${g.crit + (g.kit.crit ?? 0)}%`);
    if (g.dr) lines.push(`Dano recebido −${g.dr}%`);
    if (g.cdr) lines.push(`Recarga −${g.cdr}%`);
    if (g.mana) lines.push(`${CLASS_DEFS[opts.getClass()].resource.name} máx. +${g.mana}`);
    if (g.regen) lines.push(`Regeneração +${g.regen}/s`);
    const wd = snap.equip.weapon ? ITEMS[snap.equip.weapon] : null;
    if (wd?.wtype) lines.push(`Kit: ${WEAPON_TYPES[wd.wtype].name}`);
    statsEl.textContent = lines.join("\n");
    // espaços
    gridEl.innerHTML = "";
    snap.inv.forEach((st, i) => {
      const b = document.createElement("button");
      b.type = "button";
      b.className = "iv-slot";
      const def = st ? ITEMS[st.id] : null;
      b.setAttribute("aria-pressed", String(sel?.kind === "slot" && sel.i === i));
      b.setAttribute("aria-label", def ? `${def.name}${st!.qty > 1 ? ` x${st!.qty}` : ""}` : `Espaço vazio ${i + 1}`);
      if (def && st) {
        b.innerHTML = `${icon(def)}${st.qty > 1 ? `<span class="iv-qty"></span>` : ""}`;
        const q = b.querySelector(".iv-qty");
        if (q) q.textContent = String(st.qty);
        b.classList.add("full", ...pulse(def));
        b.style.setProperty("--rc", RARITY_COLOR[def.rarity] + "aa");
        b.draggable = !COARSE;
        b.ondragstart = (e) => startDrag(e, { from: "slot", i });
        b.ondragend = endDrag;
        bindDoubleTap(b, `s${i}`, () => { if (def.kind === "potion") opts.send(Msg.InvUse, { slot: i }); else opts.send(Msg.InvEquip, { slot: i }); });
        attachTip(b, () => ({ def, af: st.af, cmp: def.kind !== "potion" ? equippedDef(def.kind as EquipSlot) : null }));
      }
      b.onclick = () => { sel = def ? { kind: "slot", i } : null; confirmDrop = false; render(); };
      gridEl.append(b);
    });
    renderDetail();
  }

  function renderDetail() {
    detEl.innerHTML = "";
    let def: ItemDef | null = null;
    if (sel?.kind === "slot") def = snap.inv[sel.i] ? ITEMS[snap.inv[sel.i]!.id] : null;
    if (sel?.kind === "equip") def = snap.equip[sel.s] ? ITEMS[snap.equip[sel.s]!] : null;
    if (!sel || !def) {
      detEl.innerHTML = `<p>Selecione um item.</p>`;
      return;
    }
    const level = opts.getLevel();
    const h = document.createElement("h3");
    h.textContent = def.name;
    h.style.color = RARITY_COLOR[def.rarity];
    const p1 = document.createElement("p");
    p1.textContent = `${RARITY_NAME[def.rarity]}${def.hands ? ` · ${def.hands === 2 ? "Duas mãos" : "Uma mão"}` : ""}${statLines(def).length ? ` · ${statLines(def).join(" · ")}` : ""}`;
    const p2 = document.createElement("p");
    p2.textContent = def.desc;
    detEl.append(h, p1, p2);
    if (sel.kind === "slot" && def.kind !== "potion") {
      const cmp = equippedDef(def.kind as EquipSlot);
      if (cmp && cmp.id !== def.id) {
        const pc = document.createElement("p");
        pc.append(document.createTextNode(`Comparado ao equipado (${cmp.name}): `));
        const ds = compareStats(def, cmp);
        if (!ds.length) pc.append(document.createTextNode("igual."));
        ds.forEach((d, k) => { const sp = document.createElement("span"); sp.textContent = `${k ? " · " : ""}${d.text}`; sp.style.color = d.delta > 0 ? "#7dd68a" : "#ff8f7e"; pc.append(sp); });
        detEl.append(pc);
      }
    }
    const wtd = def.wtype ? WEAPON_TYPES[def.wtype] : null;
    if (wtd) {
      const pk = document.createElement("p");
      pk.textContent = `Kit (${wtd.name}): ${kitLines(wtd.kit).join(" · ") || "sem modificadores"}`;
      detEl.append(pk);
    }
    if (def.cls && sel.kind === "slot") {
      const pc = document.createElement("p");
      pc.textContent = `Exclusivo: ${CLASS_DEFS[def.cls].name}`;
      if (def.cls !== opts.getClass()) pc.className = "iv-bad";
      detEl.append(pc);
    }
    const needs = def.minLevel > 1 ? def.minLevel : 0;
    if (needs && sel.kind === "slot") {
      const p3 = document.createElement("p");
      p3.textContent = `Requer nível ${needs}`;
      if (level < needs) p3.className = "iv-bad";
      detEl.append(p3);
    }
    const acts = document.createElement("div");
    acts.className = "iv-acts";
    const mk = (label: string, danger: boolean, fn: () => void) => {
      const b = document.createElement("button");
      b.type = "button";
      b.className = "iv-act" + (danger ? " iv-danger" : "");
      b.textContent = label;
      b.onclick = fn;
      acts.append(b);
    };
    if (sel.kind === "slot") {
      const i = sel.i;
      if (def.kind === "potion") mk("Usar", false, () => opts.send(Msg.InvUse, { slot: i }));
      else mk("Equipar", false, () => { opts.send(Msg.InvEquip, { slot: i }); });
      if (def.kind !== "potion" && opts.onBreak) mk(`Quebrar (+${breakValue(def.id) * snap.inv[i]!.qty})`, true, () => opts.onBreak!(i)); // abre o diálogo de confirmação
      mk(confirmDrop ? "Confirmar?" : "Soltar", true, () => {
        if (!confirmDrop) { confirmDrop = true; renderDetail(); return; }
        confirmDrop = false;
        sel = null;
        opts.send(Msg.InvDrop, { slot: i });
      });
    } else {
      const s = sel.s;
      mk("Desequipar", false, () => { sel = null; opts.send(Msg.InvUnequip, { slot: s }); });
    }
    detEl.append(acts);
  }

  back.querySelector<HTMLElement>(".iv-sort")!.onclick = () => opts.send(Msg.InvSort, {});
  btn.onclick = toggle;
  back.querySelector<HTMLElement>(".iv-x")!.onclick = close;
  back.onclick = (e) => { if (e.target === back) close(); };
  // captura: com a mochila aberta, ESC fecha só a mochila (e não abre o menu)
  window.addEventListener("keydown", (e) => {
    if (e.repeat || isTypingTarget()) return; // digitando no chat: "i" é só uma letra
    if (isOpen() && e.key === "Escape") { e.stopImmediatePropagation(); e.preventDefault(); close(); return; }
    if (e.code === "KeyI" && !document.querySelector(".gm-back.open")) { e.preventDefault(); toggle(); } // B é dos Builds (C2.4)
  }, true);

  render();
  return {
    setPoder(n) {
      animatePoder(poderNum, poderShown, n, poderBox);
      poderShown = n;
      poderNow = n;
    },
    setSnapshot(s) {
      snap = s;
      // se o item selecionado mudou de lugar ou sumiu, limpa a seleção
      if (sel?.kind === "slot" && !snap.inv[sel.i]) sel = null;
      if (sel?.kind === "equip" && !snap.equip[sel.s]) sel = null;
      if (isOpen()) render();
    },
    toggle,
    isOpen,
    firstPotionSlot: () => snap.inv.findIndex((s) => s && ITEMS[s.id]?.kind === "potion"),
    toast,
  };
}
