import { isTypingTarget } from "./keys";
import { ITEMS, INV_SLOTS, Msg, RARITY_COLOR, RARITY_NAME, COIN_IRON, COIN_OBOL, VAULT_PAGE, VAULT_PAGES, VAULT_SLOTS, type InventorySnapshot, type VaultSnapshot, type ItemDef } from "@frixep/shared";

/**
 * Baú de armazenamento da cidade (DOM). O servidor decide tudo (distância, espaço, saldo): aqui só se mostra a fotografia e se pedem as ações.
 * Toque/clique seleciona; com um item da mochila selecionado, "Guardar" o leva ao baú (e vice-versa). Arrastar também funciona (computador).
 */
export interface VaultUi {
  setInventory(s: InventorySnapshot): void;
  setVault(v: VaultSnapshot): void;
  open(): void;
  close(): void;
  isOpen(): boolean;
  /** jogador ao alcance do baú: mostra o botão "Abrir o baú" (toque e tecla G) */
  setNear(near: boolean): void;
}

const CSS = `
.vt-near{position:fixed;left:50%;bottom:calc(max(96px,env(safe-area-inset-bottom)) + 70px);transform:translateX(-50%);z-index:18;display:none;min-height:42px;padding:0 18px;border-radius:21px;cursor:pointer;
  font:700 12px/1 "Cinzel",Georgia,serif;letter-spacing:.12em;color:#fbe9bf;background:rgba(58,36,16,.9);border:2px solid #e0b565;box-shadow:0 4px 14px rgba(0,0,0,.6),0 0 18px rgba(255,170,70,.3);touch-action:manipulation}
.vt-near.show{display:block}
.vt-near kbd{margin-right:8px;font:inherit;opacity:.7}
@media (max-width:620px){.vt-near{bottom:calc(max(96px,env(safe-area-inset-bottom)) + 150px)}.vt-near kbd{display:none}}
.vt-back{position:fixed;inset:0;z-index:22;display:none;align-items:center;justify-content:center;background:rgba(14,8,4,.62);padding:10px;font-family:"Cinzel",Georgia,serif}
.vt-back.open{display:flex}
.vt-card{width:min(900px,100%);max-height:calc(100vh - 20px);display:flex;flex-direction:column;border-radius:10px;color:#f3e6cc;overflow:hidden;
  background:linear-gradient(180deg,rgba(52,34,20,.98),rgba(24,15,9,.99));border:1px solid rgba(224,181,101,.6);box-shadow:0 18px 50px rgba(0,0,0,.75),inset 0 1px 0 rgba(255,225,170,.15)}
.vt-head{display:flex;align-items:center;gap:10px;padding:12px 14px 8px}
.vt-title{margin:0;flex:1;font-size:14px;font-weight:700;letter-spacing:.28em;text-transform:uppercase;color:#f1c57a;text-shadow:0 0 14px rgba(255,150,50,.5)}
.vt-title small{display:block;margin-top:3px;font:400 11px/1.2 Georgia,serif;letter-spacing:.02em;text-transform:none;color:#cdb48a;text-shadow:none}
.vt-x{width:34px;height:34px;border-radius:50%;cursor:pointer;color:#e7d3ab;background:transparent;border:1px solid rgba(224,181,101,.4);font:700 16px/1 Georgia,serif}
.vt-x:focus-visible,.vt-btn:focus-visible,.vt-pg:focus-visible,.vt-near:focus-visible,.vt-slot:focus-visible{outline:2px solid #ffd9a0;outline-offset:2px}
.vt-body{flex:1 1 auto;display:grid;grid-template-columns:1.45fr 1fr;gap:12px;padding:0 14px 10px;overflow:auto;min-height:0}
@media (max-width:700px){.vt-body{grid-template-columns:1fr}}
.vt-col{display:flex;flex-direction:column;gap:7px;padding:8px;border-radius:7px;background:rgba(18,11,6,.55);border:1px solid rgba(224,181,101,.22);min-width:0}
.vt-col h3{margin:0;display:flex;justify-content:space-between;gap:6px;font:700 11px/1.2 "Cinzel",Georgia,serif;letter-spacing:.16em;text-transform:uppercase;color:#f1c57a}
.vt-col h3 em{font-style:normal;color:#b9d99a;letter-spacing:.04em}
.vt-pages{display:flex;gap:5px}
.vt-pg{flex:1;min-height:34px;border-radius:5px;cursor:pointer;font:700 11px/1 "Cinzel",Georgia,serif;color:#cdb48a;background:rgba(18,11,6,.75);border:1px solid rgba(224,181,101,.22);touch-action:manipulation}
.vt-pg[aria-selected=true]{color:#fff;border-color:#f1b45a;background:rgba(255,160,60,.14)}
.vt-pg i{display:block;font:400 9px/1 Georgia,serif;font-style:normal;margin-top:3px;opacity:.7}
.vt-grid{display:grid;gap:5px}
.vt-grid.v{grid-template-columns:repeat(6,1fr)}
.vt-grid.b{grid-template-columns:repeat(5,1fr)}
.vt-slot{position:relative;aspect-ratio:1;border-radius:5px;cursor:pointer;display:grid;place-items:center;padding:0;color:inherit;background:rgba(14,8,4,.85);border:1px solid rgba(224,181,101,.2);touch-action:manipulation}
.vt-slot:hover{border-color:#f1b45a}
.vt-slot[aria-pressed=true]{border-color:#ffd9a0;box-shadow:0 0 12px rgba(255,180,80,.5)}
.vt-slot.over{border-color:#b9d99a;box-shadow:0 0 12px rgba(160,230,140,.4)}
.vt-slot img{width:76%;height:76%;image-rendering:pixelated;object-fit:contain;pointer-events:none;filter:drop-shadow(0 2px 3px rgba(0,0,0,.7))}
.vt-qty{position:absolute;right:3px;bottom:2px;font:700 10px/1 "Cinzel",Georgia,serif;text-shadow:0 1px 3px #000}
.vt-det{display:flex;flex-wrap:wrap;align-items:center;gap:8px;margin:0 14px 8px;padding:8px 10px;min-height:54px;border-radius:7px;background:rgba(18,11,6,.7);border:1px solid rgba(224,181,101,.25)}
.vt-det .t{flex:1;min-width:150px}
.vt-det b{display:block;font:700 12px/1.25 "Cinzel",Georgia,serif}
.vt-det small{display:block;font:400 11px/1.3 Georgia,serif;color:#cdb48a}
.vt-qtyrow{display:flex;align-items:center;gap:5px}
.vt-qtyrow input{width:54px;min-height:34px;box-sizing:border-box;padding:0 6px;border-radius:5px;border:1px solid rgba(224,181,101,.35);background:rgba(14,8,4,.9);color:#fff;font:700 12px/1 "Cinzel",Georgia,serif;text-align:center}
.vt-btn{min-height:36px;padding:0 12px;border-radius:5px;cursor:pointer;font:700 11px/1 "Cinzel",Georgia,serif;letter-spacing:.1em;text-transform:uppercase;color:#fbeed1;
  background:linear-gradient(180deg,rgba(80,52,26,.9),rgba(34,21,11,.95));border:1px solid rgba(224,181,101,.5);touch-action:manipulation}
.vt-btn:hover:not(:disabled){border-color:#ffc56b}
.vt-btn:disabled{opacity:.4;cursor:default}
.vt-coins{display:flex;flex-direction:column;gap:6px;padding:8px 14px 14px;border-top:1px solid rgba(224,181,101,.15)}
.vt-coin{display:flex;align-items:center;flex-wrap:wrap;gap:8px;font:700 12px/1 "Cinzel",Georgia,serif}
.vt-coin img{width:20px;height:20px;image-rendering:pixelated}
.vt-coin .n{flex:1;min-width:150px;display:flex;align-items:center;gap:6px;white-space:nowrap}
.vt-coin .n span{color:#cdb48a;font-weight:400;font-size:11px}
.vt-coin input{width:104px;min-height:34px;box-sizing:border-box;padding:0 6px;border-radius:5px;border:1px solid rgba(224,181,101,.35);background:rgba(14,8,4,.9);color:#fff;font:700 12px/1 "Cinzel",Georgia,serif}
`;

