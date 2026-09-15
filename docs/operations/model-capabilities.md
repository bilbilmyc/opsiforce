# 多渠道模型能力与对话结束状态

## 中文配置入口

模型能力现在使用中文固定表单和默认模板，不再要求手动填写属性键。常规使用请参见 `deploy/bifrost-ui/README.md`。下方属性约定供维护和接口集成参考。

## 配置分工

Bifrost 是渠道、模型目录及能力事实的管理入口；Opsiforce 展示这些事实，并运行 Agent、工具、压缩、续接、预览和发布。

- Bifrost：`模型 → 模型管理 → 模型配置 → 模型行的编辑按钮`。
- Opsiforce：`Settings → Defaults → 模型能力与运行策略`。能力只读；可修改每次输出预算、默认思考强度和独立思考预留。
- `provider + model` 精确匹配，区分大小写，不把 `Zai` 自动改成 `zai`。同名模型在不同渠道相互独立。
- Bifrost 的 `additional_attributes` 内 `opsiforce.*` 属性优先于其公共目录原生字段。Opsiforce 不再读取本地能力覆盖值，也不向 Bifrost 写配置。
- 旧 `model_capability_profiles` 仅留作回滚记录。运行策略存入新表 `model_runtime_policies`，旧能力写入接口返回明确的 400 提示。

### Bifrost 属性约定

Bifrost v2 的编辑接口只能写字符串属性，不能直接编辑原生能力字段。因此用以下属性补齐或覆盖某个渠道的实际能力。属性键区分大小写；数字、布尔值和数组的值必须是有效 JSON；其他值直接填写文本。删除属性表示恢复使用原生目录信息，不要填写空字符串。

| 属性键 | 值示例 | 含义 |
| --- | --- | --- |
| `opsiforce.context` | `1000000` | 上下文窗口 |
| `opsiforce.maxInput` | `900000` | 最大输入，可选；仅填有依据的限制 |
| `opsiforce.maxOutput` | `131072` | 模型/渠道最大输出 |
| `opsiforce.tools` | `true` | 是否支持工具调用 |
| `opsiforce.streaming` | `true` | 是否支持流式响应 |
| `opsiforce.reasoningAccounting` | `shared` | `shared` 共用输出额度；`separate` 独立思考额度；`none` 无独立思考；`unknown` 待确认 |
| `opsiforce.reasoningEfforts` | `["low","high","max"]` | 渠道支持的强度，不能包含界面保留值 `default` |
| `opsiforce.maxTokensField` | `max_tokens` | 可选值 `max_tokens` 或 `max_completion_tokens` |
| `opsiforce.source` | 官方文档地址及核验日期 | 能力依据 |

这些示例不是所有模型通用的数值。未提供的事实保持未知，格式错误会阻止该模型的 Agent 请求，不按模型名称猜测。当前文本 Agent 要求已知上下文、最大输出、工具、流式和思考额度规则。

运行预算默认最多 32768，受模型最大输出和剩余上下文约束；不属于模型能力。独立思考预留用于上下文计算，本身不设置供应商原生 thinking budget。额外原生参数仍需确认网关的转换支持。

### 管理页面链接

后端环境变量 `BIFROST_CONSOLE_URL` 指定浏览器可访问的 Bifrost 管理页；不要使用集群内部 Service DNS。部署脚本支持同名变量，未配置时隐藏链接，不猜测端口。40 测试环境当前为：

```bash
export BIFROST_CONSOLE_URL='http://12.2.40.40:38080/workspace/model-catalog?tab=attributes'
```

### 现有数据迁移和 Bifrost v2 限制

先备份 Opsiforce 和 Bifrost 数据库，再在能使用 kubectl 的集群管理机执行：

```bash
python3 deploy/scripts/migrate-bifrost-capabilities.py
```

