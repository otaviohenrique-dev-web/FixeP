// Teste unitário dos loadouts (C2.4): nome sanitizado, leitura de dados gravados, validação do build contra o nível,
// resumo do slot. Uso: npx tsx test/loadouts.unit.ts
import {
  PLAYABLE_CLASSES, TALENTOS, talentosDaClasse, pontosTotais, sanitizarNomeLoadout, loadoutsVazio, limparLoadouts, validarLoadout,
  resumoLoadout, LOADOUT_SLOTS, LOADOUT_NOME_MAX, variacoesDaClasse, type CharClass, type LoadoutSlot,
} from "@frixep/shared";

let falhas = 0;
let total = 0;
const check = (nome: string, ok: boolean, detalhe = "") => {
  total++;
  if (!ok) falhas++;
  console.log(`${ok ? "PASS" : "FAIL"}  ${nome}${detalhe ? "  -> " + detalhe : ""}`);
};

console.log("== Slots e nome");
check("3 slots por personagem", LOADOUT_SLOTS === 3 && loadoutsVazio().slots.length === 3);
check("slots vazios no início, nome padrão e nenhum ativo", loadoutsVazio().slots.every((s, i) => !s.salvo && s.nome === `Build ${i + 1}`) && loadoutsVazio().ativo === -1);
check("nome máximo de 16 caracteres", LOADOUT_NOME_MAX === 16);
check("nome comum passa igual", sanitizarNomeLoadout("Tanque", "Build 1") === "Tanque");
check("nome longo é cortado em 16", sanitizarNomeLoadout("abcdefghijklmnopqrstuvwxyz", "x") === "abcdefghijklmnop");
check("espaços são colapsados e aparados", sanitizarNomeLoadout("   Build   do   Dano  ", "x") === "Build do Dano");
check("controle e marcação saem do nome", sanitizarNomeLoadout("<b>oi\u0007</b>", "x") === "boi/b");
check("nome vazio ou só espaços usa o padrão", sanitizarNomeLoadout("   ", "Build 2") === "Build 2");
check("nome que não é texto usa o padrão", sanitizarNomeLoadout(42, "Build 3") === "Build 3");

console.log("\n== Leitura dos dados gravados");
const cls: CharClass = "warrior";
const talW = talentosDaClasse(cls);
const t1 = talW.find((t) => t.tier === 1)!;
const vQ = variacoesDaClasse(cls).find((v) => v.slot === "skill1")!;
const lido = limparLoadouts(JSON.stringify({ ativo: 1, slots: [
  { nome: "  Dano  ", salvo: true, variacoes: { skill1: vQ.id, skill2: "id_inexistente" }, talentos: { [t1.id]: 99 } },
  null,
  { nome: "Vazio", salvo: false },
] }), cls);
check("slot salvo é lido com o nome limpo", lido.slots[0].salvo && lido.slots[0].nome === "Dano", lido.slots[0].nome);
check("variação de outra habilidade ou id inexistente some", lido.slots[0].variacoes.skill1 === vQ.id && lido.slots[0].variacoes.skill2 === undefined);
check("rank acima do máximo é cortado no máximo do talento", lido.slots[0].talentos[t1.id] === t1.max, String(lido.slots[0].talentos[t1.id]));
check("slot ausente vira vazio com nome padrão; slot vazio mantém o nome", !lido.slots[1].salvo && lido.slots[1].nome === "Build 2" && !lido.slots[2].salvo && lido.slots[2].nome === "Vazio");
check("ativo aponta para slot vazio: vira -1", lido.ativo === -1 || lido.slots[lido.ativo]?.salvo === true);
const ativoOk = limparLoadouts(JSON.stringify({ ativo: 0, slots: [{ salvo: true, nome: "A" }] }), cls);
check("ativo válido é mantido", ativoOk.ativo === 0);
check("lixo no JSON não quebra", limparLoadouts("{não é json", cls).slots.length === 3 && limparLoadouts(null, cls).ativo === -1);
check("talento de outra classe some", limparLoadouts(JSON.stringify({ slots: [{ salvo: true, talentos: { [TALENTOS.find((t) => t.classe !== cls)!.id]: 2 } }] }), cls).slots[0].talentos && Object.keys(limparLoadouts(JSON.stringify({ slots: [{ salvo: true, talentos: { [TALENTOS.find((t) => t.classe !== cls)!.id]: 2 } }] }), cls).slots[0].talentos).length === 0);

