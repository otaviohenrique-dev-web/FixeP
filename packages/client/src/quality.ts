/**
 * Botão "Gráficos" do menu: modo de teste A/B para achar o gargalo de FPS no celular.
 * - "bom" (padrão): jogo normal.
 * - "sem-desenhos" (Teste A): não desenha nenhum Graphics (placas, barras, sombras, brilho da arma, efeitos).
 * - "sem-sprites" (Teste B): esconde os sprites dos personagens e monstros.
 * A escolha fica no navegador e vale na próxima carga do jogo (o menu recarrega a página ao trocar).
 */

export type Modo = "bom" | "sem-desenhos" | "sem-sprites";

const KEY = "frixep_qualidade";
const ORDEM: Modo[] = ["bom", "sem-desenhos", "sem-sprites"];

export const NOME_MODO: Record<Modo, string> = {
  bom: "Bom",
  "sem-desenhos": "Teste A (sem desenhos)",
  "sem-sprites": "Teste B (sem sprites)",
};

export function modoQualidade(): Modo {
  try {
    const v = localStorage.getItem(KEY);
    return v === "sem-desenhos" || v === "sem-sprites" ? v : "bom";
  } catch {
    return "bom";
  }
}

export function proximoModo(): Modo {
  return ORDEM[(ORDEM.indexOf(modoQualidade()) + 1) % ORDEM.length];
}

export function setModo(m: Modo): void {
  try { localStorage.setItem(KEY, m); } catch { /* sem armazenamento: fica no padrão */ }
}
