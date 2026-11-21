<#
.SYNOPSIS
  Remove do banco as contas CONVIDADO de teste antigas (sem atividade há N dias).

.DESCRIPTION
  O login de convidado grava a conta em `accounts` com provider = 'guest' (veja packages/server/src/auth.ts,
  rota /guest, que só existe em desenvolvimento ou com ALLOW_GUEST=1). A "atividade" de uma conta é a última
  alteração de algum dos seus personagens (characters.updated_at, gravado a cada save).

  Alvo: contas provider = 'guest' criadas há mais de -Dias dias E sem nenhum personagem alterado nesse período.
  Ao apagar a conta, o banco remove em cascata os personagens, inventário, equipamento, cidade e mercado
  ligados a ela (todas as chaves estrangeiras são ON DELETE CASCADE).

  Segurança:
  - SIMULA por padrão: só mostra a contagem. Para apagar de verdade é preciso -Executar.
  - Usa SOMENTE a variável de ambiente DATABASE_URL da sessão. Este script NUNCA lê o arquivo .env,
    e NUNCA imprime, grava ou registra a URL nem senhas.
  - Opcional: DATABASE_CA (certificado da CA, PEM ou caminho de arquivo), igual ao servidor.
  - A exclusão roda em UMA transação: se algo falhar, nada é apagado.
  - Só atinge o banco PostgreSQL configurado em DATABASE_URL (Supabase). O banco embutido de desenvolvimento
    (pasta .data/) não é tocado por este script.

  Requer Node.js e as dependências instaladas (npm.cmd install), porque usa o pacote `pg` do projeto.

.PARAMETER Dias     Quantas dias sem atividade para considerar a conta antiga. Padrão: 7 (entre 1 e 3650).
.PARAMETER Executar Sem este parâmetro o script só simula. Com ele, apaga de verdade (irreversível).

.EXAMPLE
  powershell -ExecutionPolicy Bypass -File tools\limpar_convidados.ps1
  Simula: mostra quantas contas e personagens seriam apagados.

.EXAMPLE
  powershell -ExecutionPolicy Bypass -File tools\limpar_convidados.ps1 -Dias 14 -Executar
  Apaga de verdade as contas convidado sem atividade há 14 dias ou mais.
#>
param(
  [ValidateRange(1, 3650)]
  [int]$Dias = 7,

  [switch]$Executar
)

$ErrorActionPreference = 'Stop'

function Sair-Erro([string]$msg) {
  Write-Host ''
  Write-Host "ERRO: $msg" -ForegroundColor Red
  exit 1
}

$raiz = Split-Path -Parent $PSScriptRoot
$modo = if ($Executar) { 'EXECUTAR (apaga de verdade)' } else { 'SIMULAÇÃO (nada é apagado)' }
Write-Host "Limpeza de contas convidado | modo: $modo | sem atividade há $Dias dia(s)"

# 1. Conferir a variável (sem mostrar o valor)
if ([string]::IsNullOrWhiteSpace($env:DATABASE_URL)) {
  Write-Host ''
  Write-Host 'AVISO: a variável DATABASE_URL não está definida nesta sessão.' -ForegroundColor Yellow
  Write-Host 'Motivo: o script só atua no PostgreSQL de produção/teste apontado por DATABASE_URL.' -ForegroundColor Yellow
  Write-Host 'Sem ela o servidor usa o banco embutido (.data/), e nada foi consultado nem apagado.' -ForegroundColor Yellow
  Write-Host 'Defina DATABASE_URL no ambiente do usuário (abra um novo terminal depois) e rode de novo.' -ForegroundColor Yellow
  exit 1
}

# 2. Conferir o Node e o pacote pg do projeto
$node = Get-Command node -ErrorAction SilentlyContinue
if (-not $node) { Sair-Erro 'Node.js não encontrado no PATH. Instale o Node.js e rode npm.cmd install na raiz do projeto.' }
$pgDir = Join-Path $raiz 'node_modules\pg'
if (-not (Test-Path -LiteralPath $pgDir)) { Sair-Erro 'pacote pg não encontrado. Rode npm.cmd install na raiz do projeto e tente de novo.' }

