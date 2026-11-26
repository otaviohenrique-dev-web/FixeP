import type { AbaPainel, InstanciaAba, Painel } from "../tipos";
import { el, botao, linha, secao, vazio, fmtNum, fmtData, ACOES_LEGIVEIS } from "../ui";

/**
 * Jogadores: busca por nome e ficha (só leitura), com as sanções. O e-mail aparece mascarado; "Revelar" mostra o
 * completo, um por vez, e o servidor registra cada revelação na auditoria.
 */

const CLASSES: Record<string, string> = { warrior: "Guerreiro", archer: "Arqueiro", cleric: "Clérigo", mage: "Mago" };
const SLOTS: Record<string, string> = { weapon: "Arma", offhand: "Mão secundária", helmet: "Elmo", armor: "Armadura", boots: "Botas", ring: "Anel", amulet: "Amuleto" };

interface Item { id: string; nome: string; classe: string; nivel: number; zona: number; emailMascarado: string | null; online: boolean }
interface Sancao { silenciadoAte: string | null; banido: boolean; banidoAte: string | null; motivo: string | null }
interface Ficha {
  id: string; nome: string; classe: string; nivel: number; xp: number; zona: number; poder: number;
  criadoEm: string; contaCriadaEm: string; emailMascarado: string | null; temEmail: boolean; online: boolean;
  tostoes: number; obolos: number;
  inventario: { slot: number; item: string; qtd: number }[];
  equipamento: Record<string, string | null>;
  sancao: Sancao;
  logins: string[];
  historico: { id: number; criado_em: string; admin: string | null; acao: string; detalhes: Record<string, unknown> }[];
}

