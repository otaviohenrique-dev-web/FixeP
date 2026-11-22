// Testes unitários do motor de quests (C1.1): formato dos JSON, aceitar, progresso, entrega e mochila cheia.
// Uso: npx tsx test/quests.unit.ts   (sem servidor e sem banco: são funções puras)
import { mkdtempSync, writeFileSync, rmSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { INV_SLOTS, type QuestDef } from "@frixep/shared";
import { emptyInventory, addItem } from "../src/game/inventory.js";
import {
  carregarQuests, QUESTS_DIR, aceitar, progredirAbate, progredirFala, progredirChegada, atualizarColetas, aplicarRecompensa,
  xpAposGanho, estadoParaCliente, contarItem, type QuestMap, type QuestRt,
} from "../src/game/quests.js";

const results: boolean[] = [];
const check = (name: string, ok: boolean, detail = "") => { results.push(ok); console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? "  -> " + detail : ""}`); };
const lancaCom = (fn: () => unknown, trecho: string) => { try { fn(); return "nao lancou"; } catch (e) { const m = (e as Error).message; return m.includes(trecho) ? "" : `msg: ${m}`; } };

// quests de exemplo (em memória), para testar as regras sem depender dos JSON do jogo
const base = (over: Partial<QuestDef>): QuestDef => ({
  id: "teste", nome: "Teste", texto: "t", nivelMin: 1, npc: "merchant", preRequisitos: [],
  objetivos: [{ tipo: "abater", kind: "skeleton", qtd: 3, zona: 1 }],
  recompensa: { xp: 50, ferro: 30, itens: [{ id: "pocao_de_vida", qtd: 2 }] },
  ...over,
});
const defs = (...qs: QuestDef[]) => new Map(qs.map((q) => [q.id, q]));
const novo = (): QuestMap => new Map();

console.log("== Dados do jogo (packages/server/data/quests) ==");
{
  const reais = carregarQuests(QUESTS_DIR);
  check("carrega as quests de dados do jogo", reais.has("caca_aos_ossos"), [...reais.keys()].join(","));
  const q = reais.get("caca_aos_ossos")!;
  check("quest de teste: objetivo de abater 3 esqueletos na zona 1, NPC merchant", q.npc === "merchant" && q.objetivos[0].tipo === "abater" && q.objetivos[0].qtd === 3, JSON.stringify(q.objetivos));
}

console.log("== Validação do formato (falha com mensagem clara) ==");
{
  const tmp = mkdtempSync(path.join(tmpdir(), "quests-"));
  const escreve = (nome: string, obj: unknown) => writeFileSync(path.join(tmp, nome), typeof obj === "string" ? obj : JSON.stringify(obj));
  const bom = { id: "ok_quest", nome: "Ok", texto: "t", nivelMin: 1, npc: "merchant", objetivos: [{ tipo: "falar", npc: "merchant" }], recompensa: { xp: 1, ferro: 1, itens: [] } };
  const casos: [string, unknown, string][] = [
    ["quebrado.json", "{ isto não é json", "JSON inválido"],
    ["ok_quest.json", { ...bom, nivelMin: 0 }, "nivelMin"],
    ["ok_quest.json", { ...bom, objetivos: [{ tipo: "pular" }] }, 'objetivos[0]'],
    ["ok_quest.json", { ...bom, objetivos: [{ tipo: "abater", kind: "skeleton", qtd: 0 }] }, "qtd"],
    ["ok_quest.json", { ...bom, objetivos: [{ tipo: "abater", kind: "dragao", qtd: 1 }] }, "kind"],
    ["ok_quest.json", { ...bom, recompensa: { xp: 1, ferro: 1, itens: [{ id: "pocao_de_vida" }] } }, "recompensa.itens[0]"],
    ["ok_quest.json", { ...bom, recompensa: { xp: 1, ferro: 1, itens: [{ id: "item_fantasma", qtd: 1 }] } }, "item_fantasma"],
    ["ok_quest.json", { ...bom, npc: "fantasma" }, 'npc "fantasma" não existe'],
    ["ok_quest.json", { ...bom, id: "outro" }, "deve ser igual ao nome do arquivo"],
    ["ok_quest.json", { ...bom, preRequisitos: ["nao_existe"] }, "pré-requisito"],
    ["ok_quest.json", { ...bom, objetivos: [{ tipo: "chegar", zona: 1, x: 5, y: 5, raio: 0 }] }, "raio"],
  ];
  for (const [nome, obj, trecho] of casos) {
    rmSync(tmp, { recursive: true, force: true });
    mkdirSync(tmp, { recursive: true });
    escreve(nome, obj);
    const r = lancaCom(() => carregarQuests(tmp), trecho);
    check(`recusa JSON errado: ${trecho}`, r === "", r);
  }
  rmSync(tmp, { recursive: true, force: true });
}

console.log("== Aceitar ==");
{
  const d = defs(base({}), base({ id: "dificil", nivelMin: 10 }), base({ id: "depois", preRequisitos: ["teste"] }));
  const qs = novo();
  const inv = emptyInventory();
  check("quest inexistente é recusada", !aceitar(qs, d, "nao_existe", 5, inv).ok);
  const baixo = aceitar(qs, d, "dificil", 5, inv);
  check("nível baixo é recusado", !baixo.ok && baixo.error.includes("nível 10"), JSON.stringify(baixo));
  check("pré-requisito não entregue é recusado", !aceitar(qs, d, "depois", 5, inv).ok);
  check("aceita quest válida", aceitar(qs, d, "teste", 5, inv).ok && qs.get("teste")?.estado === "ativa");
  check("não aceita de novo", !aceitar(qs, d, "teste", 5, inv).ok);
  qs.get("teste")!.estado = "entregue";
  check("quest já entregue não é aceita de novo", !aceitar(qs, d, "teste", 5, inv).ok);
  check("com pré-requisito entregue, aceita a seguinte", aceitar(qs, d, "depois", 5, inv).ok);
}

console.log("== Progresso ==");
{
  const d = defs(base({}));
  const qs = novo();
  aceitar(qs, d, "teste", 5, emptyInventory());
  check("abate de outro tipo não conta", progredirAbate(qs, d, "wolf", 1).length === 0 && qs.get("teste")!.progresso[0] === 0);
  check("abate em outra zona não conta", progredirAbate(qs, d, "skeleton", 2).length === 0 && qs.get("teste")!.progresso[0] === 0);
  progredirAbate(qs, d, "skeleton", 1);
  progredirAbate(qs, d, "skeleton", 1);
  check("dois abates: progresso 2, ainda ativa", qs.get("teste")!.progresso[0] === 2 && qs.get("teste")!.estado === "ativa");
  const mudou = progredirAbate(qs, d, "skeleton", 1);
  check("terceiro abate: progresso 3 e vira pronta", qs.get("teste")!.progresso[0] === 3 && qs.get("teste")!.estado === "pronta" && mudou.length === 1);
  progredirAbate(qs, d, "skeleton", 1);
  check("abate extra não passa do necessário", qs.get("teste")!.progresso[0] === 3);
}
{
  const d = defs(base({ id: "fala", objetivos: [{ tipo: "falar", npc: "smith" }] }));
  const qs = novo();
  aceitar(qs, d, "fala", 1, emptyInventory());
  progredirFala(qs, d, "merchant");
  check("falar com outro NPC não conta", qs.get("fala")!.estado === "ativa");
  progredirFala(qs, d, "smith");
  check("falar com o NPC do objetivo: pronta", qs.get("fala")!.estado === "pronta");
}
{
  const d = defs(base({ id: "chega", objetivos: [{ tipo: "chegar", zona: 2, x: 10, y: 10, raio: 2 }] }));
  const qs = novo();
  aceitar(qs, d, "chega", 1, emptyInventory());
  progredirChegada(qs, d, 1, 10, 10);
  check("chegar em zona errada não conta", qs.get("chega")!.estado === "ativa");
  progredirChegada(qs, d, 2, 20, 20);
  check("chegar fora do raio não conta", qs.get("chega")!.estado === "ativa");
  progredirChegada(qs, d, 2, 11, 11);
  check("chegar dentro do raio: pronta", qs.get("chega")!.estado === "pronta");
}

console.log("== Coletar (mochila) ==");
{
  const potion = "pocao_de_vida";
  const d = defs(base({ id: "colet", npc: null, objetivos: [{ tipo: "coletar", itemId: potion, qtd: 2 }], recompensa: { xp: 1, ferro: 0, itens: [] } }));
  const inv = emptyInventory();
  const qs = novo();
  check("sem itens: aceita e fica ativa", aceitar(qs, d, "colet", 1, inv).ok && qs.get("colet")!.estado === "ativa");
  addItem(inv, potion, 2);
  atualizarColetas(qs.get("colet")!, d.get("colet")!, inv);
  check("pegou 2 poções: pronta", qs.get("colet")!.estado === "pronta" && qs.get("colet")!.progresso[0] === 2);
  inv.slots.forEach((s, i) => { if (s?.id === potion) inv.slots[i] = null; });
  atualizarColetas(qs.get("colet")!, d.get("colet")!, inv);
  check("perdeu os itens: volta a ativa", qs.get("colet")!.estado === "ativa" && contarItem(inv, potion) === 0);
}

console.log("== Entrega: recompensa, mochila cheia e uma vez só ==");
{
  const d = defs(base({}));
  const def = d.get("teste")!;
  const qs = novo();
  aceitar(qs, d, "teste", 5, emptyInventory());
  const rt = qs.get("teste")!;
  const antes = emptyInventory();
  const naoEntregue = aplicarRecompensa(antes, def);
  check("recompensa é calculada na cópia (o original não muda)", naoEntregue.ok && antes.iron === 0 && contarItem(antes, "pocao_de_vida") === 0);
  if (naoEntregue.ok) {
    check("recompensa dá tostões e itens na cópia", naoEntregue.inv.iron === 30 && contarItem(naoEntregue.inv, "pocao_de_vida") === 2);
  }
  // mochila cheia de itens que não combinam com a recompensa
  const cheia = emptyInventory();
  for (let i = 0; i < INV_SLOTS; i++) cheia.slots[i] = { id: "espada_1m_common", qty: 1 };
  cheia.iron = 5;
  const snap = JSON.stringify(cheia);
  const recusa = aplicarRecompensa(cheia, def);
  check("mochila cheia: recusa", !recusa.ok, recusa.ok ? "aceitou" : recusa.error);
  check("mochila cheia: nada se perde (inventário igual ao de antes)", JSON.stringify(cheia) === snap);
  // entregar: marca como entregue e não aceita nem entrega de novo
  rt.estado = "entregue";
  check("depois de entregue não aceita de novo", !aceitar(qs, d, "teste", 5, emptyInventory()).ok);
}
{
  // entrega com coletar: os itens pedidos saem da mochila e liberam espaço
  const pot = "pocao_de_vida";
  const d = defs(base({ id: "com_coletar", npc: null, objetivos: [{ tipo: "coletar", itemId: pot, qtd: 10 }], recompensa: { xp: 1, ferro: 7, itens: [] } }));
  const def = d.get("com_coletar")!;
  const inv = emptyInventory();
  for (let i = 0; i < INV_SLOTS - 1; i++) inv.slots[i] = { id: "espada_1m_common", qty: 1 };
  inv.slots[INV_SLOTS - 1] = { id: pot, qty: 10 };
  const qs = novo();
  aceitar(qs, d, "com_coletar", 1, inv);
  const r = aplicarRecompensa(inv, def);
  check("entrega tira os itens de coletar e paga", r.ok && contarItem(r.inv, pot) === 0 && r.inv.iron === 7 && contarItem(inv, pot) === 10);
}

console.log("== XP e fotografia ==");
{
  const a = xpAposGanho(1, 0, 10);
  check("ganha XP sem subir de nível", a.level === 1 && a.xp === 10);
  const b = xpAposGanho(1, 0, 10_000_000);
  check("XP grande sobe de nível e respeita o teto", b.level > 1 && b.level <= 50, JSON.stringify(b));
  const d = defs(base({}));
  const qs: QuestMap = new Map([["teste", { id: "teste", estado: "ativa", progresso: [1] } as QuestRt]]);
  const foto = estadoParaCliente(qs);
  check("fotografia para o cliente tem id, estado e progresso", foto.length === 1 && foto[0].progresso[0] === 1 && foto[0].estado === "ativa", JSON.stringify(foto));
  void d;
}

const falhas = results.filter((r) => !r).length;
console.log(`\n${results.length - falhas}/${results.length} verificações passaram`);
if (falhas) process.exit(1);
