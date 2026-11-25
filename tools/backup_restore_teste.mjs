// Teste de backup + restauração do FrixeP SEM pg_dump/psql (só Node).
//
// Uso (na raiz do projeto):
//   node --env-file=E:\Projetos_Dev\FrixeP\.env tools/backup_restore_teste.mjs
//
// O que faz:
//  1. BACKUP: lê o banco de produção com SOMENTE SELECT (transação "read only"), grava um JSON por
//     tabela + manifesto em E:\Projetos_Dev\FrixeP-backups-banco\ (fora do Git).
//  2. RESTAURAÇÃO: cria um PGlite temporário com as migrações do projeto e carrega os JSON nele.
//  3. COMPARAÇÃO: contagem de linhas e checksum (md5 do conteúdo) de cada tabela, origem x restaurado.
//  4. SERVIDOR: sobe o servidor apontando para o banco restaurado (porta 2599) e confere /health.
//
// Segurança: a DATABASE_URL é lida só de process.env e NUNCA é impressa. Mensagens de erro têm a URL
// trocada por [URL-OCULTA]. O relatório mostra só nomes de tabelas, contagens e checksums.

import { mkdir, writeFile, readdir, readFile, rm } from "node:fs/promises";
import { readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { spawn } from "node:child_process";
import { randomBytes } from "node:crypto";
import path from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";
import { PGlite } from "@electric-sql/pglite";

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const MIGRACOES = path.join(RAIZ, "packages", "server", "migrations");
const PASTA_BACKUP = "E:\\Projetos_Dev\\FrixeP-backups-banco";
const PORTA_TESTE = 2599;

const url = process.env.DATABASE_URL;
const ca = process.env.DATABASE_CA;
const ocultar = (e) => String(e?.message ?? e).split(url || "\u0000").join("[URL-OCULTA]");
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const aspas = (nome) => `"${nome.replace(/"/g, '""')}"`;

// mesma regra de TLS do servidor (packages/server/src/db/index.ts)
function sslDe(u) {
  const host = new URL(u).hostname;
  if (host === "localhost" || host === "127.0.0.1") return false;
  if (ca) return { ca: ca.includes("-----BEGIN") ? ca.replace(/\\n/g, "\n") : readFileSync(ca, "utf8"), rejectUnauthorized: true };
  return { rejectUnauthorized: false };
}

const consulta = (tabela) =>
  `select count(*)::int as n, coalesce(md5(string_agg(x::text, '|' order by x::text)), '') as cs from ${aspas(tabela)} x`;

async function main() {
  if (!url) {
    console.log("ERRO: DATABASE_URL não está no ambiente. Rode com --env-file=E:\\Projetos_Dev\\FrixeP\\.env");
    return 1;
  }

  // ---------- 1. BACKUP (somente leitura) ----------
  console.log("[1/4] Backup de produção (somente SELECT, transação read only)...");
  const cli = new pg.Client({ connectionString: url, ssl: sslDe(url), connectionTimeoutMillis: 15000 });
  const origem = {};
  await cli.connect();
  try {
    await cli.query("set time zone 'UTC'"); // configuração da sessão, não altera dados
    await cli.query("begin read only");
    const { rows: tabs } = await cli.query(
      "select table_name from information_schema.tables where table_schema = 'public' and table_type = 'BASE TABLE' order by 1",
    );
    for (const { table_name: t } of tabs) {
      const dados = (await cli.query(`select coalesce(json_agg(x), '[]'::json) as d from ${aspas(t)} x`)).rows[0].d;
      const c = (await cli.query(consulta(t))).rows[0];
      origem[t] = { dados, n: c.n, cs: c.cs };
    }
    await cli.query("commit");
  } catch (e) {
    await cli.query("rollback").catch(() => {});
    throw new Error(`falha lendo produção: ${ocultar(e)}`);
  } finally {
    await cli.end().catch(() => {});
  }

  const stamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, "-");
  const pastaBackup = path.join(PASTA_BACKUP, `backup_${stamp}`);
  await mkdir(pastaBackup, { recursive: true });
  for (const [t, v] of Object.entries(origem)) {
    await writeFile(path.join(pastaBackup, `${t}.json`), JSON.stringify(v.dados));
  }
  await writeFile(
    path.join(pastaBackup, "manifesto.json"),
    JSON.stringify(
      { criado_em: new Date().toISOString(), tabelas: Object.fromEntries(Object.entries(origem).map(([t, v]) => [t, { linhas: v.n, checksum: v.cs }])) },
      null,
      2,
    ),
  );
  console.log(`      ${Object.keys(origem).length} tabelas gravadas em ${pastaBackup}`);

  // ---------- 2. RESTAURAÇÃO num PGlite temporário ----------
  console.log("[2/4] Restaurando em banco de TESTE descartável (PGlite, com as migrações do projeto)...");
  const dirTeste = path.join(tmpdir(), `frixep-restauracao-${Date.now()}`);
  await mkdir(dirTeste, { recursive: true });
  const db = new PGlite(dirTeste);
  await db.waitReady;
  const erros = [];
  try {
    await db.exec("create table if not exists schema_migrations (name text primary key, applied_at timestamptz not null default now())");
    for (const f of (await readdir(MIGRACOES)).filter((f) => f.endsWith(".sql")).sort()) {
      await db.transaction(async (t) => {
        await t.exec(await readFile(path.join(MIGRACOES, f), "utf8"));
        await t.query("insert into schema_migrations (name) values ($1)", [f]);
      });
    }
    await db.exec("delete from schema_migrations"); // o histórico de migrações vem da produção
    await db.exec("set session_replication_role = replica"); // carga sem checar FKs (ordem das tabelas)
    for (const [t, v] of Object.entries(origem)) {
      if (v.dados.length === 0) continue;
      try {
        // "overriding system value": colunas identity GENERATED ALWAYS recebem o id original
        await db.query(`insert into ${aspas(t)} overriding system value select * from jsonb_populate_recordset(null::${aspas(t)}, $1::jsonb)`, [JSON.stringify(v.dados)]);
      } catch (e) {
        erros.push(`${t}: ${ocultar(e)}`);
      }
    }
    await db.exec("set session_replication_role = origin");
    // ajusta sequências (ids automáticos) para continuarem após o maior id restaurado
    const seqs = (
      await db.query(
        "select table_name, column_name from information_schema.columns where table_schema = 'public' and (column_default like 'nextval%' or is_identity = 'YES')",
      )
    ).rows;
    for (const { table_name: t, column_name: c } of seqs) {
      const seq = (await db.query("select pg_get_serial_sequence($1, $2) as s", [`public.${aspas(t)}`, c])).rows[0].s;
      if (seq) await db.query(`select setval($1, coalesce((select max(${aspas(c)}) from ${aspas(t)}), 0) + 1, false)`, [seq]);
    }

    // ---------- 3. COMPARAÇÃO ----------
    console.log("[3/4] Comparando origem x restaurado (contagem e checksum por tabela)...");
    await db.exec("set time zone 'UTC'");
    const restauradasNomes = new Set(
      (await db.query("select table_name from information_schema.tables where table_schema = 'public' and table_type = 'BASE TABLE'")).rows.map((r) => r.table_name),
    );
    const linhas = [];
    let tudoOk = true;
    for (const [t, v] of Object.entries(origem)) {
      if (!restauradasNomes.has(t)) {
        linhas.push([t, v.n, "—", "—", "DIFERENÇA (tabela não existe no restaurado)"]);
        tudoOk = false;
        continue;
      }
      const r = (await db.query(consulta(t))).rows[0];
      const ok = r.n === v.n && r.cs === v.cs;
      if (!ok) tudoOk = false;
      linhas.push([t, v.n, r.n, v.cs.slice(0, 8) + (ok ? "" : "≠" + r.cs.slice(0, 8)), ok ? "OK" : "DIFERENÇA"]);
    }
    for (const t of restauradasNomes) if (!(t in origem)) { linhas.push([t, "—", "?", "—", "DIFERENÇA (só no restaurado)"]); tudoOk = false; }

    console.log("\n  Tabela                         | Origem | Restaurado | Checksum (início)   | Resultado");
    console.log("  -------------------------------+--------+------------+---------------------+----------");
    for (const [t, a, b, c, res] of linhas) {
      console.log(`  ${String(t).padEnd(30)} | ${String(a).padStart(6)} | ${String(b).padStart(10)} | ${String(c).padEnd(19)} | ${res}`);
    }
    console.log(`\n  Tabelas: ${linhas.length} | Linhas origem: ${Object.values(origem).reduce((s, v) => s + v.n, 0)} | Resultado geral: ${tudoOk ? "OK" : "DIFERENÇA"}`);
    if (erros.length) {
      console.log("  Erros de carga:");
      for (const e of erros) console.log("   - " + e);
      tudoOk = false;
    }
    await db.close();

    // ---------- 4. SERVIDOR sobre o banco restaurado ----------
    console.log(`[4/4] Subindo o servidor na porta ${PORTA_TESTE} sobre o banco restaurado...`);
    const env = { ...process.env };
    for (const k of ["DATABASE_URL", "DATABASE_CA", "DB_SCHEMA", "NODE_ENV"]) delete env[k];
    Object.assign(env, {
      PORT: String(PORTA_TESTE),
      PGLITE_DIR: dirTeste,
      JWT_SECRET: randomBytes(32).toString("hex"), // valor temporário, só para este teste
      SERVER_URL: `http://localhost:${PORTA_TESTE}`,
      CLIENT_URL: "http://localhost:5173",
    });
    const log = [];
    const filho = spawn("npx", ["tsx", "src/index.ts"], { cwd: path.join(RAIZ, "packages", "server"), env, shell: true });
    filho.stdout.on("data", (d) => log.push(...String(d).split("\n")));
    filho.stderr.on("data", (d) => log.push(...String(d).split("\n")));
    let saude = null;
    for (let i = 0; i < 90 && !saude; i++) {
      await sleep(1000);
      try {
        const r = await fetch(`http://127.0.0.1:${PORTA_TESTE}/health`);
        if (r.ok) saude = await r.json();
      } catch {}
    }
    const conectou = log.find((l) => l.includes("[db] conectado"));
    console.log(`      /health: ${saude ? JSON.stringify(saude) : "SEM RESPOSTA"}`);
    console.log(`      ${conectou ? conectou.trim() : "[db] conectado: não encontrado no log"}`);
    if (!saude || !conectou) tudoOk = false;
    if (process.platform === "win32") spawn("taskkill", ["/pid", String(filho.pid), "/T", "/F"]);
    else filho.kill("SIGKILL");
    await sleep(1500);
    await rm(dirTeste, { recursive: true, force: true, maxRetries: 5 }).catch(() => {});

    console.log(`\nRESULTADO FINAL: ${tudoOk ? "OK" : "DIFERENÇA/FALHA"}`);
    return tudoOk ? 0 : 1;
  } finally {
    await db.close().catch(() => {});
  }
}

main().then(
  (code) => (process.exitCode = code),
  (e) => {
    console.log("ERRO: " + ocultar(e));
    process.exitCode = 1;
  },
);
