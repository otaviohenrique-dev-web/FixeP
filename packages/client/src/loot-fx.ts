import { RARITY_COLOR, RARITY_NAME, rarityIndex, type ItemDef, type Rarity } from "@frixep/shared";

/**
 * Animação no centro da tela quando cai equipamento raro ou melhor. A intensidade cresce com a raridade:
 * raro (azul, anel de brilho), épico (dourado, raios radiantes), lendário (vermelho, chamas e anéis), mítico (púrpura pulsante, estrelas).
 * Só visual: o servidor já decidiu o item.
 */
const CSS = `
.rv{position:fixed;left:50%;top:26%;transform:translate(-50%,-50%);z-index:26;pointer-events:none;text-align:center;width:min(92vw,420px);height:260px;display:grid;place-items:center;font-family:"Cinzel",Georgia,serif}
.rv *{pointer-events:none}
.rv-aura,.rv-rays,.rv-ring{position:absolute;left:50%;top:50%;border-radius:50%;transform:translate(-50%,-50%)}
.rv-aura{width:240px;height:240px;background:radial-gradient(circle,color-mix(in srgb,var(--c) 70%,transparent) 0%,color-mix(in srgb,var(--c) 28%,transparent) 42%,transparent 70%);animation:rv-aura var(--d) ease-out forwards}
.rv-rays{width:380px;height:380px;background:repeating-conic-gradient(from 0deg,color-mix(in srgb,var(--c) 80%,transparent) 0 6deg,transparent 6deg 18deg);
  -webkit-mask:radial-gradient(circle,#000 0%,transparent 68%);mask:radial-gradient(circle,#000 0%,transparent 68%);animation:rv-rays var(--d) linear forwards}
.rv-ring{width:60px;height:60px;border:3px solid var(--c);box-shadow:0 0 18px var(--c),inset 0 0 14px var(--c);opacity:0;animation:rv-ring 1.3s ease-out forwards;animation-delay:var(--dl,0s)}
.rv-spark{position:absolute;left:50%;top:50%;width:5px;height:5px;border-radius:50%;background:var(--c);box-shadow:0 0 8px var(--c);opacity:0;animation:rv-spark var(--sd) ease-out forwards;animation-delay:var(--sl)}
.rv-txt{position:relative;display:flex;flex-direction:column;gap:4px;align-items:center;animation:rv-pop var(--d) ease-out forwards}
.rv-tier{font-size:12px;font-weight:700;letter-spacing:.5em;text-transform:uppercase;color:var(--c);text-shadow:0 0 12px var(--c),0 2px 4px #000}
.rv-name{font-size:21px;font-weight:700;letter-spacing:.06em;color:#fff;text-shadow:0 0 14px var(--c),0 0 4px var(--c),0 2px 6px #000;max-width:92vw}
.rv.t3 .rv-name,.rv.t4 .rv-name,.rv.t5 .rv-name{font-size:26px}
.rv.t5 .rv-aura{animation:rv-pulse 1.1s ease-in-out infinite,rv-fade var(--d) linear forwards}
.rv.t4 .rv-aura{animation:rv-flick .22s steps(2) infinite,rv-fade var(--d) linear forwards}
@keyframes rv-aura{0%{opacity:0;transform:translate(-50%,-50%) scale(.3)}25%{opacity:1;transform:translate(-50%,-50%) scale(1)}100%{opacity:0;transform:translate(-50%,-50%) scale(1.25)}}
@keyframes rv-rays{0%{opacity:0;transform:translate(-50%,-50%) rotate(0) scale(.5)}20%{opacity:.9}100%{opacity:0;transform:translate(-50%,-50%) rotate(60deg) scale(1.1)}}
@keyframes rv-ring{0%{opacity:.95;transform:translate(-50%,-50%) scale(.4)}100%{opacity:0;transform:translate(-50%,-50%) scale(4.6)}}
@keyframes rv-spark{0%{opacity:0;transform:translate(-50%,-50%)}15%{opacity:1}100%{opacity:0;transform:translate(calc(-50% + var(--dx)),calc(-50% + var(--dy)))}}
@keyframes rv-pop{0%{opacity:0;transform:scale(.6)}10%{opacity:1;transform:scale(1.18)}18%{transform:scale(1)}82%{opacity:1}100%{opacity:0;transform:translateY(-14px)}}
@keyframes rv-pulse{0%,100%{transform:translate(-50%,-50%) scale(.9);filter:brightness(1)}50%{transform:translate(-50%,-50%) scale(1.22);filter:brightness(1.5)}}
@keyframes rv-flick{0%{transform:translate(-50%,-50%) scale(1);filter:brightness(1)}50%{transform:translate(-50%,-50%) scale(1.08);filter:brightness(1.35)}}
@keyframes rv-fade{0%,80%{opacity:1}100%{opacity:0}}
@media (prefers-reduced-motion:reduce){.rv-rays,.rv-ring,.rv-spark{display:none}.rv .rv-aura{animation:rv-aura var(--d) ease-out forwards!important}}
`;

