#!/usr/bin/env bash
set -euo pipefail
# Preserve restart semantics even when the framework exits cleanly on SIGTERM.
trap 'kill -TERM "$child" 2>/dev/null || true; wait "$child" || true; exit 143' TERM INT
bash ./run-app.sh &
child=$!
wait "$child"
