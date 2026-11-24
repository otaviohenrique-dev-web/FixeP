/**
 * Arte das habilidades na HUD: imagens finais em assets/ui/skills/skill_<nome>.png (512 px, sem moldura: a borda é desenhada na HUD).
 * O arquivo é achado pelo nome da habilidade (campo `name` em shared/index.ts), sem acento e com sublinhado.
 */

/** caminho da imagem da habilidade, ou undefined se o nome não tem arte */
const ALIAS: Record<string, string> = { "Escudo de Aço": "escudo_refletor" }; // habilidades cuja arte tem outro nome de arquivo

export function skillImage(name: string): string | undefined {
  if (ALIAS[name]) return `/assets/ui/skills/skill_${ALIAS[name]}.png`;
  const slug = name
    .normalize("NFD").replace(/[̀-ͯ]/g, "") // tira acentos
    .toLowerCase().trim().replace(/\s+/g, "_");
  return `/assets/ui/skills/skill_${slug}.png`;
}

/** cor da borda por tipo (só o Clérigo tem categorias): dano dourado/luz, cura dourado/verde, controle azul claro */
export function skillCategory(name: string): "dano" | "cura" | "controle" | undefined {
  switch (name) {
    case "Raio":
    case "Julgamento":
      return "dano";
    case "Cura em Área":
    case "Cura Focada":
    case "Luz Divina":
      return "cura";
    case "Compressor de Ar":
      return "controle";
    default:
      return undefined;
  }
}
