/**
 * Layout compacto da interface no celular (modo de toque).
 * Um único lugar reúne as regras que reposicionam os blocos de HUD, bolsa, carteira, grupo e chat para liberar o centro da tela,
 * com escala escolhida pelo jogador (pequena, média, grande) guardada em localStorage.
 * Tudo vale só com `body.mob`; no computador nada muda.
 */

const KEY = "frixep_hud_scale";
export const HUD_SCALES = [
  { id: "s", label: "Pequena", v: 0.85 },
  { id: "m", label: "Média", v: 1 },
  { id: "l", label: "Grande", v: 1.2 },
] as const;
type ScaleId = (typeof HUD_SCALES)[number]["id"];

const SAFE_T = "max(8px,env(safe-area-inset-top))";
const SAFE_L = "max(8px,env(safe-area-inset-left))";
const SAFE_R = "max(8px,env(safe-area-inset-right))";
const SAFE_B = "max(6px,env(safe-area-inset-bottom))";

const CSS = `
body.mob{--hs:1}
/* ---------- canto superior esquerdo: retrato + barras num bloco enxuto ---------- */
body.mob .hd-unit{left:${SAFE_L};top:${SAFE_T};width:calc(150px*var(--hs));gap:calc(6px*var(--hs));opacity:.94}
body.mob .hd-pwrap{width:calc(44px*var(--hs));height:calc(44px*var(--hs))}
body.mob .hd-portrait{border-width:2px;border-radius:9px}
body.mob .hd-lvb{min-width:calc(18px*var(--hs));height:calc(15px*var(--hs));right:-5px;bottom:-5px;font-size:calc(10px*var(--hs));border-width:2px;border-radius:5px}
body.mob .hd-riv{width:4px;height:4px}
body.mob .hd-gem{width:10px;height:10px;top:-7px;margin-left:-5px}
body.mob .hd-bars{gap:calc(3px*var(--hs));padding-top:0}
body.mob .hd-name{font-size:calc(9px*var(--hs));letter-spacing:.1em}
body.mob .hd-name small,body.mob .hd-meter>.ic,body.mob .hd-buff{display:none}
body.mob .hd-track{height:calc(10px*var(--hs));border-radius:5px}
body.mob .hd-txt{font-size:calc(7px*var(--hs));letter-spacing:.06em}
body.mob .hd-hp .hd-track{height:calc(14px*var(--hs))}
body.mob .hd-hp .hd-txt{font-size:calc(9px*var(--hs));letter-spacing:.03em}
body.mob .hd-tr .hd-thin{height:calc(3px*var(--hs))}
body.mob .hd-tt{font-size:calc(7px*var(--hs))}
body.mob .hd-shd{font-size:calc(7px*var(--hs));letter-spacing:.12em}
body.mob .hd-tr .hd-txt{letter-spacing:.08em}
body.mob .hd-pvp{left:${SAFE_L};top:calc(${SAFE_T} + 70px*var(--hs));height:calc(26px*var(--hs));padding:0 8px 0 6px;font-size:calc(9px*var(--hs));gap:4px;border-radius:8px;opacity:.82}
body.mob .hd-pvp.on,body.mob .hd-pvp.chan{opacity:1}
body.mob .hd-pvp svg{width:12px;height:12px}
body.mob .hd-alert{top:${SAFE_T};max-width:calc(100vw - 300px);font-size:11px;padding:6px 10px;text-align:center} /* aviso no centro da faixa de cima: fica entre o canto esquerdo e os botões da direita */
body.mob .hd-lv{left:${SAFE_L};bottom:calc(max(2px,env(safe-area-inset-bottom)) + 7px);font-size:8px;opacity:.7}
/* ---------- canto inferior direito: arco de botões compacto sob o polegar ---------- */
body.mob .hd.touch .hd-bar{right:${SAFE_R};bottom:calc(${SAFE_B} + 10px);transform:scale(calc(.82*var(--hs)));transform-origin:100% 100%}
body.mob .hd.touch .hd-btn{opacity:.86;border-width:2px;transition:transform .08s,filter .08s,opacity .15s}
body.mob .hd.touch .hd-btn:active{transform:scale(.88);filter:brightness(1.45);opacity:1;box-shadow:inset 0 0 0 2px rgba(255,225,160,.55),0 0 18px rgba(255,190,90,.7)}
body.mob .hd.touch .hd-btn.cool{opacity:.7}
body.mob .hd.touch .hd-chan{bottom:calc(${SAFE_B} + 190px*var(--hs));left:50%;width:min(220px,48vw)}
/* prioridade de alvo (< e >): fica logo à esquerda da barra de habilidades, escalada junto com ela (sem cobrir os botões) */
body.mob .hd.touch .hd-tm-low{right:calc(100% + 6px);bottom:4px}
body.mob .hd.touch .hd-tm-near{right:calc(100% + 6px);bottom:40px}
/* ---------- canto superior direito: menu, bolsa, carteira (menores e translúcidos) ---------- */
body.mob .gm-btn,body.mob .iv-btn,body.mob .ut-btn{top:${SAFE_T};width:calc(36px*var(--hs));height:calc(36px*var(--hs));opacity:.85;backdrop-filter:none;-webkit-backdrop-filter:none}
body.mob .gm-btn svg,body.mob .iv-btn svg,body.mob .ut-btn svg{width:calc(18px*var(--hs));height:calc(18px*var(--hs))}
body.mob .gm-btn{right:${SAFE_R}}
body.mob .iv-btn{right:calc(max(8px,env(safe-area-inset-right)) + 42px*var(--hs))}
body.mob .ut-btn{right:calc(max(8px,env(safe-area-inset-right)) + 84px*var(--hs))}
body.mob .ut-pop{top:calc(${SAFE_T} + 42px*var(--hs));right:${SAFE_R}}
body.mob .ec-wallet{top:calc(${SAFE_T} + 42px*var(--hs));right:${SAFE_R};height:calc(22px*var(--hs));padding:0 8px;gap:8px;font-size:calc(11px*var(--hs));opacity:.8;backdrop-filter:none;-webkit-backdrop-filter:none}
body.mob .ec-wallet img,body.mob .ec-wallet .ec-coin{width:calc(14px*var(--hs));height:calc(14px*var(--hs))}
/* métricas (FPS/ping/online): canto direito, logo abaixo da carteira, em linhas curtas; longe da barra de habilidades e do joystick */
body.mob .st{top:calc(${SAFE_T} + 70px*var(--hs));right:${SAFE_R};left:auto;bottom:auto;transform:none;padding:3px 6px;font-size:9px;line-height:1.3;opacity:.8;text-align:right}
/* ---------- grupo: recolhido sob o PvP ---------- */
body.mob .pt{top:calc(${SAFE_T} + 98px*var(--hs));left:${SAFE_L};width:min(220px,52vw)}
body.mob .pt-tog{width:calc(26px*var(--hs));height:calc(26px*var(--hs));font-size:15px;opacity:.7}
body.mob .pt-tg-chip{left:calc(${SAFE_L} + 170px*var(--hs));top:${SAFE_T};height:calc(38px*var(--hs));gap:calc(5px*var(--hs))}
body.mob .pt-tg-chip .pt-lv{min-width:calc(20px*var(--hs));height:calc(20px*var(--hs));font-size:calc(10px*var(--hs))}
body.mob .pt-tg-chip .nm{font-size:calc(10px*var(--hs));max-width:calc(120px*var(--hs))}
body.mob .pt-tg-chip .sub{font-size:calc(8px*var(--hs))}
/* ---------- chat: botão discreto sobre o joystick; o histórico só aparece quando aberto ---------- */
body.mob .ch{left:${SAFE_L};bottom:calc(${SAFE_B} + 150px);width:min(300px,calc(100vw - 190px))}
body.mob .ch-btn{width:calc(34px*var(--hs));height:calc(34px*var(--hs));border-radius:9px;opacity:.78}
body.mob .ch-btn svg{width:18px;height:18px}
body.mob .ch-log{max-height:90px}
/* ---------- aviso "Falar com..." menor, fora do centro ---------- */
body.mob .ec-near{left:${SAFE_L};transform:none;bottom:calc(${SAFE_B} + 196px);max-width:calc(100vw - 190px);min-height:34px;padding:0 12px;font-size:11px;letter-spacing:.06em;line-height:1.15;border-radius:17px;opacity:.94}
@media (orientation:landscape){
  body.mob .ch{bottom:calc(${SAFE_B} + 112px);width:min(300px,38vw)}
  body.mob .ch-log{max-height:64px}
  body.mob .ec-near{bottom:calc(${SAFE_B} + 112px);left:calc(max(8px,env(safe-area-inset-left)) + 44px*var(--hs));max-width:34vw}
  body.mob .hd.touch .hd-chan{bottom:calc(${SAFE_B} + 20px);left:50%}
}
/* escolha da escala no menu (só no celular) */
.gm-hs{display:none}
body.mob .gm-hs{display:block}
`;

