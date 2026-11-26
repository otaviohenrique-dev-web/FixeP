import { createHash, randomInt, timingSafeEqual } from "node:crypto";
import { SignJWT, jwtVerify } from "jose";
import { secret } from "../auth.js";
import { enviarCodigoPainel, painelDisponivel } from "./email.js";

/**
 * 2FA do painel: o admin pede um código de 6 dígitos, que vai para o e-mail da conta.
 * - vale 10 minutos e é de uso único;
 * - 5 tentativas por código (ao errar a 5ª, o código morre);
 * - no máximo 3 pedidos de código por conta a cada 10 minutos.
 * Estado só em memória (um servidor): reiniciar o servidor derruba códigos e sessões do painel, e o admin pede outro.
 * Confirmado o código, o servidor emite um token de painel de 12 horas (só para as rotas /api/admin/*).
 */

export const CODIGO_VALIDADE_MS = 10 * 60_000;
export const CODIGO_MAX_TENTATIVAS = 5;
export const CODIGO_MAX_PEDIDOS = 3;
const JANELA_PEDIDOS_MS = 10 * 60_000;
export const PAINEL_TOKEN_VALIDADE = "12h";
const AUDIENCIA_PAINEL = "painel"; // o token do painel não serve como sessão do jogo (e vice-versa)

interface Pendente { hash: Buffer; expiraEm: number; tentativas: number }
const pendentes = new Map<string, Pendente>();
const pedidos = new Map<string, number[]>();

const hashCodigo = (contaId: string, codigo: string) => createHash("sha256").update(`${contaId}:${codigo}`).digest();

export type ResultadoPedido =
  | { ok: true; expiraEm: number }
  | { ok: false; status: 409 | 429 | 503 | 502; erro: string };

/** gera e envia um código para o e-mail da conta */
export async function pedirCodigo(contaId: string, email: string | null): Promise<ResultadoPedido> {
  if (!painelDisponivel()) return { ok: false, status: 503, erro: "Painel indisponível: o envio de e-mail do painel não está configurado." };
  if (!email) return { ok: false, status: 409, erro: "Esta conta não tem e-mail cadastrado. Entre com Google ou Discord (que informam o e-mail)." };
  const agora = Date.now();
  const recentes = (pedidos.get(contaId) ?? []).filter((t) => agora - t < JANELA_PEDIDOS_MS);
  if (recentes.length >= CODIGO_MAX_PEDIDOS) {
    pedidos.set(contaId, recentes);
    return { ok: false, status: 429, erro: "Muitos pedidos de código. Aguarde alguns minutos." };
  }
  recentes.push(agora);
  pedidos.set(contaId, recentes);

  const codigo = String(randomInt(0, 1_000_000)).padStart(6, "0");
  const expiraEm = agora + CODIGO_VALIDADE_MS;
  pendentes.set(contaId, { hash: hashCodigo(contaId, codigo), expiraEm, tentativas: 0 });
  try {
    await enviarCodigoPainel(email, codigo);
  } catch (e) {
    pendentes.delete(contaId); // sem e-mail entregue, o código não vale
    console.error("[painel] envio do código falhou:", (e as Error).message);
    return { ok: false, status: 502, erro: "Não foi possível enviar o código agora. Tente de novo em instantes." };
  }
  return { ok: true, expiraEm };
}

export type ResultadoConfirmacao = { ok: true } | { ok: false; status: 401; erro: string };

/** confere o código: de uso único, com limite de tentativas e validade */
export function confirmarCodigo(contaId: string, codigo: unknown): ResultadoConfirmacao {
  const p = pendentes.get(contaId);
  if (!p || Date.now() > p.expiraEm) {
    pendentes.delete(contaId);
    return { ok: false, status: 401, erro: "Código expirado ou inexistente. Peça um novo código." };
  }
  if (p.tentativas >= CODIGO_MAX_TENTATIVAS) {
    pendentes.delete(contaId);
    return { ok: false, status: 401, erro: "Código bloqueado por excesso de tentativas. Peça um novo código." };
  }
  p.tentativas++;
  const enviado = typeof codigo === "string" && /^\d{6}$/.test(codigo) ? hashCodigo(contaId, codigo) : Buffer.alloc(32);
  const certo = timingSafeEqual(enviado, p.hash) && typeof codigo === "string" && /^\d{6}$/.test(codigo);
  if (!certo) {
    if (p.tentativas >= CODIGO_MAX_TENTATIVAS) pendentes.delete(contaId);
    return { ok: false, status: 401, erro: "Código incorreto." };
  }
  pendentes.delete(contaId); // uso único: o código certo também morre aqui
  return { ok: true };
}

/** token do painel: 12 horas, só para /api/admin/* */
export async function emitirTokenPainel(contaId: string): Promise<string> {
  return new SignJWT({ painel: 1 })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(contaId)
    .setAudience(AUDIENCIA_PAINEL)
    .setIssuedAt()
    .setExpirationTime(PAINEL_TOKEN_VALIDADE)
    .sign(secret);
}

/** a conta do token de painel válido, ou null (ausente, vencido, adulterado ou de outro uso) */
export async function contaDoTokenPainel(token: unknown): Promise<string | null> {
  if (typeof token !== "string" || !token) return null;
  try {
    const { payload } = await jwtVerify(token, secret, { algorithms: ["HS256"], audience: AUDIENCIA_PAINEL });
    return payload.painel === 1 && payload.sub ? String(payload.sub) : null;
  } catch {
    return null;
  }
}
