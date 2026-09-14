#!/usr/bin/env bash
set -euo pipefail

# 可直接修改以下默认值，也可以通过同名环境变量覆盖。
REGISTRY=${REGISTRY:-sealos.hub:5000/opsiforce}
SOURCE_REGISTRY=${SOURCE_REGISTRY:-registry.cn-beijing.aliyuncs.com/mayc}
PLATFORM=${PLATFORM:-linux/amd64}
NODE_IP=${NODE_IP:-}                     # 仅 expose 临时测试地址显示使用。
DOMAIN=${DOMAIN:-opsiforce.localtest.me}   # 公司 CDN 的业务根域名；不用于集群内部通信。
PUBLIC_SCHEME=${PUBLIC_SCHEME:-https}      # CDN 对外协议；本机 HTTP 测试可设置 http。
KUBE_CONTEXT=${KUBE_CONTEXT:-}             # 留空时使用 kubectl 当前的集群上下文。
IMAGE_PULL_SECRET=${IMAGE_PULL_SECRET:-}   # opsiforce 命名空间中已有的镜像拉取 Secret 名称。
OPENAI_API_KEY=${OPENAI_API_KEY:-}
ANTHROPIC_API_KEY=${ANTHROPIC_API_KEY:-}

DIR=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)
ROOT=$(dirname "$DIR")
ACTION=${1:-help}
[[ $# -eq 0 ]] || shift
PROFILE=local
COMPONENT=all
NO_PUSH=false
position=0
while [[ $# -gt 0 ]]; do
  case "$1" in
    --registry)
      [[ -n "${2:-}" && "$2" != --* ]] || { echo '--registry 后需要填写 主机[:端口]/命名空间。' >&2; exit 1; }
      REGISTRY=$2; shift 2;;
    --registry=*) REGISTRY=${1#*=}; shift;;
    --tag)
      [[ -n "${2:-}" && "$2" != --* ]] || { echo '--tag 后需要填写镜像版本，例如 v1.0.0。' >&2; exit 1; }
      TAG=$2; shift 2;;
    --tag=*)
      TAG=${1#*=}
      [[ -n "$TAG" ]] || { echo '--tag 不能为空。' >&2; exit 1; }
      shift;;
    --no-push) NO_PUSH=true; shift;;
    --node-ip)
      [[ -n "${2:-}" ]] || { echo '--node-ip 后需要填写节点 IPv4 地址。' >&2; exit 1; }
      NODE_IP=$2; shift 2;;
    --node-ip=*) NODE_IP=${1#*=}; shift;;
    --*) echo "未知选项：$1" >&2; exit 1;;
    *)
      case "$position" in 0) PROFILE=$1;; 1) COMPONENT=$1;; *) echo '位置参数过多，请查看脚本用法。' >&2; exit 1;; esac
      position=$((position + 1)); shift;;
  esac
done
case "$ACTION" in sync|build|push|import|deploy|render|port-forward|expose) ;; *)
  cat <<EOF
测试环境按三步执行，以下命令均在 deploy 目录运行：
  # 1. 在联网构建机上构建并推送项目镜像；已成功时跳过
  bash deploy.sh build --tag v1.0.0 --registry sealos.hub:5000/opsiforce
  # 2. 在能访问阿里云和内网仓库的机器上，同步第三方运行镜像
  bash deploy.sh sync --registry sealos.hub:5000/opsiforce
  # 3. 在已配置 kubectl 的内网机器上部署，通过 Service 提供 HTTP 回源
  bash deploy.sh deploy --tag v1.0.0 --registry sealos.hub:5000/opsiforce

sync 从 $SOURCE_REGISTRY 同步 nginx、bifrost、gotenberg、postgres、redis，保留各自版本，无需 --tag。
deploy 使用已推送的镜像，创建资源、执行数据库迁移并等待服务启动，不重新构建。
部署提供 opsiforce-edge:8080；测试可运行 port-forward 后访问 http://localhost:30080。

默认使用测试环境，无需填写 local；默认仓库为 sealos.hub:5000/opsiforce。
更换仓库时加 --registry 主机:端口/命名空间，须与 Windows 的 -Registry 一致。
使用 --tag 指定镜像版本，默认 local（生产为 prod）；命令行优先于 TAG 环境变量。

