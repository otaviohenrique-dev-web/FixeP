import {
  ITEMS, Msg, RARITY_COLOR, RARITY_NAME, RARITIES, COIN_IRON, MARKET_FEE_PCT, MARKET_DAYS, MARKET_MIN_PRICE, MARKET_MAX_PRICE, MARKET_SORTS, MARKET_SORT_NAME, MARKET_MAX_ACTIVE,
  EQUIP_SLOT_NAME, CLASS_DEFS, itemValue, listingFee, suggestedPrice,
  type InventorySnapshot, type ItemDef, type NpcDef, type MarketPage, type MarketMineEvent, type MarketDoneEvent, type MarketFilter, type MyListing, type CharClass, type ItemKind, type Rarity,
} from "@frixep/shared";

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
}

const CSS = `
.mk-card{width:min(720px,100%);height:min(640px,calc(100vh - 24px))}
.mk-filters{display:grid;grid-template-columns:repeat(6,1fr);gap:6px;padding:0 14px 8px}
.mk-filters input,.mk-filters select{min-width:0;min-height:34px;box-sizing:border-box;padding:0 8px;border-radius:5px;border:1px solid rgba(160,200,240,.3);background:rgba(6,12,20,.9);color:#e6eef9;font:600 12px/1 Georgia,serif}
.mk-filters .q{grid-column:span 3}.mk-filters .s{grid-column:span 3}
.mk-filters .c{grid-column:span 2}.mk-filters .p{grid-column:span 3}
.mk-filters input:focus-visible,.mk-filters select:focus-visible{outline:2px solid #ffd2a3}
@media (max-width:620px){.mk-filters{grid-template-columns:1fr 1fr}.mk-filters .q,.mk-filters .s,.mk-filters .c,.mk-filters .p{grid-column:span 1}.mk-filters .q{grid-column:span 2}}
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
`;

