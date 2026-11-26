import type { AbaPainel, InstanciaAba, Painel } from "../tipos";
import { el, botao, fmtNum, secao, cartaoMetrica, selo, tabela, carregando } from "../ui";

interface Zona { zona: number; nome: string; jogadores: number }
interface Visao {
  online: number;
  zonas: Zona[];
  contas: number;
  personagens: number;
  geradoEm: number;
}

const INTERVALO_MS = 20_000;

/** Visão geral: cartões de métrica (online, contas, personagens) e a lista de jogadores online por zona. */
export const abaVisao: AbaPainel = {
  id: "visao",
  titulo: "Visão geral",
  montar(p: Painel): InstanciaAba {
    const raiz = el("div");
    const topo = el("div", "pn-row");
    const atualizar = botao("Atualizar", () => void carregar());
    topo.append(atualizar, el("span", "pn-small", `Atualiza sozinho a cada ${INTERVALO_MS / 1000} s enquanto esta aba estiver aberta.`));

    const grade = el("div", "pn-grid");
    const zonas = tabela<Zona>({
      colunas: [
        { chave: "zona", rotulo: "Zona", ordenar: (z) => z.zona, render: (z) => String(z.zona) },
        { chave: "nome", rotulo: "Nome", ordenar: (z) => z.nome, render: (z) => z.nome },
        { chave: "jogadores", rotulo: "Jogadores", ordenar: (z) => z.jogadores, render: (z) => fmtNum(z.jogadores) },
        {
          chave: "estado", rotulo: "Movimento",
          ordenar: (z) => z.jogadores,
          render: (z) => (z.jogadores >= 10 ? selo("cheia", "atencao") : z.jogadores > 0 ? selo("ativa", "ok") : selo("vazia", "neutro")),
        },
      ],
      filtroRotulo: "Filtrar zona",
      filtrarPor: (z) => z.nome,
      vazioTexto: "Ninguém online agora.",
    });
    raiz.append(topo, grade, secao("Online por zona", zonas.el));

    let timer: ReturnType<typeof setInterval> | undefined;
    let carregado = false;

    async function carregar() {
      if (!carregado) grade.replaceChildren(carregando());
      try {
        const v = await p.api<Visao>("GET", "/visao");
        carregado = true;
        grade.replaceChildren(
          cartaoMetrica(fmtNum(v.online), "Online agora", v.online > 0 ? { texto: "ao vivo", tom: "ok" } : { texto: "ninguém agora", tom: "neutro" }),
          cartaoMetrica(fmtNum(v.contas), "Contas"),
          cartaoMetrica(fmtNum(v.personagens), "Personagens"),
        );
        zonas.definir(v.zonas);
      } catch (e) {
        grade.replaceChildren();
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
