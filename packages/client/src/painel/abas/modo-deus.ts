import type { AbaPainel, InstanciaAba, Painel } from "../tipos";
import { el, botao, secao, fmtNum, selo, vazio, carregando } from "../ui";
import { ITEMS, RARITY_NAME, AFIXOS, MAX_REFINO, GM_VEL_MIN, GM_VEL_MAX, GM_VINCULO_MSG } from "@frixep/shared";

/** resposta de GET /api/admin/modo-deus (o servidor é quem manda; aqui só se mostra) */
interface Estado {
  online: boolean;
  travas: boolean;
  zonas: { id: number; nome: string; w: number; h: number }[];
  zona?: { id: number; nome: string; w: number; h: number };
  personagem?: { nome: string; nivel: number; xp: number; x: number; y: number; hp: number; maxHp: number; morto: boolean };
  modo?: { ligado: boolean; invis: boolean; invuln: boolean; vel: number };
  jogadores?: { charId: string; nome: string }[];
}
interface ItemBusca { id: string; nome: string; tipo: string; raridade: string; empilha: number }

const INTERVALO_MS = 20_000;

/** campo rotulado (o mesmo visual dos formulários do painel) */
function campo(rotulo: string, controle: HTMLElement): HTMLElement {
  const c = el("label", "pn-campo");
  c.append(el("span", "", rotulo), controle);
  return c;
}
function numero(valor: number, min: number, max: number, passo = 1): HTMLInputElement {
  const i = el("input", "pn-in");
  i.type = "number";
  i.value = String(valor);
  i.min = String(min);
  i.max = String(max);
  i.step = String(passo);
  return i;
}
function selecao<T extends string | number>(opcoes: [T, string][]): HTMLSelectElement {
  const s = el("select", "pn-sel");
  for (const [v, t] of opcoes) s.append(new Option(t, String(v)));
  return s;
}

