// Testes unitários da telemetria mínima (C0.5): gravação, descarte de dados sensíveis, 1º abate único e "nunca derruba o jogo".
// Uso: npx tsx test/telemetria.unit.ts   (banco embutido em memória)
import { randomUUID } from "node:crypto";
import { openDb, type Db } from "../src/db/index.js";
import { registrarEvento, limparDados } from "../src/telemetria.js";

process.env.PGLITE_DIR ??= "memory";

const results: boolean[] = [];
const check = (name: string, ok: boolean, detail = "") => { results.push(ok); console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? "  -> " + detail : ""}`); };

const db = await openDb();
const conta = randomUUID();
const personagem = randomUUID();
const contar = async (tipo: string, personagemId = personagem) =>
  Number((await db.query<{ n: string }>("select count(*)::text as n from eventos where tipo = $1 and personagem_id = $2", [tipo, personagemId])).rows[0].n);

console.log("== Dados sensíveis ==");
{
  const limpo = limparDados({ nivel: 5, senha: "x", token: "y", email: "a@b.c", ip: "1.2.3.4", aninhado: { zona: 2, access_token: "z", ip_address: "9" }, classe: "warrior" });
  check("campos de senha, token, e-mail e IP são descartados", !("senha" in limpo) && !("token" in limpo) && !("email" in limpo) && !("ip" in limpo));
  check("campos aninhados sensíveis também saem", !("access_token" in (limpo.aninhado as object)) && !("ip_address" in (limpo.aninhado as object)) && (limpo.aninhado as any).zona === 2);
  check("campos úteis continuam", limpo.nivel === 5 && limpo.classe === "warrior");
}

console.log("\n== Gravação ==");
await registrarEvento(db, "login", { contaId: conta, dados: { provedor: "guest", senha: "nao-pode" } });
{
  const { rows } = await db.query<any>("select tipo, conta_id, personagem_id, dados, criado_em from eventos where tipo = 'login' and conta_id = $1", [conta]);
  check("login gravado com conta e sem personagem", rows.length === 1 && rows[0].personagem_id === null && rows[0].dados.provedor === "guest");
  check("senha enviada por engano não vai para o banco", rows.length === 1 && !("senha" in rows[0].dados));
  check("criado_em preenchido", rows.length === 1 && rows[0].criado_em instanceof Date);
}
await registrarEvento(db, "criacao_personagem", { contaId: conta, personagemId: personagem, dados: { classe: "archer" } });
check("criação de personagem gravada com personagem", (await contar("criacao_personagem")) === 1);

console.log("\n== 1º abate e nível 5 ==");
await registrarEvento(db, "primeiro_abate", { contaId: conta, personagemId: personagem, dados: { nivel: 1 } });
await registrarEvento(db, "primeiro_abate", { contaId: conta, personagemId: personagem, dados: { nivel: 2 } });
await registrarEvento(db, "primeiro_abate", { contaId: conta, personagemId: personagem });
check("1º abate é gravado uma única vez por personagem", (await contar("primeiro_abate")) === 1);
const outro = randomUUID();
await registrarEvento(db, "primeiro_abate", { contaId: conta, personagemId: outro });
check("outro personagem tem o seu próprio 1º abate", (await contar("primeiro_abate", outro)) === 1);
await registrarEvento(db, "nivel_5", { contaId: conta, personagemId: personagem, dados: { nivel: 5 } });
check("nível 5 gravado", (await contar("nivel_5")) === 1);
await registrarEvento(db, "saida", { contaId: conta, personagemId: personagem, dados: { nivel: 5, zona: 1 } });
check("saída gravada", (await contar("saida")) === 1);

console.log("\n== Nunca derruba o jogo ==");
{
  const quebrado = { kind: "pglite", query: async () => { throw new Error("banco fora do ar"); }, exec: async () => {}, tx: async () => { throw new Error("x"); }, close: async () => {} } as unknown as Db;
  let lancou = false;
  try { await registrarEvento(quebrado, "saida", { personagemId: personagem }); } catch { lancou = true; }
  check("banco com erro não lança exceção", !lancou);
  lancou = false;
  try { await registrarEvento(undefined as unknown as Db, "login"); } catch { lancou = true; }
  check("sem banco também não lança", !lancou);
  lancou = false;
  try { await registrarEvento(db, "tipo_inexistente" as any, { personagemId: personagem }); } catch { lancou = true; }
  check("tipo inválido é recusado pelo banco sem lançar", !lancou && (await contar("tipo_inexistente")) === 0);
}

const falhou = results.filter((r) => !r).length;
console.log(`\n${results.length - falhou}/${results.length} verificações passaram.`);
await db.close();
if (falhou) process.exit(1);
