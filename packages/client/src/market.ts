import {
  ITEMS, Msg, RARITY_COLOR, RARITY_NAME, RARITIES, COIN_IRON, COIN_OBOL, MARKET_PRICE, MARKET_CURRENCY_NAME, minListingPrice, MARKET_FEE_PCT, MARKET_DAYS, MARKET_MIN_PRICE, MARKET_MAX_PRICE, MARKET_MAX_ACTIVE, priceHeadline, sortByUnitPrice,
  EQUIP_SLOT_NAME, CLASS_DEFS, itemValue, listingFee, suggestedPrice,
  type InventorySnapshot, type ItemDef, type NpcDef, type MarketPage, type MarketMineEvent, type MarketDoneEvent, type MarketFilter, type MarketPricesEvent, type MyListing, type MarketCurrency, type CharClass, type ItemKind, type Rarity,
} from "@frixep/shared";
import { bindItemTip } from "./itemtip";

/**
 * Janela do leiloeiro (mercado dos jogadores), em DOM. O servidor decide tudo (taxa, custódia, limites, quem comprou primeiro):
 * aqui só se mostram as listagens e se pedem as ações. Abas: Comprar, Vender e Minhas vendas.
 */
export interface MarketUi {
  open(npc: NpcDef): void;
  close(): void;
  isOpen(): boolean;
  setSnapshot(s: InventorySnapshot): void;
  setPage(p: MarketPage): void;
  setMine(m: MarketMineEvent): void;
  setDone(d: MarketDoneEvent): void;
  setPrices(p: MarketPricesEvent): void;
}

