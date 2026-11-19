<#
.SYNOPSIS
  Atualiza e reinicia o servidor do FrixeP que roda na SUA máquina (atrás do Cloudflare Tunnel, em api.frixep.com).

.DESCRIPTION
  O servidor roda numa pasta própria (padrão: E:\Projetos_Dev\FrixeP-servidor), sempre na versão publicada na `main` do GitHub,
  separada da pasta onde você (ou as sessões do Claude) desenvolve. Assim trocar de branch ou editar código NUNCA derruba o jogo.

  O que o script faz, nesta ordem:
    1. cria a pasta do servidor na primeira vez (git worktree da `main`, sem copiar o repositório inteiro);
    2. baixa a `main` mais recente (git fetch) e posiciona a pasta nela;
    3. instala as dependências só quando o package-lock.json mudou;
    4. para o servidor anterior (só o processo que ESTE script iniciou; nunca mata processo de terceiros);
    5. sobe o servidor em segundo plano, em modo de produção, com o log em <pasta>\logs\servidor.log;
    6. espera o /health responder e mostra o resultado (local e público).

  O arquivo .env NUNCA é lido nem impresso por este script: ele só é passado ao Node (--env-file). Por padrão usa o .env da pasta
  principal do projeto. O túnel do Cloudflare (cloudflared) não é tocado.

.PARAMETER Parar     Só para o servidor e sai.
.PARAMETER Status    Mostra se o servidor está de pé e a versão (commit) que está rodando.
.PARAMETER Log       Mostra o final do log (e segue com -Seguir).
.PARAMETER Seguir    Com -Log: acompanha o log ao vivo (Ctrl+C sai; o servidor continua rodando).
.PARAMETER Pasta     Onde fica o servidor. Padrão: <pasta do projeto>\..\FrixeP-servidor.
.PARAMETER EnvFile   Arquivo .env a usar. Padrão: o .env da pasta principal do projeto.
.PARAMETER Porta     Porta do servidor. Padrão 2567 (a que o túnel aponta).
.PARAMETER Dev       Sobe em modo de desenvolvimento (NODE_ENV diferente de production: conta de convidado ligada). Só para testes.

.EXAMPLE
  .\tools\servidor.ps1            # atualiza e reinicia
  .\tools\servidor.ps1 -Status
  .\tools\servidor.ps1 -Log -Seguir
  .\tools\servidor.ps1 -Parar
#>
[CmdletBinding()]
param(
  [switch]$Parar,
  [switch]$Status,
  [switch]$Log,
  [switch]$Seguir,
  [string]$Pasta,
  [string]$EnvFile,
  [int]$Porta = 2567,
  [switch]$Dev
)

$ErrorActionPreference = "Continue"   # (o git escreve progresso em stderr; as falhas são checadas pelo código de saída)
$Origem = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path          # a pasta do projeto onde este script está
if (-not $Pasta) { $Pasta = Join-Path (Split-Path $Origem -Parent) "FrixeP-servidor" }
if (-not $EnvFile) { $EnvFile = Join-Path $Origem ".env" }
$PidFile = Join-Path $Pasta "servidor.pid"
$LogDir = Join-Path $Pasta "logs"
$LogFile = Join-Path $LogDir "servidor.log"
$HashFile = Join-Path $Pasta ".instalado-hash"

function Info($m) { Write-Host "[servidor] $m" -ForegroundColor Cyan }
function Ok($m) { Write-Host "[servidor] $m" -ForegroundColor Green }
function Aviso($m) { Write-Host "[servidor] $m" -ForegroundColor Yellow }
function Falha($m) { Write-Host "[servidor] ERRO: $m" -ForegroundColor Red; exit 1 }

function GitC { param([string[]]$a, [string]$dir = $Pasta)
  $out = & git -C $dir @a 2>&1 | ForEach-Object { "$_" }
  if ($LASTEXITCODE -ne 0) { Falha "git $($a -join ' ') falhou: $out" }
  return $out
}

function PidDoServidor {
  if (-not (Test-Path $PidFile)) { return $null }
  $p = [int](Get-Content $PidFile -ErrorAction SilentlyContinue | Select-Object -First 1)
  if ($p -and (Get-Process -Id $p -ErrorAction SilentlyContinue)) { return $p }
  return $null
}

function PararServidor {
  $p = PidDoServidor
  if (-not $p) { Info "nenhum servidor iniciado por este script está rodando."; return }
  Info "parando o servidor (PID $p e os processos filhos)..."
  & taskkill.exe /PID $p /T /F 2>&1 | Out-Null          # /T leva junto a árvore (npx/tsx/node)
  Start-Sleep -Seconds 1
  Remove-Item $PidFile -ErrorAction SilentlyContinue
  Ok "servidor parado."
}

function DonoDaPorta {
  $c = Get-NetTCPConnection -LocalPort $Porta -State Listen -ErrorAction SilentlyContinue | Select-Object -First 1
  if ($c) { return $c.OwningProcess } else { return $null }
}

function Saude($url) {
  try { $r = Invoke-WebRequest -UseBasicParsing -Uri $url -TimeoutSec 8; return $r.StatusCode } catch { return 0 }
}

# ---------------------------------------------------------------- comandos simples
if ($Parar) { PararServidor; exit 0 }

if ($Status) {
  $p = PidDoServidor
  $versao = if (Test-Path (Join-Path $Pasta ".git")) { (& git -C $Pasta log -1 "--format=%h %s" 2>$null) } else { "(pasta do servidor ainda não criada)" }
  if ($p) { Ok "rodando (PID $p) na porta $Porta." } else { Aviso "não está rodando (por este script)." }
  Info "versão: $versao"
  Info "local  http://localhost:$Porta/health -> $(Saude "http://localhost:$Porta/health")"
  Info "público https://api.frixep.com/health -> $(Saude 'https://api.frixep.com/health')"
  exit 0
}

