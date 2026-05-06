#!/bin/bash
set -e
cd "$(dirname "$0")"

while [ ! -f ".pnp.cjs" ]; do
  sleep 2
done

guard app-backend yarn dev:backend &
guard app-frontend yarn dev:frontend &
wait -n
