// Testes unitários das dicas contextuais (C1.6): lista fixa, validação de id e limpeza da lista vinda do banco.
// Uso: npx tsx test/dicas.unit.ts   (sem servidor e sem banco: funções puras de packages/shared/src/dicas.ts)
import { DICAS, dicaValida, dicasValidas } from "@frixep/shared";

const results: boolean[] = [];
const check = (name: string, ok: boolean, detail = "") => { results.push(ok); console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? "  -> " + detail : ""}`); };

check("lista tem as 7 dicas da Trilha Cru", DICAS.length === 7, String(DICAS.length));
check("ids são únicos", new Set(DICAS).size === DICAS.length);
check("ids são minúsculos, com sublinhado (sem espaço nem acento)", DICAS.every((d) => /^[a-z_]+$/.test(d)));
check("cada dica da lista é válida", DICAS.every((d) => dicaValida(d)));
check("id inexistente é inválido", !dicaValida("nao_existe"));
check("id vazio e sem tipo é inválido", !dicaValida("") && !dicaValida(undefined) && !dicaValida(null) && !dicaValida(7));
check("nome parecido com maiúscula é inválido", !dicaValida("PRIMEIRO_ATAQUE"));
check("__proto__ e toString não passam como dica", !dicaValida("__proto__") && !dicaValida("toString"));
check("dicasValidas: descarta lixo e mantém os válidos, na ordem da lista fixa", JSON.stringify(dicasValidas(["vida_baixa", "lixo", 3, null, "primeira_pocao"])) === JSON.stringify(["vida_baixa", "primeira_pocao"]), JSON.stringify(dicasValidas(["vida_baixa", "lixo", 3, null, "primeira_pocao"])));
check("dicasValidas: remove repetidos", dicasValidas(["vida_baixa", "vida_baixa"]).length === 1);
check("dicasValidas: não aceita o que não é lista", dicasValidas("vida_baixa").length === 0 && dicasValidas(undefined).length === 0);
check("dicasValidas: vazio devolve vazio", dicasValidas([]).length === 0);

const falhas = results.filter((r) => !r).length;
console.log(`\n${results.length - falhas}/${results.length} verificações passaram`);
if (falhas) process.exit(1);
