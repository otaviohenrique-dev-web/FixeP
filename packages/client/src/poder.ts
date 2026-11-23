/**
 * PODER TOTAL na tela: animação do número (verde ao subir, vermelho ao cair) e a prévia ao equipar.
 * O cliente NÃO decide o poder: o valor oficial vem do servidor; a prévia usa a MESMA função compartilhada
 * (poderDoEquipamento) só para mostrar a diferença antes de equipar. Respeita prefers-reduced-motion.
 */
import { poderDoEquipamento, type CharClass, type EquipSlot, type ItemDef } from "@frixep/shared";

const CSS = `
.pw-host{position:relative}
.pw-n{transition:color .9s ease,text-shadow .9s ease}
.pw-host.pw-up .pw-n{color:#7dd68a!important;text-shadow:0 0 12px rgba(61,255,122,.8)!important}
.pw-host.pw-dn .pw-n{color:#ff8f7e!important;text-shadow:0 0 12px rgba(255,70,60,.8)!important}
.pw-float{position:absolute;left:50%;top:-6px;transform:translate(-50%,0);font:700 12px/1 Georgia,serif;pointer-events:none;white-space:nowrap;
  animation:pwFloat 1.1s ease-out forwards;z-index:5}
.pw-float.up{color:#7dd68a;text-shadow:0 1px 3px #000}
.pw-float.dn{color:#ff8f7e;text-shadow:0 1px 3px #000}
@keyframes pwFloat{from{opacity:0;transform:translate(-50%,6px)}15%{opacity:1}to{opacity:0;transform:translate(-50%,-22px)}}
@media (prefers-reduced-motion:reduce){.pw-float{animation:none;opacity:0}.pw-n{transition:none}}
`;
let styled = false;
function ensureStyle() {
  if (styled || typeof document === "undefined") return;
  styled = true;
  const st = document.createElement("style");
  st.textContent = CSS;
  document.head.append(st);
}

const reduced = () => typeof window !== "undefined" && (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false);
export const fmtPoder = (n: number) => n.toLocaleString("pt-BR");
export const fmtDelta = (d: number) => `${d > 0 ? "+" : d < 0 ? "−" : ""}${Math.abs(d)}`;

const DUR_MS = 550; // contagem do número
const FLASH_MS = 1000; // brilho que volta ao normal

/**
 * Atualiza o número do poder. `from` é o valor anterior (null na primeira vez: aparece direto).
 * Sobe/cai contando, com brilho verde/vermelho e um "+8"/"−5" flutuando sobre `host`.
 * Com movimento reduzido, só troca o texto.
 */
export function animatePoder(el: HTMLElement, from: number | null, to: number, host: HTMLElement = el): void {
  ensureStyle();
  const prev = (el as HTMLElement & { _pwRaf?: number })._pwRaf;
  if (prev) cancelAnimationFrame(prev);
  if (from === null || from === to || reduced()) { el.textContent = fmtPoder(to); return; }
  const up = to > from;
  const d = to - from;
  host.classList.remove("pw-up", "pw-dn");
  void host.offsetWidth; // reinicia o brilho se já estava ligado
  host.classList.add(up ? "pw-up" : "pw-dn");
  const f = document.createElement("span");
  f.className = `pw-float ${up ? "up" : "dn"}`;
  f.textContent = fmtDelta(d);
  host.append(f);
  setTimeout(() => f.remove(), 1200);
  setTimeout(() => host.classList.remove("pw-up", "pw-dn"), FLASH_MS);
  const t0 = performance.now();
  const step = (now: number) => {
    const k = Math.min(1, (now - t0) / DUR_MS);
    const e = 1 - Math.pow(1 - k, 3); // desaceleração suave
    el.textContent = fmtPoder(Math.round(from + d * e));
    if (k < 1) (el as HTMLElement & { _pwRaf?: number })._pwRaf = requestAnimationFrame(step);
    else el.textContent = fmtPoder(to);
  };
  (el as HTMLElement & { _pwRaf?: number })._pwRaf = requestAnimationFrame(step);
}

/**
 * Prévia: quanto o poder mudaria se `def` for equipado no seu slot (o item que estiver nele sai).
 * Itens de consumo não têm poder. Devolve a diferença (0 = igual, negativo = piora).
 */
export function previewPoderDelta(cls: CharClass, level: number, equip: Record<EquipSlot, string | null>, def: ItemDef): number | null {
  if (def.kind === "potion") return null;
  const slot = def.kind as EquipSlot;
  if (!(slot in equip)) return null;
  const sim = { ...equip, [slot]: def.id };
  return poderDoEquipamento(cls, level, sim) - poderDoEquipamento(cls, level, equip);
}
