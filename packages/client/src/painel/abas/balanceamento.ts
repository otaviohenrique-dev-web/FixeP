import type { AbaPainel, InstanciaAba, Painel } from "../tipos";
import { el, botao, vazio, fmtData, fmtNum } from "../ui";

interface Ajuste { chave: string; nome: string; grupo: string; padrao: number; min: number; max: number; atual: number; alterado: boolean }
interface Historico { id: number; chave: string; antes: number; depois: number; motivo: string; conta: string; criadoEm: string }

/** seções da aba: cada chave cai na primeira que bater (classe., habilidade., inimigo.) */
const SECOES: [string, (chave: string) => boolean][] = [
  ["Classes", (c) => c.startsWith("classe.")],
  ["Habilidades", (c) => c.startsWith("habilidade.")],
  ["Inimigos", (c) => c.startsWith("inimigo.")],
];

/**
 * Balanceamento ao vivo: vida e dano de classes, habilidades e inimigos. Cada mudança pede um motivo, vale na hora
 * no servidor e fica no histórico, onde pode ser desfeita. "Voltar ao padrão" devolve o valor do código.
 * Funciona no PC e no celular: campos e botões com toque confortável, e linhas que quebram em telas estreitas.
 */
export const abaBalanceamento: AbaPainel = {
  id: "balanceamento",
  titulo: "Balanceamento",
  montar(p: Painel): InstanciaAba {
    let ajustes: Ajuste[] = [];

    const raiz = el("div");
    const busca = el("input", "pn-in");
    busca.type = "search";
    busca.placeholder = "Buscar por nome ou chave";
    busca.setAttribute("aria-label", "Buscar valor de balanceamento");
    busca.oninput = () => render();
    const topo = el("div", "pn-row");
    topo.append(busca, botao("Atualizar", () => void carregar()), el("span", "pn-small", "Padrão = valor do código. Toda mudança pede motivo."));
    const lista = el("div");

    const histSec = el("section", "pn-sec");
    const histLista = el("div");
    histSec.append(el("h3", "pn-h3", "Histórico de mudanças"), histLista);
    raiz.append(topo, lista, histSec);

    async function carregar() {
      try {
        const r = await p.api<{ ajustes: Ajuste[] }>("GET", "/balanceamento");
        ajustes = r.ajustes;
        render();
        await carregarHistorico();
      } catch (e) {
        p.aviso((e as Error).message, "erro");
      }
    }

    function render() {
      const termo = busca.value.trim().toLowerCase();
      const filtrados = ajustes.filter((a) => !termo || a.nome.toLowerCase().includes(termo) || a.chave.toLowerCase().includes(termo));
      lista.replaceChildren(
        ...SECOES.map(([titulo, pertence]) => {
          const itens = filtrados.filter((a) => pertence(a.chave));
          const sec = el("section", "pn-sec");
          sec.append(el("h3", "pn-h3", `${titulo} (${itens.length})`));
          sec.append(...(itens.length ? itens.map((a) => linhaAjuste(a)) : [vazio("Nada encontrado.")]));
          return sec;
        }),
      );
    }

    function linhaAjuste(a: Ajuste): HTMLElement {
      const c = el("div", "pn-sub");
      const cab = el("div", "pn-row");
      cab.append(el("b", "", a.nome));
      if (a.alterado) cab.append(el("span", "pn-tag mute", "alterado"));
      const info = el("p", "pn-small", `atual ${fmtNum(a.atual)} · padrão ${fmtNum(a.padrao)} · limite de ${fmtNum(a.min)} a ${fmtNum(a.max)}`);

      const campoValor = el("input", "pn-in");
      campoValor.type = "number";
      campoValor.inputMode = "numeric";
      campoValor.step = "1";
      campoValor.min = String(a.min);
      campoValor.max = String(a.max);
      campoValor.value = String(a.atual);
      campoValor.style.width = "120px";
      campoValor.setAttribute("aria-label", `Novo valor de ${a.nome}`);

      const campoMotivo = el("input", "pn-in");
      campoMotivo.type = "text";
      campoMotivo.maxLength = 200;
      campoMotivo.placeholder = "Motivo (obrigatório)";
      campoMotivo.setAttribute("aria-label", `Motivo da mudança de ${a.nome}`);
      campoMotivo.style.flex = "1 1 200px";

      const acoes = el("div", "pn-row");
      const btnPadrao = botao("Voltar ao padrão", () => void padrao(a, campoMotivo.value));
      btnPadrao.disabled = !a.alterado;
      acoes.append(campoValor, campoMotivo, botao("Salvar", () => void salvar(a, campoValor.value, campoMotivo.value)), btnPadrao);
      c.append(cab, info, acoes);
      return c;
    }

    async function salvar(a: Ajuste, valor: string, motivo: string) {
      const n = Number(valor);
      if (!Number.isInteger(n)) return p.aviso("Use um número inteiro.", "erro");
      if (n < a.min || n > a.max) return p.aviso(`Fora do limite de segurança: use de ${fmtNum(a.min)} a ${fmtNum(a.max)}.`, "erro");
      if (!motivo.trim()) return p.aviso("Escreva o motivo da mudança.", "erro");
      try {
        await p.api("PUT", `/balanceamento/${encodeURIComponent(a.chave)}`, { valor: n, motivo: motivo.trim() });
        p.aviso(`${a.nome} salvo em ${fmtNum(n)}. Vale na hora.`, "ok");
        await carregar();
      } catch (e) {
        p.aviso((e as Error).message, "erro");
      }
    }

    async function padrao(a: Ajuste, motivo: string) {
      if (!motivo.trim()) return p.aviso("Escreva o motivo para voltar ao padrão.", "erro");
      try {
        await p.api("POST", `/balanceamento/${encodeURIComponent(a.chave)}/padrao`, { motivo: motivo.trim() });
        p.aviso(`${a.nome} voltou ao padrão do código.`, "ok");
        await carregar();
      } catch (e) {
        p.aviso((e as Error).message, "erro");
      }
    }

    async function carregarHistorico() {
      try {
        const { historico } = await p.api<{ historico: Historico[] }>("GET", "/balanceamento/historico");
        histLista.replaceChildren(...(historico.length ? historico.map((h) => linhaHistorico(h)) : [vazio("Nenhuma mudança ainda.")]));
      } catch (e) {
        p.aviso((e as Error).message, "erro");
      }
    }

    function linhaHistorico(h: Historico): HTMLElement {
      const nome = ajustes.find((a) => a.chave === h.chave)?.nome ?? h.chave;
      const c = el("div", "pn-sub");
      c.append(el("b", "", nome), el("p", "pn-small", `${fmtData(h.criadoEm)} · motivo: ${h.motivo}`), el("p", "pn-mono", `${fmtNum(h.antes)}  →  ${fmtNum(h.depois)}`));
      c.append(botao("Desfazer", () => void desfazer(h.id)));
      return c;
    }

    async function desfazer(id: number) {
      try {
        await p.api("POST", `/balanceamento/desfazer/${id}`, {});
        p.aviso("Mudança desfeita.", "ok");
        await carregar();
      } catch (e) {
        p.aviso((e as Error).message, "erro");
      }
    }

    return {
      el: raiz,
      abrir() {
        void carregar();
      },
    };
  },
};
