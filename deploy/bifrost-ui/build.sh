#!/usr/bin/env bash
set -euo pipefail
DIR=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)
TAG=${1:?请指定镜像版本}
REGISTRY=${REGISTRY:-sealos.hub:5000/opsiforce}
REV=ae2e1905d6afb1320f7bd74d3557dc31ddd062cc
CACHE="$DIR/../.state/bifrost-ui/$REV"
mkdir -p "$CACHE"
if [[ ! -f "$CACHE/source.tar.gz" ]]; then
  curl -fL --retry 3 "https://codeload.github.com/maximhq/bifrost/tar.gz/$REV" -o "$CACHE/source.tar.gz.tmp"
  mv "$CACHE/source.tar.gz.tmp" "$CACHE/source.tar.gz"
fi
mkdir -p "$CACHE/source"
tar -xzf "$CACHE/source.tar.gz" -C "$CACHE/source" --strip-components=1
python3 "$DIR/apply.py" "$CACHE/source"
cp "$DIR/nginx.conf" "$CACHE/source/opsiforce-nginx.conf"
docker build -f "$DIR/Dockerfile" -t "$REGISTRY/bifrost-console:$TAG" "$CACHE/source"
docker push "$REGISTRY/bifrost-console:$TAG"
