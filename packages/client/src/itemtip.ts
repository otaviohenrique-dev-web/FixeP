import { fmtDelta } from "./poder";
import { RARITY_COLOR, RARITY_NAME, CLASS_DEFS, EQUIP_SLOT_NAME, WEAPON_TYPES, afixoLinha, setDaPeca, setAtivo, setBonusLinhas, type ItemDef, type EquipSlot, type CharClass } from "@frixep/shared";
/**
 * Dica de item: a MESMA ficha em todo lugar (mochila, trocas, mercado, baú).
 * - PC: aparece ao passar o mouse e segue o ponteiro.
 * - Celular: aparece ao tocar no item, logo acima dele; some ao tocar fora.
 * Atributos da arma incluem o kit do tipo (ex.: crítico da besta). Na comparação com o equipado,
 * ▲ é melhor, ▼ é pior e = é igual. Para recarga e custo, valor menor é melhor.
 */

export interface ItemTipData { def: ItemDef; cmp?: ItemDef | null; extra?: string; af?: string[]; rf?: number } // rf: nível de refino (+N) // af: afixos do item (cor da raridade)
export interface ItemTipCtx {
  getClass(): CharClass;
  getLevel(): number;
  /** peças equipadas agora (para contar o conjunto na dica); ausente = sem contagem */
  getEquip?(): Partial<Record<EquipSlot, string | null>>;
  /** prévia do poder total ao equipar este item (no slot dele): poder atual e a mudança (0 = igual) */
  previewPoder?(d: ItemDef): { now: number; delta: number } | null;
}

/** Uma linha de atributo: valor efetivo do item, rótulo, unidade e se "mais" é melhor. */
interface StatRow { label: string; unit: string; value: number; up: boolean }

/** Kit do tipo de arma (multiplicadores em torno de 1 e pontos de crítico). Só armas têm kit. */
function kitOf(d: ItemDef): Record<string, number> {
  if (d.kind !== "weapon" || !d.wtype) return {};
  return (WEAPON_TYPES[d.wtype]?.kit as unknown as Record<string, number>) ?? {};
}

/** Todos os atributos do item, já com o kit da arma. Multiplicadores viram % (ex.: recarga 0,9 → −10%). */
function rowsOf(d: ItemDef): StatRow[] {
  const k = kitOf(d);
  const pct = (m: number | undefined) => Math.round(((m ?? 1) - 1) * 100);
  return [
    { label: "poder", unit: "%", value: d.dmgPct ?? 0, up: true },
    { label: "vida", unit: "", value: d.hp ?? 0, up: true },
    { label: "crítico", unit: "%", value: (d.crit ?? 0) + (k.crit ?? 0), up: true },
    { label: "redução de dano recebido", unit: "%", value: d.dr ?? 0, up: true },
    { label: "recarga menor", unit: "%", value: d.cdr ?? 0, up: true },
    { label: "recurso máx.", unit: "", value: d.mana ?? 0, up: true },
    { label: "regen. de recurso", unit: "/s", value: d.regen ?? 0, up: true },
    { label: "dano das habilidades", unit: "%", value: pct(k.dmg), up: true },
    { label: "recarga das habilidades", unit: "%", value: pct(k.cd), up: false },
    { label: "custo das habilidades", unit: "%", value: pct(k.cost), up: false },
    { label: "área das habilidades", unit: "%", value: pct(k.radius), up: true },
    { label: "alcance", unit: "%", value: pct(k.range), up: true },
    { label: "cura", unit: "%", value: pct(k.heal), up: true },
  ];
}

const signed = (v: number) => `${v > 0 ? "+" : v < 0 ? "−" : ""}${Math.abs(v)}`;
const valueText = (r: StatRow) => `${signed(r.value)}${r.unit} ${r.label}`;

/**
 * Diferença de atributos entre o item novo (`a`) e o equipado (`b`): só o que muda ou existe em um dos dois.
 * `delta` é 1 (melhor), −1 (pior) ou 0 (igual). Usado no painel de detalhes do celular.
 */
export function compareStats(a: ItemDef, b: ItemDef): { text: string; delta: number }[] {
  const out: { text: string; delta: number }[] = [];
  const rb = rowsOf(b);
  rowsOf(a).forEach((ra, i) => {
    const diff = ra.value - rb[i].value;
    if (!diff) { if (ra.value) out.push({ text: `= ${valueText(ra)}`, delta: 0 }); return; }
    const better = ra.up ? diff > 0 : diff < 0;
    out.push({ text: `${better ? "▲" : "▼"} ${signed(diff)}${ra.unit} ${ra.label}`, delta: better ? 1 : -1 });
  });
  return out;
}

