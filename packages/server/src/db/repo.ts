import { randomUUID } from "node:crypto";
import { START_ZONE, VAULT_SLOTS, NAME_MIN, NAME_MAX, ITEMS, INV_SLOTS, EQUIP_SLOTS, migrateItemId, type CharClass, type EquipSlot } from "@frixep/shared";
import { emptyInventory, type Inventory } from "../game/inventory.js";
import { emptyVault, type Vault } from "../game/vault.js";
import type { Db, Tx } from "./index.js";

/** Zona de nascimento dos personagens novos: a cidade. Só os testes (nunca em produção) podem trocar, para as suítes antigas seguirem lutando na zona 1. */
export const startZone = () => { const z = Number(process.env.TEST_START_ZONE); return process.env.NODE_ENV !== "production" && Number.isInteger(z) && z > 0 ? z : START_ZONE; };
export interface VaultRows { items: { slot: number; id: string; qty: number }[]; iron: number; obols: number }

export interface InvRows { items: { slot: number; id: string; qty: number }[]; eq: { slot: string; id: string }[]; iron: number; obols: number }

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
  constructor(readonly db: Db) {}

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

  // ---- moderação (C0.6)
  async getSancao(contaId: string): Promise<{ silenciadoAte: number | null; banido: boolean }> {
    const { rows } = await this.db.query<{ silenciado_ate: Date | null; banido: boolean }>(
      "select silenciado_ate, banido from sancoes where conta_id = $1", [contaId]);
    const r = rows[0];
    return { silenciadoAte: r?.silenciado_ate ? new Date(r.silenciado_ate).getTime() : null, banido: !!r?.banido };
  }

  /** grava o silêncio até `ateMs` (não mexe no banimento) */
  async setSilencio(contaId: string, ateMs: number, motivo: string): Promise<void> {
    await this.db.query(
      `insert into sancoes (conta_id, silenciado_ate, motivo) values ($1, to_timestamp($2::float8 / 1000), $3)
       on conflict (conta_id) do update set silenciado_ate = excluded.silenciado_ate, motivo = excluded.motivo, atualizado_em = now()`,
      [contaId, ateMs, motivo]);
  }

  /** grava o banimento ou o retira (não mexe no silêncio) */
  async setBanido(contaId: string, banido: boolean, motivo: string): Promise<void> {
    await this.db.query(
      `insert into sancoes (conta_id, banido, motivo) values ($1, $2, $3)
       on conflict (conta_id) do update set banido = excluded.banido, motivo = excluded.motivo, atualizado_em = now()`,
      [contaId, banido, motivo]);
  }

  /** personagem pelo nome (sem diferenciar maiúsculas/acentos, como na criação) */
  async findCharacterByName(nome: string): Promise<{ id: string; account_id: string; name: string } | null> {
    const { rows } = await this.db.query<{ id: string; account_id: string; name: string }>(
      "select id, account_id, name from characters where name_key = $1", [nameKey(nome)]);
    return rows[0] ?? null;
  }

  async addDenuncia(contaId: string, personagemId: string, nome: string, motivo: string): Promise<number> {
    const { rows } = await this.db.query<{ id: string }>(
      "insert into denuncias (denunciante_conta_id, denunciado_personagem_id, denunciado_nome, motivo) values ($1, $2, $3, $4) returning id",
      [contaId, personagemId, nome, motivo]);
    return Number(rows[0].id);
  }

  async denunciasAbertas(limite = 10): Promise<{ id: number; nome: string; motivo: string; criado_em: Date }[]> {
    const { rows } = await this.db.query<{ id: string; nome: string; motivo: string; criado_em: Date }>(
      "select id, denunciado_nome as nome, motivo, criado_em from denuncias where resolvida = false order by criado_em desc limit $1", [limite]);
    return rows.map((r) => ({ id: Number(r.id), nome: r.nome, motivo: r.motivo, criado_em: r.criado_em }));
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
        const zone = startZone();
        await q("insert into characters (id, account_id, name, name_key, class, zone) values ($1, $2, $3, $4, $5, $6)", [id, accountId, name, nameKey(name), cls, zone]);
        return { ok: true as const, character: { id, account_id: accountId, name, class: cls, level: 1, xp: 0, zone } };
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

  async loadInventory(charId: string, cls: CharClass = "warrior"): Promise<Inventory> {
    const inv = emptyInventory();
    const items = await this.db.query<{ slot: number; item_id: string; qty: number }>(
      "select slot, item_id, qty from inventory_items where character_id = $1",
      [charId],
    );
    for (const r of items.rows) {
      const id = migrateItemId(r.item_id, cls); // item da primeira versão vira o equivalente atual
      const def = ITEMS[id]; // item removido do jogo é ignorado em vez de quebrar a entrada
      if (!def || r.slot < 0 || r.slot >= INV_SLOTS || inv.slots[r.slot]) continue;
      if (id !== r.item_id) inv.migrated = true;
      inv.slots[r.slot] = { id, qty: Math.max(1, Math.min(def.stack, r.qty)) };
    }
    const w = await this.db.query<{ iron: number; obols: number }>("select iron, obols from characters where id = $1", [charId]);
    inv.iron = Math.max(0, Number(w.rows[0]?.iron) || 0);
    inv.obols = Math.max(0, Number(w.rows[0]?.obols) || 0);
    const eq = await this.db.query<{ slot: string; item_id: string }>("select slot, item_id from equipment where character_id = $1", [charId]);
    for (const r of eq.rows) {
      const id = migrateItemId(r.item_id, cls);
      const def = ITEMS[id];
      if (def && (EQUIP_SLOTS as readonly string[]).includes(r.slot) && def.kind === r.slot) {
        inv.equip[r.slot as EquipSlot] = id;
        if (id !== r.item_id) inv.migrated = true;
      }
    }
    return inv;
  }

  /** Fotografia do que será gravado (copiada na hora, antes de qualquer espera). */
  inventoryRows(inv: Inventory): InvRows {
    return {
      items: inv.slots.flatMap((s, i) => (s ? [{ slot: i, id: s.id, qty: s.qty }] : [])),
      eq: EQUIP_SLOTS.flatMap((sl) => (inv.equip[sl] ? [{ slot: sl, id: inv.equip[sl]! }] : [])),
      iron: inv.iron, obols: inv.obols,
    };
  }

  async writeInventoryTx(q: Tx["query"], charId: string, r: InvRows) {
    await q("select pg_advisory_xact_lock(hashtext($1))", [`inv:${charId}`]);
    await q("delete from inventory_items where character_id = $1", [charId]);
    await q("delete from equipment where character_id = $1", [charId]);
    await q("update characters set iron = $2, obols = $3 where id = $1", [charId, r.iron, r.obols]);
    if (r.items.length) {
      const ph = r.items.map((_, i) => `($1, $${i * 3 + 2}, $${i * 3 + 3}, $${i * 3 + 4})`).join(",");
      await q(`insert into inventory_items (character_id, slot, item_id, qty) values ${ph}`, [charId, ...r.items.flatMap((x) => [x.slot, x.id, x.qty])]);
    }
    if (r.eq.length) {
      const ph = r.eq.map((_, i) => `($1, $${i * 2 + 2}, $${i * 2 + 3})`).join(",");
      await q(`insert into equipment (character_id, slot, item_id) values ${ph}`, [charId, ...r.eq.flatMap((x) => [x.slot, x.id])]);
    }
  }

  async loadVault(charId: string): Promise<Vault> {
    const v = emptyVault();
    const items = await this.db.query<{ slot: number; item_id: string; qty: number }>("select slot, item_id, qty from vault_items where character_id = $1", [charId]);
    for (const r of items.rows) {
      const def = ITEMS[r.item_id];
      if (!def || r.slot < 0 || r.slot >= VAULT_SLOTS || v.slots[r.slot]) continue; // item removido do jogo é ignorado
      v.slots[r.slot] = { id: r.item_id, qty: Math.max(1, Math.min(def.stack, r.qty)) };
    }
    const w = await this.db.query<{ vault_iron: number; vault_obols: number }>("select vault_iron, vault_obols from characters where id = $1", [charId]);
    v.iron = Math.max(0, Number(w.rows[0]?.vault_iron) || 0);
    v.obols = Math.max(0, Number(w.rows[0]?.vault_obols) || 0);
    return v;
  }

  vaultRows(v: Vault): VaultRows {
    return { items: v.slots.flatMap((s, i) => (s ? [{ slot: i, id: s.id, qty: s.qty }] : [])), iron: v.iron, obols: v.obols };
  }

  private async writeVault(q: Tx["query"], charId: string, r: VaultRows) {
    await q("delete from vault_items where character_id = $1", [charId]);
    await q("update characters set vault_iron = $2, vault_obols = $3 where id = $1", [charId, r.iron, r.obols]);
    if (r.items.length) {
      const ph = r.items.map((_, i) => `($1, $${i * 3 + 2}, $${i * 3 + 3}, $${i * 3 + 4})`).join(",");
      await q(`insert into vault_items (character_id, slot, item_id, qty) values ${ph}`, [charId, ...r.items.flatMap((x) => [x.slot, x.id, x.qty])]);
    }
  }

  /** Grava bolsa E baú do mesmo personagem na MESMA transação: o item está num lugar ou no outro, nunca nos dois nem em nenhum. */
  async saveInventoryAndVault(charId: string, inv: Inventory, v: Vault): Promise<void> {
    const ir = this.inventoryRows(inv), vr = this.vaultRows(v);
    await this.db.tx(async ({ query: q }) => { await this.writeInventoryTx(q, charId, ir); await this.writeVault(q, charId, vr); });
  }

  /** Troca o inventário (e o saldo) salvo pelo estado atual, numa transação. A fotografia é copiada ANTES de qualquer espera. */
  async saveInventory(charId: string, inv: Inventory): Promise<void> {
    const rows = this.inventoryRows(inv);
    await this.db.tx(({ query: q }) => this.writeInventoryTx(q, charId, rows));
  }

  /** Grava DOIS personagens na MESMA transação (a troca entre jogadores: ou grava os dois lados ou nenhum, sem duplicar nem perder item). */
  async saveInventoryPair(a: [string, InvRows], b: [string, InvRows]): Promise<void> {
    await this.db.tx(async ({ query: q }) => {
      for (const [id, r] of [a, b].sort((x, y) => (x[0] < y[0] ? -1 : 1))) await this.writeInventoryTx(q, id, r); // ordem fixa: sem impasse entre trocas
    });
  }
}

