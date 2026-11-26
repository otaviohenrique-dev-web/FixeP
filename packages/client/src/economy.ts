import { isTypingTarget } from "./keys";
import { mountMarket } from "./market";
import { mountQuests } from "./quests";
import { bindItemTip } from "./itemtip";
import {
  ITEMS, INV_SLOTS, Msg, RARITY_COLOR, RARITY_NAME, COIN_IRON, COIN_OBOL, MERGE_COUNT, TRADE_MAX_ITEMS, BREAK_CONFIRM_FROM, BREAK_STRONG_FROM, MAX_COINS,
  rarityIndex, itemValue, buyPrice, sellPrice, breakValue, shopStock, checkMerge, zoneRarityCap, coinName, CLASS_DEFS, type CharClass,
  TRADE_CHAT_MAX_LEN, RARITIES, PECA_NOME, PECAS_CRAFT, familiasArma, familiasSecundaria, nomeFamilia, receitaArma, receitaPeca, faltasReceita, materiaisDesmonte, precisaConfirmarDesmonte, progressoSet, nomeIngrediente, custoRefino, faltasRefino, bonusRefino, isRefinavel, rotuloRefino, MAX_REFINO, GEMAS, GEMA_BY_ID, espacosDe, EQUIP_SLOTS, type EquipSlot, type PecaCraft, type Rarity, type Receita, type InventorySnapshot, type ItemDef, type NpcDef, type TradeEvent, type TradeOfferSide, type MarketPage, type MarketPricesEvent, type MarketMineEvent, type MarketDoneEvent, type QuestEvent, type QuestDefsEvent,
} from "@frixep/shared";

/**
 * Interface da economia (DOM): saldo de moedas, comerciante, ferreira, troca entre jogadores e confirmação de quebrar.
 * O servidor decide tudo (distância, saldo, espaço, chance): aqui só se mostram os mesmos números e se pedem as ações.
 */
export interface EconomyUi {
  setSnapshot(s: InventorySnapshot): void;
  openNpc(npc: NpcDef): void;
  closeNpc(): void;
  isNpcOpen(): boolean;
  /** NPC ao alcance (ou null): mostra o botão "Falar com ..." (celular e teclado) */
  setNearNpc(npc: NpcDef | null): void;
  setTrade(ev: TradeEvent): void;
  showTradeInvite(from: string): void;
  endTradeInvite(): void;
  isTrading(): boolean;
  /** mensagem do chat privado da troca (só existe enquanto a troca está aberta) */
  tradeChat(name: string, text: string): void;
  /** abre o diálogo de confirmação de quebrar o item do espaço `slot` */
  confirmBreak(slot: number): void;
  setMarketPage(p: MarketPage): void;
  setMarketPrices(p: MarketPricesEvent): void;
  setMarketMine(m: MarketMineEvent): void;
  setMarketDone(d: MarketDoneEvent): void;
  /** quests (C1.2): estado e definições vindos do servidor, e recusas/avisos para a caixa do NPC */
  setQuests(ev: QuestEvent): void;
  setQuestDefs(ev: QuestDefsEvent): void;
  questNotice(text: string, ok: boolean): void;
}

