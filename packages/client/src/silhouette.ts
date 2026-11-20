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

/** @param colors cor da raridade por espaço equipado (ausente = vazio) */
export function silhouetteSvg(colors: Partial<Record<EquipSlot, string>>): string {
  const hl = (c: string | undefined, body: string) =>
    c ? `<g fill="${c}" fill-opacity=".34" stroke="${c}" stroke-opacity=".95" stroke-width="1.6" stroke-linejoin="round" style="filter:drop-shadow(0 0 5px ${c})">${body}</g>` : "";
  const dot = (x: number, y: number) => `<circle cx="${x}" cy="${y}" r="2.4" fill="#0b1119" stroke="#d9b25a" stroke-opacity=".8" stroke-width="1"/>`;
  return `<svg class="iv-sil" viewBox="0 0 262 330" aria-hidden="true" shape-rendering="geometricPrecision" preserveAspectRatio="xMidYMid meet"><defs>
  <linearGradient id="ivg" gradientUnits="userSpaceOnUse" x1="0" y1="22" x2="0" y2="314"><stop offset="0" stop-color="#2f4468"/><stop offset=".45" stop-color="#1a2a45"/><stop offset="1" stop-color="#0b1220"/></linearGradient>
  <linearGradient id="ivrim" gradientUnits="userSpaceOnUse" x1="86" y1="0" x2="176" y2="0"><stop offset="0" stop-color="#bcd8ff" stop-opacity=".34"/><stop offset=".3" stop-color="#bcd8ff" stop-opacity="0"/><stop offset=".7" stop-color="#bcd8ff" stop-opacity="0"/><stop offset="1" stop-color="#bcd8ff" stop-opacity=".2"/></linearGradient>
  <linearGradient id="ivgold" gradientUnits="userSpaceOnUse" x1="0" y1="22" x2="0" y2="314"><stop offset="0" stop-color="#f0d27c"/><stop offset=".5" stop-color="#d9b25a"/><stop offset="1" stop-color="#b9823a"/></linearGradient>
  <linearGradient id="ivcape" gradientUnits="userSpaceOnUse" x1="0" y1="84" x2="0" y2="246"><stop offset="0" stop-color="#2d1d17" stop-opacity=".75"/><stop offset="1" stop-color="#150d0b" stop-opacity=".25"/></linearGradient>
  <radialGradient id="ivaura" cx=".5" cy=".42" r=".52"><stop offset="0" stop-color="#ff8a3d" stop-opacity=".22"/><stop offset=".55" stop-color="#d9833a" stop-opacity=".07"/><stop offset="1" stop-color="#ff8a3d" stop-opacity="0"/></radialGradient>
  <radialGradient id="ivfrost" cx=".5" cy=".5" r=".5"><stop offset="0" stop-color="#7cc4ff" stop-opacity=".16"/><stop offset="1" stop-color="#7cc4ff" stop-opacity="0"/></radialGradient>
  <radialGradient id="ivfloor" cx=".5" cy=".5" r=".5"><stop offset="0" stop-color="#000" stop-opacity=".7"/><stop offset="1" stop-color="#000" stop-opacity="0"/></radialGradient>
  <filter id="ivglow" x="-20%" y="-10%" width="140%" height="120%"><feGaussianBlur stdDeviation="2.6"/></filter>
  <path id="ivH" d="${HEAD}"/><path id="ivN" d="${NECK}"/><path id="ivT" d="${TORSO}"/>
  <path id="ivA" d="${ARM_L}"/><path id="ivL" d="${LEG_L}"/><path id="ivC" d="${CAPE_L}"/>
  <clipPath id="ivhand"><rect x="0" y="186" width="262" height="40"/></clipPath>
  <clipPath id="ivfeet"><rect x="0" y="266" width="262" height="60"/></clipPath>
  </defs>
  <ellipse cx="131" cy="150" rx="170" ry="170" fill="url(#ivaura)"/>
  <ellipse cx="131" cy="160" rx="120" ry="150" fill="url(#ivfrost)"/>
  <ellipse cx="131" cy="314" rx="86" ry="11" fill="url(#ivfloor)"/>
  <ellipse cx="131" cy="314" rx="72" ry="8" fill="none" stroke="#d9b25a" stroke-opacity=".28" stroke-width="1"/>
  <ellipse cx="131" cy="314" rx="52" ry="5.5" fill="none" stroke="#d9b25a" stroke-opacity=".16" stroke-width=".8" stroke-dasharray="2 4"/>
  <g fill="url(#ivcape)" stroke="#d9b25a" stroke-opacity=".3" stroke-width="1" stroke-dasharray="3 3"><use href="#ivC"/>${mirror("ivC")}</g>
  ${hl(colors.cape, `<use href="#ivC"/>${mirror("ivC")}`)}
  <g filter="url(#ivglow)" fill="none" stroke="#d9b25a" stroke-opacity=".5" stroke-width="2.2">
    <use href="#ivH"/><use href="#ivN"/><use href="#ivT"/>${both("ivA")}${both("ivL")}</g>
  <g fill="url(#ivg)" stroke="url(#ivgold)" stroke-opacity=".7" stroke-width="1.1" stroke-linejoin="round">
    ${both("ivL")}<use href="#ivN"/>${both("ivA")}<use href="#ivT"/><use href="#ivH"/></g>
  <g fill="url(#ivrim)" stroke="none"><use href="#ivH"/><use href="#ivT"/>${both("ivA")}${both("ivL")}</g>
  <g fill="none" stroke="#9fc2ea" stroke-opacity=".16" stroke-width="1" stroke-linecap="round"><path d="M131 92V212M106 140Q131 150 156 140M110 196Q131 204 152 196"/></g>
  <g fill="#0b1119" fill-opacity=".45"><path d="M96 224L166 224L164 232L98 232Z"/></g>
  ${hl(colors.helmet, `<use href="#ivH"/>`)}
  ${hl(colors.armor, `<use href="#ivT"/>`)}
  ${hl(colors.weapon, `<g clip-path="url(#ivhand)"><use href="#ivA"/></g>`)}
  ${hl(colors.offhand, `<g clip-path="url(#ivhand)"><use href="#ivA" transform="translate(262 0) scale(-1 1)"/></g>`)}
  ${hl(colors.boots, `<g clip-path="url(#ivfeet)">${both("ivL")}</g>`)}
  <g fill="none" stroke="#d9b25a" stroke-opacity=".38" stroke-width="1" stroke-dasharray="1.5 3" stroke-linecap="round">
    <path d="M63 54L86 96"/><path d="M199 54L176 96"/><path d="M45 168L62 196"/><path d="M217 168L200 196"/><path d="M58 224L98 226"/><path d="M204 224L164 226"/></g>
  ${dot(86, 96)}${dot(176, 96)}${dot(62, 196)}${dot(200, 196)}${dot(98, 226)}${dot(164, 226)}
  <circle class="em" cx="131" cy="226" r="2.4" fill="#ff8a3d"/></svg>`;
}
