# 统一 App Builder 与内部技术栈适配

用户只创建一个 App Builder，用自然语言说明需求和技术栈。Node.js、Python、Go 同处一个基础环境，框架依赖按项目安装。内部脚手架/运行适配不再暴露为 Python、Go 等独立产品入口。

## 新项目

默认模板仅有受校验的 `.opsiforce-bootstrap` 标记和通用 `.gitignore`。后台启动器等待初始化，不启动 NestJS、Vite 或空转重启。Agent 先核对请求和源码，再内部执行 `opsiforce-runtime init <recipe>@1`：

- fastapi、go：复用已经验证的 Python/Go 后端源码、依赖锁、数据库与重启逻辑。
- react-nest：保留旧 React/Vite + NestJS 脚手架，按需使用。
- custom-startup：提供通用启动契约，供 Next.js 或其他 Node 框架实现；Agent 最后原子写入 run-app.sh 才启动。它不是已经完整验收的 Next.js 模板。

初始化只接受不存在的 app，或平台原样的空白工作区。后者允许保留 app/data 与 opsiforce.env.json；有编辑、新增源码或目录符号链接就拒绝覆盖。复制采用排他写入；只有全部成功才移除等待标记。复制中断后保留现场供检查，不自动删除或强制重试。并发初始化由独占锁串行保护。

完成初始化后，同一 manifest、启动脚本、文件页、预览、发布和持久化流程继续生效。Python/Go 后端可以在同一项目添加 Vue/React；Next.js 用自己的路由和生产服务。必须逐项目验证前后端代理、构建、重启与发布，不能把安装了语言工具链等同于所有组合已验收。

## 现有项目与兼容

现有 app 不会因更新 Agent 指令而重新生成。原 React/Nest 工作流移到按需读取的兼容指南；统一指令按真实源码加载 Python、Go 或 Node 指南。已有独立 Python/Go Agent 注册项保留以维持项目关联和工作区同步，但标记 hidden，目录列表和新建接口即使开启旧 ENABLED_PROJECT_RECIPES 也不再暴露它们。私有业务 Agent 保留原有逻辑。

首页移除技术模板选择器，侧栏只展示可创建的 Agent。框架选择不需要用户另外创建项目。后续 Vue/React/Next.js 适配在这个入口内部逐步扩展，Java、Rust 后置。

## 部署与验证

需要包含运行器/指令版本 0.11.0 的 Agent 镜像，并更新后端隐藏策略及前端入口。先验证候选镜像，再切换 AGENT_CONTAINER_IMAGE 与前后端；运行中的已有业务 Pod 不做技术栈迁移。

- `node --test agent-config/runtime/test/*.test.mjs`：初始化、源码/数据保护、等待后激活、旧项目与历史 Agent 同步。
- `cd backend && yarn exec tsx --test test/project-templates.test.ts`：隐藏历史记录并拒绝新建，保留项目解析。
- `runtime/test/backend-smoke.py`：同一默认工作区分别初始化 Python/Go 后做 HTTP、SQLite、重启、配置和源码发布边界验证。
- 平台验收需另行记录真实创建、文件页、模型选择技术栈和发布；单元测试不等于这些检查。

## 聚合入口本轮验收（2026-09-16）

40 上 Agent、后端、前端均部署 `unified-v1-20260916-1`（镜像前缀 `sealos.hub:5000/opsiforce/`）。候选镜像基于上一轮镜像叠加本轮源码/构建产物；没有重建两份正式 Agent Dockerfile 的完整依赖层。实际验证 Linux amd64，arm64 尚未验证。

- 运行器测试 28/28；后端 28 通过、1 个既有平台测试跳过；前端状态流和 i18n 测试 7/7；前后端构建通过。
- Linux 候选镜像初始化/组合测试 12/12。默认聚合工作区分别初始化 Python、Go 后，HTTP、SQLite、认证重启、配置重载、源码归档排除开发数据与重复部署保留生产数据均通过；Python 全程在无网络容器内使用预缓存 wheel。
- 真实浏览器首页无技术栈选择器，`/api/agents` 仅返回 App Builder。普通 Python 需求由默认 `app-builder` 和真实 `glm-5.3-flash` 完成：自行初始化 fastapi@1、编译检查、pip check、重启、验证接口与 SQLite 持久化。没有使用独立 Python Agent。
- 该临时项目 Files 中 app 源码可见、依赖及数据库被过滤，HTML 预览正常。真实平台发布作业完成，生产公开 URL 返回正确 Python 接口、独立环境配置，且未包含开发 SQLite 测试行。
- 临时项目及其发布环境在验收后删除。没有修改已有业务项目的源码或技术栈。

证据保存在 40 的 `/root/opsiforce/deploy/.state/unified-builder-20260916/`，包括构建/推送日志、容器 smoke 结果和实际发布结果。配置快照为受限权限的 `*-before.json`。

本轮完成统一入口和初始化基础。Next.js 与 Vue/React + Python/Go 的通用接入指南已经提供，但这些完整组合尚未完成本轮模型生成、生产构建和发布验收；后续在同一入口内部逐项补齐，不再增加语言 Agent。

## 历史记录：拆分入口阶段（已被统一入口设计替代）

此前部署并启用 `fastapi@1,go@1`。镜像前缀为 `sealos.hub:5000/opsiforce/`：

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
