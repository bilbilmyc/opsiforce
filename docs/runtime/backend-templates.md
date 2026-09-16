# Python / Go 后端模板：阶段 1b

2026-09-16。首批新增 `fastapi@1`、`go@1`，注册状态为 **experimental**。本阶段交付可以初始化、运行和验证的后端骨架；尚未接入创建页面、按模板生成的 Agent 指令或 React/Vue 前端组合。现有 App Builder 默认仍是 React + NestJS，不能仅在聊天中指定 Python/Go 就声称平台已切换模板。

## 初始化

需要包含 runtime 0.10.2 的新 Agent 镜像。工作区必须已经存在，且没有 `app`（包括空目录或符号链接）。命令明确要求配方版本，不根据项目名称或文件内容猜技术栈。

```bash
mkdir -p /tmp/python-workspace
WORKSPACE=/tmp/python-workspace opsiforce-runtime init fastapi@1
WORKSPACE=/tmp/python-workspace opsiforce-runtime inspect
WORKSPACE=/tmp/python-workspace opsiforce-runtime run

# Go 在另一个独立工作区，同样使用 inspect/run。
mkdir -p /tmp/go-workspace
WORKSPACE=/tmp/go-workspace opsiforce-runtime init go@1
```

仓库开发时以 `node agent-config/runtime/cli.mjs` 代替 `opsiforce-runtime`。`init` 只复制源码，不安装依赖或启动服务；`run` 需要 Agent 的 `guard`、`log-writer` 和相应工具链。已有项目返回 `APP_EXISTS`，没有 force 覆盖选项。IO 失败会留下可检查的部分文件，不递归删除工作区。

不要把这些命令直接用在已由旧 App Builder 初始化的业务项目上，也不要删除已有 app 目录来强行切换。后续项目创建流程需要在复制默认模板之前完成配方选择。

## 两种模板的共同约定

| 内容 | 约定 |
| --- | --- |
| 清单 | `app/opsiforce.project.json`，明确 recipe、version 和启动路径 |
| 入口 | `app/startup.sh` → `guard app-backend ./run-backend.sh` |
| 监听 | `0.0.0.0:${APP_PORT:-3000}`；单后端直接使用平台预览端口 |
| 源码 | `app/backend`；普通文件浏览规则可展示源码和依赖锁文件 |
| 健康 | `GET /api/health`，检查数据库连接 |
| 元信息 | `GET /api/app-meta`，实时读取 `app/app.meta.json`，只返回 exists/name/description |
| 用户配置 | 启动时读取 `app/opsiforce.env.json`，严格要求 JSON 字符串字典，不回显配置错误内容 |
| 数据 | `app/data/app.db`，兼容当前 SQLite 数据库查看器 |
| 最小业务 | `GET/POST /api/items`，参数化 SQL，名称 1–200 字符，列表最多 100 条 |
| 示例配置 | `APP_GREETING` 是公开的示例欢迎语；其他配置不会自动暴露到 HTTP |

不预先写 app.meta.json。服务可启动不等于业务功能已完成；调用方应在功能验收后创建名称和描述。元信息缺失、损坏或名称无效时返回 `exists:false`，不能泄露文件内其他字段。

用户配置由 Python 的 `setting()`、Go 的 `loadConfig()` 在服务端读取；文件值优先于同名进程环境变量。平台的 APP_PORT、APP_DATA_DIR、APP_META_PATH、APP_CONFIG_PATH 只从进程环境读取，用户配置不能意外覆盖平台路径/端口。坏配置会阻止服务启动，避免静默用默认值连接错误资源。

## Python / FastAPI

- 使用 Agent 现有 Python 3、venv、pip；候选镜像实测 Python 3.11.2。
- 独立 `backend/.venv`；`requirements.lock` 的直接与传递依赖均固定版本，沿用此前验证的 FastAPI 依赖集合。修改锁文件后安装、执行 pip check，成功才记录指纹。
- 开发和生产均运行 Uvicorn，均不启用 reload 文件监听。修改源码或平台配置后使用平台“重启应用”。后续前端组合再单独设计开发热更新。
- 使用 Python 标准库 sqlite3，连接按请求打开并关闭。

