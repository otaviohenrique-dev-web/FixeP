/**
 * Joystick virtual flutuante para o celular: o polegar esquerdo toca em qualquer ponto da metade de baixo, à esquerda,
 * e a base aparece ali. Arrastar indica a direção; soltar para. Assim ninguém precisa tocar no campo de visão para andar.
 * Só reage a toque (pointerType "touch"); o mouse continua clicando no chão.
 */

export interface Joystick {
  /** direção atual em pixels de tela (já limitada ao raio), ou null com o polegar solto */
  vector(): { x: number; y: number; mag: number } | null;
  destroy(): void;
}

const CSS = `
.js-zone{position:fixed;left:0;bottom:0;width:52vw;height:62vh;z-index:14;touch-action:none;-webkit-tap-highlight-color:transparent;display:none}
.js-zone.on{display:block}
.js-base{position:fixed;z-index:14;width:96px;height:96px;margin:-48px 0 0 -48px;border-radius:50%;pointer-events:none;display:none;
  background:radial-gradient(circle,rgba(12,18,28,.22),rgba(12,18,28,.42));border:2px solid rgba(201,164,92,.55);box-shadow:0 0 0 1px #000,inset 0 0 14px rgba(0,0,0,.6)}
.js-knob{position:absolute;left:50%;top:50%;width:40px;height:40px;margin:-20px 0 0 -20px;opacity:.9;border-radius:50%;background:linear-gradient(180deg,#3a4d6e,#172235);border:2px solid #c9a45c;box-shadow:0 3px 8px rgba(0,0,0,.6)}
.js-rest{position:fixed;z-index:13;left:max(34px,env(safe-area-inset-left));bottom:calc(max(10px,env(safe-area-inset-bottom)) + 42px);width:84px;height:84px;border-radius:50%;pointer-events:none;display:none;
  border:2px dashed rgba(201,164,92,.22)}
.js-rest.on{display:block}
`;

export function mountJoystick(): Joystick & { setEnabled(on: boolean): void } {
  const style = document.createElement("style");
  style.textContent = CSS;
  document.head.append(style);

  const zone = document.createElement("div");
  zone.className = "js-zone";
  const rest = document.createElement("div"); // dica discreta de onde tocar
  rest.className = "js-rest";
  const base = document.createElement("div");
  base.className = "js-base";
  const knob = document.createElement("div");
  knob.className = "js-knob";
  base.append(knob);
  document.body.append(zone, rest, base);

  const R = 42; // raio útil em px
  let id = -1;
  let ox = 0;
  let oy = 0;
  let vx = 0;
  let vy = 0;
  let mag = 0;

  const end = () => {
    id = -1;
    vx = vy = mag = 0;
    base.style.display = "none";
    knob.style.transform = "";
  };
  const move = (e: PointerEvent) => {
    let dx = e.clientX - ox;
    let dy = e.clientY - oy;
    const d = Math.hypot(dx, dy);
    if (d > R) { dx = (dx / d) * R; dy = (dy / d) * R; }
    vx = dx; vy = dy; mag = Math.min(1, d / R);
    knob.style.transform = `translate(${dx}px,${dy}px)`;
  };
  zone.addEventListener("pointerdown", (e) => {
    if (e.pointerType !== "touch" || id !== -1) return;
    e.preventDefault();
    id = e.pointerId;
    try { zone.setPointerCapture(id); } catch { /* sem captura: os eventos continuam chegando enquanto o dedo estiver na zona */ }
    ox = e.clientX; oy = e.clientY;
    base.style.left = `${ox}px`;
    base.style.top = `${oy}px`;
    base.style.display = "block";
    move(e);
  });
  zone.addEventListener("pointermove", (e) => { if (e.pointerId === id) move(e); });
  for (const t of ["pointerup", "pointercancel", "lostpointercapture"] as const) zone.addEventListener(t, (e) => { if ((e as PointerEvent).pointerId === id) end(); });

  return {
    vector: () => (id === -1 || mag < 0.25 ? null : { x: vx, y: vy, mag }), // zona morta: toque leve não anda
    setEnabled(on) {
      zone.classList.toggle("on", on);
      rest.classList.toggle("on", on);
      if (!on) end();
    },
    destroy() { zone.remove(); rest.remove(); base.remove(); style.remove(); },
  };
}
