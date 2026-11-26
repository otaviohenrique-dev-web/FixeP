import { appendFile } from "node:fs/promises";

/**
 * Envio do código do painel (2FA). Três destinos, nesta ordem:
 *  1. RESEND_API_KEY + ADMIN_MAIL_FROM definidos => e-mail de verdade pela API HTTP do Resend.
 *  2. Fora de produção e sem chave => o código vai para o log do servidor (dev).
 *     PAINEL_CODIGO_ARQUIVO (só testes automatizados) => o código também é gravado nesse arquivo, para o teste ler.
 *  3. Produção sem chave => NÃO há envio e o painel fica indisponível (nunca cai no log).
 * Nunca registre o valor de RESEND_API_KEY nem o e-mail completo do jogador em log.
 */

const isProd = process.env.NODE_ENV === "production";

/** há como entregar o código agora? (produção exige o Resend) */
export function painelDisponivel(): boolean {
  if (process.env.RESEND_API_KEY && process.env.ADMIN_MAIL_FROM) return true;
  return !isProd;
}

/** e-mail mascarado para listas: "ot***@gmail.com". Sem @ (dado estranho) => só "***". */
export function mascararEmail(email: string | null | undefined): string | null {
  if (!email) return null;
  const at = email.lastIndexOf("@");
  if (at <= 0) return "***";
  const local = email.slice(0, at);
  return `${local.slice(0, 2)}***${email.slice(at)}`;
}

export async function enviarCodigoPainel(para: string, codigo: string): Promise<void> {
  const key = process.env.RESEND_API_KEY;
  const from = process.env.ADMIN_MAIL_FROM;
  if (key && from) {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        from,
        to: [para],
        subject: "Código de acesso ao painel do FrixeP",
        text: `Seu código de acesso ao painel: ${codigo}\nVale por 10 minutos e só pode ser usado uma vez.\nSe você não pediu este código, ignore este e-mail.`,
      }),
    });
    if (!res.ok) throw new Error(`envio de e-mail recusado (HTTP ${res.status})`);
    return;
  }
  if (isProd) throw new Error("painel sem envio de e-mail configurado");
  const arquivo = process.env.PAINEL_CODIGO_ARQUIVO; // só testes automatizados (fora de produção)
  if (arquivo) {
    await appendFile(arquivo, `${codigo}\n`);
    return;
  }
  console.log(`[painel] código de acesso (dev, sem e-mail configurado): ${codigo}`);
}

/** aviso no log de inicialização: o painel precisa de envio de e-mail em produção */
export function avisarConfiguracaoPainel(): void {
  if (!painelDisponivel()) console.warn("[painel] PRODUÇÃO sem RESEND_API_KEY/ADMIN_MAIL_FROM: o painel de administração fica indisponível.");
}
