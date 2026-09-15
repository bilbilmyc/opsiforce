# 测试环境部署

使用普通 Dockerfile、Kubernetes YAML 和 Shell 脚本部署。Windows 和 Linux 都支持构建，选择其中一台联网机器即可。

- **部署**：前端、后端、运行时代理、Bifrost、Gotenberg、测试 PostgreSQL / Redis、Nginx 测试入口；Agent 在打开项目时创建。
- **不部署**：Traefik、StorageClass、NetworkPolicy、Keycloak、OAuth2 Proxy。
- **存储**：使用已有的 `local-path`，PVC 为 `ReadWriteOnce`。共享工作区受 PV 节点绑定限制。
- **基础镜像**：`registry.cn-beijing.aliyuncs.com/mayc`。
- **推送仓库**：`sealos.hub:5000/opsiforce`。

## Windows 构建并推送

准备完整项目，启动 Docker Desktop，使用 Linux 容器模式。在项目根目录的 PowerShell 执行：

```powershell
docker login sealos.hub:5000
powershell -ExecutionPolicy Bypass -File .\deploy\build.ps1
```

阿里云镜像需要认证时，也先执行 `docker login registry.cn-beijing.aliyuncs.com`。脚本构建 4 个项目镜像，拉取 5 个第三方运行镜像，将全部 9 个镜像推送到内网仓库。构建日志中的项目镜像名称直接使用指定的仓库和 tag，例如 `sealos.hub:5000/opsiforce/opsiforce-backend:v1.0.0`。默认不导出 tar、不创建导出用的中间标签。默认平台是 `linux/amd64`。

## Linux 构建并推送

在能够联网的 Linux 构建机上，进入完整项目的 `deploy` 目录：

```bash
docker login sealos.hub:5000
bash deploy.sh build --tag v1.0.0 --registry sealos.hub:5000/opsiforce
bash deploy.sh sync --registry sealos.hub:5000/opsiforce
```

`build` 构建并推送 4 个项目镜像，已成功时无需重复。`sync` 从阿里云的 `mayc` 仓库同步 5 个第三方运行镜像到内网仓库，保留各自的固定版本，无需指定 `--tag`；已同步时可跳过。同步机器需要同时访问阿里云和内网仓库。构建机只需要 Docker，不要求安装 Node、Go 或 kubectl。

## 指定版本、仓库或仅保留本地镜像

`build` 默认推送，不需要额外加 push 选项。

```bash
# Linux：指定版本和仓库，构建后自动推送
bash deploy.sh build --tag v1.0.0 --registry sealos.hub:5000/opsiforce

# Linux：只构建，不推送
bash deploy.sh build --tag v1.0.0 --no-push

# Linux：稍后单独推送，不重新构建（仓库和 tag 与构建时保持一致）
bash deploy.sh push --tag v1.0.0 --registry sealos.hub:5000/opsiforce
```

```powershell
# Windows：指定版本和仓库，构建后自动推送
powershell -ExecutionPolicy Bypass -File .\deploy\build.ps1 -Tag v1.0.0 -Registry sealos.hub:5000/opsiforce

# Windows：只构建并准备全部 9 个镜像，不推送、不导出
powershell -ExecutionPolicy Bypass -File .\deploy\build.ps1 -Tag v1.0.0 -NoPush
```

两端都会先完成全部镜像的准备，再开始推送。目标仓库访问受限或推送失败时，本地镜像和标签仍保留，脚本提示未完成推送并返回退出码 `2`；不会自动继续部署。构建或依赖下载失败仍会立即停止。`--no-push` / `-NoPush` 主动跳过推送时返回成功；这不影响从源仓库下载基础镜像和依赖。

## 在内网虚拟机部署

将最新 `deploy` 目录复制到虚拟机。预先准备 Bash、kubectl、openssl、envsubst（gettext），确认 kubectl 指向测试集群。在 `deploy` 目录执行：

```bash
# 仓库和 tag 与构建时一致，不需要节点 IP
bash deploy.sh deploy --tag v1.0.0 --registry sealos.hub:5000/opsiforce

# 查看启动状态
kubectl -n opsiforce get pods
```

如果构建时没有指定版本（例如直接运行 Windows 的 `build.ps1`），将上面的 `--tag v1.0.0` 改为 `--tag local`。`deploy` 使用仓库中已经推送的镜像，不会重新构建或同步镜像。

访问 **`http://节点地址:30080`**，或执行 `bash deploy.sh port-forward` 后访问 **`http://localhost:30080`**。测试环境使用固定用户，不自动创建证书，也不强制跳转 HTTPS。集群内回源地址为 `http://opsiforce-edge:8080`。生产模式使用 ClusterIP，并依赖公司认证入口传入受信任的用户头；不要直接公开未经认证的生产回源服务。

