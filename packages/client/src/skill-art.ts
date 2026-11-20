/**
 * Ícones ilustrados das habilidades (estilo "arte de botão": moldura colorida pela classe + símbolo grande).
 * Desenhados em SVG 64x64 no próprio código; a chave é o nome da habilidade (campo `name` de shared/index.ts).
 */

const FRAME = {
  warrior: ["#7a2220", "#3a0f0e"],
  archer: ["#2f6b3a", "#12301a"],
  cleric: ["#8a6a1c", "#3d2e0c"],
  mage: ["#4a2f8a", "#1d1240"],
  neutro: ["#4a5566", "#1b222c"],
} as const;

type Cls = keyof typeof FRAME;

const GLYPH = 'fill="#f4efe0" stroke="#05080d" stroke-width="3" stroke-linejoin="round" stroke-linecap="round" paint-order="stroke"';
const GLOW = 'fill="#ffb347" stroke="#3a1400" stroke-width="2.5" stroke-linejoin="round" paint-order="stroke"';
const ARC = 'fill="none" stroke="#f4efe0" stroke-width="4" stroke-linecap="round" stroke-opacity=".9"';

function tile(cls: Cls, body: string): string {
  const [c1, c2] = FRAME[cls];
  return `<svg viewBox="0 0 64 64" xmlns="http://www.w3.org/2000/svg" shape-rendering="geometricPrecision">
<rect x="1" y="1" width="62" height="62" rx="12" fill="${c2}"/>
<rect x="4" y="4" width="56" height="30" rx="9" fill="${c1}" opacity=".85"/>
<rect x="1.5" y="1.5" width="61" height="61" rx="11.5" fill="none" stroke="#05080d" stroke-width="2"/>
<rect x="3" y="3" width="58" height="58" rx="10.5" fill="none" stroke="#f0cf86" stroke-opacity=".55" stroke-width="1.5"/>
${body}
</svg>`;
}

