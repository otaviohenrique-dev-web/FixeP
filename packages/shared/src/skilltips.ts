import type { ActionDef, ActionKind } from "./index";

/** Texto do balão de cada habilidade: os números vêm da própria ActionDef; aqui ficam só o resumo e a dica de uso (chave = nome da ação). */
export const SKILL_TEXT: Record<string, { desc: string; tip: string }> = {
  // Guerreiro
  "Golpe": { desc: "Golpe do escudo e da espada à frente.", tip: "Ataque básico: use entre as habilidades." },
  "Investida": { desc: "Avança com o escudo e atordoa quem estiver no caminho.", tip: "Entre no meio do grupo e siga com Correntes ou Escudo Refletor." },
  "Correntes": { desc: "Correntes brotam do chão e prendem os inimigos da área.", tip: "Prenda os alvos e deixe o grupo atacar à vontade; chefes resistem." },
  "Escudo Refletor": { desc: "Provoca inimigos próximos e devolve parte do dano que recebe.", tip: "Ative antes de puxar um grupo grande para o corpo a corpo." },
  "Queda do Colosso": { desc: "Um colosso de aço desaba no local marcado: dano enorme e atordoamento.", tip: "Telegrafada: use sobre inimigos já presos pelas Correntes." },
  // Arqueiro
  "Flecha": { desc: "Dispara uma flecha em linha reta.", tip: "Mantenha distância e atire entre as habilidades." },
  "Perfurar": { desc: "Flecha veloz que atravessa os inimigos da linha e quebra a armadura deles: todo o grupo passa a causar mais dano neles.", tip: "Abra a luta com ela: aliados e você aproveitam o dano extra. Alinhe os inimigos para acertar vários." },
  "Cilada": { desc: "Planta uma armadilha que dispara quando um inimigo pisa nela: dano baixo e lentidão forte nos atingidos.", tip: "Coloque atrás de você ao recuar: quem pisar fica lento e não alcança você." },
  "Chuva": { desc: "Chuva de flechas na área marcada, depois de um breve atraso. Ao acertar, seu ataque básico fica bem mais rápido.", tip: "Use em grupos e siga com ataques básicos enquanto a velocidade está alta." },
  "Salva Final": { desc: "Saraivada gigante de flechas sobre a área marcada.", tip: "Guarde para chefes e grupos cercados; o atraso é curto." },
  // Clérigo
  "Raio": { desc: "Raio de luz em linha reta.", tip: "Ataque básico barato: ajuda a regenerar a mana entre curas." },
  "Cura em Área": { desc: "Cura todos os aliados em volta, mas pouco.", tip: "Ótima para grupos; para um aliado ferido, troque para Cura Focada (Z)." },
  "Cura Focada": { desc: "Cura UM aliado (o selecionado, o mais perto da mira ou você).", tip: "Troque com Z ou ⇄ fora de combate. Cura bem mais que a de área." },
  "Compressor de Ar": { desc: "Puxa os inimigos da área para o centro e os atordoa.", tip: "Puxe os inimigos e depois use Julgamento para acertar todos juntos." },
  "Julgamento": { desc: "Luz sagrada cai na área marcada, depois de um breve atraso.", tip: "Combine com o Compressor de Ar para acertar o grupo inteiro." },
  "Luz Divina": { desc: "Grande cura em todos os aliados num raio amplo.", tip: "Reserve para momentos críticos, como o pulso sombrio dos chefes." },
  // Mago
  "Dardo Arcano": { desc: "Dardo arcano em linha reta.", tip: "Ataque básico: regenere mana com ele entre as magias." },
  "Bola de Fogo": { desc: "Projétil que explode ao acertar, ferindo uma área.", tip: "Acerte o inimigo da frente para atingir quem está junto dele." },
  "Relâmpago": { desc: "Raio cai na área marcada quase na hora.", tip: "Pequeno e rápido: ideal para alvos que estão se movendo." },
  "Chuva de Fogo": { desc: "Chuva de chamas em área ampla, depois de um atraso.", tip: "Jogue sobre inimigos presos por controle de aliados." },
  "Meteoro": { desc: "Um meteoro desaba na área marcada: dano devastador.", tip: "Telegrafado: use em chefes ou grupos que não podem fugir." },
  // comum
  "Esquiva": { desc: "Desliza para a direção do movimento e fica invulnerável por um instante.", tip: "Use no momento em que o aviso vermelho do inimigo estiver acabando." },
};

