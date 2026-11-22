// Testes unitários do diário e do rastreador de quests (C1.3): progresso, quest do rastreador, ordem e agrupamento.
// Uso: npx tsx test/diario.unit.ts   (sem servidor e sem banco: são funções puras de packages/shared/src/diario.ts)
import {
  formatarProgresso, objetivoAtual, encurtar, linhaRastreador, atualizarOrdem, escolherRastreada, agruparDiario, nomeNpcPorId,
  type QuestDef, type QuestEstado,
} from "@frixep/shared";

const results: boolean[] = [];
const check = (name: string, ok: boolean, detail = "") => { results.push(ok); console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? "  -> " + detail : ""}`); };

const quest = (over: Partial<QuestDef> & { id: string }): QuestDef => ({
  nome: over.id, texto: "t", nivelMin: 1, npc: "merchant", preRequisitos: [],
  objetivos: [{ tipo: "abater", kind: "skeleton", qtd: 3, zona: 1 }],
  recompensa: { xp: 10, ferro: 5, itens: [] },
  ...over,
});
const est = (id: string, estado: QuestEstado["estado"], progresso: number[] = [0]): QuestEstado => ({ id, estado, progresso });
const NPCS = [{ id: "merchant", name: "Garrick" }];
const nomeNpc = (id: string) => nomeNpcPorId(id, NPCS);

console.log("== Progresso ==");
{
  const abate = { tipo: "abater" as const, kind: "skeleton", qtd: 3 };
  check("abater 2 de 3 mostra 2/3", formatarProgresso(abate, 2) === "2/3");
  check("abater acima do total trava em 3/3", formatarProgresso(abate, 9) === "3/3");
  check("valor negativo vira 0/3", formatarProgresso(abate, -1) === "0/3");
  const falar = { tipo: "falar" as const, npc: "merchant" };
  check("falar sem feito mostra falta", formatarProgresso(falar, 0) === "falta");
  check("falar feito mostra feito", formatarProgresso(falar, 1) === "feito");
  const q = quest({ id: "dupla", objetivos: [abate, falar] });
  check("objetivo atual é o primeiro não cumprido", objetivoAtual(q, [3, 0]) === 1);
  check("sem objetivo pendente devolve -1", objetivoAtual(q, [3, 1]) === -1);
  check("progresso ausente conta como zero", objetivoAtual(q, []) === 0);
}

console.log("== Nome curto ==");
{
  check("nome curto fica igual", encurtar("Caça aos Ossos") === "Caça aos Ossos");
  const longo = encurtar("Uma missão com nome muito, muito longo para a HUD");
  check("nome longo termina em reticências", longo.endsWith("…") && longo.length <= 28, longo);
}

console.log("== Linha do rastreador ==");
{
  const caca = quest({ id: "caca_aos_ossos", nome: "Caça aos Ossos" });
  check("ativa mostra nome e progresso 2/3", linhaRastreador(caca, est("caca_aos_ossos", "ativa", [2]), nomeNpc) === "Caça aos Ossos 2/3");
  check("pronta mostra entregar a Garrick", linhaRastreador(caca, est("caca_aos_ossos", "pronta", [3]), nomeNpc) === "Pronta: entregar a Garrick");
  const semNpc = quest({ id: "x", nome: "Sem NPC", npc: null });
  check("pronta sem NPC mostra o nome", linhaRastreador(semNpc, est("x", "pronta", [3]), nomeNpc) === "Pronta: Sem NPC");
  const fala = quest({ id: "f", nome: "Conversa", objetivos: [{ tipo: "falar", npc: "merchant" }] });
  check("objetivo de conversa mostra falta", linhaRastreador(fala, est("f", "ativa", [0]), nomeNpc) === "Conversa: falta");
  const feitos = quest({ id: "g", nome: "Feita" });
  check("todos cumpridos mostra só o nome", linhaRastreador(feitos, est("g", "ativa", [3]), nomeNpc) === "Feita");
}

console.log("== Escolha da quest do rastreador ==");
{
  const defs = [quest({ id: "a", nome: "A" }), quest({ id: "b", nome: "B" }), quest({ id: "c", nome: "C" })];
  check("sem quest ativa nem pronta: null (rastreador some)", escolherRastreada(defs, [est("a", "entregue", [3])], [], nomeNpc) === null);
  check("lista vazia: null", escolherRastreada(defs, [], [], nomeNpc) === null);
  const soAtiva = escolherRastreada(defs, [est("a", "ativa", [1])], ["a"], nomeNpc);
  check("uma ativa é escolhida", soAtiva?.questId === "a" && !soAtiva.pronta && soAtiva.linha === "A 1/3", JSON.stringify(soAtiva));
  const duas = escolherRastreada(defs, [est("a", "ativa"), est("b", "ativa")], ["a", "b"], nomeNpc);
  check("entre ativas, a mais recente (última na ordem)", duas?.questId === "b", duas?.questId);
  const prontaVence = escolherRastreada(defs, [est("b", "ativa"), est("c", "pronta", [3])], ["c", "b"], nomeNpc);
  check("pronta tem prioridade sobre ativa mais nova", prontaVence?.questId === "c" && prontaVence.pronta === true, JSON.stringify(prontaVence));
  check("pronta mostra a linha de entrega", prontaVence?.linha === "Pronta: entregar a Garrick", prontaVence?.linha);
  const semDef = escolherRastreada(defs, [est("zzz", "ativa")], [], nomeNpc);
  check("quest sem definição é ignorada", semDef === null);
}

console.log("== Ordem de chegada ==");
{
  const o1 = atualizarOrdem([], [est("b", "ativa"), est("a", "ativa"), est("z", "entregue")]);
  check("primeira vez: ativas entram por id e entregues ficam fora", o1.join(",") === "a,b", o1.join(","));
  const o2 = atualizarOrdem(o1, [est("a", "ativa"), est("b", "ativa"), est("c", "ativa")]);
  check("nova quest entra no fim e as antigas mantêm a ordem", o2.join(",") === "a,b,c", o2.join(","));
  const o3 = atualizarOrdem(["a", "b"], [est("b", "pronta")]);
  check("quest que sumiu da lista sai da ordem", o3.join(",") === "b", o3.join(","));
}

console.log("== Agrupamento do diário ==");
{
  const defs = [quest({ id: "a" }), quest({ id: "b" }), quest({ id: "c" }), quest({ id: "d" })];
  const d = agruparDiario(defs, [est("c", "entregue", [3]), est("a", "ativa", [1]), est("b", "pronta", [3])]);
  check("ativas com a quest a", d.ativas.map((e) => e.def.id).join(",") === "a");
  check("prontas com a quest b", d.prontas.map((e) => e.def.id).join(",") === "b");
  check("entregues com a quest c", d.entregues.map((e) => e.def.id).join(",") === "c");
  check("quest não aceita (d) fica fora do diário", ![...d.ativas, ...d.prontas, ...d.entregues].some((e) => e.def.id === "d"));
  const vazio = agruparDiario(defs, []);
  check("sem quests aceitas, tudo vazio", vazio.ativas.length + vazio.prontas.length + vazio.entregues.length === 0);
}

const falhas = results.filter((r) => !r).length;
console.log(`\n${results.length - falhas}/${results.length} verificações passaram`);
if (falhas) process.exit(1);
