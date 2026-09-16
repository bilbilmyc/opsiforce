# 多技术栈模板与统一运行约定

状态：分步实施，2026-09-16。已完成 [阶段 1a：启动清单与旧入口兼容](../runtime/project-runtime.md) 的代码和隔离验证，未切换业务 Pod。其余是规划；Next.js、Vue、Go、Rust、Java 模板尚未实现或通过发布验收。文件页修复独立交付，见 [项目文件](../operations/project-files.md)。

## 目标与当前问题

用户指定 React、Vue、Next.js 或 Python、Go、Rust、Java 时，项目必须保留这个选择。工具安装成功不等于平台支持；一个正式模板必须同时支持文件浏览、开发、重启、生产构建、发布和持久化。

当前 App Builder 的 agent.md 直接指定 React 页面、NestJS 模块和 Yarn；template/app/startup.sh 固定启动两个 Yarn 进程；entrypoint.sh 固定打开 app/data/app.db；发布写入 app/opsiforce.env.json。新项目没有独立的技术栈选择。因此不应通过换一个默认框架、堆装语言或重写平台解决。

## 首批范围：覆盖主流开发者

用户确认目标是让不同开发者保留熟悉的技术选择，覆盖主流即可。实现顺序按覆盖需求和维护成本安排，不按语言热度排名，也不承诺任意组合自动获得完整平台支持。

| 范围 | 首批正式适配目标 | 后续扩展 |
| --- | --- | --- |
| 前端 | React + Vite、Vue + Vite | Angular；其他框架走自定义接入 |
| 全栈/SSR | Next.js | Nuxt |
| JS/TS 后端 | 兼容现有 NestJS，解除强制默认，不作为首批扩展重点 | Express、Fastify 项目按通用运行约定接入 |
| Python 后端 | FastAPI | Django、Flask |
| Java 后端 | 不纳入首批 | Spring Boot，随后按需扩展其他 JVM 框架 |
| Go 后端 | Go HTTP 服务基线 | Gin 等适配配方 |
| 其他语言 | 首批预留统一接入协议 | ASP.NET Core、Laravel、Rust/Axum |

用户进一步确认：首批重点是 Python、Go，Java 放在后面。首批新增组合由 React/Vue 前端适配与 Python/Go 后端适配复用生成，并提供 Next 全栈和纯前端配方；现有 NestJS 保持兼容。它们的组合要逐项验收，不复制维护多套独立脚手架。Java、Rust、.NET/PHP 纳入后续覆盖范围，不能把“当前没预装”当“永远不支持”。

面向开发者的入口分两条：

1. 新建项目：自动选择或显式选择配方；界面展示实际选择，用户明确指定的栈不能被替换。
2. 已有项目：先检查依赖、lockfile、工作目录、现有启动命令，生成可审阅的运行清单；不覆盖源码，不统一替换包管理器。基本导入能力随运行协议建设，复杂组合保持 experimental。

默认 UI 只展示已验收的常用配方；“自定义项目”暴露安装、构建、启动、端口与数据目录这些必要配置。复杂度由平台消化，不要求开发者先掌握平台内部目录和控制进程。

## 设计：组合能力，发布经过验证的配方

区分四种对象：

| 对象 | 内容 | 示例 |
| --- | --- | --- |
| 运行工具配置 | 固定版本的编译器、包管理器、镜像摘要、缓存规则 | Node；Node + Python；Node + Go；Node + Rust；Node + JDK |
| 前端/后端适配 | 源码骨架、启动命令、构建输出、健康检查、专属 Agent 指令 | Vue/Vite、React/Vite、Next.js、FastAPI、Go HTTP、Axum、Spring Boot |
| 项目配方 | 可组合的适配、路由、数据库、认证和资源默认值 | vue-fastapi、react-go、next-fullstack、next-python |
| 项目运行清单 | 已选版本、目录、服务、任务、持久化和路由的实例配置 | app/opsiforce.project.json；版本 1 目前只支持启动脚本 |

前后端共享一个组合协议，但不能把理论笛卡尔积全部标成“已支持”。注册表记录每个配方的 planned / experimental / verified / legacy 状态，以及最后通过的模板版本、镜像摘要、架构和验收记录。

React/Vue 是前端选项，Next.js 是基于 React 的全栈框架；不能把 Vue + Next.js 当普通组合。未来 Vue SSR 应单独增加 Nuxt 适配，而不是改造 Next.js。

| 前端选择 | 无独立后端 | Python | Go | Rust | Java |
| --- | --- | --- | --- | --- | --- |
| React + Vite | 静态站点 | FastAPI | HTTP 服务 | Axum | Spring Boot |
| Vue + Vite | 静态站点 | FastAPI | HTTP 服务 | Axum | Spring Boot |
| Next.js | Next 全栈，含自身 API | Next + Python 服务 | Next + Go 服务 | Next + Rust 服务 | Next + Java 服务 |

表格表示拟支持的组合，不是现有功能清单。先实现一种后端框架作为各语言的维护基线；Django、Flask、Gin、Actix、Quarkus 等后续用同一协议扩展。已有 NestJS 模板保留为 legacy，不能批量迁移业务代码。