部署按顺序创建基础资源、启动 PG / Redis、执行数据库迁移、启动应用；失败会停止。集群节点从内网仓库拉取镜像，无需访问外网下载构建依赖。私有仓库需要集群已有拉取凭据；可用 `IMAGE_PULL_SECRET=凭据名称 bash deploy.sh deploy` 指定 opsiforce 命名空间中已有的 Secret。

`local` 是默认测试环境，以上命令无需填写。构建不需要节点 IP，节点 IP 仅在 expose 临时访问命令中用于显示地址。

## 可选：导出镜像包

Windows 默认构建并推送。需要 tar 时才额外添加 `-Export`；这个选项不会关闭推送：

```powershell
# 构建、推送，并额外导出 tar
powershell -ExecutionPolicy Bypass -File .\deploy\build.ps1 -Export

# 构建并导出 tar，不推送
powershell -ExecutionPolicy Bypass -File .\deploy\build.ps1 -Export -NoPush
```

输出为 `deploy/images.tar`，包含全部 9 个运行所需镜像。仅导出模式下，将它与 `deploy` 目录一起复制到具有 Docker 的内网机器，在该目录执行以下命令，再执行前面的部署命令：

```bash
docker login sealos.hub:5000
bash deploy.sh import
```

`import` 导入镜像、重新打标签并推送到内网仓库。Windows 已直接推送成功时，不需要执行这一步。

## 需要时再改的配置

### 40 虚拟机的 HTTP 预览与发布测试

平台入口可使用 `http://12.2.40.40`。应用预览和发布使用不同的子域名；测试时使用自动解析到该 IP 的 `opsiforce.12.2.40.40.sslip.io`，无需购买域名或逐个添加 hosts。访问电脑必须能连接 `12.2.40.40`，且 DNS 能解析这些测试域名。

后续重新部署到 40 时，在同一终端先设置以下变量，再执行部署命令，避免恢复到默认的 `opsiforce.localtest.me`：

```bash
export DOMAIN=opsiforce.12.2.40.40.sslip.io
export PUBLIC_SCHEME=http
```

- 平台：`http://12.2.40.40` 或 `http://opsiforce.12.2.40.40.sslip.io`。
- 预览：`http://<环境ID>.preview.apps.opsiforce.12.2.40.40.sslip.io/`。
- 发布：`http://<环境ID>-<环境slug>.apps.opsiforce.12.2.40.40.sslip.io/`，以界面实际生成的地址为准。

Traefik 的 HTTP 入口转发至 `opsiforce-edge:8080`，由入口按域名分发到运行时代理。静态页面也需完成生成、启动，并登记 `app/app.meta.json`，平台才会显示应用预览和发布入口。这里的 Production 是测试集群内的发布目标，不代表已经具备公网生产环境。

- 仓库：Windows 使用 `-Registry 主机:端口/命名空间`；Linux 使用 `--registry 主机:端口/命名空间`，构建和部署保持一致。
- 镜像版本：默认 `local`。Windows 可用 `-Tag v2`；Linux 构建、推送、导入和部署都使用 `--tag v2`，例如 `bash deploy.sh deploy --tag v2`。兼容原有 `TAG=v2` 环境变量，命令行选项优先。
- 架构：Windows 可用 `-Platform linux/arm64`；Linux 可用 `PLATFORM=linux/arm64`，基础镜像也必须支持该架构。
- 模型 Key：`OPENAI_API_KEY`、`ANTHROPIC_API_KEY` 可以留空，之后再配置。没有有效模型时，AI 对话和代码生成不可用。国内模型还需要配置供应商地址和模型名。
- 构建下载源：npm / Yarn 使用 npmmirror，apk / apt / pip 使用清华源，Go 使用 goproxy.cn。OpenCode 单独使用官方 npm 源，因为国内源缺少固定版本的 Linux x64 平台包；GitHub、SheetJS 和 code-server 等直链也需要构建机能访问外网。

## code-server 下载失败时

Agent 需要安装 code-server。若构建日志在 `release-assets.githubusercontent.com` 报 TLS 连接错误，表示 GitHub 发布文件下载中断；不需要更换 Linux 或重新安装已经完成的依赖。

