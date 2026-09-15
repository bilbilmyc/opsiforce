# 2026-09-15：模型能力统一由 Bifrost 管理

## 本次部署与迁移

- 后端：`sealos.hub:5000/opsiforce/opsiforce-backend:bifrost-ownership-20260915-1`，digest `sha256:f350b87ddd335dc261a0f140c9ad0b495b7e920d3f7f5335a56b4ee94f279d19`。
- 前端：`sealos.hub:5000/opsiforce/opsiforce-frontend:bifrost-ownership-20260915-1`，digest `sha256:ef1bdc763f10cfc06219b67f63d4b03c966f8ae0ec0ebb2c035c023e7b5f437e`。
- Agent 沿用此前已验证的 `model-policy-20260915-4`，本次未修改运行时。
- Bifrost `Zai` 的 10 个模型目录记录可在界面编辑属性；仅迁移已有依据的 GLM 5.3 / Flash 两个能力档案，其余保持未知。
- `0063` 迁移 Job 成功；新表只保留 `outputBudget`、`reasoningEffort`、`reasoningBudget`，旧能力表留作回滚。
- 原部署资源、Opsiforce 和 Bifrost 全库备份：40 的 `/root/opsiforce/deploy/.state/bifrost-ownership-20260915/`。

## 自动化与构建

14 个后端测试通过，包括跨渠道隔离、Bifrost 属性优先级、旧本地能力字段不生效、无效属性阻断、运行策略拒绝能力写入及 Agent 配置传递。后端 TypeScript 构建通过；后端和前端完整镜像构建、推送、Deployment rollout 均成功。

前端根目录 `tsc --noEmit` 仍受 vendored OpenCode 的模块解析错误影响，不能声称全量类型检查通过；本次设置组件无报错，已由完整 Vite 镜像构建和浏览器实际操作验证。

## 真实环境验收

1. 在 Bifrost 浏览器页面把 GLM 5.3 的 `opsiforce.context` 临时降为 900000，保存成功。未点击 Opsiforce 刷新按钮，API 和现有工作区配置自动变为 900000；运行预算仍为 32768。随后在 Bifrost 恢复 1000000并读回。
2. Opsiforce 设置页只读显示模型事实及来源，链接直达 Bifrost 的 Models 页；运行预算可以单独改为 24576，保存后渠道/模型选择保持原值。Bifrost 的能力属性未被运行策略保存覆盖。
3. 真实 Agent 使用 `Zai/glm-5.3#high` 读取 `/workspace/data/model-policy-smoke.txt`，回复“Bifrost 联动验收通过，读到的文件内容为：MODEL_POLICY_OK”。Session outcome 为 succeeded；浏览器刷新后保留最终文本和“本轮已完成”。
4. Bifrost 两条真实日志分别为 `tool_calls` 和 `stop`，均记录 `max_completion_tokens=24576`、`reasoning.effort=high`，证明本轮采用独立运行预算并保留对话强度选择。
5. `PUT /api/models/capabilities` 返回 400 并指向 Bifrost；给 `/api/models/runtime-policy` 提交 `context` 也返回 400。
6. 两个 GLM 的上下文最终均为 1000000、模型输出上限 131072、运行预算恢复 32768。平台默认仍是 Flash；已发布月报站点返回 HTTP 200，现有 Agent Pods 健康。

## 限制与回滚

Bifrost v2 对缺少 pricing/catalog 记录的自定义渠道仍需运行通用准备脚本，之后可在管理页维护；尚未改为自动创建。数字来自已确认的官方规格，不代表当前中转渠道的最大窗口经过压力测试。真实上游验收仅覆盖当前 GLM 渠道，多渠道行为另由隔离测试覆盖。

回滚应用时恢复上一个 backend/frontend 镜像即可重新读取原能力表；不必还原整个业务数据库。Bifrost 新增属性和目录行可以保留。若需恢复其元数据，请按备份针对受影响行处理，避免覆盖升级后产生的日志或其他管理员配置。

---

## 以下为此前的 Agent 对话状态修复验收记录

# 模型能力改造验收记录