const CSS = `
.ec-wallet{position:fixed;top:max(14px,env(safe-area-inset-top));right:170px;z-index:20;display:flex;gap:10px;align-items:center;height:44px;padding:0 12px;border-radius:22px;
  background:rgba(8,16,28,.7);border:1px solid rgba(160,200,240,.3);backdrop-filter:blur(6px);-webkit-backdrop-filter:blur(6px);font:700 13px/1 "Cinzel",Georgia,serif;color:#e6eef9;pointer-events:none}
.ec-wallet span{display:flex;align-items:center;gap:4px}
.ec-wallet img,.ec-coin{width:20px;height:20px;image-rendering:pixelated;flex:none}
.ec-wallet .o{color:#ff8a7a}
.ec-back{position:fixed;inset:0;z-index:21;display:none;align-items:center;justify-content:center;background:rgba(2,5,11,.6);padding:12px;font-family:"Cinzel",Georgia,serif}
.ec-back.open{display:flex}
.ec-card{width:min(640px,100%);max-height:calc(100vh - 24px);display:flex;flex-direction:column;border-radius:8px;color:#dbeaff;
  background:linear-gradient(180deg,rgba(20,34,52,.98),rgba(6,12,20,.99));border:1px solid rgba(255,150,70,.45);box-shadow:0 18px 50px rgba(0,0,0,.75),inset 0 1px 0 rgba(180,220,255,.12)}
.ec-head{display:flex;align-items:center;gap:10px;padding:12px 14px 8px}
.ec-title{margin:0;flex:1;font-size:14px;font-weight:700;letter-spacing:.3em;text-transform:uppercase;color:#ffb072;text-shadow:0 0 14px rgba(255,120,40,.5)}
.ec-title small{display:block;margin-top:3px;font:400 11px/1.2 Georgia,serif;letter-spacing:.02em;text-transform:none;color:#9fc0e0;text-shadow:none}
.ec-x{width:34px;height:34px;border-radius:50%;cursor:pointer;color:#bcd8f5;background:transparent;border:1px solid rgba(160,200,240,.3);font:700 16px/1 Georgia,serif}
.ec-x:focus-visible,.ec-btn:focus-visible,.ec-tab:focus-visible,.ec-near:focus-visible{outline:2px solid #ffd2a3;outline-offset:2px}
.ec-bal{display:flex;gap:14px;padding:0 14px 8px;font:700 12px/1 "Cinzel",Georgia,serif}
.ec-bal span{display:flex;align-items:center;gap:5px}
.ec-tabs{display:flex;gap:6px;padding:0 14px 8px}
.ec-tab{flex:1;min-height:36px;border-radius:5px;cursor:pointer;font:700 11px/1 "Cinzel",Georgia,serif;letter-spacing:.14em;text-transform:uppercase;color:#9fc0e0;background:rgba(6,12,20,.7);border:1px solid rgba(160,200,240,.2)}
.ec-tab[aria-selected=true]{color:#fff;border-color:#ff9a4d;background:rgba(255,140,60,.12)}
.ec-list{overflow:auto;padding:0 14px 10px;display:flex;flex-direction:column;gap:5px;min-height:120px}
.ec-row{display:flex;align-items:center;gap:10px;padding:6px 8px;border-radius:5px;background:rgba(6,12,20,.7);border:1px solid rgba(160,200,240,.18)}
.ec-row.sel{border-color:#ffd08a;box-shadow:0 0 12px rgba(255,170,80,.3)}
.ec-row.dis{opacity:.5}
.ec-ic{width:60px;height:60px;flex:none;image-rendering:auto;object-fit:contain}
.ec-info{flex:1;min-width:0}
.ec-info b{display:block;font:700 12px/1.25 "Cinzel",Georgia,serif;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.ec-info small{display:block;font:400 11px/1.3 Georgia,serif;color:#9fc0e0}
.ec-price{display:flex;align-items:center;gap:4px;font:700 12px/1 "Cinzel",Georgia,serif;white-space:nowrap;color:#e6eef9}
.ec-price.bad{color:#ff9d8a}
.ec-btn{min-height:36px;padding:0 12px;border-radius:5px;cursor:pointer;font:700 11px/1 "Cinzel",Georgia,serif;letter-spacing:.1em;text-transform:uppercase;color:#eaf4ff;
  background:linear-gradient(180deg,rgba(24,40,60,.85),rgba(7,13,22,.92));border:1px solid rgba(255,150,70,.4);touch-action:manipulation}
.ec-btn:hover:not(:disabled){border-color:#ff9a4d}
.ec-btn:disabled{opacity:.4;cursor:default}
.ec-btn.danger{border-color:rgba(255,110,90,.55);color:#ffb3a6}
.ec-btn.go{border-color:#7dd68a;color:#c9ffd2}
.ec-note{margin:0;padding:0 14px 10px;font:400 12px/1.45 Georgia,serif;color:#9fc0e0}
.ec-note.bad{color:#ff9d8a}
.ec-foot{display:flex;gap:8px;align-items:center;padding:10px 14px 14px;border-top:1px solid rgba(160,200,240,.15)}
.ec-foot .ec-note{flex:1;padding:0}
.ec-empty{padding:18px 6px;text-align:center;font:400 12px/1.4 Georgia,serif;color:#7fa6cc}
.ec-near{position:fixed;left:50%;bottom:calc(max(96px,env(safe-area-inset-bottom)) + 70px);transform:translateX(-50%);z-index:18;display:none;min-height:42px;padding:0 18px;border-radius:21px;cursor:pointer;
  font:700 12px/1 "Cinzel",Georgia,serif;letter-spacing:.12em;color:#f4e6b8;background:rgba(40,26,12,.88);border:2px solid #c9a45c;box-shadow:0 4px 14px rgba(0,0,0,.6);touch-action:manipulation}
.ec-near.show{display:block}
@media (max-width:620px){.ec-wallet{right:12px;top:calc(max(14px,env(safe-area-inset-top)) + 54px);height:30px;padding:0 10px;font-size:12px}.ec-wallet img{width:16px;height:16px}.ec-near{bottom:calc(max(96px,env(safe-area-inset-bottom)) + 150px)}.ec-near kbd{display:none}}
.ec-near kbd{margin-right:8px;font:inherit;opacity:.7}
.ec-trade{width:min(720px,100%)}
.ec-tchat{margin:0 14px 8px;border-radius:6px;background:rgba(6,12,20,.6);border:1px solid rgba(201,164,92,.35);display:flex;flex-direction:column}
.ec-tchat>button{all:unset;cursor:pointer;padding:7px 10px;font:700 10px/1 "Cinzel",Georgia,serif;letter-spacing:.16em;text-transform:uppercase;color:#c9a45c;display:flex;justify-content:space-between;touch-action:manipulation}
.ec-tchat>button:focus-visible{outline:2px solid #ffd2a3}
.ec-tchat.min .ec-tlog,.ec-tchat.min form{display:none}
.ec-tlog{height:74px;overflow:auto;padding:4px 10px;font:400 12px/1.4 Georgia,serif;color:#cfe0f3;display:flex;flex-direction:column;gap:2px}
.ec-tlog b{color:#ffb072;font-weight:700}.ec-tlog .me b{color:#9fe0a8}.ec-tlog i{color:#7fa6cc}
.ec-tchat form{display:flex;gap:6px;padding:4px 8px 8px}
.ec-tchat input{flex:1;min-width:0;min-height:34px;box-sizing:border-box;padding:0 8px;border-radius:5px;border:1px solid rgba(160,200,240,.3);background:rgba(6,12,20,.9);color:#fff;font:400 16px/1 Georgia,serif}
.ec-cols{display:grid;grid-template-columns:1fr 1fr;gap:10px;padding:0 14px 8px;overflow:auto}
@media (max-width:620px){.ec-cols{grid-template-columns:1fr}}
.ec-col{display:flex;flex-direction:column;gap:6px;padding:8px;border-radius:6px;background:rgba(6,12,20,.55);border:1px solid rgba(160,200,240,.18)}
.ec-col.ok{border-color:#7dd68a;box-shadow:0 0 14px rgba(125,214,138,.25)}
.ec-col h3{margin:0;font:700 11px/1.2 "Cinzel",Georgia,serif;letter-spacing:.16em;text-transform:uppercase;color:#ffb072;display:flex;justify-content:space-between;gap:6px}
.ec-col h3 em{font-style:normal;color:#7dd68a;letter-spacing:.06em}
.ec-offer{display:flex;flex-wrap:wrap;gap:5px;min-height:46px;align-content:flex-start}
.ec-chip{position:relative;width:44px;height:44px;border-radius:5px;background:rgba(6,12,20,.8);border:1px solid rgba(160,200,240,.25);display:grid;place-items:center;padding:0}
.ec-chip img{width:36px;height:36px;image-rendering:pixelated}
.ec-chip i{position:absolute;right:2px;bottom:1px;font:700 10px/1 "Cinzel",Georgia,serif;font-style:normal;text-shadow:0 1px 3px #000}
.ec-grid{display:grid;grid-template-columns:repeat(8,1fr);gap:4px}
.ec-bagwrap{padding:0 14px 8px;overflow:auto}
.ec-offer .ec-chip{cursor:pointer;color:inherit}
.ec-grid .ec-chip{width:auto;height:auto;aspect-ratio:1;cursor:pointer;color:inherit}
.ec-grid .ec-chip[aria-pressed=true]{border-color:#ffd08a;box-shadow:0 0 10px rgba(255,170,80,.4)}
.ec-seg{display:flex;flex-wrap:wrap;gap:6px;padding:0 14px 6px}
.ec-seg .ec-tab{flex:0 0 auto;min-width:86px;padding:0 10px;min-height:34px}
.ec-craft-lbl{padding:6px 14px 0;font:700 10px/1.2 "Cinzel",Georgia,serif;letter-spacing:.16em;text-transform:uppercase;color:#7fa6cc}
.ec-req{display:flex;align-items:center;gap:8px;margin:0 14px;padding:4px 8px;border-radius:5px;background:rgba(6,12,20,.7);border:1px solid rgba(160,200,240,.18);font:700 12px/1.2 "Cinzel",Georgia,serif;color:#dbeaff}
.ec-req img{width:24px;height:24px;image-rendering:pixelated;flex:none}
.ec-req span{flex:1;min-width:0}
.ec-req b{font-weight:700}
.ec-req.ok b{color:#7dd68a}.ec-req.no b{color:#ff9d8a}
.ec-coinrow{display:flex;align-items:center;gap:6px;font:700 11px/1 "Cinzel",Georgia,serif}
.ec-coinrow input{width:92px;min-height:30px;box-sizing:border-box;padding:0 6px;border-radius:5px;border:1px solid rgba(160,200,240,.3);background:rgba(6,12,20,.9);color:#fff;font:700 12px/1 "Cinzel",Georgia,serif}
.ec-invite{position:fixed;left:50%;bottom:calc(max(96px,env(safe-area-inset-bottom)) + 64px);transform:translateX(-50%);z-index:24;display:none;align-items:center;gap:10px;flex-wrap:wrap;justify-content:center;padding:10px 14px;border-radius:8px;max-width:calc(100vw - 24px);
  font:700 12px/1.3 "Cinzel",Georgia,serif;color:#f4e6b8;background:rgba(20,30,46,.96);border:2px solid #c9a45c;box-shadow:0 6px 20px rgba(0,0,0,.7)}
.ec-invite.show{display:flex}
.ec-dlg{width:min(420px,100%);padding:16px;gap:10px}
.ec-dlg h2{margin:0;font:700 14px/1.2 "Cinzel",Georgia,serif;letter-spacing:.12em;color:#ffb3a6}
.ec-dlg p{margin:0;font:400 13px/1.45 Georgia,serif;color:#cfe0f3}
.ec-dlg input{min-height:40px;box-sizing:border-box;padding:0 10px;border-radius:5px;border:1px solid rgba(255,110,90,.55);background:rgba(6,12,20,.9);color:#fff;font:700 14px/1 "Cinzel",Georgia,serif;letter-spacing:.2em;text-transform:uppercase}
.ec-dlg .ec-row{margin:2px 0}
.ec-dlg-acts{display:flex;gap:8px;justify-content:flex-end}
`;

const el = <K extends keyof HTMLElementTagNameMap>(tag: K, cls = "", text = ""): HTMLElementTagNameMap[K] => {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text) e.textContent = text;
  return e;
};
const num = (n: number) => n.toLocaleString("pt-BR");

function itemImg(id: string, cls = "ec-ic"): HTMLImageElement {
  const i = el("img", cls);
  i.src = `/assets/items/item_${id}.png`;
  i.alt = "";
  i.draggable = false;
  i.onerror = () => { i.style.visibility = "hidden"; };
  return i;
}
const coinImg = (kind: "iron" | "obols") => itemImg(kind === "iron" ? COIN_IRON.id : COIN_OBOL.id, "ec-coin");

function price(n: number, bad = false): HTMLElement {
  const p = el("span", "ec-price" + (bad ? " bad" : ""));
  p.append(coinImg("iron"), document.createTextNode(num(n)));
  return p;
}

