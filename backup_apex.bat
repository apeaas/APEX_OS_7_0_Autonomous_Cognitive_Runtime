@echo off
chcp 65001 >nul
cd /d "%~dp0"
echo Creando respaldo de configuración, memoria backend y .env...
node tools\backup.js
pause
