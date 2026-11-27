import { isTypingTarget } from "./keys";
import { aoMudarConfig, config } from "./config";
/**
 * Painel de desenvolvimento no canto superior direito: FPS e ping.
 * - FPS: contado aqui mesmo (quadros que o navegador realmente desenhou por segundo).
 * - Ping: ida e volta até o servidor (mensagem "ping" com carimbo de tempo, devolvida em "pong"), medido a cada 2 s.
 * - Online: quantos jogadores estão no jogo agora (o servidor manda junto com o pong).
 * Liga/desliga com a tecla F3 (a escolha fica salva). Na URL: ?stats=0 esconde e ?stats=1 mostra.
 * Para publicar sem o painel por padrão, defina VITE_SHOW_STATS=0 na montagem do site.
 */
export interface Stats {
  /** chame quando chegar a resposta do servidor (Evt.Pong), com o mesmo t enviado e a contagem de online */
  onPong(t: number, online?: number): void;
  destroy(): void;
}

const KEY = "frixep_stats";
const CSS = `
.st{position:fixed;top:max(66px,calc(env(safe-area-inset-top) + 62px));right:14px;z-index:18;padding:5px 9px;border-radius:5px;pointer-events:none;
  font:600 11px/1.5 ui-monospace,Consolas,"Courier New",monospace;letter-spacing:.02em;color:#bcd8f5;text-align:right;white-space:nowrap;
  background:rgba(6,12,20,.72);border:1px solid rgba(160,200,240,.22)}
.st b{font-weight:700}
@media (max-width:620px){.st{top:max(104px,calc(env(safe-area-inset-top) + 100px))}} /* em tela estreita a carteira desce para logo abaixo dos botões: as métricas descem junto */
.st.off{display:none}
.st .sp{display:none;font-style:normal}
.st .dot{display:inline-block;width:7px;height:7px;margin-right:6px;border-radius:50%;vertical-align:middle;background:#3ddc6b;animation:st-pulse 1.8s ease-out infinite}
@keyframes st-pulse{0%{box-shadow:0 0 0 0 rgba(61,220,107,.75)}70%,100%{box-shadow:0 0 0 7px rgba(61,220,107,0)}}
@media (prefers-reduced-motion: reduce){.st .dot{animation:none}}
`;
const color = (v: number, good: number, ok: number, invert = false) => {
  const bad = invert ? v < ok : v > ok;
  const mid = invert ? v < good : v > good;
  return bad ? "#ff6a5a" : mid ? "#ffd45e" : "#7dff9a";
};

export function mountStats(opts: { sendPing(t: number): void; game?: Phaser.Game }): Stats {
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
  let online = -1;
  let best = Infinity;
  const render = () => {
    const c = config(); // Configurações: mostrar FPS e/ou ping
    const linhas: string[] = [];
    if (c.mostrarFps) linhas.push(`<b style="color:${color(fps, 40, 25, true)}">${fps}</b> FPS`);
    if (c.mostrarPing) {
      const p = ping < 0 ? "<b>--</b> ms" : `<b style="color:${color(ping, 90, 180)}">${Math.round(ping)}</b> ms`;
      const o = online < 0 ? "" : `<br><i class="dot"></i><b>${online}</b> online`;
      linhas.push(`${p} ping${o}`);
    }
    el.classList.toggle("off", !on || linhas.length === 0);
    if (!on || linhas.length === 0) return;
    el.innerHTML = linhas.join("<br>");
  };
  const pararConfig = aoMudarConfig(render);

  // FPS: média de 1 segundo
  let frames = 0;
  let t0 = performance.now();
  let raf = 0;
  // conta os quadros que o JOGO desenhou (respeita o limite de FPS); sem o jogo, conta os do navegador
  const contar = () => { frames++; };
  opts.game?.events.on("postrender", contar);
  const tick = (now: number) => {
    raf = requestAnimationFrame(tick);
    if (!opts.game) frames++;
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
    onPong(t, n) {
      const rtt = performance.now() - t;
      if (!Number.isFinite(rtt) || rtt < 0 || rtt > 60_000) return; // resposta atrasada ou inválida
      if (typeof n === "number" && Number.isFinite(n) && n >= 0) online = Math.floor(n);
      // suaviza um pouco (média móvel) para o número não pular a cada medição
      ping = ping < 0 ? rtt : ping * 0.6 + rtt * 0.4;
      best = Math.min(best, rtt);
      render();
    },
    destroy() {
      cancelAnimationFrame(raf);
      opts.game?.events.off("postrender", contar);
      clearInterval(timer);
      pararConfig();
      window.removeEventListener("keydown", onKey);
      el.remove();
      style.remove();
    },
  };
}