const CSS = `
.mk-card{width:min(720px,100%);height:min(640px,calc(100vh - 24px))}
.mk-filters{flex:none;display:flex;flex-wrap:wrap;gap:6px;align-items:center;padding:0 14px 8px}
.mk-filters input,.mk-filters select{min-width:0;min-height:34px;box-sizing:border-box;padding:0 8px;border-radius:5px;border:1px solid rgba(160,200,240,.3);background:rgba(6,12,20,.9);color:#e6eef9;font:600 12px/1 Georgia,serif}
.mk-filters select{flex:1 1 118px}
.mk-filters .p{flex:1 1 84px;width:84px}
.mk-search{flex:2 1 180px;display:flex;min-width:0}
.mk-search input{flex:1 1 auto;width:100%;border-radius:5px 0 0 5px}
.mk-search button{flex:none;width:36px;min-height:34px;display:grid;place-items:center;padding:0;box-sizing:border-box;border:1px solid rgba(160,200,240,.3);border-left:0;border-radius:0 5px 5px 0;background:rgba(20,32,48,.95);color:#ffd2a3;cursor:pointer}
.mk-filters input:focus-visible,.mk-filters select:focus-visible,.mk-search button:focus-visible,.mk-head button:focus-visible{outline:2px solid #ffd2a3}
.mk-head{flex:none;display:grid;grid-template-columns:44px 1fr auto;gap:10px;align-items:center;padding:4px 14px 4px;border-bottom:1px solid rgba(160,200,240,.2)}
.mk-head button{min-height:26px;padding:0 8px;border:0;background:none;color:#9fc0e0;font:700 11px/1 "Cinzel",Georgia,serif;letter-spacing:.06em;text-transform:uppercase;cursor:pointer;white-space:nowrap}
.mk-head button.on{color:#ffd2a3}
.mk-head .pr{justify-self:end}
.mk-card .ec-list{flex:1 1 auto;min-height:0}
.mk-row{flex:none;display:grid;grid-template-columns:44px 1fr auto;gap:10px;align-items:center;padding:6px 8px;border-radius:6px;background:linear-gradient(90deg,rgba(6,12,20,.85),rgba(14,22,34,.7));border:1px solid rgba(160,200,240,.18);position:relative;overflow:hidden}
.mk-row::before{content:"";position:absolute;left:0;top:0;bottom:0;width:3px;background:var(--rc,#445)}
.mk-row.mine{border-color:rgba(255,170,90,.4)}
.mk-ic{position:relative;width:44px;height:44px;border-radius:5px;display:grid;place-items:center;border:1.5px solid var(--rc,#445);background:radial-gradient(circle at 50% 35%,rgba(26,38,56,.9),rgba(5,9,15,.95));box-shadow:0 0 8px var(--rc,transparent)}
.mk-ic img{width:36px;height:36px;image-rendering:pixelated}
.mk-ic i{position:absolute;right:2px;bottom:0;font:700 10px/1 "Cinzel",Georgia,serif;font-style:normal;text-shadow:0 1px 3px #000;color:#fff}
.mk-info b{display:block;font:700 12px/1.25 "Cinzel",Georgia,serif;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.mk-info small{display:block;font:400 11px/1.3 Georgia,serif;color:#9fc0e0}
.mk-act{display:flex;flex-direction:column;align-items:flex-end;gap:4px}
.mk-pr{display:flex;align-items:center;gap:4px;font:700 12px/1 "Cinzel",Georgia,serif;color:#e6eef9;white-space:nowrap}
.mk-pr img{width:16px;height:16px;image-rendering:pixelated}
.mk-pr.bad{color:#ff9d8a}
.mk-pr.ob{color:#ff8a7a}
.mk-pager{display:flex;align-items:center;justify-content:center;gap:12px;padding:6px 14px 2px;font:700 12px/1 "Cinzel",Georgia,serif;color:#9fc0e0}
.mk-form{grid-column:1/-1;display:flex;flex-wrap:wrap;gap:8px;align-items:center;padding:8px;border-radius:5px;background:rgba(255,150,70,.07);border:1px solid rgba(255,150,70,.3)}
.mk-form label{display:flex;align-items:center;gap:5px;font:700 11px/1 "Cinzel",Georgia,serif;color:#cfe0f3}
.mk-form input{width:104px;min-height:32px;box-sizing:border-box;padding:0 6px;border-radius:5px;border:1px solid rgba(160,200,240,.3);background:rgba(6,12,20,.9);color:#fff;font:700 12px/1 "Cinzel",Georgia,serif}
.mk-form input.q{width:64px}
.mk-form .sum{flex:1;min-width:150px;font:400 12px/1.4 Georgia,serif;color:#9fc0e0}
.mk-form .sum b{color:#ffd08a}
.mk-chip{display:inline-block;padding:2px 7px;border-radius:9px;font:700 10px/1.3 "Cinzel",Georgia,serif;letter-spacing:.06em}
.mk-chip.act{background:rgba(125,214,138,.15);color:#9fe0a8}.mk-chip.sold{background:rgba(255,200,90,.15);color:#ffd08a}.mk-chip.exp{background:rgba(255,110,90,.15);color:#ffb3a6}
.mk-hint{margin:0;padding:0 14px 8px;font:400 12px/1.45 Georgia,serif;color:#9fc0e0}
@media (max-width:620px){.mk-row{grid-template-columns:40px 1fr}.mk-act{grid-column:1/-1;flex-direction:row;justify-content:space-between;align-items:center}.mk-ic{width:40px;height:40px}}
.mk-prices{flex:1 1 100%;min-width:0;display:flex;flex-direction:column;gap:5px;padding:6px;border-radius:5px;background:rgba(6,12,20,.7);border:1px solid rgba(160,200,240,.2)}
.mk-ph{font:700 12px/1.35 "Cinzel",Georgia,serif;color:#ffd08a}
.mk-pl{display:flex;flex-direction:column;gap:3px;max-height:150px;overflow:auto}
.mk-pline{display:grid;grid-template-columns:40px 1fr auto;gap:6px;align-items:center;min-height:30px;padding:3px 6px;border-radius:4px;border:1px solid rgba(160,200,240,.15);background:rgba(14,22,34,.6);color:#e6eef9;font:400 12px/1.2 Georgia,serif;text-align:left;cursor:pointer}
.mk-pline:hover,.mk-pline:focus-visible{border-color:#ffd2a3;outline:none}
.mk-pline.mine{border-color:rgba(255,170,90,.45)}
.mk-pline span{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.mk-pline .mk-pu{font:700 12px/1 "Cinzel",Georgia,serif;color:#9fe0a8}
.mk-pnote{font:400 11px/1.3 Georgia,serif;color:#9fc0e0}
@media (max-width:620px){.mk-pline{grid-template-columns:34px 1fr auto}}
`;

const el = <K extends keyof HTMLElementTagNameMap>(tag: K, cls = "", text = ""): HTMLElementTagNameMap[K] => {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text) e.textContent = text;
  return e;
};
const num = (n: number) => n.toLocaleString("pt-BR");
const img = (id: string) => { const i = el("img"); i.src = `/assets/items/item_${id}.png`; i.alt = ""; i.draggable = false; i.onerror = () => { i.style.visibility = "hidden"; }; return i; };
const priceEl = (n: number, bad = false, cur: MarketCurrency = "iron") => { const p = el("span", "mk-pr" + (bad ? " bad" : "") + (cur === "obols" ? " ob" : "")); p.append(img(cur === "obols" ? COIN_OBOL.id : COIN_IRON.id), document.createTextNode(num(n))); return p; };