const CSS = `
.iv-tip{position:fixed;z-index:60;max-width:270px;padding:9px 11px;border-radius:6px;pointer-events:none;color:#dbeaff;font:400 12px/1.4 Georgia,serif;
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
  const h = document.createElement("h4"); h.textContent = d.name + (data.rf ? " +" + data.rf : ""); h.style.color = RARITY_COLOR[d.rarity];
  const sm = document.createElement("small");
  const tipo = d.kind === "material" ? "Material de craft" : EQUIP_SLOT_NAME[d.kind as EquipSlot];
  sm.textContent = `${RARITY_NAME[d.rarity]}${d.kind !== "potion" ? ` · ${tipo}` : ""}${d.hands ? ` · ${d.hands === 2 ? "duas mãos" : "uma mão"}` : ""}`;
  t.append(h, sm);
  const cmp = data.cmp && data.cmp.id !== d.id ? data.cmp : null;
  const rb = cmp ? rowsOf(cmp) : null;
  rowsOf(d).forEach((r, i) => {
    if (!r.value && !(rb && rb[i].value)) return;
    const row = document.createElement("div"); row.className = "row";
    const l = document.createElement("span"); l.textContent = r.value ? valueText(r) : `— ${r.label}`;
    row.append(l);
    if (rb) {
      const diff = r.value - rb[i].value;
      const better = r.up ? diff > 0 : diff < 0;
      const sp = document.createElement("span");
      sp.className = !diff ? "eq" : better ? "up" : "dn";
      sp.textContent = !diff ? "=" : `${better ? "▲" : "▼"} ${Math.abs(diff)}${r.unit}`;
      row.append(sp);
    }
    t.append(row);
  });
  // afixos (atributos de drop): uma linha por afixo, na cor da raridade do item
  for (const id of data.af ?? []) { const r = document.createElement("div"); r.className = "afixo"; r.style.color = RARITY_COLOR[d.rarity]; r.textContent = afixoLinha(id, d.rarity); t.append(r); }
  // conjunto (C3.4): "Conjunto X (n/4)" com os bônus de 2 e de 4 peças; o bônus ativo agora aparece em destaque
  const st = setDaPeca(d.id) ? setAtivo(ctx.getEquip?.() ?? {}, setDaPeca(d.id)!.classe) : null;
  if (st && st.set.id === setDaPeca(d.id)!.id) {
    const cab = document.createElement("div"); cab.className = "conjunto"; cab.textContent = `${st.set.nome} (${st.n}/4)`; t.append(cab);
    for (const [n, b] of [[2, st.set.b2], [4, st.set.b4]] as const) {
      const ativo = st.bonus !== null && st.bonus === b;
      const l = document.createElement("div"); l.className = ativo ? "conjunto-b ativo" : "conjunto-b"; l.textContent = `${n} peças: ${setBonusLinhas(b).join(", ")}`; t.append(l);
    }
  }
  const pv = ctx.previewPoder?.(d);
  if (pv) {
    const r = document.createElement("div"); r.className = "row";
    const l = document.createElement("span"); l.textContent = "Poder total";
    const v = document.createElement("span");
    v.className = !pv.delta ? "eq" : pv.delta > 0 ? "up" : "dn";
    v.textContent = pv.delta ? `${pv.now} → ${pv.now + pv.delta} (${fmtDelta(pv.delta)})` : `${pv.now} (= )`;
    r.append(l, v); t.append(r);
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
  // toque: a dica abre ao SEGURAR (0,45 s) e fica aberta; o toque curto só seleciona o item (antes a dica abria no
  // toque e sumia ao selecionar, e o arrastar nativo do celular cancelava o segurar)
  let timer = 0, x0 = 0, y0 = 0;
  const limpar = () => { clearTimeout(timer); timer = 0; };
  el.addEventListener("pointerdown", (e) => {
    if (e.pointerType !== "touch") return;
    limpar();
    x0 = e.clientX; y0 = e.clientY;
    timer = window.setTimeout(() => {
      timer = 0;
      build(get());
      owner = el;
      ensure().style.display = "block";
      const r = el.getBoundingClientRect();
      place(r.left + r.width / 2, r.top, true);
      try { navigator.vibrate?.(15); } catch { /* sem vibração */ }
      // o soltar do dedo depois do segurar não pode selecionar/rerenderizar o item
      const engolir = (ev: Event) => { ev.stopImmediatePropagation(); ev.preventDefault(); };
      el.addEventListener("click", engolir, { capture: true, once: true });
      setTimeout(() => el.removeEventListener("click", engolir, true), 700);
    }, 450);
  });
  el.addEventListener("pointermove", (e) => { if (timer && Math.hypot(e.clientX - x0, e.clientY - y0) > 10) limpar(); });
  el.addEventListener("pointerup", limpar);
  el.addEventListener("pointercancel", limpar);
  el.addEventListener("contextmenu", (e) => e.preventDefault());
}

/** celular/tablet (toque principal): sem arrastar nativo, que cancela o segurar e o toque */
export const COARSE = typeof matchMedia === "function" && matchMedia("(pointer: coarse)").matches;

/** duplo toque no celular (o dblclick nativo não é confiável no toque); no mouse o dblclick normal continua valendo */
let toque = { k: "", t: 0 }, acao = 0; // estado global: o inventário recria os botões a cada toque, então a chave (não o elemento) identifica o item
export function bindDoubleTap(el: HTMLElement, key: string, fn: () => void): void {
  const rodar = () => { const n = Date.now(); if (n - acao < 500) return; acao = n; fn(); };
  el.addEventListener("dblclick", rodar);
  el.addEventListener("pointerup", (e) => {
    if (e.pointerType !== "touch") return;
    const n = Date.now();
    if (toque.k === key && n - toque.t < 350) { toque = { k: "", t: 0 }; rodar(); } else toque = { k: key, t: n };
  });
}

// toque fora da dica e do item fecha a dica
document.addEventListener("pointerdown", (e) => {
  if (!tip || !owner || tip.style.display === "none") return;
  const target = e.target as Node;
  if (!tip.contains(target) && !owner.contains(target)) hideItemTip();
}, true);
