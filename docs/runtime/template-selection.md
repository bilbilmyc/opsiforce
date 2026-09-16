# 项目模板选择与 Agent 指令：阶段 1c

2026-09-16。本阶段把独立 FastAPI/Go 后端配方接入已有的项目创建流程，保留项目的 `agentId`，无需数据库结构迁移。

## 创建入口

新建菜单及首页模板选择器显示后端 `/api/agents` 返回的可用项。默认 App Builder 保持原有入口；两个新增实验项明确说明只包含后端和 SQLite：

| 构建配置 | 配方 | 创建时的实际内容 |
| --- | --- | --- |
| `app-builder-python` / Python · FastAPI | `fastapi@1` | Python venv、FastAPI 源码、锁文件、SQLite、专属指令 |
| `app-builder-go` / Go · net/http | `go@1` | Go 源码、go.mod/go.sum、纯 Go SQLite、专属指令 |

`agent-config/agents.json` 将构建配置绑定到版本化配方。镜像构建时 `compose-runtime-agents.mjs` 复用运行器的模板目录生成 `/opt/agents/<name>/template/app`，不在两处维护同一份源码。Pod 原有初始化流程按项目 agentId 解析 AGENT_NAME，复制选定模板、建立 Git 基线；重启已有工作区不会再覆盖 app。

此处的“构建配置”复用现有 Agent 选择协议，是过渡接入方式。未来前后端组合仍由配方组合生成，不为每种组合复制源码；它不是全新的通用多服务运行器。首页不根据自然语言猜模板，技术栈由显式选择确定。原 App Builder 指令新增技术栈核对，遇到不同框架请求要先说明当前模板，不能自行替换框架后宣称完成。

## 指令和技能

`runtime/instructions/backend.md` 维护共享的平台约定，fastapi.md/go.md 提供语言专属检查。构建时组合成对应 Agent 的 agent.md。新配置只包含明确列出的共享技能，避免把 NestJS、React 数据请求和 Node SQLite 的开发指令带入 Python/Go 项目。旧配置未指定 sharedSkills 时保持原来的技能合并行为。

工作区同步发现已有 app 的清单与选定 Agent 配方不一致时明确失败并保留源码，不自动迁移或替换技术栈。切换配方版本需要显式迁移；不能直接修改已有 Agent 名称绑定的 recipe 来强行升级旧项目。

`opsiforce-runtime restart` 使用本地 agent-control 的认证接口重启受守护的应用，检查确实找到进程，并最多等待 120 秒直至 `/api/health` 返回 `status:ok`。错误区分控制端不可用、未找到守护进程与应用未恢复；不打印控制凭据。指令要求 Agent 修改源码、依赖或配置后使用这一入口，而不是启动重复服务。

默认 FastAPI 锁文件的 wheel 包随新镜像预下载。只有锁文件哈希和 Python 版本匹配时使用离线安装；自定义锁文件或不同 Python 版本仍从包源安装。这样默认新项目无需等待集群内访问包源，同时不会把旧缓存误用到已修改的依赖声明上。

后端根路径根据 Accept 返回内容：浏览器得到内置 API 说明页，API 客户端仍得到原 JSON；响应使用 Vary: Accept，公开欢迎语经过 HTML 转义。它不是 React/Vue 业务前端。此适配解决了 Chrome 嵌入预览直接加载 JSON 文档时被阻止的问题。

## 部署顺序与开关

首先构建并推送包含 0.10.3 功能的 Agent 镜像，再更新后端和前端。验收新镜像后启用：

```bash
ENABLED_PROJECT_RECIPES=fastapi@1,go@1 bash deploy/deploy.sh deploy --tag <一致的发布版本>
```

Helm 使用 `config.enabledProjectRecipes: "fastapi@1,go@1"`。默认空字符串：新选项隐藏，后端也拒绝直接通过 agentId 创建、复制或导入未开启的模板项目。单独开启 `fastapi@1` 可分阶段上线 Python。关闭开关只限制新项目操作，不迁移或删除已有项目。

