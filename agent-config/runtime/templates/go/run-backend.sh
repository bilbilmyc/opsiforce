#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/backend"
command -v go >/dev/null || { echo 'Go toolchain is required; use an Agent image with Go installed' >&2; exit 1; }
export GOTOOLCHAIN=local
export GOCACHE="${GOCACHE:-$PWD/.cache/build}"
export GOMODCACHE="${GOMODCACHE:-$PWD/.cache/modules}"
mkdir -p .bin
# Readonly modules never rewrite the committed dependency contract at boot.
CGO_ENABLED=0 go build -mod=readonly -trimpath -o .bin/server.new .
mv .bin/server.new .bin/server
.bin/server &
child=$!
trap 'kill -TERM "$child" 2>/dev/null || true; wait "$child" || true; exit 143' TERM
trap 'kill -INT "$child" 2>/dev/null || true; wait "$child" || true; exit 130' INT
wait "$child"
exit 1
