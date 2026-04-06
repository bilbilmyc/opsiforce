#!/bin/bash
set -e
cd "$(dirname "$0")"

while [ ! -d "node_modules" ]; do
  sleep 2
done

bun run dev
