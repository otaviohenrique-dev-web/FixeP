import type { AbaPainel, InstanciaAba, Painel } from "../tipos";
import { el, botao, vazio, fmtData, fmtNum } from "../ui";
import { ITEMS } from "@frixep/shared";

interface Ajuste { chave: string; nome: string; grupo: string; padrao: number; min: number; max: number; atual: number; alterado: boolean; unidade?: string; escala?: number }
interface Tabela { item: string; chance: number; min: number; max: number }
interface Estimativa { tipo: string; nome: string; nivel: number; zonas: { id: number; nome: string }[]; vida: number; xp: number; respawnS: number; golpes: Record<string, number>; xpPorMinuto: Record<string, number> }
interface Lista { ajustes: Ajuste[]; drops: Record<string, Tabela[]>; estimativas: Estimativa[] }
interface Historico { id: number; chave: string; antes: number; depois: number; motivo: string; conta: string; criadoEm: string }
interface Sprite { png: string; frame: { x: number; y: number; w: number; h: number }; size: { w: number; h: number } }

const CLASSES: Record<string, string> = { warrior: "Guerreiro", archer: "Arqueiro", cleric: "Clérigo", mage: "Mago" };
const ESTILO = `
.bal-root{display:flex;flex-direction:column;gap:12px;max-height:72vh;overflow-y:auto;padding-right:4px}
.bal-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(230px,1fr));gap:10px}
.bal-duas{display:grid;grid-template-columns:1fr 1fr;gap:12px;align-items:start}
@media (max-width:640px){.bal-duas{grid-template-columns:1fr}.bal-root{max-height:none;overflow:visible}}
.bal-card{cursor:pointer;border:1px solid #3a3530;border-radius:8px;padding:10px;display:flex;gap:10px;align-items:center;background:#1c1916}
.bal-card.sel{border-color:#c9a24a}
.bal-thumb{width:72px;height:72px;flex:0 0 72px;display:flex;align-items:center;justify-content:center;overflow:hidden}
.bal-sprite{background-repeat:no-repeat;transform-origin:center}
.bal-disco{width:40px;height:40px;border-radius:50%;opacity:.7}
.bal-ic{width:40px;height:40px;object-fit:contain;flex:0 0 40px}
.bal-ic-fb{width:40px;height:40px;flex:0 0 40px;display:flex;align-items:center;justify-content:center;background:#2a2620;border-radius:6px;font-size:12px}
.bal-row{display:flex;flex-wrap:wrap;gap:6px;align-items:center}
.bal-num{width:90px}
.bal-tab{width:100%;border-collapse:collapse;font-size:13px}
.bal-tab td{padding:4px 2px;border-bottom:1px solid #2e2a25;vertical-align:middle}
.bal-confirma{border:1px dashed #c9a24a;border-radius:6px;padding:8px;margin-top:6px;display:flex;flex-direction:column;gap:6px}
`;

/**
 * Balanceamento ao vivo: uma lista de cartões (inimigos, classes, habilidades e global). Ao abrir um cartão:
 * valores com o padrão e a diferença em %, a tabela de drops (ícone, chance, quantidade, adicionar e tirar),
 * a estimativa de golpes e XP/min, e o histórico com desfazer. Cada mudança pede motivo e mostra antes e depois.
 */