const ART: Record<string, string> = {
  // Guerreiro
  "Golpe": tile("warrior", `<path ${GLYPH} d="M18 46 L44 20 L48 16 L50 20 L46 24 L20 50 Z"/><path ${GLYPH} d="M14 40 L24 50 L18 54 L10 46 Z"/><path ${GLYPH} d="M30 46 L42 34" stroke-width="5"/>`),
  "Investida": tile("warrior", `<path ${GLYPH} d="M22 28 H42 V20 L56 32 L42 44 V36 H22 Z"/><path ${ARC} d="M8 22 H16 M6 32 H14 M8 42 H16" stroke-width="3"/>`),
  "Correntes": tile("warrior", `<ellipse cx="24" cy="30" rx="10" ry="7" ${ARC} transform="rotate(-30 24 30)"/><ellipse cx="38" cy="36" rx="10" ry="7" ${ARC} transform="rotate(-30 38 36)"/><ellipse cx="46" cy="22" rx="8" ry="5.5" ${ARC} transform="rotate(-30 46 22)"/>`),
  "Escudo Refletor": tile("warrior", `<path ${GLYPH} d="M32 12 L50 18 V32 C50 44 40 50 32 54 C24 50 14 44 14 32 V18 Z"/><path fill="none" stroke="#05080d" stroke-width="3" d="M32 22 V44 M22 30 H42"/>`),
  "Queda do Colosso": tile("warrior", `<rect ${GLYPH} x="18" y="14" width="26" height="14" rx="2"/><path ${GLYPH} d="M30 28 H36 V48 H30 Z"/><path ${ARC} d="M10 56 H54" stroke-width="3"/>`),
  // Arqueiro
  "Flecha": tile("archer", `<path ${GLYPH} d="M12 46 L46 18" stroke-width="5"/><path ${GLYPH} d="M52 12 L40 16 L48 24 Z"/><path ${GLYPH} d="M10 40 L16 36 L18 46 L8 50 Z" stroke-width="2"/>`),
  "Perfurar": tile("archer", `<path ${GLYPH} d="M12 36 H42" stroke-width="4"/><path ${GLYPH} d="M56 36 L40 26 L42 36 L40 46 Z"/><path ${ARC} d="M8 24 H20 M6 48 H18" stroke-width="3"/>`),
  "Cilada": tile("archer", `<circle cx="32" cy="34" r="14" fill="none" stroke="#f4efe0" stroke-width="5"/><path ${GLYPH} d="M22 22 L26 28 L30 20 L34 28 L38 20 L42 28 L44 22 V16 H20 V22 Z" stroke-width="2"/>`),
  "Chuva": tile("archer", `<path ${GLYPH} d="M16 16 L34 38" stroke-width="3.5"/><path ${GLYPH} d="M38 40 L32 36 L42 34 Z"/><path ${GLYPH} d="M30 12 L48 34" stroke-width="3.5"/><path ${GLYPH} d="M52 36 L46 32 L56 30 Z"/><path ${GLYPH} d="M12 34 L26 52" stroke-width="3.5"/><path ${GLYPH} d="M30 56 L24 52 L34 50 Z"/>`),
  "Salva Final": tile("archer", `<path ${GLYPH} d="M8 56 L34 28" stroke-width="4"/><path ${GLYPH} d="M36 26 L28 26 L34 34 Z"/><path ${GLYPH} d="M8 56 L40 46" stroke-width="4"/><path ${GLYPH} d="M42 44 L34 42 L40 50 Z"/><path ${GLYPH} d="M8 56 L56 56" stroke-width="3" fill="none"/><path ${GLYPH} d="M8 56 L50 14" stroke-width="4"/><path ${GLYPH} d="M52 12 L44 14 L50 22 Z"/>`),
  // Clérigo
  "Raio": tile("cleric", `<path ${GLYPH} d="M36 10 L18 36 H30 L24 56 L46 26 H34 L40 10 Z"/>`),
  "Cura em Área": tile("cleric", `<circle cx="32" cy="34" r="18" fill="none" stroke="#f4efe0" stroke-width="3.5" stroke-dasharray="5 5"/><path ${GLYPH} d="M28 22 H36 V30 H44 V38 H36 V46 H28 V38 H20 V30 H28 Z"/>`),
  "Cura Focada": tile("cleric", `<path ${GLYPH} d="M32 50 C14 38 10 28 14 22 C18 16 28 16 32 24 C36 16 46 16 50 22 C54 28 50 38 32 50 Z"/><path ${ARC} d="M24 28 L28 34 L32 28 L36 34 L40 28" stroke-width="3" stroke="#05080d"/>`),
  "Compressor de Ar": tile("cleric", `<path ${ARC} d="M12 26 C22 16 42 16 52 26"/><path ${ARC} d="M12 40 C22 50 42 50 52 40"/><path ${GLYPH} d="M32 28 L26 34 H30 V42 H34 V34 H38 Z" stroke-width="2"/>`),
  "Julgamento": tile("cleric", `<circle cx="32" cy="34" r="11" ${GLYPH}/><path ${ARC} d="M32 12 V18 M32 50 V56 M10 34 H16 M48 34 H54 M17 19 L21 23 M47 49 L43 45 M47 19 L43 23 M17 49 L21 45" stroke-width="4"/>`),
  "Luz Divina": tile("cleric", `<path ${GLYPH} d="M32 8 L37 26 L56 22 L42 34 L56 46 L37 42 L32 60 L27 42 L8 46 L22 34 L8 22 L27 26 Z"/><circle cx="32" cy="34" r="6" fill="#fff6d6"/>`),
  // Mago
  "Dardo Arcano": tile("mage", `<circle cx="44" cy="22" r="9" ${GLYPH}/><path ${ARC} d="M34 30 L12 50 M30 26 L14 34 M38 34 L24 52" stroke-width="3.5"/>`),
  "Bola de Fogo": tile("mage", `<circle cx="32" cy="36" r="15" ${GLOW}/><path ${GLOW} d="M24 26 C26 14 34 10 32 2 C40 10 42 18 40 24 Z"/><circle cx="32" cy="36" r="7" fill="#fff1b8"/>`),
  "Relâmpago": tile("mage", `<path ${GLYPH} d="M40 8 L20 36 H32 L22 56 L46 26 H34 L42 8 Z" fill="#ffe27a"/>`),
  "Chuva de Fogo": tile("mage", `<path ${GLOW} d="M18 24 C14 32 14 40 18 44 C24 46 26 38 26 32 C26 28 22 26 18 24 Z"/><path ${GLOW} d="M36 14 C32 22 32 30 36 34 C42 36 44 28 44 22 C44 18 40 16 36 14 Z"/><path ${GLOW} d="M26 46 C22 54 22 62 26 66 C32 66 34 58 34 52 C34 48 30 46 26 46 Z" transform="translate(0 -8)"/>`),
  "Meteoro": tile("mage", `<path ${GLOW} d="M10 14 L30 30" stroke-width="6" fill="none"/><path ${GLOW} d="M6 22 L20 36" stroke-width="4" fill="none"/><circle cx="40" cy="40" r="14" ${GLOW}/><circle cx="36" cy="36" r="4" fill="#fff1b8"/>`),
  // Neutros
  "Esquiva": tile("neutro", `<path ${ARC} d="M10 24 C24 14 40 16 54 26"/><path ${ARC} d="M14 36 C28 28 42 30 54 38"/><path ${ARC} d="M18 48 C30 42 40 44 50 50"/>`),
};

/** arte da habilidade pelo nome, ou undefined (aí a HUD usa o ícone pequeno de antes) */
export function skillArt(name: string): string | undefined {
  return ART[name];
}
