@echo off
chcp 65001 >nul
title Lisio
cd /d "%~dp0"
set WRANGLER_SEND_METRICS=false

where node >nul 2>&1 || (echo Node.js est introuvable. Installe-le depuis https://nodejs.org puis relance start.bat. & pause & exit /b 1)
set PY=
where py >nul 2>&1 && set PY=py -3
if not defined PY where python >nul 2>&1 && set PY=python
if not defined PY (echo Python 3 est introuvable. Installe-le depuis https://www.python.org ^(coche "Add to PATH"^) puis relance start.bat. & pause & exit /b 1)

if not exist node_modules\wrangler (
  echo Installation du serveur Lisio...
  call npm install --no-fund --no-audit || (pause & exit /b 1)
)
if not exist .venv\Scripts\python.exe (
  echo Installation de Whisper ^(quelques minutes, une seule fois^)...
  %PY% -m venv .venv || (pause & exit /b 1)
  .venv\Scripts\python -m pip install --upgrade pip >nul
  .venv\Scripts\python -m pip install -r whisper\requirements.txt || (pause & exit /b 1)
  where nvidia-smi >nul 2>&1 && .venv\Scripts\python -m pip install -r whisper\requirements-gpu.txt
)

node node_modules\wrangler\bin\wrangler.js d1 execute lisio --local --persist-to data --file schema.sql >nul || (echo Impossible de préparer la base de données. & pause & exit /b 1)

node scripts\queue.mjs init
start "Lisio - Whisper" /min .venv\Scripts\python whisper\server.py
start "Lisio - File d'attente" /min node scripts\queue.mjs
start "Lisio - Tunnel" /min node scripts\tunnel.mjs
node scripts\urls.mjs 8787
node node_modules\wrangler\bin\wrangler.js dev --ip 0.0.0.0 --port 8787 --persist-to data
pause