function brief(d: ItemDef): string {
  const o: string[] = [];
  if (d.dmgPct) o.push(`+${d.dmgPct}% poder`);
  if (d.hp) o.push(`+${d.hp} vida`);
  if (d.crit) o.push(`+${d.crit}% crít.`);
  if (d.dr) o.push(`−${d.dr}% dano`);
  if (d.cdr) o.push(`−${d.cdr}% recarga`);
  if (d.mana) o.push(`+${d.mana} rec.`);
  if (d.regen) o.push(`+${d.regen}/s`);
  if (d.heal) o.push(`cura ${d.heal}`);
  const where = d.kind === "potion" ? "Poção" : d.kind === "material" ? "Material" : EQUIP_SLOT_NAME[d.kind as keyof typeof EQUIP_SLOT_NAME];
  return `${RARITY_NAME[d.rarity]} · ${where}${d.cls ? " · " + CLASS_DEFS[d.cls].name : ""} · nv ${d.minLevel}${o.length ? " · " + o.join(" · ") : ""}`;
}
function timeLeft(ms: number): string {
  const s = Math.max(0, Math.floor((ms - Date.now()) / 1000));
  if (s <= 0) return "vencida";
  const d = Math.floor(s / 86400), h = Math.floor((s % 86400) / 3600), m = Math.floor((s % 3600) / 60);
  return d ? `${d}d ${h}h` : h ? `${h}h ${m}min` : m ? `${m}min` : `${s}s`;
}
function iconBox(id: string, qty: number): HTMLElement {
  const d = ITEMS[id];
  const b = el("div", "mk-ic");
  b.style.setProperty("--rc", d ? RARITY_COLOR[d.rarity] : "#445");
  b.append(img(id));
  if (qty > 1) b.append(el("i", "", String(qty)));
  return b;
}

