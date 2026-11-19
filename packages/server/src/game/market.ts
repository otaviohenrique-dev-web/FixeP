import { randomUUID } from "node:crypto";
import {
  ITEMS, MAX_COINS, MARKET_MAX_ACTIVE, MARKET_MAX_OPEN, MARKET_MIN_PRICE, MARKET_MAX_PRICE, MARKET_DAYS, MARKET_PAGE, listingFee,
  cleanFilter, filterItemIds, type MarketPage, type MyListing,
} from "@frixep/shared";
import { addItem, canFit, validSlot, type Inventory } from "./inventory.js";
import type { Db } from "../db/index.js";
import type { Repo } from "../db/repo.js";

/**
 * Mercado dos jogadores: toda a regra e todo o SQL. O item fica em custódia na linha da listagem; cada operação é UMA transação:
 *   listar   = grava a listagem + a mochila já sem o item e sem a taxa;
 *   comprar  = "reivindica" a listagem (update ... where status='active': só UMA compra ganha) + grava a mochila do comprador;
 *   cancelar / recolher = fecha a listagem + grava a mochila de quem recolheu.
 * A mochila em memória só muda depois que o banco aceitou a reivindicação, e é desfeita se a gravação falhar.
 * Quem chama (ZoneRoom) serializa as operações de um mesmo jogador na fila de salvamento dele (nada grava por cima).
 */
export interface MarketActor { charId: string; name: string; inv: Inventory }
export type MarketResult = { ok: true; msg: string } | { ok: false; error: string };

class Abort extends Error {}
const abort = (m: string): never => { throw new Abort(m); };

interface Row { id: string; seller_id: string; seller_name: string; item_id: string; qty: number; price: number; fee: number; status: string; buyer_name: string | null; expires_ms: string | number }
const COLS = "id, seller_id, seller_name, item_id, qty, price, fee, status, buyer_name, (extract(epoch from expires_at) * 1000)::bigint as expires_ms";

export class Market {
  private lastSweep = 0;
  constructor(private db: Db, private repo: Repo, private now: () => number = Date.now, private ttlMs = MARKET_DAYS * 86_400_000) {}

  private iso(ms: number) { return new Date(ms).toISOString(); }

  /** Desfaz a mudança em memória (só quando a gravação falhou depois de a mochila já ter sido alterada). */
  private takeBack(inv: Inventory, did: { iron?: number; item?: { id: string; qty: number } }) {
    if (did.iron) inv.iron = Math.max(0, Math.min(MAX_COINS, inv.iron - did.iron));
    if (did.item) {
      let left = did.item.qty;
      for (let i = inv.slots.length - 1; i >= 0 && left > 0; i--) {
        const s = inv.slots[i];
        if (s && s.id === did.item.id) { const t = Math.min(left, s.qty); s.qty -= t; left -= t; if (s.qty <= 0) inv.slots[i] = null; }
      }
    }
  }

  private async persist(q: Parameters<Parameters<Db["tx"]>[0]>[0]["query"], a: MarketActor) {
    await this.repo.writeInventoryTx(q, a.charId, this.repo.inventoryRows(a.inv));
  }

  /** Roda `body` numa transação; Abort vira erro amigável (e desfaz o banco), qualquer outra falha vira erro genérico. */
  private async run(body: (q: Parameters<Parameters<Db["tx"]>[0]>[0]["query"]) => Promise<MarketResult>): Promise<MarketResult> {
    try {
      return await this.db.tx(({ query: q }) => body(q));
    } catch (e) {
      if (e instanceof Abort) return { ok: false, error: e.message };
      console.error("[mercado] falha:", (e as Error).message);
      return { ok: false, error: "O mercado não respondeu. Tente de novo." };
    }
  }

