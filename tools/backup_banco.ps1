<#
.SYNOPSIS
  Faz backup (pg_dump) do banco PostgreSQL do FrixeP e mantém só os backups mais recentes.

.DESCRIPTION
  Usa a variável de ambiente DATABASE_URL que já está definida na sessão/usuário.
  O script NUNCA lê o arquivo .env, e NUNCA imprime, grava ou registra a URL.
  Só confere se a variável existe (e avisa se não existir).

  Gera um arquivo no formato custom do pg_dump, com data no nome:
      banco_AAAAMMDD_HHMMSS.dump
  e apaga os mais antigos, mantendo só os últimos -Manter arquivos desse padrão.

  Requer o programa pg_dump (cliente PostgreSQL) no PATH.
  Para restaurar, veja docs/BACKUP_RESTAURACAO.md.

.PARAMETER Destino  Pasta onde os backups são gravados (ex.: D:\Backup\FrixeP-banco). Será criada se não existir.
.PARAMETER Manter   Quantos backups manter. Padrão: 14.

.EXAMPLE
  powershell -ExecutionPolicy Bypass -File tools\backup_banco.ps1 -Destino D:\Backup\FrixeP-banco -Manter 14
#>
param(
  [Parameter(Mandatory = $true)]
  [string]$Destino,

  [ValidateRange(1, 3650)]
  [int]$Manter = 14
)

$ErrorActionPreference = 'Stop'

function Sair-Erro([string]$msg) {
  Write-Host ''
  Write-Host "ERRO: $msg" -ForegroundColor Red
  exit 1
}

# 1. Conferir a variável (sem mostrar o valor)
if ([string]::IsNullOrWhiteSpace($env:DATABASE_URL)) {
  Sair-Erro ('a variável DATABASE_URL não está definida nesta sessão. ' +
    'Defina-a no ambiente do usuário (ou abra um novo terminal depois de definir) e tente de novo. ' +
    'Sem ela o servidor usa o banco embutido (pasta .data/), que este script não copia.')
}

# 2. Conferir o pg_dump
$pgDump = Get-Command pg_dump -ErrorAction SilentlyContinue
if (-not $pgDump) {
  Sair-Erro ('pg_dump não encontrado no PATH. Instale o cliente PostgreSQL (versão igual ou maior que a do servidor) ' +
    'e tente de novo. Alternativa: baixe um backup pelo painel do Supabase.')
}

# 3. Pasta de destino e nome do arquivo
if (-not (Test-Path -LiteralPath $Destino)) {
  New-Item -ItemType Directory -Path $Destino -Force | Out-Null
  Write-Host "Pasta de destino criada: $Destino"
}
$carimbo = Get-Date -Format 'yyyyMMdd_HHmmss'
$arquivo = Join-Path $Destino "banco_$carimbo.dump"

# 4. Executar o pg_dump (a URL vai só como argumento; não é impressa)
Write-Host 'Fazendo backup do banco...'
& pg_dump --format=custom --no-owner --no-acl --file="$arquivo" "$env:DATABASE_URL"
if ($LASTEXITCODE -ne 0) {
  if (Test-Path -LiteralPath $arquivo) { Remove-Item -LiteralPath $arquivo -Force }
  Sair-Erro 'o pg_dump falhou (veja a mensagem acima). Nenhum backup novo foi gravado.'
}

$tamanho = (Get-Item -LiteralPath $arquivo).Length
if ($tamanho -le 0) {
  Remove-Item -LiteralPath $arquivo -Force
  Sair-Erro 'o arquivo de backup ficou vazio e foi apagado.'
}

# 5. Rotação: manter só os N mais recentes
$antigos = Get-ChildItem -LiteralPath $Destino -Filter 'banco_*.dump' -File |
  Sort-Object LastWriteTime -Descending |
  Select-Object -Skip $Manter
foreach ($a in $antigos) {
  Remove-Item -LiteralPath $a.FullName -Force
  Write-Host "Backup antigo removido: $($a.Name)"
}

$mb = [math]::Round($tamanho / 1MB, 2)
Write-Host ''
Write-Host 'SUCESSO: backup do banco gravado.' -ForegroundColor Green
Write-Host "  Arquivo:  $arquivo"
Write-Host "  Tamanho:  $mb MB"
Write-Host "  Mantidos: até $Manter backups nesta pasta"
exit 0