/** resumo curto dos atributos de um item */
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
  return `${RARITY_NAME[d.rarity]} · nv ${d.minLevel}${o.length ? " · " + o.join(" · ") : ""}`;
}

export function mountEconomy(opts: { send(type: string, payload: unknown): void; getClass(): CharClass; getZone(): number; getLevel(): number; toast(text: string, color?: string): void; onNpc?(npc: NpcDef): void }): EconomyUi {
  const style = el("style");
  style.textContent = CSS;
  document.head.append(style);

  let snap: InventorySnapshot = { inv: Array.from({ length: INV_SLOTS }, () => null), equip: { weapon: null, offhand: null, helmet: null, armor: null, boots: null, cape: null }, iron: 0, obols: 0 };

  // ---- saldo: não fica mais fixo na tela (aparece na Mochila, ao lado do título); o elemento segue existindo, fora da página
  const wallet = el("div", "ec-wallet");
  wallet.setAttribute("aria-label", "Moedas");
  const wIron = el("span"), wObol = el("span", "o");
  wIron.title = COIN_IRON.name;
  wObol.title = COIN_OBOL.name;
  const wIronN = el("b"), wObolN = el("b");
  wIron.append(coinImg("iron"), wIronN);
  wObol.append(coinImg("obols"), wObolN);
  wallet.append(wIron, wObol);

  // ---- botão "Falar com ..." (aparece perto de um NPC; serve ao toque e ao teclado)
  const near = el("button", "ec-near");
  near.type = "button";
  document.body.append(near);
  let nearNpc: NpcDef | null = null;
  near.onclick = () => { if (nearNpc) openNpc(nearNpc); };

  // ---- janela dos NPCs
  const back = el("div", "ec-back");
  const card = el("div", "ec-card");
  card.setAttribute("role", "dialog");
  card.setAttribute("aria-modal", "true");
  back.append(card);
  document.body.append(back);
  let npc: NpcDef | null = null;
  let tab: "buy" | "sell" = "buy";
  const picked = new Set<number>(); // ferreira: espaços escolhidos
  const confirmSell = new Set<number>(); // venda de item raro: pede um segundo clique
  let smithTab: "merge" | "craft" | "refine" | "socket" | "dismantle" = "merge"; // ferreira: fundir, craftar, refinar, engastar ou desmontar
  // craft (aba Craftar): escolha atual; as famílias guardam a última escolha de cada tipo
  const craftSel: { tipo: "arma" | "peca"; peca: PecaCraft; raridade: Rarity; arma: string; sec: string } = { tipo: "arma", peca: "armor", raridade: "common", arma: "", sec: "" };

  const market = mountMarket({ send: opts.send, toast: opts.toast, getClass: opts.getClass });
  const closeNpc = () => { back.classList.remove("open"); market.close(); npc = null; picked.clear(); confirmSell.clear(); };
  // caixa de quests do NPC (C1.2): abre antes do comércio quando o NPC dá ou recebe quest; "Comércio" dentro dela abre a loja
  const quest = mountQuests({ send: opts.send, getLevel: opts.getLevel, onTrade: (n) => { if (n.kind === "auctioneer") { closeNpc(); market.open(n); } else openShop(n); } });
  function openNpc(n: NpcDef) {
    if (tradeOpen) return;
    opts.onNpc?.(n);
    opts.send("quest_falar", { npc: n.id }); // objetivos "falar": o servidor confere a distância
    if (quest.open(n)) return; // quem tem missão a dar/receber (inclusive o leiloeiro) mostra a caixa de missões primeiro
    if (n.kind === "auctioneer") { closeNpc(); market.open(n); return; }
    openShop(n);
  }
  function openShop(n: NpcDef) {
    if (tradeOpen) return;
    market.close();
    npc = n; tab = "buy"; smithTab = "merge"; picked.clear(); confirmSell.clear();
    back.classList.add("open");
    renderNpc();
  }
  back.onclick = (e) => { if (e.target === back) closeNpc(); };

  function head(title: string, sub: string, onClose: () => void) {
    const h = el("div", "ec-head");
    const t = el("h2", "ec-title", title);
    t.append(el("small", "", sub));
    const x = el("button", "ec-x", "×");
    x.type = "button";
    x.setAttribute("aria-label", "Fechar");
    x.onclick = onClose;
    h.append(t, x);
    return h;
  }
  const balance = () => {
    const b = el("div", "ec-bal");
    const a = el("span"); a.append(coinImg("iron"), document.createTextNode(`${num(snap.iron)} ${COIN_IRON.short}`));
    const c = el("span"); c.style.color = COIN_OBOL.color; c.append(coinImg("obols"), document.createTextNode(`${num(snap.obols)} ${COIN_OBOL.short}`));
    b.append(a, c);
    return b;
  };

  function renderNpc() {
    if (!npc) return;
    card.replaceChildren();
    if (npc.kind === "merchant") renderMerchant(npc); else renderSmith(npc);
  }

  function renderMerchant(n: NpcDef) {
    card.append(head(`${n.name} · ${n.title}`, "Compro barato, vendo caro. Nada é de graça no submundo.", closeNpc), balance());
    const tabs = el("div", "ec-tabs");
    tabs.setAttribute("role", "tablist");
    for (const [k, label] of [["buy", "Comprar"], ["sell", "Vender"]] as const) {
      const b = el("button", "ec-tab", label);
      b.type = "button";
      b.setAttribute("role", "tab");
      b.setAttribute("aria-selected", String(tab === k));
      b.onclick = () => { tab = k; confirmSell.clear(); renderNpc(); };
      tabs.append(b);
    }
    card.append(tabs);
    const list = el("div", "ec-list");
    if (tab === "buy") {
      for (const id of shopStock(opts.getClass())) {
        const d = ITEMS[id];
        const p = buyPrice(id);
        const row = el("div", "ec-row" + (snap.iron < p ? " dis" : ""));
        const info = el("div", "ec-info");
        const nm = el("b", "", d.name);
        nm.style.color = RARITY_COLOR[d.rarity];
        info.append(nm, el("small", "", d.kind === "potion" ? d.desc : brief(d)));
        const b = el("button", "ec-btn", "Comprar");
        b.type = "button";
        b.disabled = snap.iron < p;
        b.onclick = () => opts.send(Msg.ShopBuy, { npc: n.id, id, qty: 1 });
        const ic = itemImg(id);
        // ficha completa do item (atributos, classe, nível), igual à da mochila; no toque, o botão Comprar não abre a ficha
        const tipData = () => ({ def: d, cmp: d.kind !== "potion" ? equippedOf(d.kind) : null });
        bindItemTip(ic, tipData);
        bindItemTip(info, tipData);
        row.append(ic, info, price(p, snap.iron < p), b);
        if (d.kind === "potion") {
          const b5 = el("button", "ec-btn", "×5");
          b5.type = "button";
          b5.disabled = snap.iron < p * 5;
          b5.onclick = () => opts.send(Msg.ShopBuy, { npc: n.id, id, qty: 5 });
          row.append(b5);
        }
        list.append(row);
      }
      card.append(list, el("p", "ec-note", `O comerciante só vende o equipamento da sua classe (${CLASS_DEFS[opts.getClass()].name}) até a raridade ${RARITY_NAME.rare.toLowerCase()}. O resto vem dos chefes e da forja.`));
    } else {
      let any = false;
      snap.inv.forEach((st, i) => {
        if (!st || !ITEMS[st.id]) return;
        any = true;
        const d = ITEMS[st.id];
        const each = sellPrice(st.id);
        const row = el("div", "ec-row");
        const info = el("div", "ec-info");
        const nm = el("b", "", d.name + (st.qty > 1 ? ` ×${st.qty}` : ""));
        nm.style.color = RARITY_COLOR[d.rarity];
        info.append(nm, el("small", "", `Valor médio ${num(itemValue(st.id))} · ${d.kind === "potion" ? d.desc : brief(d)}`));
        const strong = rarityIndex(d.rarity) >= BREAK_CONFIRM_FROM;
        const b = el("button", "ec-btn" + (confirmSell.has(i) ? " danger" : ""), confirmSell.has(i) ? "Confirmar?" : "Vender");
        b.type = "button";
        b.onclick = () => {
          if (strong && !confirmSell.has(i)) { confirmSell.add(i); renderNpc(); return; }
          confirmSell.delete(i);
          opts.send(Msg.ShopSell, { npc: n.id, slot: i, qty: 1 });
        };
        row.append(itemImg(st.id), info, price(each), b);
        if (st.qty > 1) {
          const all = el("button", "ec-btn", "Tudo");
          all.type = "button";
          all.onclick = () => opts.send(Msg.ShopSell, { npc: n.id, slot: i, qty: st.qty });
          row.append(all);
        }
        list.append(row);
      });
      if (!any) list.append(el("div", "ec-empty", "Sua mochila está vazia."));
      card.append(list, el("p", "ec-note", "Só o que está na mochila se vende (equipado, não). O comerciante paga bem menos que o valor médio."));
    }
  }

  function renderSmith(n: NpcDef) {
    const craft = smithTab === "craft";
    const textoAba = smithTab === "dismantle" ? "Desmonta um equipamento da mochila em materiais de craft. Raro para cima pede confirmação." : smithTab === "socket" ? "Engasta uma gema num espaço livre do equipamento, pagando Óbolos de Sangue. Remover libera o espaço (a gema se perde)." : smithTab === "refine" ? "Sobe o refino (+1 por vez) de um equipamento com Tostões e material. Nunca quebra o item." : craft ? "Cria arma ou peça de set com ingredientes e moedas. Épico para cima pede Óbolos de Sangue." : `Funde ${MERGE_COUNT} equipamentos iguais num de raridade superior. Pode falhar.`;
    card.append(head(`${n.name} · ${n.title}`, textoAba, closeNpc), balance());
    const tabs = el("div", "ec-tabs");
    tabs.setAttribute("role", "tablist");
    for (const [k, label] of [["merge", "Fundir"], ["craft", "Craftar"], ["refine", "Refinar"], ["socket", "Engastar"], ["dismantle", "Desmontar"]] as const) {
      const b = el("button", "ec-tab", label);
      b.type = "button";
      b.setAttribute("role", "tab");
      b.setAttribute("aria-selected", String(smithTab === k));
      b.onclick = () => { smithTab = k; picked.clear(); renderNpc(); };
      tabs.append(b);
    }
    card.append(tabs);
    if (craft) { renderCraft(n); return; }
    if (smithTab === "refine") { renderRefine(n); return; }
    if (smithTab === "dismantle") { renderDismantle(n); return; }
    if (smithTab === "socket") { renderSocket(n); return; }
    const cap = zoneRarityCap(opts.getZone());
    // só equipamentos da mochila; depois da primeira escolha, só os compatíveis
    const first = [...picked][0];
    const f = first !== undefined && snap.inv[first] ? ITEMS[snap.inv[first]!.id] : null;
    const list = el("div", "ec-list");
    let any = false;
    snap.inv.forEach((st, i) => {
      if (!st || !ITEMS[st.id] || ITEMS[st.id].kind === "potion") return;
      const d = ITEMS[st.id];
      const ok = !f || (d.kind === f.kind && d.rarity === f.rarity && d.cls === f.cls);
      any = true;
      const row = el("button", "ec-row" + (picked.has(i) ? " sel" : "") + (ok ? "" : " dis"));
      row.type = "button";
      row.style.cssText = "cursor:pointer;color:inherit;text-align:left;font:inherit";
      row.disabled = !ok && !picked.has(i);
      const info = el("div", "ec-info");
      const nm = el("b", "", d.name);
      nm.style.color = RARITY_COLOR[d.rarity];
      info.append(nm, el("small", "", brief(d)));
      row.append(itemImg(st.id), info);
      row.onclick = () => { if (picked.has(i)) picked.delete(i); else if (picked.size < MERGE_COUNT) picked.add(i); renderNpc(); };
      list.append(row);
    });
    if (!any) list.append(el("div", "ec-empty", "Você não tem equipamentos na mochila."));
    card.append(list);
    const ids = [...picked].map((i) => snap.inv[i]?.id ?? "");
    const foot = el("div", "ec-foot");
    const note = el("p", "ec-note");
    const go = el("button", "ec-btn go", "Fundir");
    go.type = "button";
    go.disabled = true;
    if (picked.size < MERGE_COUNT) note.textContent = `Escolha ${MERGE_COUNT} itens iguais (mesmo tipo, raridade e classe). Teto da forja nesta zona: ${RARITY_NAME[cap]}.`;
    else {
      const c = checkMerge(ids, opts.getZone());
      if (!c.ok) { note.textContent = c.error; note.classList.add("bad"); } else {
        const need = c.fee;
        note.textContent = `Resultado: ${RARITY_NAME[c.to]} · chance ${Math.round(c.chance * 100)}% · custo ${num(need)} Tostões. Se falhar, a taxa e 1 dos itens se perdem.`;
        if (snap.iron < need) { note.classList.add("bad"); note.textContent += " Tostões insuficientes."; } else go.disabled = false;
      }
    }
    go.onclick = () => { opts.send(Msg.SmithMerge, { npc: n.id, slots: [...picked] }); picked.clear(); };
    foot.append(note, go);
    card.append(foot);
  }

  /** aba Craftar da ferreira: escolhe tipo, família, raridade; mostra ingredientes e moedas (verde = tem, vermelho = falta) e o progresso do set */
  function renderCraft(n: NpcDef) {
    const cls = opts.getClass();
    const armas = familiasArma(cls), secs = familiasSecundaria(cls);
    if (!craftSel.arma) craftSel.arma = armas[0];
    if (!craftSel.sec) craftSel.sec = secs[0] ?? "";
    const list = el("div", "ec-list");
    list.style.paddingTop = "6px";
    const seg = <T extends string>(opcoes: [T, string][], atual: T, pick: (v: T) => void) => {
      const w = el("div", "ec-seg");
      w.setAttribute("role", "tablist");
      for (const [v, label] of opcoes) {
        const b = el("button", "ec-tab", label);
        b.type = "button";
        b.setAttribute("role", "tab");
        b.setAttribute("aria-selected", String(atual === v));
        b.onclick = () => { pick(v); renderNpc(); };
        w.append(b);
      }
      return w;
    };
    const lbl = (t: string) => el("div", "ec-craft-lbl", t);
    list.append(lbl("Tipo"), seg<"arma" | "peca">([["arma", "Arma"], ["peca", "Peça de set"]], craftSel.tipo, (v) => { craftSel.tipo = v; }));
    if (craftSel.tipo === "arma") {
      list.append(lbl("Arma da sua classe"), seg(armas.map((f) => [f, nomeFamilia(f)] as [string, string]), craftSel.arma, (v) => { craftSel.arma = v; }));
    } else {
      list.append(lbl("Peça"), seg(PECAS_CRAFT.map((p) => [p, PECA_NOME[p]] as [PecaCraft, string]), craftSel.peca, (v) => { craftSel.peca = v; }));
      if (craftSel.peca === "secundaria") list.append(lbl("Mão secundária"), seg(secs.map((f) => [f, nomeFamilia(f)] as [string, string]), craftSel.sec, (v) => { craftSel.sec = v; }));
    }
    list.append(lbl("Raridade"), seg(RARITIES.map((r) => [r, RARITY_NAME[r]] as [Rarity, string]), craftSel.raridade, (v) => { craftSel.raridade = v; }));

    const pecaSet = craftSel.tipo === "peca" && craftSel.peca !== "secundaria";
    const r: Receita | null = craftSel.tipo === "arma"
      ? receitaArma(craftSel.arma, craftSel.raridade)
      : receitaPeca(craftSel.peca, craftSel.raridade, cls, craftSel.peca === "secundaria" ? craftSel.sec : undefined);
    const foot = el("div", "ec-foot");
    const note = el("p", "ec-note");
    const go = el("button", "ec-btn go", "Craftar");
    go.type = "button";
    go.disabled = true;
    if (!r) {
      list.append(el("div", "ec-empty", "Não há receita para essa escolha."));
      note.textContent = "Escolha outra família ou raridade.";
      note.classList.add("bad");
    } else {
      const item = ITEMS[r.item];
      list.append(lbl(`Custo de ${item.name}`));
      const have = (id: string) => snap.inv.reduce((t, st) => t + (st?.id === id ? st.qty : 0), 0);
      const reqs: [string, HTMLElement | null, number, number][] = [
        ...Object.entries(r.mats).map(([id, need]) => [id, itemImg(id, "ec-ic"), have(id), need] as [string, HTMLElement, number, number]),
        [COIN_IRON.id, coinImg("iron"), snap.iron, r.tostoes],
        ...(r.obolos ? [[COIN_OBOL.id, coinImg("obols"), snap.obols, r.obolos] as [string, HTMLElement, number, number]] : []),
      ];
      for (const [id, img, tem, precisa] of reqs) {
        const ok = tem >= precisa;
        const row = el("div", "ec-req " + (ok ? "ok" : "no"));
        const nome = el("span", "", nomeIngrediente(id));
        const q = el("b", "", `${num(tem)} / ${num(precisa)}`);
        row.append(img ?? el("span"), nome, q);
        list.append(row);
      }
      list.append(el("p", "ec-note", `Nível ${r.minLevel} · ${RARITY_NAME[r.raridade]} · ${item.desc}`));
      if (pecaSet) {
        const owned = (id: string) => snap.inv.some((st) => st?.id === id) || Object.values(snap.equip).includes(id);
        const pr = progressoSet(cls, craftSel.raridade, owned);
        list.append(lbl(`Set ${RARITY_NAME[craftSel.raridade]} de ${CLASS_DEFS[cls].name}: ${pr.tem} de ${pr.total} peças`));
        for (const p of pr.pecas) {
          const row = el("div", "ec-req " + (p.tem ? "ok" : "no"));
          row.append(el("span", "", p.nome), el("b", "", p.tem ? "tem" : "falta"));
          list.append(row);
        }
      }
      const faltas = faltasReceita(r, have, snap.iron, snap.obols);
      if (opts.getLevel() < r.minLevel) {
        note.textContent = `Requer nível ${r.minLevel} (você está no ${opts.getLevel()}).`;
        note.classList.add("bad");
      } else if (faltas.length) {
        note.textContent = "Faltam: " + faltas.map((f) => nomeIngrediente(f.id)).join(", ") + ".";
        note.classList.add("bad");
      } else {
        note.textContent = "Pronto. O item sai com afixos sorteados; a receita é sempre a mesma.";
        go.disabled = false;
      }
      go.onclick = () => {
        opts.send(Msg.Craft, { npc: n.id, tipo: craftSel.tipo, familia: craftSel.tipo === "arma" ? craftSel.arma : craftSel.peca === "secundaria" ? craftSel.sec : undefined, peca: craftSel.tipo === "peca" ? craftSel.peca : undefined, raridade: craftSel.raridade });
      };
    }
    foot.append(note, go);
    card.append(list, foot);
  }

  /** aba Refinar da ferreira: escolhe um equipamento (mochila ou vestido); mostra o custo do próximo nível (verde = tem, vermelho = falta) e o que sobe. Nunca quebra o item. */
  let refineSel: { origem: "mochila" | "equip"; slot: number | EquipSlot } | null = null;
  function renderRefine(n: NpcDef) {
    const list = el("div", "ec-list");
    list.style.paddingTop = "6px";
    const lbl = (t: string) => el("div", "ec-craft-lbl", t);
    type Alvo = { origem: "mochila" | "equip"; slot: number | EquipSlot; id: string; rf: number };
    const alvos: Alvo[] = [];
    snap.inv.forEach((st, i) => { if (st && isRefinavel(ITEMS[st.id].kind, ITEMS[st.id].rarity)) alvos.push({ origem: "mochila", slot: i, id: st.id, rf: st.rf ?? 0 }); });
    for (const s of EQUIP_SLOTS) {
      const id = snap.equip[s];
      if (id && isRefinavel(ITEMS[id].kind, ITEMS[id].rarity)) alvos.push({ origem: "equip", slot: s, id, rf: snap.equipRf?.[s] ?? 0 });
    }
    const foot = el("div", "ec-foot");
    const note = el("p", "ec-note");
    const go = el("button", "ec-btn go", "Refinar");
    go.type = "button";
    go.disabled = true;
    if (!alvos.length) {
      list.append(el("div", "ec-empty", "Nenhum equipamento para refinar. Traga um da mochila ou vista um."));
      note.textContent = "Refinável: arma, mão secundária, elmo, armadura, botas e capa.";
    } else {
      const atual = alvos.find((a) => refineSel && a.origem === refineSel.origem && a.slot === refineSel.slot) ?? alvos[0];
      list.append(lbl("Equipamento"));
      const w = el("div", "ec-seg");
      w.setAttribute("role", "tablist");
      for (const a of alvos) {
        const rot = rotuloRefino(a.rf);
        const b = el("button", "ec-tab", (a.origem === "equip" ? "Vestido: " : "") + ITEMS[a.id].name + (rot ? " " + rot : ""));
        b.type = "button";
        b.setAttribute("role", "tab");
        b.setAttribute("aria-selected", String(a === atual));
        b.onclick = () => { refineSel = { origem: a.origem, slot: a.slot }; renderNpc(); };
        w.append(b);
      }
      list.append(w);
      const def = ITEMS[atual.id];
      const c = custoRefino(atual.rf, def.kind, def.rarity);
      if (!c) {
        list.append(el("div", "ec-empty", def.name + " já está no refino máximo (+" + MAX_REFINO + ")."));
        note.textContent = "Não dá para refinar mais.";
      } else {
        const have = (id: string) => snap.inv.reduce((t, st) => t + (st?.id === id ? st.qty : 0), 0);
        list.append(lbl("Custo para +" + (atual.rf + 1)));
        const reqs: [string, HTMLElement, number, number][] = [
          ...Object.entries(c.mats).map(([id, need]) => [id, itemImg(id, "ec-ic"), have(id), need] as [string, HTMLElement, number, number]),
          [COIN_IRON.id, coinImg("iron"), snap.iron, c.tostoes],
        ];
        for (const [id, img, tem, precisa] of reqs) {
          const row = el("div", "ec-req " + (tem >= precisa ? "ok" : "no"));
          row.append(img ?? el("span"), el("span", "", nomeIngrediente(id)), el("b", "", num(tem) + " / " + num(precisa)));
          list.append(row);
        }
        const antes = bonusRefino(atual.rf, def.kind, def.rarity), depois = bonusRefino(atual.rf + 1, def.kind, def.rarity);
        const ganho = depois.dmgPct > antes.dmgPct ? "+" + (depois.dmgPct - antes.dmgPct) + "% de dano" : "+" + (depois.hp - antes.hp) + " de vida";
        list.append(el("p", "ec-note", def.name + " sobe para +" + (atual.rf + 1) + ": " + ganho + "."));
        const faltas = faltasRefino(c, have, snap.iron);
        if (faltas.length) {
          note.textContent = "Faltam: " + faltas.map((f) => nomeIngrediente(f.id)).join(", ") + ".";
          note.classList.add("bad");
        } else {
          note.textContent = "Pronto. Refinar não tem chance de falha.";
          go.disabled = false;
        }
        const origem = atual.origem, slot = atual.slot;
        go.onclick = () => opts.send(Msg.Refine, { npc: n.id, origem, slot });
      }
    }
    foot.append(note, go);
    card.append(list, foot);
  }

  // aba Desmontar (C3.5): um equipamento da mochila vira materiais de craft; raro ou melhor pede confirmação
  let dismantleSel: number | null = null;
  function renderDismantle(n: NpcDef) {
    const list = el("div", "ec-list");
    list.style.paddingTop = "6px";
    const foot = el("div", "ec-foot");
    const note = el("p", "ec-note");
    const go = el("button", "ec-btn go", "Desmontar");
    go.type = "button";
    go.disabled = true;
    const alvos: number[] = [];
    snap.inv.forEach((st, i) => { if (st && materiaisDesmonte(st.id, st.rf ?? 0)) alvos.push(i); });
    if (!alvos.length) {
      list.append(el("div", "ec-empty", "Nada para desmontar. Traga um equipamento da mochila."));
      note.textContent = "Desmontável: arma, mão secundária, elmo, armadura, botas e capa.";
    } else {
      const atual = alvos.find((i) => i === dismantleSel) ?? alvos[0];
      list.append(el("div", "ec-craft-lbl", "Equipamento da mochila"));
      const w = el("div", "ec-seg");
      w.setAttribute("role", "tablist");
      for (const i of alvos) {
        const st = snap.inv[i]!;
        const d = ITEMS[st.id];
        const b = el("button", "ec-tab", d.name + (rotuloRefino(st.rf ?? 0) ? " " + rotuloRefino(st.rf ?? 0) : ""));
        b.type = "button";
        b.setAttribute("role", "tab");
        b.setAttribute("aria-selected", String(i === atual));
        b.onclick = () => { dismantleSel = i; renderNpc(); };
        w.append(b);
      }
      list.append(w);
      const st = snap.inv[atual]!;
      const d = ITEMS[st.id];
      const mats = materiaisDesmonte(st.id, st.rf ?? 0) ?? {};
      list.append(el("div", "ec-craft-lbl", "Você recebe"));
      for (const [id, qtd] of Object.entries(mats)) {
        const row = el("div", "ec-req ok");
        row.append(itemImg(id, "ec-ic") ?? el("span"), el("span", "", nomeIngrediente(id)), el("b", "", "+" + num(qtd)));
        list.append(row);
      }
      if (precisaConfirmarDesmonte(d.rarity)) list.append(el("p", "ec-note bad", `Este é um item ${RARITY_NAME[d.rarity].toLowerCase()}: vai pedir confirmação.`));
      note.textContent = "Troca tudo ou nada: se a mochila não tiver espaço para os materiais, o item fica.";
      go.disabled = false;
      go.onclick = () => {
        if (precisaConfirmarDesmonte(d.rarity) && !window.confirm(`Desmontar ${d.name}? O item será destruído e você recebe os materiais. Não pode ser desfeito.`)) return;
        opts.send(Msg.Dismantle, { npc: n.id, slot: atual, confirm: true });
      };
    }
    foot.append(note, go);
    card.append(list, foot);
  }

  /** aba Engastar da ferreira (C3.3): escolhe um equipamento (mochila ou vestido); mostra os espaços e as gemas.
   *  Põe gema num espaço livre (paga em Óbolos) ou tira uma (o espaço volta; a gema se perde). O servidor confere tudo. */
  let socketSel: { origem: "mochila" | "equip"; slot: number | EquipSlot } | null = null;
  function renderSocket(n: NpcDef) {
    const list = el("div", "ec-list");
    list.style.paddingTop = "6px";
    type Alvo = { origem: "mochila" | "equip"; slot: number | EquipSlot; id: string; gm: string[] };
    const alvos: Alvo[] = [];
    snap.inv.forEach((st, i) => { if (st && espacosDe(ITEMS[st.id].kind, ITEMS[st.id].rarity) > 0) alvos.push({ origem: "mochila", slot: i, id: st.id, gm: st.gm ?? [] }); });
    for (const s of EQUIP_SLOTS) {
      const id = snap.equip[s];
      if (id && espacosDe(ITEMS[id].kind, ITEMS[id].rarity) > 0) alvos.push({ origem: "equip", slot: s, id, gm: snap.equipGm?.[s] ?? [] });
    }
    const foot = el("div", "ec-foot");
    const note = el("p", "ec-note");
    const go = (label: string, onclick: () => void, ok: boolean) => { const b = el("button", "ec-btn go", label); b.type = "button"; b.disabled = !ok; b.onclick = onclick; return b; };
    if (!alvos.length) {
      list.append(el("div", "ec-empty", "Nenhum equipamento com espaço para gema. Engasta a partir do incomum (armas ganham um espaço a mais)."));
      note.textContent = "Engaste só equipamento de raridade incomum para cima.";
    } else {
      const atual = alvos.find((a) => socketSel && a.origem === socketSel.origem && a.slot === socketSel.slot) ?? alvos[0];
      const def = ITEMS[atual.id];
      const espacos = espacosDe(def.kind, def.rarity);
      const seg = el("div", "ec-seg");
      alvos.forEach((a) => {
        const d = ITEMS[a.id];
        const b = el("button", "ec-tab", d.name + " (" + a.gm.length + "/" + espacosDe(d.kind, d.rarity) + ")");
        b.type = "button";
        b.onclick = () => { socketSel = { origem: a.origem, slot: a.slot }; renderNpc(); };
        if (a === atual) b.setAttribute("aria-selected", "true");
        seg.append(b);
      });
      list.append(seg);
      const origem = atual.origem, slot = atual.slot;
      for (let k = 0; k < espacos; k++) {
        const gid = atual.gm[k];
        const linha = el("div", "ec-craft-lbl", gid ? "Espaço " + (k + 1) + ": " + GEMA_BY_ID[gid].nome : "Espaço " + (k + 1) + ": livre");
        if (gid) list.append(linha, go("Remover", () => opts.send(Msg.Unsocket, { npc: n.id, origem, slot, idx: k }), true));
        else list.append(linha);
      }
      const livre = atual.gm.length < espacos;
      for (const g of GEMAS.filter((x) => x.kinds.includes(def.kind))) {
        const ok = livre && snap.obols >= g.obolos;
        list.append(go("Engastar " + g.nome + " (" + g.obolos + " Óbolo" + (g.obolos > 1 ? "s" : "") + ")", () => opts.send(Msg.Socket, { npc: n.id, origem, slot, gema: g.id }), ok));
      }
      note.textContent = !livre ? def.name + " não tem espaço livre." : snap.obols < Math.min(...GEMAS.filter((x) => x.kinds.includes(def.kind)).map((x) => x.obolos)) ? "Faltam Óbolos de Sangue para qualquer gema." : "Escolha uma gema para o espaço livre.";
    }
    foot.append(note);
    card.append(list, foot);
  }

  // ---- troca entre jogadores
  const tback = el("div", "ec-back");
  const tcard = el("div", "ec-card ec-trade");
  tcard.setAttribute("role", "dialog");
  tcard.setAttribute("aria-modal", "true");
  tback.append(tcard);
  document.body.append(tback);
  let tradeOpen = false;
  let mineSlots = new Map<number, number>(); // espaço -> quantidade oferecida (a minha oferta LOCAL: é a verdade enquanto há pedido pendente)
  let mineIron = 0, mineObols = 0;
  let seq = 0, acked = 0; // seq: pedidos de oferta que enviei; acked: o último que o servidor confirmou (mine.seq)
  let last: TradeEvent | null = null;
  let sendTimer: ReturnType<typeof setTimeout> | undefined;
  const sendOffer = () => {
    clearTimeout(sendTimer);
    opts.send(Msg.TradeOffer, { items: [...mineSlots].map(([slot, qty]) => ({ slot, qty })), iron: mineIron, obols: mineObols, seq });
  };
  /** qualquer edição: sobe o contador e envia (pequena espera para juntar a digitação de moedas) */
  const pushOffer = (now = false) => {
    seq++;
    clearTimeout(sendTimer);
    if (now) sendOffer(); else sendTimer = setTimeout(sendOffer, 200);
  };
  // chat privado da troca: o histórico vive só enquanto a janela está aberta
  const tchat = el("div", "ec-tchat");
  const tchatBtn = el("button", "", "Sussurro da troca");
  tchatBtn.type = "button";
  const tlog = el("div", "ec-tlog");
  tlog.setAttribute("role", "log");
  const tform = el("form");
  const tin = el("input");
  tin.type = "text"; tin.maxLength = TRADE_CHAT_MAX_LEN; tin.placeholder = "Combine o negócio…"; tin.autocomplete = "off"; tin.enterKeyHint = "send";
  tin.setAttribute("aria-label", "Mensagem privada para o outro jogador");
  const tsend = el("button", "ec-btn", "Enviar");
  tsend.type = "submit";
  tform.append(tin, tsend);
  tchat.append(tchatBtn, tlog, tform);
  const setMin = (m: boolean) => { tchat.classList.toggle("min", m); tchatBtn.setAttribute("aria-expanded", String(!m)); tchatBtn.replaceChildren(document.createTextNode("Sussurro da troca"), el("span", "", m ? "▲" : "▼")); };
  tchatBtn.onclick = () => setMin(!tchat.classList.contains("min"));
  tform.onsubmit = (e) => { e.preventDefault(); const text = tin.value.trim(); if (text) opts.send(Msg.TradeChat, { text }); tin.value = ""; };
  tin.onkeydown = (e) => { e.stopPropagation(); if (e.key === "Escape") tin.blur(); };
  function tradeChat(name: string, text: string) {
    if (!tradeOpen) return;
    const l = el("div", last && name !== last.with ? "me" : "");
    l.append(el("b", "", name + ": "), document.createTextNode(text));
    tlog.append(l);
    while (tlog.children.length > 40) tlog.firstElementChild!.remove();
    tlog.scrollTop = tlog.scrollHeight;
    if (tchat.classList.contains("min")) tchatBtn.firstChild!.textContent = "Sussurro da troca •";
  }
  const cancelTrade = () => { opts.send(Msg.TradeCancel, {}); closeTradeUi(); };
  function closeTradeUi() { tradeOpen = false; tlog.replaceChildren(); tin.value = ""; tback.classList.remove("open"); clearTimeout(sendTimer); last = null; }

  const equippedOf = (kind: string): ItemDef | null => { const id = (snap.equip as Record<string, string | null>)[kind]; return id ? ITEMS[id] ?? null : null; };
  function chips(side: TradeOfferSide, onTake?: (slot: number) => void): HTMLElement {
    const box = el("div", "ec-offer");
    for (const it of side.items) {
      const d = ITEMS[it.id];
      if (!d) continue;
      const c = el(onTake ? "button" : "div", "ec-chip");
      if (c instanceof HTMLButtonElement) c.type = "button";
      // a ficha do item (toque ou mouse) é a mesma da mochila; compara com o equipado do mesmo tipo
      bindItemTip(c, () => ({ def: d, cmp: d.kind !== "potion" ? equippedOf(d.kind) : null }));
      c.style.borderColor = RARITY_COLOR[d.rarity] + "cc";
      c.append(itemImg(it.id, ""));
      if (it.qty > 1) { const q = el("i", "", String(it.qty)); c.append(q); }
      if (onTake && it.slot !== undefined) { const slot = it.slot; c.onclick = () => onTake(slot); c.setAttribute("aria-label", `Tirar ${d.name} da oferta`); }
      box.append(c);
    }
    if (side.iron) { const c = el("div", "ec-chip"); c.title = coinName(COIN_IRON.id, side.iron); c.append(itemImg(COIN_IRON.id, ""), el("i", "", num(side.iron))); box.append(c); }
    if (side.obols) { const c = el("div", "ec-chip"); c.title = coinName(COIN_OBOL.id, side.obols); c.append(itemImg(COIN_OBOL.id, ""), el("i", "", num(side.obols))); box.append(c); }
    if (!box.childElementCount) box.append(el("div", "ec-empty", "Nada ainda"));
    return box;
  }

  /** a oferta que MOSTRO como minha: a local (otimista), que é a verdade enquanto há pedido pendente */
  const localSide = (): TradeOfferSide => ({
    items: [...mineSlots].filter(([s]) => snap.inv[s]).map(([slot, qty]) => ({ slot, qty, id: snap.inv[slot]!.id })),
    iron: mineIron, obols: mineObols, ready: !!last?.mine?.ready,
  });

  function renderTrade(ev: TradeEvent) {
    last = ev;
    const mine = ev.mine!, theirs = ev.theirs!;
    // preserva o foco do campo de moedas (o painel é refeito a cada evento)
    const ae = document.activeElement as HTMLInputElement | null;
    const refocus = ae && tcard.contains(ae) && ae.dataset.kind ? { kind: ae.dataset.kind, at: ae.selectionStart } : null;
    const chatFocus = document.activeElement === tin;
    tcard.replaceChildren();
    tcard.append(head(`Troca com ${ev.with}`, "Os dois aceitam a mesma oferta. Qualquer mudança desfaz os aceites.", cancelTrade));
    const cols = el("div", "ec-cols");
    const m = el("div", "ec-col" + (mine.ready ? " ok" : ""));
    const mh = el("h3", "", "Sua oferta");
    if (mine.ready) mh.append(el("em", "", "aceitou ✓"));
    m.append(mh, chips(localSide(), (slot) => { mineSlots.delete(slot); pushOffer(true); renderTrade(last!); }));
    for (const [kind, label, get, set] of [["iron", COIN_IRON.short, () => mineIron, (v: number) => { mineIron = v; }], ["obols", COIN_OBOL.short, () => mineObols, (v: number) => { mineObols = v; }]] as const) {
      const r = el("label", "ec-coinrow");
      r.append(coinImg(kind));
      const inp = el("input");
      inp.type = "number"; inp.min = "0"; inp.max = String(Math.min(MAX_COINS, kind === "iron" ? snap.iron : snap.obols)); inp.step = "1"; inp.value = String(get());
      inp.dataset.kind = kind;
      inp.setAttribute("aria-label", `${label} a oferecer`);
      inp.oninput = () => {
        const v = Math.max(0, Math.min(Math.floor(Number(inp.value) || 0), kind === "iron" ? snap.iron : snap.obols));
        if (v === get()) return;
        set(v);
        pushOffer();
        paint();
      };
      inp.onblur = () => { inp.value = String(get()); };
      r.append(inp, document.createTextNode(`/ ${num(kind === "iron" ? snap.iron : snap.obols)}`));
      m.append(r);
    }
    const t = el("div", "ec-col" + (theirs.ready ? " ok" : ""));
    const th = el("h3", "", `Oferta de ${ev.with}`);
    if (theirs.ready) th.append(el("em", "", "aceitou ✓"));
    t.append(th, chips(theirs));
    cols.append(m, t);
    tcard.append(cols);
    // minha mochila: toque para colocar na oferta
    const bag = el("div", "ec-col");
    bag.append(el("h3", "", "Sua mochila · toque para oferecer"));
    const grid = el("div", "ec-grid");
    grid.setAttribute("role", "group");
    snap.inv.forEach((st, i) => {
      const c = el("button", "ec-chip");
      c.type = "button";
      const d = st ? ITEMS[st.id] : null;
      const on = mineSlots.has(i);
      c.setAttribute("aria-pressed", String(on));
      if (d && st) {
        c.title = `${d.name}${st.qty > 1 ? ` ×${st.qty}` : ""} — ${brief(d)}`;
        c.style.borderColor = RARITY_COLOR[d.rarity] + (on ? "ff" : "66");
        c.append(itemImg(st.id, ""));
        if (st.qty > 1) c.append(el("i", "", String(st.qty)));
        c.onclick = () => {
          if (on) mineSlots.delete(i);
          else if (mineSlots.size < TRADE_MAX_ITEMS) mineSlots.set(i, st.qty);
          else return opts.toast(`No máximo ${TRADE_MAX_ITEMS} itens por troca.`, "#ffb3a6");
          pushOffer(true);
          renderTrade(last!);
        };
      } else c.disabled = true;
      grid.append(c);
    });
    bag.append(grid);
    const bagWrap = el("div", "ec-bagwrap");
    bagWrap.append(bag);
    tcard.append(bagWrap);
    tcard.append(tchat);
    const foot = el("div", "ec-foot");
    const note = el("p", "ec-note");
    const ok = el("button", "ec-btn go");
    ok.type = "button";
    const cancel = el("button", "ec-btn danger", "Cancelar");
    cancel.type = "button";
    cancel.onclick = cancelTrade;
    const hasAny = (s: TradeOfferSide) => s.items.length > 0 || s.iron > 0 || s.obols > 0;
    function paint() {
      const pend = seq > acked;
      const something = hasAny(localSide()) || hasAny(theirs);
      ok.textContent = mine.ready ? "Retirar aceite" : "Aceitar";
      ok.disabled = mine.ready ? false : pend || !something;
      note.textContent = mine.ready ? (theirs.ready ? "Concluindo…" : "Você aceitou. Esperando o outro jogador…")
        : pend ? "Atualizando a oferta…" : !something ? "Coloque itens ou moedas na oferta." : theirs.ready ? `${ev.with} já aceitou. Confira e aceite.` : "Confira a oferta do outro jogador antes de aceitar.";
    }
    paint();
    ok.onclick = () => { if (!ok.disabled) opts.send(Msg.TradeReady, { ready: !mine.ready, rev: ev.rev }); };
    foot.append(note, ok, cancel);
    tcard.append(foot);
    if (chatFocus) tin.focus();
    if (refocus) {
      const inp = tcard.querySelector<HTMLInputElement>(`input[data-kind="${refocus.kind}"]`);
      if (inp) { inp.focus(); try { inp.setSelectionRange(refocus.at, refocus.at); } catch { /* type=number não aceita seleção */ } }
    }
  }

  // convite de troca
  const invite = el("div", "ec-invite");
  invite.setAttribute("role", "alertdialog");
  document.body.append(invite);
  const endTradeInvite = () => invite.classList.remove("show");
  function showTradeInvite(from: string) {
    invite.replaceChildren();
    invite.append(el("span", "", `${from} quer trocar com você`));
    const a = el("button", "ec-btn go", "Aceitar"); a.type = "button";
    a.onclick = () => { opts.send(Msg.TradeAccept, {}); endTradeInvite(); };
    const d = el("button", "ec-btn danger", "Recusar"); d.type = "button";
    d.onclick = () => { opts.send(Msg.TradeDecline, {}); endTradeInvite(); };
    invite.append(a, d);
    invite.classList.add("show");
  }

  function setTrade(ev: TradeEvent) {
    if (!ev.open) {
      const was = tradeOpen;
      closeTradeUi();
      if (was && ev.reason) opts.toast(ev.reason, ev.done ? "#9fe0a8" : "#ffb3a6");
      return;
    }
    if (!tradeOpen) { // abriu: fecha o que estiver aberto e zera a minha oferta
      closeNpc();
      tradeOpen = true;
      setMin(window.innerWidth <= 620);
      mineSlots = new Map(); mineIron = 0; mineObols = 0; seq = 0; acked = 0;
      tback.classList.add("open");
    }
    // o servidor confirma até onde processou meus pedidos (mine.seq). Só adoto a oferta dele quando NADA meu está pendente:
    // um eco antigo (de uma mudança do outro lado, por ex.) nunca apaga o que acabei de colocar.
    acked = Math.max(acked, ev.mine!.seq ?? 0);
    if (acked >= seq) {
      mineSlots = new Map(ev.mine!.items.filter((it) => it.slot !== undefined).map((it) => [it.slot!, it.qty]));
      mineIron = ev.mine!.iron; mineObols = ev.mine!.obols;
    }
    renderTrade(ev);
  }

  // ---- confirmação de quebrar (mais forte quanto mais rara)
  function confirmBreak(slot: number) {
    const st = snap.inv[slot];
    const d = st ? ITEMS[st.id] : null;
    if (!st || !d || d.kind === "potion") return;
    const ri = rarityIndex(d.rarity);
    const gain = breakValue(st.id) * st.qty;
    const b = el("div", "ec-back open");
    b.style.zIndex = "26";
    const c = el("div", "ec-card ec-dlg");
    c.setAttribute("role", "alertdialog");
    c.setAttribute("aria-modal", "true");
    c.append(el("h2", "", "Quebrar este item?"));
    const row = el("div", "ec-row");
    const info = el("div", "ec-info");
    const nm = el("b", "", d.name);
    nm.style.color = RARITY_COLOR[d.rarity];
    info.append(nm, el("small", "", brief(d)));
    row.append(itemImg(st.id), info);
    c.append(row, el("p", "", `Ele será destruído e você recebe ${num(gain)} Tostões de Ferro. Isso não pode ser desfeito.`));
    const strong = ri >= BREAK_STRONG_FROM;
    let input: HTMLInputElement | null = null;
    if (ri >= BREAK_CONFIRM_FROM) {
      const w = el("p", "ec-note bad", ri >= BREAK_STRONG_FROM ? `Atenção: é um item ${RARITY_NAME[d.rarity].toUpperCase()}. Vale muito mais vendido ou trocado.` : `Este é um item ${RARITY_NAME[d.rarity].toLowerCase()}. Vale mais vendido ao comerciante.`);
      w.style.padding = "0";
      c.append(w);
    }
    if (strong) {
      c.append(el("p", "", "Para confirmar, digite QUEBRAR:"));
      input = el("input");
      input.type = "text"; input.autocomplete = "off"; input.setAttribute("aria-label", "Digite QUEBRAR para confirmar");
      c.append(input);
    }
    const acts = el("div", "ec-dlg-acts");
    const no = el("button", "ec-btn", "Cancelar"); no.type = "button";
    const yes = el("button", "ec-btn danger", "Quebrar"); yes.type = "button";
    acts.append(no, yes);
    c.append(acts);
    b.append(c);
    document.body.append(b);
    const close = () => { window.removeEventListener("keydown", onKey, true); clearTimeout(unlock); b.remove(); };
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") { e.stopImmediatePropagation(); e.preventDefault(); close(); } };
    window.addEventListener("keydown", onKey, true);
    // proteção contra clique acidental: o botão só habilita depois de um instante (e, para épico ou melhor, de digitar a palavra)
    const need = ri >= BREAK_CONFIRM_FROM ? 1200 : 300;
    yes.disabled = true;
    const typed = () => !input || input.value.trim().toUpperCase() === "QUEBRAR";
    let waited = false;
    const refresh = () => { yes.disabled = !(waited && typed()); };
    const unlock = setTimeout(() => { waited = true; refresh(); }, need);
    input?.addEventListener("input", refresh);
    no.onclick = close;
    b.onclick = (e) => { if (e.target === b) close(); };
    yes.onclick = () => { if (yes.disabled) return; opts.send(Msg.InvBreak, { slot, confirm: true }); close(); };
    (input ?? no).focus();
  }

  // ---- teclado: Esc fecha as janelas (a de troca cancela a troca)
  window.addEventListener("keydown", (e) => {
    if (e.code === "Escape" && tradeOpen) { e.stopImmediatePropagation(); e.preventDefault(); cancelTrade(); return; }
    if (e.code === "Escape" && back.classList.contains("open")) { e.stopImmediatePropagation(); e.preventDefault(); closeNpc(); return; }
    if (isTypingTarget() || e.repeat) return;
    if (e.code === "KeyG" && nearNpc && !tradeOpen && !document.querySelector(".ec-back.open, .iv-back.open, .gm-back.open, .qst-back.open")) { e.preventDefault(); openNpc(nearNpc); } // G: falar com o NPC ao lado
  }, true);

  const paintWallet = () => { wIronN.textContent = num(snap.iron); wObolN.textContent = num(snap.obols); };
  paintWallet();

  return {
    setSnapshot(s) {
      snap = s;
      paintWallet();
      market.setSnapshot(s);
      for (const i of [...picked]) if (!snap.inv[i]) picked.delete(i);
      if (npc && back.classList.contains("open")) renderNpc();
      if (tradeOpen && last) renderTrade(last);
    },
    openNpc,
    closeNpc,
    isNpcOpen: () => back.classList.contains("open") || market.isOpen() || quest.isOpen(),
    setQuests: (ev) => quest.setQuests(ev),
    setQuestDefs: (ev) => quest.setDefs(ev),
    questNotice: (text, ok) => quest.notice(text, ok),
    setNearNpc(n) {
      nearNpc = n;
      // sem botão "Falar com..." na tela: o NPC mostra um "?" acima da placa; clicar/tocar nele ou apertar G abre a conversa
      near.classList.remove("show");
    },
    setTrade,
    showTradeInvite,
    endTradeInvite,
    isTrading: () => tradeOpen,
    tradeChat,
    confirmBreak,
    setMarketPage: (p) => market.setPage(p),
    setMarketPrices: (p) => market.setPrices(p),
    setMarketMine: (m) => market.setMine(m),
    setMarketDone: (d) => market.setDone(d),
  };
}
