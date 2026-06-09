#!/bin/bash
set -e
cd "$(dirname "$0")"

if [ "$OPSIFORCE_ENV" = "production" ]; then
  yarn install --immutable || yarn install
  yarn build
  guard app-backend yarn start:backend &
  guard app-frontend yarn start:frontend &
  wait -n
else
  while [ ! -f ".pnp.cjs" ]; do
    sleep 2
  done

  guard app-backend yarn dev:backend &
  guard app-frontend yarn dev:frontend &
  wait -n
fi