export const abaJogadores: AbaPainel = {
  id: "jogadores",
  titulo: "Jogadores",
  montar(p: Painel): InstanciaAba {
    const raiz = el("div");
    const busca = el("div");
    const ficha = el("div", "pn-hide");
    raiz.append(busca, ficha);

    // o e-mail revelado por último (só um por vez): ao revelar outro, o anterior volta a ser mascarado
    let ocultarUltimo: (() => void) | null = null;

    /** e-mail mascarado + botão Revelar/Ocultar. Usado na lista e na ficha. */
    function blocoEmail(id: string, mascarado: string | null, temEmail: boolean): { el: HTMLElement; valor: HTMLElement; botao: HTMLButtonElement } {
      const valor = el("span", "pn-val", mascarado ?? "sem e-mail");
      const b = botao("Revelar", () => {
        if (b.textContent === "Ocultar") { ocultarUltimo?.(); return; }
        b.disabled = true;
        void (async () => {
          try {
            const { email } = await p.api<{ email: string }>("POST", `/jogadores/${id}/revelar`);
            ocultarUltimo?.();
            valor.textContent = email;
            b.textContent = "Ocultar";
            ocultarUltimo = () => { valor.textContent = mascarado ?? "sem e-mail"; b.textContent = "Revelar"; ocultarUltimo = null; };
          } catch (e) {
            p.aviso((e as Error).message, "erro");
          } finally {
            b.disabled = false;
          }
        })();
      });
      b.disabled = !temEmail;
      const wrap = el("div", "pn-row");
      wrap.append(valor, b);
      return { el: wrap, valor, botao: b };
    }

    // ---- busca
    const entrada = el("input", "pn-in");
    entrada.type = "search";
    entrada.placeholder = "Nome do jogador (2 letras ou mais)";
    entrada.setAttribute("aria-label", "Buscar jogador pelo nome");
    entrada.autocomplete = "off";
    const resultados = el("div");
    const formBusca = el("form", "pn-row");
    formBusca.append(entrada, botao("Buscar", () => void buscar()));
    formBusca.onsubmit = (e) => { e.preventDefault(); void buscar(); };
    busca.append(formBusca, resultados);

    async function buscar() {
      const q = entrada.value.trim();
      if (q.length < 2) return resultados.replaceChildren(vazio("Digite pelo menos 2 letras do nome."));
      try {
        const { itens } = await p.api<{ itens: Item[] }>("GET", `/jogadores?q=${encodeURIComponent(q)}`);
        resultados.replaceChildren(...(itens.length ? itens.map(linhaJogador) : [vazio("Nenhum jogador com esse nome.")]));
      } catch (e) {
        p.aviso((e as Error).message, "erro");
      }
    }

    function linhaJogador(it: Item): HTMLElement {
      const linhaEl = el("div", "pn-item");
      const nome = el("button", "pn-btn");
      nome.type = "button";
      nome.textContent = `${it.nome}`;
      nome.setAttribute("aria-label", `Abrir ficha de ${it.nome}`);
      nome.onclick = () => void abrirFicha(it.id);
      const info = el("span", "pn-small", `${CLASSES[it.classe] ?? it.classe} · nível ${it.nivel} · zona ${it.zona}`);
      const estado = el("span", it.online ? "pn-tag" : "pn-tag off", it.online ? "online" : "offline");
      linhaEl.append(nome, info, estado, blocoEmail(it.id, it.emailMascarado, !!it.emailMascarado).el);
      return linhaEl;
    }

    // ---- ficha
    async function abrirFicha(id: string) {
      try {
        const f = await p.api<Ficha>("GET", `/jogadores/${id}`);
        ocultarUltimo?.();
        ficha.replaceChildren(...montarFicha(f));
        busca.classList.add("pn-hide");
        ficha.classList.remove("pn-hide");
      } catch (e) {
        p.aviso((e as Error).message, "erro");
      }
    }

    function voltarBusca() {
      ocultarUltimo?.();
      ficha.classList.add("pn-hide");
      busca.classList.remove("pn-hide");
    }

    function montarFicha(f: Ficha): HTMLElement[] {
      const topo = el("div", "pn-row");
      topo.append(botao("← Voltar à busca", voltarBusca), el("b", "", f.nome));

      const personagem = secao("Personagem",
        linha("Classe", CLASSES[f.classe] ?? f.classe), linha("Nível", f.nivel), linha("XP", fmtNum(f.xp)),
        linha("Poder total", fmtNum(f.poder)), linha("Zona", f.zona), linha("Criado em", fmtData(f.criadoEm)),
        linha("Situação", f.online ? "Online agora" : "Offline"));

      const email = blocoEmail(f.id, f.emailMascarado, f.temEmail);
      const conta = secao("Conta",
        rotuloEmail(email.el),
        el("p", "pn-small", "Cada revelação fica registrada na auditoria."),
        linha("Conta criada em", fmtData(f.contaCriadaEm)));

      const recursos = secao("Tostões e Óbolos", linha("Tostões de Ferro", fmtNum(f.tostoes)), linha("Óbolos de Sangue", fmtNum(f.obolos)));

      const equipLista = Object.entries(f.equipamento).filter(([, v]) => v);
      const equip = secao("Equipamento (só leitura)", equipLista.length
        ? listaSimples(equipLista.map(([slot, nome]) => `${SLOTS[slot] ?? slot}: ${nome}`))
        : vazio("Nada vestido."));

      const inv = secao("Inventário (só leitura)", f.inventario.length
        ? listaSimples(f.inventario.map((it) => `${it.item}${it.qtd > 1 ? ` × ${fmtNum(it.qtd)}` : ""}`))
        : vazio("Inventário vazio."));

      const logins = secao("Últimos logins", f.logins.length ? listaSimples(f.logins.map((l) => fmtData(l))) : vazio("Nenhum login registrado."));

      const grade = el("div", "pn-grid");
      grade.style.gridTemplateColumns = "repeat(auto-fit,minmax(260px,1fr))";
      grade.append(personagem, conta, recursos, equip, inv, logins);

      return [topo, grade, sancoesSecao(f), historicoSecao(f), acaoSecao(f)];
    }

    function rotuloEmail(valor: HTMLElement): HTMLElement {
      const d = el("div", "pn-linha");
      d.append(el("span", "pn-rot", "E-mail"), valor);
      return d;
    }

    function sancoesSecao(f: Ficha): HTMLElement {
      const s = f.sancao;
      const ativos: string[] = [];
      if (s.banido) ativos.push(s.banidoAte ? `Banido até ${fmtData(s.banidoAte)}` : "Banido (permanente)");
      if (s.silenciadoAte && new Date(s.silenciadoAte).getTime() > Date.now()) ativos.push(`Silenciado até ${fmtData(s.silenciadoAte)}`);
      return secao("Sanções ativas", ...(ativos.length ? ativos.map((t) => el("p", "", t)) : [vazio("Sem sanções ativas.")]));
    }

    function historicoSecao(f: Ficha): HTMLElement {
      const acoes = f.historico.filter((h) => h.acao !== "entrar_painel");
      if (!acoes.length) return secao("Histórico de ações", vazio("Nenhuma ação registrada para este jogador."));
      return secao("Histórico de ações", listaSimples(acoes.map((h) => {
        const motivo = typeof h.detalhes?.motivo === "string" && h.detalhes.motivo ? ` — ${h.detalhes.motivo}` : "";
        return `${fmtData(h.criado_em)} · ${ACOES_LEGIVEIS[h.acao] ?? h.acao} · por ${h.admin ?? "admin"}${motivo}`;
      })));
    }

    function acaoSecao(f: Ficha): HTMLElement {
      const acao = el("select", "pn-sel");
      acao.setAttribute("aria-label", "Ação de sanção");
      const opcoes: [string, string][] = [["silenciar", "Silenciar"], ["dessilenciar", "Retirar silêncio"], ["banir", "Banir"], ["desbanir", "Desbanir"], ["expulsar", "Expulsar da sessão"]];
      for (const [v, t] of opcoes) { const o = el("option", "", t); o.value = v; acao.append(o); }

      const minutos = el("input", "pn-in");
      minutos.type = "number"; minutos.min = "1"; minutos.placeholder = "minutos"; minutos.setAttribute("aria-label", "Minutos");
      const permanente = el("input");
      permanente.type = "checkbox"; permanente.id = "pn-perm";
      const rotPerm = el("label", "", " permanente");
      rotPerm.htmlFor = "pn-perm";
      const caixaPerm = el("div", "pn-row");
      caixaPerm.append(permanente, rotPerm);
      const motivo = el("input", "pn-in");
      motivo.placeholder = "motivo (opcional)"; motivo.maxLength = 200; motivo.setAttribute("aria-label", "Motivo");
      const enviar = botao("Aplicar", () => void aplicar(), "pn-btn perigo");

      const ajustarCampos = () => {
        const v = acao.value;
        minutos.classList.toggle("pn-hide", v !== "silenciar" && v !== "banir");
        caixaPerm.classList.toggle("pn-hide", v !== "banir");
        motivo.classList.toggle("pn-hide", v === "dessilenciar" || v === "desbanir");
      };
      acao.onchange = ajustarCampos;
      ajustarCampos();

      async function aplicar() {
        const v = acao.value;
        const corpo: Record<string, unknown> = { acao: v, motivo: motivo.value.trim() };
        if (v === "silenciar" || (v === "banir" && !permanente.checked)) {
          const n = Number(minutos.value);
          if (!Number.isInteger(n) || n < 1) return p.aviso("Informe os minutos (número inteiro, 1 ou mais).", "erro");
          corpo.minutos = n;
        }
        if (v === "banir") corpo.permanente = permanente.checked;
        if (v === "banir" && !window.confirm(`Banir ${f.nome}${permanente.checked ? " para sempre" : ""}?`)) return;
        if (v === "expulsar" && !window.confirm(`Expulsar ${f.nome} da sessão? O jogador pode entrar de novo.`)) return;
        enviar.disabled = true;
        try {
          const out = await p.api<{ resumo: string }>("POST", `/jogadores/${f.id}/sancao`, corpo);
          p.aviso(`${f.nome}: ${out.resumo}.`, "ok");
          await abrirFicha(f.id);
        } catch (e) {
          p.aviso((e as Error).message, "erro");
        } finally {
          enviar.disabled = false;
        }
      }

      return secao("Aplicar sanção", acao, minutos, caixaPerm, motivo, enviar);
    }

    return {
      el: raiz,
      abrir(param?: unknown) {
        const id = (param as { ficha?: string } | undefined)?.ficha;
        if (id) { void abrirFicha(id); return; }
        voltarBusca();
        entrada.focus();
      },
      fechar() {
        ocultarUltimo?.();
      },
    };
  },
};

function listaSimples(itens: string[]): HTMLElement {
  const ul = el("ul", "pn-list");
  for (const t of itens) ul.append(el("li", "", t));
  return ul;
}
