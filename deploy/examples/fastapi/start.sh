#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")"
export APP_DATA_DIR="${APP_DATA_DIR:-/workspace/app/data}"
export APP_META_PATH="${APP_META_PATH:-/workspace/app/app.meta.json}"
mkdir -p "$APP_DATA_DIR"
if [ ! -x .venv/bin/python ]; then
  python3 -m venv .venv
fi
lock_hash="$(sha256sum requirements.lock | cut -d ' ' -f 1)"
if [ ! -f .venv/requirements.sha256 ] || [ "$(cat .venv/requirements.sha256)" != "$lock_hash" ]; then
  .venv/bin/python -m pip install --disable-pip-version-check --timeout 30 --retries 2 -r requirements.lock
  printf '%s\n' "$lock_hash" > .venv/requirements.sha256
fi
exec .venv/bin/python -m uvicorn main:app --host 0.0.0.0 --port "${APP_PORT:-3000}"
