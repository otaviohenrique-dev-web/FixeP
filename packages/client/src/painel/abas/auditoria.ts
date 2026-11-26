import type { AbaPainel, InstanciaAba, Painel } from "../tipos";
import { el, botao, fmtData, ACOES_LEGIVEIS, tabela, selo, carregando, type Tom } from "../ui";

interface Linha {
  id: number;
  criado_em: string;
  admin: string | null;
  acao: string;
  alvo_nome: string | null;
  antes: unknown;
  depois: unknown;
  detalhes: Record<string, unknown>;
}

/** Auditoria: o que cada admin fez, quando, sobre quem e o estado antes e depois. */
export const abaAuditoria: AbaPainel = {
  id: "auditoria",
  titulo: "Auditoria",
  montar(p: Painel): InstanciaAba {
    const raiz = el("div");
    const topo = el("div", "pn-row");
    topo.append(botao("Atualizar", () => void carregar()), el("span", "pn-small", "As 100 ações mais recentes."));

    const tab = tabela<Linha>({
      colunas: [
        { chave: "quando", rotulo: "Quando", ordenar: (l) => l.criado_em, render: (l) => fmtData(l.criado_em) },
        { chave: "acao", rotulo: "Ação", ordenar: (l) => ACOES_LEGIVEIS[l.acao] ?? l.acao, render: (l) => selo(ACOES_LEGIVEIS[l.acao] ?? l.acao, tomAcao(l.acao)) },
        { chave: "admin", rotulo: "Admin", ordenar: (l) => l.admin ?? "", render: (l) => l.admin ?? "admin" },
        { chave: "alvo", rotulo: "Alvo", ordenar: (l) => l.alvo_nome ?? "", render: (l) => l.alvo_nome ?? "—" },
        { chave: "mudanca", rotulo: "Antes → depois", render: (l) => mudanca(l) },
      ],
      filtroRotulo: "Filtrar por ação, admin ou alvo",
      filtrarPor: (l) => `${ACOES_LEGIVEIS[l.acao] ?? l.acao} ${l.admin ?? ""} ${l.alvo_nome ?? ""}`,
      vazioTexto: "Nenhuma ação registrada ainda.",
    });
    const status = el("div");
    raiz.append(topo, status, tab.el);

    async function carregar() {
      status.replaceChildren(carregando());
      try {
        const { itens } = await p.api<{ itens: Linha[] }>("GET", "/auditoria?limite=100");
        tab.definir(itens);
      } catch (e) {
        p.aviso((e as Error).message, "erro");
      } finally {
        status.replaceChildren();
      }
    }

    return {
      el: raiz,
      abrir() { void carregar(); },
    };
  },
};

/** tom do selo pela gravidade da ação */
function tomAcao(acao: string): Tom {
  if (acao === "banir" || acao === "expulsar") return "perigo";
  if (acao === "silenciar" || acao === "alterar_balanceamento") return "atencao";
  if (acao === "desbanir" || acao === "dessilenciar") return "ok";
  return "neutro";
}

/** texto curto do antes → depois (sem o e-mail, que nunca entra aqui) */
function mudanca(l: Linha): HTMLElement {
  if (l.antes === null && l.depois === null) return el("span", "pn-small", "—");
  return el("span", "pn-mono", `${resumo(l.antes)} → ${resumo(l.depois)}`);
}

/** resumo curto de um estado para a tabela (JSON compacto) */
function resumo(v: unknown): string {
  if (v === null || v === undefined) return "—";
  const s = JSON.stringify(v);
  return s.length > 120 ? `${s.slice(0, 117)}...` : s;
}
