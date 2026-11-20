/**
 * Qualidade gráfica: "Bom" (padrão) ou "Baixo".
 * Baixo tira só os enfeites mais caros para o desenho: sombras embaixo dos personagens, brilho da arma,
 * rebites, gema e halos das faixas altas da placa, e a resolução do celular cai de 2x para 1,5x.
 * A escolha fica no navegador e vale na próxima carga do jogo (o menu recarrega a página ao trocar).
 */

const KEY = "frixep_qualidade";

export function lowQuality(): boolean {
  try { return localStorage.getItem(KEY) === "baixo"; } catch { return false; }
}

export function setLowQuality(on: boolean): void {
  try { localStorage.setItem(KEY, on ? "baixo" : "bom"); } catch { /* sem armazenamento: fica no padrão */ }
}
