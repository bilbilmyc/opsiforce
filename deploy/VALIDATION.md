# 验证记录

日期：2026-09-14。测试 namespace：`opsiforce`。发布标签：`model-sync-20260914.1`。

## 本地检查

- 后端 `yarn workspace @opsiforce/backend build` 通过。
- 四项回归测试通过：准确渠道名称与 Key 模型过滤、初始化容器接收目录、缺失 Key 自动补建、已有 Key 更新授权。
- 两项故障测试放回原版 BifrostService 后均失败，修改后的实现通过。
- 前端 Vite 生产构建通过。完整 TypeScript 检查未通过：内嵌 OpenCode 有模块声明问题，外层另有既有 `toolbar-button.tsx` 类型错误；不宣称全量类型检查通过。
- `bash -n deploy/deploy.sh` 通过；测试和生产 YAML 均成功渲染、解析，不传节点 IP。
- `git diff --check` 通过。

回归命令：

```bash
DATABASE_URL=postgres://localhost/unused yarn workspace @opsiforce/backend exec tsx --test test/bifrost.catalog.test.ts test/bifrost.service.test.ts
```

服务测试使用查询替身，不连接测试命令中的 PostgreSQL。

## 镜像与集群

- Linux/amd64 的后端、前端、Agent 镜像已构建并推送到 `sealos.hub:5000/opsiforce`。
- 运行时代理未修改代码，沿用已有镜像内容并统一发布标签。
- 部署沿用原有 `.state/local/secrets.env`，已核对与集群 Bifrost 密钥一致。
- 入口和应用资源通过 Kubernetes server dry-run。
- 数据库迁移执行成功；固定工作负载 rollout 成功。
- 现存失败项目 `b8772f7b-fc30-4990-a50c-de8c0afb71f1` 自动补建 chat Key，创建 Agent Pod，并恢复 active。
- 交接中的 `af8bc53b-d049-4c99-81a5-852f432d54f2` 在当前项目 API 中已不可见，未将其作为恢复成功的证据。
- 首次恢复时记录过一条并发 Agent 升级任务失败；新 Pod 的初始化随后完成，工作区版本为 `0.2.1`，模型及对话验证通过。历史失败记录未人为改成成功。

## 模型及页面

- 首轮仅检查了 Bifrost `/api/models` 的默认第一页（5 条），错误地认为目录未包含 `glm-5.3-flash`。后续检查确认总数为 221，Zai 实际有 10 个模型，包括 `glm-5.3-flash`；见下方分页修复记录。
- 临时虚拟 Key 调用 `Zai/glm-5` 返回「中文连接正常」，随后删除临时 Key。
- 在独立 OpenCode 实例加载动态配置成功，修改配置后新增模型热加载成功；测试目录和进程已清理。
- 在实际 Opsiforce 页面将平台默认设为 `Zai/glm-5`，保存成功并同步到 Agent。
- 真实页面发送中文测试提示词，Agent 返回「模型联动正常，中文可用」，用时约 4 秒。
- 自定义模型缺失发布日期时，不再以 1970 年日期进入旧模型过滤。最终页面选择器已显示 Zai 的全部五个 GLM 模型，实际切换到 `glm-4.7` 后又恢复为 `glm-5`。

## 首轮尚未验证（后续进展见下文）

- 公司 CDN、真实业务域名、证书、登录认证和生产外部 PG/Redis 未接入或验证。
- 未实测其他供应商、GLM 5.3 Flash、多模态和所有模型的工具调用。
- 首轮曾对未知模型统一配置 32768/4096；此配置造成过早压缩，已在后续修复中移除。

测试入口：`http://12.2.40.40:30080`。集群内回源：`http://opsiforce-edge:8080`。

## 后续修复：完整读取 Bifrost 模型分页

用户截图指出 Bifrost Model Catalog 已有 `glm-5.3-flash`，而 Opsiforce 只显示到 `glm-5`。根因是后端只请求 `/api/models`，忽略 `total: 221`，把默认返回的 5 条误认为完整目录。

已改为显式使用 `limit=100`，按实际返回条数递增 `offset`，一直读取到总数；异常分页不会作为完整结果缓存。真实接口读取三页，分别为 100、100、21 条，Zai 的 10 个模型均被读取。新增回归测试在旧实现上报 `5 !== 10`，修复后通过；后端编译及全部 5 项回归测试通过。

本次仅更新后端镜像 `model-pagination-20260914`，不重新应用部署 YAML，不修改用户手动设置的 Bifrost NodePort，也不修改模型默认值。

后端更新后，实际页面的默认模型下拉框和聊天模型选择器均显示全部 10 个 Zai 模型，包括 `glm-5.3-flash`。Bifrost NodePort 保持 `38080`，平台入口保持 `30080`，平台默认值保持 `Zai/glm-5`。

使用现有 Agent 的项目虚拟 Key 真实请求 `Zai/glm-5.3-flash`，返回 HTTP 200、模型名 `glm-5.3-flash`、文本「GLM Flash 连接正常」及 `finish_reason: stop`。第一次输出限额 128 token 时没有最终文本；提高测试限额至 1024 后正常完成，共使用 378 token。本次未改变平台默认模型。