const el = <K extends keyof HTMLElementTagNameMap>(tag: K, cls = "", text = ""): HTMLElementTagNameMap[K] => {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text) e.textContent = text;
  return e;
};
const num = (n: number) => n.toLocaleString("pt-BR");

function brief(d: ItemDef): string {
  const o: string[] = [];
  if (d.dmgPct) o.push(`+${d.dmgPct}% poder`);
  if (d.hp) o.push(`+${d.hp} vida`);
  if (d.crit) o.push(`+${d.crit}% crít.`);
  if (d.dr) o.push(`−${d.dr}% dano`);
  if (d.heal) o.push(`cura ${d.heal}`);
  return `${RARITY_NAME[d.rarity]} · nv ${d.minLevel}${o.length ? " · " + o.join(" · ") : ""}`;
}

export function mountVault(opts: { send(type: string, payload: unknown): void }): VaultUi {
  const style = el("style");
  style.textContent = CSS;
  document.head.append(style);

  let inv: InventorySnapshot = { inv: Array.from({ length: INV_SLOTS }, () => null), equip: { weapon: null, offhand: null, helmet: null, armor: null, boots: null, cape: null }, iron: 0, obols: 0 };
  let vault: VaultSnapshot = { slots: Array.from({ length: VAULT_SLOTS }, () => null), iron: 0, obols: 0 };
  let page = 0;
  let sel: { side: "bag" | "vault"; i: number } | null = null;
  let qty = 1;
  let isNear = false;

  const near = el("button", "vt-near");
  near.type = "button";
  near.replaceChildren(el("kbd", "", "G"), document.createTextNode("Abrir o baú"));
  document.body.append(near);

  const back = el("div", "vt-back");
  const card = el("div", "vt-card");
  card.setAttribute("role", "dialog");
  card.setAttribute("aria-modal", "true");
  card.setAttribute("aria-label", "Baú de armazenamento");
  back.append(card);
  document.body.append(back);

  const isOpen = () => back.classList.contains("open");
  const close = () => { back.classList.remove("open"); sel = null; near.classList.toggle("show", isNear); };
  const open = () => { page = Math.min(page, VAULT_PAGES - 1); back.classList.add("open"); near.classList.remove("show"); opts.send(Msg.VaultOpen, {}); render(); };
  near.onclick = open;
  back.onclick = (e) => { if (e.target === back) close(); };

  const stackOf = (side: "bag" | "vault", i: number) => (side === "bag" ? inv.inv[i] : vault.slots[i]) ?? null;

  function slotBtn(side: "bag" | "vault", i: number): HTMLButtonElement {
    const st = stackOf(side, i);
    const b = el("button", "vt-slot");
    b.type = "button";
    const def = st ? ITEMS[st.id] : undefined;
    b.setAttribute("aria-pressed", String(!!sel && sel.side === side && sel.i === i));
    b.setAttribute("aria-label", def ? `${def.name}${st!.qty > 1 ? ` x${st!.qty}` : ""}` : "Espaço vazio");
    if (def && st) {
      b.style.borderColor = RARITY_COLOR[def.rarity] + "88";
      const im = el("img");
      im.src = `/assets/items/item_${def.id}.png`; im.alt = ""; im.draggable = false;
      im.onerror = () => { im.style.visibility = "hidden"; };
      b.append(im);
      if (st.qty > 1) { const q = el("span", "vt-qty", String(st.qty)); q.style.color = "#fff"; b.append(q); }
      b.draggable = true;
      b.ondragstart = (e) => { e.dataTransfer?.setData("text/plain", `${side}:${i}`); sel = { side, i }; };
    }
    // alvo de soltar: bolsa -> baú (espaço escolhido), baú -> bolsa, baú -> baú
    b.ondragover = (e) => { e.preventDefault(); b.classList.add("over"); };
    b.ondragleave = () => b.classList.remove("over");
    b.ondrop = (e) => {
      e.preventDefault();
      b.classList.remove("over");
      const [fs, fi] = String(e.dataTransfer?.getData("text/plain") ?? "").split(":");
      const from = Number(fi);
      if (!Number.isInteger(from)) return;
      const st0 = stackOf(fs as "bag" | "vault", from);
      if (fs === "bag" && side === "vault") opts.send(Msg.VaultDeposit, { slot: from, qty: st0?.qty, to: i });
      else if (fs === "vault" && side === "bag") opts.send(Msg.VaultWithdraw, { slot: from, qty: st0?.qty, to: i });
      else if (fs === "vault" && side === "vault") opts.send(Msg.VaultMove, { from, to: i });
      sel = null;
    };
    b.onclick = () => {
      if (sel && sel.side === "vault" && side === "vault" && sel.i !== i && stackOf("vault", sel.i)) { // item do baú selecionado + outro espaço do baú: reorganiza
        opts.send(Msg.VaultMove, { from: sel.i, to: i });
        sel = null;
        return render();
      }
      if (sel && sel.side === side && sel.i === i) { sel = null; return render(); }
      sel = st ? { side, i } : null;
      qty = st ? st.qty : 1;
      render();
    };
    b.ondblclick = () => { if (st) move(side, i, st.qty); };
    return b;
  }

  function move(side: "bag" | "vault", i: number, n: number) {
    opts.send(side === "bag" ? Msg.VaultDeposit : Msg.VaultWithdraw, { slot: i, qty: n });
    sel = null;
  }

  function coinRow(kind: "iron" | "obols"): HTMLElement {
    const c = kind === "iron" ? COIN_IRON : COIN_OBOL;
    const row = el("div", "vt-coin");
    const im = el("img"); im.src = `/assets/items/item_${c.id}.png`; im.alt = ""; im.onerror = () => { im.style.visibility = "hidden"; };
    const n = el("div", "n");
    const label = el("b", "", c.name);
    label.style.color = kind === "obols" ? COIN_OBOL.color : "#e6dcc4";
    n.append(im, label, el("span", "", `Mochila ${num(inv[kind])} · Baú ${num(vault[kind])}`));
    const input = el("input");
    input.type = "number"; input.min = "1"; input.inputMode = "numeric"; input.placeholder = "Quantia";
    input.setAttribute("aria-label", `Quantia de ${c.name}`);
    const go = (dir: "in" | "out") => { const v = Math.floor(Number(input.value)); if (v >= 1) { opts.send(Msg.VaultCoins, { coin: kind, amount: v, dir }); input.value = ""; } };
    const a = el("button", "vt-btn", "Guardar"); a.type = "button"; a.onclick = () => go("in");
    const w = el("button", "vt-btn", "Retirar"); w.type = "button"; w.onclick = () => go("out");
    row.append(n, input, a, w);
    return row;
  }

  function render() {
    if (!isOpen()) return;
    const keep = document.activeElement instanceof HTMLInputElement ? { v: document.activeElement.value, label: document.activeElement.getAttribute("aria-label") } : null;
    card.replaceChildren();
    const head = el("div", "vt-head");
    const t = el("h2", "vt-title", "Baú de Brasalume");
    t.append(el("small", "", "Seu baú pessoal: o que você guarda aqui só você pega."));
    const x = el("button", "vt-x", "×"); x.type = "button"; x.setAttribute("aria-label", "Fechar"); x.onclick = close;
    head.append(t, x);

    const used = vault.slots.filter(Boolean).length;
    const colV = el("div", "vt-col");
    const hv = el("h3", "", "Baú"); hv.append(el("em", "", `${used}/${VAULT_SLOTS}`));
    const pages = el("div", "vt-pages");
    pages.setAttribute("role", "tablist");
    for (let p = 0; p < VAULT_PAGES; p++) {
      const cnt = vault.slots.slice(p * VAULT_PAGE, (p + 1) * VAULT_PAGE).filter(Boolean).length;
      const b = el("button", "vt-pg", String(p + 1)); b.type = "button";
      b.setAttribute("role", "tab"); b.setAttribute("aria-selected", String(p === page));
      b.append(el("i", "", `${cnt}/${VAULT_PAGE}`));
      b.onclick = () => { page = p; render(); };
      pages.append(b);
    }
    const gv = el("div", "vt-grid v");
    for (let i = page * VAULT_PAGE; i < (page + 1) * VAULT_PAGE; i++) gv.append(slotBtn("vault", i));
    colV.append(hv, pages, gv);

    const colB = el("div", "vt-col");
    const hb = el("h3", "", "Mochila"); hb.append(el("em", "", `${inv.inv.filter(Boolean).length}/${INV_SLOTS}`));
    const gb = el("div", "vt-grid b");
    for (let i = 0; i < INV_SLOTS; i++) gb.append(slotBtn("bag", i));
    colB.append(hb, gb);

    const body = el("div", "vt-body");
    body.append(colV, colB);

    const det = el("div", "vt-det");
    const st = sel ? stackOf(sel.side, sel.i) : null;
    if (sel && st && ITEMS[st.id]) {
      const d = ITEMS[st.id];
      const info = el("div", "t");
      const nm = el("b", "", d.name); nm.style.color = RARITY_COLOR[d.rarity];
      info.append(nm, el("small", "", `${brief(d)}${st.qty > 1 ? ` · ${st.qty} unid.` : ""}`));
      det.append(info);
      const side = sel.side, idx = sel.i;
      if (st.qty > 1) {
        const qr = el("div", "vt-qtyrow");
        const inp = el("input"); inp.type = "number"; inp.min = "1"; inp.max = String(st.qty); inp.value = String(Math.min(qty, st.qty)); inp.setAttribute("aria-label", "Quantidade");
        inp.oninput = () => { qty = Math.max(1, Math.min(st.qty, Math.floor(Number(inp.value)) || 1)); };
        qr.append(inp); det.append(qr);
      }
      const go = el("button", "vt-btn", side === "bag" ? "Guardar no baú" : "Levar na mochila"); go.type = "button";
      go.onclick = () => move(side, idx, st.qty > 1 ? Math.max(1, Math.min(st.qty, qty)) : 1);
      det.append(go);
      if (side === "vault") det.append(el("small", "", "Toque em outro espaço do baú para trocar de lugar."));
    } else {
      const info = el("div", "t");
      info.append(el("b", "", "Toque num item"), el("small", "", "Duplo toque move a pilha inteira. No computador, também dá para arrastar."));
      det.append(info);
    }

    const coins = el("div", "vt-coins");
    coins.append(coinRow("iron"), coinRow("obols"));
    card.append(head, body, det, coins);
    if (keep?.label) { const inp = card.querySelector<HTMLInputElement>(`input[aria-label="${keep.label}"]`); if (inp) { inp.value = keep.v; inp.focus(); } }
  }

  window.addEventListener("keydown", (e) => {
    if (e.code === "Escape" && isOpen()) { e.stopImmediatePropagation(); e.preventDefault(); close(); return; }
    if (isTypingTarget() || e.repeat) return;
    if (e.code === "KeyG" && isNear && !isOpen() && !document.querySelector(".ec-back.open, .iv-back.open, .gm-back.open")) { e.preventDefault(); open(); }
  }, true);

  return {
    setInventory(s) { inv = s; render(); },
    setVault(v) { vault = v; if (sel && !stackOf(sel.side, sel.i)) sel = null; render(); },
    open, close, isOpen,
    setNear(n) {
      isNear = n;
      near.classList.toggle("show", n && !isOpen() && !document.querySelector(".ec-back.open"));
      if (!n && isOpen()) close(); // afastou-se: o servidor também recusaria
    },
  };
}
