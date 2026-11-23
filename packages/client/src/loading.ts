/**
 * Tela de carregamento dark fantasy: aparece na hora ao pisar num portal (ou ao entrar/reconectar) e só some
 * quando a zona nova está pronta. Bloqueia o ponteiro (o cena também ignora o teclado enquanto `visible`).
 * Tudo em CSS (opacity/transform), sem trabalho de JavaScript por quadro.
 */
/** dicas para o computador (teclado e mouse) */
const TIPS_PC = [
  "Poções recuperam vida: aperte F para beber a primeira da mochila.",
  "A Cidade de Brasalume é segura: sem combate, sem dano e sem PvP.",
  "Esquivar (Shift) tira você das áreas vermelhas antes do golpe cair.",
  "Zonas mais fundas são muito mais perigosas, mas soltam mais e melhores itens.",
  "Os chefes voltam algum tempo depois de caírem; o baú vale a luta.",
  "Convide aliados com /pt nome: o grupo atravessa as zonas junto.",
  "Clérigos alternam o Q entre cura em área e cura focada com a tecla Z.",
  "Guarde o que não vai usar no baú da cidade e venda o resto ao comerciante.",
  "Morrer leva você de volta à cidade; os itens equipados ficam com você.",
  "O ferreiro funde itens iguais em um de raridade maior.",
  "Troque as variações de habilidade só na cidade: aperte V para abrir o painel.",
];

/** dicas para celular e tablet (toque): só botões na tela, joystick e toques no jogo */
const TIPS_TOQUE = [
  "Poções recuperam vida: toque no botão de poção do HUD para beber a primeira da mochila.",
  "Ligue o AUTO para beber poção sozinho quando a vida cair abaixo do limite que você escolher.",
  "Arraste o dedo na área de baixo à esquerda para andar com o joystick.",
  "Toque num inimigo para travar a mira nele; toque no vazio para soltar.",
  "Segure uma habilidade para mirar e solte para lançar; arraste até o ✕ para cancelar.",
  "Esquivar tira você das áreas vermelhas antes do golpe cair: toque no botão de esquiva.",
  "Toque num NPC para conversar: se ele estiver longe, seu personagem anda até lá.",
  "Toque no botão de três linhas, no canto superior direito, para abrir o menu: Diário, Variações e mais.",
  "A mochila fica no botão da bolsa, no canto superior direito da tela.",
  "Toque no baú da cidade, quando estiver perto, para abrir.",
  "Convide aliados com /pt nome no chat: o grupo atravessa as zonas junto.",
  "A Cidade de Brasalume é segura: sem combate, sem dano e sem PvP.",
  "Zonas mais fundas são muito mais perigosas, mas soltam mais e melhores itens.",
  "Morrer leva você de volta à cidade; os itens equipados ficam com você.",
  "Guarde o que não vai usar no baú da cidade e venda o resto ao comerciante.",
  "Troque as variações de habilidade só na cidade: pelo menu (três linhas), em Variações.",
];

/** mesmo critério do jogo (src/main.ts): ponteiro grosso = toque */
const TOQUE = typeof matchMedia === "function" && matchMedia("(pointer: coarse)").matches;
const TIPS = TOQUE ? TIPS_TOQUE : TIPS_PC;

const THEME_ACCENT: Record<string, string> = { ash: "#c9a86a", frost: "#7fd0ff", crypt: "#b07aff", town: "#ffc873" };

