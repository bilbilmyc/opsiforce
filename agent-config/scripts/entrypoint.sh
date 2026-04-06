#!/bin/bash
set -e

export OPENAI_API_KEY="${OPENAI_API_KEY:-}"
export BACKEND_PORT="${BACKEND_PORT:-3100}"
export FRONTEND_PORT="${FRONTEND_PORT:-3101}"
export VSCODE_PORT="${VSCODE_PORT:-8080}"

guard webapp sh -c "cd /workspace/app && bun run dev" &

guard opencode opencode serve --port "${OPENCODE_PORT:-4096}" --hostname 0.0.0.0 &

guard vscode code-server \
  --host 0.0.0.0 --port "${VSCODE_PORT}" \
  --auth none \
  --user-data-dir /workspace/.xdg/code-server/user-data \
  --extensions-dir /workspace/.xdg/code-server/extensions \
  --disable-telemetry \
  /workspace &

wait -n