可选用法：
  bash deploy.sh build --tag v1.0.0 --no-push  # 只构建，保留在本地
  bash deploy.sh push --tag v1.0.0            # 稍后单独推送，不重新构建
build 默认先构建全部选定镜像，再推送；推送失败时本地镜像仍保留，退出码为 2。

如果 Windows 选择了仅导出，则一并复制 images.tar，部署前先执行：
  docker login sealos.hub:5000
  bash deploy.sh import                       # 导入全部镜像并推送到内网仓库

命令说明：
  build         构建项目镜像并自动推送
  push          推送已经构建的项目镜像
  sync          在联网机器上同步第三方镜像到目标仓库
  deploy        使用 YAML 部署服务，自动执行数据库迁移并等待启动
  import        导入 Windows 导出的镜像包并推送到目标仓库
  render        仅生成 YAML
  port-forward  将平台入口转发到本机 30080 端口
  expose        为已启动的项目开放临时 NodePort

完整格式：$0 命令 [local|prod] [组件|环境UUID] [--tag 版本] [--registry 仓库地址] [--node-ip 节点IP] [--no-push]
组件可选 all、backend、frontend、runtime-proxy、agent，默认 all。
--node-ip 仅 expose 临时访问使用；部署和集群内部通信无需节点 IP。
其他配置见 deploy/README.md；模型 Key 可以留空。
EOF
  exit 0;;
esac
REGISTRY=${REGISTRY%/}
[[ "$REGISTRY" =~ ^[a-z0-9][a-z0-9.-]*(:[0-9]+)?(/[a-z0-9][a-z0-9._-]*)+$ ]] || { echo '仓库地址格式错误，请使用 主机[:端口]/命名空间，不要包含 http(s)://。' >&2; exit 1; }
[[ "$PROFILE" == local || "$PROFILE" == prod ]] || { echo '环境只能是 local（测试）或 prod（生产）。' >&2; exit 1; }
TAG=${TAG:-$PROFILE}
[[ "$TAG" =~ ^[a-zA-Z0-9_][a-zA-Z0-9_.-]{0,127}$ ]] || { echo '镜像标签 TAG 格式错误，长度不能超过 128 个字符。' >&2; exit 1; }
[[ "$NO_PUSH" == false || "$ACTION" == build ]] || { echo '--no-push 仅用于 build。' >&2; exit 1; }
if [[ "$ACTION" != expose ]]; then
  case "$COMPONENT" in all) COMPONENTS=(backend frontend runtime-proxy agent);; backend|frontend|runtime-proxy|agent) COMPONENTS=("$COMPONENT");; *) echo '未知镜像组件，请使用 all、backend、frontend、runtime-proxy 或 agent。' >&2; exit 1;; esac
fi

# 构建、推送、导入只处理镜像，与部署地址无关。
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
if [[ "$ACTION" == import ]]; then
  [[ "$PROFILE" == local && "$COMPONENT" == all ]] || { echo 'Windows 镜像包用于全量测试部署，请执行：bash deploy.sh import' >&2; exit 1; }
  archive=${IMAGE_ARCHIVE:-$DIR/images.tar}
  [[ -f "$archive" ]] || { echo "未找到镜像包：${archive}，请先从 Windows 复制 images.tar。" >&2; exit 1; }
  docker load --input "$archive"
  images=()
  for component in "${COMPONENTS[@]}"; do images+=("opsiforce-$component:$TAG"); done
  images+=(nginx:1.28.0-alpine bifrost:v2.0.0 gotenberg:8.36.0-libreoffice postgres:16.4-alpine redis:7.4.1-alpine)
  # 先检查全量镜像是否存在，再开始推送，避免缺包或标签不一致时只推送一部分。
  for image in "${images[@]}"; do docker image inspect "opsiforce/$image" >/dev/null; done
  for image in "${images[@]}"; do
    echo "推送镜像：$REGISTRY/$image"
    docker tag "opsiforce/$image" "$REGISTRY/$image"
    docker push "$REGISTRY/$image"
  done
  echo "全部 9 个镜像已推送到：$REGISTRY"
  exit 0
