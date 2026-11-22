/**
 * Moderação mínima (C0.6): quem é admin, sanções em memória (cache das sanções do banco) e leitura dos comandos de chat.
 * Admin = conta listada em ADMIN_ACCOUNT_IDS (ids separados por vírgula). Sem a variável, ninguém é admin.
 * Nunca registre ou imprima os valores dessa variável.
 */

export interface Sancao {
  silenciadoAte: number | null; // timestamp em ms; null = sem silêncio
  banido: boolean;
}

export const SEM_SANCAO: Sancao = { silenciadoAte: null, banido: false };
export const MOTIVO_MAX = 200;
export const SILENCIO_MAX_MIN = 10080; // 7 dias

/** ids de conta admin a partir do valor bruto da variável (puro, testável) */
export function parseAdminIds(raw: string | undefined): Set<string> {
  return new Set((raw ?? "").split(",").map((s) => s.trim()).filter(Boolean));
}

let admins: Set<string> | null = null;
const adminsDaVariavel = () => (admins ??= parseAdminIds(process.env.ADMIN_ACCOUNT_IDS));

// seam só para testes automatizados (nunca em produção): a PRIMEIRA conta criada pelo servidor de teste vira admin
let contaTesteAdmin = false;
export function marcarContaTesteAdmin(contaId: string): void {
  if (process.env.ADMIN_TEST_FIRST_GUEST !== "1" || process.env.NODE_ENV === "production" || contaTesteAdmin) return;
  contaTesteAdmin = true;
  adminsDaVariavel().add(contaId);
}

export const isAdmin = (contaId: string | undefined): boolean => !!contaId && adminsDaVariavel().has(contaId);

const cache = new Map<string, Sancao>();
export const sancaoEmCache = (contaId: string): Sancao => cache.get(contaId) ?? SEM_SANCAO;
export const guardarSancao = (contaId: string, s: Sancao) => cache.set(contaId, s);
export const silenciadoAte = (contaId: string | undefined): number | null => (contaId ? sancaoEmCache(contaId).silenciadoAte : null);

export type ComandoAdmin =
  | { tipo: "silenciar"; nome: string; minutos: number; motivo: string }
  | { tipo: "banir"; nome: string; motivo: string }
  | { tipo: "desbanir"; nome: string }
  | { tipo: "denuncias" }
  | { tipo: "uso"; texto: string };

/** lê o nome do alvo: "Nome" entre aspas (aceita espaços) ou a primeira palavra */
function lerNome(s: string): { nome: string; resto: string } | null {
  if (s.startsWith('"')) {
    const fim = s.indexOf('"', 1);
    if (fim < 0) return null;
    return { nome: s.slice(1, fim).trim(), resto: s.slice(fim + 1).trim() };
  }
  const [nome = "", ...r] = s.split(/\s+/);
  return nome ? { nome, resto: r.join(" ") } : null;
}

/** interpreta um comando de admin; null = não é comando de admin (texto de chat comum) */
export function parseComandoAdmin(text: string): ComandoAdmin | null {
  const m = /^\/(silenciar|banir|desbanir|denuncias)(?:\s+([\s\S]*))?$/i.exec(text.trim());
  if (!m) return null;
  const cmd = m[1].toLowerCase();
  const resto = (m[2] ?? "").trim();
  if (cmd === "denuncias") return { tipo: "denuncias" };
  const alvo = lerNome(resto);
  if (!alvo) return { tipo: "uso", texto: `Use: /${cmd} ${cmd === "silenciar" ? "<nome> <minutos> [motivo]" : cmd === "banir" ? "<nome> [motivo]" : "<nome>"} (nome com espaços: entre aspas)` };
  if (cmd === "desbanir") return { tipo: "desbanir", nome: alvo.nome };
  if (cmd === "banir") return { tipo: "banir", nome: alvo.nome, motivo: alvo.resto.slice(0, MOTIVO_MAX) };
  const mins = /^(\d+)(?:\s+([\s\S]*))?$/.exec(alvo.resto);
  const minutos = mins ? Number(mins[1]) : NaN;
  if (!mins || !Number.isInteger(minutos) || minutos < 1 || minutos > SILENCIO_MAX_MIN) {
    return { tipo: "uso", texto: `Use: /silenciar <nome> <minutos de 1 a ${SILENCIO_MAX_MIN}> [motivo]` };
  }
  return { tipo: "silenciar", nome: alvo.nome, minutos, motivo: (mins[2] ?? "").slice(0, MOTIVO_MAX) };
}

/** hora legível do fim do silêncio (fuso de Brasília, onde o jogo é jogado) */
export function horaLegivel(ms: number): string {
  return new Date(ms).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit", timeZone: "America/Sao_Paulo" });
}
