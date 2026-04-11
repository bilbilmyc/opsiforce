#!/bin/bash
# Guard script: runs a command, restarts on crash with exponential backoff
# Usage: guard <name> <command...>

NAME="$1"
shift

LOG_WRITER="/usr/local/bin/log-writer"
MAX_RESTARTS=50
INITIAL_DELAY=2
MAX_DELAY=60
STABLE_THRESHOLD=30

USE_LOG_WRITER=false
if [ -x "$LOG_WRITER" ] && command -v bun >/dev/null 2>&1; then
  USE_LOG_WRITER=true
fi

guard_log() {
  echo "$1"
  if $USE_LOG_WRITER; then
    "$LOG_WRITER" --name "$NAME" --line "$1" 2>/dev/null || true
  fi
}

guard_event() {
  if $USE_LOG_WRITER; then
    "$LOG_WRITER" --name "$NAME" --event "$1" \
      ${2:+--exit-code "$2"} \
      ${3:+--uptime "$3"} \
      ${4:+--restart "$4"} 2>/dev/null || true
  fi
}

SHOULD_EXIT=false
trap 'SHOULD_EXIT=true' TERM INT

restart_count=0
delay=$INITIAL_DELAY

while true; do
  guard_log "[guard:$NAME] Starting: $* (restart #$restart_count)"
  guard_event "started" "" "" "$restart_count"
  start_time=$SECONDS

  if $USE_LOG_WRITER; then
    "$@" 2>&1 | "$LOG_WRITER" --name "$NAME"
    EXIT_CODE=${PIPESTATUS[0]}
  else
    "$@"
    EXIT_CODE=$?
  fi

  elapsed=$(( SECONDS - start_time ))

  if $SHOULD_EXIT; then
    guard_log "[guard:$NAME] Received signal, stopping after ${elapsed}s"
    guard_event "signal" "" "$elapsed" "$restart_count"
    break
  fi

  if [ $EXIT_CODE -eq 0 ]; then
    guard_log "[guard:$NAME] Exited cleanly after ${elapsed}s"
    guard_event "stopped" "0" "$elapsed" "$restart_count"
    break
  fi

  restart_count=$((restart_count + 1))

  if [ $restart_count -ge $MAX_RESTARTS ]; then
    guard_log "[guard:$NAME] Crashed with exit code $EXIT_CODE after ${elapsed}s. Giving up after $MAX_RESTARTS restarts."
    guard_event "crashed" "$EXIT_CODE" "$elapsed" "$restart_count"
    guard_event "gave_up" "$EXIT_CODE" "$elapsed" "$restart_count"
    break
  fi

  if [ $elapsed -ge $STABLE_THRESHOLD ]; then
    delay=$INITIAL_DELAY
  fi

  guard_log "[guard:$NAME] Crashed with exit code $EXIT_CODE after ${elapsed}s, restarting in ${delay}s... ($restart_count/$MAX_RESTARTS)"
  guard_event "crashed" "$EXIT_CODE" "$elapsed" "$restart_count"
  sleep $delay

  if [ $delay -lt $MAX_DELAY ]; then
    delay=$((delay * 2))
    if [ $delay -gt $MAX_DELAY ]; then
      delay=$MAX_DELAY
    fi
  fi
done
