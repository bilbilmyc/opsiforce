#!/usr/bin/env bash
set -euo pipefail

# Edit these defaults or override them with environment variables.
REGISTRY=${REGISTRY:-sealos.hub:5000/opsiforce}
SOURCE_REGISTRY=${SOURCE_REGISTRY:-registry.cn-beijing.aliyuncs.com/mayc}
PLATFORM=${PLATFORM:-linux/amd64}
NODE_IP=${NODE_IP:-127.0.0.1}              # Reachable test-cluster node IP.
KUBE_CONTEXT=${KUBE_CONTEXT:-}             # Empty: use the current kubectl context.
IMAGE_PULL_SECRET=${IMAGE_PULL_SECRET:-}   # An existing Secret in namespace opsiforce.
OPENAI_API_KEY=${OPENAI_API_KEY:-}
ANTHROPIC_API_KEY=${ANTHROPIC_API_KEY:-}

DIR=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)
ROOT=$(dirname "$DIR")
ACTION=${1:-help}
[[ $# -eq 0 ]] || shift
PROFILE=local
COMPONENT=all
position=0
while [[ $# -gt 0 ]]; do
  case "$1" in
    --registry)
      [[ -n "${2:-}" && "$2" != --* ]] || { echo '--registry requires HOST[:PORT]/NAMESPACE.' >&2; exit 1; }
      REGISTRY=$2; shift 2;;
    --registry=*) REGISTRY=${1#*=}; shift;;
    --node-ip)
      [[ -n "${2:-}" ]] || { echo '--node-ip requires an IPv4 address.' >&2; exit 1; }
      NODE_IP=$2; shift 2;;
    --node-ip=*) NODE_IP=${1#*=}; shift;;
    --*) echo "Unknown option: $1" >&2; exit 1;;
    *)
      case "$position" in 0) PROFILE=$1;; 1) COMPONENT=$1;; *) echo 'Too many arguments.' >&2; exit 1;; esac
      position=$((position + 1)); shift;;
  esac
done
case "$ACTION" in sync|build|push|deploy|render|port-forward|expose) ;; *)
  echo "Usage: $0 {sync|build|push|deploy|render|port-forward|expose} [local|prod] [COMPONENT|ENVIRONMENT_ID] [--registry HOST[:PORT]/NAMESPACE] [--node-ip IP]"
  echo 'build builds and pushes project images; sync copies third-party runtime images from Alibaba Cloud.'
  exit 0;;
esac
REGISTRY=${REGISTRY%/}
[[ "$REGISTRY" =~ ^[a-z0-9][a-z0-9.-]*(:[0-9]+)?(/[a-z0-9][a-z0-9._-]*)+$ ]] || { echo 'Invalid registry; use HOST[:PORT]/NAMESPACE without http(s)://.' >&2; exit 1; }
[[ "$PROFILE" == local || "$PROFILE" == prod ]] || { echo 'Profile must be local or prod.' >&2; exit 1; }
TAG=${TAG:-$PROFILE}
if [[ "$PROFILE" == local ]]; then
  [[ "$NODE_IP" =~ ^([0-9]{1,3}\.){3}[0-9]{1,3}$ ]] || { echo 'NODE_IP must be an IPv4 address.' >&2; exit 1; }
  IFS=. read -r ip1 ip2 ip3 ip4 <<< "$NODE_IP"
  for octet in "$ip1" "$ip2" "$ip3" "$ip4"; do
    ((10#$octet <= 255)) || { echo 'Invalid NODE_IP octet.' >&2; exit 1; }
  done
  DOMAIN=${DOMAIN:-$NODE_IP}
  PORT_SUFFIX=:30443
  DB_MODE=${DB_MODE:-bundled}
else
  if [[ "$ACTION" == sync || "$ACTION" == push ]]; then DOMAIN=${DOMAIN:-opsiforce.localtest.me}
  else : "${DOMAIN:?Set DOMAIN for production}"; fi
  PORT_SUFFIX=
  DB_MODE=external
fi
[[ "$DOMAIN" =~ ^[a-z0-9][a-z0-9.-]*[a-z0-9]$ ]] || { echo 'DOMAIN must be a hostname without port or scheme.' >&2; exit 1; }
[[ "$TAG" =~ ^[a-zA-Z0-9_][a-zA-Z0-9_.-]*$ ]] || { echo 'Invalid image tag.' >&2; exit 1; }
if [[ "$ACTION" != expose ]]; then
  case "$COMPONENT" in all) COMPONENTS=(backend frontend runtime-proxy agent);; backend|frontend|runtime-proxy|agent) COMPONENTS=("$COMPONENT");; *) echo 'Unknown image component.' >&2; exit 1;; esac