if ($Log) {
  if (-not (Test-Path $LogFile)) { Falha "ainda não há log em $LogFile" }
  if ($Seguir) { Get-Content $LogFile -Tail 40 -Wait } else { Get-Content $LogFile -Tail 60 }
  exit 0
}

# ---------------------------------------------------------------- atualizar e reiniciar
if (-not (Test-Path $EnvFile)) { Falha "não achei o .env em $EnvFile (crie-o ou use -EnvFile). O script não lê o conteúdo dele." }
foreach ($cmd in "git", "node", "npm.cmd") { if (-not (Get-Command $cmd -ErrorAction SilentlyContinue)) { Falha "$cmd não está instalado ou não está no PATH." } }

# 1) pasta do servidor
if (-not (Test-Path (Join-Path $Pasta ".git"))) {
  Info "primeira vez: criando a pasta do servidor em $Pasta (a partir da main)..."
  GitC @("fetch", "origin", "main") $Origem | Out-Null
  GitC @("worktree", "add", "--detach", $Pasta, "origin/main") $Origem | Out-Null
  Ok "pasta criada."
}

# 2) versão mais recente da main
$sujo = GitC @("status", "--porcelain", "--untracked-files=no")
if ($sujo) { Falha "a pasta do servidor tem alterações locais ($Pasta). Ela deve ficar sempre igual à main: descarte-as ou use outra -Pasta." }
Info "baixando a main mais recente..."
GitC @("fetch", "origin", "main") | Out-Null
$antes = (GitC @("rev-parse", "--short", "HEAD")) | Select-Object -First 1
GitC @("checkout", "--detach", "origin/main") | Out-Null
$depois = (GitC @("rev-parse", "--short", "HEAD")) | Select-Object -First 1
$titulo = (GitC @("log", "-1", "--format=%s")) | Select-Object -First 1
if ($antes -eq $depois) { Info "já estava na versão mais recente ($depois)." } else { Ok "atualizado: $antes -> $depois  ($titulo)" }

# 3) dependências (só se o package-lock.json mudou)
$lock = Join-Path $Pasta "package-lock.json"
$hashAtual = (Get-FileHash $lock -Algorithm SHA256).Hash
$hashAntigo = if (Test-Path $HashFile) { (Get-Content $HashFile | Select-Object -First 1) } else { "" }
if ($hashAtual -ne $hashAntigo -or -not (Test-Path (Join-Path $Pasta "node_modules"))) {
  PararServidor   # os arquivos em uso não podem ser trocados com o servidor rodando
  Info "instalando dependências (npm ci)... pode levar alguns minutos."
  Push-Location $Pasta
  try { & npm.cmd ci --include=dev --no-audit --no-fund; if ($LASTEXITCODE -ne 0) { Falha "npm ci falhou." } } finally { Pop-Location }
  Set-Content -Path $HashFile -Value $hashAtual
  Ok "dependências instaladas."
} else { Info "dependências em dia." }

# 4) para a versão anterior
PararServidor
$dono = DonoDaPorta
if ($dono) {
  $nome = (Get-Process -Id $dono -ErrorAction SilentlyContinue).ProcessName
  Falha "a porta $Porta está ocupada pelo processo $dono ($nome), que NÃO foi iniciado por este script. Encerre-o você mesmo (ou feche a janela do servidor antigo) e rode de novo."
}

# 5) sobe em segundo plano, em modo de produção
New-Item -ItemType Directory -Force -Path $LogDir | Out-Null
if ((Test-Path $LogFile) -and (Get-Item $LogFile).Length -gt 5MB) { Move-Item $LogFile "$LogFile.antigo" -Force }
$envFileAbs = (Resolve-Path $EnvFile).Path
$modo = if ($Dev) { "development" } else { "production" }
$comando = "set NODE_ENV=$modo&& set PORT=$Porta&& cd /d `"$Pasta\packages\server`" && npx.cmd tsx --env-file=`"$envFileAbs`" src/index.ts >> `"$LogFile`" 2>&1"
Add-Content -Path $LogFile -Value "`r`n===== $(Get-Date -Format 'yyyy-MM-dd HH:mm:ss') iniciando $depois ($modo, porta $Porta) ====="
$proc = Start-Process -FilePath "cmd.exe" -ArgumentList "/c", $comando -WindowStyle Hidden -PassThru
Set-Content -Path $PidFile -Value $proc.Id
Info "servidor iniciando (PID $($proc.Id), modo $modo). Esperando responder..."

# 6) espera ficar saudável
$ok = $false
for ($i = 0; $i -lt 60; $i++) {
  Start-Sleep -Seconds 1
  if (-not (Get-Process -Id $proc.Id -ErrorAction SilentlyContinue)) { break }
  if ((Saude "http://localhost:$Porta/health") -eq 200) { $ok = $true; break }
}
if (-not $ok) {
  Aviso "o servidor não respondeu a tempo. Últimas linhas do log:"
  if (Test-Path $LogFile) { Get-Content $LogFile -Tail 25 }
  Falha "servidor não subiu. Veja o log: $LogFile"
}
Ok "servidor no ar: http://localhost:$Porta/health -> 200  (versão $depois)"
$pub = Saude "https://api.frixep.com/health"
if ($Porta -ne 2567) { Info "(porta de teste: o endereço público aponta para a 2567, não conferido)" }
elseif ($pub -eq 200) { Ok "público:      https://api.frixep.com/health -> 200 (túnel OK)" }
else { Aviso "público:      https://api.frixep.com/health -> $pub  (confira se o cloudflared está rodando)" }
Info "log: $LogFile   (acompanhar: .\tools\servidor.ps1 -Log -Seguir)"
