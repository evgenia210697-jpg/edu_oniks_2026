@echo off
chcp 65001 >nul
cd /d "%~dp0"
if not exist node_modules (
  echo Устанавливаю зависимости...
  call npm ci --omit=dev
)
if not exist .env copy .env.example .env >nul
echo Запускаю платформу обучения...
node server\index.js
pause
