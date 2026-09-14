# 先在测试环境跑起来

保留 4 个 Dockerfile、Kubernetes YAML 和一个 `deploy.sh`。测试环境不安装域名服务、Traefik、Keycloak、OAuth2 Proxy、StorageClass 或 NetworkPolicy。

基础镜像从阿里云 `registry.cn-beijing.aliyuncs.com/mayc` 拉取，构建产物和运行镜像使用 `sealos.hub:5000/opsiforce`。测试集群已有 `local-path`，构建机需要 Docker、kubectl、openssl、envsubst（gettext）。

## IP + NodePort 启动

```bash
# 改成浏览器可以访问的测试集群节点 IPv4 地址
export NODE_IP=192.168.1.10

# 阿里云第三方运行镜像同步到内网仓库
./deploy/deploy.sh sync local
# 构建并自动推送项目镜像
./deploy/deploy.sh build local
# 先部署测试服务；模型密钥可以以后再配置
./deploy/deploy.sh deploy local
```

`OPENAI_API_KEY`、`ANTHROPIC_API_KEY` 都可留空，不影响镜像构建，部署脚本也不强制填写。未接入有效模型时，AI 对话和代码生成不可用。后续接国内模型时，需要一起配置供应商地址（Base URL）、API Key 和实际模型 ID，并调整 Bifrost / Agent 当前默认的 OpenAI 配置；不能只把国内 Key 填入 `OPENAI_API_KEY`，因为当前请求地址仍指向 OpenAI。

直接访问 **`https://192.168.1.10:30443`**，无需域名或 hosts 配置。`http://192.168.1.10:30080` 会跳转到 HTTPS。保留 HTTPS 是因为现有浏览器功能依赖安全上下文；证书自动包含节点 IP，测试浏览器需要信任 `deploy/.state/local/tls.crt`。平台使用固定测试用户，不需要配置登录系统。

也可以通过参数传入 IP 和仓库地址：

```bash
./deploy/deploy.sh deploy local \
  --node-ip 192.168.1.10 \
  --registry sealos.hub:5000/opsiforce
```

固定部署后端、前端、4 个运行时代理、Bifrost、Gotenberg，以及测试用 PG / Redis。工作区 PVC 使用已有的 `local-path`，大小 20Gi，访问模式 `ReadWriteOnce`。共享该本地卷的后端、代理、Agent 受 PV 节点绑定约束，不能跨节点当成 RWX 使用。

## 无域名时测试 App / VS Code / DB

**现有前端内嵌预览和复制链接仍使用子域名。** 这次只调整部署，不改业务路由；无域名时，平台页面和对话通过主 NodePort 访问，项目 App、VS Code 和 DB 可以先临时映射独立 NodePort，在新浏览器页面测试：

```bash
# 先在平台打开项目，等 Agent Pod 就绪，再查看环境 UUID
kubectl -n opsiforce get pods -l app=opsiforce-agent -L opsiforce.io/environment-id

# 把“环境UUID”替换成上一步对应的值
./deploy/deploy.sh expose local 环境UUID --node-ip 192.168.1.10
```

脚本输出三个 `http://IP:分配端口/` 地址。它们直接连到该环境 Pod，保留应用根路径，不需要为生成的应用修改静态资源路径。临时 Service 随 Pod 删除自动回收；Pod 重建后重新执行 `expose` 获取新地址。

这些端口仅用于可信测试网络，不经过平台登录和运行时代理，不提供代理请求日志 / 自动唤醒 / 活跃时间更新。测试时保持项目打开；环境休眠后从平台重新唤醒。要让所有内嵌预览也自动适配无域名访问，后续再统一改产品 URL 和路由逻辑。

## 常用选项

```bash
# 仓库可通过 --registry 或 REGISTRY 环境变量覆盖，命令行优先
./deploy/deploy.sh build local --registry sealos.hub:5000/opsiforce
# 单独重建一个镜像，完成后自动推送
TAG=v2 ./deploy/deploy.sh build local backend
# 推送失败后单独重试
TAG=v2 ./deploy/deploy.sh push local backend
# 指定 kubectl context
KUBE_CONTEXT=my-test ./deploy/deploy.sh deploy local --node-ip 192.168.1.10
# 只展开 YAML，不访问集群
./deploy/deploy.sh render local --node-ip 192.168.1.10
# 平台入口可以转发到本机；expose 的项目端口仍需要能访问集群节点
./deploy/deploy.sh port-forward local
```

默认镜像 tag 是 `local` / `prod`。构建和部署保持相同的 tag、地址参数。`sync local` 同步 Nginx、Bifrost、Gotenberg、PostgreSQL、Redis；构建阶段的 Node / Go 等基础镜像继续使用阿里云地址。

私有仓库先在构建机执行 `docker login`，集群已有拉取 Secret 时设置 `IMAGE_PULL_SECRET=名称`。内网 HTTP 仓库需已有 Docker / 容器运行时访问配置，脚本不修改全局运行时设置。

## 生产先保留主体产品接入位置

生产不部署独立登录服务，不要求 OIDC 参数。`production-edge.yaml` 只提供 Nginx + 私有 ClusterIP Service，**不创建公网入口或认证实现**。后续二开时，由你们主体产品的网关 / 服务完成登录校验，再接入这个入口。

现有后端读取 `X-Forwarded-User`、`X-Forwarded-Preferred-Username`、`X-Forwarded-Email`、`X-Forwarded-Groups` 等身份头，组到租户 / 权限的映射在 `k8s/base.yaml` 的 `SSO_GROUP_MAP`。这是目前代码的对接位置，不代表已接通你们的认证服务；后续根据主体的实际协议适配，外部用户输入的身份头不能直接作为认证结果。

生产 PG / Redis 使用外部服务，不安装 Pod。提前建立 `opsiforce`、`bifrost` 两个 PG 数据库：

```bash
export DOMAIN=opsiforce.company.com
export PG_HOST=10.0.0.10
export PG_PORT=5432
export PG_USER=opsiforce
export PG_PASSWORD='数据库密码'
export REDIS_URL='redis://:URL编码后的密码@10.0.0.11:6379/0'
./deploy/deploy.sh sync prod
./deploy/deploy.sh build prod
./deploy/deploy.sh deploy prod
```

上述仅部署生产基础工作负载，主站接入、应用路由和公司认证需后续完成。Redis 当前使用普通单 endpoint 客户端；原生分片 Cluster / Sentinel 发现不能只改 URL，需要兼容代理入口或后续客户端适配。队列要求 `noeviction`，过期通知使用 `notify-keyspace-events Ex`。

## 文件与数据

- `k8s/base.yaml`：Namespace、RBAC、PVC、配置和密钥。
- `k8s/apps.yaml`：平台固定服务。
- `k8s/migration.yaml`：数据库迁移。
- `k8s/local-infra.yaml`：测试 PG / Redis。
- `k8s/local-edge.yaml`：IP NodePort 入口和测试用户。
- `k8s/local-runtime.yaml`：`expose` 使用的临时项目端口模板，默认部署不执行它。
- `k8s/production-edge.yaml`：主体产品后续对接的私有入口。

生成 YAML 位于 `.generated/<环境>`，随机密钥和测试证书位于 `.state/<环境>`。普通升级不要删除 `.state`。脚本先等待数据库，再执行迁移；迁移失败即停止，已有未终结的迁移 Job 不会被删除或重跑。

迁移旧部署时，PVC 存储类和访问模式不能原地改变，先备份数据。删掉旧 YAML 不会删除集群中已有的 Traefik、网络策略或认证组件，脚本不会自动删除已有基础设施。
