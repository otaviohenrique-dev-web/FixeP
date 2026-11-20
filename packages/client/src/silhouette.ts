import type { EquipSlot } from "@frixep/shared";

/** Silhueta do boneco da mochila: SVG vetorial (nítido em qualquer densidade), neutra de classe.
 *  Coordenadas 262x330, mesmo espaço usado pelas posições dos espaços de equipamento (EQ_POS em inventory.ts).
 *  Cada parte do corpo é um <path> reaproveitado: o corpo base e o realce da raridade do que está equipado
 *  (elmo→cabeça, armadura→tronco, arma/secundária→mãos, botas→pés, capa→manto atrás dos ombros). */

// Metade esquerda desenhada à mão; a direita é o espelho (x -> 262 - x).
const HEAD = "M131 24C119 24 112 33 112 45C112 56 118 66 124 69L138 69C144 66 150 56 150 45C150 33 143 24 131 24Z";
const NECK = "M123 66L139 66L142 84C137 89 125 89 120 84Z";
const TORSO =
  "M119 83C109 85 99 89 95 99C92 118 96 142 102 162C106 175 108 187 107 199C105 208 100 216 97 226L165 226C162 216 157 208 155 199C154 187 156 175 160 162C166 142 170 118 167 99C163 89 153 85 143 83C138 90 124 90 119 83Z";
const ARM_L =
  "M97 93C84 91 72 98 69 113C66 132 62 158 58 182L56 194C54 205 60 213 68 211C74 209 76 203 76 197L82 172C86 154 90 140 95 130Z";
const LEG_L =
  "M98 222C95 246 97 268 102 288C103 296 98 300 92 304C88 308 91 313 99 313L119 313C123 313 124 307 123 299C124 276 125 252 128 236L128 222Z";
const CAPE_L =
  "M108 84C88 88 70 104 62 140C56 176 52 208 46 238C60 246 96 246 131 238L131 100Z";

const mirror = (id: string) => `<use href="#${id}" transform="translate(262 0) scale(-1 1)"/>`;
/** parte esquerda + espelho; recorte opcional por faixa vertical */
const both = (id: string, attrs = "") => `<g ${attrs}><use href="#${id}"/>${mirror(id)}</g>`;

/** Silhueta de fundo: só ilustração, escura e estática (sem brilho, sem realce de raridade, sem animação).
 *  O parâmetro `colors` é ignorado de propósito: o destaque de raridade fica nos espaços de equipamento. */
export function silhouetteSvg(_colors?: Partial<Record<EquipSlot, string>>): string {
  return `<svg class="iv-sil" viewBox="0 0 262 330" aria-hidden="true" shape-rendering="geometricPrecision" preserveAspectRatio="xMidYMid meet"><defs>
  <path id="ivH" d="${HEAD}"/><path id="ivN" d="${NECK}"/><path id="ivT" d="${TORSO}"/>
  <path id="ivA" d="${ARM_L}"/><path id="ivL" d="${LEG_L}"/><path id="ivC" d="${CAPE_L}"/>
  </defs>
  <g fill="#1b1612" fill-opacity=".55"><use href="#ivC"/>${mirror("ivC")}</g>
  <g fill="#2a221b" fill-opacity=".8" stroke="#3a2f24" stroke-opacity=".7" stroke-width="1" stroke-linejoin="round">
    ${both("ivL")}<use href="#ivN"/>${both("ivA")}<use href="#ivT"/><use href="#ivH"/></g></svg>`;
}
