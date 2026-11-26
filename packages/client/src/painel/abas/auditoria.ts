import type { AbaPainel, InstanciaAba, Painel } from "../tipos";
import { el, botao, vazio, fmtData, ACOES_LEGIVEIS } from "../ui";

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
    const lista = el("div");
    raiz.append(topo, lista);

    async function carregar() {
      try {
        const { itens } = await p.api<{ itens: Linha[] }>("GET", "/auditoria?limite=100");
        lista.replaceChildren(...(itens.length ? itens.map(linhaAuditoria) : [vazio("Nenhuma ação registrada ainda.")]));
      } catch (e) {
        p.aviso((e as Error).message, "erro");
      }
    }

    return {
      el: raiz,
      abrir() { void carregar(); },
    };
  },
};

function linhaAuditoria(l: Linha): HTMLElement {
  const c = el("div", "pn-sec");
  const cab = el("div", "pn-row");
  cab.append(el("b", "", ACOES_LEGIVEIS[l.acao] ?? l.acao), el("span", "pn-small", fmtData(l.criado_em)));
  c.append(cab);
  const detalhes = [
    `por ${l.admin ?? "admin"}`,
    l.alvo_nome ? `alvo: ${l.alvo_nome}` : null,
    typeof l.detalhes?.motivo === "string" && l.detalhes.motivo ? `motivo: ${l.detalhes.motivo}` : null,
  ].filter(Boolean).join(" · ");
  c.append(el("p", "pn-small", detalhes));
  if (l.antes !== null || l.depois !== null) {
    c.append(el("p", "pn-mono", `antes: ${resumo(l.antes)}  →  depois: ${resumo(l.depois)}`));
  }
  return c;
}

/** resumo curto de um estado de sanção para a lista (JSON compacto; sem o e-mail, que nunca entra aqui) */
function resumo(v: unknown): string {
  if (v === null || v === undefined) return "—";
  const s = JSON.stringify(v);
  return s.length > 160 ? `${s.slice(0, 157)}...` : s;
}
