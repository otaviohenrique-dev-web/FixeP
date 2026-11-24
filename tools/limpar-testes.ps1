<#
.SYNOPSIS
  Lista (ou encerra) processos node/tsx/vite de TESTE esquecidos por sessões do Claude, para não acabar com a memória.
.DESCRIPTION
  Nunca mexe no servidor de produção (pasta FrixeP-servidor) nem em processos recentes (padrão: menos de 20 min).
  Sem -Matar só LISTA (modo seguro). Uso:
    powershell -ExecutionPolicy Bypass -File tools\limpar-testes.ps1              # só mostra
    powershell -ExecutionPolicy Bypass -File tools\limpar-testes.ps1 -Matar       # encerra os esquecidos
    powershell -ExecutionPolicy Bypass -File tools\limpar-testes.ps1 -Matar -MinMinutos 5
#>
param([switch]$Matar, [int]$MinMinutos = 20)

$limite = (Get-Date).AddMinutes(-$MinMinutos)
$alvos = Get-CimInstance Win32_Process -Filter "Name='node.exe'" | Where-Object {
  $c = $_.CommandLine
  $c -and $c -notmatch 'FrixeP-servidor' -and $c -match 'tsx|vite|packages[\/]server[\/](test|src)|pglite' -and
  $_.CreationDate -lt $limite
}
$mb = [math]::Round((($alvos | Measure-Object WorkingSetSize -Sum).Sum) / 1MB)
Write-Host ("Processos de teste esquecidos (>{0} min): {1}  (~{2} MB)" -f $MinMinutos, @($alvos).Count, $mb)
foreach ($p in $alvos) {
  Write-Host ("  PID {0}  {1:N0} MB  {2}" -f $p.ProcessId, ($p.WorkingSetSize/1MB), ($p.CommandLine.Substring(0, [math]::Min(110, $p.CommandLine.Length))))
  if ($Matar) { Stop-Process -Id $p.ProcessId -Force -ErrorAction SilentlyContinue }
}
if ($Matar) { Write-Host "Encerrados." } elseif (@($alvos).Count) { Write-Host "Rode com -Matar para encerrar." }
$os = Get-CimInstance Win32_OperatingSystem
Write-Host ("RAM livre: {0:N1} GB de {1:N1} GB" -f ($os.FreePhysicalMemory/1MB), ($os.TotalVisibleMemorySize/1MB))
