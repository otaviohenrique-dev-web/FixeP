// Teste unitário dos talentos (C2.3): catálogo, pontos por nível, regra de subir (máximo, pontos, porta do ramo),
// limpeza de dados gravados, custo do reset e soma aos bônus (com os tetos). Uso: npx tsx test/talentos.unit.ts
import {
  TALENTOS, PLAYABLE_CLASSES, TALENTO_RAMOS, TALENTO_PORTA, talentosDaClasse, talentoPorId, pontosTotais, pontosGastos, pontosNoRamo,
  pontosLivres, limparTalentos, podeSubirTalento, subirTalento, resetCusto, aplicarTalentos, talentoEfeitoTexto, emptyBonuses, MAX_CDR, MAX_DR,
  type CharClass, type EscolhasTalentos,
} from "@frixep/shared";

let falhas = 0;
let total = 0;
const check = (nome: string, ok: boolean, detalhe = "") => {
  total++;
  if (!ok) falhas++;
  console.log(`${ok ? "PASS" : "FAIL"}  ${nome}${detalhe ? "  -> " + detalhe : ""}`);
};

console.log("== Catálogo");
check("12 talentos por classe (3 ramos x 4)", PLAYABLE_CLASSES.every((c) => talentosDaClasse(c).length === 12));
check("ids únicos", new Set(TALENTOS.map((t) => t.id)).size === TALENTOS.length);
check("3 ramos por classe com nome", PLAYABLE_CLASSES.every((c) => TALENTO_RAMOS[c].length === 3 && TALENTO_RAMOS[c].every((r) => r.nome)));
check("cada ramo tem 2 talentos de nível 1, 1 de nível 2 e 1 de nível 3",
  PLAYABLE_CLASSES.every((c) => [0, 1, 2].every((r) => {
    const ts = talentosDaClasse(c).filter((t) => t.ramo === r);
    return ts.filter((t) => t.tier === 1).length === 2 && ts.filter((t) => t.tier === 2).length === 1 && ts.filter((t) => t.tier === 3).length === 1;
  })));
check("todo talento tem ranks entre 1 e 5 e custo 1 ou 2", TALENTOS.every((t) => t.max >= 1 && t.max <= 5 && (t.custo === 1 || t.custo === 2)));
check("sem efeito exclusivo de item (só stats numéricos)", TALENTOS.every((t) => ["dano", "vida", "mana", "recarga", "cura", "armadura", "critico"].includes(t.stat)));
check("talento de nível 3 custa 2 por rank; os demais 1", TALENTOS.every((t) => (t.tier === 3 ? t.custo === 2 : t.custo === 1)));

console.log("\n== Pontos por nível");
check("nível 5 não dá ponto", pontosTotais(5) === 0);
check("nível 6 dá o 1º ponto", pontosTotais(6) === 1);
check("nível 10 dá 5 pontos", pontosTotais(10) === 5);
check("nível 50 dá 45 pontos", pontosTotais(50) === 45);

console.log("\n== Regra de subir");
const esc0: EscolhasTalentos = {};
check("sem pontos suficientes é recusado (nível 5)", !podeSubirTalento(esc0, "warrior", 5, "g_cou_vida").ok);
check("com 1 ponto sobe o 1º talento de nível 1", podeSubirTalento(esc0, "warrior", 6, "g_cou_vida").ok);
check("talento de outra classe é recusado", !podeSubirTalento(esc0, "warrior", 10, "a_pre_dano").ok);
check("id inexistente é recusado", !podeSubirTalento(esc0, "warrior", 10, "nao_existe").ok);
let e: EscolhasTalentos = { g_cou_vida: 5 };
check("passou do máximo do talento é recusado", !podeSubirTalento({ g_cou_vida: 5 }, "warrior", 20, "g_cou_vida").ok);
e = subirTalento(e, "g_fur_dano");
check("subir grava +1 rank", e.g_fur_dano === 1);
check("pontos livres caem (nível 20 = 15 pontos; 6 gastos)", pontosLivres(e, "warrior", 20) === 9, `livres ${pontosLivres(e, "warrior", 20)}`);
check("sem pontos livres é recusado (nível 6, 1 gasto)", !podeSubirTalento({ g_cou_vida: 1 }, "warrior", 6, "g_fur_dano").ok);
check("nível 2 exige 3 pontos no ramo: recusado com 2", !podeSubirTalento({ g_fur_dano: 2 }, "warrior", 20, "g_fur_recarga").ok);
check("nível 2 libera com 3 pontos no ramo", podeSubirTalento({ g_fur_dano: 3 }, "warrior", 20, "g_fur_recarga").ok);
check("nível 3 exige 6 pontos no ramo: recusado com 5", !podeSubirTalento({ g_fur_dano: 5 }, "warrior", 30, "g_fur_carnif").ok);
check("nível 3 (custo 2) libera com 6 pontos no ramo", podeSubirTalento({ g_fur_dano: 5, g_fur_crit: 1 }, "warrior", 30, "g_fur_carnif").ok);
check("custo 2 é contado: 1 rank de nível 3 gasta 2", pontosGastos({ g_fur_carnif: 1 }, "warrior") === 2);
check("pontos do ramo somam por ramo", pontosNoRamo({ g_fur_dano: 2, g_cou_vida: 3 }, "warrior", 1) === 2);

