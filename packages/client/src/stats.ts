import { isTypingTarget } from "./keys";
/**
 * Painel de desenvolvimento no canto superior direito: FPS e ping.
 * - FPS: contado aqui mesmo (quadros que o navegador realmente desenhou por segundo).
 * - Ping: ida e volta até o servidor (mensagem "ping" com carimbo de tempo, devolvida em "pong"), medido a cada 2 s.
 * Liga/desliga com a tecla F3 (a escolha fica salva). Na URL: ?stats=0 esconde e ?stats=1 mostra.
 * Para publicar sem o painel por padrão, defina VITE_SHOW_STATS=0 na montagem do site.
 */
export interface Stats {
  /** chame quando chegar a resposta do servidor (Evt.Pong), com o mesmo t enviado */
  onPong(t: number): void;
  destroy(): void;
}

const KEY = "frixep_stats";
const CSS = `
.st{position:fixed;top:max(66px,calc(env(safe-area-inset-top) + 62px));right:14px;z-index:18;padding:5px 9px;border-radius:5px;pointer-events:none;
  font:600 11px/1.5 ui-monospace,Consolas,"Courier New",monospace;letter-spacing:.02em;color:#bcd8f5;text-align:right;white-space:nowrap;
  background:rgba(6,12,20,.72);border:1px solid rgba(160,200,240,.22)}
.st b{font-weight:700}
.st.off{display:none}
`;
const color = (v: number, good: number, ok: number, invert = false) => {
  const bad = invert ? v < ok : v > ok;
  const mid = invert ? v < good : v > good;
  return bad ? "#ff6a5a" : mid ? "#ffd45e" : "#7dff9a";
};

export function mountStats(opts: { sendPing(t: number): void }): Stats {
  const q = new URLSearchParams(location.search).get("stats");
  let saved: string | null = null;
  try { saved = localStorage.getItem(KEY); } catch { /* ignore */ }
  const defaultOn = (import.meta.env.VITE_SHOW_STATS as string | undefined) !== "0";
  let on = q === "1" ? true : q === "0" ? false : saved ? saved === "on" : defaultOn;

  const style = document.createElement("style");
  style.textContent = CSS;
  document.head.append(style);
  const el = document.createElement("div");
  el.className = "st";
  el.setAttribute("aria-hidden", "true");
  document.body.append(el);

  let fps = 0;
  let ping = -1;
  let best = Infinity;
  const render = () => {
    el.classList.toggle("off", !on);
    if (!on) return;
    const f = `<b style="color:${color(fps, 40, 25, true)}">${fps}</b> FPS`;
    const p = ping < 0 ? "<b>--</b> ms" : `<b style="color:${color(ping, 90, 180)}">${Math.round(ping)}</b> ms`;
    el.innerHTML = `${f}<br>${p} ping`;
  };

  // FPS: média de 1 segundo
  let frames = 0;
  let t0 = performance.now();
  let raf = 0;
  const tick = (now: number) => {
    raf = requestAnimationFrame(tick);
    frames++;
    if (now - t0 >= 1000) {
      fps = Math.round((frames * 1000) / (now - t0));
      frames = 0;
      t0 = now;
      render();
    }
  };
  raf = requestAnimationFrame(tick);

  // ping: a cada 2 s, e uma vez logo no começo
  const send = () => { if (document.visibilityState === "visible") opts.sendPing(performance.now()); };
  const timer = window.setInterval(send, 2000);
  send();

  const onKey = (e: KeyboardEvent) => {
    if (e.code !== "F3" || e.repeat || isTypingTarget()) return;
    e.preventDefault();
    on = !on;
    try { localStorage.setItem(KEY, on ? "on" : "off"); } catch { /* ignore */ }
    render();
  };
  window.addEventListener("keydown", onKey);
  render();

  return {
    onPong(t) {
      const rtt = performance.now() - t;
      if (!Number.isFinite(rtt) || rtt < 0 || rtt > 60_000) return; // resposta atrasada ou inválida
      // suaviza um pouco (média móvel) para o número não pular a cada medição
      ping = ping < 0 ? rtt : ping * 0.6 + rtt * 0.4;
      best = Math.min(best, rtt);
      render();
    },
    destroy() {
      cancelAnimationFrame(raf);
      clearInterval(timer);
      window.removeEventListener("keydown", onKey);
      el.remove();
      style.remove();
    },
  };
}