fi
if [[ "$ACTION" == build || "$ACTION" == push ]]; then
  images=()
  for component in "${COMPONENTS[@]}"; do
    image="$REGISTRY/opsiforce-$component:$TAG"
    images+=("$image")
    if [[ "$ACTION" == build ]]; then
      args=(buildx build --load --platform "$PLATFORM" -t "$image" -f "$DIR/docker/Dockerfile.$component")
      docker "${args[@]}" "$ROOT"
    fi
  done
  if [[ "$NO_PUSH" == true ]]; then
    echo "已构建 ${#images[@]} 个镜像，保留在本地，未推送。"
    exit 0
  fi
  for image in "${images[@]}"; do
    if ! docker push "$image"; then
      echo "推送失败：${image}。本地镜像仍保留，本次未完成推送。" >&2
      printf '仓库恢复后执行：' >&2
      printf '%q ' bash "$0" push "$PROFILE" "$COMPONENT" --tag "$TAG" --registry "$REGISTRY" >&2
      printf '\n' >&2
      exit 2
    fi
  done
  echo "全部 ${#images[@]} 个项目镜像已推送到：$REGISTRY"
  exit 0
fi

# 集群内部一律使用 Service DNS；DOMAIN 只用于浏览器公开地址。
PORT_SUFFIX=
if [[ "$PROFILE" == local ]]; then DB_MODE=${DB_MODE:-bundled}; else DB_MODE=external; fi
[[ "$DOMAIN" =~ ^[a-z0-9][a-z0-9.-]*[a-z0-9]$ ]] || { echo 'DOMAIN 必须是域名，不要包含端口或协议。' >&2; exit 1; }
[[ "$PUBLIC_SCHEME" == http || "$PUBLIC_SCHEME" == https ]] || { echo 'PUBLIC_SCHEME 只能是 http 或 https。' >&2; exit 1; }

k() {
  if [[ -n "$KUBE_CONTEXT" ]]; then kubectl --context "$KUBE_CONTEXT" -n opsiforce "$@"
  else kubectl -n opsiforce "$@"; fi
}
if [[ "$ACTION" == expose ]]; then
  [[ "$PROFILE" == local && "$COMPONENT" =~ ^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$ ]] || { echo '用法：expose local 环境UUID --node-ip 节点IPv4地址' >&2; exit 1; }
  : "${NODE_IP:?expose 需要 --node-ip 用于显示临时测试地址}"
  export RUNTIME_ENV=$COMPONENT
  RUNTIME_POD=$(k get pods -l "opsiforce.io/environment-id=$RUNTIME_ENV" -o 'jsonpath={range .items[*]}{.metadata.name}{"\n"}{end}')
  RUNTIME_POD=${RUNTIME_POD%%$'\n'*}
  [[ -n "$RUNTIME_POD" ]] || { echo '未找到运行环境 Pod，请先在平台中打开项目。' >&2; exit 1; }
  k wait --for=condition=Ready "pod/$RUNTIME_POD" --timeout=300s
  RUNTIME_UID=$(k get pod "$RUNTIME_POD" -o 'jsonpath={.metadata.uid}')
  export RUNTIME_POD RUNTIME_UID
  envsubst '${RUNTIME_ENV} ${RUNTIME_POD} ${RUNTIME_UID}' < "$DIR/k8s/local-runtime.yaml" | k apply -f -
  while IFS=$'\t' read -r surface port; do
    [[ -n "$surface" ]] && echo "$surface: http://$NODE_IP:$port/"
  done < <(k get service "opsiforce-test-$RUNTIME_ENV" -o 'jsonpath={range .spec.ports[*]}{.name}{"\t"}{.nodePort}{"\n"}{end}')
  echo '以上地址用于临时测试；环境 Pod 更换后，请重新执行此命令。'
  exit 0
fi
if [[ "$ACTION" == port-forward ]]; then
  [[ "$PROFILE" == local ]] || { echo 'port-forward 仅支持 local 测试环境。' >&2; exit 1; }
  k port-forward svc/opsiforce-edge 30080:8080
  exit 0
fi