fi

k() {
  if [[ -n "$KUBE_CONTEXT" ]]; then kubectl --context "$KUBE_CONTEXT" -n opsiforce "$@"
  else kubectl -n opsiforce "$@"; fi
}
if [[ "$ACTION" == expose ]]; then
  [[ "$PROFILE" == local && "$COMPONENT" =~ ^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$ ]] || { echo 'Usage: expose local ENVIRONMENT_UUID --node-ip NODE_IP' >&2; exit 1; }
  export RUNTIME_ENV=$COMPONENT
  RUNTIME_POD=$(k get pods -l "opsiforce.io/environment-id=$RUNTIME_ENV" -o 'jsonpath={range .items[*]}{.metadata.name}{"\n"}{end}')
  RUNTIME_POD=${RUNTIME_POD%%$'\n'*}
  [[ -n "$RUNTIME_POD" ]] || { echo 'Open the project in the platform first; no running environment Pod was found.' >&2; exit 1; }
  k wait --for=condition=Ready "pod/$RUNTIME_POD" --timeout=300s
  RUNTIME_UID=$(k get pod "$RUNTIME_POD" -o 'jsonpath={.metadata.uid}')
  export RUNTIME_POD RUNTIME_UID
  envsubst '${RUNTIME_ENV} ${RUNTIME_POD} ${RUNTIME_UID}' < "$DIR/k8s/local-runtime.yaml" | k apply -f -
  while IFS=$'\t' read -r surface port; do
    [[ -n "$surface" ]] && echo "$surface: http://$NODE_IP:$port/"
  done < <(k get service "opsiforce-test-$RUNTIME_ENV" -o 'jsonpath={range .spec.ports[*]}{.name}{"\t"}{.nodePort}{"\n"}{end}')
  echo 'Temporary local access; recreate it with this command after the environment Pod is replaced.'
  exit 0
fi
if [[ "$ACTION" == port-forward ]]; then
  [[ "$PROFILE" == local ]] || { echo 'port-forward is for local mode.' >&2; exit 1; }
  k port-forward svc/opsiforce-edge 30443:443
  exit 0
fi
if [[ "$ACTION" == sync ]]; then
  dependencies=(nginx:1.28.0-alpine bifrost:v2.0.0 gotenberg:8.36.0-libreoffice)
  if [[ "$PROFILE" == local ]]; then dependencies+=(postgres:16.4-alpine redis:7.4.1-alpine); fi
  for dependency in "${dependencies[@]}"; do
    docker pull --platform "$PLATFORM" "$SOURCE_REGISTRY/$dependency"
    docker tag "$SOURCE_REGISTRY/$dependency" "$REGISTRY/$dependency"
    docker push "$REGISTRY/$dependency"
  done
  exit 0
fi
if [[ "$ACTION" == build || "$ACTION" == push ]]; then
  for component in "${COMPONENTS[@]}"; do
    image="$REGISTRY/opsiforce-$component:$TAG"
    if [[ "$ACTION" == push ]]; then docker push "$image"; continue; fi
    args=(buildx build --load --platform "$PLATFORM" -t "$image" -f "$DIR/docker/Dockerfile.$component")
    if [[ "$component" == frontend ]]; then
      args+=(--build-arg "VITE_WEBAPP_DOMAIN=apps.$DOMAIN$PORT_SUFFIX"
             --build-arg "VITE_WEBAPP_PREVIEW_DOMAIN=preview.apps.$DOMAIN$PORT_SUFFIX"
             --build-arg "VITE_VSCODE_DOMAIN=code.$DOMAIN$PORT_SUFFIX"
             --build-arg "VITE_DB_DOMAIN=db.$DOMAIN$PORT_SUFFIX")
    fi
    docker "${args[@]}" "$ROOT"
    docker push "$image"
  done
  exit 0
fi