const CSS = `
.ld{position:fixed;inset:0;z-index:9999;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:14px;
  background:radial-gradient(ellipse at 50% 60%,#1a1118 0%,#0a0709 55%,#030204 100%);color:#e8dfc4;opacity:0;visibility:hidden;pointer-events:none;
  transition:opacity .22s ease,visibility 0s linear .22s;touch-action:none;user-select:none;-webkit-user-select:none;--ac:#c9a86a}
.ld.on{opacity:1;visibility:visible;pointer-events:auto;transition:opacity .16s ease,visibility 0s}
.ld.slow{transition-duration:.45s}
.ld-sub{font:600 12px/1 "Cinzel",Georgia,serif;letter-spacing:.42em;text-transform:uppercase;color:#8d8270}
.ld-name{font:700 clamp(26px,6vw,46px)/1.1 "Cinzel",Georgia,serif;letter-spacing:.12em;text-align:center;padding:0 24px;color:#f3e8c8;text-shadow:0 0 22px var(--ac),0 2px 10px #000}
.ld-bar{position:relative;width:min(320px,70vw);height:4px;border-radius:3px;background:rgba(255,255,255,.08);overflow:hidden;margin-top:10px}
.ld-fill{position:absolute;inset:0;transform-origin:left center;transform:scaleX(.04);background:linear-gradient(90deg,#7a2a10,var(--ac),#fff3c8);box-shadow:0 0 14px var(--ac);transition:transform .35s ease-out}
.ld-tip{max-width:min(460px,84vw);text-align:center;font:italic 400 14px/1.45 Georgia,serif;color:#a89c84;min-height:42px;margin-top:6px}
.ld-embers{position:absolute;inset:0;overflow:hidden;pointer-events:none}
.ld-embers i{position:absolute;bottom:-8px;width:3px;height:3px;border-radius:50%;background:var(--ac);box-shadow:0 0 8px 2px var(--ac);opacity:0;will-change:transform,opacity;animation:ld-rise 4.2s linear infinite}
@keyframes ld-rise{0%{transform:translate3d(0,0,0);opacity:0}12%{opacity:.9}100%{transform:translate3d(var(--dx,20px),-105vh,0);opacity:0}}
@media (prefers-reduced-motion:reduce){.ld-embers i{animation:none}.ld,.ld.on{transition-duration:.01s}}
`;

export interface LoadingScreen {
  /** mostra a tela (idempotente): `zone` = nome do destino, `theme` = cor de destaque, `verb` = linha pequena de cima */
  show(opts: { zone: string; theme?: string; verb?: string }): void;
  /** 0..1 */
  progress(p: number): void;
  /** some com fade suave; `minMs` evita um piscar quando tudo já estava pronto */
  hide(minMs?: number): Promise<void>;
  readonly visible: boolean;
}

export function mountLoading(): LoadingScreen {
  const style = document.createElement("style");
  style.textContent = CSS;
  document.head.append(style);
  const root = document.createElement("div");
  root.className = "ld";
  root.setAttribute("role", "status");
  root.setAttribute("aria-live", "polite");
  const embers = document.createElement("div");
  embers.className = "ld-embers";
  for (let i = 0; i < 14; i++) {
    const e = document.createElement("i");
    e.style.left = `${(i * 97) % 100}%`;
    e.style.animationDelay = `${-(i * 0.43) % 4.2}s`;
    e.style.animationDuration = `${3.4 + (i % 5) * 0.5}s`;
    e.style.setProperty("--dx", `${((i % 7) - 3) * 14}px`);
    embers.append(e);
  }
  const sub = document.createElement("div");
  sub.className = "ld-sub";
  const name = document.createElement("div");
  name.className = "ld-name";
  const bar = document.createElement("div");
  bar.className = "ld-bar";
  const fill = document.createElement("div");
  fill.className = "ld-fill";
  bar.append(fill);
  const tip = document.createElement("div");
  tip.className = "ld-tip";
  root.append(embers, sub, name, bar, tip);
  document.body.append(root);

  let shownAt = 0;
  let on = false;
  let tipIdx = Math.floor(Math.random() * TIPS.length);

  return {
    get visible() { return on; },
    show({ zone, theme, verb }) {
      sub.textContent = verb ?? "Viajando para";
      name.textContent = zone;
      root.style.setProperty("--ac", THEME_ACCENT[theme ?? ""] ?? "#c9a86a");
      if (!on) {
        tipIdx = (tipIdx + 1) % TIPS.length;
        tip.textContent = TIPS[tipIdx];
        fill.style.transition = "none";
        fill.style.transform = "scaleX(.04)";
        void fill.offsetWidth; // reinicia a barra (um único reflow por exibição)
        fill.style.transition = "";
        root.classList.remove("slow");
        root.classList.add("on");
        on = true;
        shownAt = performance.now();
      }
    },
    progress(p) {
      fill.style.transform = `scaleX(${Math.max(0.04, Math.min(1, p))})`;
    },
    async hide(minMs = 450) {
      if (!on) return;
      const wait = shownAt + minMs - performance.now();
      if (wait > 0) await new Promise((r) => setTimeout(r, wait));
      fill.style.transform = "scaleX(1)";
      await new Promise((r) => setTimeout(r, 90));
      root.classList.add("slow");
      root.classList.remove("on");
      on = false;
    },
  };
}
