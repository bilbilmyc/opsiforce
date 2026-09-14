# 测试环境部署

只处理镜像构建、推送和 Kubernetes 部署，保留原产品代码。Windows 和 Linux 都支持构建，选择其中一台联网机器即可。

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
bash deploy.sh sync
bash deploy.sh build
```

`sync` 同步 5 个第三方运行镜像，已同步时可跳过。`build` 构建并推送 4 个项目镜像。构建机只需要 Docker，不要求安装 Node、Go 或 kubectl。

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
# 把示例 IP 改成浏览器能访问的 Kubernetes 节点 IP
bash deploy.sh deploy --node-ip 192.168.1.10

# 查看启动状态
kubectl -n opsiforce get pods
```

访问 **`https://192.168.1.10:30443`**。平台主入口不需要域名，使用固定测试用户。测试证书保存在 `.state/local/tls.crt`，浏览器需信任该证书。

部署按顺序创建基础资源、启动 PG / Redis、执行数据库迁移、启动应用；失败会停止。集群节点从内网仓库拉取镜像，无需访问外网下载构建依赖。私有仓库需要集群已有拉取凭据；可用 `IMAGE_PULL_SECRET=凭据名称 bash deploy.sh deploy --node-ip 节点IP` 指定 opsiforce 命名空间中已有的 Secret。

`local` 是默认测试环境，以上命令无需填写。构建不需要节点 IP，节点 IP 只在部署或临时访问时使用。

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

- 仓库：Windows 使用 `-Registry 主机:端口/命名空间`；Linux 使用 `--registry 主机:端口/命名空间`，构建和部署保持一致。
- 镜像版本：默认 `local`。Windows 可用 `-Tag v2`；Linux 构建、推送、导入和部署都使用 `--tag v2`，例如 `bash deploy.sh deploy --tag v2 --node-ip 节点IP`。兼容原有 `TAG=v2` 环境变量，命令行选项优先。
- 架构：Windows 可用 `-Platform linux/arm64`；Linux 可用 `PLATFORM=linux/arm64`，基础镜像也必须支持该架构。
- 模型 Key：`OPENAI_API_KEY`、`ANTHROPIC_API_KEY` 可以留空，之后再配置。没有有效模型时，AI 对话和代码生成不可用。国内模型还需要配置供应商地址和模型名。
- 构建下载源：npm / Yarn 使用 npmmirror，apk / apt / pip 使用清华源，Go 使用 goproxy.cn。OpenCode 单独使用官方 npm 源，因为国内源缺少固定版本的 Linux x64 平台包；GitHub、SheetJS 和 code-server 等直链也需要构建机能访问外网。

## code-server 下载失败时

Agent 需要安装 code-server。若构建日志在 `release-assets.githubusercontent.com` 报 TLS 连接错误，表示 GitHub 发布文件下载中断；不需要更换 Linux 或重新安装已经完成的依赖。

Dockerfile 会先读取 `deploy/packages/` 中的本地安装包，找不到时才联网下载，并进行有限重试。构建机无法访问 GitHub 下载域名时，在能访问的机器下载 [amd64 安装包](https://github.com/coder/code-server/releases/download/v4.117.0/code-server_4.117.0_amd64.deb) 或 [arm64 安装包](https://github.com/coder/code-server/releases/download/v4.117.0/code-server_4.117.0_arm64.deb)，然后复制到构建机项目的 `deploy/packages/` 目录，保留原文件名。

例如 amd64 构建使用 `deploy/packages/code-server_4.117.0_amd64.deb`。然后重跑原来的构建命令即可，不需要新参数。Windows 也支持相同方式。本地包和联网下载的包都会校验官方 SHA256；`.deb` 已加入 Git 忽略规则。校验来源为 [官方 v4.117.0 发布资产](https://api.github.com/repos/coder/code-server/releases/tags/v4.117.0)。

## 保留原项目的预览限制

前端继续使用原项目的 `VITE_*` 构建配置，Dockerfile 默认采用 `frontend/local-envs.sh` 中的测试值。这些值影响项目 App、VS Code、数据库界面的子域名链接；平台主页面和 API 通过 IP + NodePort 访问。没有增加前端运行时配置，也没有改写产品路由。

无域名时，内嵌链接不会自动适配 NodePort。需要测试项目中的 App / VS Code / DB 时，先在平台打开项目，再在 `deploy` 目录执行：

```bash
kubectl -n opsiforce get pods -l app=opsiforce-agent -L opsiforce.io/environment-id
bash deploy.sh expose local 环境UUID --node-ip 192.168.1.10
```

使用输出的独立 NodePort 地址访问。这些临时测试端口直接连接项目 Pod，不经过平台登录和代理；项目休眠后需在平台唤醒，Pod 更换后重新执行 `expose`。

YAML 模板位于 `k8s/`，展开后的文件位于 `.generated/local/`。`.state/local/` 保存随机密钥和证书，重复部署时不要删除。这里只说明测试用法，生产接入留待后续处理。
