import {
  ITEMS, INV_SLOTS, Msg, RARITY_COLOR, RARITY_NAME,
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
.iv-card{width:min(380px,100%);max-height:calc(100vh - 24px);overflow:auto;padding:16px;border-radius:8px;color:#dbeaff;
  background:linear-gradient(180deg,rgba(20,34,52,.97),rgba(6,12,20,.98));border:1px solid rgba(255,150,70,.4);box-shadow:0 18px 50px rgba(0,0,0,.7),inset 0 1px 0 rgba(180,220,255,.12)}
.iv-head{display:flex;align-items:center;justify-content:space-between;margin-bottom:10px}
.iv-title{margin:0;font-size:14px;font-weight:700;letter-spacing:.35em;text-transform:uppercase;color:#ffb072;text-shadow:0 0 14px rgba(255,120,40,.5)}
.iv-x{width:34px;height:34px;border-radius:50%;cursor:pointer;color:#bcd8f5;background:transparent;border:1px solid rgba(160,200,240,.3);font:700 16px/1 Georgia,serif}
.iv-eq{display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:8px}
.iv-eqs{display:flex;align-items:center;gap:8px;padding:6px;border-radius:5px;background:rgba(6,12,20,.7);border:1px solid rgba(160,200,240,.2);min-height:52px;cursor:pointer;text-align:left;color:inherit;font:inherit}
.iv-eqs small{display:block;font:400 9px/1.2 Georgia,serif;letter-spacing:.12em;text-transform:uppercase;color:#7fa6cc}
.iv-eqs b{display:block;font:700 11px/1.2 "Cinzel",Georgia,serif}
.iv-stats{font:400 12px/1.4 Georgia,serif;color:#9fc0e0;margin:0 0 10px;text-align:center}
.iv-grid{display:grid;grid-template-columns:repeat(5,1fr);gap:6px}
.iv-slot{position:relative;aspect-ratio:1;border-radius:5px;cursor:pointer;display:grid;place-items:center;padding:0;color:inherit;
  background:rgba(6,12,20,.8);border:1px solid rgba(160,200,240,.2);transition:border-color .15s}
.iv-slot:hover{border-color:#ff9a4d}
.iv-slot[aria-pressed=true]{border-color:#ffd08a;box-shadow:0 0 14px rgba(255,170,80,.4)}
.iv-slot svg,.iv-eqs svg{width:70%;height:70%}
.iv-eqs svg{width:34px;height:34px;flex:none}
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
} as const;
const BAG = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M6 8h12l1.5 12H4.5z"/><path d="M9 8V6a3 3 0 0 1 6 0v2"/></svg>`;

const icon = (d: ItemDef) => `<span style="color:${RARITY_COLOR[d.rarity]};display:contents">${ICONS[d.kind]}</span>`;

function statsLine(d: ItemDef): string {
  if (d.dmgPct) return `+${d.dmgPct}% de dano`;
  if (d.hp) return `+${d.hp} de vida`;
  if (d.heal) return `Cura ${d.heal} de vida`;
  return "";
}

export function mountInventory(opts: { send(type: string, payload: unknown): void; getLevel(): number }): InventoryUi {
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
      <div class="iv-head"><h2 class="iv-title">Mochila</h2><button type="button" class="iv-x" aria-label="Fechar">&times;</button></div>
      <div class="iv-eq"></div>
      <p class="iv-stats"></p>
      <div class="iv-grid" role="group" aria-label="Espaços da mochila"></div>
      <div class="iv-det"></div>
    </div>`;
  const toasts = document.createElement("div");
  toasts.className = "iv-toasts";
  toasts.setAttribute("aria-live", "polite");
  document.body.append(btn, back, toasts);

  const eqEl = back.querySelector<HTMLElement>(".iv-eq")!;
  const statsEl = back.querySelector<HTMLElement>(".iv-stats")!;
  const gridEl = back.querySelector<HTMLElement>(".iv-grid")!;
  const detEl = back.querySelector<HTMLElement>(".iv-det")!;

  let snap: InventorySnapshot = { inv: Array.from({ length: INV_SLOTS }, () => null), equip: { weapon: null, armor: null } };
  let sel: { kind: "slot"; i: number } | { kind: "equip"; s: EquipSlot } | null = null;
  let confirmDrop = false;

  const isOpen = () => back.classList.contains("open");
  const open = () => { back.classList.add("open"); render(); };
  const close = () => { back.classList.remove("open"); btn.focus(); };
  const toggle = () => (isOpen() ? close() : open());

  function render() {
    // equipamento
    eqEl.innerHTML = "";
    for (const [s, label] of [["weapon", "Arma"], ["armor", "Armadura"]] as const) {
      const id = snap.equip[s];
      const def = id ? ITEMS[id] : null;
      const b = document.createElement("button");
      b.type = "button";
      b.className = "iv-eqs";
      b.setAttribute("aria-pressed", String(sel?.kind === "equip" && sel.s === s));
      b.innerHTML = `${def ? icon(def) : `<span style="width:34px;height:34px;flex:none"></span>`}<span><small></small><b></b></span>`;
      b.querySelector("small")!.textContent = label;
      const nm = b.querySelector("b")!;
      nm.textContent = def?.name ?? "Vazio";
      if (def) nm.style.color = RARITY_COLOR[def.rarity];
      b.onclick = () => { sel = def ? { kind: "equip", s } : null; confirmDrop = false; render(); };
      eqEl.append(b);
    }
    // bônus totais
    const w = snap.equip.weapon ? ITEMS[snap.equip.weapon] : null;
    const a = snap.equip.armor ? ITEMS[snap.equip.armor] : null;
    statsEl.textContent = `Dano +${w?.dmgPct ?? 0}%  ·  Vida +${a?.hp ?? 0}`;
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
        b.style.borderColor = RARITY_COLOR[def.rarity] + "66";
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
    p1.textContent = `${RARITY_NAME[def.rarity]} · ${statsLine(def)}`;
    const p2 = document.createElement("p");
    p2.textContent = def.desc;
    detEl.append(h, p1, p2);
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
      mk(confirmDrop ? "Confirmar?" : "Descartar", true, () => {
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

  btn.onclick = toggle;
  back.querySelector<HTMLElement>(".iv-x")!.onclick = close;
  back.onclick = (e) => { if (e.target === back) close(); };
  // captura: com a mochila aberta, ESC fecha só a mochila (e não abre o menu)
  window.addEventListener("keydown", (e) => {
    if (e.repeat) return;
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
    toast(text, color = "#ffffff") {
      const t = document.createElement("div");
      t.className = "iv-toast";
      t.textContent = text; // textContent: nunca interpretar HTML vindo do servidor
      t.style.color = color;
      toasts.append(t);
      while (toasts.children.length > 4) toasts.firstElementChild?.remove();
      setTimeout(() => t.remove(), 2900);
    },
  };
}