/** Modo Deus: ligar/desligar, invisível, invulnerável, velocidade, nível e XP, criador de itens, moedas, teleporte e ações rápidas. */
export const abaModoDeus: AbaPainel = {
  id: "modo-deus",
  titulo: "Modo Deus",
  montar(p: Painel): InstanciaAba {
    const raiz = el("div");
    let estado: Estado | null = null;
    let itemEscolhido: ItemBusca | null = null;
    const afixosEscolhidos: string[] = [];
    let timer: ReturnType<typeof setInterval> | undefined;

    const topo = el("div", "pn-row");
    const status = el("span");
    const atualizar = botao("Atualizar", () => void carregar());
    topo.append(status, atualizar, el("span", "pn-small", "As ações valem para o personagem que você está jogando agora."));
    const corpo = el("div");
    raiz.append(topo, corpo);

    /** executa uma ação no servidor; mostra o resultado e recarrega o estado */
    async function acao(corpoPedido: Record<string, unknown>, avisoOk?: string) {
      try {
        const r = await p.api<{ resumo: string }>("POST", "/modo-deus/acao", corpoPedido);
        p.aviso(avisoOk ?? r.resumo, "ok");
        void carregar();
      } catch (e) {
        p.aviso((e as Error).message, "erro");
      }
    }

    function secaoModo(e: Estado): HTMLElement {
      const m = e.modo!;
      const bloco = el("div", "pn-row");
      const ligar = botao(m.ligado ? "Desligar Modo Deus" : "Ligar Modo Deus", () => void acao({ acao: "modo", ligado: !m.ligado }));
      ligar.setAttribute("aria-pressed", String(m.ligado));
      const invis = botao(`Invisível: ${m.invis ? "sim" : "não"}`, () => void acao({ acao: "modo", invis: !m.invis }));
      const invuln = botao(`Invulnerável: ${m.invuln ? "sim" : "não"}`, () => void acao({ acao: "modo", invuln: !m.invuln }));
      invis.disabled = invuln.disabled = !m.ligado;
      invis.setAttribute("aria-pressed", String(m.invis));
      invuln.setAttribute("aria-pressed", String(m.invuln));
      bloco.append(ligar, invis, invuln);

      const vel = numero(m.vel, GM_VEL_MIN, GM_VEL_MAX, 0.5);
      vel.disabled = !m.ligado;
      const aplicarVel = botao("Aplicar velocidade", () => void acao({ acao: "modo", vel: Number(vel.value) }));
      aplicarVel.disabled = !m.ligado;
      const velRow = el("div", "pn-row");
      velRow.append(campo("Velocidade (1 a 4)", vel), aplicarVel);
      return secao("Modo", el("p", "pn-small", m.ligado ? "Modo Deus ligado: seu personagem leva a marca [GM] para outros admins." : "Desligado: nada muda para os jogadores."), bloco, velRow);
    }

    function secaoProgressao(e: Estado): HTMLElement {
      const nivel = numero(e.personagem?.nivel ?? 1, 1, 50);
      const xp = numero(1000, 1, 10_000_000);
      const bloco = el("div", "pn-row");
      bloco.append(
        campo("Definir nível", nivel), botao("Definir nível", () => void acao({ acao: "xp", nivel: Number(nivel.value) })),
        campo("XP a dar", xp), botao("Dar XP", () => void acao({ acao: "xp", xp: Number(xp.value) })),
      );
      return secao("Nível e XP", bloco);
    }

    function secaoItens(): HTMLElement {
      const busca = el("input", "pn-in");
      busca.type = "search";
      busca.placeholder = "Nome ou id do item";
      busca.setAttribute("aria-label", "Buscar item");
      const lista = el("div", "pn-list");
      const escolhido = el("p", "pn-small", "Nenhum item escolhido.");
      const qtd = numero(1, 1, 1);
      const refino = numero(0, 0, MAX_REFINO);
      const afixoSel = selecao<string>([["", "Afixo…"], ...AFIXOS.map((a): [string, string] => [a.id, a.nome])]);
      const afixosBox = el("div", "pn-row");
      const desenhaAfixos = () => {
        afixosBox.replaceChildren();
        for (const id of afixosEscolhidos) {
          const b = botao(`${AFIXOS.find((a) => a.id === id)?.nome ?? id} ✕`, () => { afixosEscolhidos.splice(afixosEscolhidos.indexOf(id), 1); desenhaAfixos(); });
          b.setAttribute("aria-label", `Remover afixo ${id}`);
          afixosBox.append(b);
        }
      };
      afixoSel.onchange = () => {
        if (afixoSel.value && !afixosEscolhidos.includes(afixoSel.value)) afixosEscolhidos.push(afixoSel.value);
        afixoSel.value = "";
        desenhaAfixos();
      };
      const criar = botao("Criar na mochila", () => {
        if (!itemEscolhido) return p.aviso("Escolha um item na lista.", "erro");
        void acao({ acao: "item", id: itemEscolhido.id, qtd: Number(qtd.value), refino: Number(refino.value), afixos: [...afixosEscolhidos] });
      });
      let busy: ReturnType<typeof setTimeout> | undefined;
      const buscar = async () => {
        try {
          const r = await p.api<{ itens: ItemBusca[] }>("GET", `/modo-deus/itens?q=${encodeURIComponent(busca.value)}`);
          lista.replaceChildren(...(r.itens.length ? r.itens.map((it) => {
            const b = botao(`${it.nome} · ${RARITY_NAME[it.raridade as keyof typeof RARITY_NAME] ?? it.raridade}`, () => {
              itemEscolhido = it;
              escolhido.textContent = `${it.nome} (${RARITY_NAME[it.raridade as keyof typeof RARITY_NAME] ?? it.raridade}), empilha até ${it.empilha}`;
              qtd.max = String(it.empilha);
              if (Number(qtd.value) > it.empilha) qtd.value = String(it.empilha);
            });
            b.setAttribute("aria-label", `Escolher ${it.nome}`);
            return b;
          }) : [vazio("Nenhum item com esse nome.")]));
        } catch (err) {
          p.aviso((err as Error).message, "erro");
        }
      };
      busca.oninput = () => { clearTimeout(busy); busy = setTimeout(() => void buscar(), 250); };
      const linhaQtd = el("div", "pn-row");
      linhaQtd.append(campo("Quantidade", qtd), campo(`Refino (+0 a +${MAX_REFINO})`, refino), campo("Afixos", afixoSel));
      desenhaAfixos();
      const dica = el("p", "pn-small", `Raridade: escolha a variante na lista (cada raridade é um item diferente). ${GM_VINCULO_MSG}`);
      void buscar();
      return secao("Criar item", campo("Buscar", busca), lista, escolhido, linhaQtd, afixosBox, dica, criar);
    }

    function secaoMoedas(): HTMLElement {
      const tipo = selecao<string>([["iron", "Tostões de Ferro"], ["obols", "Óbolos de Sangue"]]);
      const qtd = numero(1000, 1, 1_000_000_000);
      const bloco = el("div", "pn-row");
      bloco.append(campo("Moeda", tipo), campo("Quantidade", qtd), botao("Dar moedas", () => void acao({ acao: "moedas", tipo: tipo.value, qtd: Number(qtd.value) })));
      return secao("Moedas", bloco);
    }

    function secaoTeleporte(e: Estado): HTMLElement {
      const zona = selecao<number>(e.zonas.map((z): [number, string] => [z.id, `${z.nome} (zona ${z.id})`]));
      if (e.zona) zona.value = String(e.zona.id);
      const x = numero(e.personagem?.x ?? 0, 0, 999);
      const y = numero(e.personagem?.y ?? 0, 0, 999);
      const porCoord = el("div", "pn-row");
      porCoord.append(campo("Zona", zona), campo("X", x), campo("Y", y),
        botao("Teleportar", () => void acao({ acao: "teleporte", zona: Number(zona.value), x: Number(x.value), y: Number(y.value) })));
      const jogs = selecao<string>((e.jogadores ?? []).map((j): [string, string] => [j.charId, j.nome]));
      if (!e.jogadores?.length) jogs.append(new Option("(ninguém na zona)", ""));
      const porJogador = el("div", "pn-row");
      porJogador.append(campo("Ir até jogador desta zona", jogs), botao("Ir até ele", () => void acao({ acao: "teleporte", jogador: jogs.value })),
        botao("Puxar até mim", () => void acao({ acao: "puxar", jogador: jogs.value })), botao("Reviver", () => void acao({ acao: "reviver", jogador: jogs.value })));
      return secao("Teleporte", porCoord, el("p", "pn-small", "Coordenada de outra zona: o jogo leva você para lá e nasce no ponto pedido."), porJogador);
    }

    function secaoRapidas(): HTMLElement {
      const raio = numero(15, 0, 200);
      const bloco = el("div", "pn-row");
      bloco.append(
        botao("Curar-me por completo", () => void acao({ acao: "curar" })),
        campo("Raio dos monstros (0 = zona toda)", raio),
        botao("Matar monstros da área", () => void acao({ acao: "monstros", modo: "matar", raio: Number(raio.value) })),
        botao("Renascer monstros da área", () => void acao({ acao: "monstros", modo: "renascer", raio: Number(raio.value) })),
      );
      return secao("Ações rápidas", bloco);
    }

    function desenha(e: Estado) {
      status.replaceChildren(
        e.online ? selo(e.modo?.ligado ? "Modo Deus ligado" : "Modo Deus desligado", e.modo?.ligado ? "ok" : "neutro") : selo("fora do jogo", "atencao"),
        selo(e.travas ? "travas da economia ativas" : "travas desligadas (testes)", e.travas ? "ok" : "atencao"),
      );
      if (!e.online) {
        corpo.replaceChildren(vazio("Entre no jogo com o personagem de administrador para usar o Modo Deus. Você pode abrir esta aba enquanto joga."));
        return;
      }
      corpo.replaceChildren(
        secaoModo(e),
        secaoProgressao(e),
        secaoItens(),
        secaoMoedas(),
        secaoTeleporte(e),
        secaoRapidas(),
      );
    }

    async function carregar() {
      if (!estado) corpo.replaceChildren(carregando());
      try {
        estado = await p.api<Estado>("GET", "/modo-deus");
        desenha(estado);
      } catch (e) {
        corpo.replaceChildren();
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
