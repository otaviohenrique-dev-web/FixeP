import type { AbaPainel } from "./tipos";
import { abaVisao } from "./abas/visao";
import { abaJogadores } from "./abas/jogadores";
import { abaDenuncias } from "./abas/denuncias";
import { abaAuditoria } from "./abas/auditoria";

/**
 * Abas do painel, na ordem em que aparecem. Próximas fases (Balanceamento, Economia, Eventos, Saúde do servidor)
 * entram aqui com um arquivo novo em abas/ e o correspondente em packages/server/src/painel/.
 */
export const ABAS: AbaPainel[] = [abaVisao, abaJogadores, abaDenuncias, abaAuditoria];