command -v envsubst >/dev/null || { echo '请先安装 gettext，以提供 envsubst 命令。' >&2; exit 1; }
command -v openssl >/dev/null || { echo '请先安装 openssl。' >&2; exit 1; }
[[ "$DB_MODE" == bundled || "$DB_MODE" == external ]] || { echo 'DB_MODE 只能是 bundled（部署测试数据库）或 external（外部数据库）。' >&2; exit 1; }
umask 077
STATE="$DIR/.state/$PROFILE"
OUT="$DIR/.generated/$PROFILE"
mkdir -p "$STATE" "$OUT"
# 重复部署复用已生成的密钥，升级时不要删除此文件。
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
  : "${PG_HOST:?请设置外部 PostgreSQL 地址 PG_HOST}"
  : "${PG_PASSWORD:?请设置外部 PostgreSQL 密码 PG_PASSWORD}"
  : "${REDIS_URL:?请设置外部 Redis 连接地址 REDIS_URL}"
  PG_PORT=${PG_PORT:-5432}
  PG_USER=${PG_USER:-postgres}
fi
PG_DATABASE=${PG_DATABASE:-opsiforce}
BIFROST_DATABASE=${BIFROST_DATABASE:-bifrost}
PG_SSLMODE=${PG_SSLMODE:-disable}
# 这些字段会写入 Bifrost 的 JSON 配置；密码单独通过 Secret 传递。
for name in PG_HOST PG_PORT PG_USER PG_DATABASE BIFROST_DATABASE PG_SSLMODE; do
  [[ "${!name}" =~ ^[a-zA-Z0-9_.:-]+$ ]] || { echo "$name 的值包含不支持的字符" >&2; exit 1; }
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
  [[ "$IMAGE_PULL_SECRET" =~ ^[a-z0-9][a-z0-9.-]*$ ]] || { echo 'IMAGE_PULL_SECRET 名称格式错误。' >&2; exit 1; }
  PULL_SECRETS_JSON="[{\"name\":\"$IMAGE_PULL_SECRET\"}]"
fi
RELEASE_ID=$(date -u +%Y%m%d%H%M%S)
export REGISTRY TAG DOMAIN PUBLIC_SCHEME PORT_SUFFIX DOMAIN_REGEX PG_HOST PG_PORT PG_USER BIFROST_DATABASE PG_SSLMODE
export PULL_SECRETS_JSON RELEASE_ID
FILES=(base apps migration)
if [[ "$DB_MODE" == bundled ]]; then FILES+=(local-infra); fi
if [[ "$PROFILE" == local ]]; then FILES+=(local-edge); else FILES+=(production-edge); fi
TOKENS='${REGISTRY} ${TAG} ${DOMAIN} ${PUBLIC_SCHEME} ${PORT_SUFFIX} ${DOMAIN_REGEX} ${PG_HOST} ${PG_PORT} ${PG_USER} ${BIFROST_DATABASE} ${PG_SSLMODE} ${PULL_SECRETS_JSON} ${RELEASE_ID} ${DATABASE_URL_B64} ${REDIS_URL_B64} ${PG_PASSWORD_B64} ${ADMIN_PASSWORD_B64} ${PROXY_CONTROL_TOKEN_B64} ${BIFROST_ENCRYPTION_KEY_B64} ${EXTERNAL_SERVICES_ENCRYPTION_KEY_B64} ${OIDC_PLUGIN_SECRET_B64} ${OPENAI_API_KEY_B64} ${ANTHROPIC_API_KEY_B64}'
for file in "${FILES[@]}"; do envsubst "$TOKENS" < "$DIR/k8s/$file.yaml" > "$OUT/$file.yaml"; done
[[ "$ACTION" == render ]] && { echo "YAML 已生成到：$OUT"; exit 0; }

# 只部署所选环境，不安装 StorageClass、入口控制器或网络策略。
k apply -f "$OUT/base.yaml"
if [[ -n "$IMAGE_PULL_SECRET" ]]; then k get secret "$IMAGE_PULL_SECRET" -o name; fi
# 固定工作负载继承镜像拉取凭据；动态 Agent 也使用上面的拉取凭据配置。
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
  echo '上一次数据库迁移尚未结束，请检查迁移任务后再重试。' >&2; exit 1
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
echo '工作负载已就绪；集群内通过 http://opsiforce-edge:8080 访问回源入口。'
echo '测试入口：http://节点地址:30080；也可执行 bash deploy.sh port-forward 后访问 http://localhost:30080。'
echo '公网接入：由公司 CDN 终止 TLS，保留 Host 并转发 WebSocket/SSE，使用公司实际域名设置 DOMAIN。'
