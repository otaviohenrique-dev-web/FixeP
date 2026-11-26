import type { AbaPainel, InstanciaAba, Painel } from "../tipos";
import { el, botao, fmtNum, secao, vazio } from "../ui";

interface Visao {
  online: number;
  zonas: { zona: number; nome: string; jogadores: number }[];
  contas: number;
  personagens: number;
  geradoEm: number;
}

const INTERVALO_MS = 20_000;

/** Visão geral: jogadores online agora (por zona) e totais de contas e personagens. */
export const abaVisao: AbaPainel = {
  id: "visao",
  titulo: "Visão geral",
  montar(p: Painel): InstanciaAba {
    const raiz = el("div");
    const topo = el("div", "pn-row");
    const corpo = el("div");
    const atualizar = botao("Atualizar", () => void carregar());
    topo.append(atualizar, el("span", "pn-small", `Atualiza sozinho a cada ${INTERVALO_MS / 1000} s enquanto esta aba estiver aberta.`));
    raiz.append(topo, corpo);

    let timer: ReturnType<typeof setInterval> | undefined;

    async function carregar() {
      try {
        const v = await p.api<Visao>("GET", "/visao");
        const grade = el("div", "pn-grid");
        grade.append(cartao(fmtNum(v.online), "Online agora"), cartao(fmtNum(v.contas), "Contas"), cartao(fmtNum(v.personagens), "Personagens"));
        const zonas = v.zonas.length ? listaZonas(v) : vazio("Ninguém online agora.");
        corpo.replaceChildren(grade, secao("Online por zona", zonas));
      } catch (e) {
        p.aviso((e as Error).message, "erro");
      }
    }

    return {
      el: raiz,
      abrir() {
        void carregar();
        clearInterval(timer);
        timer = setInterval(() => void carregar(), INTERVALO_MS);
      },
      fechar() {
        clearInterval(timer);
        timer = undefined;
      },
    };
  },
};

function cartao(valor: string, rotulo: string): HTMLElement {
  const c = el("div", "pn-card");
  c.append(el("b", "", valor), el("span", "", rotulo));
  return c;
}

function listaZonas(v: Visao): HTMLElement {
  const ul = el("ul", "pn-list");
  for (const z of v.zonas) {
    ul.append(el("li", "", `${z.nome} (zona ${z.zona}): ${fmtNum(z.jogadores)} ${z.jogadores === 1 ? "jogador" : "jogadores"}`));
  }
  return ul;
}