let style: HTMLStyleElement | null = null;
let current: HTMLElement | null = null;
let timer: ReturnType<typeof setTimeout> | undefined;

/** duração, quantidade de faíscas, raios e anéis por raridade (índice 2 = raro ... 5 = mítico) */
const TIER = [
  null, null,
  { d: 2.2, sparks: 10, rays: false, rings: 1 },
  { d: 3.2, sparks: 24, rays: true, rings: 2 },
  { d: 4.0, sparks: 36, rays: true, rings: 3 },
  { d: 5.0, sparks: 48, rays: true, rings: 4 },
] as const;

export function showRarityReveal(title: string, rarity: Rarity, sub?: string): void {
  const t = rarityIndex(rarity);
  const cfg = TIER[t];
  if (!cfg) return; // comum e incomum só ganham o aviso normal
  if (!style) { style = document.createElement("style"); style.textContent = CSS; document.head.append(style); }
  clearTimeout(timer);
  current?.remove();
  const el = document.createElement("div");
  el.className = `rv t${t}`;
  el.style.setProperty("--c", RARITY_COLOR[rarity]);
  el.style.setProperty("--d", `${cfg.d}s`);
  el.setAttribute("role", "status");
  const mk = (cls: string, css = "") => { const d = document.createElement("div"); d.className = cls; if (css) d.style.cssText = css; el.append(d); return d; };
  mk("rv-aura");
  if (cfg.rays) mk("rv-rays");
  for (let i = 0; i < cfg.rings; i++) mk("rv-ring", `--dl:${(i * 0.32).toFixed(2)}s`);
  for (let i = 0; i < cfg.sparks; i++) {
    const a = Math.random() * Math.PI * 2, r = 90 + Math.random() * 130;
    mk("rv-spark", `--dx:${Math.cos(a) * r}px;--dy:${Math.sin(a) * r}px;--sd:${(0.9 + Math.random() * 0.9).toFixed(2)}s;--sl:${(Math.random() * 0.5).toFixed(2)}s`);
  }
  const txt = mk("rv-txt");
  const tier = document.createElement("div"); tier.className = "rv-tier"; tier.textContent = `${RARITY_NAME[rarity]}!`;
  const name = document.createElement("div"); name.className = "rv-name"; name.textContent = title; // textContent: nunca interpretar HTML
  txt.append(tier, name);
  if (sub) { const s = document.createElement("div"); s.className = "rv-tier"; s.style.cssText = "font-size:10px;opacity:.8;color:#fff"; s.textContent = sub; txt.append(s); }
  document.body.append(el);
  current = el;
  timer = setTimeout(() => { el.remove(); if (current === el) current = null; }, cfg.d * 1000 + 100);
}

/** atalho para um item recebido */
export function revealItem(def: ItemDef): void {
  showRarityReveal(def.name, def.rarity);
}
