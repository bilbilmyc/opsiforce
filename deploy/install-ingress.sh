#!/usr/bin/env bash
set -euo pipefail

DIR=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)
STATE="$DIR/.state/local/traefik"
CHART_VERSION=41.5.0
mkdir -p "$STATE"
helm repo add traefik https://traefik.github.io/charts --force-update
helm repo update traefik
helm pull traefik/traefik --version "$CHART_VERSION" --destination "$STATE"
tar -xzf "$STATE/traefik-$CHART_VERSION.tgz" -C "$STATE"

# Existing CRDs are not Helm-owned. Update only Traefik Proxy's definitions,
# then skip Helm's CRD installation; leave unrelated Hub/Gateway CRDs alone.
for crd in "$STATE"/traefik/crds/traefik.io_*.yaml; do
  kubectl apply --server-side --field-manager=opsiforce-ingress -f "$crd"
done
helm upgrade --install traefik "$STATE/traefik-$CHART_VERSION.tgz" \
  --namespace traefik --create-namespace --skip-crds \
  --values "$DIR/traefik/values.yaml" --wait --timeout 5m
kubectl apply -f "$DIR/traefik/opsiforce-http.yaml"
kubectl -n traefik rollout status daemonset/traefik --timeout=180s
echo 'Traefik 已就绪：HTTP 80，HTTPS 443；目前仅启用无域名的 HTTP 站点路由。'
echo '原有平台和 Bifrost NodePort 保持不变。'
