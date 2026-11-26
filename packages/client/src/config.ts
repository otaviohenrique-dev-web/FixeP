/**
 * Configurações do jogador (janela "Configurações" do menu ☰).
 * Ficam neste navegador (localStorage, com try/catch) e valem na hora: ao aplicar, dispara o evento "frixep-config"
 * para cada módulo reagir (FPS, escala de renderização, som, números, nomes, métricas, escala da HUD).
 * Quem lê é o módulo dono de cada coisa; este arquivo só guarda, valida e aplica o que é global (escala da HUD via CSS).
 */

export type Qualidade = "baixa" | "media" | "alta";
export type Efeitos = "nenhum" | "reduzido" | "todos";
export type EscalaUi = "s" | "m" | "l";

export interface Config {
  qualidade: Qualidade;
  fpsMax: number; // 30, 60, 120 ou 0 (sem limite)
  escalaRender: number; // fração da resolução de tela: 0.5, 0.75 ou 1
  efeitos: Efeitos; // partículas e efeitos de combate
  mostrarFps: boolean;
  mostrarPing: boolean;
  escalaUi: EscalaUi;
  numDano: boolean;
  numCura: boolean;
  nomes: boolean; // nomes e níveis sobre personagens e monstros
  somGeral: number; // 0 a 100
  somEfeitos: number; // 0 a 100
  somMusica: number; // 0 a 100 (ainda sem música no jogo)
}

/** o que cada nível de qualidade liga; o jogador pode ajustar cada opção depois */
export const PRESETS: Record<Qualidade, Pick<Config, "escalaRender" | "efeitos" | "fpsMax">> = {
  baixa: { escalaRender: 0.75, efeitos: "nenhum", fpsMax: 30 },
  media: { escalaRender: 1, efeitos: "reduzido", fpsMax: 60 },
  alta: { escalaRender: 1, efeitos: "todos", fpsMax: 0 },
};

/** tamanho da interface: no celular é o `--hs` da HUD; no computador vira zoom da HUD */
export const ESCALAS_UI: { id: EscalaUi; label: string; v: number }[] = [
  { id: "s", label: "Pequena", v: 0.85 },
  { id: "m", label: "Média", v: 1 },
  { id: "l", label: "Grande", v: 1.2 },
];

export const PADRAO: Config = {
  qualidade: "alta",
  ...PRESETS.alta,
  mostrarFps: true,
  mostrarPing: true,
  escalaUi: "m",
  numDano: true,
  numCura: true,
  nomes: true,
  somGeral: 100,
  somEfeitos: 100,
  somMusica: 100,
};

const KEY = "frixep.config.v1";
const EVENTO = "frixep-config";

const num = (v: unknown, min: number, max: number, dflt: number) =>
  typeof v === "number" && Number.isFinite(v) ? Math.min(max, Math.max(min, v)) : dflt;
const bool = (v: unknown, dflt: boolean) => (typeof v === "boolean" ? v : dflt);
const pick = <T>(v: unknown, ok: readonly T[], dflt: T): T => (ok.includes(v as T) ? (v as T) : dflt);

/** valida o que veio do armazenamento (pode ter sido editado à mão ou ser de versão antiga) */
function validar(raw: Partial<Record<keyof Config, unknown>>): Config {
  return {
    qualidade: pick(raw.qualidade, ["baixa", "media", "alta"] as const, PADRAO.qualidade),
    fpsMax: pick(raw.fpsMax, [30, 60, 120, 0] as const, PADRAO.fpsMax),
    escalaRender: pick(raw.escalaRender, [0.5, 0.75, 1] as const, PADRAO.escalaRender),
    efeitos: pick(raw.efeitos, ["nenhum", "reduzido", "todos"] as const, PADRAO.efeitos),
    mostrarFps: bool(raw.mostrarFps, PADRAO.mostrarFps),
    mostrarPing: bool(raw.mostrarPing, PADRAO.mostrarPing),
    escalaUi: pick(raw.escalaUi, ["s", "m", "l"] as const, PADRAO.escalaUi),
    numDano: bool(raw.numDano, PADRAO.numDano),
    numCura: bool(raw.numCura, PADRAO.numCura),
    nomes: bool(raw.nomes, PADRAO.nomes),
    somGeral: num(raw.somGeral, 0, 100, PADRAO.somGeral),
    somEfeitos: num(raw.somEfeitos, 0, 100, PADRAO.somEfeitos),
    somMusica: num(raw.somMusica, 0, 100, PADRAO.somMusica),
  };
}

function ler(): Config {
  try {
    const s = localStorage.getItem(KEY);
    return validar(s ? (JSON.parse(s) as Partial<Record<keyof Config, unknown>>) : {});
  } catch {
    return validar({}); // sem armazenamento ou JSON inválido: padrão
  }
}

let atual: Config | null = null;

/** configuração em uso neste momento (lida uma vez e depois mantida na memória) */
export function config(): Config {
  return (atual ??= ler());
}

/** valor de escala da HUD no computador (zoom) e no celular (variável `--hs`) */
export function fatorEscalaUi(id: EscalaUi = config().escalaUi): number {
  return ESCALAS_UI.find((e) => e.id === id)!.v;
}

/** fração dos efeitos de combate: 0 = nenhum, 0,5 = reduzido, 1 = todos */
export function fatorEfeitos(): number {
  const e = config().efeitos;
  return e === "nenhum" ? 0 : e === "reduzido" ? 0.5 : 1;
}

let cssPronto = false;
function garantirCss() {
  if (cssPronto || typeof document === "undefined") return;
  cssPronto = true;
  const st = document.createElement("style");
  // no computador a HUD inteira cresce ou encolhe com um zoom; no celular quem manda é a regra da própria HUD (mobile.ts)
  st.textContent = `body:not(.mob) :is(.hd,.pt,.ch,.st,.ec-wallet,.gm-btn,.jg-bar){zoom:var(--ui-zoom,1)}`;
  document.head.append(st);
}

/** guarda, aplica e avisa os módulos. `c` é a configuração completa a salvar */
export function salvarConfig(c: Config): void {
  const limpa = validar(c as unknown as Partial<Record<keyof Config, unknown>>);
  try { localStorage.setItem(KEY, JSON.stringify(limpa)); } catch { /* sem armazenamento: vale só nesta aba */ }
  atual = limpa;
  garantirCss();
  document.documentElement.style.setProperty("--ui-zoom", String(fatorEscalaUi(limpa.escalaUi)));
  window.dispatchEvent(new CustomEvent(EVENTO, { detail: limpa }));
}

/** assina as mudanças (aplicar ou restaurar); devolve a função para cancelar */
export function aoMudarConfig(fn: (c: Config) => void): () => void {
  const h = (e: Event) => fn((e as CustomEvent<Config>).detail);
  window.addEventListener(EVENTO, h);
  return () => window.removeEventListener(EVENTO, h);
}

/** aplica a escala da HUD logo que o módulo carrega (antes de qualquer janela) */
export function iniciarConfig(): void {
  garantirCss();
  document.documentElement.style.setProperty("--ui-zoom", String(fatorEscalaUi()));
}
