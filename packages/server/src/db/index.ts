import { readdir, readFile, mkdir } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";
import pg from "pg";
import { PGlite } from "@electric-sql/pglite";

/**
 * Camada de banco única para dois destinos:
 *  - DATABASE_URL definido  => PostgreSQL de verdade (Supabase/Neon) via `pg`
 *  - sem DATABASE_URL (dev) => PGlite, um PostgreSQL embutido, salvo em disco (ou em memória nos testes)
 * Mesmo SQL e mesmas migrações nos dois.
 */
export interface Tx {
  query: Db["query"];
  exec: Db["exec"];
}

export interface Db {
  kind: "postgres" | "pglite";
  query<T = any>(sql: string, params?: unknown[]): Promise<{ rows: T[] }>;
  exec(sql: string): Promise<void>;
  tx<T>(fn: (t: Tx) => Promise<T>): Promise<T>;
  close(): Promise<void>;
}

const isProd = process.env.NODE_ENV === "production";

function sslFor(url: string): pg.PoolConfig["ssl"] {
  const host = new URL(url).hostname;
  if (host === "localhost" || host === "127.0.0.1") return false;
  const ca = process.env.DATABASE_CA; // certificado raiz do provedor (recomendado)
  if (ca) return { ca, rejectUnauthorized: true };
  console.warn("[db] DATABASE_CA não definido: TLS sem verificação de certificado. Defina DATABASE_CA em produção.");
  return { rejectUnauthorized: false };
}

async function openPostgres(url: string): Promise<Db> {
  const pool = new pg.Pool({ connectionString: url, max: 10, idleTimeoutMillis: 30_000, connectionTimeoutMillis: 10_000, ssl: sslFor(url) });
  pool.on("error", (e) => console.error("[db] erro no pool:", e.message));
  return {
    kind: "postgres",
    query: (sql, params) => pool.query(sql, params as any[]) as any,
    exec: async (sql) => { await pool.query(sql); },
    async tx(fn) {
      const c = await pool.connect();
      try {
        await c.query("begin");
        const out = await fn({
          query: (sql, params) => c.query(sql, params as any[]) as any,
          exec: async (sql) => { await c.query(sql); }, // sem parâmetros: protocolo simples aceita vários comandos
        });
        await c.query("commit");
        return out;
      } catch (e) {
        await c.query("rollback").catch(() => {});
        throw e;
      } finally {
        c.release();
      }
    },
    close: () => pool.end(),
  };
}

async function openPglite(): Promise<Db> {
  const dir = process.env.PGLITE_DIR ?? "../../.data/pglite";
  if (dir !== "memory") await mkdir(dir, { recursive: true }); // o PGlite não cria pastas intermediárias
  const lite = dir === "memory" ? new PGlite() : new PGlite(dir);
  await lite.waitReady;
  return {
    kind: "pglite",
    query: (sql, params) => lite.query(sql, params as any[]) as any,
    exec: async (sql) => { await lite.exec(sql); },
    tx: (fn) =>
      lite.transaction((t) =>
        fn({
          query: (sql, params) => t.query(sql, params as any[]) as any,
          exec: async (sql) => { await t.exec(sql); },
        }),
      ),
    close: () => lite.close(),
  };
}

async function migrate(db: Db) {
  await db.exec(`create table if not exists schema_migrations (name text primary key, applied_at timestamptz not null default now())`);
  const dir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../migrations");
  const files = (await readdir(dir)).filter((f) => f.endsWith(".sql")).sort();
  const done = new Set((await db.query<{ name: string }>("select name from schema_migrations")).rows.map((r) => r.name));
  for (const f of files) {
    if (done.has(f)) continue;
    const sql = await readFile(path.join(dir, f), "utf8");
    await db.tx(async (t) => {
      await t.exec(sql); // arquivo inteiro numa transação: ou aplica tudo, ou nada
      await t.query("insert into schema_migrations (name) values ($1)", [f]);
    });
    console.log(`[db] migração aplicada: ${f}`);
  }
}

export async function openDb(): Promise<Db> {
  const url = process.env.DATABASE_URL;
  if (!url && isProd) throw new Error("DATABASE_URL obrigatório em produção");
  const db = url ? await openPostgres(url) : await openPglite();
  await migrate(db);
  console.log(`[db] conectado (${db.kind})`);
  return db;
}