# 3. Código Node (ficará num arquivo temporário, apagado ao final)
$codigo = @'
const fs = require("fs");
const { Client } = require("pg");

function ssl(url) {
  const host = new URL(url).hostname;
  if (host === "localhost" || host === "127.0.0.1") return false;
  const ca = process.env.DATABASE_CA;
  if (!ca) {
    console.log("[aviso] DATABASE_CA não definido: conexão TLS sem verificação do certificado (igual ao servidor).");
    return { rejectUnauthorized: false };
  }
  const pem = ca.includes("-----BEGIN") ? ca.replace(/\\n/g, "\n") : fs.readFileSync(ca, "utf8");
  return { ca: pem, rejectUnauthorized: true };
}

(async () => {
  const dias = parseInt(process.env.LIMPEZA_DIAS, 10);
  const executar = process.env.LIMPEZA_EXECUTAR === "1";
  const client = new Client({ connectionString: process.env.DATABASE_URL, ssl: ssl(process.env.DATABASE_URL), connectionTimeoutMillis: 15000 });
  await client.connect();
  try {
    // alvo: contas convidado antigas e sem personagem alterado dentro da janela
    const alvoSql = `
      select a.id from accounts a
       where a.provider = 'guest'
         and a.created_at < now() - make_interval(days => $1::int)
         and not exists (select 1 from characters c
                          where c.account_id = a.id
                            and c.updated_at >= now() - make_interval(days => $1::int))`;

    if (!executar) {
      const r = await client.query(
        `select count(*)::int as contas,
                (select count(*)::int from characters c where c.account_id in (${alvoSql})) as personagens
           from accounts a2 where a2.id in (${alvoSql})`, [dias]);
      console.log(`[simulação] contas convidado a apagar: ${r.rows[0].contas}`);
      console.log(`[simulação] personagens que sairiam junto (cascata): ${r.rows[0].personagens}`);
      console.log("[simulação] nada foi apagado. Para apagar de verdade, rode com -Executar.");
      return;
    }

    await client.query("begin");
    try {
      const del = await client.query(`delete from accounts where id in (${alvoSql}) and provider = 'guest'`, [dias]);
      await client.query("commit");
      console.log(`[executar] contas convidado apagadas (com personagens em cascata): ${del.rowCount}`);
    } catch (e) {
      await client.query("rollback");
      throw e;
    }
  } finally {
    await client.end();
  }
})().catch((e) => {
  // sem imprimir a URL nem o objeto de erro completo (pode conter detalhes de conexão)
  console.error(`[erro] ${e.code ? e.code + ": " : ""}${e.message}`);
  process.exit(1);
});
'@

$arquivoTmp = Join-Path ([IO.Path]::GetTempPath()) ("limpar_convidados_" + [guid]::NewGuid().ToString('N') + '.js')
$codigoOk = $false
try {
  [IO.File]::WriteAllText($arquivoTmp, $codigo, (New-Object Text.UTF8Encoding($false)))

  # 4. Rodar: o NODE_PATH aponta para o node_modules do projeto (o script temporário fica fora da pasta do projeto)
  $env:NODE_PATH = Join-Path $raiz 'node_modules'
  $env:LIMPEZA_DIAS = "$Dias"
  $env:LIMPEZA_EXECUTAR = if ($Executar) { '1' } else { '0' }
  & node $arquivoTmp
  $codigoSaida = $LASTEXITCODE
  $codigoOk = $true
} finally {
  Remove-Item -LiteralPath $arquivoTmp -Force -ErrorAction SilentlyContinue
  Remove-Item Env:LIMPEZA_DIAS, Env:LIMPEZA_EXECUTAR, Env:NODE_PATH -ErrorAction SilentlyContinue
}

if (-not $codigoOk -or $codigoSaida -ne 0) { Sair-Erro 'a limpeza falhou (veja a mensagem acima). Nada foi apagado se a transação não chegou ao commit.' }
Write-Host 'Concluído.'
