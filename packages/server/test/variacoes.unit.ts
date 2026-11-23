// Teste unitário das variações de habilidade (C2.2): catálogo válido, todas resolvem, nenhuma muda o dano base
// além de 25%, a regra de nível e os dados (escolha inválida vira base). Uso: npx tsx test/variacoes.unit.ts
import {
  resolveAction, classAction, VARIACOES, VARIACAO_SLOTS, VARIACAO_NIVEL, VARIACAO_TEXT, PLAYABLE_CLASSES, CLASS_DEFS,
  limparEscolhas, modificadoresDaEscolha, variacaoDesbloqueada, variacoesDaClasse,
  type CharClass, type ActionId,
} from "@frixep/shared";

let falhas = 0;
let total = 0;
const check = (nome: string, ok: boolean, detalhe = "") => {
  total++;
  if (!ok) falhas++;
  console.log(`${ok ? "PASS" : "FAIL"}  ${nome}${detalhe ? "  -> " + detalhe : ""}`);
};

console.log("== Catálogo");
check("48 variações no total (3 por habilidade x 4 habilidades x 4 classes)", VARIACOES.length === 48, `${VARIACOES.length}`);
check("ids únicos", new Set(VARIACOES.map((v) => v.id)).size === VARIACOES.length);
for (const c of PLAYABLE_CLASSES) {
  const lista = variacoesDaClasse(c);
  check(`${c}: 12 variações (3 por habilidade)`, lista.length === 12, `${lista.length}`);
  for (const s of VARIACAO_SLOTS) {
    const n = lista.filter((v) => v.slot === s).length;
    check(`${c}.${s}: 3 variações`, n === 3, `${n}`);
  }
}
check("toda variação tem texto em skilltips (VARIACAO_TEXT)", VARIACOES.every((v) => !!VARIACAO_TEXT[v.id]));
check("todo modificador é do próprio slot da variação", VARIACOES.every((v) => v.mods.every((m) => m.slot === v.slot)));
check("nível de desbloqueio: Q 10, W 20, E 30, R 40", VARIACAO_NIVEL.skill1 === 10 && VARIACAO_NIVEL.skill2 === 20 && VARIACAO_NIVEL.skill3 === 30 && VARIACAO_NIVEL.ultimate === 40);

console.log("\n== Todas resolvem e o dano base muda pouco");
for (const v of VARIACOES) {
  const base = resolveAction(v.classe, v.slot as ActionId);
  const eff = resolveAction(v.classe, v.slot as ActionId, v.mods);
  const ok = Object.values(eff).every((x) => x === undefined || typeof x !== "number" || Number.isFinite(x));
  check(`${v.id} resolve sem NaN`, ok);
  if (base.dmg !== undefined) {
    const d0 = base.dmg, d1 = eff.dmg ?? 0;
    check(`${v.id} dano ${d0} -> ${d1} (até 25%)`, Math.abs(d1 - d0) <= 0.25 * d0 + 1e-9, `${d0} -> ${d1}`);
  }
  check(`${v.id} muda o efeito (algum campo diferente da base)`, JSON.stringify(base) !== JSON.stringify(eff));
  check(`${v.id} não encosta na recarga abaixo de 1,5 s`, eff.cd >= 1.5, `cd ${eff.cd}`);
}

console.log("\n== Base sem escolha = valores de sempre");
for (const c of PLAYABLE_CLASSES) {
  for (const s of ["attack", "skill1", "skill2", "skill3", "ultimate", "dodge"] as ActionId[]) {
    const a = JSON.stringify(classAction(c, s, 0, []));
    const b = JSON.stringify(CLASS_DEFS[c].actions[s]);
    if (a !== b) check(`${c}.${s} sem modificadores bate com CLASS_DEFS`, false, "diferente");
  }
}

console.log("\n== Regra de nível, classe e slot");
check("Q liberado no nível 10 (não no 9)", variacaoDesbloqueada("skill1", 10) && !variacaoDesbloqueada("skill1", 9));
check("R liberado no nível 40 (não no 39)", variacaoDesbloqueada("ultimate", 40) && !variacaoDesbloqueada("ultimate", 39));
const perfurarPesada = VARIACOES.find((v) => v.id === "a_per_pesada")!.id;
const flechaGelada = VARIACOES.find((v) => v.id === "a_per_gelada")!.id;
check("nível 9: a escolha de Q é descartada", limparEscolhas({ skill1: perfurarPesada }, "archer", 9).skill1 === undefined);
check("nível 10: a escolha de Q vale", limparEscolhas({ skill1: perfurarPesada }, "archer", 10).skill1 === perfurarPesada);
check("variação de outra classe é descartada", limparEscolhas({ skill1: "w_inv_pesada" }, "archer", 50).skill1 === undefined);
check("variação em outro slot é descartada", limparEscolhas({ skill2: perfurarPesada }, "archer", 50).skill2 === undefined);
check("id inexistente é descartado", limparEscolhas({ skill1: "nao_existe" }, "archer", 50).skill1 === undefined);
check("JSON inválido vira base (sem escolha)", Object.keys(limparEscolhas("{não é json", "archer", 50)).length === 0);
check("null e lixo viram base", Object.keys(limparEscolhas(null, "archer", 50)).length === 0 && Object.keys(limparEscolhas(42, "archer", 50)).length === 0);
check("texto JSON válido é lido", limparEscolhas(JSON.stringify({ skill1: perfurarPesada }), "archer", 10).skill1 === perfurarPesada);

console.log("\n== Escolha muda o efeito");
const mods = modificadoresDaEscolha({ skill1: flechaGelada });
const perf = resolveAction("archer", "skill1", mods);
const base = resolveAction("archer", "skill1");
check("Flecha Gelada: Perfurar ganha lentidão extra", perf.slowPct === 25 && perf.slowS === 3 && base.slowPct === undefined, `slow ${perf.slowPct}/${perf.slowS}`);
const veloz = resolveAction("archer", "skill1", modificadoresDaEscolha({ skill1: "a_per_veloz" }));
check("Flecha Veloz: recarga de Perfurar cai de 4 para 2,5 s", veloz.cd === 2.5, `cd ${veloz.cd}`);

console.log(`\n${total - falhas}/${total} verificações passaram`);
if (falhas) process.exit(1);
