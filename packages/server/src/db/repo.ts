import { randomUUID } from "node:crypto";
import { NAME_MIN, NAME_MAX, ITEMS, INV_SLOTS, EQUIP_SLOTS, type CharClass } from "@frixep/shared";
import { emptyInventory, type Inventory } from "../game/inventory.js";
import type { Db } from "./index.js";

export type { CharClass };
export interface CharacterRow {
  id: string;
  account_id: string;
  name: string;
  class: CharClass;
  level: number;
  xp: number;
  zone: number;
}

/** Normaliza o nome para a chave de unicidade: sem acento, sem maiúsculas, espaços colapsados. */
export const nameKey = (name: string) =>
  name.normalize("NFKD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/\s+/g, " ").trim();

const RESERVED = ["admin", "administrador", "moderador", "gm", "suporte", "sistema", "frixep", "staff"];
// letras e números (qualquer idioma), com espaços simples no meio
const NAME_RE = /^[\p{L}\p{N}]+(?: [\p{L}\p{N}]+)*$/u;

export function validateName(raw: unknown): { ok: true; name: string } | { ok: false; error: string } {
  if (typeof raw !== "string") return { ok: false, error: "Nome inválido." };
  const name = raw.normalize("NFC").trim().replace(/\s+/g, " ");
  if (name.length < NAME_MIN || name.length > NAME_MAX) return { ok: false, error: `O nome deve ter de ${NAME_MIN} a ${NAME_MAX} caracteres.` };
  if (!NAME_RE.test(name)) return { ok: false, error: "Use apenas letras, números e espaços." };
  if (RESERVED.some((r) => nameKey(name).includes(r))) return { ok: false, error: "Esse nome não está disponível." };
  return { ok: true, name };
}

export class Repo {
  constructor(private db: Db) {}

  async upsertAccount(provider: string, providerId: string, name: string): Promise<{ id: string; name: string }> {
    const { rows } = await this.db.query<{ id: string; name: string }>(
      `insert into accounts (id, provider, provider_id, name) values ($1, $2, $3, $4)
       on conflict (provider, provider_id) do update set name = excluded.name
       returning id, name`,
      [randomUUID(), provider, providerId, name],
    );
    return rows[0];
  }

  async accountExists(id: string): Promise<boolean> {
    const { rows } = await this.db.query("select 1 from accounts where id = $1", [id]);
    return rows.length > 0;
  }

  async getCharacter(accountId: string): Promise<CharacterRow | null> {
    const { rows } = await this.db.query<CharacterRow>(
      "select id, account_id, name, class, level, xp, zone from characters where account_id = $1 order by created_at limit 1",
      [accountId],
    );
    return rows[0] ?? null;
  }

  /** 1 personagem por conta no MVP (o banco já aceita vários; a regra fica aqui). */
  async createCharacter(accountId: string, name: string, cls: CharClass): Promise<
    { ok: true; character: CharacterRow } | { ok: false; error: "has_character" | "name_taken" }
  > {
    try {
      return await this.db.tx(async ({ query: q }) => {
        // trava por conta até o fim da transação: dois pedidos simultâneos não passam juntos pela contagem
        // (o PGlite local é serial e não mostra a corrida; no Postgres com várias conexões ela existiria)
        await q("select pg_advisory_xact_lock(hashtext($1))", [`char:${accountId}`]);
        const n =(await q<{ n: string }>("select count(*)::text as n from characters where account_id = $1", [accountId])).rows[0].n;
        if (Number(n) > 0) return { ok: false as const, error: "has_character" as const };
        const id = randomUUID();
        await q("insert into characters (id, account_id, name, name_key, class) values ($1, $2, $3, $4, $5)", [id, accountId, name, nameKey(name), cls]);
        return { ok: true as const, character: { id, account_id: accountId, name, class: cls, level: 1, xp: 0, zone: 1 } };
      });
    } catch (e: any) {
      if (e?.code === "23505") return { ok: false, error: "name_taken" }; // violação da unicidade de name_key
      throw e;
    }
  }

  async saveProgress(charId: string, level: number, xp: number): Promise<void> {
    await this.db.query("update characters set level = $2, xp = $3, updated_at = now() where id = $1", [charId, level, xp]);
  }

  async setZone(charId: string, zone: number): Promise<void> {
    await this.db.query("update characters set zone = $2, updated_at = now() where id = $1", [charId, zone]);
  }

  async loadInventory(charId: string): Promise<Inventory> {
    const inv = emptyInventory();
    const items = await this.db.query<{ slot: number; item_id: string; qty: number }>(
      "select slot, item_id, qty from inventory_items where character_id = $1",
      [charId],
    );
    for (const r of items.rows) {
      const def = ITEMS[r.item_id]; // item removido do jogo é ignorado em vez de quebrar a entrada
      if (!def || r.slot < 0 || r.slot >= INV_SLOTS || inv.slots[r.slot]) continue;
      inv.slots[r.slot] = { id: r.item_id, qty: Math.max(1, Math.min(def.stack, r.qty)) };
    }
    const eq = await this.db.query<{ slot: string; item_id: string }>("select slot, item_id from equipment where character_id = $1", [charId]);
    for (const r of eq.rows) {
      const def = ITEMS[r.item_id];
      if (def && (EQUIP_SLOTS as readonly string[]).includes(r.slot) && def.kind === r.slot) inv.equip[r.slot as "weapon" | "armor"] = r.item_id;
    }
    return inv;
  }

  /** Troca o inventário salvo pelo estado atual, numa transação. A fotografia é copiada ANTES de qualquer espera. */
  async saveInventory(charId: string, inv: Inventory): Promise<void> {
    const rows = inv.slots.flatMap((s, i) => (s ? [{ slot: i, id: s.id, qty: s.qty }] : []));
    const eq = EQUIP_SLOTS.flatMap((sl) => (inv.equip[sl] ? [{ slot: sl, id: inv.equip[sl]! }] : []));
    await this.db.tx(async ({ query: q }) => {
      await q("select pg_advisory_xact_lock(hashtext($1))", [`inv:${charId}`]);
      await q("delete from inventory_items where character_id = $1", [charId]);
      await q("delete from equipment where character_id = $1", [charId]);
      if (rows.length) {
        const ph = rows.map((_, i) => `($1, $${i * 3 + 2}, $${i * 3 + 3}, $${i * 3 + 4})`).join(",");
        await q(`insert into inventory_items (character_id, slot, item_id, qty) values ${ph}`, [charId, ...rows.flatMap((r) => [r.slot, r.id, r.qty])]);
      }
      if (eq.length) {
        const ph = eq.map((_, i) => `($1, $${i * 2 + 2}, $${i * 2 + 3})`).join(",");
        await q(`insert into equipment (character_id, slot, item_id) values ${ph}`, [charId, ...eq.flatMap((r) => [r.slot, r.id])]);
      }
    });
  }
}
