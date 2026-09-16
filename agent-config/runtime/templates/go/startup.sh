#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")"
export APP_DATA_DIR="${APP_DATA_DIR:-$PWD/data}"
export APP_META_PATH="${APP_META_PATH:-$PWD/app.meta.json}"
export APP_CONFIG_PATH="${APP_CONFIG_PATH:-$PWD/opsiforce.env.json}"
mkdir -p "$APP_DATA_DIR"
exec guard app-backend ./run-backend.sh
