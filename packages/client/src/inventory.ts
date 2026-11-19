import { isTypingTarget } from "./keys";
import {
  ITEMS, INV_SLOTS, Msg, COIN_IRON, COIN_OBOL, breakValue, RARITY_COLOR, RARITY_NAME, CLASS_DEFS, EQUIP_SLOTS, EQUIP_SLOT_NAME, WEAPON_TYPES, gearBonuses, kitLines, type CharClass,
  type InventorySnapshot, type ItemDef, type EquipSlot,
} from "@frixep/shared";

/** Mochila + equipamento (DOM). O servidor decide tudo: aqui só mostramos e pedimos. */
export interface InventoryUi {
  setSnapshot(s: InventorySnapshot): void;
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
.iv-title{margin:0;font-size:14px;font-weight:700;letter-spacing:.35em;text-transform:uppercase;color:#ffb072;text-shadow:0 0 14px rgba(255,120,40,.5)}
.iv-x{width:34px;height:34px;border-radius:50%;cursor:pointer;color:#bcd8f5;background:transparent;border:1px solid rgba(160,200,240,.3);font:700 16px/1 Georgia,serif}
.iv-body{display:grid;grid-template-columns:272px 1fr;gap:14px}
@media (max-width:640px){.iv-body{grid-template-columns:1fr}.iv-card{padding:12px}}
.iv-left{display:flex;flex-direction:column;gap:6px;align-items:center}
.iv-stats{white-space:pre-line}
.iv-wallet{display:flex;gap:14px;align-items:center;margin:0 0 8px;font:700 12px/1 "Cinzel",Georgia,serif;color:#e6eef9}
.iv-wallet span{display:flex;align-items:center;gap:5px}
.iv-wallet img{width:20px;height:20px;image-rendering:pixelated}
.iv-sort{width:34px;height:34px;border-radius:50%;cursor:pointer;color:#8fb0cf;background:transparent;border:1px solid rgba(160,200,240,.18);display:grid;place-items:center;margin-right:8px;opacity:.75}
.iv-sort:hover,.iv-sort:focus-visible{opacity:1;color:#fff;border-color:#ff9a4d;outline:none}
.iv-sort svg{width:16px;height:16px}
.iv-head-r{display:flex;align-items:center}
/* boneco: silhueta com os espaços de equipamento sobre o corpo */
.iv-doll{--s:52px;position:relative;width:100%;max-width:262px;aspect-ratio:262/330;border-radius:10px;overflow:hidden;
  background:radial-gradient(ellipse at 50% 38%,rgba(255,140,60,.13),rgba(6,12,20,0) 62%),linear-gradient(180deg,rgba(10,16,26,.92),rgba(4,8,14,.96));border:1px solid rgba(255,150,70,.28);
  box-shadow:inset 0 0 40px rgba(0,0,0,.7)}
@media (max-width:640px){.iv-doll{--s:42px;max-width:200px}.iv-es .lbl{display:none}.iv-acc{padding:6px 0 0}.iv-acc .iv-es{--s:34px;width:34px;height:34px}.iv-stats{margin:2px 0 0;font-size:11px}}
.iv-sil{position:absolute;inset:0;width:100%;height:100%;pointer-events:none}
.iv-sil .em{animation:iv-ember 3.6s ease-in-out infinite}
@keyframes iv-ember{0%,100%{opacity:.55}50%{opacity:1}}
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
.iv-es.can,.iv-es.no{animation-name:iv-can}
@media (prefers-reduced-motion:reduce){.iv-es,.iv-slot,.iv-sil .em{animation:none!important}}
.iv-acc{display:flex;gap:18px;justify-content:center;padding:12px 0 2px}
.iv-acc .iv-es{position:relative;transform:none;left:auto;top:auto;--s:40px;width:40px;height:40px}
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

const ICONS = {
  weapon: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M14.5 4l5.5-.5-.5 5.5L9 19.5 4.5 15z"/><path d="M5 19l-2 2M7.5 16.5l-3 3"/></svg>`,
  armor: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3l7 3v6c0 4.5-3 7.5-7 9-4-1.5-7-4.5-7-9V6z"/><path d="M12 8v8"/></svg>`,
  potion: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M9 3h6M10 3v5l-4.5 8.5A2.5 2.5 0 0 0 7.7 20h8.6a2.5 2.5 0 0 0 2.2-3.5L14 8V3"/><path d="M7.5 15h9"/></svg>`,
  offhand: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M5 4h14v7c0 5-3 8-7 9-4-1-7-4-7-9z"/></svg>`,
  helmet: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M4 14a8 8 0 0 1 16 0v5h-4v-4H8v4H4z"/></svg>`,
  boots: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M8 4h6v8l6 3v5H5v-4l3-2z"/></svg>`,
  cape: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M8 3h8l4 17H4z"/><path d="M8 3c1 3 7 3 8 0"/></svg>`,
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

const STAT_DEFS: { k: keyof ItemDef; name: string; unit: string; line: (v: number) => string }[] = [
  { k: "dmgPct", name: "poder", unit: "%", line: (v) => `+${v}% de poder` }, { k: "hp", name: "vida", unit: "", line: (v) => `+${v} de vida` },
  { k: "crit", name: "crítico", unit: "%", line: (v) => `+${v}% de crítico` }, { k: "dr", name: "defesa", unit: "%", line: (v) => `−${v}% de dano recebido` },
  { k: "cdr", name: "recarga menor", unit: "%", line: (v) => `−${v}% de recarga` }, { k: "mana", name: "recurso", unit: "", line: (v) => `+${v} de recurso máx.` },
  { k: "regen", name: "regen.", unit: "/s", line: (v) => `+${v}/s de recurso` },
];
/** diferença de atributos entre o item novo e o equipado (só o que muda) */
function compareStats(a: ItemDef, b: ItemDef): { text: string; delta: number }[] {
  const out: { text: string; delta: number }[] = [];
  for (const st of STAT_DEFS) {
    const d = Math.round((((a[st.k] as number) ?? 0) - ((b[st.k] as number) ?? 0)) * 100) / 100;
    if (d) out.push({ text: `${d > 0 ? "+" : "−"}${Math.abs(d)}${st.unit} ${st.name}`, delta: d });
  }
  return out;
}
/** 0 = sem brilho; épico pulsa leve, lendário médio, mítico forte */
const pulse = (d: ItemDef): string[] => { const r = ["common", "uncommon", "rare", "epic", "legendary", "mythic"].indexOf(d.rarity); return r >= 3 ? [`p${r - 2}`] : []; };

const SILHOUETTE = `<svg class="iv-sil" viewBox="0 0 262 330" aria-hidden="true" shape-rendering="geometricPrecision"><defs>
  <linearGradient id="ivg" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#34476a"/><stop offset=".5" stop-color="#1b2a42"/><stop offset="1" stop-color="#0b1320"/></linearGradient>
  <radialGradient id="ivh" cx=".5" cy=".42" r=".5"><stop offset="0" stop-color="#ff8a3d" stop-opacity=".2"/><stop offset="1" stop-color="#ff8a3d" stop-opacity="0"/></radialGradient></defs>
  <ellipse cx="131" cy="160" rx="118" ry="150" fill="url(#ivh)"/>
  <ellipse cx="131" cy="318" rx="52" ry="6" fill="#000" opacity=".4"/>
  <path d="M131 22C134.7 22.0 139.5 22.7 142 25C144.5 27.3 145.7 32.2 146 36C146.3 39.8 145.0 44.3 144 48C143.0 51.7 141.2 55.0 140 58C138.8 61.0 137.5 63.3 137 66C136.5 68.7 134.3 71.5 137 74C139.7 76.5 146.7 79.0 153 81C159.3 83.0 169.7 83.7 175 86C180.3 88.3 182.8 90.7 185 95C187.2 99.3 187.2 105.8 188 112C188.8 118.2 189.5 126.3 190 132C190.5 137.7 190.0 139.7 191 146C192.0 152.3 194.5 162.7 196 170C197.5 177.3 198.7 184.2 200 190C201.3 195.8 204.0 201.0 204 205C204.0 209.0 201.8 213.8 200 214C198.2 214.2 195.0 210.0 193 206C191.0 202.0 189.8 196.0 188 190C186.2 184.0 183.8 177.0 182 170C180.2 163.0 178.5 155.3 177 148C175.5 140.7 174.0 132.7 173 126C172.0 119.3 171.8 107.7 171 108C170.2 108.3 169.5 120.7 168 128C166.5 135.3 162.5 143.7 162 152C161.5 160.3 163.5 170.3 165 178C166.5 185.7 170.2 190.0 171 198C171.8 206.0 171.5 217.3 170 226C168.5 234.7 163.0 242.3 162 250C161.0 257.7 164.7 264.3 164 272C163.3 279.7 158.3 289.5 158 296C157.7 302.5 163.7 307.7 162 311C160.3 314.3 151.8 316.0 148 316C144.2 316.0 140.2 314.3 139 311C137.8 307.7 140.8 302.5 141 296C141.2 289.5 140.3 279.7 140 272C139.7 264.3 139.5 259.3 139 250C138.5 240.7 138.3 224.7 137 216C135.7 207.3 133.0 198.0 131 198C129.0 198.0 126.3 207.3 125 216C123.7 224.7 123.5 240.7 123 250C122.5 259.3 122.3 264.3 122 272C121.7 279.7 120.8 289.5 121 296C121.2 302.5 124.2 307.7 123 311C121.8 314.3 117.8 316.0 114 316C110.2 316.0 101.7 314.3 100 311C98.3 307.7 104.3 302.5 104 296C103.7 289.5 98.7 279.7 98 272C97.3 264.3 101.0 257.7 100 250C99.0 242.3 93.5 234.7 92 226C90.5 217.3 90.2 206.0 91 198C91.8 190.0 95.5 185.7 97 178C98.5 170.3 100.5 160.3 100 152C99.5 143.7 95.5 135.3 94 128C92.5 120.7 91.8 108.3 91 108C90.2 107.7 90.0 119.3 89 126C88.0 132.7 86.5 140.7 85 148C83.5 155.3 81.8 163.0 80 170C78.2 177.0 75.8 184.0 74 190C72.2 196.0 71.0 202.0 69 206C67.0 210.0 63.8 214.2 62 214C60.2 213.8 58.0 209.0 58 205C58.0 201.0 60.7 195.8 62 190C63.3 184.2 64.5 177.3 66 170C67.5 162.7 70.0 152.3 71 146C72.0 139.7 71.5 137.7 72 132C72.5 126.3 73.2 118.2 74 112C74.8 105.8 74.8 99.3 77 95C79.2 90.7 81.7 88.3 87 86C92.3 83.7 102.7 83.0 109 81C115.3 79.0 122.3 76.5 125 74C127.7 71.5 125.5 68.7 125 66C124.5 63.3 123.2 61.0 122 58C120.8 55.0 119.0 51.7 118 48C117.0 44.3 115.7 39.8 116 36C116.3 32.2 117.5 27.3 120 25C122.5 22.7 127.3 22.0 131 22Z" fill="url(#ivg)" stroke="rgba(150,190,235,.55)" stroke-width="1.4" stroke-linejoin="round"/>
  <g fill="none" stroke="rgba(150,190,235,.2)" stroke-width="1.1" stroke-linecap="round"><path d="M131 84v100M100 104q31 14 62 0M110 172q21 10 42 0M131 198v30M117 250q-4 14-2 30M145 250q4 14 2 30"/></g>
  <g class="em" fill="#ff8a3d"><circle cx="131" cy="100" r="2.6"/></g></svg>`;

/** posições (em % do boneco) de cada espaço */
const EQ_POS: Record<EquipSlot | "potion", [number, number]> = {
  helmet: [50, 11], armor: [50, 40], boots: [50, 85], weapon: [14, 40], offhand: [86, 40], cape: [14, 12], potion: [14, 68],
};
interface Ph { key: string; label: string; icon: string; pos?: [number, number]; acc?: boolean }
const PLACEHOLDERS: Ph[] = [
  { key: "bag", label: "Bolsa", icon: "bag", pos: [86, 12] }, { key: "food", label: "Comida", icon: "food", pos: [86, 68] },
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
      <div class="iv-head"><h2 class="iv-title">Mochila</h2><div class="iv-head-r"><button type="button" class="iv-sort" aria-label="Organizar mochila" title="Organizar mochila">${SORT}</button><button type="button" class="iv-x" aria-label="Fechar">&times;</button></div></div>
      <div class="iv-body">
        <div class="iv-left"><div class="iv-doll"></div><div class="iv-acc"></div><p class="iv-stats"></p></div>
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

  let snap: InventorySnapshot = { inv: Array.from({ length: INV_SLOTS }, () => null), equip: { weapon: null, offhand: null, helmet: null, armor: null, boots: null, cape: null }, iron: 0, obols: 0 };
  let sel: { kind: "slot"; i: number } | { kind: "equip"; s: EquipSlot } | null = null;
  let confirmDrop = false;

  const isOpen = () => back.classList.contains("open");
  const open = () => { back.classList.add("open"); render(); };
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

  // ---- dica flutuante (passar o mouse): atributos e comparação com o equipado
  const tip = document.createElement("div");
  tip.className = "iv-tip";
  tip.style.display = "none";
  document.body.append(tip);
  const hideTip = () => { tip.style.display = "none"; };
  function showTip(e: MouseEvent, data: { def: ItemDef; cmp?: ItemDef | null; extra?: string }) {
    const d = data.def;
    tip.replaceChildren();
    tip.style.setProperty("--rc", RARITY_COLOR[d.rarity]);
    const h = document.createElement("h4"); h.textContent = d.name; h.style.color = RARITY_COLOR[d.rarity];
    const sm = document.createElement("small");
    sm.textContent = `${RARITY_NAME[d.rarity]}${d.kind !== "potion" ? ` · ${EQUIP_SLOT_NAME[d.kind as EquipSlot]}` : ""}${d.hands ? ` · ${d.hands === 2 ? "duas mãos" : "uma mão"}` : ""}`;
    tip.append(h, sm);
    const cmp = data.cmp && data.cmp.id !== d.id ? data.cmp : null;
    for (const st of STAT_DEFS) {
      const v = (d[st.k] as number) ?? 0;
      if (!v && !(cmp && (cmp[st.k] as number))) continue;
      const row = document.createElement("div"); row.className = "row";
      const l = document.createElement("span"); l.textContent = v ? st.line(v) : `— ${st.name}`;
      row.append(l);
      if (cmp) {
        const diff = v - (((cmp[st.k] as number) ?? 0));
        const r = document.createElement("span");
        r.className = diff > 0 ? "up" : diff < 0 ? "dn" : "eq";
        r.textContent = diff > 0 ? `▲ ${diff}` : diff < 0 ? `▼ ${-diff}` : "=";
        row.append(r);
      }
      tip.append(row);
    }
    if (d.heal) { const r = document.createElement("div"); r.textContent = `Cura ${d.heal} de vida`; tip.append(r); }
    const wtd = d.wtype ? WEAPON_TYPES[d.wtype] : null;
    if (wtd) { const r = document.createElement("div"); r.className = "eq"; r.textContent = wtd.name; tip.append(r); }
    if (d.cls && d.cls !== opts.getClass()) { const r = document.createElement("div"); r.className = "bad"; r.textContent = `Exclusivo: ${CLASS_DEFS[d.cls].name}`; tip.append(document.createElement("hr"), r); }
    else if (d.minLevel > opts.getLevel()) { const r = document.createElement("div"); r.className = "bad"; r.textContent = `Requer nível ${d.minLevel}`; tip.append(document.createElement("hr"), r); }
    if (cmp) { const r = document.createElement("div"); r.className = "eq"; r.textContent = `vs. equipado: ${cmp.name}`; tip.append(r); }
    if (data.extra) { const r = document.createElement("div"); r.className = "eq"; r.textContent = data.extra; tip.append(r); }
    tip.style.display = "block";
    moveTip(e);
  }
  function moveTip(e: MouseEvent) {
    const w = tip.offsetWidth, h = tip.offsetHeight;
    tip.style.left = `${Math.max(6, Math.min(innerWidth - w - 6, e.clientX + 14))}px`;
    tip.style.top = `${Math.max(6, Math.min(innerHeight - h - 6, e.clientY + 14))}px`;
  }
  /** só com mouse: no toque o painel de detalhes (com a mesma comparação) faz esse papel e a tela não se polui */
  function attachTip(b: HTMLElement, get: () => { def: ItemDef; cmp?: ItemDef | null; extra?: string }) {
    b.onmouseenter = (e) => showTip(e, get());
    b.onmousemove = moveTip;
    b.onmouseleave = hideTip;
  }

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
      b.draggable = true;
      b.ondragstart = (e) => startDrag(e, { from: "equip", s });
      b.ondragend = endDrag;
      b.ondblclick = () => opts.send(Msg.InvUnequip, { slot: s });
      attachTip(b, () => ({ def, extra: "Duplo clique: desequipar" }));
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
    dollEl.innerHTML = SILHOUETTE;
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
        b.draggable = true;
        b.ondragstart = (e) => startDrag(e, { from: "slot", i });
        b.ondragend = endDrag;
        b.ondblclick = () => { if (def.kind === "potion") opts.send(Msg.InvUse, { slot: i }); else opts.send(Msg.InvEquip, { slot: i }); };
        attachTip(b, () => ({ def, cmp: def.kind !== "potion" ? equippedDef(def.kind as EquipSlot) : null }));
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
    if ((e.code === "KeyI" || e.code === "KeyB") && !document.querySelector(".gm-back.open")) { e.preventDefault(); toggle(); }
  }, true);

  render();
  return {
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