const TYPE: Partial<Record<ActionKind, string>> = {
  melee: "Dano", ring: "Dano", dashHit: "Dano e controle", tauntBuff: "Defesa", reflectBuff: "Defesa e controle", dodge: "Movimento",
  projectile: "Dano", blast: "Dano em área", trap: "Dano e armadilha", rain: "Dano em área", pull: "Controle",
  healAoe: "Cura", healFocus: "Cura", emberBuff: "Reforço", revive: "Ressurreição",
};
const f = (n: number) => String(Math.round(n * 10) / 10).replace(".", ",");

export interface SkillTooltipData { name: string; key: string; type: string; stats: string[]; desc: string; tip: string }

/** Monta os dados do balão a partir da ActionDef (números reais) e do texto acima. */
export function skillTooltip(d: ActionDef, resourceName: string): SkillTooltipData {
  const s: string[] = [];
  const type = d.rootS || d.stunS ? (d.dmg ? "Dano e controle" : "Controle") : TYPE[d.kind] ?? "Habilidade";
  if (d.dmg) s.push(`Dano base: ${d.dmg}`);
  if (d.heal) s.push(`Cura: ${d.heal}`);
  if (d.radius && d.kind !== "projectile" && d.kind !== "blast") s.push(`Raio: ${f(d.radius)} tiles`);
  if (d.blast) s.push(`Explosão: ${f(d.blast)} tiles`);
  if (d.range) s.push(`Alcance: ${f(d.range)} tiles`);
  if (d.placeRange) s.push(`Alcance de mira: ${f(d.placeRange)} tiles`);
  if (d.dash && d.kind === "dashHit") s.push(`Avanço: ${f(d.dash)} tiles`);
  if (d.stunS) s.push(`Atordoa: ${f(d.stunS)} s`);
  if (d.rootS) s.push(`Enraíza: ${f(d.rootS)} s`);
  if (d.buffS) s.push(`Duração: ${f(d.buffS)} s`);
  if (d.reduction) s.push(`Dano recebido: -${Math.round(d.reduction * 100)}%`);
  if (d.reflect) s.push(`Reflete: ${Math.round(d.reflect * 100)}% do dano`);
  if (d.tauntRadius) s.push(`Provoca em ${f(d.tauntRadius)} tiles por ${f(d.tauntS ?? 0)} s`);
  if (d.invulnS) s.push(`Invulnerável: ${f(d.invulnS)} s`);
  if (d.dash && d.kind === "dodge") s.push(`Distância: ${f(d.dash)} tiles`);
  if (d.lifeS) s.push(`Dura ${f(d.lifeS)} s (até ${d.maxActive ?? 1} ativas)`);
  if (d.pierce) s.push("Atravessa inimigos");
  if (d.shredPct) s.push(`Quebra armadura: +${d.shredPct}% de dano recebido por ${f(d.shredS ?? 0)} s`);
  if (d.slowPct) s.push(`Lentidão: -${d.slowPct}% por ${f(d.slowS ?? 0)} s`);
  if (d.hasteAtkPct) s.push(`Ao acertar: ataque básico +${d.hasteAtkPct}% mais rápido por ${f(d.hasteS ?? 0)} s`);
  s.push(d.cost ? `Custo: ${d.cost} de ${resourceName}` : "Sem custo");
  s.push(`Recarga: ${f(d.cd)} s`);
  const t = SKILL_TEXT[d.name] ?? { desc: "", tip: "" };
  return { name: d.name, key: d.key, type, stats: s, desc: t.desc, tip: t.tip };
}
