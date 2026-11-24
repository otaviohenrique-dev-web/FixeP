import type { CharClass } from "./index";
import { ITEMS, MAX_CDR, MAX_DR, type EquipSlot, type GearBonuses } from "./items";

/**
 * CONJUNTOS (C3.4, versão crua). Cada classe tem 1 conjunto com as 4 peças de corpo da própria classe:
 * armadura, elmo, botas e capa (as peças `cls` de items.ts). Equipar 2 peças liga o bônus de 2; 4 peças liga o de 4.
 *
 * Regras:
 *  - conta-se só peças do conjunto equipadas agora (um slot = no máximo uma peça; sem soma dupla);
 *  - com 4 peças vale SÓ o bônus de 4 (ele já é o total do conjunto, não soma com o de 2);
 *  - tirar uma peça desliga o bônus na hora (o recálculo é a partir do equipado, nada fica guardado).
 * Função pura, compartilhada: o servidor soma ao status (ZoneRoom); o cliente só mostra (tooltip e painel).
 */

/** Stats que um conjunto pode dar: os mesmos campos de GearBonuses (crit em pontos; dr e cdr em %; regen por segundo). */
export type SetStat = "dmgPct" | "hp" | "crit" | "dr" | "cdr" | "mana" | "regen";
export type SetBonus = Partial<Record<SetStat, number>>;

export interface SetDef {
  id: string;
  classe: CharClass;
  nome: string;
  descricao: string;
  pecas: EquipSlot[]; // peças de corpo do conjunto (sempre as 4 de corpo da classe)
  b2: SetBonus; // bônus com 2 peças
  b4: SetBonus; // bônus com 4 peças (total do conjunto)
}

export const SET_PECAS: EquipSlot[] = ["armor", "helmet", "boots", "cape"];
export const SET_STAT_LABEL: Record<SetStat, string> = {
  dmgPct: "% de poder", hp: "de vida máxima", crit: "de chance de crítico", dr: "% de redução de dano", cdr: "% de redução de recarga", mana: "de recurso máximo", regen: "de recurso por segundo",
};

export const SETS: SetDef[] = [
  { id: "set_muralha", classe: "warrior", nome: "Conjunto da Muralha", descricao: "Couraça de guerra: aguenta mais golpes.", pecas: SET_PECAS, b2: { hp: 20, dr: 2 }, b4: { hp: 45, dr: 5, dmgPct: 6 } },
  { id: "set_cacador", classe: "archer", nome: "Conjunto do Caçador", descricao: "Couro e mata: pontaria mais firme.", pecas: SET_PECAS, b2: { crit: 2 }, b4: { crit: 4, cdr: 4 } },
  { id: "set_sagrado", classe: "cleric", nome: "Conjunto Sagrado", descricao: "Fé costurada: vida e recurso que voltam mais.", pecas: SET_PECAS, b2: { hp: 18, mana: 8 }, b4: { hp: 40, mana: 16, regen: 0.4 } },
  { id: "set_arcano", classe: "mage", nome: "Conjunto Arcano", descricao: "Runas nas vestes: mais poder e mana.", pecas: SET_PECAS, b2: { dmgPct: 4, mana: 8 }, b4: { dmgPct: 9, mana: 16, cdr: 3 } },
];

export const setPorId = (id: string): SetDef | undefined => SETS.find((s) => s.id === id);

/** Conjunto a que uma peça pertence (pela classe e pelo tipo de slot), ou null se não é peça de conjunto. */
export function setDaPeca(itemId: string | null | undefined): SetDef | null {
  const d = itemId ? ITEMS[itemId] : undefined;
  if (!d || !d.cls) return null;
  return SETS.find((s) => s.classe === d.cls && (s.pecas as string[]).includes(d.kind)) ?? null;
}

/** Quantas peças do conjunto estão equipadas (0 a 4). Cada slot conta no máximo uma vez. */
export function contarSet(equip: Partial<Record<EquipSlot, string | null>>, set: SetDef): number {
  let n = 0;
  for (const s of set.pecas) if (setDaPeca(equip[s]) === set) n++;
  return n;
}

/** Bônus ativo do conjunto da classe: 4 peças => b4; 2 ou 3 => b2; menos => nenhum. */
export function setAtivo(equip: Partial<Record<EquipSlot, string | null>>, cls: CharClass): { set: SetDef; n: number; bonus: SetBonus | null } | null {
  const set = SETS.find((s) => s.classe === cls);
  if (!set) return null;
  const n = contarSet(equip, set);
  return { set, n, bonus: n >= 4 ? set.b4 : n >= 2 ? set.b2 : null };
}

/** Soma o bônus ativo do conjunto aos bônus de equipamento (sem mutar o original). Os tetos de dr e cdr continuam valendo. */
export function aplicarSets(gear: GearBonuses, equip: Partial<Record<EquipSlot, string | null>>, cls: CharClass): GearBonuses {
  const a = setAtivo(equip, cls);
  const g: GearBonuses = { ...gear, af: { ...gear.af } };
  if (!a || !a.bonus) return g;
  for (const k of Object.keys(a.bonus) as SetStat[]) g[k] += a.bonus[k] ?? 0;
  g.dr = Math.min(MAX_DR, g.dr);
  g.cdr = Math.min(MAX_CDR, g.cdr);
  return g;
}

/** Linhas de texto do bônus (para tooltip e painel), ex.: "+20 de vida máxima". */
export function setBonusLinhas(bonus: SetBonus): string[] {
  return (Object.keys(bonus) as SetStat[]).map((k) => {
    const v = bonus[k] ?? 0;
    return `+${v} ${SET_STAT_LABEL[k]}`;
  });
}