锁文件目前是版本固定，尚非带分发文件哈希的离线供应链锁定；首次安装需要包源。用户新增依赖需重新生成完整锁文件。

## Go / net/http

- 两份正式 Agent Dockerfile 都将现有构建阶段的 Go 1.26.2 工具链复制到最终镜像。候选镜像实测复制后的工具链能在 Debian 环境运行和编译。
- 标准库 net/http 提供路由；SQLite 使用固定版本的 [modernc.org/sqlite](https://pkg.go.dev/modernc.org/sqlite@v1.59.0)，go.mod/go.sum 纳入源代码。
- 每次启动执行 `GOTOOLCHAIN=local`、`go build -mod=readonly`，成功后才替换 `.bin/server`。依赖错误不修改 go.mod，不运行旧二进制冒充成功。
- 此配方使用纯 Go SQLite，因此明确 `CGO_ENABLED=0`；这不是所有未来 Go 项目的全局限制。需要 CGO 的项目要另行声明系统库/构建要求。
- 编译和模块缓存位于 `backend/.cache`，二进制位于 `.bin`，均不进入源码快照。

## 重启、发布和数据

启动脚本保留 `app-backend` 守护进程名。平台 agent-control 的 `/restart-app` 会终止其应用子进程，guard 自动拉起服务。Uvicorn 和 Go HTTP 服务可能在收到 TERM 后正常返回 0；run-backend.sh 保留一层信号处理，把平台终止转换为非零退出，确保 guard 不把此次重启当成永久停止。

两种模式使用相同启动入口，避免开发可启动而生产缺少入口。根目录和源码目录不对外提供静态文件，配置、数据库、源码路径请求返回 404。没有内建业务认证，访问控制仍依赖平台预览/发布策略，业务鉴权由项目实现。

`.gitignore` 排除 data、环境配置及其备份、venv、缓存、二进制。源码发布不能复制开发数据库；生产目录再次部署源码后保留原数据库。初始建表使用幂等 SQL，后续复杂表结构变更仍需项目采用版本化迁移，不提供自动推断或破坏性迁移。

## 验证方式与交付边界

```bash
node --test agent-config/runtime/test/*.test.mjs

# 仅在可丢弃的隔离 Agent 容器中执行，不能在业务工作区执行。
docker run --rm --cpus=2 --memory=3g --pids-limit=256 \
  --entrypoint python3 opsiforce-agent:runtime-backends-20260916 \
  /opt/opsiforce-runtime/test/backend-smoke.py
```

`backend-smoke.py` 创建临时工作区，安装真实依赖，访问真实 HTTP/SQLite，并启动镜像内实际 agent-control 验证 `/restart-app`。用 Git archive 模拟平台的源码隔离约定，分别检查开发数据不进入生产、再次解包后生产数据保留；它不是整个平台 Kubernetes 发布端到端验收。

本地与候选镜像内非 root 的运行入口/初始化测试均为 18/18 通过。真实服务测试按 FastAPI、Go 顺序执行，每种配方覆盖开发、首次生产源码部署和重复源码部署，并检查配置重载、坏配置拒绝、元信息更新、输入校验、敏感路径 404 和 SQLite quick_check。Go 还通过本地 go vet。未使用这些结果替代模型生成、Kubernetes 调度、域名预览和平台发布任务的端到端验收。

40 的候选镜像、构建和测试记录在 `/root/opsiforce/deploy/.state/runtime-backends-20260916/`。候选镜像基于上一阶段隔离镜像叠加工具链和源码，两份正式 Dockerfile 尚未执行完整重构建。未修改集群默认 Agent 镜像或业务 Pod；当前线上旧镜像不能使用新增 init 命令。

下一步先接入项目创建时的配方选择与对应 Agent 指令，完成独立测试项目的创建、预览、首次/再次发布验收；随后逐项组合 Vue/React 前端。Java 继续后置，不扩大本轮范围。
