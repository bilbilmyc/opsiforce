#!/bin/bash
set -e
cd "$(dirname "$0")"

while [ ! -f "bun.lock" ]; do
  sleep 2
done

guard app-backend bun run dev:backend &
guard app-frontend bun run dev:frontend &
wait -n
