/** PWA: registra o service worker e gerencia o botão "Instalar app" (beforeinstallprompt) e a dica do iOS. */
type InstallEvt = Event & { prompt(): Promise<void>; userChoice: Promise<{ outcome: string }> };
let deferred: InstallEvt | null = null;
const subs = new Set<() => void>();

export const isStandalone = () =>
  matchMedia("(display-mode: standalone)").matches || matchMedia("(display-mode: fullscreen)").matches || (navigator as { standalone?: boolean }).standalone === true;
const isIos = () => /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);

export function registerPwa() {
  if ("serviceWorker" in navigator && (import.meta.env.PROD || location.hostname === "localhost")) {
    addEventListener("load", () => navigator.serviceWorker.register("/sw.js", { scope: "/" }).catch(() => {}));
  }
  addEventListener("beforeinstallprompt", (e) => { e.preventDefault(); deferred = e as InstallEvt; subs.forEach((f) => f()); });
  addEventListener("appinstalled", () => { deferred = null; subs.forEach((f) => f()); });
}

/** Estado do botão: "prompt" (instalar com 1 toque), "ios" (mostrar dica) ou null (esconder). */
export function installMode(): "prompt" | "ios" | null {
  if (isStandalone()) return null;
  if (deferred) return "prompt";
  return isIos() ? "ios" : null;
}
export const onInstallChange = (f: () => void) => { subs.add(f); };
export async function runInstall(): Promise<string> {
  if (deferred) { const d = deferred; deferred = null; await d.prompt(); const r = await d.userChoice; subs.forEach((f) => f()); return r.outcome; }
  return "ios";
}
