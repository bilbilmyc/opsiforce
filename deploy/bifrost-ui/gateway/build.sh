#!/usr/bin/env bash
set -euo pipefail
DIR=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)
TAG=${1:?请指定镜像版本}
REGISTRY=${REGISTRY:-sealos.hub:5000/opsiforce}
# transports/v2.0.0 release; its module versions match the original running image.
REV=e4a30d6041c0446603aea615bc5da340dac001b1
CACHE="$DIR/../../.state/bifrost-gateway/$REV"
mkdir -p "$CACHE/source"
if [[ ! -f "$CACHE/source.tar.gz" ]]; then
 curl -fL --retry 3 "https://codeload.github.com/maximhq/bifrost/tar.gz/$REV" -o "$CACHE/source.tar.gz.tmp"
 mv "$CACHE/source.tar.gz.tmp" "$CACHE/source.tar.gz"
fi
tar -xzf "$CACHE/source.tar.gz" -C "$CACHE/source" --strip-components=1 --wildcards '*/transports/*'
python3 "$DIR/apply.py" "$CACHE/source"
docker build -f "$DIR/Dockerfile" -t "$REGISTRY/bifrost:$TAG" "$CACHE/source"
docker push "$REGISTRY/bifrost:$TAG"