  // ---------------------------------------------------------------- listar
  async list(a: MarketActor, slot: unknown, qty: unknown, price: unknown): Promise<MarketResult> {
    if (!validSlot(slot)) return { ok: false, error: "Espaço inválido." };
    const st0 = a.inv.slots[slot];
    if (!st0 || !ITEMS[st0.id]) return { ok: false, error: "Espaço vazio." };
    if (typeof qty !== "number" || !Number.isInteger(qty) || qty < 1 || qty > st0.qty) return { ok: false, error: "Quantidade inválida." };
    if (typeof price !== "number" || !Number.isInteger(price) || price < MARKET_MIN_PRICE || price > MARKET_MAX_PRICE) return { ok: false, error: `O preço vai de ${MARKET_MIN_PRICE} a ${MARKET_MAX_PRICE.toLocaleString("pt-BR")} Tostões.` };
    const fee = listingFee(price);
    if (a.inv.iron < fee) return { ok: false, error: `Tostões insuficientes para a taxa de listagem (${fee}).` };
    const id = randomUUID();
    return this.run(async (q) => {
      await q("select pg_advisory_xact_lock(hashtext($1))", [`mk:${a.charId}`]);
      const c = (await q<{ act: string; open: string }>("select count(*) filter (where status = 'active')::text as act, count(*) filter (where status in ('active','sold'))::text as open from market_listings where seller_id = $1", [a.charId])).rows[0];
      if (Number(c.act) >= MARKET_MAX_ACTIVE) abort(`Você já tem ${MARKET_MAX_ACTIVE} listagens ativas.`);
      if (Number(c.open) >= MARKET_MAX_OPEN) abort("Recolha suas vendas e itens vencidos antes de listar mais.");
      // a mochila pode ter mudado enquanto esperava: confere de novo, em seguida aplica (tudo síncrono, sem espera no meio)
      const st = a.inv.slots[slot];
      if (!st || st.id !== st0.id || st.qty < qty || a.inv.iron < fee) abort("A mochila mudou. Tente de novo.");
      const itemId = st!.id;
      st!.qty -= qty;
      if (st!.qty <= 0) a.inv.slots[slot] = null;
      a.inv.iron -= fee;
      try {
        await q("insert into market_listings (id, seller_id, seller_name, item_id, qty, price, fee, expires_at) values ($1,$2,$3,$4,$5,$6,$7,$8)", [id, a.charId, a.name, itemId, qty, price, fee, this.iso(this.now() + this.ttlMs)]);
        await this.persist(q, a);
      } catch (e) {
        addItem(a.inv, itemId, qty); a.inv.iron += fee; // devolve na memória
        throw e;
      }
      return { ok: true as const, msg: `${ITEMS[itemId].name}${qty > 1 ? ` x${qty}` : ""} à venda por ${price.toLocaleString("pt-BR")} Tostões (taxa: ${fee}).` };
    });
  }

  // ---------------------------------------------------------------- comprar
  async buy(a: MarketActor, id: unknown): Promise<MarketResult> {
    if (typeof id !== "string" || !/^[0-9a-f-]{36}$/.test(id)) return { ok: false, error: "Listagem inválida." };
    return this.run(async (q) => {
      const now = this.iso(this.now());
      // reivindica: só UMA compra consegue virar 'sold' (as outras veem 0 linhas e perdem com a mensagem abaixo)
      const got = (await q<{ item_id: string; qty: number; price: number; seller_id: string }>(
        "update market_listings set status = 'sold', buyer_id = $2, buyer_name = $3, sold_at = $4 where id = $1 and status = 'active' and expires_at > $4 and seller_id <> $2 returning item_id, qty, price, seller_id", [id, a.charId, a.name, now])).rows;
      if (!got.length) {
        const r = (await q<{ status: string; seller_id: string; expires_ms: string }>("select status, seller_id, (extract(epoch from expires_at)*1000)::bigint as expires_ms from market_listings where id = $1", [id])).rows[0];
        if (r && r.seller_id === a.charId) abort("Você não pode comprar a própria listagem.");
        abort(r && r.status === 'active' ? "Essa listagem expirou." : "Alguém foi mais rápido: essa listagem não está mais à venda.");
      }
      const l = got[0]!;
      if (a.inv.iron < l.price) abort(`Tostões insuficientes (precisa de ${l.price.toLocaleString("pt-BR")}).`);
      if (!canFit(a.inv, l.item_id, l.qty)) abort("Mochila cheia.");
      a.inv.iron -= l.price;
      addItem(a.inv, l.item_id, l.qty);
      try { await this.persist(q, a); } catch (e) { this.takeBack(a.inv, { item: { id: l.item_id, qty: l.qty } }); a.inv.iron += l.price; throw e; }
      return { ok: true as const, msg: `Comprou ${ITEMS[l.item_id].name}${l.qty > 1 ? ` x${l.qty}` : ""} por ${l.price.toLocaleString("pt-BR")} Tostões.` };
    });
  }

  // ---------------------------------------------------------------- cancelar / recolher o item (listagem ativa ou vencida)
  async cancel(a: MarketActor, id: unknown): Promise<MarketResult> {
    if (typeof id !== "string" || !/^[0-9a-f-]{36}$/.test(id)) return { ok: false, error: "Listagem inválida." };
    return this.run(async (q) => {
      const got = (await q<{ item_id: string; qty: number }>("update market_listings set status = 'closed', closed_at = $3 where id = $1 and seller_id = $2 and status = 'active' returning item_id, qty", [id, a.charId, this.iso(this.now())])).rows;
      if (!got.length) abort("Essa listagem não está mais ativa.");
      const l = got[0]!;
      if (!canFit(a.inv, l.item_id, l.qty)) abort("Mochila cheia: abra espaço para receber o item.");
      addItem(a.inv, l.item_id, l.qty);
      try { await this.persist(q, a); } catch (e) { this.takeBack(a.inv, { item: { id: l.item_id, qty: l.qty } }); throw e; }
      return { ok: true as const, msg: `${ITEMS[l.item_id].name}${l.qty > 1 ? ` x${l.qty}` : ""} voltou para a mochila.` };
    });
  }

