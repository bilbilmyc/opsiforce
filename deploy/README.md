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

阿里云镜像需要认证时，也先执行 `docker login registry.cn-beijing.aliyuncs.com`。脚本构建 4 个项目镜像，拉取 5 个第三方运行镜像，将全部 9 个镜像推送到内网仓库。默认平台是 `linux/amd64`。

## Linux 构建并推送

在能够联网的 Linux 构建机上，进入完整项目的 `deploy` 目录：

```bash
docker login sealos.hub:5000
bash deploy.sh sync
bash deploy.sh build
```

`sync` 同步 5 个第三方运行镜像，已同步时可跳过。`build` 构建并推送 4 个项目镜像。构建机只需要 Docker，不要求安装 Node、Go 或 kubectl。

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

Windows 构建命令默认直接推送；需要 tar 时添加一个参数：

```powershell
# 仅导出，不推送
powershell -ExecutionPolicy Bypass -File .\deploy\build.ps1 -Mode export

# 同时推送和导出
powershell -ExecutionPolicy Bypass -File .\deploy\build.ps1 -Mode both
```

输出为 `deploy/images.tar`，包含全部 9 个运行所需镜像。仅导出模式下，将它与 `deploy` 目录一起复制到具有 Docker 的内网机器，在该目录执行以下命令，再执行前面的部署命令：

```bash
docker login sealos.hub:5000
bash deploy.sh import
```

`import` 导入镜像、重新打标签并推送到内网仓库。Windows 已直接推送成功时，不需要执行这一步。

## 需要时再改的配置

- 仓库：Windows 使用 `-Registry 主机:端口/命名空间`；Linux 使用 `--registry 主机:端口/命名空间`，构建和部署保持一致。
- 镜像版本：默认 `local`。Windows 可用 `-Tag v2`；Linux 构建、导入和部署都使用 `TAG=v2 bash deploy.sh ...`。
- 架构：Windows 可用 `-Platform linux/arm64`；Linux 可用 `PLATFORM=linux/arm64`，基础镜像也必须支持该架构。
- 模型 Key：`OPENAI_API_KEY`、`ANTHROPIC_API_KEY` 可以留空，之后再配置。没有有效模型时，AI 对话和代码生成不可用。国内模型还需要配置供应商地址和模型名。
- 构建下载源：npm / Yarn 使用 npmmirror，apk / apt / pip 使用清华源，Go 使用 goproxy.cn。GitHub、SheetJS 和 code-server 等直链仍需要构建机能访问外网。

## 保留原项目的预览限制

前端继续使用原项目的 `VITE_*` 构建配置，Dockerfile 默认采用 `frontend/local-envs.sh` 中的测试值。这些值影响项目 App、VS Code、数据库界面的子域名链接；平台主页面和 API 通过 IP + NodePort 访问。没有增加前端运行时配置，也没有改写产品路由。

无域名时，内嵌链接不会自动适配 NodePort。需要测试项目中的 App / VS Code / DB 时，先在平台打开项目，再在 `deploy` 目录执行：

```bash
kubectl -n opsiforce get pods -l app=opsiforce-agent -L opsiforce.io/environment-id
bash deploy.sh expose local 环境UUID --node-ip 192.168.1.10
```

使用输出的独立 NodePort 地址访问。这些临时测试端口直接连接项目 Pod，不经过平台登录和代理；项目休眠后需在平台唤醒，Pod 更换后重新执行 `expose`。

YAML 模板位于 `k8s/`，展开后的文件位于 `.generated/local/`。`.state/local/` 保存随机密钥和证书，重复部署时不要删除。这里只说明测试用法，生产接入留待后续处理。
