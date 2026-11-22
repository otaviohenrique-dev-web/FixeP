import type { Db } from "./db/index.js";

/**
 * Telemetria mínima (C0.5): registra eventos de jogo na tabela `eventos`.
 * Regras:
 *  - NUNCA derruba o jogo: qualquer erro vira um aviso no log e a função devolve sem lançar.
 *  - Chamada sem `await` no caminho do combate: quem chama não espera o banco.
 *  - Não grava senha, token, e-mail nem IP: campos com esses nomes são descartados de `dados`.
 */
export type TipoEvento = "login" | "criacao_personagem" | "passo_tutorial" | "primeiro_abate" | "nivel_5" | "saida" | "denuncia" | "silenciado" | "banido";

export interface CamposEvento {
  contaId?: string | null;
  personagemId?: string | null;
  dados?: Record<string, unknown>;
}

// nomes de campo que nunca entram em `dados` (inclui variações em inglês e português)
const CHAVE_PROIBIDA = /senha|password|token|secret|segredo|e-?mail|\bip\b|ip_?address|endereco_ip|cookie|authorization/i;

/** Remove recursivamente os campos proibidos; valores que não são objetos simples viram string curta. */
export function limparDados(valor: unknown, profundidade = 0): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  if (!valor || typeof valor !== "object" || profundidade > 3) return out;
  for (const [k, v] of Object.entries(valor as Record<string, unknown>)) {
    if (CHAVE_PROIBIDA.test(k)) continue;
    if (v === null || typeof v === "number" || typeof v === "boolean") out[k] = v;
    else if (typeof v === "string") out[k] = v.slice(0, 64);
    else if (typeof v === "object") out[k] = limparDados(v, profundidade + 1);
  }
  return out;
}

/**
 * Grava um evento. Devolve uma promessa que NUNCA rejeita: o chamador pode ignorá-la (fire-and-forget).
 * `primeiro_abate` só é gravado uma vez por personagem (checado no próprio banco, então vale entre reinícios).
 */
export async function registrarEvento(db: Db, tipo: TipoEvento, campos: CamposEvento = {}): Promise<void> {
  try {
    const dados = JSON.stringify(limparDados(campos.dados ?? {}));
    const contaId = campos.contaId ?? null;
    const personagemId = campos.personagemId ?? null;
    if (tipo === "primeiro_abate") {
      if (!personagemId) return;
      await db.query(
        `insert into eventos (tipo, conta_id, personagem_id, dados)
         select $1::text, $2::uuid, $3::uuid, $4::jsonb
         where not exists (select 1 from eventos where tipo = 'primeiro_abate' and personagem_id = $3::uuid)`,
        [tipo, contaId, personagemId, dados],
      );
      return;
    }
    await db.query(
      "insert into eventos (tipo, conta_id, personagem_id, dados) values ($1::text, $2::uuid, $3::uuid, $4::jsonb)",
      [tipo, contaId, personagemId, dados],
    );
  } catch (e) {
    console.warn(`[telemetria] evento "${tipo}" não gravado:`, (e as Error).message);
  }
}
