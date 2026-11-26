import { apiUrl } from "../auth";

/**
 * Entrada do painel no jogo. Este arquivo fica no bundle dos jogadores, então é só o botão:
 * - pergunta ao servidor se a conta é admin (GET /api/admin/estado; quem não é admin não vê nada);
 * - o botão "Painel" só aparece para admin;
 * - o módulo do painel (abrir-painel, com as abas) é carregado com import() na primeira vez que o botão é apertado.
 */

const CSS = `
.pn-entrada{position:fixed;z-index:20;top:max(14px,env(safe-area-inset-top));right:66px;height:44px;padding:0 14px;border-radius:22px;cursor:pointer;
  color:#ffd2a3;background:rgba(40,16,8,.78);border:1px solid rgba(255,150,70,.55);backdrop-filter:blur(6px);-webkit-backdrop-filter:blur(6px);
  font:700 12px/1 "Cinzel",Georgia,serif;letter-spacing:.14em;text-transform:uppercase;touch-action:manipulation}
.pn-entrada:hover,.pn-entrada:focus-visible{color:#fff;border-color:#ff9a4d;box-shadow:0 0 16px rgba(255,120,40,.35);outline:none}
.pn-entrada:disabled{opacity:.6;cursor:wait}
`;

export async function montarEntradaPainel(token: string): Promise<void> {
  let admin = false;
  try {
    const res = await fetch(`${apiUrl}/api/admin/estado`, { headers: { Authorization: `Bearer ${token}` } });
    admin = res.ok && (await res.json()).admin === true;
  } catch {
    admin = false; // sem rede: o botão simplesmente não aparece
  }
  if (!admin) return;

  const style = document.createElement("style");
  style.textContent = CSS;
  document.head.append(style);

  const btn = document.createElement("button");
  btn.type = "button";
  btn.className = "pn-entrada";
  btn.textContent = "Painel";
  btn.setAttribute("aria-haspopup", "dialog");
  btn.onclick = async () => {
    btn.disabled = true;
    try {
      // carregado sob demanda: o código do painel não pesa no carregamento dos jogadores
      const modulo = await import("./abrir-painel");
      modulo.abrirPainel(token);
    } catch {
      alert("Não foi possível abrir o painel agora. Tente de novo.");
    } finally {
      btn.disabled = false;
    }
  };
  document.body.append(btn);
}
