#!/bin/bash
# Guard script: runs a command, restarts it if it crashes
# Usage: guard <name> <command...>

NAME="$1"
shift

while true; do
  echo "[guard:$NAME] Starting: $*"
  "$@"
  EXIT_CODE=$?
  if [ $EXIT_CODE -eq 0 ]; then
    echo "[guard:$NAME] Exited cleanly"
    break
  fi
  echo "[guard:$NAME] Crashed with exit code $EXIT_CODE, restarting in 2s..."
  sleep 2
done