## 后续修正：聊天页只保留一个模型选择器

原先将平台默认模型配置放在聊天页顶部，与输入框旁的当前对话模型选择器并列，造成两处选择不同步的误解。现已移除整个顶部配置条；聊天只保留输入框旁的模型选择器。平台默认值和手动刷新渠道移到 `Settings → Defaults → 平台默认模型`，并明确说明其适用范围，仅平台管理员可见。

本次仅更新前端镜像 `model-ui-20260914`。发布前平台默认值为 `Zai/glm-5.3-flash`；本次不修改模型默认值、当前对话选择、后端或 NodePort。

前端生产构建及 rollout 已通过。浏览器实测聊天页顶部配置条消失，只保留输入框旁模型选择；设置页显示「平台默认模型」且选中 `Zai/glm-5.3-flash`，确认原设置未改动。

## Code/DB、上下文与进度显示修复

本轮部署：后端 `runtime-access-20260914.1`，前端和 Agent `runtime-access-20260914`，Code/DB 代理 `runtime-access-20260914.1`。均已完成构建、推送和 rollout。仅更新相关工作负载与入口 ConfigMap 的路径规则，NodePort 保持平台 `30080`、Bifrost `38080`。

### Code 和 DB

- 原 Code/DB iframe 指向 `*.opsiforce.localtest.me`，解析到浏览器本机，项目 Pod 内服务正常。改为主站 `/api/code/<环境UUID>/`、`/api/db/<环境UUID>/`，Nginx 经 Kubernetes Service 名回源。
- 代理携带可信用户身份向后端验证标签权限、租户和项目访问权；授权缓存包含用户，避免同组不同用户复用授权。身份头不传给工具进程。
- 从集群内通过 `opsiforce-proxy-db:3004` 实测：缺少用户身份返回 401，缺少 DB 权限返回 403。
- Datasette 设置 `base_url`，代理剥离路径前缀并保留浏览器 Host。实测发现并修复了排序、JSON/CSV 导出和 facet 链接重复前缀/泄漏 Pod 地址的问题。
- 浏览器在用户项目 `cd9161a8-7784-4e73-8bd5-44345396129c` 的 Code 标签打开了真实的 `generated_files/hackernews_scraper.py`，中文代码注释和文件树正常；工作区文件读取通过编辑器连接完成。
- 同项目 DB 标签展示三个数据库，进入 `app/items` 显示 2 条数据。JSON、排序、日期 facet 和 CSS 请求均返回 200；HTML 链接无重复路径前缀、无内部 Pod 地址。
- 两个活跃项目经空闲确认后重建 Agent，加载新的 Datasette 参数；工作区文件和会话保留。重启过程中用户项目曾出现启动状态未收尾，重启后端恢复启动 worker 后恢复 active；未将这次操作视为并发重启机制的完整验证。
- 纯 HTTP 下 VS Code 仍提示部分 Webview/剪贴板功能要求安全上下文。核心代码页面、文件树和文件读取已验证；扩展 Webview 需通过 HTTPS 入口再验证。

### 模型上下文与流式响应

- 原统一 32768 上下文导致爬虫会话频繁压缩；该会话历史中实际找到 21 条 compaction 记录。原界面 quiet 模式又隐藏了思考、Shell 和通知，用户只能看到 Working。
- 模型目录改为分页读取 Bifrost `/api/models/details`，传递有效上下文/输入/输出规格。取消统一 32768/4096。Bifrost 当前未提供 GLM 5.3 规格，按部署负责人提供的 1M 上下文回退；其余未知模型继承当前 OpenCode 默认值。
- 实际 Agent 配置及热加载后的模型 API 均确认 `glm-5.3`、`glm-5.3-flash` 上下文为 1,000,000。输出预留由 OpenCode 默认成 32,000；源码确认这不是向上游设置的 `max_tokens`，无额外生成参数时该请求字段省略。
- 界面改用 compact 模式，显示折叠的 Thoughts、Shell、Notices。聊天页仍只有输入框旁一个模型选择器。
- 独立测试项目选中 `glm-5.3-flash`，执行只读 `pwd`，返回 `/workspace`，中文六条说明完成，用时 23 秒；页面保留说明、工具记录和最终回复。
- 第二次中文纯文本测试用时约 10 秒。通过平台 NodePort 的真实 SSE 收到 6 个 reasoning delta、40 个 text delta，文本分段持续 5.23 秒，最终收到 execution.succeeded。测试会话没有 compaction；测试未修改工作区文件。
- 未发送完整 1M 输入，因此上述结果只证明配置和实际短请求链路正常，不证明渠道的真实最大上下文容量。

### 检查

- 后端 7 项回归测试及 TypeScript 编译通过；测试涵盖模型分页、规格继承和工具访问权限。
- Go 代理 `go test ./...` 通过，包含路径、Query、公开 Host、用户授权缓存隔离。
- 前端生产构建通过；完整 TypeScript 检查仍沿用上文已记录的既有失败边界。
- Shell 语法检查、`git diff --check` 通过。

补充回归命令：

```bash
cd backend
DATABASE_URL=postgres://localhost/unused yarn exec tsx --test test/*.test.ts
cd ../proxy
go test ./...
```
