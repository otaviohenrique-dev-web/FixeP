/**
 * Migra os dados do banco de produção para um banco NOVO (ex.: Supabase de Oregon -> São Paulo), sem pg_dump.
 *
 * Uso (na pasta packages/server, com o servidor de produção PARADO para ninguém gravar durante a cópia):
 *   npx tsx ../../tools/migrar_banco.mts --teste    só confere: conecta nos dois, conta as linhas, não grava nada
 *   npx tsx ../../tools/migrar_banco.mts            cria as tabelas no banco novo (migrações do jogo) e copia os dados
 *
 * De onde vêm as conexões (o script NUNCA mostra as strings nem as senhas):
 *   - banco ANTIGO: DATABASE_URL do arquivo .env da raiz do projeto (o de produção)
 *   - banco NOVO:   DATABASE_URL do arquivo _local/novo_banco.env (crie este arquivo com uma linha só)
 *   - DATABASE_CA (opcional): do .env da raiz, vale para os dois (a CA raiz do Supabase é a mesma)
 *
 * Regras de segurança:
 *   - o banco novo precisa estar VAZIO (nenhum personagem); senão o script para sem gravar nada
 *   - copia só as colunas que existem nos dois bancos (o banco novo pode ter colunas a mais, com padrão)
 *   - tudo numa transação no banco novo: ou copia tudo, ou nada
 *   - no fim compara a contagem de linhas de cada tabela nos dois bancos
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const TESTE = process.argv.includes("--teste");

/** lê uma variável de um arquivo .env simples (CHAVE=valor), sem imprimir nada */
function lerEnv(arquivo: string, chave: string): string | undefined {
  let txt: string;
  try { txt = readFileSync(arquivo, "utf8"); } catch { return undefined; }
  for (const linha of txt.split(/\r?\n/)) {
    const m = linha.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m && m[1] === chave) return m[2].replace(/^["']|["']$/g, "");
  }
  return undefined;
}

/** aceita senha "crua" com símbolos (@ # / ? : etc.): codifica a senha (entre o primeiro ":" e o ÚLTIMO "@") se ela não estiver codificada */
function urlSegura(u: string | undefined): string | undefined {
  if (!u) return u;
  const i = u.indexOf("://"); if (i < 0) return u;
  const resto = u.slice(i + 3), arroba = resto.lastIndexOf("@"); if (arroba < 0) return u;
  const cred = resto.slice(0, arroba), dp = cred.indexOf(":"); if (dp < 0) return u;
  const senha = cred.slice(dp + 1);
  if (!/[@#/?:\[\] ]/.test(senha)) return u; // já está ok (ou já codificada)
  return `${u.slice(0, i + 3)}${cred.slice(0, dp)}:${encodeURIComponent(senha)}${resto.slice(arroba)}`;
}
const urlAntiga = urlSegura(lerEnv(path.join(RAIZ, ".env"), "DATABASE_URL"));
const urlNova = urlSegura(lerEnv(path.join(RAIZ, "_local", "novo_banco.env"), "DATABASE_URL"));
const ca = lerEnv(path.join(RAIZ, ".env"), "DATABASE_CA");
if (!urlAntiga) { console.error("Falta DATABASE_URL no .env da raiz (banco antigo)."); process.exit(1); }
if (!urlNova) { console.error("Falta DATABASE_URL em _local/novo_banco.env (banco novo)."); process.exit(1); }
const host = (u: string) => { try { return new URL(u).hostname; } catch { return "?"; } };
if (host(urlAntiga) === host(urlNova) && new URL(urlAntiga).username === new URL(urlNova).username) {
  console.error("O banco novo é o MESMO do antigo (mesmo endereço e usuário). Confira o _local/novo_banco.env."); process.exit(1);
}
console.log(`banco antigo: ${host(urlAntiga)}`);
console.log(`banco novo:   ${host(urlNova)}`);

const ssl = (): pg.PoolConfig["ssl"] => {
  if (!ca) return { rejectUnauthorized: false };
  const pem = ca.includes("-----BEGIN") ? ca.replace(/\\n/g, "\n") : readFileSync(path.isAbsolute(ca) ? ca : path.join(RAIZ, ca), "utf8");
  return { ca: pem, rejectUnauthorized: true };
};
const antigo = new pg.Pool({ connectionString: urlAntiga, max: 2, ssl: ssl() });
const novo = new pg.Pool({ connectionString: urlNova, max: 2, ssl: ssl() });

type Coluna = { nome: string; tipo: string };
async function colunas(pool: pg.Pool, tabela: string): Promise<Coluna[]> {
  const r = await pool.query<{ column_name: string; data_type: string; is_generated: string }>(
    "select column_name, data_type, is_generated from information_schema.columns where table_schema = 'public' and table_name = $1 order by ordinal_position", [tabela]);
  return r.rows.filter((c) => c.is_generated !== "ALWAYS").map((c) => ({ nome: c.column_name, tipo: c.data_type }));
}
async function tabelas(pool: pg.Pool): Promise<string[]> {
  const r = await pool.query<{ table_name: string }>("select table_name from information_schema.tables where table_schema = 'public' and table_type = 'BASE TABLE' order by table_name");
  return r.rows.map((x) => x.table_name);
}
const contar = async (pool: pg.Pool, t: string) => Number((await pool.query(`select count(*)::text as n from "${t}"`)).rows[0].n);

/** ordem de cópia: quem é referenciado (chave estrangeira) vem antes de quem referencia */
async function ordemPorFk(pool: pg.Pool, lista: string[]): Promise<string[]> {
  const r = await pool.query<{ filho: string; pai: string }>(`
    select tc.table_name as filho, ccu.table_name as pai
    from information_schema.table_constraints tc
    join information_schema.constraint_column_usage ccu on ccu.constraint_name = tc.constraint_name and ccu.table_schema = tc.table_schema
    where tc.constraint_type = 'FOREIGN KEY' and tc.table_schema = 'public'`);
  const deps = new Map(lista.map((t) => [t, new Set<string>()]));
  for (const { filho, pai } of r.rows) if (filho !== pai && deps.has(filho) && deps.has(pai)) deps.get(filho)!.add(pai);
  const out: string[] = [], feito = new Set<string>();
  const visitar = (t: string, pilha = new Set<string>()) => {
    if (feito.has(t) || pilha.has(t)) return;
    pilha.add(t);
    for (const p of deps.get(t) ?? []) visitar(p, pilha);
    feito.add(t); out.push(t);
  };
  lista.forEach((t) => visitar(t));
  return out;
}

async function principal() {
  // 1) o banco novo recebe as tabelas pelas próprias migrações do jogo (mesmo caminho do servidor)
  if (!TESTE) {
    process.env.DATABASE_URL = urlNova;
    if (ca) process.env.DATABASE_CA = ca;
    const { openDb } = await import("../packages/server/src/db/index.js");
    const db = await openDb();
    await db.close();
  }

  const doAntigo = (await tabelas(antigo)).filter((t) => t !== "schema_migrations");
  const doNovo = new Set(await tabelas(novo));
  console.log(`\ntabelas no banco antigo: ${doAntigo.length}`);
  const contagemAntiga = new Map<string, number>();
  for (const t of doAntigo) contagemAntiga.set(t, await contar(antigo, t));
  for (const t of doAntigo) console.log(`  ${t.padEnd(28)} ${String(contagemAntiga.get(t)).padStart(8)} linhas${doNovo.has(t) ? "" : TESTE ? "" : "  (NÃO existe no novo: será pulada)"}`);

  if (TESTE) {
    console.log("\n--teste: conexão com os dois bancos OK. Nada foi gravado.");
    return;
  }

  const personagens = doNovo.has("characters") ? await contar(novo, "characters") : 0;
  if (personagens > 0) { console.error(`\nO banco novo já tem ${personagens} personagem(ns). Pare: ele precisa estar vazio.`); process.exit(1); }

  const ordem = await ordemPorFk(novo, doAntigo.filter((t) => doNovo.has(t)));
  const c = await novo.connect();
  try {
    await c.query("begin");
    for (const t of ordem) {
      const colsA = await colunas(antigo, t), colsN = new Map((await colunas(novo, t)).map((x) => [x.nome, x]));
      const cols = colsA.filter((x) => colsN.has(x.nome));
      const json = new Set(cols.filter((x) => /json/.test(colsN.get(x.nome)!.tipo)).map((x) => x.nome));
      const lista = cols.map((x) => `"${x.nome}"`).join(", ");
      const linhas = (await antigo.query(`select ${lista} from "${t}"`)).rows;
      await c.query(`delete from "${t}"`); // tabelas que as migrações já preenchem (ex.: dados padrão) recebem os dados reais
      for (let i = 0; i < linhas.length; i += 300) {
        const lote = linhas.slice(i, i + 300);
        const vals: unknown[] = [];
        const ph = lote.map((l) => `(${cols.map((x) => { const v = l[x.nome]; vals.push(json.has(x.nome) && v !== null ? JSON.stringify(v) : v); return `$${vals.length}`; }).join(", ")})`).join(", ");
        await c.query(`insert into "${t}" (${lista}) overriding system value values ${ph}`, vals);
      }
      console.log(`  copiada ${t.padEnd(28)} ${String(linhas.length).padStart(8)}`);
    }
    // sequências (ids automáticos) continuam do maior valor copiado
    const seqs = await c.query<{ tabela: string; coluna: string; seq: string }>(`
      select t.relname as tabela, a.attname as coluna, pg_get_serial_sequence(format('%I', t.relname), a.attname) as seq
      from pg_class t join pg_namespace n on n.oid = t.relnamespace join pg_attribute a on a.attrelid = t.oid
      where n.nspname = 'public' and t.relkind = 'r' and a.attnum > 0 and pg_get_serial_sequence(format('%I', t.relname), a.attname) is not null`);
    for (const s of seqs.rows) await c.query(`select setval($1, coalesce((select max("${s.coluna}") from "${s.tabela}"), 0) + 1, false)`, [s.seq]);
    await c.query("commit");
  } catch (e) {
    await c.query("rollback").catch(() => {});
    console.error("\nFALHOU e nada foi gravado no banco novo:", (e as Error).message);
    process.exit(1);
  } finally {
    c.release();
  }

  // 3) conferência: mesma contagem de linhas nos dois bancos
  let ok = true;
  console.log("\nconferência (antigo x novo):");
  for (const t of ordem) {
    const a = contagemAntiga.get(t)!, n = await contar(novo, t);
    if (a !== n) ok = false;
    console.log(`  ${a === n ? "OK " : "DIF"} ${t.padEnd(28)} ${a} x ${n}`);
  }
  console.log(ok ? "\nMigração concluída: todas as tabelas batem." : "\nATENÇÃO: alguma tabela não bateu (veja DIF acima).");
  if (!ok) process.exitCode = 1;
}

principal().finally(async () => { await antigo.end().catch(() => {}); await novo.end().catch(() => {}); });
