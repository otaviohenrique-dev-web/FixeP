// Testes unitários da auto-poção: limite do valor (0..90, passo 5) e gatilho pelo limiar.
// Uso: npx tsx test/autopocao.unit.ts   (sem servidor e sem banco: funções puras de packages/shared/src/items.ts)
import { clampAutoPot, autoPotDispara, AUTO_POT_MAX } from "@frixep/shared";

const results: boolean[] = [];
const check = (name: string, ok: boolean, detail = "") => { results.push(ok); console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? "  -> " + detail : ""}`); };

check("máximo é 90", AUTO_POT_MAX === 90);
check("0 fica 0 (desligada)", clampAutoPot(0) === 0);
check("valores válidos ficam como estão (múltiplos de 5)", [5, 35, 50, 90].every((v) => clampAutoPot(v) === v));
check("acima do máximo vira 90", clampAutoPot(95) === 90 && clampAutoPot(1000) === 90);
check("negativo vira 0", clampAutoPot(-5) === 0 && clampAutoPot(-999) === 0);
check("arredonda para o passo de 5", clampAutoPot(37) === 35 && clampAutoPot(38) === 40);
check("lixo vira 0 (string, objeto, NaN, undefined, null)", clampAutoPot("abc") === 0 && clampAutoPot({}) === 0 && clampAutoPot(NaN) === 0 && clampAutoPot(undefined) === 0 && clampAutoPot(null) === 0);
check("número em texto é aceito e limitado", clampAutoPot("40") === 40 && clampAutoPot("200") === 90);
check("Infinity vira 0", clampAutoPot(Infinity) === 0);

check("desligada (0) nunca dispara, mesmo com a vida em 1", !autoPotDispara(1, 100, 0));
check("limiar 35: não dispara com a vida em 36%", !autoPotDispara(36, 100, 35));
check("limiar 35: dispara com a vida em 35% (no limite)", autoPotDispara(35, 100, 35));
check("limiar 35: dispara abaixo do limite", autoPotDispara(10, 100, 35));
check("limiar 90: dispara com a vida em 90%", autoPotDispara(90, 100, 90));
check("vida cheia não dispara no limiar máximo", !autoPotDispara(100, 100, 90));
check("maxHp 0 não dispara (sem divisão por zero)", !autoPotDispara(0, 0, 50));

const falhas = results.filter((r) => !r).length;
console.log(`\n${results.length - falhas}/${results.length} verificações passaram`);
if (falhas) process.exit(1);
