#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/backend"
command -v python3 >/dev/null || { echo 'Python 3 is required' >&2; exit 1; }
if [ ! -x .venv/bin/python ]; then python3 -m venv .venv; fi
fingerprint="$(sha256sum requirements.lock | cut -d ' ' -f1):$(.venv/bin/python --version)"
if [ ! -f .venv/.requirements ] || [ "$(cat .venv/.requirements)" != "$fingerprint" ]; then
  wheelhouse=/opt/opsiforce-runtime/python-wheels
  if [ -f "$wheelhouse/fingerprint" ] && [ "$(cat "$wheelhouse/fingerprint")" = "$fingerprint" ]; then
    .venv/bin/python -m pip install --disable-pip-version-check --no-index --find-links "$wheelhouse" -r requirements.lock
  else
    .venv/bin/python -m pip install --disable-pip-version-check --timeout 30 --retries 2 -r requirements.lock
  fi
  .venv/bin/python -m pip check
  printf '%s\n' "$fingerprint" > .venv/.requirements
fi
# No reload watcher in either mode. Platform restart re-enters this script.
# Keep a shell parent: Uvicorn exits 0 on TERM, but guard must revive the app.
.venv/bin/python -m uvicorn main:app --host 0.0.0.0 --port "${APP_PORT:-3000}" &
child=$!
trap 'kill -TERM "$child" 2>/dev/null || true; wait "$child" || true; exit 143' TERM
trap 'kill -INT "$child" 2>/dev/null || true; wait "$child" || true; exit 130' INT
wait "$child"
exit 1
