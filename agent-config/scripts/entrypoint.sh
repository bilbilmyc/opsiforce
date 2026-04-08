#!/bin/bash
set -e

export OPENAI_API_KEY="${OPENAI_API_KEY:-}"
export APP_PORT="${APP_PORT:-3000}"
export VSCODE_PORT="${VSCODE_PORT:-8080}"

guard webapp /workspace/app/startup.sh &

guard opencode opencode serve --port "${OPENCODE_PORT:-4096}" --hostname 0.0.0.0 &

guard vscode code-server \
  --host 0.0.0.0 --port "${VSCODE_PORT}" \
  --auth none \
  --user-data-dir /workspace/.xdg/code-server/user-data \
  --extensions-dir /workspace/.xdg/code-server/extensions \
  --disable-telemetry \
  --disable-workspace-trust \
  /workspace &

wait -n
