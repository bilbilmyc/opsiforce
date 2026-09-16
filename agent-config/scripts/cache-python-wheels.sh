#!/usr/bin/env bash
set -euo pipefail
runtime=${1:-/opt/opsiforce-runtime}
lock="$runtime/templates/fastapi/backend/requirements.lock"
cache="$runtime/python-wheels"
mkdir -p "$cache"
python3 -m pip download --disable-pip-version-check --timeout 30 --retries 2 --only-binary=:all: --dest "$cache" -r "$lock"
printf '%s:%s\n' "$(sha256sum "$lock" | cut -d ' ' -f1)" "$(python3 --version)" > "$cache/fingerprint"
