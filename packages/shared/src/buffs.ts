/**
 * Buffs próprios do personagem (status POSITIVOS temporários). O servidor envia a lista ativa só ao dono (Evt.Buffs);
 * o cliente desenha os ícones com o tempo restante e os acúmulos. Debuffs de inimigos NÃO entram aqui.
 *
 * `ate` = segundos restantes (o servidor manda; o cliente conta daí). `stacks` só existe em buffs com acúmulo.
 */
export type BuffId = "haste" | "heal_stacks" | "reflect" | "guard" | "provoke" | "ember";

export interface BuffDef {
  name: string;
  /** chave do desenho de ícone no cliente (packages/client/src/buffs.ts) */
  icon: string;
  /** cor do anel e do ícone */
  color: string;
  /** descrição curta mostrada no tooltip */
  desc: string;
}

export const BUFFS: Record<BuffId, BuffDef> = {
  haste: { name: "Chuva de Flechas", icon: "bolt", color: "#6fcf6f", desc: "Velocidade de ataque básico aumentada." },
  heal_stacks: { name: "Cura Focada", icon: "plus", color: "#f2e6a0", desc: "Acúmulos: cada um aumenta as curas do Clérigo neste alvo." },
  reflect: { name: "Escudo Refletor", icon: "shield", color: "#9fc4ff", desc: "Recebe menos dano e devolve parte do golpe ao inimigo." },
  guard: { name: "Guarda", icon: "hex", color: "#8fd3ff", desc: "Escudo leve da cura: recebe menos dano por um tempo." },
  provoke: { name: "Provocação", icon: "horn", color: "#ff8a3d", desc: "Os inimigos próximos miram você." },
  ember: { name: "Brasa do Clérigo", icon: "flame", color: "#ffb072", desc: "Causa mais dano por um tempo." },
};

export interface ActiveBuff {
  id: BuffId;
  /** segundos restantes */
  ate: number;
  /** acúmulos (só nos buffs que acumulam) */
  stacks?: number;
}

export interface BuffsEvent {
  list: ActiveBuff[];
}
