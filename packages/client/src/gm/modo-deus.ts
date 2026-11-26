/**
 * Modo Deus no cliente (só o que o jogador vê). Quem decide tudo é o servidor: aqui só se mostra o que ele manda.
 * - `setAdmin`: a entrada do painel (painel/entrada.ts) avisa quando a conta é admin;
 * - `gmVisivel`: personagem invisível (Modo Deus) só aparece para o próprio dono e para outros admins;
 * - `rotuloGm`: a marca "[GM]" ao lado do nome de quem está em Modo Deus, só vista por admins;
 * - `indicadorGm`: selo discreto "GM" no canto da tela enquanto o próprio personagem está em Modo Deus.
 */

let admin = false;
export const setAdmin = (v: boolean) => { admin = v; };
export const ehAdmin = () => admin;

interface PersonagemVisto { gm?: boolean; gmInvis?: boolean; name?: string }

/** o personagem aparece para este cliente? (invisível só é visto pelo dono ou por admin) */
export function gmVisivel(p: PersonagemVisto, ehEu: boolean): boolean {
  return !p.gmInvis || ehEu || admin;
}

/** nome com a marca [GM] (só para admin); os demais veem o nome normal */
export function rotuloGm(nome: string, p: PersonagemVisto): string {
  return p.gm && admin ? `[GM] ${nome}` : nome;
}

let selo: HTMLElement | null = null;
let ultimo: boolean | null = null;

/** liga/desliga o selo "GM" do próprio personagem (cuidadoso: não mexe no DOM se nada mudou) */
export function indicadorGm(ligado: boolean): void {
  if (ligado === ultimo) return;
  ultimo = ligado;
  if (!ligado) { selo?.remove(); selo = null; return; }
  if (typeof document === "undefined") return;
  selo = document.createElement("div");
  selo.id = "gm-indicador";
  selo.textContent = "GM";
  selo.title = "Modo Deus ligado (só o administrador vê este selo)";
  selo.setAttribute("aria-label", "Modo Deus ligado");
  Object.assign(selo.style, {
    position: "fixed", top: "8px", left: "50%", transform: "translateX(-50%)", zIndex: "900",
    padding: "2px 8px", borderRadius: "6px", background: "rgba(90, 40, 140, 0.85)", color: "#f4e8ff",
    font: "700 11px/1.4 Cinzel, Georgia, serif", letterSpacing: "1px", pointerEvents: "none",
    boxShadow: "0 0 0 1px rgba(255,255,255,.25)",
  } satisfies Partial<CSSStyleDeclaration>);
  document.body.append(selo);
}