Dockerfile 会先读取 `deploy/packages/` 中的本地安装包，找不到时才联网下载，并进行有限重试。构建机无法访问 GitHub 下载域名时，在能访问的机器下载 [amd64 安装包](https://github.com/coder/code-server/releases/download/v4.117.0/code-server_4.117.0_amd64.deb) 或 [arm64 安装包](https://github.com/coder/code-server/releases/download/v4.117.0/code-server_4.117.0_arm64.deb)，然后复制到构建机项目的 `deploy/packages/` 目录，保留原文件名。

例如 amd64 构建使用 `deploy/packages/code-server_4.117.0_amd64.deb`。然后重跑原来的构建命令即可，不需要新参数。Windows 也支持相同方式。本地包和联网下载的包都会校验官方 SHA256；`.deb` 已加入 Git 忽略规则。校验来源为 [官方 v4.117.0 发布资产](https://api.github.com/repos/coder/code-server/releases/tags/v4.117.0)。

## 公司 CDN 回源

```bash
# 首次配置一次公司实际业务根域名；域名变化无需重建前端镜像
DOMAIN=ops.example.com PUBLIC_SCHEME=https bash deploy.sh deploy --tag v1.0.0
```

公司 CDN 负责 HTTPS 和证书，回源到 `opsiforce-edge:8080`（集群内）或测试 NodePort `30080`（集群外）。CDN 保留原始 Host，支持 WebSocket、SSE、较长请求超时，并关闭 API/SSE 缓存。路由范围包括主域名、`*.apps.<DOMAIN>`、`*.preview.apps.<DOMAIN>`。Code 和 DB 使用主域名下的路径，不再要求额外子域名。公网 DNS 和公司认证由现有体系配置。

前端从 `/runtime-config.js` 读取业务域名和对外协议，后端同步使用相同配置。`DOMAIN` 只影响浏览器地址；PostgreSQL、Redis、Bifrost、Gotenberg、后端和代理之间均使用 Kubernetes Service DNS。`PUBLIC_SCHEME=http` 可用于具备 DNS 的 HTTP 测试环境。

没有域名时，平台、聊天、Code 和 DB 均可通过同一 NodePort 使用。浏览器访问 `/api/code/<环境UUID>/` 和 `/api/db/<环境UUID>/`，入口通过 `opsiforce-proxy-vscode:3003`、`opsiforce-proxy-db:3004` 回源；代理校验用户权限、租户和项目访问权，再连接该环境的动态 Pod。浏览器本身不直接访问 Kubernetes Service DNS。

Datasette 使用 `DB_VIEWER_BASE_URL=/api/db/<环境UUID>/` 生成资源和表链接；已有 Agent 需在任务空闲时重建 Pod 才能加载此进程参数。HTTP 下代码文件浏览和编辑可用，VS Code 的部分 Webview 扩展仍要求 HTTPS。App 的子域名预览需要实际 DNS，需要临时测试时：

```bash
bash deploy.sh expose local 环境UUID --node-ip 192.168.1.10
```

这些临时端口直接连接项目 Pod，不经过平台认证，Pod 更换后需重新执行。不要用于公网生产入口。

## Bifrost 渠道与模型

1. 在 Bifrost 配置渠道名称、协议、地址、启用的 Key 和模型。名称区分大小写。Key 的模型列表可显式填写自定义模型，`*` 使用 Bifrost 已发现的目录。
2. 平台每 30 秒自动同步。打开 Opsiforce 项目，使用聊天输入框旁唯一的模型选择器切换当前对话模型。
3. 平台管理员在 **Settings → Defaults → 平台默认模型** 配置默认值，也可在那里手动刷新渠道。此设置用于未单独选模型的对话；已有对话的主动选择保持不变。

真实渠道 Key 只存于 Bifrost；浏览器收到的只有渠道和模型名称，Agent 使用项目虚拟 Key。新项目及已有缺 Key 的项目会补建凭据，已有虚拟 Key 同步授权，不再引用固定渠道名单。模型目录和平台默认模型不再依赖镜像重建。

目前使用 Bifrost 的 OpenAI Chat Completions 接口统一转发，渠道需支持聊天、流式响应和工具调用。Bifrost 返回目录不代表上游推理一定成功。图像、语音、纯推理端点不属于 Agent 聊天目录。

模型规格从 Bifrost `/api/models/details` 分页读取，优先使用有效的 `context_length`、`max_input_tokens`、`max_output_tokens`，取消统一写死的 32768/4096。Bifrost 暂未提供 GLM 5.3 规格时，`glm-5.3` 和 `glm-5.3-flash` 按部署负责人提供的 1,000,000 token 上下文配置；这不代表已验证上游能处理完整 1M 输入。

其他未知模型不写 `limit`，继承当前 OpenCode 的 200,000 上下文和 32,000 输出预留默认值。上下文是 Agent 决定何时压缩历史所需的本地规格，无法通过省略请求参数自动探测。输出预留也不同于请求参数：此集成不额外设置 `max_tokens`，实际默认输出长度由上游决定。聊天显示折叠的思考、工具执行和压缩记录，避免把这些过程全部隐藏为 Working。

Bifrost 的 `source_of_truth: split` 保留未变更的配置项在后台的修改；文件配置内容改变仍可能在重启时覆盖对应项。部署不要删除 Bifrost 数据库或 `.state/local/secrets.env`。

## 中文支持

内嵌 OpenCode 支持简体和繁体中文，可依据浏览器语言加载，也可在其语言设置中切换。Agent 可接收中文提示词，中文回答能力取决于所选模型。Opsiforce 外层导航、项目管理和管理页面尚未全面国际化；本次新增模型设置提供中文文案。

模板位于 `k8s/`，渲染文件位于 `.generated/local/`。`.state/local/` 保存随机密钥，升级必须复用，不能重新生成数据库密码。

详细检查、镜像构建、集群恢复及真实对话结果见 [验证记录](VALIDATION.md)。

## 当前虚拟机工作流与 HTTPS 影响

### 安装测试入口控制器

40 的集群已存在 IngressRoute CRD；控制器通过 `install-ingress.sh` 安装为 Traefik DaemonSet。版本固定为 Helm Chart 41.5.0 / Traefik v3.7.13。配置在 `traefik/values.yaml`，无域名的 HTTP 路由在 `traefik/opsiforce-http.yaml`，不需要 `--node-ip`。

首次将官方镜像同步到现有内网仓库，然后在项目根目录执行：

```bash
docker pull traefik:v3.7.13
docker tag traefik:v3.7.13 sealos.hub:5000/opsiforce/traefik:v3.7.13
docker push sealos.hub:5000/opsiforce/traefik:v3.7.13
bash deploy/install-ingress.sh
```

控制器使用节点的 80/443 端口，现有 `30080` 和 `38080` 保留；未配置证书时只使用 HTTP 80，不强制 HTTPS。HTTP IngressRoute 按路径 `/` 转发到 `opsiforce-edge:8080`，再沿用现有平台路由。该入口继承当前测试身份配置，正式公开管理平台前需要接入公司认证。

这一步安装的是入口，不会让 `*.localtest.me` 自动指向虚拟机，也没有安装原 Helm 方案的 OIDC 插件。当前 App 预览仍使用独立主机名；实现纯 IP 下的自动预览还需适配应用路径、资源地址和 Vite HMR。开发预览无需发布：应用开发服务启动并写入 `app/app.meta.json` 后，平台显示预览窗口；Production 发布是后续独立步骤。

### 日常构建与 HTTPS

本地修改并提交到 `origin/main`；虚拟机在 `/root/opsiforce` 执行 `git pull --ff-only`，再使用该目录下的脚本构建、部署。此前 `/root/opsiforce-model-sync` 是修复验证用的副本，不是后续日常构建目录。Git 拉取和镜像构建/推送本身不会更新正在运行的 Kubernetes 工作负载。

当前 `http://12.2.40.40:30080` 已验证文字聊天、模型选择、Code 文件读取和 DB 查询。访问远程 IP 的 HTTP 页面时，以下功能受浏览器安全上下文限制：Code 的 Webview 扩展页面（例如部分 Markdown/Notebook 预览）、调用 Clipboard API 的复制按钮、麦克风/摄像头采集。HTTPS 能满足这一必要条件，但扩展、权限和业务配置仍需各自满足。参考 [code-server FAQ](https://coder.com/docs/code-server/FAQ)、[Clipboard API](https://developer.mozilla.org/en-US/docs/Web/API/Clipboard_API)、[getUserMedia](https://developer.mozilla.org/en-US/docs/Web/API/MediaDevices/getUserMedia)。

后续可在公司 CDN/反向代理终止 HTTPS，集群内继续使用 HTTP 和 Service DNS。HTTPS 主站中的 iframe 和 WebSocket 也必须使用相容的 HTTPS/WSS 地址，避免混合内容。增加 HTTPS 不要求搬迁数据库或项目文件。

注意区分 HTTPS 与重新部署的影响：当前运行环境经过定向更新，保留了手动配置。仓库的全量部署模板仍将 Bifrost Service 定义为 ClusterIP，直接重跑 `deploy` 会覆盖手动开放的 `38080`；模板的默认租户/权限映射也不等同于当前集群的全部配置。全量发布前应先渲染并核对这些差异，复用 `/root/opsiforce/deploy/.state/local/secrets.env`；当前 HTTP 环境需明确设置 `PUBLIC_SCHEME=http`。本轮代码推送不执行这一步。

## 中文渠道接入

40 测试环境的 Bifrost 提供中文快速添加渠道、模型能力模板和目录自动创建。操作与独立构建部署方法见 [Bifrost 渠道指南](../docs/operations/bifrost-channels-zh.md)。