console.log("\n== Limpeza de dados gravados");
check("JSON inválido vira vazio", Object.keys(limparTalentos("{não é json", "warrior", 30)).length === 0);
check("ids de outra classe somem", Object.keys(limparTalentos('{"a_pre_dano":2}', "warrior", 30)).length === 0);
check("rank acima do máximo é cortado", limparTalentos('{"g_cou_vida":99}', "warrior", 30).g_cou_vida === 5);
check("negativo vira zero", limparTalentos('{"g_cou_vida":-3}', "warrior", 30).g_cou_vida === undefined);
const sujo = limparTalentos('{"g_cou_vida":5,"g_fur_dano":5,"g_fur_crit":5}', "warrior", 6);
check("sem pontos suficientes, o excesso é descartado (nível 6 = 1 ponto)", pontosGastos(sujo, "warrior") <= 1, JSON.stringify(sujo));
check("nível 2 sem a porta do ramo é descartado", limparTalentos('{"g_fur_recarga":2}', "warrior", 30).g_fur_recarga === undefined);
check("entrada que já é objeto também vale", limparTalentos({ g_cou_vida: 2 }, "warrior", 10).g_cou_vida === 2);

console.log("\n== Reset");
check("1º reset custa 50 tostões", resetCusto(0) === 50);
check("2º reset custa 100", resetCusto(1) === 100);
check("cada reset é mais caro que o anterior", resetCusto(4) > resetCusto(3));

console.log("\n== Bônus nos status");
const base = emptyBonuses();
const bonus = aplicarTalentos(base, { g_fur_dano: 2, g_cou_vida: 3, g_dis_mana: 1, g_dis_recarga: 2 }, "warrior");
check("dano soma % por rank (Golpe Firme 3 x 2 = +6%)", bonus.dmgPct === 6, `${bonus.dmgPct}`);
check("vida soma fixo (Couraça Viva 10 x 3)", bonus.hp === 30, `${bonus.hp}`);
check("mana soma fixo (Fôlego 5)", bonus.mana === 5, `${bonus.mana}`);
check("recarga soma % (Ritmo 2 x 2 = 4)", bonus.cdr === 4, `${bonus.cdr}`);
check("não muda o original", base.dmgPct === 0 && base.hp === 0);
const cura = aplicarTalentos(base, { g_cou_vida: 1 }, "warrior");
check("cura vai para o afixo de cura (healPct)", aplicarTalentos(base, { g_dis_tenac: 1 }, "warrior").af.healPct === 8 && cura.af.healPct === 0);
const teto = aplicarTalentos({ ...base, cdr: 28, dr: 58 }, { g_dis_recarga: 5, g_cou_arm: 5 }, "warrior");
check("recarga respeita o teto de equipamento", teto.cdr === MAX_CDR, `${teto.cdr}`);
check("redução de dano respeita o teto", teto.dr === MAX_DR, `${teto.dr}`);
check("efeito em texto", talentoEfeitoTexto(talentoPorId("g_fur_dano")!) === "+3% de dano por rank");
check("recarga em texto mostra redução", talentoEfeitoTexto(talentoPorId("g_dis_recarga")!).startsWith("−2%"));
check("porta do ramo: 0, 3 e 6", TALENTO_PORTA[1] === 0 && TALENTO_PORTA[2] === 3 && TALENTO_PORTA[3] === 6);
const todas = PLAYABLE_CLASSES.map((c: CharClass) => limparTalentos("{}", c, 1));
check("nível 1 limpa tudo (sem pontos)", todas.every((x) => Object.keys(x).length === 0));

console.log(`\n${total - falhas}/${total} verificações passaram.`);
if (falhas) process.exit(1);
