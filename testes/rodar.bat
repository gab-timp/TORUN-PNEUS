@echo off
rem Roda os testes automaticos das contas do sistema (Varejo e CRM). Node nao fica no PATH desta maquina.
set "NODE=C:\Program Files\nodejs\node.exe"
"%NODE%" "%~dp0rodar.js"
echo.
pause