export const abaBalanceamento: AbaPainel = {
  id: "balanceamento",
  titulo: "Balanceamento",
  montar(p: Painel): InstanciaAba {
    let dados: Lista = { ajustes: [], drops: {}, estimativas: [] };
    let historico: Historico[] = [];
    let selecionado: string | null = null; // id do cartão aberto
    let zonaFiltro = "";

    if (!document.getElementById("bal-css")) {
      const st = el("style");
      st.id = "bal-css";
      st.textContent = ESTILO;
      document.head.append(st);
    }

    const raiz = el("div", "bal-root");
    const busca = el("input", "pn-in");
    busca.type = "search";
    busca.placeholder = "Buscar inimigo, classe ou valor";
    busca.setAttribute("aria-label", "Buscar no balanceamento");
    busca.oninput = () => render();
    const zona = el("select", "pn-in");
    zona.setAttribute("aria-label", "Filtrar por zona");
    zona.onchange = () => { zonaFiltro = zona.value; render(); };
    const topo = el("div", "bal-row");
    topo.append(busca, zona, botao("Atualizar", () => void carregar()));
    const corpo = el("div");
    raiz.append(topo, corpo);

    const grupoDe = (a: Ajuste) => a.grupo;
    const tipoDe = (a: Ajuste) => a.chave.split(".")[1];

    async function carregar() {
      try {
        dados = await p.api<Lista>("GET", "/balanceamento");
        const zs = new Map<number, string>();
        dados.estimativas.forEach((e) => e.zonas.forEach((z) => zs.set(z.id, z.nome)));
        zona.replaceChildren(new Option("Todas as zonas", ""), ...[...zs].map(([id, nome]) => new Option(nome, String(id))));
        zona.value = zonaFiltro;
        const h = await p.api<{ historico: Historico[] }>("GET", "/balanceamento/historico");
        historico = h.historico;
        render();
      } catch (e) {
        p.aviso((e as Error).message, "erro");
      }
    }

    /** cartões: inimigos (com imagem) e os grupos de classes, habilidades e global */
    function render() {
      const termo = busca.value.trim().toLowerCase();
      const ests = dados.estimativas.filter((e) => (!zonaFiltro || e.zonas.some((z) => String(z.id) === zonaFiltro)) && (!termo || e.nome.toLowerCase().includes(termo) || e.tipo.includes(termo)));
      const grupos = [...new Set(dados.ajustes.filter((a) => !a.chave.startsWith("inimigo.")).map(grupoDe))].filter((g) => !termo || g.toLowerCase().includes(termo) || dados.ajustes.some((a) => grupoDe(a) === g && a.nome.toLowerCase().includes(termo)));
      const grid = el("div", "bal-grid");
      for (const e of ests) grid.append(cartaoInimigo(e));
      for (const g of grupos) if (!zonaFiltro) grid.append(cartaoGrupo(g));
      const detalhe = selecionado ? detalheDe(selecionado) : null;
      corpo.replaceChildren(...(detalhe ? [detalhe] : []), el("p", "pn-small", "Padrão = valor do código. Toda mudança pede motivo e mostra antes e depois."), grid.childElementCount ? grid : vazio("Nada encontrado."));
    }

    function cartaoInimigo(e: Estimativa): HTMLElement {
      const c = el("div", "bal-card" + (selecionado === `inimigo:${e.tipo}` ? " sel" : ""));
      c.tabIndex = 0;
      c.setAttribute("role", "button");
      const thumb = el("div", "bal-thumb");
      void desenharSprite(thumb, e.tipo);
      const txt = el("div");
      txt.append(el("b", "", e.nome), el("p", "pn-small", `nível ${e.nivel} · vida ${fmtNum(e.vida)} · ${e.zonas.map((z) => z.nome).join(", ")}`));
      c.append(thumb, txt);
      const abrir = () => { selecionado = selecionado === `inimigo:${e.tipo}` ? null : `inimigo:${e.tipo}`; render(); };
      c.onclick = abrir;
      c.onkeydown = (ev) => { if (ev.key === "Enter" || ev.key === " ") { ev.preventDefault(); abrir(); } };
      return c;
    }

    function cartaoGrupo(g: string): HTMLElement {
      const id = `grupo:${g}`;
      const c = el("div", "bal-card" + (selecionado === id ? " sel" : ""));
      c.tabIndex = 0;
      c.setAttribute("role", "button");
      const thumb = el("div", "bal-thumb");
      thumb.append(el("span", "pn-tag", g.split(":")[0]));
      const txt = el("div");
      txt.append(el("b", "", g), el("p", "pn-small", `${dados.ajustes.filter((a) => grupoDe(a) === g).length} valores`));
      c.append(thumb, txt);
      const abrir = () => { selecionado = selecionado === id ? null : id; render(); };
      c.onclick = abrir;
      c.onkeydown = (ev) => { if (ev.key === "Enter" || ev.key === " ") { ev.preventDefault(); abrir(); } };
      return c;
    }

    /** painel do cartão aberto: valores à esquerda, drops e estimativa à direita (uma coluna no celular) */
    function detalheDe(id: string): HTMLElement {
      const sec = el("section", "pn-sec");
      const duas = el("div", "bal-duas");
      if (id.startsWith("inimigo:")) {
        const tipo = id.slice(8);
        const est = dados.estimativas.find((e) => e.tipo === tipo);
        const chaves = dados.ajustes.filter((a) => a.grupo === `Inimigo: ${est?.nome}`);
        sec.append(el("h3", "pn-h3", est?.nome ?? tipo));
        duas.append(colunaValores(chaves), colunaDireita(tipo, est));
      } else {
        const g = id.slice(6);
        sec.append(el("h3", "pn-h3", g));
        duas.append(colunaValores(dados.ajustes.filter((a) => a.grupo === g)), el("div"));
      }
      sec.append(duas);
      return sec;
    }

    function colunaValores(chaves: Ajuste[]): HTMLElement {
      const c = el("div");
      c.append(el("h4", "pn-h3", "Valores"));
      c.append(...chaves.map((a) => linhaAjuste(a)));
      return c;
    }

    function colunaDireita(tipo: string, est: Estimativa | undefined): HTMLElement {
      const c = el("div");
      if (est) {
        c.append(el("h4", "pn-h3", "Estimativa (nível " + est.nivel + ")"));
        const t = el("table", "bal-tab");
        t.innerHTML = `<tr><td>Classe</td><td>Golpes para matar</td><td>XP/min</td></tr>` +
          Object.keys(CLASSES).map((k) => `<tr><td>${CLASSES[k]}</td><td>${fmtNum(est.golpes[k])}</td><td>${fmtNum(est.xpPorMinuto[k])}</td></tr>`).join("");
        c.append(t, el("p", "pn-small", "Aproximado: um jogador batendo sem parar, sem contar o tempo de andar."));
      }
      c.append(el("h4", "pn-h3", "Tabela de drops"), tabelaDrops(tipo));
      c.append(el("h4", "pn-h3", "Histórico"), historicoDe(tipo));
      return c;
    }

    /** tabela de drops: ícone, nome, chance e quantidade editáveis; adicionar e tirar */
    function tabelaDrops(tipo: string): HTMLElement {
      const c = el("div");
      for (const d of dados.drops[tipo] ?? []) c.append(linhaDrop(tipo, d));
      if (!(dados.drops[tipo] ?? []).length) c.append(vazio("Nenhum item extra na tabela. O sorteio padrão da zona continua valendo."));
      const add = el("div", "bal-row");
      const item = el("input", "pn-in");
      item.setAttribute("list", "bal-itens");
      item.placeholder = "Adicionar item (id)";
      item.setAttribute("aria-label", "Item a adicionar na tabela");
      let lista = document.getElementById("bal-itens") as HTMLDataListElement | null;
      if (!lista) {
        lista = el("datalist") as HTMLDataListElement;
        lista.id = "bal-itens";
        for (const [id, def] of Object.entries(ITEMS)) lista.append(new Option(def.name, id));
        document.body.append(lista);
      }
      const chance = el("input", "pn-in bal-num");
      chance.type = "number"; chance.value = "10"; chance.min = "1"; chance.max = "100"; chance.setAttribute("aria-label", "Chance em % do item novo");
      add.append(item, chance, botao("Adicionar", () => confirmarDrop(c, `Adicionar ${item.value} ao ${tipo}`, item.value, () => ({ chance: Number(chance.value), min: 1, max: 1 }), tipo)));
      c.append(add);
      return c;
    }

    function linhaDrop(tipo: string, d: Tabela): HTMLElement {
      const row = el("div", "pn-sub");
      row.append(iconeItem(d.item));
      const nome = el("div", "", ITEMS[d.item]?.name ?? d.item);
      row.append(nome);
      const chance = el("input", "pn-in bal-num"); chance.type = "number"; chance.value = String(d.chance); chance.min = "1"; chance.max = "100"; chance.setAttribute("aria-label", `Chance de ${d.item}`);
      const min = el("input", "pn-in bal-num"); min.type = "number"; min.value = String(d.min); min.min = "1"; min.setAttribute("aria-label", `Quantidade mínima de ${d.item}`);
      const max = el("input", "pn-in bal-num"); max.type = "number"; max.value = String(d.max); max.min = "1"; max.setAttribute("aria-label", `Quantidade máxima de ${d.item}`);
      const campos = el("div", "bal-row");
      campos.append(el("span", "pn-small", "% "), chance, el("span", "pn-small", "qtd"), min, el("span", "pn-small", "a"), max);
      const acoes = el("div", "bal-row");
      acoes.append(botao("Salvar", () => confirmarDrop(row, `Mudar ${d.item} em ${tipo}`, d.item, () => ({ chance: Number(chance.value), min: Number(min.value), max: Number(max.value) }), tipo, d)));
      acoes.append(botao("Tirar da tabela", () => confirmarDrop(row, `Tirar ${d.item} de ${tipo}`, d.item, () => ({ chance: 0, min: 1, max: 1 }), tipo, d)));
      row.append(campos, acoes);
      return row;
    }

    function iconeItem(id: string): HTMLElement {
      const im = el("img", "bal-ic");
      im.width = 40; im.height = 40; im.alt = "";
      im.src = `/assets/items/item_${id}.png`;
      im.onerror = () => im.replaceWith(el("span", "bal-ic-fb", (ITEMS[id]?.name ?? id).slice(0, 2).toUpperCase()));
      return im;
    }

    /** confirmação inline (sem janela sobreposta): motivo obrigatório, antes e depois */
    function confirmarDrop(host: HTMLElement, titulo: string, item: string, novo: () => { chance: number; min: number; max: number }, tipo: string, antes?: Tabela) {
      const v = novo();
      const velho = antes ?? { chance: 0, min: 1, max: 1 };
      const box = el("div", "bal-confirma");
      const motivo = el("input", "pn-in");
      motivo.placeholder = "Motivo (obrigatório)";
      motivo.maxLength = 200;
      motivo.setAttribute("aria-label", "Motivo da mudança");
      box.append(el("b", "", titulo), el("p", "pn-mono", `chance ${velho.chance}% → ${v.chance}% · qtd ${velho.min}-${velho.max} → ${v.min}-${v.max}`), motivo);
      box.append(botao("Confirmar", async () => {
        if (!motivo.value.trim()) return p.aviso("Escreva o motivo da mudança.", "erro");
        const base = `drop.${tipo}.${item}`;
        try {
          if (v.chance !== velho.chance) await p.api("PUT", `/balanceamento/${base}.chance`, { valor: v.chance, motivo: motivo.value.trim() });
          if (v.chance > 0 && v.min !== velho.min) await p.api("PUT", `/balanceamento/${base}.min`, { valor: v.min, motivo: motivo.value.trim() });
          if (v.chance > 0 && v.max !== velho.max) await p.api("PUT", `/balanceamento/${base}.max`, { valor: v.max, motivo: motivo.value.trim() });
          p.aviso("Tabela de drops salva. Vale no próximo abate.", "ok");
          await carregar();
        } catch (e) {
          p.aviso((e as Error).message, "erro");
        }
      }));
      box.append(botao("Cancelar", () => box.remove()));
      host.append(box);
    }

    /** uma chave: valor (na unidade de exibição), padrão, diferença e salvar/voltar ao padrão com confirmação */
    function linhaAjuste(a: Ajuste): HTMLElement {
      const esc = a.escala ?? 1;
      const mostra = (n: number) => (esc > 1 ? (n / esc).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : fmtNum(n));
      const dif = a.padrao ? Math.round(((a.atual - a.padrao) / a.padrao) * 100) : 0;
      const c = el("div", "pn-sub");
      const cab = el("div", "bal-row");
      cab.append(el("b", "", a.nome));
      cab.append(a.alterado ? el("span", "pn-tag mute", `${dif > 0 ? "+" : ""}${dif}% do padrão`) : el("span", "pn-tag", "padrão"));
      const info = el("p", "pn-small", `atual ${mostra(a.atual)} · padrão ${mostra(a.padrao)}${a.unidade ? " " + a.unidade : ""} · limite ${mostra(a.min)} a ${mostra(a.max)}`);
      const campo = el("input", "pn-in bal-num");
      campo.type = "number"; campo.step = esc > 1 ? "0.01" : "1";
      campo.value = esc > 1 ? (a.atual / esc).toFixed(2) : String(a.atual);
      campo.setAttribute("aria-label", `Novo valor de ${a.nome}`);
      const acoes = el("div", "bal-row");
      acoes.append(campo, botao("Salvar", () => confirmarValor(c, a, Math.round(Number(campo.value.replace(",", ".")) * esc), "salvar")));
      const btnP = botao("Voltar ao padrão", () => confirmarValor(c, a, a.padrao, "padrao"));
      btnP.disabled = !a.alterado;
      acoes.append(btnP);
      c.append(cab, info, acoes);
      return c;
    }

    function confirmarValor(host: HTMLElement, a: Ajuste, valor: number, modo: "salvar" | "padrao") {
      const esc = a.escala ?? 1;
      const mostra = (n: number) => (esc > 1 ? (n / esc).toFixed(2) : String(n));
      if (modo === "salvar" && !Number.isFinite(valor)) return p.aviso("Use um número.", "erro");
      if (modo === "salvar" && (valor < a.min || valor > a.max)) return p.aviso(`Fora do limite de segurança: use de ${mostra(a.min)} a ${mostra(a.max)}.`, "erro");
      host.querySelector(".bal-confirma")?.remove();
      const box = el("div", "bal-confirma");
      const motivo = el("input", "pn-in");
      motivo.placeholder = "Motivo (obrigatório)";
      motivo.maxLength = 200;
      motivo.setAttribute("aria-label", `Motivo da mudança de ${a.nome}`);
      box.append(el("b", "", modo === "padrao" ? `Voltar ${a.nome} ao padrão` : `Mudar ${a.nome}`), el("p", "pn-mono", `${mostra(a.atual)}  →  ${mostra(valor)}`), motivo);
      box.append(botao("Confirmar", async () => {
        if (!motivo.value.trim()) return p.aviso("Escreva o motivo da mudança.", "erro");
        try {
          if (modo === "padrao") await p.api("POST", `/balanceamento/${encodeURIComponent(a.chave)}/padrao`, { motivo: motivo.value.trim() });
          else await p.api("PUT", `/balanceamento/${encodeURIComponent(a.chave)}`, { valor, motivo: motivo.value.trim() });
          p.aviso(`${a.nome} salvo. Vale na hora.`, "ok");
          await carregar();
        } catch (e) {
          p.aviso((e as Error).message, "erro");
        }
      }));
      box.append(botao("Cancelar", () => box.remove()));
      host.append(box);
    }

    function historicoDe(tipo: string): HTMLElement {
      const c = el("div");
      const itens = historico.filter((h) => h.chave.startsWith(`inimigo.${tipo}.`) || h.chave.startsWith(`drop.${tipo}.`));
      if (!itens.length) return vazio("Nenhuma mudança neste inimigo ainda.");
      for (const h of itens.slice(0, 30)) {
        const row = el("div", "pn-sub");
        row.append(el("b", "", h.chave), el("p", "pn-small", `${fmtData(h.criadoEm)} · motivo: ${h.motivo}`), el("p", "pn-mono", `${fmtNum(h.antes)}  →  ${fmtNum(h.depois)}`));
        row.append(botao("Desfazer", () => void desfazer(h.id)));
        c.append(row);
      }
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

    /** sprite do inimigo: primeiro quadro do atlas (monsters ou placeholder); sem arte, um disco */
    async function desenharSprite(box: HTMLElement, tipo: string) {
      box.append(el("div", "bal-disco"));
      const s = await spriteDe(tipo);
      box.replaceChildren();
      if (!s) { const d = el("div", "bal-disco"); d.style.background = "#8a8478"; box.append(d); return; }
      const esc = Math.min(64 / s.frame.w, 64 / s.frame.h);
      const d = el("div", "bal-sprite");
      d.style.width = `${s.frame.w}px`; d.style.height = `${s.frame.h}px`;
      d.style.backgroundImage = `url(${s.png})`;
      d.style.backgroundSize = `${s.size.w}px ${s.size.h}px`;
      d.style.backgroundPosition = `-${s.frame.x}px -${s.frame.y}px`;
      d.style.transform = `scale(${esc})`;
      box.append(d);
    }

    return {
      el: raiz,
      abrir() {
        void carregar();
      },
    };
  },
};

const sprites = new Map<string, Promise<Sprite | null>>();
function spriteDe(tipo: string): Promise<Sprite | null> {
  if (!sprites.has(tipo)) sprites.set(tipo, carregarSprite(tipo));
  return sprites.get(tipo)!;
}
async function carregarSprite(tipo: string): Promise<Sprite | null> {
  for (const dir of ["monsters", "placeholder"]) {
    try {
      const r = await fetch(`/assets/${dir}/${tipo}.json`, { cache: "no-cache" });
      if (!(r.headers.get("content-type") ?? "").includes("json")) continue;
      const j = await r.json();
      const f = Array.isArray(j.frames) ? j.frames[0] : Object.values(j.frames ?? {})[0];
      const fr = (f as { frame?: Sprite["frame"] } | undefined)?.frame;
      if (!fr) continue;
      return { png: `/assets/${dir}/${tipo}.png`, frame: fr, size: j.meta?.size ?? { w: fr.w, h: fr.h } };
    } catch {
      /* sem arte neste diretório: tenta o próximo */
    }
  }
  return null;
}
