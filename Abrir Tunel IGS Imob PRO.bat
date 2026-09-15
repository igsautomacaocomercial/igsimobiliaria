@echo off
setlocal
title IGS Imob PRO - Tunel externo
cd /d "%~dp0"

set "PORTA=3000"
set "APP_URL=http://localhost:%PORTA%"
set "TOOLS_DIR=%~dp0tools"
set "CLOUDFLARED=%TOOLS_DIR%\cloudflared.exe"

echo.
echo ==========================================
echo      IGS Imob PRO - Acesso Externo
echo ==========================================
echo.

where node >nul 2>nul
if errorlevel 1 (
  echo Node.js nao encontrado.
  echo Instale o Node.js antes de iniciar o sistema.
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

if not exist "node_modules" (
  echo Instalando dependencias do sistema...
  call npm install
  if errorlevel 1 (
    echo.
    echo Falha ao instalar dependencias.
    pause
    exit /b 1
  )
)

powershell -NoProfile -Command "if (Get-NetTCPConnection -LocalPort %PORTA% -State Listen -ErrorAction SilentlyContinue) { exit 1 } else { exit 0 }" >nul 2>nul
if errorlevel 1 (
  echo Sistema ja esta rodando em %APP_URL%.
) else (
  echo Iniciando servidor IGS Imob PRO...
  start "IGS Imob PRO - Servidor" /min cmd /k "cd /d ""%~dp0"" && npm start"
  echo Aguardando o servidor iniciar...
  timeout /t 6 /nobreak >nul
)

if not exist "%TOOLS_DIR%" mkdir "%TOOLS_DIR%"

if not exist "%CLOUDFLARED%" (
  echo.
  echo Baixando Cloudflare Tunnel na primeira execucao...
  powershell -NoProfile -ExecutionPolicy Bypass -Command "Invoke-WebRequest -Uri 'https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-windows-amd64.exe' -OutFile '%CLOUDFLARED%'"
  if errorlevel 1 (
    echo.
    echo Nao foi possivel baixar o Cloudflare Tunnel.
    echo Verifique a internet e tente novamente.
    pause
    exit /b 1
  )
)

echo.
echo Abrindo navegador local...
start "" "%APP_URL%"

echo.
echo ==========================================
echo  LINK EXTERNO
echo ==========================================
echo.
echo Aguarde aparecer uma URL parecida com:
echo https://alguma-coisa.trycloudflare.com
echo.
echo Esse sera o link para acessar de fora.
echo Deixe esta janela aberta enquanto estiver usando o tunel.
echo Para encerrar, pressione CTRL+C e depois feche a janela.
echo.

"%CLOUDFLARED%" tunnel --url "%APP_URL%"

echo.
echo Tunel encerrado.
pause