console.log("\n== Validação ao aplicar (nível atual)");
const base: LoadoutSlot = { nome: "B", salvo: true, variacoes: {}, talentos: {} };
check("slot vazio não aplica", !validarLoadout({ ...base, salvo: false }, cls, 20).ok);
check("build vazio aplica em qualquer nível", validarLoadout(base, cls, 1).ok);
check("variação Q (nível 10) recusada no nível 9", !validarLoadout({ ...base, variacoes: { skill1: vQ.id } }, cls, 9).ok);
check("variação Q aceita no nível 10", validarLoadout({ ...base, variacoes: { skill1: vQ.id } }, cls, 10).ok);
const vW = variacoesDaClasse(cls).find((v) => v.slot === "skill2")!;
const rW = validarLoadout({ ...base, variacoes: { skill2: vW.id } }, cls, 10);
check("variação W (nível 20) recusada no nível 10 com mensagem clara", !rW.ok && rW.ok === false && rW.error.includes("nível 20"), rW.ok ? "" : rW.error);
const vDeOutra = variacoesDaClasse("archer" as CharClass)[0];
check("variação de outra classe recusada", !validarLoadout({ ...base, variacoes: { skill1: vDeOutra.id } }, cls, 40).ok);

// talentos: 5 pontos no nível 10. Um build de 6 pontos não cabe.
const nivel10 = pontosTotais(10);
const pontos = (n: number) => { const e: Record<string, number> = {}; let left = n; for (const t of talW) { if (t.tier !== 1 || left <= 0) continue; const r = Math.min(t.max, left); e[t.id] = r; left -= r; } return e; };
const cabe = validarLoadout({ ...base, talentos: pontos(nivel10) }, cls, 10);
check("build com todos os pontos do nível aplica", cabe.ok, cabe.ok ? "" : cabe.error);
const sobra = validarLoadout({ ...base, talentos: pontos(nivel10 + 1) }, cls, 10);
check("build com um ponto a mais recusado, com a conta na mensagem", !sobra.ok && !sobra.ok === true && sobra.error.includes(`${nivel10 + 1}`), sobra.ok ? "" : sobra.error);
const tier2 = talW.find((t) => t.tier === 2)!;
const semPorta = validarLoadout({ ...base, talentos: { [tier2.id]: 1 } }, cls, 40);
check("talento de nível 2 sem a porta do ramo é recusado", !semPorta.ok, semPorta.ok ? "" : semPorta.error);
const nivel6 = validarLoadout({ ...base, talentos: pontos(pontosTotais(10)) }, cls, 6);
check("o mesmo build recusa no nível 6 (menos pontos)", !nivel6.ok);

console.log("\n== Resumo do slot");
const resumo = resumoLoadout({ ...base, variacoes: { skill1: vQ.id }, talentos: pontos(3) }, cls);
check("resumo lista as 4 habilidades", resumo.variacoes.length === 4 && resumo.variacoes[0] === `Q: ${vQ.nome}` && resumo.variacoes[1] === "W: base", resumo.variacoes.join(" | "));
check("resumo lista só talentos com rank e conta os pontos", resumo.talentos.length >= 1 && resumo.pontos === 3, `${resumo.talentos.join(", ")} / ${resumo.pontos}`);
const vazio = resumoLoadout(base, PLAYABLE_CLASSES[0]);
check("slot sem escolhas: tudo base e nenhum talento", vazio.talentos.length === 0 && vazio.pontos === 0 && vazio.variacoes.every((l) => l.endsWith("base")));

console.log(`\n${total - falhas}/${total} testes passaram.`);
if (falhas > 0) process.exit(1);