## 技术栈选择与 Agent 指令

优先级：已有项目清单 > 新项目明确选择/用户明确指定 > 组织默认配方。已有项目遇到用户明确要求换栈时，创建迁移任务并列出影响，不能直接套新模板覆盖。

新项目在生成业务代码前确定配方，并将名称展示在项目中。需求明确 Next.js 时不必重复询问；没有正式支持时说明缺少的适配，可进入明确标记的实验流程，禁止自行替换成 React + NestJS。

Agent 通用指令只保留需求实现、验证和平台约定；框架目录、命令、组件库、数据请求模式由选定适配注入。清单与 Agent 可用技能读取同一注册表，去掉通用指令里的 home.tsx、NestJS、必须 Yarn 等固定要求。

添加运行检查：依赖清单、实际启动进程与所选配方一致。它能发现 Next.js 项目只有 Vite/NestJS 的明显偏差，但不能用包名检查替代功能验收。

## 清单最小约定

使用带 schemaVersion 的 JSON，执行前严格校验，迁移清单版本时保留备份。已实现的版本 1 只有 startup 脚本约定，见运行入口文档。以下是未来扩展版设计示例，不是当前可运行配置，版本号及字段待适配验证后确定：

```json
{
  "schemaVersion": 2,
  "recipe": { "id": "vue-fastapi", "version": "1" },
  "runtimeProfile": "node-python",
  "sourceRoots": ["app"],
  "services": {
    "web": {
      "cwd": "app/frontend",
      "dev": ["npm", "run", "dev", "--", "--host", "0.0.0.0", "--port", "3000"],
      "build": ["npm", "run", "build"],
      "artifact": "app/frontend/dist",
      "productionMode": "static",
      "readiness": { "path": "/", "port": 3000 }
    },
    "api": {
      "cwd": "app/backend",
      "dev": ["uv", "run", "--frozen", "uvicorn", "main:app", "--host", "0.0.0.0", "--port", "3100", "--reload"],
      "start": ["uv", "run", "--frozen", "uvicorn", "main:app", "--host", "0.0.0.0", "--port", "3100"],
      "readiness": { "path": "/health", "port": 3100 }
    }
  },
  "routes": [{ "prefix": "/api", "service": "api", "stripPrefix": true }],
  "persistentDirectories": ["app/data"],
  "database": { "kind": "sqlite", "path": "app/data/app.db" }
}
```

正式 Schema 还需定义 install/check/migrate 任务、超时、退出码、进程依赖、环境变量声明、端口冲突校验、缓存和资源请求。命令使用参数数组；需要 shell 时只运行版本管理中的脚本，不拼接用户文字。工作目录和持久化路径必须在项目内，镜像配置不能授权宿主机挂载或特权容器。

### 运行方式

- 保留外部统一应用入口，初期兼容现有 APP_PORT=3000；内部服务数量和端口由配方配置。控制进程管理服务组，终止时处理全部子进程，崩溃重试有退避和上限。
- Vue/React SPA 开发使用 Vite；生产交给统一静态服务，支持 history fallback、资源缓存和 API 转发，不用 Vite 开发服务器承载生产。
- Next.js 自身负责页面、SSR 和自身 API；生产执行经过验证的 Next 构建/启动方式，不能作为普通 SPA 导出替代全栈运行。
- Next.js + 独立后端时显式分配路由。例如 Next 保留 /api，独立后端使用 /backend-api；也可由 Next 在服务端代理。禁止平台一律抢占 /api 转给另一个服务。
- 浏览器尽量使用同源路由；开发和生产的路径、前缀剥离规则必须一致，并测试 WebSocket、SSE、HMR 和流式响应。
- 背景 worker 是无公开端口的服务，可依赖 API/队列，但不默认纳入页面 readiness；健康检查须按关键服务定义。
- app.meta.json 继续承载名称与描述；逐步由平台适配提供应用元信息，避免每个框架被迫重写平台接口。

### 工具、依赖与镜像

初期复用公共 Agent 基础镜像，叠加语言工具配置；Node 留在需要前端构建的配置中。不要让每个 Pod 同时背负 JDK、Rust 编译器和所有依赖。镜像由平台构建、固定摘要，Agent 容器不需要宿主 Docker socket。

| 类型 | 开发/构建工具 | 依赖与生产要求 |
| --- | --- | --- |
| JS/TS | Node + 项目选定的 npm/pnpm/Yarn | 尊重现有 lockfile；一次选定包管理器；冻结安装失败明确报错 |
| Python | Python + uv 或项目既定工具 | 锁定依赖；每项目独立环境；虚拟环境可重建，不复制开发虚拟环境到生产 |
| Go | Go 工具链 | go.mod/go.sum；声明 CGO、系统库与目标架构，不能统一强制 CGO_ENABLED=0 |
| Rust | 固定 Rust toolchain + Cargo | 提交应用 Cargo.lock；声明系统库、链接方式；独立配置构建缓存和资源 |
| Java | 固定 JDK + Maven/Gradle wrapper | 固定构建工具和依赖版本；区分 JDK 构建与 JRE 运行；显式配置内存 |