const el = <K extends keyof HTMLElementTagNameMap>(tag: K, cls = "", text = ""): HTMLElementTagNameMap[K] => {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text) e.textContent = text;
  return e;
};
const num = (n: number) => n.toLocaleString("pt-BR");
const img = (id: string) => { const i = el("img"); i.src = `/assets/items/item_${id}.png`; i.alt = ""; i.draggable = false; i.onerror = () => { i.style.visibility = "hidden"; }; return i; };
const priceEl = (n: number, bad = false) => { const p = el("span", "mk-pr" + (bad ? " bad" : "")); p.append(img(COIN_IRON.id), document.createTextNode(num(n))); return p; };

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
  const where = d.kind === "potion" ? "Poção" : EQUIP_SLOT_NAME[d.kind as keyof typeof EQUIP_SLOT_NAME];
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
  let filter: Required<Pick<MarketFilter, "q" | "cls" | "kind" | "rarity" | "sort" | "page">> & { minPrice: number; maxPrice: number } = { q: "", cls: "all", kind: "all", rarity: "all", sort: "newest", page: 0, minPrice: 0, maxPrice: MARKET_MAX_PRICE };
  let page: MarketPage | null = null;
  let mine: MarketMineEvent | null = null;
  let listSlot = -1; // aba Vender: espaço com o formulário aberto
  let busy = false; // esperando a resposta do servidor a uma ação (evita clique duplo)
  let tick: ReturnType<typeof setInterval> | undefined;
  let browseTimer: ReturnType<typeof setTimeout> | undefined;

  const close = () => { back.classList.remove("open"); npc = null; clearInterval(tick); clearTimeout(browseTimer); busy = false; };
  const send = (type: string, extra: Record<string, unknown> = {}) => { if (npc) opts.send(type, { npc: npc.id, ...extra }); };
  const browse = () => send(Msg.MarketBrowse, { filter });
  const askMine = () => send(Msg.MarketMy);
  const browseSoon = () => { clearTimeout(browseTimer); browseTimer = setTimeout(browse, 250); };

  function open(n: NpcDef) {
    npc = n; tab = "buy"; listSlot = -1; busy = false; page = null; mine = null;
    back.classList.add("open");
    browse(); askMine();
    clearInterval(tick);
    tick = setInterval(() => { if (tab !== "sell" && !card.contains(document.activeElement as Node) ) render(); }, 30_000); // atualiza "expira em"
    render();
  }
  back.onclick = (e) => { if (e.target === back) close(); };

  // ---------------------------------------------------------------- estrutura
  function render() {
    if (!npc) return;
    // não refaz a tela enquanto o jogador digita num campo (perderia o foco)
    const ae = document.activeElement as HTMLInputElement | null;
    const keep = ae && card.contains(ae) && ae.dataset.k ? { k: ae.dataset.k, at: ae.selectionStart } : null;
    card.replaceChildren();
    const h = el("div", "ec-head");
    const t = el("h2", "ec-title", `${npc.name} · ${npc.title}`);
    t.append(el("small", "", `Compre dos outros jogadores ou venda os seus itens. Taxa de listagem: ${MARKET_FEE_PCT}% (não volta). Sem taxa sobre a venda.`));
    const x = el("button", "ec-x", "×"); x.type = "button"; x.setAttribute("aria-label", "Fechar"); x.onclick = close;
    h.append(t, x);
    const bal = el("div", "ec-bal");
    const a = el("span"); a.append(img(COIN_IRON.id), document.createTextNode(`${num(snap.iron)} ${COIN_IRON.short}`)); (a.firstChild as HTMLElement).className = "ec-coin";
    bal.append(a);
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
    f.append(
      input("q", "Buscar pelo nome", "q", "text", filter.q, "Buscar pelo nome…", (v) => setF({ q: v.slice(0, 30) })),
      select("sort", "Ordenar", "s", MARKET_SORTS.map((s) => [s, MARKET_SORT_NAME[s]] as [string, string]), filter.sort, (v) => { setF({ sort: v as typeof filter.sort }); render(); }),
      select("cls", "Classe", "c", [["all", "Todas as classes"], ...(["warrior", "archer", "cleric", "mage"] as CharClass[]).map((c) => [c, CLASS_DEFS[c].name] as [string, string])], filter.cls, (v) => { setF({ cls: v as typeof filter.cls }); render(); }),
      select("kind", "Tipo", "c", [["all", "Todos os tipos"], ...(["weapon", "offhand", "helmet", "armor", "boots", "cape", "potion"] as ItemKind[]).map((k) => [k, k === "potion" ? "Poção" : EQUIP_SLOT_NAME[k as keyof typeof EQUIP_SLOT_NAME]] as [string, string])], filter.kind, (v) => { setF({ kind: v as typeof filter.kind }); render(); }),
      select("rarity", "Raridade", "c", [["all", "Todas as raridades"], ...RARITIES.map((r) => [r, RARITY_NAME[r]] as [string, string])], filter.rarity, (v) => { setF({ rarity: v as Rarity | "all" }); render(); }),
      input("min", "Preço mínimo", "p", "number", filter.minPrice ? String(filter.minPrice) : "", "Preço mín.", (v) => setF({ minPrice: Math.max(0, Math.floor(Number(v) || 0)) })),
      input("max", "Preço máximo", "p", "number", filter.maxPrice < MARKET_MAX_PRICE ? String(filter.maxPrice) : "", "Preço máx.", (v) => setF({ maxPrice: v === "" ? MARKET_MAX_PRICE : Math.max(0, Math.floor(Number(v) || 0)) })),
    );
    const list = el("div", "ec-list");
    if (!page) list.append(el("div", "ec-empty", "Consultando o mercado…"));
    else if (!page.items.length) list.append(el("div", "ec-empty", "Nenhuma listagem com esses filtros."));
    for (const l of page?.items ?? []) {
      const d = ITEMS[l.itemId];
      if (!d) continue;
      const poor = snap.iron < l.price;
      const row = el("div", "mk-row" + (l.mine ? " mine" : ""));
      row.style.setProperty("--rc", RARITY_COLOR[d.rarity]);
      const info = el("div", "mk-info");
      const nm = el("b", "", d.name + (l.qty > 1 ? ` ×${l.qty}` : ""));
      nm.style.color = RARITY_COLOR[d.rarity];
      info.append(nm, el("small", "", brief(d)), el("small", "", `Vendedor: ${l.seller}${l.mine ? " (você)" : ""} · expira em ${timeLeft(l.expiresAt)}`));
      const act = el("div", "mk-act");
      const ref = suggestedPrice(l.itemId, l.qty);
      const pr = priceEl(l.price, !l.mine && poor);
      pr.title = `Valor médio de referência: ${num(ref)} Tostões`;
      const b = el("button", "ec-btn go", l.mine ? "Sua listagem" : "Comprar");
      b.type = "button";
      b.disabled = l.mine || poor || busy;
      b.onclick = () => { busy = true; send(Msg.MarketBuy, { id: l.id }); render(); };
      act.append(pr, b);
      row.append(iconBox(l.itemId, l.qty), info, act);
      list.append(row);
    }
    card.append(f, list);
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
    card.append(el("p", "mk-hint", `Escolha um item da mochila e defina o preço total. Ele sai da mochila e fica guardado até vender, vencer (${MARKET_DAYS} dias) ou você cancelar. Máx. ${MARKET_MAX_ACTIVE} listagens ativas.`));
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
    let price = suggestedPrice(id, max);
    const sum = el("div", "sum");
    const go = el("button", "ec-btn go", "Pôr à venda"); go.type = "button";
    const paint = () => {
      const bad = !(Number.isInteger(price) && price >= MARKET_MIN_PRICE && price <= MARKET_MAX_PRICE) || qty < 1 || qty > max;
      const fee = bad ? 0 : listingFee(price);
      sum.replaceChildren(document.createTextNode(bad ? `Preço de ${MARKET_MIN_PRICE} a ${num(MARKET_MAX_PRICE)} Tostões.` : `Taxa de listagem: `), ...(bad ? [] : [Object.assign(el("b"), { textContent: `${num(fee)} Tostões` }), document.createTextNode(` · você recebe `), Object.assign(el("b"), { textContent: `${num(price)}` }), document.createTextNode(` (o preço inteiro) quando vender. Valor médio: ${num(itemValue(id) * qty)}.`)]));
      go.disabled = bad || snap.iron < fee || busy;
      if (!bad && snap.iron < fee) sum.append(document.createTextNode(" Tostões insuficientes para a taxa."));
    };
    if (max > 1) {
      const lq = el("label", "", "Qtd.");
      const iq = el("input", "q"); iq.type = "number"; iq.min = "1"; iq.max = String(max); iq.value = String(max); iq.dataset.k = "lq";
      iq.oninput = () => { qty = Math.max(1, Math.min(max, Math.floor(Number(iq.value) || 1))); paint(); };
      lq.append(iq);
      form.append(lq);
    }
    const lp = el("label", "", "Preço");
    const ip = el("input"); ip.type = "number"; ip.min = String(MARKET_MIN_PRICE); ip.max = String(MARKET_MAX_PRICE); ip.value = String(price); ip.dataset.k = "lp"; ip.inputMode = "numeric";
    ip.oninput = () => { price = Math.floor(Number(ip.value)); paint(); };
    lp.append(ip);
    form.append(lp, sum, go);
    go.onclick = () => { if (go.disabled) return; busy = true; send(Msg.MarketList, { slot, qty, price }); paint(); };
    paint();
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
    act.append(priceEl(l.price));
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
    setDone(d) {
      busy = false;
      opts.toast(d.text, d.ok ? "#9fe0a8" : "#ffb3a6");
      if (d.ok && d.kind === "list") listSlot = -1;
      if (npc) { browse(); askMine(); render(); }
    },
  };
}
