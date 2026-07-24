@echo off
chcp 65001 >nul
setlocal EnableExtensions
cd /d "%~dp0"

echo.
echo =====================================================
echo   APEX OS 7.0 - AUTONOMOUS COGNITIVE RUNTIME
echo   PAPER ONLY - EXTERNAL ACCOUNTS LOCKED
 echo =====================================================
echo.

where node >nul 2>nul
if errorlevel 1 (
  echo ERROR: Node.js no está instalado o no está en PATH.
  echo Instalá Node.js 18 o superior y volvé a ejecutar este archivo.
  pause
  exit /b 1
)
for /f %%V in ('node -p "Number(process.versions.node.split('.')[0])"') do set NODE_MAJOR=%%V
if %NODE_MAJOR% LSS 18 (
  echo ERROR: se requiere Node.js 18 o superior. Detectado:
  node -v
  pause
  exit /b 1
)

if not exist .env (
  copy /Y .env.example .env >nul
  echo Se creó .env.
  echo Podés pegar OPENAI_API_KEY ahora. Si lo dejás vacío, APEX abrirá en modo local sin IA online.
  start /wait notepad .env
)

for /f "tokens=5" %%P in ('netstat -ano ^| findstr /R /C:":5500 .*LISTENING"') do (
  echo ERROR: el puerto 5500 está ocupado por el proceso %%P.
  echo Cerrá Live Server u otra instancia de APEX y volvé a intentar.
  pause
  exit /b 1
)

node tools\doctor.js
if errorlevel 1 (
  echo Corregí los errores del diagnóstico antes de iniciar.
  pause
  exit /b 1
)

start "APEX OS 7.0 Server" /D "%~dp0" cmd /k "title APEX OS 7.0 Server && node server.js"
timeout /t 2 /nobreak >nul
start "" http://127.0.0.1:5500
exit /b 0
