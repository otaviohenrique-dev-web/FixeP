import { RARITY_COLOR, RARITY_NAME, CLASS_DEFS, EQUIP_SLOT_NAME, WEAPON_TYPES, type ItemDef, type EquipSlot, type CharClass } from "@frixep/shared";
/**
 * Dica de item: a MESMA ficha em todo lugar (mochila, trocas, mercado, baú).
 * - PC: aparece ao passar o mouse e segue o ponteiro.
 * - Celular: aparece ao tocar no item, logo acima dele; some ao tocar fora.
 * A comparação com o equipado mostra ▲ (mais forte) e ▼ (mais fraco) em cada atributo.
 */

export interface ItemTipData { def: ItemDef; cmp?: ItemDef | null; extra?: string }
export interface ItemTipCtx { getClass(): CharClass; getLevel(): number }

export const STAT_DEFS: { k: keyof ItemDef; name: string; unit: string; line: (v: number) => string }[] = [
  { k: "dmgPct", name: "poder", unit: "%", line: (v) => `+${v}% de poder` }, { k: "hp", name: "vida", unit: "", line: (v) => `+${v} de vida` },
  { k: "crit", name: "crítico", unit: "%", line: (v) => `+${v}% de crítico` }, { k: "dr", name: "defesa", unit: "%", line: (v) => `−${v}% de dano recebido` },
  { k: "cdr", name: "recarga menor", unit: "%", line: (v) => `−${v}% de recarga` }, { k: "mana", name: "recurso", unit: "", line: (v) => `+${v} de recurso máx.` },
  { k: "regen", name: "regen.", unit: "/s", line: (v) => `+${v}/s de recurso` },
];

/** diferença de atributos entre o item novo e o equipado (só o que muda); ▲ = mais forte, ▼ = mais fraco */
export function compareStats(a: ItemDef, b: ItemDef): { text: string; delta: number }[] {
  const out: { text: string; delta: number }[] = [];
  for (const st of STAT_DEFS) {
    const d = Math.round((((a[st.k] as number) ?? 0) - ((b[st.k] as number) ?? 0)) * 100) / 100;
    if (d) out.push({ text: `${d > 0 ? "▲" : "▼"} ${Math.abs(d)}${st.unit} ${st.name}`, delta: d });
  }
  return out;
}

const CSS = `
.iv-tip{position:fixed;z-index:60;max-width:260px;padding:9px 11px;border-radius:6px;pointer-events:none;color:#dbeaff;font:400 12px/1.4 Georgia,serif;
  background:linear-gradient(180deg,rgba(14,22,34,.97),rgba(6,10,16,.97));border:1px solid var(--rc,#6b7d92);box-shadow:0 6px 18px rgba(0,0,0,.6)}
.iv-tip h4{margin:0 0 1px;font:700 13px/1.2 "Cinzel",Georgia,serif}
.iv-tip small{display:block;color:#8fb0cf;margin-bottom:4px}
.iv-tip .row{display:flex;justify-content:space-between;gap:10px;color:#b9d2ea}
.iv-tip .up{color:#7dd68a;font-weight:700}
.iv-tip .dn{color:#ff8f7e;font-weight:700}
.iv-tip .eq{color:#8fb0cf}
.iv-tip .bad{color:#ff8f7e}
.iv-tip hr{border:0;border-top:1px solid rgba(160,200,240,.2);margin:5px 0}
`;

let tip: HTMLDivElement | null = null;
let owner: HTMLElement | null = null; // item cuja dica está aberta
let ctx: ItemTipCtx = { getClass: () => "warrior", getLevel: () => 1 };

/** quem está jogando (para a classe e o nível da dica): ligado uma vez, ao montar a mochila */
export function setItemTipContext(c: ItemTipCtx): void { ctx = c; }

function ensure(): HTMLDivElement {
  if (tip) return tip;
  const st = document.createElement("style");
  st.textContent = CSS;
  document.head.append(st);
  tip = document.createElement("div");
  tip.className = "iv-tip";
  tip.style.display = "none";
  document.body.append(tip);
  return tip;
}