日期：2026-09-15。环境：40 虚拟机上的 `opsiforce` 测试命名空间。

## 自动化验证

| 范围 | 结果 |
| --- | --- |
| 后端模型能力、目录、Bifrost 资源与授权 | 10 项通过 |
| 运行时预算、工具流、历史压缩、续接、取消等相关回归 | 205 项通过 |
| OpenAI 兼容协议字段与原生供应商协议回归 | 27 项通过 |
| 聊天结束状态 | 3 项通过 |
| 后端构建、前端构建、运行时与聊天 UI 的 TypeScript 检查 | 通过 |

增加的用例覆盖不同渠道相同模型的独立额度、未知能力拒绝、计算预算进入真实请求字段、残缺工具参数不执行、续接不重复执行已完成工具、连续截断的两次上限、终止状态优先于先前答复。截断和未知能力错误持久化均做过移除修复后的失败对照。

## 真实上游与浏览器

独立项目：[Model policy smoke test 验收](http://12.2.40.40/projects/39165061-e95e-4f73-a9b5-5ae105b995c5)。

- GLM-5.3-Flash：真实 Shell 写入 `/workspace/data/model-policy-smoke.txt`，再次读取得到 `MODEL_POLICY_OK`，最终答复“验收完成”；浏览器显示“本轮已完成”。
- Bifrost 日志确认输出预算 32768、思考强度 max；工具请求和最终回答均携带预算。网关日志规范化字段为 `max_completion_tokens`、`reasoning.effort`。
- GLM-5.3：测试预算 2048，三个实际请求分别输出 2048 token，均返回 `length`；记录两个续接消息，最终 SQLite `idle_outcome=failed`，页面明确显示任务尚未完成。测试后恢复正常预算 32768。
- 64 token 的极小预算被当前渠道拒绝，要求思考模型输出额度大于 1024；错误正常显示，未当作完成。
- 点击停止后 `idle_outcome=interrupted`，助手错误类型 `aborted`，页面显示“本轮已停止”；未继续续接。
- 老看板对话的 12 条投影消息仍保留，Chrome 刷新后可查看原需求与原截断结果；生产站点 HTTP 200，开发预览仍显示原看板。

## 范围与限制

真实上游验证使用当前已配置的 `Zai` 渠道及 GLM-5.3 / GLM-5.3-Flash；其他渠道由回归测试覆盖，未假称已经验证其他供应商的真实账号。其余未提供能力元数据的型号保持“能力待补齐”。

输入 token 采用带余量的估算；没有做百万 token 极限、原生多模态或所有供应商原生思考参数的完整测试。`separate` 的预留量用于上下文计算，不等于设置供应商原生 thinking budget。

## 构建与备份

后端和前端镜像在 40 上从源码完整构建。Agent 先用编译二进制叠加现有镜像做隔离验收，再执行完整 Agent Dockerfile 构建，固定 Bun 1.4.2。

最终镜像（仓库 `sealos.hub:5000/opsiforce`）：

- `opsiforce-backend:model-policy-20260915-1`
- `opsiforce-frontend:model-policy-20260915-4`
- `opsiforce-agent:model-policy-20260915-4`

Agent 为完整 Dockerfile 构建的镜像，CLI 版本 `0.0.0-opsiforce-model-policy-2`。四个运行中 Agent 均通过健康检查。

最终版本再次验证：未知能力型号产生持久化的 `model.capability` 助手错误，刷新仍显示补齐能力的中文提示。随后切换 GLM-5.3 / high 并刷新目录，选择保持不变；真实读取工具与最终答复成功，Bifrost 确认两次请求均为 32768 / high，最终状态 succeeded。

升级前备份：`/root/opsiforce/deploy/.state/model-policy-20260915/`。包含资源清单、数据库导出、工作区配置和 SQLite 备份。自定义 CLI 版本显式设置 `OPENCODE_DISABLE_CHANNEL_DB=true`，继续打开原 `opencode.db`。仅新建的验收项目曾使用独立数据库，该项目的测试历史已安全复制回原文件名；其他项目没有搬迁历史数据。
