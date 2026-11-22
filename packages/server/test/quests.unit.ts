// Testes unitários do motor de quests (C1.1): formato dos JSON, aceitar, progresso, entrega e mochila cheia.
// Uso: npx tsx test/quests.unit.ts   (sem servidor e sem banco: são funções puras)
import { mkdtempSync, writeFileSync, rmSync, mkdirSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { INV_SLOTS, validarFormatoQuest, type QuestDef } from "@frixep/shared";
import { emptyInventory, addItem } from "../src/game/inventory.js";
import {
  carregarQuests, QUESTS_DIR, aceitar, progredirAbate, progredirFala, progredirChegada, atualizarColetas, aplicarRecompensa,
  xpAposGanho, estadoParaCliente, contarItem, progredirUso, resolverItem, type QuestMap, type QuestRt,
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
  const naoEntregue = aplicarRecompensa(antes, def, "warrior");
  check("recompensa é calculada na cópia (o original não muda)", naoEntregue.ok && antes.iron === 0 && contarItem(antes, "pocao_de_vida") === 0);
  if (naoEntregue.ok) {
    check("recompensa dá tostões e itens na cópia", naoEntregue.inv.iron === 30 && contarItem(naoEntregue.inv, "pocao_de_vida") === 2);
  }
  // mochila cheia de itens que não combinam com a recompensa
  const cheia = emptyInventory();
  for (let i = 0; i < INV_SLOTS; i++) cheia.slots[i] = { id: "espada_1m_common", qty: 1 };
  cheia.iron = 5;
  const snap = JSON.stringify(cheia);
  const recusa = aplicarRecompensa(cheia, def, "warrior");
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
  const r = aplicarRecompensa(inv, def, "warrior");
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

console.log("\n== Tutorial (C1.4): cadeia, objetivos usar/equipar e recompensa por classe ==");
{
  const tut = [...carregarQuests(QUESTS_DIR).values()].filter((d) => d.id.startsWith("tutorial_"));
  const ids = ["tutorial_1_andar", "tutorial_2_primeiro_abate", "tutorial_3_habilidade", "tutorial_4_pocao", "tutorial_5_equipar"];
  check("tutorial tem as 5 quests", ids.every((id) => tut.some((d) => d.id === id)), tut.map((d) => d.id).join(","));
  const pre = Object.fromEntries(tut.map((d) => [d.id, d.preRequisitos]));
  check("cadeia: cada quest tem como pré-requisito a anterior (a 1 não tem)",
    pre[ids[0]].length === 0 && ids.slice(1).every((id, i) => JSON.stringify(pre[id]) === JSON.stringify([ids[i]])), JSON.stringify(pre));
  check("todas as quests do tutorial têm dica (toque e teclado)", tut.every((d) => !!d.dica?.toque && !!d.dica?.teclado));
  check("passo 1 é chegar (zona 4); 2 abater esqueleto na zona 1; 3 usar skill1; 4 coletar poção; 5 equipar armadura",
    tut.find((d) => d.id === ids[0])!.objetivos[0].tipo === "chegar"
    && JSON.stringify(tut.find((d) => d.id === ids[1])!.objetivos[0]) === JSON.stringify({ tipo: "abater", kind: "skeleton", qtd: 1, zona: 1 })
    && JSON.stringify(tut.find((d) => d.id === ids[2])!.objetivos[0]) === JSON.stringify({ tipo: "usar", acao: "skill1", qtd: 1 })
    && JSON.stringify(tut.find((d) => d.id === ids[3])!.objetivos[0]) === JSON.stringify({ tipo: "coletar", itemId: "pocao_de_vida", qtd: 1 })
    && JSON.stringify(tut.find((d) => d.id === ids[4])!.objetivos[0]) === JSON.stringify({ tipo: "equipar", slot: "armor" }));
  const r4 = tut.find((d) => d.id === ids[3])!;
  check("recompensa com {classe} resolve para cada classe (guerreiro, arqueiro, clérigo, mago)",
    ["warrior", "archer", "cleric", "mage"].every((c) => resolverItem(r4.recompensa.itens[0].id, c) === `${c}_armor_common`));
  check("resolverItem troca só o marcador", resolverItem("{classe}_armor_common", "mage") === "mage_armor_common" && resolverItem("pocao_de_vida", "mage") === "pocao_de_vida");

  // uso de habilidade: só conta quando a ação é a da quest, e só para quem está com a quest ativa
  const dU = defs(base({ id: "usar_skill", objetivos: [{ tipo: "usar", acao: "skill1", qtd: 2 }], npc: null }));
  const qU = novo();
  aceitar(qU, dU, "usar_skill", 1, emptyInventory());
  check("usar: outra habilidade não conta", progredirUso(qU, dU, "skill2").length === 0 && qU.get("usar_skill")!.progresso[0] === 0);
  progredirUso(qU, dU, "skill1");
  check("usar: 1 uso de 2 ainda ativa", qU.get("usar_skill")!.estado === "ativa" && qU.get("usar_skill")!.progresso[0] === 1);
  progredirUso(qU, dU, "skill1");
  check("usar: 2 usos completam (pronta)", qU.get("usar_skill")!.estado === "pronta" && qU.get("usar_skill")!.progresso[0] === 2);
  progredirUso(qU, dU, "skill1");
  check("usar: não passa do total", qU.get("usar_skill")!.progresso[0] === 2);
  const qF = novo();
  qF.set("usar_skill", { id: "usar_skill", estado: "entregue", progresso: [2] });
  check("usar: quest entregue não conta de novo", progredirUso(qF, dU, "skill1").length === 0);

  // equipar: acompanha o equipamento (equipa = cumprido; tira = volta)
  const dE = defs(base({ id: "equipar_x", objetivos: [{ tipo: "equipar", slot: "armor" }], npc: null }));
  const inv = emptyInventory();
  const qE = novo();
  aceitar(qE, dE, "equipar_x", 1, inv);
  check("equipar: sem armadura fica ativa", qE.get("equipar_x")!.estado === "ativa");
  inv.equip.armor = "warrior_armor_common";
  atualizarColetas(qE.get("equipar_x")!, dE.get("equipar_x")!, inv);
  check("equipar: com armadura equipada fica pronta", qE.get("equipar_x")!.estado === "pronta");
  inv.equip.armor = null;
  atualizarColetas(qE.get("equipar_x")!, dE.get("equipar_x")!, inv);
  check("equipar: tirar a armadura volta a ativa", qE.get("equipar_x")!.estado === "ativa");

  // recompensa com {classe}: o mago recebe a armadura de mago
  const dR = defs(base({ id: "rec_classe", npc: null, objetivos: [{ tipo: "equipar", slot: "armor" }], recompensa: { xp: 0, ferro: 0, itens: [{ id: "{classe}_armor_common", qtd: 1 }] } }));
  const rr = aplicarRecompensa(emptyInventory(), dR.get("rec_classe")!, "mage");
  check("entrega dá a armadura da classe (mago)", rr.ok && contarItem(rr.inv, "mage_armor_common") === 1 && contarItem(rr.inv, "warrior_armor_common") === 0);

  // formato: usar e equipar com valores errados são recusados com mensagem clara
  const base0 = JSON.parse(readFileSync(path.join(QUESTS_DIR, "tutorial_3_habilidade.json"), "utf8"));
  check("formato recusa acao de usar inválida", lancaCom(() => validarFormatoQuest({ ...base0, objetivos: [{ tipo: "usar", acao: "dodge", qtd: 1 }] }, "tutorial_3_habilidade.json"), '"acao"') === "");
  check("formato recusa slot de equipar inválido", lancaCom(() => validarFormatoQuest({ ...base0, objetivos: [{ tipo: "equipar", slot: "anel" }] }, "tutorial_3_habilidade.json"), '"slot"') === "");
  check("formato recusa dica longa demais", lancaCom(() => validarFormatoQuest({ ...base0, dica: { toque: "x".repeat(121), teclado: "ok" } }, "tutorial_3_habilidade.json"), '"dica"') === "");
  check("formato aceita quest sem dica (campo opcional)", !!validarFormatoQuest({ ...base0, dica: undefined }, "tutorial_3_habilidade.json").id);
}

const falhas = results.filter((r) => !r).length;
console.log(`\n${results.length - falhas}/${results.length} verificações passaram`);
if (falhas) process.exit(1);