  // ---------------------------------------------------------------- recolher os tostões de uma venda
  async claim(a: MarketActor, id: unknown): Promise<MarketResult> {
    if (typeof id !== "string" || !/^[0-9a-f-]{36}$/.test(id)) return { ok: false, error: "Listagem inválida." };
    return this.run(async (q) => {
      const cur = (await q<{ price: number }>("select price from market_listings where id = $1 and seller_id = $2 and status = 'sold'", [id, a.charId])).rows[0];
      if (!cur) abort("Não há nada a recolher nessa venda.");
      if (a.inv.iron + cur!.price > MAX_COINS) abort("Saldo cheio de tostões.");
      const got = (await q<{ price: number }>("update market_listings set status = 'closed', closed_at = $3 where id = $1 and seller_id = $2 and status = 'sold' returning price", [id, a.charId, this.iso(this.now())])).rows;
      if (!got.length) abort("Essa venda já foi recolhida.");
      const price = got[0]!.price;
      a.inv.iron += price;
      try { await this.persist(q, a); } catch (e) { this.takeBack(a.inv, { iron: price }); throw e; }
      return { ok: true as const, msg: `Recolheu ${price.toLocaleString("pt-BR")} Tostões da venda.` };
    });
  }

  /** Recolhe tudo que está pronto: dinheiro das vendas e itens de listagens vencidas (um a um; para quando a mochila enche). */
  async claimAll(a: MarketActor): Promise<MarketResult> {
    const mine = await this.mine(a.charId);
    let coins = 0, items = 0, stop = "";
    for (const l of mine) {
      if (l.status === "sold") { const r = await this.claim(a, l.id); if (r.ok) coins += l.price; else { stop = r.error; if (/cheio/i.test(r.error)) break; } }
      else if (l.status === "expired") { const r = await this.cancel(a, l.id); if (r.ok) items++; else { stop = r.error; if (/cheio/i.test(r.error)) break; } }
    }
    if (!coins && !items) return { ok: false, error: stop || "Nada a recolher." };
    return { ok: true, msg: `Recolhido: ${[coins ? `${coins.toLocaleString("pt-BR")} Tostões` : "", items ? `${items} item(ns)` : ""].filter(Boolean).join(" e ")}.${stop ? " " + stop : ""}` };
  }

  // ---------------------------------------------------------------- consultas
  async mine(charId: string): Promise<MyListing[]> {
    const now = this.now();
    const { rows } = await this.db.query<Row>(`select ${COLS} from market_listings where seller_id = $1 and status in ('active','sold') order by created_at desc limit 100`, [charId]);
    return rows.map((r) => {
      const exp = Number(r.expires_ms);
      const status = r.status === "sold" ? "sold" : exp <= now ? "expired" : "active";
      return { id: r.id, itemId: r.item_id, qty: r.qty, price: r.price, fee: r.fee, status, expiresAt: exp, buyer: r.buyer_name ?? undefined } as MyListing;
    });
  }

  async browse(rawFilter: unknown, viewerCharId: string): Promise<MarketPage> {
    void this.sweep();
    const f = cleanFilter(rawFilter);
    const ids = filterItemIds(f);
    if (!ids.length) return { items: [], page: 0, pages: 1, total: 0 };
    const now = this.iso(this.now());
    const order = f.sort === "price_asc" ? "price asc, created_at asc" : f.sort === "price_desc" ? "price desc, created_at asc" : f.sort === "rarity" ? "array_position($1::text[], item_id), price asc" : "created_at desc";
    const where = "status = 'active' and expires_at > $2 and item_id = any($1::text[]) and price >= $3 and price <= $4";
    const args = [ids, now, f.minPrice, f.maxPrice];
    const total = Number((await this.db.query<{ n: string }>(`select count(*)::text as n from market_listings where ${where}`, args)).rows[0].n);
    const pages = Math.max(1, Math.ceil(total / MARKET_PAGE));
    const page = Math.min(f.page, pages - 1);
    const { rows } = await this.db.query<Row>(`select ${COLS} from market_listings where ${where} order by ${order} limit ${MARKET_PAGE} offset ${page * MARKET_PAGE}`, args);
    return { items: rows.map((r) => ({ id: r.id, itemId: r.item_id, qty: r.qty, price: r.price, seller: r.seller_name, expiresAt: Number(r.expires_ms), mine: r.seller_id === viewerCharId })), page, pages, total };
  }

  /** Limpeza preguiçosa (no máximo 1x por hora): apaga listagens encerradas há mais de 3 dias. */
  async sweep(): Promise<void> {
    const t = this.now();
    if (t - this.lastSweep < 3_600_000) return;
    this.lastSweep = t;
    try { await this.db.query("delete from market_listings where status = 'closed' and closed_at < $1", [this.iso(t - 3 * 86_400_000)]); } catch (e) { console.error("[mercado] limpeza falhou:", (e as Error).message); }
  }
}
