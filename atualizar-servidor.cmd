@echo off
rem Atualiza e reinicia o servidor do FrixeP (versao da main do GitHub). Duplo clique ou: atualizar-servidor.cmd [-Status | -Parar | -Log -Seguir]
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0tools\servidor.ps1" %*
echo.
pause
