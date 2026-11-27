import { ITEMS, KINDS_EQUIPAVEIS, afixosValidos, afixosDaSemente, refinoValido, gemasValidas, type InvStack } from "@frixep/shared";

/**
 * Extras de um item (afixos, refino, gemas e a marca de gema do Modo Deus) no formato do banco.
 * Mesma regra da mochila (repo.ts): equipamento grava SEMPRE a lista de afixos ("[]" = sem afixos);
 * null fica só para linhas antigas, que a leitura completa com afixos determinísticos (backfill).
 * Usado pelo baú (vault_items) e pelo mercado (market_listings), migração 023.
 */
export interface ExtrasBanco { af: string | null; rf: number | null; gm: string | null; gmv: boolean }

export function extrasParaBanco(st: Pick<InvStack, "id" | "af" | "rf" | "gm" | "gmv">): ExtrasBanco {
  const equip = KINDS_EQUIPAVEIS.includes(ITEMS[st.id]?.kind);
  return {
    af: equip ? JSON.stringify(st.af ?? []) : st.af?.length ? JSON.stringify(st.af) : null,
    rf: equip ? refinoValido(st.rf) || null : null,
    gm: st.gm?.length ? st.gm.join(",") : null,
    gmv: !!st.gmv,
  };
}

/** Lê os extras de uma linha do banco (validados); `semente` dá afixos determinísticos a equipamento antigo sem a coluna. */
export function extrasDoBanco(id: string, r: { af?: string | null; rf?: number | null; gm?: string | null; gmv?: boolean | null }, semente: string): Pick<InvStack, "af" | "rf" | "gm" | "gmv"> {
  const def = ITEMS[id];
  if (!def) return {};
  const equip = KINDS_EQUIPAVEIS.includes(def.kind);
  let af = afixosValidos(r.af ?? null, def.kind, def.rarity);
  if (!af.length && r.af == null && equip) af = afixosDaSemente(semente, def.kind, def.rarity);
  const rf = equip ? refinoValido(r.rf ?? null) : 0;
  const gm = gemasValidas(r.gm ? r.gm.split(",") : [], def.kind, def.rarity);
  return { ...(af.length ? { af } : {}), ...(rf ? { rf } : {}), ...(gm.length ? { gm } : {}), ...(r.gmv ? { gmv: true } : {}) };
}

/** O item carrega extras (não pode juntar pilha com outro do mesmo id). */
export const temExtras = (st: Pick<InvStack, "af" | "rf" | "gm" | "gmv">): boolean => !!(st.af?.length || st.rf || st.gm?.length || st.gmv);