export function mountMarket(opts: { send(type: string, payload: unknown): void; toast(text: string, color?: string): void; getClass(): CharClass }): MarketUi {
  const style = el("style");
  style.textContent = CSS;
  document.head.append(style);

  const back = el("div", "ec-back");
  const card = el("div", "ec-card mk-card");
  card.setAttribute("role", "dialog");
  card.setAttribute("aria-modal", "true");
  card.setAttribute("aria-label", "Mercado");
  back.append(card);
  document.body.append(back);

  let npc: NpcDef | null = null;
  let tab: "buy" | "sell" | "mine" = "buy";
  let snap: InventorySnapshot = { inv: [], equip: { weapon: null, offhand: null, helmet: null, armor: null, boots: null, cape: null }, iron: 0, obols: 0 };
  let filter: Required<Pick<MarketFilter, "q" | "cls" | "kind" | "rarity" | "currency" | "sort" | "page">> & { minPrice: number; maxPrice: number } = { q: "", cls: "all", kind: "all", rarity: "all", currency: "all", sort: "price_asc", page: 0, minPrice: 0, maxPrice: MARKET_MAX_PRICE };
  let page: MarketPage | null = null;
  let mine: MarketMineEvent | null = null;
  let listSlot = -1; // aba Vender: espaço com o formulário aberto
  let busy = false; // esperando a resposta do servidor a uma ação (evita clique duplo)
  let tick: ReturnType<typeof setInterval> | undefined;
  let browseTimer: ReturnType<typeof setTimeout> | undefined;
  let priceTick: ReturnType<typeof setInterval> | undefined; // atualiza a janela de preços enquanto o formulário está aberto
  // formulário de venda aberto: item, moeda, quantidade atual e como preencher o preço ao tocar numa linha
  let formCtx: { itemId: string; cur: () => MarketCurrency; qty: () => number; panel: HTMLElement; fill: (unit: number) => void } | null = null;

  const close = () => { back.classList.remove("open"); npc = null; clearInterval(tick); clearInterval(priceTick); clearTimeout(browseTimer); busy = false; formCtx = null; };
  const send = (type: string, extra: Record<string, unknown> = {}) => { if (npc) opts.send(type, { npc: npc.id, ...extra }); };
  const browse = () => send(Msg.MarketBrowse, { filter });
  const askMine = () => send(Msg.MarketMy);
  const askPrices = () => { if (formCtx) send(Msg.MarketPrices, { itemId: formCtx.itemId, currency: formCtx.cur() }); };
  const browseSoon = () => { clearTimeout(browseTimer); browseTimer = setTimeout(browse, 250); };
  const equippedOf = (kind: string): ItemDef | null => { const id = (snap.equip as Record<string, string | null>)[kind]; return id ? ITEMS[id] ?? null : null; };

  function open(n: NpcDef) {
    npc = n; tab = "buy"; listSlot = -1; busy = false; page = null; mine = null;
    back.classList.add("open");
    browse(); askMine();
    clearInterval(tick);
    tick = setInterval(() => { if (tab !== "sell" && !card.contains(document.activeElement as Node) ) render(); }, 30_000); // atualiza "expira em"
    clearInterval(priceTick);
    priceTick = setInterval(() => { if (tab === "sell") askPrices(); }, 15_000);
    render();
  }
  back.onclick = (e) => { if (e.target === back) close(); };

  // ---------------------------------------------------------------- estrutura
  function render() {
    if (!npc) return;
    if (tab !== "sell") formCtx = null;
    // não refaz a tela enquanto o jogador digita num campo (perderia o foco)
    const ae = document.activeElement as HTMLInputElement | null;
    const keep = ae && card.contains(ae) && ae.dataset.k ? { k: ae.dataset.k, at: ae.selectionStart } : null;
    card.replaceChildren();
    const h = el("div", "ec-head");
    const t = el("h2", "ec-title", `${npc.name} · ${npc.title}`);
    t.append(el("small", "", `Compre dos outros jogadores ou venda os seus itens. Taxa de listagem: ${MARKET_FEE_PCT}% na moeda do preço (não volta). Sem taxa sobre a venda.`));
    const x = el("button", "ec-x", "×"); x.type = "button"; x.setAttribute("aria-label", "Fechar"); x.onclick = close;
    h.append(t, x);
    const bal = el("div", "ec-bal");
    const a = el("span"); a.append(img(COIN_IRON.id), document.createTextNode(`${num(snap.iron)} ${COIN_IRON.short}`)); (a.firstChild as HTMLElement).className = "ec-coin";
    const ob = el("span"); ob.style.color = COIN_OBOL.color; ob.append(img(COIN_OBOL.id), document.createTextNode(`${num(snap.obols)} ${COIN_OBOL.short}`)); (ob.firstChild as HTMLElement).className = "ec-coin";
    bal.append(a, ob);
    const tabs = el("div", "ec-tabs");
    tabs.setAttribute("role", "tablist");
    const pending = mine ? mine.listings.filter((l) => l.status !== "active").length : 0;
    for (const [k, label] of [["buy", "Comprar"], ["sell", "Vender"], ["mine", `Minhas vendas${pending ? ` (${pending})` : ""}`]] as const) {
      const b = el("button", "ec-tab", label);
      b.type = "button"; b.setAttribute("role", "tab"); b.setAttribute("aria-selected", String(tab === k));
      b.onclick = () => { tab = k; listSlot = -1; if (k === "mine") askMine(); if (k === "buy") browse(); render(); };
      tabs.append(b);
    }
    card.append(h, bal, tabs);
    if (tab === "buy") renderBuy(); else if (tab === "sell") renderSell(); else renderMine();
    if (keep) {
      const inp = card.querySelector<HTMLInputElement>(`[data-k="${keep.k}"]`);
      if (inp) { inp.focus(); try { inp.setSelectionRange(keep.at, keep.at); } catch { /* number */ } }
    }
  }

  // ---------------------------------------------------------------- comprar
  function select(k: string, label: string, cls: string, entries: [string, string][], value: string, onChange: (v: string) => void) {
    const s = el("select", cls);
    s.setAttribute("aria-label", label);
    s.dataset.k = k;
    for (const [v, text] of entries) { const o = el("option", "", text); o.value = v; if (v === value) o.selected = true; s.append(o); }
    s.onchange = () => onChange(s.value);
    return s;
  }
  function input(k: string, label: string, cls: string, type: "text" | "number", value: string, ph: string, onInput: (v: string) => void) {
    const i = el("input", cls);
    i.type = type; i.value = value; i.placeholder = ph; i.dataset.k = k; i.setAttribute("aria-label", label);
    if (type === "number") { i.min = "0"; i.step = "1"; i.inputMode = "numeric"; }
    i.oninput = () => onInput(i.value);
    return i;
  }

  function renderBuy() {
    const f = el("div", "mk-filters");
    const setF = (patch: Partial<typeof filter>) => { filter = { ...filter, ...patch, page: patch.page ?? 0 }; browseSoon(); };
    // linha 1: busca por nome (com lupa) + dropdowns compactos; quebram para a linha de baixo no celular
    const search = el("div", "mk-search");
    const q = input("q", "Procurar pelo nome", "q", "text", filter.q, "Procurar…", (v) => setF({ q: v.slice(0, 30) }));
    q.enterKeyHint = "search";
    q.onkeydown = (e) => { if (e.key === "Enter") { clearTimeout(browseTimer); browse(); } };
    const lupa = el("button", "", "");
    lupa.type = "button"; lupa.setAttribute("aria-label", "Buscar");
    lupa.innerHTML = '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" aria-hidden="true"><circle cx="11" cy="11" r="6.5"/><path d="M16 16l5 5"/></svg>';
    lupa.onclick = () => { clearTimeout(browseTimer); browse(); };
    search.append(q, lupa);
    f.append(
      search,
      select("kind", "Categoria", "c", [["all", "Categoria"], ...(["weapon", "offhand", "helmet", "armor", "boots", "cape", "potion"] as ItemKind[]).map((k) => [k, k === "potion" ? "Poção" : EQUIP_SLOT_NAME[k as keyof typeof EQUIP_SLOT_NAME]] as [string, string])], filter.kind, (v) => { setF({ kind: v as typeof filter.kind }); render(); }),
      select("cls", "Classe", "c",[["all", "Todas as classes"], ...(["warrior", "archer", "cleric", "mage"] as CharClass[]).map((c) => [c, CLASS_DEFS[c].name] as [string, string])], filter.cls, (v) => { setF({ cls: v as typeof filter.cls }); render(); }),
      select("rarity", "Raridade", "c", [["all", "Raridade"], ...RARITIES.map((r) => [r, RARITY_NAME[r]] as [string, string])], filter.rarity, (v) => { setF({ rarity: v as Rarity | "all" }); render(); }),
      select("cur", "Moeda", "c", [["all", "Moeda"], ["iron", "Tostões"], ["obols", "Óbolos de Sangue"]], filter.currency, (v) => { setF({ currency: v as typeof filter.currency }); render(); }),
      input("min", "Preço mínimo", "p", "number", filter.minPrice ? String(filter.minPrice) : "", "Preço mín.", (v) => setF({ minPrice: Math.max(0, Math.floor(Number(v) || 0)) })),
      input("max", "Preço máximo", "p", "number", filter.maxPrice < MARKET_MAX_PRICE ? String(filter.maxPrice) : "", "Preço máx.", (v) => setF({ maxPrice: v === "" ? MARKET_MAX_PRICE : Math.max(0, Math.floor(Number(v) || 0)) })),
    );
    // linha 2: cabeçalho de colunas clicável. Preço alterna mais barato/mais caro; Item ordena por raridade (o servidor não ordena por nome).
    const head = el("div", "mk-head");
    const hItem = el("button", "", "Item");
    hItem.type = "button";
    hItem.classList.toggle("on", filter.sort === "rarity");
    hItem.setAttribute("aria-label", "Ordenar por raridade");
    hItem.onclick = () => { filter = { ...filter, sort: "rarity", page: 0 }; render(); browse(); };
    const hPrice = el("button", "pr", "Preço");
    hPrice.type = "button";
    const asc = filter.sort === "price_asc";
    const desc = filter.sort === "price_desc";
    hPrice.classList.toggle("on", asc || desc);
    hPrice.textContent = `Preço ${asc ? "▲" : desc ? "▼" : "↕"}`;
    hPrice.setAttribute("aria-label", asc ? "Preço: do menor para o maior. Clique para inverter" : desc ? "Preço: do maior para o menor. Clique para inverter" : "Ordenar por preço (menor primeiro)");
    hPrice.onclick = () => { filter = { ...filter, sort: asc ? "price_desc" : "price_asc", page: 0 }; render(); browse(); };
    head.append(el("span"), hItem, hPrice);
    const list = el("div", "ec-list");
    if (!page) list.append(el("div", "ec-empty", "Consultando o mercado…"));
    else if (!page.items.length) list.append(el("div", "ec-empty", "Nenhuma listagem com esses filtros."));
    for (const l of page?.items ?? []) {
      const d = ITEMS[l.itemId];
      if (!d) continue;
      const poor = (l.currency === "obols" ? snap.obols : snap.iron) < l.price;
      const row = el("div", "mk-row" + (l.mine ? " mine" : ""));
      row.style.setProperty("--rc", RARITY_COLOR[d.rarity]);
      const info = el("div", "mk-info");
      const nm = el("b", "", d.name + (l.qty > 1 ? ` ×${l.qty}` : ""));
      nm.style.color = RARITY_COLOR[d.rarity];
      info.append(nm, el("small", "", brief(d)), el("small", "", `${l.mine ? "Sua venda · " : ""}expira em ${timeLeft(l.expiresAt)}`));
      const act = el("div", "mk-act");
      const ref = suggestedPrice(l.itemId, l.qty);
      const pr = priceEl(l.price, !l.mine && poor, l.currency);
      pr.title = l.currency === "iron" ? `Valor médio de referência: ${num(ref)} Tostões` : "Preço em Óbolos de Sangue";
      const b = el("button", "ec-btn go", l.mine ? "Sua listagem" : "Comprar");
      b.type = "button";
      b.disabled = l.mine || poor || busy;
      b.onclick = () => { busy = true; send(Msg.MarketBuy, { id: l.id }); render(); };
      act.append(pr, b);
      // ficha completa do item (atributos, classe, nível) antes de comprar; compara com o equipado do mesmo tipo
      const ic = iconBox(l.itemId, l.qty);
      const tipData = () => ({ def: d, cmp: d.kind !== "potion" ? equippedOf(d.kind) : null });
      bindItemTip(ic, tipData);
      bindItemTip(info, tipData);
      row.append(ic, info, act);
      list.append(row);
    }
    card.append(f, head, list);
    if (page && page.pages > 1) {
      const pg = el("div", "mk-pager");
      const prev = el("button", "ec-btn", "‹"); prev.type = "button"; prev.disabled = page.page <= 0; prev.setAttribute("aria-label", "Página anterior");
      const next = el("button", "ec-btn", "›"); next.type = "button"; next.disabled = page.page >= page.pages - 1; next.setAttribute("aria-label", "Próxima página");
      prev.onclick = () => { filter = { ...filter, page: page!.page - 1 }; browse(); };
      next.onclick = () => { filter = { ...filter, page: page!.page + 1 }; browse(); };
      pg.append(prev, el("span", "", `Página ${page.page + 1} de ${page.pages} · ${num(page.total)} listagens`), next);
      card.append(pg);
    }
    card.append(el("p", "ec-note", "O preço é o total da listagem (pilhas incluem todas as unidades). Passe o mouse no preço para ver o valor médio de referência."));
  }

  // ---------------------------------------------------------------- vender
  function renderSell() {
    formCtx = null;
    card.append(el("p", "mk-hint", `Escolha um item da mochila e defina o preço total em Tostões ou em Óbolos de Sangue (a moeda rara: boa para itens míticos e lendários). Ele sai da mochila e fica guardado até vender, vencer (${MARKET_DAYS} dias) ou você cancelar. Máx. ${MARKET_MAX_ACTIVE} listagens ativas.`));
    const list = el("div", "ec-list");
    let any = false;
    snap.inv.forEach((st, i) => {
      if (!st || !ITEMS[st.id]) return;
      any = true;
      const d = ITEMS[st.id];
      const row = el("div", "mk-row");
      row.style.setProperty("--rc", RARITY_COLOR[d.rarity]);
      const info = el("div", "mk-info");
      const nm = el("b", "", d.name + (st.qty > 1 ? ` ×${st.qty}` : ""));
      nm.style.color = RARITY_COLOR[d.rarity];
      info.append(nm, el("small", "", brief(d)));
      const act = el("div", "mk-act");
      const b = el("button", "ec-btn", listSlot === i ? "Fechar" : "Vender");
      b.type = "button";
      b.onclick = () => { listSlot = listSlot === i ? -1 : i; render(); };
      act.append(b);
      row.append(iconBox(st.id, st.qty), info, act);
      if (listSlot === i) row.append(listForm(i, st.id, st.qty));
      list.append(row);
    });
    if (!any) list.append(el("div", "ec-empty", "Sua mochila está vazia."));
    card.append(list, el("p", "ec-note", "Só o que está na mochila pode ser vendido (equipado, não)."));
  }

  function listForm(slot: number, id: string, max: number): HTMLElement {
    const form = el("div", "mk-form");
    let qty = max;
    let cur: MarketCurrency = "iron";
    let price = suggestedPrice(id, max);
    const sum = el("div", "sum");
    const go = el("button", "ec-btn go", "Pôr à venda"); go.type = "button";
    const pricePanel = el("div", "mk-prices");
    pricePanel.setAttribute("aria-live", "polite");
    pricePanel.append(el("div", "mk-ph", "Consultando preços…"));
    let askTimer: ReturnType<typeof setTimeout> | undefined;
    const askSoon = () => { clearTimeout(askTimer); askTimer = setTimeout(askPrices, 300); };
    const paint = () => {
      const lim = MARKET_PRICE[cur], cn = MARKET_CURRENCY_NAME[cur];
      const have = cur === "obols" ? snap.obols : snap.iron;
      const minP = Math.max(lim.min, minListingPrice(id, qty, cur));
      const low = Number.isInteger(price) && price < minP;
      const bad = !(Number.isInteger(price) && price >= minP && price <= lim.max) || qty < 1 || qty > max;
      const fee = bad ? 0 : listingFee(price);
      sum.replaceChildren(document.createTextNode(bad ? (low ? `Preço mínimo para este item: ${num(minP)} ${cn}.` : `Preço de ${num(minP)} a ${num(lim.max)} ${cn}.`) : `Taxa de listagem: `), ...(bad ? [] : [Object.assign(el("b"), { textContent: `${num(fee)} ${cn}` }), document.createTextNode(` · você recebe `), Object.assign(el("b"), { textContent: `${num(price)}` }), document.createTextNode(` (o preço inteiro) quando vender.${cur === "iron" ? ` Valor médio: ${num(itemValue(id) * qty)}.` : ""}`)]));
      go.disabled = bad || have < fee || busy;
      if (!bad && have < fee) sum.append(document.createTextNode(` ${cn} insuficientes para a taxa.`));
    };
    if (max > 1) {
      const lq = el("label", "", "Qtd.");
      const iq = el("input", "q"); iq.type = "number"; iq.min = "1"; iq.max = String(max); iq.value = String(max); iq.dataset.k = "lq";
      iq.oninput = () => { qty = Math.max(1, Math.min(max, Math.floor(Number(iq.value) || 1))); paint(); askSoon(); };
      lq.append(iq);
      form.append(lq);
    }
    const lc = el("label", "", "Moeda");
    const sc = el("select"); sc.dataset.k = "lc"; sc.setAttribute("aria-label", "Moeda do preço");
    for (const [v, t] of [["iron", "Tostões"], ["obols", "Óbolos de Sangue"]] as const) { const o = el("option", "", t); o.value = v; sc.append(o); }
    lc.append(sc);
    const lp = el("label", "", "Preço");
    const ip = el("input"); ip.type = "number"; ip.min = String(MARKET_PRICE.iron.min); ip.max = String(MARKET_PRICE.iron.max); ip.value = String(price); ip.dataset.k = "lp"; ip.inputMode = "numeric";
    ip.oninput = () => { price = Math.floor(Number(ip.value)); paint(); };
    sc.onchange = () => { cur = sc.value as MarketCurrency; price = cur === "obols" ? 1 : suggestedPrice(id, qty); ip.value = String(price); ip.min = String(MARKET_PRICE[cur].min); ip.max = String(MARKET_PRICE[cur].max); paint(); askPrices(); };
    lp.append(ip);
    form.append(lc, lp, sum, go, pricePanel);
    go.onclick = () => { if (go.disabled) return; busy = true; send(Msg.MarketList, { slot, qty, price, currency: cur }); paint(); };
    // tocar numa linha da janela: preço = preço por unidade x quantidade escolhida (o servidor confere o resto)
    formCtx = { itemId: id, cur: () => cur, qty: () => qty, panel: pricePanel, fill: (unit) => { price = Math.max(0, Math.round(unit * qty)); ip.value = String(price); paint(); } };
    paint();
    askPrices();
    return form;
  }

  // ---------------------------------------------------------------- minhas vendas
  function renderMine() {
    const list = el("div", "ec-list");
    const ls = mine?.listings ?? [];
    card.append(el("p", "mk-hint", `Listagens abertas: ${mine ? mine.open : 0} de ${mine?.max ?? 40}. O dinheiro das vendas fica guardado aqui até você recolher (mesmo se estiver desconectado).`));
    if (!mine) list.append(el("div", "ec-empty", "Carregando…"));
    else if (!ls.length) list.append(el("div", "ec-empty", "Você não tem listagens. Use a aba Vender."));
    for (const l of ls) list.append(mineRow(l));
    card.append(list);
    const ready = ls.filter((l) => l.status !== "active");
    const foot = el("div", "ec-foot");
    const note = el("p", "ec-note", ready.length ? `${ready.length} pronta(s) para recolher.` : "Nada a recolher no momento.");
    const all = el("button", "ec-btn go", "Recolher tudo"); all.type = "button";
    all.disabled = !ready.length || busy;
    all.onclick = () => { busy = true; send(Msg.MarketClaim, { id: "all" }); render(); };
    foot.append(note, all);
    card.append(foot);
  }

  function mineRow(l: MyListing): HTMLElement {
    const d = ITEMS[l.itemId];
    const row = el("div", "mk-row");
    row.style.setProperty("--rc", d ? RARITY_COLOR[d.rarity] : "#445");
    const info = el("div", "mk-info");
    const nm = el("b", "", (d?.name ?? l.itemId) + (l.qty > 1 ? ` ×${l.qty}` : ""));
    if (d) nm.style.color = RARITY_COLOR[d.rarity];
    const chip = el("span", "mk-chip " + (l.status === "active" ? "act" : l.status === "sold" ? "sold" : "exp"), l.status === "active" ? `À venda · ${timeLeft(l.expiresAt)}` : l.status === "sold" ? `Vendido${l.buyer ? " para " + l.buyer : ""}` : "Vencida");
    const sub = el("small");
    sub.append(chip);
    info.append(nm, sub);
    const act = el("div", "mk-act");
    act.append(priceEl(l.price, false, l.currency));
    const b = el("button", "ec-btn" + (l.status === "active" ? " danger" : " go"), l.status === "active" ? "Cancelar" : l.status === "sold" ? "Recolher" : "Devolver");
    b.type = "button";
    b.disabled = busy;
    b.title = l.status === "active" ? "O item volta para a mochila; a taxa de listagem não é devolvida." : l.status === "sold" ? "Receber os tostões da venda." : "Receber o item de volta.";
    b.onclick = () => { busy = true; send(l.status === "sold" ? Msg.MarketClaim : Msg.MarketCancel, { id: l.id }); render(); };
    act.append(b);
    row.append(iconBox(l.itemId, l.qty), info, act);
    return row;
  }

  window.addEventListener("keydown", (e) => {
    if (e.code === "Escape" && back.classList.contains("open")) { e.stopImmediatePropagation(); e.preventDefault(); close(); }
  }, true);

  return {
    open,
    close,
    isOpen: () => back.classList.contains("open"),
    setSnapshot(s) { snap = s; if (npc) render(); },
    setPage(p) { page = p; if (p.page !== filter.page) filter = { ...filter, page: p.page }; if (npc) render(); },
    setMine(m) { mine = m; if (npc) render(); },
    setPrices(p) {
      const c = formCtx;
      if (!c || c.itemId !== p.itemId || c.cur() !== p.currency) return; // resposta de outro item ou moeda: ignora
      const cn = MARKET_CURRENCY_NAME[p.currency];
      const f = (n: number) => n.toLocaleString("pt-BR", { maximumFractionDigits: 1 });
      c.panel.replaceChildren(el("div", "mk-ph", priceHeadline(p, cn)));
      if (!p.rows.length) return;
      const list = el("div", "mk-pl");
      for (const r of sortByUnitPrice(p.rows, p.currency)) {
        const line = el("button", "mk-pline" + (r.row.mine ? " mine" : ""));
        line.type = "button";
        line.title = `Usar ${f(r.unit)} ${cn} por unidade (x ${c.qty()}) no preço`;
        line.setAttribute("aria-label", `${r.qty} por ${num(r.price)} ${cn}, ${f(r.unit)} por unidade, vendedor ${r.row.seller}`);
        line.append(el("span", "", `x${r.qty}`), el("span", "", `${num(r.price)} · ${r.row.seller}${r.row.mine ? " (você)" : ""}`), el("span", "mk-pu", `${f(r.unit)}/un`));
        line.onclick = () => c.fill(r.unit);
        list.append(line);
      }
      c.panel.append(list);
      if (p.total > p.rows.length) c.panel.append(el("div", "mk-pnote", `+ ${num(p.total - p.rows.length)} listagens mais caras não mostradas.`));
    },
    setDone(d) {
      busy = false;
      opts.toast(d.text, d.ok ? "#9fe0a8" : "#ffb3a6");
      if (d.ok && d.kind === "list") listSlot = -1;
      if (npc) { browse(); askMine(); render(); }
    },
  };
}
