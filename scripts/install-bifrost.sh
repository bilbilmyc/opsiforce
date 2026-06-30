#!/bin/sh
set -eu

script_dir=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
package_dir=$(dirname "$script_dir")

if ! helm repo list | grep -q "^bifrost[[:space:]]"; then
  helm repo add bifrost https://maximhq.github.io/bifrost/helm-charts
fi
helm repo update bifrost

sh "${script_dir}/upsert-bifrost-secrets.sh" local

set -- -f "${package_dir}/helm/bifrost/values.local.yaml"
private_overlay="${script_dir}/private/bifrost.values.local.yaml"
if [ -f "${private_overlay}" ]; then
  set -- "$@" -f "${private_overlay}"
fi

helm upgrade --install --wait --namespace local --create-namespace \
  opsiforce-bifrost bifrost/bifrost \
  --version 2.0.15 \
  "$@"

kubectl apply --namespace local -f "${package_dir}/helm/bifrost/networkpolicy.yaml"
