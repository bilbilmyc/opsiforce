# 项目运行入口：阶段 1a

2026-09-16。本阶段完成启动清单、配方状态注册、只读预检和旧脚本入口适配。它还不是完整的多服务运行器，也不表示 Python、Go、Next.js 模板已交付。

## 已实现

- `agent-config/runtime/recipes.json`：区分 legacy、experimental、planned。当前只允许 `legacy-startup@1` 和 `custom-startup@1`；Next、React/Vue + FastAPI/Go 只登记为 planned，选择时明确拒绝，不替换成其他模板。
- `app/opsiforce.project.json`：版本化启动清单，JSON Schema 在 `agent-config/runtime/project.schema.json`。严格拒绝未知字段、未知版本、错误类型和超过 64 KiB 的内容。运行时直接解释该 Schema 使用的小型约束子集，测试约束其可用关键词，尚未引入外部安装依赖。
- `opsiforce-runtime inspect`：读取和验证，输出实际脚本、工作目录、配方与状态。不安装包、不创建清单、不改源文件，不启动应用。
- `opsiforce-runtime run`：检查后直接替换进程，执行已有的可执行脚本；继承环境、标准输入输出、退出码和信号。路径按工作区校验，拒绝越界、不可执行文件、FIFO 和损坏清单。
- 镜像入口改为 `guard webapp opsiforce-runtime run`，两个 Agent Dockerfile 同时安装运行入口；Agent 源码版本递增至 0.10.1。

清单不存在才使用旧 `app/startup.sh`，工作目录保持工作区根目录。清单存在但坏了会报错，不能假装没有清单再启动旧模板。没有清单的 FastAPI 项目也只标记为 legacy-startup，不根据旧 NestJS 模板猜测其实际框架。

## 当前可用的清单

以下清单只选择启动脚本。该脚本负责当前阶段的开发/生产分支、依赖、构建和服务管理：

```json
{
  "schemaVersion": 1,
  "recipe": { "id": "custom-startup", "version": "1" },
  "startup": {
    "script": "app/startup.sh",
    "cwd": "."
  }
}
```

路径相对工作区而非清单目录。脚本可位于已有项目目录，例如 `existing-api/platform-startup.sh`；必须可执行，并具有正确 shebang。脚本名含空格也可用，不经 shell 拼接。

继承 `OPSIFORCE_ENV`、`APP_PORT` 等现有变量，不在清单内放密钥。旧项目无需添加这份清单。首期不对现有 startup.sh 做任何模板迁移。

本地只读检查和镜像内命令：

```bash
WORKSPACE=/path/to/workspace node agent-config/runtime/cli.mjs inspect
node agent-config/runtime/cli.mjs recipes
# 新 Agent 镜像内
opsiforce-runtime inspect
```

`inspect` 的成功只证明清单和脚本入口可用，不证明工具链、端口、应用健康、发布或数据库迁移正常。planned 配方尚不可运行。

## 兼容约定与边界

当前启动脚本仍需使用 `guard app-backend` / `guard app-frontend` 管理应用进程，平台 `/restart-app` 按这些名称定位。新入口使用 Node 的 [process.execve](https://nodejs.org/docs/latest-v24.x/api/process.html#processexecvefile-args-env) 替换自身，不插入一层需要单独转发信号的常驻父进程；实际 Linux 镜像已测试 PID 和信号保留。

仍沿用 APP_PORT、`/api/app-meta`、app/data、app.meta.json 和现有数据库查看器。没有改变 Agent 提示词、项目创建页面、默认模板或全量发布机制。清单不是安全沙箱：应用脚本仍以现有容器权限执行；路径检查只保护清单的入口约定。

未来的 services/routes/install/build 清单需演进 Schema，不能让版本 1 静默接受未实现字段。错误返回脱敏 JSON：`stage=startup-config`、稳定的 `code` 和简短原因，不回显坏 JSON 或环境变量。

## 验证与部署状态

```bash
node --test agent-config/runtime/test/project-runtime.test.mjs
bash -n agent-config/scripts/entrypoint.sh
```

本地与候选镜像内非 root Linux 测试均为 14/14 通过。测试包含默认脚本只读兼容、显式清单、空格路径、版本/字段拒绝、planned 拒绝、坏 JSON/null/超大文件、符号链接与越界、执行权限、退出码、开发/生产变量、PID 与终止信号、真实 HTTP 服务两次启动后保留数据、非普通文件不阻塞。

40 上构建隔离测试镜像 `opsiforce-agent:runtime-stage1-20260916`，基于当前 Agent 镜像摘要，仅增加入口和运行配置文件。构建与非 root Linux 测试记录保存在 `/root/opsiforce/deploy/.state/runtime-stage1-20260916/`。这是候选镜像，没有更改集群默认 Agent 镜像或重建业务 Pod；两份正式 Dockerfile 的完整重构建尚未执行。

对教室管理开发环境、FastAPI 开发与生产环境进行了只读 inspect，核对启动脚本前后 SHA-256 不变。预检使用容器临时目录，结束后删除临时工具；没有执行其启动脚本或改写工作区。

HTTP 测试使用隔离的 Node 服务夹具，不能冒充 FastAPI/Go 或整个平台发布验收。已有应用这次只做入口预检，未做新入口下的真实发布/重启；上线前仍需要独立 canary 项目完成这些检查。

## 下一步

只推进一个 Python/FastAPI 配方：补齐工具链和锁定依赖、应用元信息与健康接口、开发/生产启动，使用独立测试项目验证创建、预览、重启和首次/再次发布。通过后再适配 Go 和前端组合，避免同时引入多个框架后无法归因。

完整方向见 [多技术栈设计](../design/multi-stack-templates.md)。阶段 1 的多服务、统一诊断、配置和数据库适配仍待后续分步完成。
