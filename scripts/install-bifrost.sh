#!/bin/sh
set -eu

script_dir=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
package_dir=$(dirname "$script_dir")

if ! helm repo list | grep -q "^bifrost[[:space:]]"; then
  helm repo add bifrost https://maximhq.github.io/bifrost/helm-charts
fi
helm repo update bifrost

sh "${script_dir}/upsert-bifrost-secrets.sh" opsiforce

helm upgrade --install --wait --namespace opsiforce --create-namespace \
  opsiforce-bifrost bifrost/bifrost \
  --version 2.0.15 \
  -f "${package_dir}/helm/bifrost/values.local.yaml"

kubectl apply --namespace opsiforce -f "${package_dir}/helm/bifrost/networkpolicy.yaml"