新配置 `poolSize:0`，避免一启用就额外预热多组 Pod。已存在的默认 Agent 及私有配置保持原有创建行为。禁用模板时保留 Agent 数据库记录，已有项目关联不会丢失。

仅更新前端或后端不足以提供模板：旧镜像没有生成后的 Agent 配置及配方目录。开关是部署者对实际镜像能力的显式确认，不根据任意镜像标签猜能力；设置前须完成下面的验收。

## 验收

- 运行器、重启入口、模板组合、技能隔离、工作区同步与配方冲突：`node --test agent-config/runtime/test/*.test.mjs`。
- 后端创建门禁与兼容性：`cd backend && yarn exec tsx --test test/project-templates.test.ts`。
- 两个真实后端与 `/restart-app`：隔离镜像中执行 `runtime/test/backend-smoke.py`。
- 默认 Python 离线初始化：隔离镜像 `--network=none` 执行 smoke 的 `--recipe fastapi`。
- Kubernetes 验证真实 init-config、Git 基线、`.opencode` 中的主 Agent、应用健康及重启；之后经平台 API 创建、预览和发布独立测试项目。

源码/fixture 测试不等于模型生成验收；重启服务也不等于发布任务成功。上线记录须分别写明实际完成的验证，见本文件后续记录。

## 40 实际上线与验收记录

已部署并启用 `fastapi@1,go@1`。镜像前缀为 `sealos.hub:5000/opsiforce/`：

| 组件 | 镜像标签 |
| --- | --- |
| opsiforce-agent | templates-v1-20260916-3 |
| opsiforce-backend | templates-v1-20260916-2 |
| opsiforce-frontend | templates-v1-20260916-5 |

本轮使用当前已部署镜像作为基底，叠加本地构建产物、运行配方和工具链形成候选镜像；没有执行两份正式 Agent Dockerfile 的完整重构建。实际验证平台是 Linux amd64；arm64 和其他发行环境尚未验收，配方继续标记 experimental。

- 本地及 Linux 非 root 运行器/模板组合测试 22/22；后端测试 28 通过、1 个既有平台相关测试跳过；前端状态连接回归与语言测试 7/7。前后端构建通过。前端全量类型检查仍有原有诊断，与修复前的 434 行基线完全一致。
- 两个独立 Kubernetes Pod 使用平台真实 init-config 生成正确清单和初始 Git 提交；健康检查、运行入口和认证重启命令通过，随后清理。
- 两个实际项目由首页选择器创建，绑定正确 Agent ID。真实 `glm-5.3-flash` 模型分别在 FastAPI 和 Go 中增加 `/api/template-check`，实际请求确认技术栈，未替换成 NestJS。Python 对话中实测编译、pip check、平台重启和 HTTP 验证。
- 两个项目经平台发布队列首次发布、再次发布均完成；真实公开应用 URL 返回正确语言与配置。再次发布后生产的 `canary-prod-keep` 行保留，开发的 `canary-dev-only` 行没有进入生产。HTML 预览也通过。
- 浏览器同时打开三个新版本标签，首页模板选择可用，Python/Go 文件页显示真实 app 目录，预览显示后端说明页。多标签卡顿修复见 [HTTP 状态连接](../operations/http-status-connections.md)。

临时项目（包括其生产环境）已通过平台删除；没有修改原有业务项目的源码或技术栈。构建、推送、隔离测试、Kubernetes 检查和发布作业证据保存在 40 的 `/root/opsiforce/deploy/.state/template-selection-20260916/`。

该目录的 `backend-before.json`、`frontend-before.json`、`config-before.json` 是变更前配置备份。回退时应协调前后端与配置，不应让依赖快照接口的新前端长期对接旧后端。仅关闭实验配方时，清空 ENABLED_PROJECT_RECIPES 并重启后端即可；已有项目和数据继续保留。

下一阶段逐项接入 Vue/React 前端组合与相应路由、构建和专属指令；Next.js 单独适配，Java 保持后置。
