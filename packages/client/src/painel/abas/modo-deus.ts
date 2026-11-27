import type { AbaPainel, InstanciaAba, Painel } from "../tipos";
import { el, botao, secao, fmtNum, selo, vazio, carregando } from "../ui";
import {
  ITEMS, RARITY_NAME, RARITY_COLOR, RARITIES_ALL, SUFIXO_RARIDADE, AFIXOS, MAX_REFINO, GM_VEL_MIN, GM_VEL_MAX, GM_VINCULO_MSG,
  CLASS_DEFS, GEAR_CLASSES, WEAPON_TYPES, EQUIP_SLOT_NAME, KINDS_EQUIPAVEIS,
  type ItemDef, type CharClass, type Rarity,
} from "@frixep/shared";

// ---------------------------------------------------------------- catálogo do criador de itens

/** grupos do filtro "tipo" (o mesmo que o jogador vê nos espaços de equipamento) */
type Grupo = "weapon" | "offhand" | "helmet" | "armor" | "boots" | "cape" | "outros";
const GRUPOS: { id: Grupo; nome: string }[] = [
  { id: "weapon", nome: "Armas" }, { id: "offhand", nome: "Mão secundária" }, { id: "helmet", nome: "Elmos" },
  { id: "armor", nome: "Armaduras" }, { id: "boots", nome: "Botas" }, { id: "cape", nome: "Capas" }, { id: "outros", nome: "Consumíveis e materiais" },
];
const grupoDe = (d: ItemDef): Grupo => (KINDS_EQUIPAVEIS.includes(d.kind) ? (d.kind as Grupo) : "outros");
const semAcento = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();

/** colunas de raridade da grade: só as que existem no catálogo, na ordem do jogo (Lixo → Ancestral) */
const RARIDADES_GRADE: Rarity[] = RARITIES_ALL.filter((r) => Object.values(ITEMS).some((d) => d.rarity === r));
const SUFIXOS_RARIDADE = SUFIXO_RARIDADE.map((x) => ` ${x}`);

interface Familia { chave: string; nome: string; grupo: Grupo; cls?: CharClass; variantes: ItemDef[]; busca: string }
/** uma família = o mesmo item base em todas as raridades (id sem o sufixo da raridade) */
const FAMILIAS: Familia[] = (() => {
  const mapa = new Map<string, Familia>();
  for (const d of Object.values(ITEMS)) {
    const chave = d.id.replace(new RegExp(`_(${RARITIES_ALL.join("|")})$`), "");
    let f = mapa.get(chave);
    if (!f) {
      const nomeBase = d.wtype && WEAPON_TYPES[d.wtype] ? WEAPON_TYPES[d.wtype].name : SUFIXOS_RARIDADE.reduce((n, s) => (n.endsWith(s) ? n.slice(0, -s.length) : n), d.name);
      f = { chave, nome: nomeBase, grupo: grupoDe(d), cls: d.cls, variantes: [], busca: "" };
      mapa.set(chave, f);
    }
    f.variantes.push(d);
  }
  const ordemGrupo = (g: Grupo) => GRUPOS.findIndex((x) => x.id === g);
  const ordemClasse = (c?: CharClass) => (c ? GEAR_CLASSES.indexOf(c) : 99);
  return [...mapa.values()].map((f) => {
    f.variantes.sort((a, b) => RARITIES_ALL.indexOf(a.rarity) - RARITIES_ALL.indexOf(b.rarity));
    f.busca = semAcento([f.nome, f.chave, ...f.variantes.flatMap((v) => [v.name, v.id])].join(" "));
    return f;
  }).sort((a, b) => ordemGrupo(a.grupo) - ordemGrupo(b.grupo) || ordemClasse(a.cls) - ordemClasse(b.cls) || a.nome.localeCompare(b.nome, "pt-BR"));
})();

