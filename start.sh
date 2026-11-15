#!/usr/bin/env bash
# Lisio pour macOS / Linux
set -e
cd "$(dirname "$0")"
export WRANGLER_SEND_METRICS=false
command -v node >/dev/null || { echo "Node.js est introuvable : installe-le depuis https://nodejs.org"; exit 1; }
command -v python3 >/dev/null || { echo "Python 3 est introuvable : installe-le depuis https://www.python.org"; exit 1; }

[ -d node_modules/wrangler ] || { echo "Installation du serveur Lisio..."; npm install --no-fund --no-audit; }
if [ ! -x .venv/bin/python ]; then
  echo "Installation de Whisper (quelques minutes, une seule fois)..."
  python3 -m venv .venv
  .venv/bin/python -m pip install --upgrade pip >/dev/null
  .venv/bin/python -m pip install -r whisper/requirements.txt
  command -v nvidia-smi >/dev/null && .venv/bin/python -m pip install -r whisper/requirements-gpu.txt || true
fi

node node_modules/wrangler/bin/wrangler.js d1 execute lisio --local --persist-to data --file schema.sql >/dev/null
.venv/bin/python whisper/server.py &
WHISPER=$!
trap 'kill $WHISPER 2>/dev/null' EXIT
node scripts/urls.mjs 8787
node node_modules/wrangler/bin/wrangler.js dev --ip 0.0.0.0 --port 8787 --persist-to data