包缓存按工具链、锁文件、架构隔离，可删除重建，不能依赖容器内一次临时安装。系统依赖进入工具配置版本。禁止生产启动时自动退回解锁依赖安装；当前 `yarn install --immutable || yarn install` 应在运行层改造时移除。

### 数据与配置

- 源码、依赖缓存、编译产物、业务数据分别声明。Files 的展示规则不作为发布打包规则；Git ignore 也不能充当数据隔离的唯一保障。
- 初期继续兼容 app/data，已有 app/opsiforce.env.json 通过各语言配置适配读取；敏感值不写入可版本管理的项目清单，不进入浏览器包。
- 新机制可统一生成环境变量，但必须区分构建时公开变量和运行时私密变量，并兼容现有发布变量编辑器。
- SQLite 适合单实例测试；PostgreSQL 等外部数据库通过资源绑定提供。模板声明数据库类型，数据库页按能力展示，不能对所有项目固定打开 app.db。
- 发布不复制开发数据库和上传内容。生产升级保留数据，迁移单独执行并记录结果。源码回滚不等于数据库回滚；只接受明确兼容的迁移策略，破坏性迁移单独处理。

## 发布流程与故障定位

目标流程：确定源码版本 → 安装锁定依赖 → check/test → build → 构建产物验证 → 启动候选版本 → 执行受控迁移 → readiness 与关键请求检查 → 切换流量。

不要把“进程活着”或“写了 app.meta.json”当发布成功。当前发布会重建环境 Pod；先保留兼容路径，候选构建和切流能力单独实现、单独验收，不能宣称现状已无停机。

诊断接口返回结构化阶段、服务名、结果、错误代码、可重试性和脱敏日志片段；区分目录不可读、依赖安装失败、构建失败、端口冲突、启动失败、数据库迁移失败、健康检查失败。用户看到“后端启动失败及原因”，Agent 读取相同结果处理，避免靠人工逐层猜测。

## 实施顺序与验收

2026-09-16 进度：阶段 1a 已实现版本 1 启动清单及旧入口兼容；阶段 1b 新增独立 FastAPI/Go 实验模板，阶段 1c 接入选择入口和专属 Agent 指令，详见 [模板选择](../runtime/template-selection.md)。前端组合尚未接入，不能视为下表阶段 2 已完成。

| 阶段 | 交付 | 完成条件 |
| --- | --- | --- |
| 0 | Files 通用目录规则 | app 与根目录旧源码可见；私密路径和删除保护；读取错误可见；真实项目浏览验收 |
| 1 | 清单 Schema、注册表、运行器、legacy 适配与基本项目导入 | 已有 NestJS 与已接入 FastAPI 项目不被覆盖；服务启停、日志、配置、存储协议测试通过 |
| 2 | Next 全栈、Vue/React + FastAPI、Vue/React + Go | 完成首批重点；单服务全栈与双服务组合通过完整生命周期、编译、依赖与数据保留验收；指定栈不被替换 |
| 3 | Next + Python/Go 独立后端；现有 NestJS 适配收尾 | 明确路由归属；复用首批适配；存量项目保持兼容 |
| 4 | Java/Spring Boot、Nuxt、Angular | 按实际开发者需求扩展；工具镜像、资源、SSR 与路由验收通过 |
| 5 | ASP.NET Core、Laravel、Rust 及其他定制项目 | 工具镜像、资源与系统依赖验收；未认证组合标为 experimental，不冒充正式支持 |

每个 verified 配方必须验证：空项目创建、Files 源码与配置预览、API 与页面、开发修改、进程崩溃恢复、Pod 重建、休眠恢复、首次发布、再次发布保留生产数据、开发/生产隔离、失败发布的恢复方式。建立按组合执行的 CI；适配改动触发所有引用它的已认证配方，不能只测一个示例。

现有项目没有清单时标记为 legacy，读取原 startup.sh，不推断后就强制改造。只对新建空项目应用模板；后续升级采用带版本与冲突检查的显式迁移。第 1 阶段之前不修改旧 Agent 的框架指令，以免指令先放开、运行能力还没跟上。

## 参考依据

- [Next.js 自托管](https://nextjs.org/docs/app/guides/self-hosting)：Node 服务、反向代理和流式响应需要运行支持。
- [Vue Quick Start](https://vuejs.org/guide/quick-start)：官方脚手架采用 Vite，前端仍需 Node 构建工具。
- [FastAPI 容器部署](https://fastapi.tiangolo.com/deployment/docker/)：应用进程与容器运行生命周期需一起配置。
- [Spring Boot OCI 构建](https://docs.spring.io/spring-boot/maven-plugin/build-image.html)：Java 有自己的构建/运行镜像流程，适配可选择 jar 或 OCI 产物，不要求在 Agent 中启动 Docker。
- [Stack Overflow 2025 技术调查](https://survey.stackoverflow.co/2025/technology)：作为跨生态需求的参考之一，不据此推断本站用户比例，也不以受喜爱程度替代使用需求。

以上引用用于框架事实；清单、注册表、阶段顺序和适配协议是本项目的设计建议。