function icone(id: string, tam: number): HTMLElement {
  const box = el("span", "gmi-ic");
  box.style.width = box.style.height = `${tam}px`;
  const im = el("img");
  im.src = `/assets/items/item_${id}.png`;
  im.alt = "";
  im.draggable = false;
  im.onerror = () => { im.remove(); box.classList.add("sem"); };
  box.append(im);
  return box;
}
function tipoDoItem(d: ItemDef): string {
  if (d.kind === "weapon") return `${d.wtype && WEAPON_TYPES[d.wtype] ? WEAPON_TYPES[d.wtype].name : "Arma"} · ${d.hands === 2 ? "duas mãos" : "uma mão"}`;
  if (KINDS_EQUIPAVEIS.includes(d.kind)) return EQUIP_SLOT_NAME[d.kind as keyof typeof EQUIP_SLOT_NAME];
  return d.kind === "potion" ? "Poção" : "Material";
}
function atributosDoItem(d: ItemDef): [string, string][] {
  const a: [string, string][] = [["Nível mínimo", String(d.minLevel)]];
  if (d.dmgPct) a.push(["Dano e cura", `+${d.dmgPct}%`]);
  if (d.hp) a.push(["Vida", `+${d.hp}`]);
  if (d.crit) a.push(["Crítico", `+${d.crit}`]);
  if (d.dr) a.push(["Redução de dano", `${d.dr}%`]);
  if (d.cdr) a.push(["Recarga", `-${d.cdr}%`]);
  if (d.mana) a.push(["Recurso máx.", `+${d.mana}`]);
  if (d.regen) a.push(["Regeneração", `+${d.regen}/s`]);
  if (d.heal) a.push(["Cura", `${d.heal}`]);
  a.push(["Empilha", `até ${d.stack}`], ["Id", d.id]);
  return a;
}

