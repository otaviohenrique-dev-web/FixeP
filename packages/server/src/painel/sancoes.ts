import type { Repo } from "../db/repo.js";
import { sancaoEmCache, guardarSancao, horaLegivel, SILENCIO_MAX_MIN, MOTIVO_MAX } from "../moderacao.js";
import { avisarContaOnline, contaOnline, derrubarConta } from "../rooms/ZoneRoom.js";
import { registrarAuditoria } from "./auditoria.js";
import { registrarEvento } from "../telemetria.js";

/**
 * Sanções aplicadas pelo painel. Mesma regra do chat (moderacao.ts): o silêncio e o banimento são gravados no banco,
 * o cache de sanções é atualizado e a sessão online é avisada ou derrubada. Cada ação vai para a auditoria com o
 * estado antes e depois.
 */
export const ACOES_SANCAO = ["silenciar", "dessilenciar", "banir", "desbanir", "expulsar"] as const;
export type AcaoSancao = (typeof ACOES_SANCAO)[number];
const BANIMENTO_MAX_MIN = 525_600; // 1 ano; o permanente é outra opção

export interface PedidoSancao {
  acao: AcaoSancao;
  minutos?: number;
  permanente?: boolean;
  motivo?: unknown;
}

export interface AlvoSancao { id: string; account_id: string; name: string }

export type ResultadoSancao =
  | { ok: true; antes: EstadoSancao; depois: EstadoSancao; resumo: string }
  | { ok: false; status: 400 | 409; erro: string };

export interface EstadoSancao {
  silenciadoAte: string | null;
  banido: boolean;
  banidoAte: string | null;
  motivo: string | null;
}

const motivoLimpo = (m: unknown) => (typeof m === "string" ? m.trim().slice(0, MOTIVO_MAX) : "");

/** estado das sanções de uma conta, como o painel mostra e a auditoria guarda */
export async function estadoSancao(repo: Repo, contaId: string): Promise<EstadoSancao> {
  const c = await repo.sancaoCrua(contaId);
  return { silenciadoAte: c.silenciado_ate, banido: c.banido, banidoAte: c.banido_ate, motivo: c.motivo };
}

export async function aplicarSancao(repo: Repo, adminId: string, alvo: AlvoSancao, p: PedidoSancao): Promise<ResultadoSancao> {
  if (alvo.account_id === adminId) return { ok: false, status: 400, erro: "Você não pode sancionar a própria conta." };
  const motivo = motivoLimpo(p.motivo);
  const antes = await estadoSancao(repo, alvo.account_id);
  const conta = alvo.account_id;

  if (p.acao === "silenciar") {
    const min = Number(p.minutos);
    if (!Number.isInteger(min) || min < 1 || min > SILENCIO_MAX_MIN) return { ok: false, status: 400, erro: `Silêncio de 1 a ${SILENCIO_MAX_MIN} minutos.` };
    const ate = Date.now() + min * 60_000;
    await repo.setSilencio(conta, ate, motivo);
    guardarSancao(conta, { ...sancaoEmCache(conta), silenciadoAte: ate });
    avisarContaOnline(conta, `Você foi silenciado até ${horaLegivel(ate)}${motivo ? `: ${motivo}` : ""}.`);
    void registrarEvento(repo.db, "silenciado", { contaId: conta, personagemId: alvo.id, dados: { minutos: min, origem: "painel" } });
    return concluir(repo, adminId, alvo, p.acao, antes, `silenciado por ${min} min`, { minutos: min, motivo });
  }

  if (p.acao === "dessilenciar") {
    await repo.setSilencio(conta, null, "");
    guardarSancao(conta, { ...sancaoEmCache(conta), silenciadoAte: null });
    return concluir(repo, adminId, alvo, p.acao, antes, "silêncio retirado", {});
  }

  if (p.acao === "banir") {
    let ate: number | null = null;
    if (!p.permanente) {
      const min = Number(p.minutos);
      if (!Number.isInteger(min) || min < 1 || min > BANIMENTO_MAX_MIN) return { ok: false, status: 400, erro: `Banimento de 1 a ${BANIMENTO_MAX_MIN} minutos, ou permanente.` };
      ate = Date.now() + min * 60_000;
    }
    await repo.setBanido(conta, true, motivo, ate);
    guardarSancao(conta, { ...sancaoEmCache(conta), banido: true });
    void registrarEvento(repo.db, "banido", { contaId: conta, personagemId: alvo.id, dados: { origem: "painel" } });
    derrubarConta(conta, 4003); // a sessão atual cai na hora
    return concluir(repo, adminId, alvo, p.acao, antes, ate ? `banido até ${horaLegivel(ate)}` : "banido (permanente)", { permanente: ate === null, motivo });
  }

  if (p.acao === "desbanir") {
    await repo.setBanido(conta, false, "", null);
    guardarSancao(conta, { ...sancaoEmCache(conta), banido: false });
    return concluir(repo, adminId, alvo, p.acao, antes, "desbanido", {});
  }

  // expulsar: só com a conta online; não é sanção (ela pode entrar de novo)
  if (!contaOnline(conta)) return { ok: false, status: 409, erro: "Este jogador não está online agora." };
  derrubarConta(conta, 4005); // o cliente volta à tela de login
  return concluir(repo, adminId, alvo, p.acao, antes, "expulso da sessão", { motivo });
}

/** grava na auditoria (antes e depois) e devolve o resultado */
async function concluir(
  repo: Repo,
  adminId: string,
  alvo: AlvoSancao,
  acao: AcaoSancao,
  antes: EstadoSancao,
  resumo: string,
  detalhes: Record<string, unknown>,
): Promise<ResultadoSancao> {
  const depois = await estadoSancao(repo, alvo.account_id);
  await registrarAuditoria(repo.db, {
    adminContaId: adminId,
    acao,
    alvoContaId: alvo.account_id,
    alvoPersonagemId: alvo.id,
    alvoNome: alvo.name,
    antes,
    depois,
    detalhes,
  });
  return { ok: true, antes, depois, resumo };
}
