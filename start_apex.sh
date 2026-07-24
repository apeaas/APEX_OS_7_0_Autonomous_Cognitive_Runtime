#!/usr/bin/env sh
set -eu
cd "$(dirname "$0")"
printf '\nAPEX 7.1 · CONSTITUTIONAL COGNITIVE VOICE RUNTIME\nPAPER ONLY · EXTERNAL ACCOUNTS LOCKED\n\n'
if ! command -v node >/dev/null 2>&1; then echo "ERROR: necesitás Node.js 18 o superior."; exit 1; fi
major=$(node -p "Number(process.versions.node.split('.')[0])")
if [ "$major" -lt 18 ]; then echo "ERROR: se requiere Node.js 18+. Detectado $(node -v)."; exit 1; fi
if [ ! -f .env ]; then
  cp .env.example .env
  echo "Se creó .env. Podés agregar OPENAI_API_KEY; sin ella APEX arranca en modo local."
  if [ -n "${EDITOR:-}" ]; then "$EDITOR" .env || true; fi
fi
node tools/doctor.js
printf '%s\n' "APEX 7.1 → http://127.0.0.1:5500"
node server.js &
pid=$!
trap 'kill "$pid" 2>/dev/null || true' INT TERM EXIT
sleep 2
if command -v open >/dev/null 2>&1; then open http://127.0.0.1:5500
elif command -v xdg-open >/dev/null 2>&1; then xdg-open http://127.0.0.1:5500 >/dev/null 2>&1 || true
fi
wait "$pid"
