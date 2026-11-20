/**
 * Ícones ilustrados das habilidades (estilo "arte de botão": moldura colorida pela classe + símbolo grande, com brilho e contorno).
 * Desenhados em SVG 64x64 no próprio código; a chave é o nome da habilidade (campo `name` de shared/index.ts).
 */

const FRAME = {
  warrior: ["#9a2c24", "#3a0f0e"],
  archer: ["#2f7a40", "#12301a"],
  cleric: ["#a57a22", "#3d2e0c"],
  mage: ["#5a3aa8", "#1d1240"],
  neutro: ["#56627a", "#1b222c"],
} as const;

type Cls = keyof typeof FRAME;

/** gradiente linear (claro em cima, escuro embaixo) */
const grad = (id: string, top: string, bot: string) =>
  `<linearGradient id="${id}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${top}"/><stop offset="1" stop-color="${bot}"/></linearGradient>`;

const OUT = 'stroke="#05080d" stroke-width="2.5" stroke-linejoin="round" stroke-linecap="round" paint-order="stroke"';
const ARC = (w = 4) => `fill="none" stroke="url(#STEEL)" stroke-width="${w}" stroke-linecap="round"`;

/** monta o ícone: moldura da classe + símbolo; ids de gradiente ficam únicos por habilidade */
function tile(cls: Cls, slug: string, defs: string, body: string): string {
  const [c1, c2] = FRAME[cls];
  const id = (s: string) => `${s}-${slug}`;
  return `<svg viewBox="0 0 64 64" xmlns="http://www.w3.org/2000/svg">
<defs>${defs.replace(/id="(\w+)"/g, (_m, s) => `id="${id(s)}"`)}</defs>
<rect x="1" y="1" width="62" height="62" rx="12" fill="${c2}"/>
<rect x="4" y="4" width="56" height="28" rx="9" fill="${c1}" opacity=".9"/>
<rect x="1.5" y="1.5" width="61" height="61" rx="11.5" fill="none" stroke="#05080d" stroke-width="2"/>
<rect x="3" y="3" width="58" height="58" rx="10.5" fill="none" stroke="#f0cf86" stroke-opacity=".55" stroke-width="1.5"/>
${body.replace(/url\(#(\w+)\)/g, (_m, s) => `url(#${id(s)})`)}
</svg>`;
}

// gradientes reutilizados: aço (lâminas), ouro (detalhes), fogo, luz, madeira
const STEEL = grad("STEEL", "#ffffff", "#9fb0c4");
const GOLD = grad("GOLD", "#fff3c4", "#c08a2a");
const FIRE = grad("FIRE", "#fff2a8", "#ff6a1a");
const LIGHT = grad("LIGHT", "#ffffff", "#ffe27a");
const WOOD = grad("WOOD", "#c99a5b", "#6a3f1c");

const S = (fill = "STEEL") => `fill="url(#${fill})" ${OUT}`;

const ART: Record<string, string> = {
  // ----- Guerreiro (aço e vermelho)
  "Golpe": tile("warrior", "golpe", STEEL + GOLD,
    `<path ${S()} d="M52 6 L58 12 L30 42 L22 34 Z"/>
     <path ${S("GOLD")} d="M14 30 L22 22 L40 40 L32 48 Z"/>
     <path ${S("WOOD")} d="M18 42 L26 34 L34 42 L26 50 Z"/>
     <circle cx="14" cy="50" r="5" ${S("GOLD")}/>
     <path d="M48 10 L56 18" stroke="#fff" stroke-opacity=".6" stroke-width="1.5"/>`),
  "Investida": tile("warrior", "investida", STEEL + GOLD,
    `<path ${S()} d="M46 32 L30 22 V28 H12 V36 H30 V42 Z"/>
     <path ${S("GOLD")} d="M40 26 L58 32 L40 38 Z"/>
     <path ${ARC(3)} d="M8 18 H18 M6 26 H16 M8 46 H18 M6 54 H16"/>`),
  "Correntes": tile("warrior", "correntes", STEEL,
    `<ellipse cx="24" cy="26" rx="13" ry="8" fill="none" stroke="url(#STEEL)" stroke-width="6" transform="rotate(-40 24 26)"/>
     <ellipse cx="40" cy="38" rx="13" ry="8" fill="none" stroke="url(#STEEL)" stroke-width="6" transform="rotate(-40 40 38)" ${OUT}/>
     <circle cx="50" cy="16" r="3" fill="#ffe27a"/>`),
  "Escudo Refletor": tile("warrior", "escudo", STEEL + GOLD,
    `<path d="M32 12 L50 18 V32 C50 44 40 50 32 54 C24 50 14 44 14 32 V18 Z" fill="url(#STEEL)" ${OUT}/>
     <path d="M32 18 L44 22 V32 C44 40 38 44 32 47 Z" fill="url(#GOLD)" opacity=".85"/>
     <path fill="none" stroke="#05080d" stroke-width="3" d="M32 22 V44 M22 30 H42"/>`),
  "Queda do Colosso": tile("warrior", "queda", STEEL + WOOD,
    `<path d="M26 26 H36 V52 H26 Z" fill="url(#WOOD)" ${OUT}/>
     <rect ${S()} x="14" y="10" width="34" height="18" rx="3"/>
     <path d="M10 56 L16 50 M28 58 L32 52 M46 56 L52 50" fill="none" stroke="#ffe27a" stroke-width="3" stroke-linecap="round"/>`),

  // ----- Arqueiro (verde e madeira)
  "Flecha": tile("archer", "flecha", STEEL + WOOD,
    `<path d="M12 50 L44 18" stroke="url(#WOOD)" stroke-width="5" stroke-linecap="round" ${OUT}/>
     <path ${S()} d="M56 6 L39 13 L49 23 Z"/>
     <path ${S("GOLD")} d="M12 50 L4 46 L8 58 Z M12 50 L20 56 L8 58 Z"/>`),
  "Perfurar": tile("archer", "perfurar", STEEL + WOOD,
    `<path d="M12 36 H40" stroke="url(#WOOD)" stroke-width="5" stroke-linecap="round" ${OUT}/>
     <path ${S()} d="M58 36 L42 26 L44 36 L42 46 Z"/>
     <path ${ARC(3)} d="M6 22 H18 M4 50 H16 M8 30 H16"/>`),
  "Cilada": tile("archer", "cilada", STEEL + GOLD,
    `<path ${S()} d="M32 8 L38 18 L50 14 L46 26 L58 32 L46 38 L50 50 L38 46 L32 58 L26 46 L14 50 L18 38 L6 32 L18 26 L14 14 L26 18 Z"/>
     <circle cx="32" cy="33" r="9" fill="url(#GOLD)" ${OUT}/>
     <circle cx="32" cy="33" r="3" fill="#05080d"/>`),
  "Chuva": tile("archer", "chuva", STEEL + WOOD,
    `<path d="M14 14 L36 44" stroke="url(#WOOD)" stroke-width="3" ${OUT}/><path ${S()} d="M40 48 L32 44 L42 40 Z"/>
     <path d="M32 10 L52 40" stroke="url(#WOOD)" stroke-width="3" ${OUT}/><path ${S()} d="M56 44 L48 40 L57 36 Z"/>
     <path d="M8 26 L26 56" stroke="url(#WOOD)" stroke-width="3" ${OUT}/><path ${S()} d="M30 60 L22 56 L31 52 Z"/>`),
  "Salva Final": tile("archer", "salva", STEEL + WOOD,
    `<ellipse cx="32" cy="50" rx="24" ry="5" fill="#ffe27a" opacity=".35"/>
     <path d="M14 8 V46 M26 4 V42 M38 8 V46 M50 4 V42" stroke="url(#WOOD)" stroke-width="3" ${OUT}/>
     <path ${S()} d="M11 46 L14 56 L17 46 Z M23 42 L26 52 L29 42 Z M35 46 L38 56 L41 46 Z M47 42 L50 52 L53 42 Z"/>`),

  // ----- Clérigo (dourado e luz)
  "Raio": tile("cleric", "raio", GOLD + LIGHT,
    `<path ${S("LIGHT")} d="M38 6 L16 36 H30 L24 58 L48 26 H34 L42 6 Z"/>
     <path d="M36 14 L24 32" stroke="#fff" stroke-opacity=".7" stroke-width="2"/>`),
  "Cura em Área": tile("cleric", "curaarea", GOLD + LIGHT,
    `<circle cx="32" cy="34" r="20" fill="none" stroke="url(#GOLD)" stroke-width="3" stroke-dasharray="6 5"/>
     <circle cx="32" cy="34" r="12" fill="none" stroke="url(#LIGHT)" stroke-width="2" opacity=".7"/>
     <path ${S("LIGHT")} d="M28 20 H36 V28 H44 V36 H36 V44 H28 V36 H20 V28 H28 Z"/>`),
  "Cura Focada": tile("cleric", "curafocada", GOLD + LIGHT,
    `<path ${S("LIGHT")} d="M32 52 C12 38 8 26 13 20 C18 13 28 14 32 22 C36 14 46 13 51 20 C56 26 52 38 32 52 Z"/>
     <path d="M32 26 V42 M24 34 H40" stroke="#c08a2a" stroke-width="5" stroke-linecap="round"/>
     <path d="M32 26 V42 M24 34 H40" stroke="#fff6d6" stroke-width="2" stroke-linecap="round"/>`),
  "Compressor de Ar": tile("cleric", "compressor", STEEL + GOLD,
    `<path ${ARC(4)} d="M10 22 C22 10 44 12 50 26"/>
     <path ${ARC(4)} d="M14 42 C24 54 42 52 52 40"/>
     <path ${S("GOLD")} d="M30 30 L36 30 L36 24 L44 32 L36 40 L36 34 L30 34 L22 32 Z" opacity=".95"/>`),
  "Julgamento": tile("cleric", "julgamento", GOLD,
    `<path d="M32 10 V52 M18 52 H46" stroke="url(#GOLD)" stroke-width="4" stroke-linecap="round" ${OUT}/>
     <path d="M12 22 H52" stroke="url(#GOLD)" stroke-width="4" stroke-linecap="round" ${OUT}/>
     <path ${S("GOLD")} d="M8 30 L16 22 L24 30 Z M40 30 L48 22 L56 30 Z"/>
     <circle cx="32" cy="10" r="4" fill="url(#LIGHT)"/>`),
  "Luz Divina": tile("cleric", "luz", LIGHT,
    `<path d="M32 4 L36 20 L52 12 L44 28 L60 32 L44 36 L52 52 L36 44 L32 60 L28 44 L12 52 L20 36 L4 32 L20 28 L12 12 L28 20 Z" fill="url(#LIGHT)" ${OUT} opacity=".95"/>
     <circle cx="32" cy="32" r="9" fill="#fff"/>`),

  // ----- Mago (roxo e fogo/arcano)
  "Dardo Arcano": tile("mage", "dardo", LIGHT,
    `<circle cx="42" cy="22" r="10" fill="url(#LIGHT)" ${OUT}/>
     <circle cx="42" cy="22" r="4" fill="#fff"/>
     <path d="M32 32 L10 54" stroke="url(#LIGHT)" stroke-width="5" stroke-linecap="round" opacity=".8"/>
     <path d="M26 30 L8 36 M30 38 L12 46" stroke="#e9dcff" stroke-width="2" stroke-linecap="round" opacity=".6"/>
     <ellipse cx="42" cy="22" rx="18" ry="6" fill="none" stroke="#e9dcff" stroke-width="2" stroke-opacity=".7" transform="rotate(-30 42 22)"/>`),
  "Bola de Fogo": tile("mage", "bolafogo", FIRE,
    `<path ${S("FIRE")} d="M32 6 C40 16 52 22 50 38 C48 52 40 58 32 58 C22 58 14 52 14 40 C14 30 22 26 24 18 C30 24 30 30 32 32 C34 24 34 14 32 6 Z"/>
     <path d="M32 26 C38 32 42 38 40 46 C38 52 26 52 24 46 C22 40 28 36 32 26 Z" fill="#fff2a8" opacity=".9"/>`),
  "Relâmpago": tile("mage", "relampago", LIGHT,
    `<path ${S("LIGHT")} d="M40 6 L20 34 H32 L22 58 L46 26 H34 L42 6 Z" opacity=".95"/>
     <path d="M26 40 L14 52 M46 14 L56 8" stroke="#ffe27a" stroke-width="2.5" stroke-linecap="round"/>`),
  "Chuva de Fogo": tile("mage", "chuvafogo", FIRE,
    `<path ${S("FIRE")} d="M16 20 C10 30 12 42 18 46 C26 46 28 34 24 26 C22 22 18 20 16 20 Z"/>
     <path ${S("FIRE")} d="M34 8 C28 20 30 34 36 38 C44 38 46 26 42 18 C40 14 36 10 34 8 Z"/>
     <path ${S("FIRE")} d="M46 34 C40 44 42 54 48 58 C56 56 56 46 52 40 C50 37 48 35 46 34 Z"/>`),
  "Meteoro": tile("mage", "meteoro", FIRE,
    `<path d="M42 42 L8 8" stroke="url(#FIRE)" stroke-width="9" stroke-linecap="round" opacity=".5"/>
     <path d="M42 42 L14 14" stroke="url(#FIRE)" stroke-width="4" stroke-linecap="round" opacity=".7"/>
     <circle cx="42" cy="42" r="15" fill="url(#FIRE)" ${OUT}/>
     <circle cx="37" cy="37" r="4" fill="#5a2a0a" opacity=".5"/><circle cx="46" cy="46" r="3" fill="#5a2a0a" opacity=".4"/>`),

  // ----- Neutro
  "Esquiva": tile("neutro", "esquiva", STEEL,
    `<path ${ARC(4)} d="M10 24 C24 14 40 16 54 26"/>
     <path ${ARC(4)} d="M14 36 C28 28 42 30 54 38"/>
     <path ${ARC(4)} d="M18 48 C30 42 40 44 50 50"/>`),
};

/** arte da habilidade pelo nome, ou undefined (aí a HUD usa o ícone pequeno de antes) */
export function skillArt(name: string): string | undefined {
  return ART[name];
}
