@echo off
setlocal
title IGS Imob PRO
cd /d "%~dp0"

echo.
echo ==========================================
echo        IGS Imob PRO - Inicializador
echo ==========================================
echo.

where node >nul 2>nul
if errorlevel 1 (
  echo Node.js nao encontrado.
  echo Instale o Node.js e tente novamente.
  echo.
  pause
  exit /b 1
)

where npm >nul 2>nul
if errorlevel 1 (
  echo NPM nao encontrado.
  echo Reinstale o Node.js marcando a opcao NPM.
  echo.
  pause
  exit /b 1
)

powershell -NoProfile -Command "if (Get-NetTCPConnection -LocalPort 3000 -State Listen -ErrorAction SilentlyContinue) { exit 1 } else { exit 0 }" >nul 2>nul
if errorlevel 1 (
  echo O sistema ja parece estar rodando na porta 3000.
  echo Abrindo no navegador...
  start "" "http://localhost:3000"
  echo.
  pause
  exit /b 0
)

if not exist "node_modules" (
  echo Instalando dependencias...
  call npm install
  if errorlevel 1 (
    echo.
    echo Falha ao instalar dependencias.
    pause
    exit /b 1
  )
)

echo Verifique se o PostgreSQL esta aberto/rodando.
echo Banco esperado: igs_imob_pro
echo Usuario: postgres
echo Senha: 123
echo.
echo Abrindo o navegador em alguns segundos...
start "" powershell -WindowStyle Hidden -NoProfile -Command "Start-Sleep -Seconds 3; Start-Process 'http://localhost:3000'"

echo Iniciando servidor...
echo Para parar o sistema, feche esta janela ou pressione Ctrl+C.
echo.
call npm start

echo.
echo Servidor encerrado.
pause