/**
 * Fator extra por orientação, somado à escala escolhida pelo jogador.
 * Na vertical a tela é estreita (o HUD disputa a largura com o centro); na horizontal é baixa (o HUD disputa a altura).
 */
const ORIENT_K = { portrait: 0.9, landscape: 0.8 };
const LANDSCAPE = "(orientation:landscape)";

let scaleId: ScaleId = "m";
try {
  const s = localStorage.getItem(KEY);
  if (s === "s" || s === "m" || s === "l") scaleId = s;
} catch { /* sem armazenamento: usa a média */ }

function apply() {
  const v = HUD_SCALES.find((s) => s.id === scaleId)!.v;
  const land = typeof matchMedia === "function" && matchMedia(LANDSCAPE).matches;
  document.body.style.setProperty("--hs", String(v * (land ? ORIENT_K.landscape : ORIENT_K.portrait)));
}

export function hudScaleLabel(): string {
  return HUD_SCALES.find((s) => s.id === scaleId)!.label;
}

/** passa para o próximo tamanho (pequena → média → grande) e guarda a escolha */
export function cycleHudScale(): string {
  const i = HUD_SCALES.findIndex((s) => s.id === scaleId);
  scaleId = HUD_SCALES[(i + 1) % HUD_SCALES.length].id;
  try { localStorage.setItem(KEY, scaleId); } catch { /* ignora */ }
  apply();
  return hudScaleLabel();
}

let styled = false;
let watching = false;
/** liga ou desliga o layout compacto do celular */
export function setMobileUi(on: boolean) {
  if (!styled) {
    styled = true;
    const st = document.createElement("style");
    st.textContent = CSS;
    document.head.append(st); // por último no <head>: vence as regras dos outros módulos em empate de especificidade
  }
  if (!watching && typeof matchMedia === "function") { // girar o aparelho recalcula o tamanho
    watching = true;
    try { matchMedia(LANDSCAPE).addEventListener("change", apply); } catch { /* navegador antigo: fica com o tamanho da abertura */ }
  }
  document.body.classList.toggle("mob", on);
  apply();
}
