import type { AbaPainel, InstanciaAba, Painel } from "../tipos";
import { el, botao, vazio, fmtData } from "../ui";

interface Denuncia { id: number; criadoEm: string; nome: string; personagemId: string | null; motivo: string; resolvida: boolean }

/**
 * Denúncias: abertas ou resolvidas. Cada uma leva à ficha do denunciado (onde se aplica a sanção) e pode ser marcada como
 * resolvida. Resolver não sanciona ninguém: a sanção é uma decisão separada, na ficha.
 */
export const abaDenuncias: AbaPainel = {
  id: "denuncias",
  titulo: "Denúncias",
  montar(p: Painel): InstanciaAba {
    const raiz = el("div");
    const filtro = el("select", "pn-sel");
    filtro.setAttribute("aria-label", "Filtrar denúncias");
    for (const [v, t] of [["abertas", "Abertas"], ["resolvidas", "Resolvidas"]]) {
      const o = el("option", "", t);
      o.value = v;
      filtro.append(o);
    }
    filtro.onchange = () => void carregar();
    const atualizar = botao("Atualizar", () => void carregar());
    const lista = el("div");
    raiz.append(el("div", "pn-row", ""), lista);
    raiz.firstElementChild!.append(filtro, atualizar);

    async function carregar() {
      try {
        const { itens } = await p.api<{ itens: Denuncia[] }>("GET", `/denuncias?estado=${filtro.value}`);
        lista.replaceChildren(...(itens.length ? itens.map((d) => cartaoDenuncia(d)) : [vazio(filtro.value === "abertas" ? "Nenhuma denúncia aberta." : "Nenhuma denúncia resolvida.")]));
      } catch (e) {
        p.aviso((e as Error).message, "erro");
      }
    }

    function cartaoDenuncia(d: Denuncia): HTMLElement {
      const c = el("div", "pn-sec");
      c.append(el("b", "", `#${d.id} · ${d.nome}`), el("p", "", d.motivo), el("p", "pn-small", fmtData(d.criadoEm)));
      const acoes = el("div", "pn-row");
      if (d.personagemId) {
        acoes.append(botao("Ver ficha e sancionar", () => p.irPara("jogadores", { ficha: d.personagemId })));
      } else {
        acoes.append(el("span", "pn-small", "Personagem apagado: só dá para resolver."));
      }
      if (!d.resolvida) {
        acoes.append(botao("Marcar como resolvida", () => void resolver(d.id)));
      }
      c.append(acoes);
      return c;
    }

    async function resolver(id: number) {
      try {
        await p.api("POST", `/denuncias/${id}/resolver`);
        p.aviso(`Denúncia #${id} marcada como resolvida.`, "ok");
        await carregar();
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
