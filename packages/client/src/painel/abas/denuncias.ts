import type { AbaPainel, InstanciaAba, Painel } from "../tipos";
import { el, botao, fmtData, carregando, estadoVazio, selo, confirmar } from "../ui";

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
    const topo = el("div", "pn-row");
    const filtro = el("select", "pn-sel");
    filtro.setAttribute("aria-label", "Filtrar denúncias");
    for (const [v, t] of [["abertas", "Abertas"], ["resolvidas", "Resolvidas"]]) {
      const o = el("option", "", t);
      o.value = v;
      filtro.append(o);
    }
    filtro.onchange = () => void carregar();
    topo.append(filtro, botao("Atualizar", () => void carregar()));
    const lista = el("div");
    raiz.append(topo, lista);

    async function carregar() {
      lista.replaceChildren(carregando());
      try {
        const { itens } = await p.api<{ itens: Denuncia[] }>("GET", `/denuncias?estado=${filtro.value}`);
        lista.replaceChildren(...(itens.length
          ? itens.map((d) => cartaoDenuncia(d))
          : [estadoVazio(filtro.value === "abertas" ? "Nenhuma denúncia aberta." : "Nenhuma denúncia resolvida.")]));
      } catch (e) {
        lista.replaceChildren();
        p.aviso((e as Error).message, "erro");
      }
    }

    function cartaoDenuncia(d: Denuncia): HTMLElement {
      const c = el("div", "pn-sec");
      const cab = el("div", "pn-row");
      cab.append(el("b", "", `#${d.id} · ${d.nome}`), selo(d.resolvida ? "resolvida" : "aberta", d.resolvida ? "ok" : "atencao"));
      c.append(cab, el("p", "", d.motivo), el("p", "pn-small", fmtData(d.criadoEm)));
      const acoes = el("div", "pn-row");
      if (d.personagemId) {
        acoes.append(botao("Ver ficha e sancionar", () => p.irPara("jogadores", { ficha: d.personagemId })));
      } else {
        acoes.append(el("span", "pn-small", "Personagem apagado: só dá para resolver."));
      }
      if (!d.resolvida) {
        acoes.append(botao("Marcar como resolvida", () => void resolver(d)));
      }
      c.append(acoes);
      return c;
    }

    async function resolver(d: Denuncia) {
      const ok = await confirmar({
        titulo: `Resolver a denúncia #${d.id}?`,
        texto: "Resolver não aplica sanção. Se o jogador precisar de punição, faça isso na ficha dele.",
        antes: "aberta",
        depois: "resolvida",
        confirmar: "Resolver",
      });
      if (!ok) return;
      try {
        await p.api("POST", `/denuncias/${d.id}/resolver`);
        p.aviso(`Denúncia #${d.id} marcada como resolvida.`, "ok");
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
