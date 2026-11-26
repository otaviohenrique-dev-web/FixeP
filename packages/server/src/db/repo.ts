import { randomUUID } from "node:crypto";
import { START_ZONE, VAULT_SLOTS, NAME_MIN, NAME_MAX, ITEMS, INV_SLOTS, EQUIP_SLOTS, KINDS_EQUIPAVEIS, MAX_CHARACTERS_PER_ACCOUNT, migrateItemId, afixosValidos, afixosDaSemente, refinoValido, gemasValidas, type CharClass, type EquipSlot } from "@frixep/shared";
import { emptyInventory, type Inventory } from "../game/inventory.js";
import { emptyVault, type Vault } from "../game/vault.js";
import type { QuestMap, QuestRt } from "../game/quests.js";
import type { EstadoQuest } from "@frixep/shared";
import type { Db, Tx } from "./index.js";

/** Zona de nascimento dos personagens novos: a cidade. Só os testes (nunca em produção) podem trocar, para as suítes antigas seguirem lutando na zona 1. */
export const startZone = () => { const z = Number(process.env.TEST_START_ZONE); return process.env.NODE_ENV !== "production" && Number.isInteger(z) && z > 0 ? z : START_ZONE; };
export interface VaultRows { items: { slot: number; id: string; qty: number }[]; iron: number; obols: number }

export interface InvRows { items: { slot: number; id: string; qty: number; af: string | null; rf: number | null; gm: string | null; gmv: boolean }[]; eq: { slot: string; id: string; af: string | null; rf: number | null; gm: string | null; gmv: boolean }[]; iron: number; obols: number }

export type { CharClass };
export interface CharacterRow {
  id: string;
  account_id: string;
  name: string;
  class: CharClass;
  level: number;
  xp: number;
  zone: number;
  auto_pot_at: number;
  variacoes: string; // JSON: habilidade -> id da variação (C2.2)
  talentos: string; // JSON: id do talento -> ranks (C2.3)
  talentos_resets: number; // resets já pagos (C2.3)
  loadouts: string; // JSON: até 3 slots de build (variações + talentos + nome) e o ativo (C2.4)
  gm_modo: boolean; // Modo Deus ligado (só conta admin; ver gm/modoDeus.ts)
  gm_invis: boolean;
  gm_invuln: boolean;
  gm_vel: number;
}

