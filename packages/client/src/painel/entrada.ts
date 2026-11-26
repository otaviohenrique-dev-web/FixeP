import { apiUrl } from "../auth";

/**
 * Entrada do painel no jogo. Este arquivo fica no bundle dos jogadores, então é só o botão:
 * - pergunta ao servidor se a conta é admin (GET /api/admin/estado; quem não é admin não vê nada);
 * - o item "Painel" do menu (botão de 3 linhas) só aparece para admin;
 * - o módulo do painel (abrir-painel, com as abas) é carregado com import() na primeira vez que o botão é apertado.
 */

export async function montarEntradaPainel(token: string, addAcao: (label: string, run: () => void | Promise<void>) => void): Promise<void> {
  let admin = false;
  try {
    const res = await fetch(`${apiUrl}/api/admin/estado`, { headers: { Authorization: `Bearer ${token}` } });
    admin = res.ok && (await res.json()).admin === true;
  } catch {
    admin = false; // sem rede: o botão simplesmente não aparece
  }
  if (!admin) return;

  addAcao("Painel", async () => {
    try {
      // carregado sob demanda: o código do painel não pesa no carregamento dos jogadores
      const modulo = await import("./abrir-painel");
      modulo.abrirPainel(token);
    } catch {
      alert("Não foi possível abrir o painel agora. Tente de novo.");
    }
  });
}
