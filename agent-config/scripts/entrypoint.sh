#!/bin/bash
set -e

export OPENAI_API_KEY="${OPENAI_API_KEY:-}"
export APP_PORT="${APP_PORT:-3000}"
export VSCODE_PORT="${VSCODE_PORT:-8080}"
export DB_VIEWER_PORT="${DB_VIEWER_PORT:-8081}"
export DB_VIEWER_SQL_TIME_LIMIT_MS="${DB_VIEWER_SQL_TIME_LIMIT_MS:-5000}"

mkdir -p /workspace/app/data /workspace/data

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

guard dbviewer datasette serve \
  /workspace/app/data/app.db \
  /workspace/data/database.db \
  --host 0.0.0.0 --port "${DB_VIEWER_PORT}" \
  --cors --create \
  --setting sql_time_limit_ms "${DB_VIEWER_SQL_TIME_LIMIT_MS}" \
  --metadata /opt/opencode/datasette-metadata.yml &

guard control agent-control &

wait -n