command -v envsubst >/dev/null || { echo 'Install gettext (envsubst) first.' >&2; exit 1; }
command -v openssl >/dev/null || { echo 'Install openssl first.' >&2; exit 1; }
[[ "$DB_MODE" == bundled || "$DB_MODE" == external ]] || { echo 'DB_MODE must be bundled or external.' >&2; exit 1; }
umask 077
STATE="$DIR/.state/$PROFILE"
OUT="$DIR/.generated/$PROFILE"
mkdir -p "$STATE" "$OUT"
# Keep generated credentials stable across deployments. Do not delete this file on upgrades.
if [[ ! -f "$STATE/secrets.env" ]]; then
  for name in LOCAL_PASSWORD ADMIN_PASSWORD PROXY_CONTROL_TOKEN BIFROST_ENCRYPTION_KEY EXTERNAL_SERVICES_ENCRYPTION_KEY OIDC_PLUGIN_SECRET; do
    printf '%s=%s\n' "$name" "$(openssl rand -hex 32)"
  done > "$STATE/secrets.env"
fi
source "$STATE/secrets.env"
if [[ "$DB_MODE" == bundled ]]; then
  PG_HOST=opsiforce-postgres
  PG_PORT=5432
  PG_USER=postgres
  PG_PASSWORD=$LOCAL_PASSWORD
  REDIS_URL="redis://:$LOCAL_PASSWORD@opsiforce-redis:6379/0"
else
  : "${PG_HOST:?Set the external PostgreSQL host}"
  : "${PG_PASSWORD:?Set the external PostgreSQL password}"
  : "${REDIS_URL:?Set the external Redis URL}"
  PG_PORT=${PG_PORT:-5432}
  PG_USER=${PG_USER:-postgres}
fi
PG_DATABASE=${PG_DATABASE:-opsiforce}
BIFROST_DATABASE=${BIFROST_DATABASE:-bifrost}
PG_SSLMODE=${PG_SSLMODE:-disable}
# These values occur inside Bifrost JSON; arbitrary passwords are passed through Secret data.
for name in PG_HOST PG_PORT PG_USER PG_DATABASE BIFROST_DATABASE PG_SSLMODE; do
  [[ "${!name}" =~ ^[a-zA-Z0-9_.:-]+$ ]] || { echo "Invalid $name" >&2; exit 1; }
