// Utilitário para testar contra um PostgreSQL REAL (ex.: Supabase) sem misturar dados com os de verdade.
// Os testes rodam num schema separado (DB_SCHEMA, padrão "frixep_test"); aqui você confere e apaga esse schema.
//
// Uso (em packages/server):
//   node --env-file=../../.env test/remote-db.mjs status   -> contagens do schema real (public) e do de teste
//   node --env-file=../../.env test/remote-db.mjs drop     -> apaga SÓ o schema de teste (nunca o public)
import pg from "pg";

const url = process.env.DATABASE_URL;
if (!url) { console.error("DATABASE_URL não definida no .env"); process.exit(1); }
const schema = process.env.DB_SCHEMA ?? "frixep_test";
if (!/^[a-z_][a-z0-9_]{0,40}$/.test(schema) || schema === "public") { console.error("schema inválido (não pode ser 'public')"); process.exit(1); }

const ca = process.env.DATABASE_CA;
const client = new pg.Client({ connectionString: url, ssl: ca ? { ca, rejectUnauthorized: true } : { rejectUnauthorized: false } });
await client.connect();
const count = async (s, t) => {
  const ex = await client.query("select 1 from information_schema.tables where table_schema = $1 and table_name = $2", [s, t]);
  if (!ex.rowCount) return "(tabela não existe)";
  return (await client.query(`select count(*)::int as n from "${s}"."${t}"`)).rows[0].n;
};

const cmd = process.argv[2];
if (cmd === "status") {
  const sch = await client.query("select 1 from information_schema.schemata where schema_name = $1", [schema]);
  console.log("Schema REAL (public):");
  for (const t of ["accounts", "characters", "inventory_items", "equipment"]) console.log(`  ${t}: ${await count("public", t)}`);
  console.log(`Schema de TESTE (${schema}): ${sch.rowCount ? "existe" : "não existe"}`);
  if (sch.rowCount) for (const t of ["accounts", "characters", "inventory_items", "equipment"]) console.log(`  ${t}: ${await count(schema, t)}`);
} else if (cmd === "drop") {
  await client.query(`drop schema if exists "${schema}" cascade`);
  console.log(`schema de teste "${schema}" apagado (o schema public não foi tocado)`);
} else {
  console.error("use: status | drop");
  process.exitCode = 1;
}
await client.end();
