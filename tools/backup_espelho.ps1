<#
.SYNOPSIS
  Cria ou atualiza um espelho completo do repositório FrixeP (todas as branches, tags e histórico).

.DESCRIPTION
  Na primeira vez faz `git clone --mirror` do repositório (origin) para a pasta de destino.
  Nas vezes seguintes faz `git remote update --prune`, que só busca o que mudou.
  Um espelho guarda todo o histórico: se o GitHub sumir ou a pasta de trabalho for perdida,
  o repositório pode ser restaurado a partir dele (veja docs/BACKUP_RESTAURACAO.md).

  O script não lê, não imprime e não grava nenhum arquivo .env nem senha.

.PARAMETER Destino  Pasta onde o espelho fica (ex.: D:\Backup\FrixeP). Será criada se não existir.
.PARAMETER Repo     Pasta do repositório de origem. Padrão: a pasta principal deste projeto (pai de tools).

.EXAMPLE
  powershell -ExecutionPolicy Bypass -File tools\backup_espelho.ps1 -Destino D:\Backup\FrixeP
#>
param(
  [Parameter(Mandatory = $true)]
  [string]$Destino,

  [string]$Repo
)

$ErrorActionPreference = 'Stop'

if ([string]::IsNullOrWhiteSpace($Repo)) {
  $pasta = Split-Path -Parent $MyInvocation.MyCommand.Path
  $Repo = Split-Path -Parent $pasta
}

function Sair-Erro([string]$msg) {
  Write-Host ''
  Write-Host "ERRO: $msg" -ForegroundColor Red
  exit 1
}

# 1. Verificações iniciais
$git = Get-Command git -ErrorAction SilentlyContinue
if (-not $git) { Sair-Erro 'git não encontrado no PATH. Instale o Git for Windows e tente de novo.' }

if (-not (Test-Path -LiteralPath $Repo)) { Sair-Erro "pasta do repositório não existe: $Repo" }

$url = (& git -C $Repo remote get-url origin 2>$null)
if ($LASTEXITCODE -ne 0 -or [string]::IsNullOrWhiteSpace($url)) {
  Sair-Erro "a pasta $Repo não é um repositório git com 'origin' configurado."
}

# 2. Pasta de destino
if (-not (Test-Path -LiteralPath $Destino)) {
  New-Item -ItemType Directory -Path $Destino -Force | Out-Null
  Write-Host "Pasta de destino criada: $Destino"
}
$espelho = Join-Path $Destino 'FrixeP.git'

# 3. Criar ou atualizar o espelho
if (Test-Path -LiteralPath (Join-Path $espelho 'HEAD')) {
  Write-Host "Atualizando espelho existente em: $espelho"
  & git -C $espelho remote update --prune
  if ($LASTEXITCODE -ne 0) { Sair-Erro 'falha ao atualizar o espelho (git remote update --prune). Veja a mensagem acima.' }
} else {
  if (Test-Path -LiteralPath $espelho) {
    Sair-Erro "a pasta $espelho existe mas não é um espelho git. Escolha outro -Destino ou mova essa pasta."
  }
  Write-Host "Criando espelho pela primeira vez em: $espelho"
  & git clone --mirror $url $espelho
  if ($LASTEXITCODE -ne 0) { Sair-Erro 'falha ao criar o espelho (git clone --mirror). Veja a mensagem acima.' }
}

# 4. Conferência final
$branches = (& git -C $espelho for-each-ref refs/heads --format='%(refname:short)' | Measure-Object).Count
$tags = (& git -C $espelho for-each-ref refs/tags --format='%(refname:short)' | Measure-Object).Count
$ultimo = (& git -C $espelho log -1 --format='%h %ad %s' --date=short)

Write-Host ''
Write-Host 'SUCESSO: espelho do FrixeP pronto.' -ForegroundColor Green
Write-Host "  Pasta:          $espelho"
Write-Host "  Branches:       $branches"
Write-Host "  Tags:           $tags"
Write-Host "  Último commit:  $ultimo"
exit 0