done
urlencode() {
  local LC_ALL=C text=$1 char encoded i
  for ((i=0; i<${#text}; i++)); do
    char=${text:i:1}
    case "$char" in [a-zA-Z0-9.~_-]) printf '%s' "$char";; *) printf -v encoded '%%%02X' "'$char"; printf '%s' "$encoded";; esac
  done
}
DATABASE_URL=${DATABASE_URL:-"postgresql://$(urlencode "$PG_USER"):$(urlencode "$PG_PASSWORD")@$PG_HOST:$PG_PORT/$PG_DATABASE?sslmode=$PG_SSLMODE"}
b64() { printf '%s' "$1" | openssl base64 -A; }
for name in DATABASE_URL REDIS_URL PG_PASSWORD ADMIN_PASSWORD PROXY_CONTROL_TOKEN BIFROST_ENCRYPTION_KEY EXTERNAL_SERVICES_ENCRYPTION_KEY OIDC_PLUGIN_SECRET OPENAI_API_KEY ANTHROPIC_API_KEY; do
  export "${name}_B64=$(b64 "${!name}")"
done
DOMAIN_REGEX=${DOMAIN//./\\.}
PULL_SECRETS_JSON='[]'
if [[ -n "$IMAGE_PULL_SECRET" ]]; then
  [[ "$IMAGE_PULL_SECRET" =~ ^[a-z0-9][a-z0-9.-]*$ ]] || { echo 'Invalid IMAGE_PULL_SECRET.' >&2; exit 1; }
  PULL_SECRETS_JSON="[{\"name\":\"$IMAGE_PULL_SECRET\"}]"
fi
RELEASE_ID=$(date -u +%Y%m%d%H%M%S)
export REGISTRY TAG DOMAIN PORT_SUFFIX DOMAIN_REGEX PG_HOST PG_PORT PG_USER BIFROST_DATABASE PG_SSLMODE
export PULL_SECRETS_JSON RELEASE_ID
FILES=(base apps migration)
if [[ "$DB_MODE" == bundled ]]; then FILES+=(local-infra); fi
if [[ "$PROFILE" == local ]]; then
  # Nginx serves HTTPS because the current frontend generates HTTPS app URLs.
  if [[ ! -f "$STATE/tls.crt" || ! -f "$STATE/tls.key" || "$(cat "$STATE/tls-domain" 2>/dev/null || true)" != "$DOMAIN|$NODE_IP" ]]; then
    openssl req -x509 -nodes -newkey rsa:2048 -days 365 -keyout "$STATE/tls.key" -out "$STATE/tls.crt" \
      -subj "/CN=$DOMAIN" -addext "subjectAltName=IP:$NODE_IP,IP:127.0.0.1,DNS:$DOMAIN,DNS:*.$DOMAIN,DNS:*.apps.$DOMAIN,DNS:*.preview.apps.$DOMAIN,DNS:*.code.$DOMAIN,DNS:*.db.$DOMAIN" >/dev/null 2>&1
    printf '%s' "$DOMAIN|$NODE_IP" > "$STATE/tls-domain"
  fi
  export TLS_CRT_B64=$(openssl base64 -A -in "$STATE/tls.crt")
  export TLS_KEY_B64=$(openssl base64 -A -in "$STATE/tls.key")
  FILES+=(local-edge)
else FILES+=(production-edge); fi
TOKENS='${REGISTRY} ${TAG} ${DOMAIN} ${PORT_SUFFIX} ${DOMAIN_REGEX} ${PG_HOST} ${PG_PORT} ${PG_USER} ${BIFROST_DATABASE} ${PG_SSLMODE} ${PULL_SECRETS_JSON} ${RELEASE_ID} ${DATABASE_URL_B64} ${REDIS_URL_B64} ${PG_PASSWORD_B64} ${ADMIN_PASSWORD_B64} ${PROXY_CONTROL_TOKEN_B64} ${BIFROST_ENCRYPTION_KEY_B64} ${EXTERNAL_SERVICES_ENCRYPTION_KEY_B64} ${OIDC_PLUGIN_SECRET_B64} ${OPENAI_API_KEY_B64} ${ANTHROPIC_API_KEY_B64} ${TLS_CRT_B64} ${TLS_KEY_B64}'
for file in "${FILES[@]}"; do envsubst "$TOKENS" < "$DIR/k8s/$file.yaml" > "$OUT/$file.yaml"; done
[[ "$ACTION" == render ]] && { echo "YAML generated in $OUT"; exit 0; }

# Deploy only the selected profile. No StorageClass, ingress controller or network policy is installed.
k apply -f "$OUT/base.yaml"
if [[ -n "$IMAGE_PULL_SECRET" ]]; then k get secret "$IMAGE_PULL_SECRET" -o name; fi
# Fixed workloads inherit registry credentials; dynamic agents also use IMAGE_PULL_SECRETS above.
if [[ -n "$IMAGE_PULL_SECRET" ]]; then
  for sa in default opsiforce-backend; do k patch serviceaccount "$sa" -p "{\"imagePullSecrets\":$PULL_SECRETS_JSON}"; done
fi
if [[ "$DB_MODE" == bundled ]]; then
  k apply -f "$OUT/local-infra.yaml"
  k rollout status statefulset/opsiforce-postgres --timeout=600s
  k rollout status statefulset/opsiforce-redis --timeout=600s
fi
old_job=$(k get job opsiforce-migrate --ignore-not-found -o 'jsonpath={.metadata.name}{" "}{.status.conditions[?(@.status=="True")].type}')
if [[ -n "$old_job" && "$old_job" != *Complete* && "$old_job" != *Failed* ]]; then
  echo 'An earlier migration is still running. Inspect it before retrying.' >&2; exit 1
fi
if [[ -n "$(k get deployment opsiforce-backend --ignore-not-found -o name)" ]]; then
  k scale deployment/opsiforce-backend --replicas=0
  while IFS= read -r pod; do [[ -z "$pod" ]] || k wait --for=delete "$pod" --timeout=240s; done < <(k get pods -l app=opsiforce-backend -o name)
fi
[[ -z "$old_job" ]] || k delete job opsiforce-migrate --wait=true
k apply -f "$OUT/migration.yaml"
k wait --for=condition=complete job/opsiforce-migrate --timeout=900s
k apply -f "$OUT/apps.yaml"
if [[ "$PROFILE" == local ]]; then k apply -f "$OUT/local-edge.yaml"; else k apply -f "$OUT/production-edge.yaml"; fi
for deployment in backend frontend proxy-agent proxy-app proxy-vscode proxy-db bifrost gotenberg edge; do
  k rollout status "deployment/opsiforce-$deployment" --timeout=900s
done
if [[ "$PROFILE" == local ]]; then
  echo "Deployed: https://$NODE_IP:30443"
  echo "Trust $STATE/tls.crt in your test browser. Use expose for temporary App/VS Code/DB ports."
else
  echo 'Production workloads are ready. The private opsiforce-edge:8080 Service awaits host-product authentication and routing integration.'
fi
