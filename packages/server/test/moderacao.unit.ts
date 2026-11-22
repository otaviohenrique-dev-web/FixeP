// Testes unitários da moderação mínima (C0.6): leitura de ADMIN_ACCOUNT_IDS, comandos do admin e tipos de evento novos.
// Uso: npx tsx test/moderacao.unit.ts   (banco embutido em memória)
import { randomUUID } from "node:crypto";
import { openDb } from "../src/db/index.js";
import { registrarEvento } from "../src/telemetria.js";
import { parseAdminIds, parseComandoAdmin, isAdmin, marcarContaTesteAdmin } from "../src/moderacao.js";

process.env.PGLITE_DIR ??= "memory";

const results: boolean[] = [];
const check = (name: string, ok: boolean, detail = "") => { results.push(ok); console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? "  -> " + detail : ""}`); };

console.log("== ADMIN_ACCOUNT_IDS ==");
check("sem variável: ninguém é admin", parseAdminIds(undefined).size === 0 && !isAdmin("qualquer"));
check("lista separada por vírgula, com espaços", parseAdminIds(" a1 , b2,,c3 ").size === 3 && parseAdminIds("a1,b2").has("b2"));
check("valor vazio não vira admin vazio", parseAdminIds("  ,  ").size === 0);
check("seam de teste desligado sem ADMIN_TEST_FIRST_GUEST", (marcarContaTesteAdmin("x1"), !isAdmin("x1")));

console.log("\n== comandos do admin ==");
const c1 = parseComandoAdmin("/silenciar Ana 5 spam no chat");
check("silenciar com motivo", c1?.tipo === "silenciar" && c1.nome === "Ana" && c1.minutos === 5 && c1.motivo === "spam no chat", JSON.stringify(c1));
const c2 = parseComandoAdmin('/silenciar "Ana Maria" 10');
check("silenciar com nome entre aspas (com espaço) e sem motivo", c2?.tipo === "silenciar" && c2.nome === "Ana Maria" && c2.minutos === 10 && c2.motivo === "", JSON.stringify(c2));
check("silenciar com minutos inválidos vira uso", parseComandoAdmin("/silenciar Ana zero")?.tipo === "uso");
check("silenciar com 0 minutos vira uso", parseComandoAdmin("/silenciar Ana 0")?.tipo === "uso");
check("silenciar com mais de 7 dias vira uso", parseComandoAdmin("/silenciar Ana 99999")?.tipo === "uso");
check("silenciar sem nome vira uso", parseComandoAdmin("/silenciar")?.tipo === "uso");
const b1 = parseComandoAdmin("/banir Bruno golpe");
check("banir com motivo", b1?.tipo === "banir" && b1.nome === "Bruno" && b1.motivo === "golpe", JSON.stringify(b1));
check("banir sem motivo", parseComandoAdmin("/banir Bruno")?.tipo === "banir" && (parseComandoAdmin("/banir Bruno") as any).motivo === "");
const d1 = parseComandoAdmin("/desbanir Bruno");
check("desbanir", d1?.tipo === "desbanir" && (d1 as any).nome === "Bruno");
check("/denuncias", parseComandoAdmin("/denuncias")?.tipo === "denuncias");
check("texto comum não é comando", parseComandoAdmin("oi, tudo bem?") === null && parseComandoAdmin("/g mensagem") === null);
check("motivo limitado a 200 caracteres", (parseComandoAdmin("/banir Bruno " + "x".repeat(300)) as any).motivo.length === 200);

console.log("\n== telemetria (tipos novos aceitos pelo banco) ==");
const db = await openDb();
const conta = randomUUID();
await registrarEvento(db, "denuncia", { contaId: conta, personagemId: randomUUID(), dados: { denuncia: 1 } });
await registrarEvento(db, "silenciado", { contaId: conta, dados: { minutos: 5 } });
await registrarEvento(db, "banido", { contaId: conta });
const { rows } = await db.query<{ n: string }>("select count(*)::text as n from eventos where conta_id = $1 and tipo in ('denuncia','silenciado','banido')", [conta]);
check("os 3 eventos de moderação são gravados", Number(rows[0].n) === 3, `gravados: ${rows[0].n}`);

const falhou = results.filter((r) => !r).length;
console.log(`\n${results.length - falhou}/${results.length} verificações passaram.`);
await db.close();
if (falhou) process.exit(1);