/** estilos do criador (uma vez por página; usa as variáveis --pn-* do painel) */
function estiloCriador(): void {
  const s = (document.getElementById("gmi-css") as HTMLStyleElement | null) ?? document.createElement("style");
  s.id = "gmi-css";
  s.textContent = `
.pn-sec:has(>.gmi-grade){container-type:inline-size}
.gmi-grade{display:grid;grid-template-columns:minmax(0,1fr) 268px;gap:12px;align-items:start}
@container (max-width:640px){.gmi-grade{grid-template-columns:1fr}.gmi-ficha{position:static}}
.gmi-catalogo{container-type:inline-size;min-width:0;border:1px solid var(--pn-linha);border-radius:var(--pn-r);background:rgba(3,8,14,.55);overflow:hidden}
.gmi-filtros{display:flex;flex-direction:column;gap:8px;padding:12px;border-bottom:1px solid var(--pn-linha);background:linear-gradient(180deg,rgba(21,36,58,.55),rgba(8,14,24,.3))}
.gmi-linha-busca{display:flex;align-items:center;gap:10px}
.gmi-busca{flex:1;min-width:0}
.gmi-cont{white-space:nowrap;font-family:var(--pn-mono);color:var(--pn-txt-2)}
.gmi-chips{display:flex;flex-wrap:wrap;gap:6px}
.gmi-chip{min-height:28px;padding:0 11px;border-radius:999px;cursor:pointer;color:var(--pn-txt-2);background:rgba(8,16,28,.7);border:1px solid var(--pn-linha);font:700 10px/1 var(--pn-titulo);letter-spacing:.08em;text-transform:uppercase}
.gmi-chip:hover{color:var(--pn-txt);border-color:rgba(230,185,96,.45)}
.gmi-chip[data-ativo="true"]{color:#1a1206;background:linear-gradient(180deg,var(--pn-ouro-2),var(--pn-ouro));border-color:var(--pn-ouro-2)}
.gmi-cab,.gmi-linha{display:grid;grid-template-columns:minmax(0,1fr) repeat(${RARIDADES_GRADE.length},42px);gap:4px;align-items:center;padding:0 12px}
.gmi-nome-txt{display:flex;flex-direction:column;min-width:0;line-height:1.2}
.gmi-nome-txt b{font-weight:400;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.gmi-nome-txt small{font-size:11px;color:var(--pn-txt-2);overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.gmi-cab{position:sticky;top:0;z-index:1;min-height:30px;background:rgba(7,14,24,.96);border-bottom:1px solid var(--pn-linha);font:700 9px/1 var(--pn-titulo);letter-spacing:.08em;text-transform:uppercase;color:var(--pn-txt-2)}
.gmi-cab-r{text-align:center;overflow:hidden;white-space:nowrap;font-size:8px;letter-spacing:0}
.gmi-lista{max-height:430px;overflow-y:auto;overscroll-behavior:contain}
.gmi-linha{min-height:44px;border-bottom:1px solid rgba(160,200,240,.06)}
.gmi-linha:hover{background:rgba(255,213,138,.035)}
.gmi-nome{display:flex;align-items:center;gap:10px;min-width:0;font-size:14px}
.gmi-ic{flex:none;display:inline-grid;place-items:center;border-radius:6px;background:radial-gradient(circle at 50% 40%,rgba(255,255,255,.06),rgba(0,0,0,.35));border:1px solid rgba(160,200,240,.12)}
.gmi-ic img{width:100%;height:100%;object-fit:contain;image-rendering:pixelated}
.gmi-ic.sem::after{content:"◇";color:var(--pn-txt-2);opacity:.5}
.gmi-r{height:28px;padding:0;border-radius:5px;cursor:pointer;font:700 10px/1 var(--pn-titulo);letter-spacing:.04em;text-transform:uppercase;
  color:var(--c);background:color-mix(in srgb,var(--c) 10%,transparent);border:1px solid color-mix(in srgb,var(--c) 45%,transparent)}
.gmi-r:hover{background:color-mix(in srgb,var(--c) 22%,transparent);border-color:var(--c)}
.gmi-r[data-sel="true"]{color:#0a0d12;background:var(--c);border-color:var(--c);box-shadow:0 0 10px color-mix(in srgb,var(--c) 55%,transparent)}
.gmi-r.vazio{display:grid;place-items:center;cursor:default;color:rgba(160,200,240,.2);background:none;border:none}
.gmi-r:focus-visible,.gmi-chip:focus-visible,.gmi-afixo:focus-visible{outline:2px solid var(--pn-ouro-2);outline-offset:2px}
.gmi-ficha{position:sticky;top:0;display:flex;flex-direction:column;gap:12px;padding:14px;border-radius:var(--pn-r);
  border:1px solid color-mix(in srgb,var(--c,#e6b960) 40%,var(--pn-linha));background:linear-gradient(180deg,color-mix(in srgb,var(--c,#15243a) 9%,rgba(13,24,40,.95)),rgba(5,10,18,.95))}
.gmi-ficha-vazia{margin:24px 4px;text-align:center;color:var(--pn-txt-2);font-size:13px}
.gmi-ficha-topo{display:flex;gap:12px;align-items:center}
.gmi-moldura .gmi-ic{border-color:color-mix(in srgb,var(--c) 55%,transparent);box-shadow:inset 0 0 18px color-mix(in srgb,var(--c) 22%,transparent)}
.gmi-ficha-nome{margin:0 0 4px;font:700 15px/1.25 var(--pn-titulo)}
.gmi-ficha-sub{font-size:12px;color:var(--pn-txt-2)}
.gmi-attr{display:grid;grid-template-columns:auto 1fr;gap:4px 12px;margin:0;padding:10px 0;border-top:1px solid var(--pn-linha);border-bottom:1px solid var(--pn-linha);font-size:12.5px}
.gmi-attr dt{color:var(--pn-txt-2)}
.gmi-attr dd{margin:0;text-align:right;font-family:var(--pn-mono);color:var(--pn-txt);overflow-wrap:anywhere}
.gmi-opcoes{display:flex;flex-direction:column;gap:8px}
.gmi-opcoes .pn-campo{display:flex;flex-direction:column;gap:4px;font-size:12px;color:var(--pn-txt-2)}
.gmi-opcoes .pn-in,.gmi-opcoes .pn-sel{width:100%}
.gmi-afixos{display:flex;flex-wrap:wrap;gap:6px}
.gmi-afixos:empty{display:none}
.gmi-afixo{min-height:26px;padding:0 9px;border-radius:999px;cursor:pointer;color:var(--pn-txt);background:rgba(127,227,164,.08);border:1px solid rgba(127,227,164,.35);font:400 12px Georgia,serif}
.gmi-criar{width:100%;min-height:44px;color:#1a1206;background:linear-gradient(180deg,var(--pn-ouro-2),var(--pn-ouro));border-color:var(--pn-ouro-2)}
.gmi-criar:hover{filter:brightness(1.08)}
.gmi-aviso{margin:0;font-size:11px;line-height:1.4;color:var(--pn-txt-2)}
@container (max-width:460px){.gmi-cab,.gmi-linha{grid-template-columns:minmax(0,1fr) repeat(${RARIDADES_GRADE.length},32px);gap:3px;padding:0 8px}
  .gmi-cab-r{font-size:0}.gmi-cab-r::before{content:"◆";font-size:10px}}
`;
  if (!s.isConnected) document.head.append(s);
}

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

    /**
     * Criador de itens: catálogo por família (uma linha por item base, com as raridades lado a lado na cor de cada uma),
     * filtros de tipo e classe, e uma ficha fixa à direita com ícone, atributos e as opções de criação.
     * Montado UMA vez (a atualização periódica da aba não apaga a escolha).
     */
    function secaoItens(): HTMLElement {
      estiloCriador();
      let filtroTipo: Grupo | "todos" = "todos";
      let filtroClasse: CharClass | "todas" = "todas";

      const busca = el("input", "pn-in gmi-busca");
      busca.type = "search";
      busca.placeholder = "Buscar por nome ou id…";
      busca.setAttribute("aria-label", "Buscar item");

      const chipsTipo = el("div", "gmi-chips");
      chipsTipo.setAttribute("role", "group");
      chipsTipo.setAttribute("aria-label", "Filtrar por tipo");
      const chipsClasse = el("div", "gmi-chips");
      chipsClasse.setAttribute("role", "group");
      chipsClasse.setAttribute("aria-label", "Filtrar por classe");
      const chip = (rotulo: string, ativo: () => boolean, escolher: () => void) => {
        const b = botao(rotulo, () => { escolher(); desenhaChips(); desenhaLista(); }, "gmi-chip");
        b.dataset.ativo = String(ativo());
        b.setAttribute("aria-pressed", String(ativo()));
        return b;
      };
      const desenhaChips = () => {
        chipsTipo.replaceChildren(chip("Todos", () => filtroTipo === "todos", () => { filtroTipo = "todos"; }),
          ...GRUPOS.map((g) => chip(g.nome, () => filtroTipo === g.id, () => { filtroTipo = g.id; })));
        chipsClasse.replaceChildren(chip("Todas as classes", () => filtroClasse === "todas", () => { filtroClasse = "todas"; }),
          ...GEAR_CLASSES.map((c) => chip(CLASS_DEFS[c].name, () => filtroClasse === c, () => { filtroClasse = c; })));
      };

      const cabecalho = el("div", "gmi-cab");
      cabecalho.append(el("span", "", "Item"), ...RARIDADES_GRADE.map((r) => {
        const s = el("span", "gmi-cab-r", RARITY_NAME[r]);
        s.style.color = RARITY_COLOR[r];
        return s;
      }));
      const lista = el("div", "gmi-lista");
      const contagem = el("span", "pn-small gmi-cont");

      const desenhaLista = () => {
        const alvo = semAcento(busca.value);
        const fams = FAMILIAS.filter((f) =>
          (filtroTipo === "todos" || f.grupo === filtroTipo) &&
          (filtroClasse === "todas" || !f.cls || f.cls === filtroClasse) &&
          (!alvo || f.busca.includes(alvo)));
        contagem.textContent = `${fams.length} ${fams.length === 1 ? "item" : "itens"}`;
        if (!fams.length) { lista.replaceChildren(vazio("Nenhum item com esse filtro.")); return; }
        lista.replaceChildren(...fams.map((f) => {
          const linhaF = el("div", "gmi-linha");
          const nome = el("div", "gmi-nome");
          const base = f.variantes[0];
          const txt = el("span", "gmi-nome-txt");
          txt.append(el("b", "", f.nome), el("small", "", [f.cls ? CLASS_DEFS[f.cls].name : "Todas as classes", GRUPOS.find((g) => g.id === f.grupo)?.nome ?? ""].join(" · ")));
          nome.append(icone(base.id, 32), txt);
          nome.title = f.nome;
          linhaF.append(nome);
          for (const r of RARIDADES_GRADE) {
            const d = f.variantes.find((v) => v.rarity === r);
            if (!d) { linhaF.append(el("span", "gmi-r vazio", "·")); continue; }
            const b = botao(RARITY_NAME[r].slice(0, 3), () => escolher(d), "gmi-r");
            b.style.setProperty("--c", RARITY_COLOR[r]);
            b.title = `${d.name} (${RARITY_NAME[r]})`;
            b.setAttribute("aria-label", `Escolher ${d.name}, ${RARITY_NAME[r]}`);
            b.dataset.sel = String(escolhidoId === d.id);
            linhaF.append(b);
          }
          return linhaF;
        }));
      };

      // ---- ficha do item escolhido
      let escolhidoId: string | null = null;
      const ficha = el("aside", "gmi-ficha");
      const qtd = numero(1, 1, 1);
      const refino = numero(0, 0, MAX_REFINO);
      const afixoSel = selecao<string>([["", "Adicionar afixo…"], ...AFIXOS.map((a): [string, string] => [a.id, a.nome])]);
      const afixosBox = el("div", "gmi-afixos");
      const desenhaAfixos = () => {
        afixosBox.replaceChildren(...afixosEscolhidos.map((id) => {
          const b = botao(`${AFIXOS.find((a) => a.id === id)?.nome ?? id}  ✕`, () => { afixosEscolhidos.splice(afixosEscolhidos.indexOf(id), 1); desenhaAfixos(); }, "gmi-afixo");
          b.setAttribute("aria-label", `Remover afixo ${id}`);
          return b;
        }));
      };
      afixoSel.onchange = () => {
        if (afixoSel.value && !afixosEscolhidos.includes(afixoSel.value)) afixosEscolhidos.push(afixoSel.value);
        afixoSel.value = "";
        desenhaAfixos();
      };
      const criar = botao("Criar na mochila", () => {
        if (!itemEscolhido) return p.aviso("Escolha um item no catálogo.", "erro");
        void acao({ acao: "item", id: itemEscolhido.id, qtd: Number(qtd.value), refino: Number(refino.value), afixos: [...afixosEscolhidos] });
      }, "pn-btn gmi-criar");

      function escolher(d: ItemDef) {
        escolhidoId = d.id;
        itemEscolhido = { id: d.id, nome: d.name, tipo: d.kind, raridade: d.rarity, empilha: d.stack };
        qtd.max = String(d.stack);
        if (Number(qtd.value) > d.stack) qtd.value = String(d.stack);
        desenhaFicha();
        desenhaLista();
      }

      function desenhaFicha() {
        const d = escolhidoId ? ITEMS[escolhidoId] : null;
        if (!d) {
          ficha.replaceChildren(el("p", "gmi-ficha-vazia", "Escolha uma raridade no catálogo para ver o item aqui."));
          return;
        }
        const cor = RARITY_COLOR[d.rarity];
        ficha.style.setProperty("--c", cor);
        const topoF = el("div", "gmi-ficha-topo");
        const moldura = el("div", "gmi-moldura");
        moldura.append(icone(d.id, 72));
        const tit = el("div");
        const nm = el("h4", "gmi-ficha-nome", d.name);
        nm.style.color = cor;
        tit.append(nm, el("div", "gmi-ficha-sub", `${RARITY_NAME[d.rarity]} · ${tipoDoItem(d)}${d.cls ? ` · ${CLASS_DEFS[d.cls].name}` : ""}`));
        topoF.append(moldura, tit);

        const atributos = el("dl", "gmi-attr");
        for (const [rot, val] of atributosDoItem(d)) atributos.append(el("dt", "", rot), el("dd", "", val));

        const opcoes = el("div", "gmi-opcoes");
        const equip = KINDS_EQUIPAVEIS.includes(d.kind);
        opcoes.append(campo(`Quantidade (até ${d.stack})`, qtd));
        if (equip) opcoes.append(campo(`Refino (+0 a +${MAX_REFINO})`, refino), campo("Afixos", afixoSel));
        refino.disabled = afixoSel.disabled = !equip;
        ficha.replaceChildren(topoF, atributos, opcoes, ...(equip ? [afixosBox] : []), criar, el("p", "gmi-aviso", GM_VINCULO_MSG));
      }

      let espera: ReturnType<typeof setTimeout> | undefined;
      busca.oninput = () => { clearTimeout(espera); espera = setTimeout(desenhaLista, 120); };

      const filtros = el("div", "gmi-filtros");
      const linhaBusca = el("div", "gmi-linha-busca");
      linhaBusca.append(busca, contagem);
      filtros.append(linhaBusca, chipsTipo, chipsClasse);
      const catalogo = el("div", "gmi-catalogo");
      catalogo.append(filtros, cabecalho, lista);
      const grade = el("div", "gmi-grade");
      grade.append(catalogo, ficha);

      desenhaChips();
      desenhaAfixos();
      desenhaLista();
      desenhaFicha();
      return secao("Criar item", grade);
    }
    const blocoItens = secaoItens(); // uma vez só: a atualização de 20 s não perde a escolha

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
        blocoItens,
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