脚本先检查已有属性冲突，再补齐旧配置所涉及渠道的目录记录，保持价格和未知能力为空，通过 Bifrost `PUT /api/models/catalog` 写入能力，最后读回验证。原属性全部保留；存在冲突时中止，不覆盖人工修改。

40 当前的目录修复版本会自动补齐记录，正常新增渠道请使用 [中文快速添加流程](bifrost-channels-zh.md)，无需运行命令。以下命令仅供仍使用旧版 Bifrost、保存属性报 `no pricing row` 的环境迁移使用：

```bash
python3 deploy/scripts/migrate-bifrost-capabilities.py --prepare-provider '实际渠道 ID'
```

这属于当前 Bifrost 版本的管理限制，尚未改成自动建记录。脚本面向本项目的 PostgreSQL 部署，可通过 `NAMESPACE`、`POSTGRES_POD`、`BACKEND_DEPLOYMENT` 指定集群资源。迁移能力读回成功后再部署包含 `0063_model-runtime-policies.sql` 的后端；该迁移只复制运行策略，原能力表不删除。

## 请求预算与同步

每次请求在系统提示、消息历史、工具定义合并后重新计算输出预算。当前使用 UTF-8 文本大小估算 token 并预留安全余量，不宣称等同于各模型的精确 tokenizer。输入超限时尝试已有的历史压缩机制；无法压缩则明确报错。多模态 token 的精确计量不在本次变更范围内，动态目录仍保持文本输入。

Bifrost 能力每 30 秒同步到现有工作区；Opsiforce 的“刷新渠道”可立即同步，保存运行策略也立即同步。当前模型和强度选择保持不变；已移除的选择会报告不可用，不自动改用其他渠道。

后端原子写入 `.opencode/opencode.json` 和 `.opsiforce/model-config.json`。后者供工作区升级时读取，避免旧 Pod 环境变量覆盖新配置。正在发送的请求继续使用原配置，后续请求采用更新后的配置。

## 截断与停止

`finish_reason=length` 不再视为任务完成。保留已生成的内容和已完成工具结果，最多追加两次续接请求。残缺的工具参数不会执行。达到续接上限时本轮失败并显示“任务尚未完成”。取消沿用运行时的中断机制，不继续自动续接。启用能力策略的 Agent 每轮另有 100 步执行上限。

聊天底部独立显示思考、工具执行、生成、续接、完成和未完成状态，不受思考块折叠影响。“本轮已完成”表示模型给出了正常结束的最终文本，不代表平台验证了模型所声称的业务结果。

## 构建与升级

首次安装对话结束状态修复时，必须同时升级 backend、frontend 和 agent；已有该修复的环境，本次能力归属迁移只需升级 backend、frontend。仅更新前端源代码不会改变 Pod 内实际运行的 CLI。

两个 Agent Dockerfile 均新增运行时构建阶段：固定 Bun 1.4.2，使用仓库内 OpenCode 源码和 bun.lock，编译 Linux 二进制并放到 `/usr/local/bin/opencode2`。镜像设置 `OPENCODE_DISABLE_CHANNEL_DB=true`，继续使用原来的 `opencode.db`，避免自定义版本号切换数据库导致旧对话看似消失。默认完整构建无需预置二进制，也不再依赖原 npm CLI 的未修复行为。

```bash
bash deploy/deploy.sh build local backend --tag <version>
bash deploy/deploy.sh build local frontend --tag <version>
bash deploy/deploy.sh build local agent --tag <version>
```

升级前保存数据库、工作区配置和 OpenCode SQLite 数据，以及当前 Deployment/ConfigMap。执行相应增量迁移，先补齐在用模型，再在独立项目验证新 Agent，随后更新空闲项目。旧版本数据库迁移表结构为增量新增，回滚代码可保留能力表；不要直接恢复整个业务数据库覆盖升级后的用户数据。

测试环境的内网 IP、Traefik 和 HTTP 域名配置应单独保留，更新镜像时不要用默认域名覆盖当前 ConfigMap。