/** Normaliza o nome para a chave de unicidade: sem acento, sem maiúsculas, espaços colapsados. */
/** Afixos como texto para o banco: equipamento sempre com lista ("[]" = sem afixos); potion e outros = null. */
const afixosGravados = (id: string, af: string[] | undefined): string | null => {
  if (!KINDS_EQUIPAVEIS.includes(ITEMS[id]?.kind)) return af?.length ? JSON.stringify(af) : null;
  return JSON.stringify(af ?? []);
};
/** Gemas engastadas como texto ("forca,vida"); sem gema = null (C3.3, migração 020). */
const gemasGravadas = (gm: string[] | undefined): string | null => (gm?.length ? gm.join(",") : null);

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

  /** cria ou atualiza a conta no login. O e-mail (quando o provedor o informa) só é trocado se vier um novo. */
  async upsertAccount(provider: string, providerId: string, name: string, email?: string | null): Promise<{ id: string; name: string }> {
    const { rows } = await this.db.query<{ id: string; name: string }>(
      `insert into accounts (id, provider, provider_id, name, email) values ($1, $2, $3, $4, $5)
       on conflict (provider, provider_id) do update set name = excluded.name, email = coalesce(excluded.email, accounts.email)
       returning id, name`,
      [randomUUID(), provider, providerId, name, email ?? null],
    );
    return rows[0];
  }

  /** e-mail da conta (só para o painel: código de acesso e revelação registrada). null = sem e-mail (convidado ou provedor sem e-mail). */
  async emailDaConta(contaId: string): Promise<string | null> {
    const { rows } = await this.db.query<{ email: string | null }>("select email from accounts where id = $1", [contaId]);
    return rows[0]?.email ?? null;
  }

  async accountExists(id: string): Promise<boolean> {
    const { rows } = await this.db.query("select 1 from accounts where id = $1", [id]);
    return rows.length > 0;
  }

  // ---- moderação (C0.6)
  async getSancao(contaId: string): Promise<{ silenciadoAte: number | null; banido: boolean; banidoAte: number | null }> {
    const { rows } = await this.db.query<{ silenciado_ate: Date | null; banido: boolean; banido_ate: Date | null }>(
      "select silenciado_ate, banido, banido_ate from sancoes where conta_id = $1", [contaId]);
    const r = rows[0];
    const banidoAte = r?.banido_ate ? new Date(r.banido_ate).getTime() : null;
    // banimento com prazo que já venceu não vale mais (o registro fica, só deixa de bloquear)
    const banido = !!r?.banido && (banidoAte === null || banidoAte > Date.now());
    return { silenciadoAte: r?.silenciado_ate ? new Date(r.silenciado_ate).getTime() : null, banido, banidoAte };
  }

  /** grava o silêncio até `ateMs` (não mexe no banimento); null retira o silêncio */
  async setSilencio(contaId: string, ateMs: number | null, motivo: string): Promise<void> {
    await this.db.query(
      `insert into sancoes (conta_id, silenciado_ate, motivo) values ($1, to_timestamp($2::float8 / 1000), $3)
       on conflict (conta_id) do update set silenciado_ate = excluded.silenciado_ate, motivo = excluded.motivo, atualizado_em = now()`,
      [contaId, ateMs, motivo]);
  }

  /** grava o banimento ou o retira (não mexe no silêncio). `ateMs` = fim do banimento; null = permanente. */
  async setBanido(contaId: string, banido: boolean, motivo: string, ateMs: number | null = null): Promise<void> {
    await this.db.query(
      `insert into sancoes (conta_id, banido, banido_ate, motivo) values ($1, $2, to_timestamp($3::float8 / 1000), $4)
       on conflict (conta_id) do update set banido = excluded.banido, banido_ate = excluded.banido_ate, motivo = excluded.motivo, atualizado_em = now()`,
      [contaId, banido, ateMs, motivo]);
  }

  /** sanções atuais da conta, cruas (para a auditoria: antes e depois) */
  async sancaoCrua(contaId: string): Promise<{ silenciado_ate: string | null; banido: boolean; banido_ate: string | null; motivo: string | null }> {
    const { rows } = await this.db.query<{ silenciado_ate: string | null; banido: boolean; banido_ate: string | null; motivo: string | null }>(
      "select silenciado_ate::text as silenciado_ate, banido, banido_ate::text as banido_ate, motivo from sancoes where conta_id = $1",
      [contaId]);
    return rows[0] ?? { silenciado_ate: null, banido: false, banido_ate: null, motivo: null };
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

  /** personagem da conta: o pedido por id (só se for da conta) ou, sem id, o mais antigo (quem não escolhe entra no primeiro) */
  async getCharacter(accountId: string, charId?: string): Promise<CharacterRow | null> {
    const { rows } = await this.db.query<CharacterRow>(
      "select id, account_id, name, class, level, xp, zone, auto_pot_at, variacoes, talentos, talentos_resets, loadouts, gm_modo, gm_invis, gm_invuln, gm_vel from characters where account_id = $1 and ($2::text is null or id::text = $2) order by created_at limit 1",
      [accountId, charId ?? null],
    );
    return rows[0] ?? null;
  }

  /** todos os personagens da conta, do mais antigo para o mais novo (a tela de seleção) */
  async listCharacters(accountId: string): Promise<CharacterRow[]> {
    const { rows } = await this.db.query<CharacterRow>(
      "select id, account_id, name, class, level, xp, zone, auto_pot_at, variacoes, talentos, talentos_resets, loadouts, gm_modo, gm_invis, gm_invuln, gm_vel from characters where account_id = $1 order by created_at",
      [accountId],
    );
    return rows;
  }

  /** até MAX_CHARACTERS_PER_ACCOUNT personagens por conta (a regra fica aqui, com a conta travada na contagem). */
  async createCharacter(accountId: string, name: string, cls: CharClass): Promise<
    { ok: true; character: CharacterRow } | { ok: false; error: "full" | "name_taken" }
  > {
    try {
      return await this.db.tx(async ({ query: q }) => {
        // trava por conta até o fim da transação: dois pedidos simultâneos não passam juntos pela contagem
        // (o PGlite local é serial e não mostra a corrida; no Postgres com várias conexões ela existiria)
        await q("select pg_advisory_xact_lock(hashtext($1))", [`char:${accountId}`]);
        const n =(await q<{ n: string }>("select count(*)::text as n from characters where account_id = $1", [accountId])).rows[0].n;
        if (Number(n) >= MAX_CHARACTERS_PER_ACCOUNT) return { ok: false as const, error: "full" as const };
        const id = randomUUID();
        const zone = startZone();
        await q("insert into characters (id, account_id, name, name_key, class, zone) values ($1, $2, $3, $4, $5, $6)", [id, accountId, name, nameKey(name), cls, zone]);
        return { ok: true as const, character: { id, account_id: accountId, name, class: cls, level: 1, xp: 0, zone, auto_pot_at: 0, variacoes: "{}", talentos: "{}", talentos_resets: 0, loadouts: "{}", gm_modo: false, gm_invis: false, gm_invuln: false, gm_vel: 1 } };
      });
    } catch (e: any) {
      if (e?.code === "23505") return { ok: false, error: "name_taken" }; // violação da unicidade de name_key
      throw e;
    }
  }

  async saveProgress(charId: string, level: number, xp: number): Promise<void> {
    await this.db.query("update characters set level = $2, xp = $3, updated_at = now() where id = $1", [charId, level, xp]);
  }

  /** estado do Modo Deus no personagem (só o servidor chama, depois de confirmar que a conta é admin) */
  async setGmModo(charId: string, g: { modo: boolean; invis: boolean; invuln: boolean; vel: number }): Promise<void> {
    await this.db.query("update characters set gm_modo = $2, gm_invis = $3, gm_invuln = $4, gm_vel = $5, updated_at = now() where id = $1", [charId, g.modo, g.invis, g.invuln, g.vel]);
  }

  /** limiar da auto-poção (já validado por clampAutoPot no servidor) */
  async setAutoPot(charId: string, at: number): Promise<void> {
    await this.db.query("update characters set auto_pot_at = $2 where id = $1", [charId, at]);
  }

  /** escolha das variações de habilidade (JSON já limpo por limparEscolhas no servidor) */
  async setVariacoes(charId: string, json: string): Promise<void> {
    await this.db.query("update characters set variacoes = $2 where id = $1", [charId, json]);
  }

  /** talentos (C2.3): JSON já limpo por limparTalentos no servidor, e o número de resets pagos */
  async setTalentos(charId: string, json: string, resets: number): Promise<void> {
    await this.db.query("update characters set talentos = $2, talentos_resets = $3 where id = $1", [charId, json, resets]);
  }

  /** builds (C2.4): JSON já limpo por limparLoadouts no servidor */
  async setLoadouts(charId: string, json: string): Promise<void> {
    await this.db.query("update characters set loadouts = $2 where id = $1", [charId, json]);
  }

  async setZone(charId: string, zone: number): Promise<void> {
    await this.db.query("update characters set zone = $2, updated_at = now() where id = $1", [charId, zone]);
  }

  async loadInventory(charId: string, cls: CharClass = "warrior"): Promise<Inventory> {
    const inv = emptyInventory();
    const items = await this.db.query<{ slot: number; item_id: string; qty: number; af: string | null; rf: number | null; gm: string | null; gmv: boolean }>(
      "select slot, item_id, qty, af, rf, gm, gmv from inventory_items where character_id = $1",
      [charId],
    );
    for (const r of items.rows) {
      const id = migrateItemId(r.item_id, cls); // item da primeira versão vira o equivalente atual
      const def = ITEMS[id]; // item removido do jogo é ignorado em vez de quebrar a entrada
      if (!def || r.slot < 0 || r.slot >= INV_SLOTS || inv.slots[r.slot]) continue;
      if (id !== r.item_id) inv.migrated = true;
      let af = afixosValidos(r.af, def.kind, def.rarity);
      if (!af.length && r.af == null && KINDS_EQUIPAVEIS.includes(def.kind)) { // backfill: item antigo (sem coluna de afixos) ganha afixos determinísticos
        af = afixosDaSemente(`${charId}:${r.slot}:${id}`, def.kind, def.rarity);
        if (af.length) inv.migrated = true; // grava no próximo salvamento
      }
      const rf = KINDS_EQUIPAVEIS.includes(def.kind) ? refinoValido(r.rf) : 0; // refino só existe em equipamento
      const gm = gemasValidas(r.gm ? r.gm.split(",") : [], def.kind, def.rarity); // gemas engastadas (C3.3), gravadas como "forca,vida"
      inv.slots[r.slot] = { id, qty: Math.max(1, Math.min(def.stack, r.qty)), ...(af.length ? { af } : {}), ...(rf ? { rf } : {}), ...(gm.length ? { gm } : {}), ...(r.gmv ? { gmv: true } : {}) };
    }
    const w = await this.db.query<{ iron: number; obols: number }>("select iron, obols from characters where id = $1", [charId]);
    inv.iron = Math.max(0, Number(w.rows[0]?.iron) || 0);
    inv.obols = Math.max(0, Number(w.rows[0]?.obols) || 0);
    const eq = await this.db.query<{ slot: string; item_id: string; af: string | null; rf: number | null; gm: string | null; gmv: boolean }>("select slot, item_id, af, rf, gm, gmv from equipment where character_id = $1", [charId]);
    for (const r of eq.rows) {
      const id = migrateItemId(r.item_id, cls);
      const def = ITEMS[id];
      if (def && (EQUIP_SLOTS as readonly string[]).includes(r.slot) && def.kind === r.slot) {
        inv.equip[r.slot as EquipSlot] = id;
        let af = afixosValidos(r.af, def.kind, def.rarity);
        if (!af.length && r.af == null) { // backfill do equipamento vestido (mesma regra da mochila)
          af = afixosDaSemente(`${charId}:eq:${r.slot}:${id}`, def.kind, def.rarity);
          if (af.length) inv.migrated = true;
        }
        if (af.length) inv.equipAf = { ...(inv.equipAf ?? {}), [r.slot]: af };
        const rf = refinoValido(r.rf);
        if (rf) inv.equipRf = { ...(inv.equipRf ?? {}), [r.slot]: rf };
        const gm = gemasValidas(r.gm ? r.gm.split(",") : [], def.kind, def.rarity);
        if (gm.length) inv.equipGm = { ...(inv.equipGm ?? {}), [r.slot]: gm };
        if (r.gmv) inv.equipGmv = { ...(inv.equipGmv ?? {}), [r.slot]: true };
        if (id !== r.item_id) inv.migrated = true;
      }
    }
    return inv;
  }

  /** Fotografia do que será gravado (copiada na hora, antes de qualquer espera). */
  inventoryRows(inv: Inventory): InvRows {
    return {
      // equipamento grava SEMPRE a lista (vazia = "sem afixos", já passou pelo sistema); null fica só para itens antigos,
      // que o carregamento completa com o backfill. Assim um item sem afixo não ganha afixos a cada carregamento.
      items: inv.slots.flatMap((s, i) => (s ? [{ slot: i, id: s.id, qty: s.qty, af: afixosGravados(s.id, s.af), rf: refinoValido(s.rf) || null, gm: gemasGravadas(s.gm), gmv: !!s.gmv }] : [])),
      eq: EQUIP_SLOTS.flatMap((sl) => (inv.equip[sl] ? [{ slot: sl, id: inv.equip[sl]!, af: afixosGravados(inv.equip[sl]!, inv.equipAf?.[sl]), rf: refinoValido(inv.equipRf?.[sl]) || null, gm: gemasGravadas(inv.equipGm?.[sl]), gmv: !!inv.equipGmv?.[sl] }] : [])),
      iron: inv.iron, obols: inv.obols,
    };
  }

  async writeInventoryTx(q: Tx["query"], charId: string, r: InvRows) {
    await q("select pg_advisory_xact_lock(hashtext($1))", [`inv:${charId}`]);
    await q("delete from inventory_items where character_id = $1", [charId]);
    await q("delete from equipment where character_id = $1", [charId]);
    await q("update characters set iron = $2, obols = $3 where id = $1", [charId, r.iron, r.obols]);
    if (r.items.length) {
      const ph = r.items.map((_, i) => `($1, $${i * 7 + 2}, $${i * 7 + 3}, $${i * 7 + 4}, $${i * 7 + 5}, $${i * 7 + 6}, $${i * 7 + 7}, $${i * 7 + 8})`).join(",");
      await q(`insert into inventory_items (character_id, slot, item_id, qty, af, rf, gm, gmv) values ${ph}`, [charId, ...r.items.flatMap((x) => [x.slot, x.id, x.qty, x.af, x.rf, x.gm, x.gmv])]);
    }
    if (r.eq.length) {
      const ph = r.eq.map((_, i) => `($1, $${i * 6 + 2}, $${i * 6 + 3}, $${i * 6 + 4}, $${i * 6 + 5}, $${i * 6 + 6}, $${i * 6 + 7})`).join(",");
      await q(`insert into equipment (character_id, slot, item_id, af, rf, gm, gmv) values ${ph}`, [charId, ...r.eq.flatMap((x) => [x.slot, x.id, x.af, x.rf, x.gm, x.gmv])]);
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

  // ---- dicas contextuais (C1.6): uma vez por personagem; o id é validado contra a lista fixa do shared
  /** Ids de dicas já vistas pelo personagem. */
  async loadDicas(charId: string): Promise<string[]> {
    const { rows } = await this.db.query<{ dica_id: string }>("select dica_id from dicas_vistas where personagem_id = $1", [charId]);
    return rows.map((r) => r.dica_id);
  }

  /** Marca a dica como vista (repetir não faz nada). */
  async marcarDica(charId: string, dicaId: string): Promise<void> {
    await this.db.query("insert into dicas_vistas (personagem_id, dica_id) values ($1, $2) on conflict (personagem_id, dica_id) do nothing", [charId, dicaId]);
  }

  // ---- quests (C1.1)
  /** Estado das quests do personagem (só as que ele aceitou ou entregou). */
  async loadQuests(charId: string): Promise<QuestMap> {
    const { rows } = await this.db.query<{ quest_id: string; estado: EstadoQuest; progresso: unknown }>(
      "select quest_id, estado, progresso from quest_estado where personagem_id = $1", [charId]);
    const qs: QuestMap = new Map();
    for (const r of rows) {
      const prog = typeof r.progresso === "string" ? JSON.parse(r.progresso) : r.progresso;
      qs.set(r.quest_id, { id: r.quest_id, estado: r.estado, progresso: Array.isArray(prog) ? prog.map((n) => Math.max(0, Number(n) || 0)) : [] });
    }
    return qs;
  }

  /** Grava (cria ou atualiza) o estado dessas quests dentro de uma transação ou do banco. */
  private async writeQuestsTx(q: Tx["query"], charId: string, list: QuestRt[]): Promise<void> {
    if (!list.length) return;
    const ph = list.map((_, i) => `($1, $${i * 3 + 2}, $${i * 3 + 3}, $${i * 3 + 4}::jsonb, now())`).join(",");
    await q(
      `insert into quest_estado (personagem_id, quest_id, estado, progresso, atualizado_em) values ${ph}
       on conflict (personagem_id, quest_id) do update set estado = excluded.estado, progresso = excluded.progresso, atualizado_em = now()`,
      [charId, ...list.flatMap((r) => [r.id, r.estado, JSON.stringify(r.progresso)])],
    );
  }

  /** Grava quests alteradas (salvamento periódico, ao sair e ao aceitar). */
  async saveQuests(charId: string, list: QuestRt[]): Promise<void> {
    await this.writeQuestsTx((sql, p) => this.db.query(sql, p), charId, list);
  }

  /**
   * Entrega: marca a quest como entregue, sobe o XP e grava o novo inventário NA MESMA transação.
   * Ou tudo é gravado ou nada (uma queda no meio não paga a recompensa pela metade).
   */
  async entregarQuest(charId: string, quest: QuestRt, level: number, xp: number, inv: Inventory): Promise<void> {
    const ir = this.inventoryRows(inv);
    await this.db.tx(async ({ query: q }) => {
      await this.writeQuestsTx(q, charId, [quest]);
      await q("update characters set level = $2, xp = $3, updated_at = now() where id = $1", [charId, level, xp]);
      await this.writeInventoryTx(q, charId, ir);
    });
  }

  /** Grava DOIS personagens na MESMA transação (a troca entre jogadores: ou grava os dois lados ou nenhum, sem duplicar nem perder item). */
  async saveInventoryPair(a: [string, InvRows], b: [string, InvRows]): Promise<void> {
    await this.db.tx(async ({ query: q }) => {
      for (const [id, r] of [a, b].sort((x, y) => (x[0] < y[0] ? -1 : 1))) await this.writeInventoryTx(q, id, r); // ordem fixa: sem impasse entre trocas
    });
  }
}