function build(data: ItemTipData): void {
  const t = ensure();
  const d = data.def;
  t.replaceChildren();
  t.style.setProperty("--rc", RARITY_COLOR[d.rarity]);
  const h = document.createElement("h4"); h.textContent = d.name; h.style.color = RARITY_COLOR[d.rarity];
  const sm = document.createElement("small");
  sm.textContent = `${RARITY_NAME[d.rarity]}${d.kind !== "potion" ? ` · ${EQUIP_SLOT_NAME[d.kind as EquipSlot]}` : ""}${d.hands ? ` · ${d.hands === 2 ? "duas mãos" : "uma mão"}` : ""}`;
  t.append(h, sm);
  const cmp = data.cmp && data.cmp.id !== d.id ? data.cmp : null;
  for (const st of STAT_DEFS) {
    const v = (d[st.k] as number) ?? 0;
    if (!v && !(cmp && (cmp[st.k] as number))) continue;
    const row = document.createElement("div"); row.className = "row";
    const l = document.createElement("span"); l.textContent = v ? st.line(v) : `— ${st.name}`;
    row.append(l);
    if (cmp) {
      const diff = v - ((cmp[st.k] as number) ?? 0);
      const r = document.createElement("span");
      r.className = diff > 0 ? "up" : diff < 0 ? "dn" : "eq";
      r.textContent = diff > 0 ? `▲ ${diff}` : diff < 0 ? `▼ ${-diff}` : "=";
      row.append(r);
    }
    t.append(row);
  }
  if (d.heal) { const r = document.createElement("div"); r.textContent = `Cura ${d.heal} de vida`; t.append(r); }
  const wtd = d.wtype ? WEAPON_TYPES[d.wtype] : null;
  if (wtd) { const r = document.createElement("div"); r.className = "eq"; r.textContent = wtd.name; t.append(r); }
  if (d.cls && d.cls !== ctx.getClass()) { const r = document.createElement("div"); r.className = "bad"; r.textContent = `Exclusivo: ${CLASS_DEFS[d.cls].name}`; t.append(document.createElement("hr"), r); }
  else if (d.minLevel > ctx.getLevel()) { const r = document.createElement("div"); r.className = "bad"; r.textContent = `Requer nível ${d.minLevel}`; t.append(document.createElement("hr"), r); }
  if (cmp) { const r = document.createElement("div"); r.className = "eq"; r.textContent = `vs. equipado: ${cmp.name}`; t.append(r); }
  if (data.extra) { const r = document.createElement("div"); r.className = "eq"; r.textContent = data.extra; t.append(r); }
}

/** posiciona a dica dentro da tela: no mouse segue o ponteiro; no toque fica logo acima do item */
function place(x: number, y: number, above: boolean) {
  const t = ensure();
  const w = t.offsetWidth, h = t.offsetHeight;
  const left = Math.max(6, Math.min(innerWidth - w - 6, x - (above ? w / 2 : -14)));
  const top = above ? y - h - 10 : y + 14;
  t.style.left = `${left}px`;
  t.style.top = `${Math.max(6, Math.min(innerHeight - h - 6, top))}px`;
}

export function hideItemTip(): void {
  if (tip) tip.style.display = "none";
  owner = null;
}

/** liga a dica a um elemento: mouse (passar) e toque (tocar) */
export function bindItemTip(el: HTMLElement, get: () => ItemTipData): void {
  el.addEventListener("mouseenter", (e) => {
    build(get());
    owner = el;
    ensure().style.display = "block";
    place(e.clientX, e.clientY, false);
  });
  el.addEventListener("mousemove", (e) => { if (owner === el) place(e.clientX, e.clientY, false); });
  el.addEventListener("mouseleave", () => { if (owner === el) hideItemTip(); });
  el.addEventListener("pointerdown", (e) => {
    if (e.pointerType !== "touch") return;
    build(get());
    owner = el;
    ensure().style.display = "block";
    const r = el.getBoundingClientRect();
    place(r.left + r.width / 2, r.top, true);
  });
}

// toque fora da dica e do item fecha a dica
document.addEventListener("pointerdown", (e) => {
  if (!tip || !owner || tip.style.display === "none") return;
  const target = e.target as Node;
  if (!tip.contains(target) && !owner.contains(target)) hideItemTip();
}, true);
