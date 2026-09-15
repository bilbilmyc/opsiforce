# 中文模型模板验收（2026-09-15）

## 最终行为

Bifrost 模型能力由中文固定表单维护：容量、工具调用、流式输出、图片输入和思考配置。无需手动添加 `opsiforce.*` 键或输入布尔值。通用初始配置为 32K 上下文、8K 最大回答；GLM 5.3 / Flash 使用匹配模板。高级参数折叠，默认值、开关和容量快捷按钮均可直接操作。

Opsiforce 只读能力和运行策略中的布尔值、思考额度规则、强度及接口格式已中文化。聊天思考强度的显示名称中文化，底层协议 ID 保持原值。

## 已验证

- 15 项后端测试通过，覆盖能力解析、图片开关传递、关闭思考配置后忽略旧强度/预留策略、渠道隔离和现有同步逻辑。
- 6 项模板测试通过，覆盖通用默认值、按模型匹配模板、已配置值优先、中文错误、保留额外属性、复制时不带入其他属性。
- Bifrost UI 完整构建和 TypeScript 检查通过；Opsiforce 前后端镜像构建通过，嵌入聊天组件 `tsgo -b` 通过。
- 浏览器实测：最大回答长度超过上下文时阻止保存并显示中文提示；清空上下文后回填 32768；工具开关关闭后后端返回不可运行；恢复默认值后成功保存；复制模板可应用到另一个模型。
- 对 GLM 4.5 的临时开关测试结束后，已恢复测试前元数据。GLM 5.3 保留原 1000000 / 131072 配置。
- Flash 图片开关开启后，真实 Agent 接收 128×128 测试图片，正确回答“红色”，结束原因 stop，Session outcome succeeded。随后恢复验收对话的原模型 `Zai/glm-5.3#high`。
- 控制台 HTML 引用的实际脚本返回 200，未认证的管理 API 仍返回 401。Bifrost 内部 Service 保持直接通向原网关 Pod。

## 部署

- 控制台：`sealos.hub:5000/opsiforce/bifrost-console:model-form-zh-20260915-3`，digest `sha256:7c061eacf9126e673ac6a1f146562295783281aa8930b1d4254698ca7ecfaca0`。
- Opsiforce 前端：`sealos.hub:5000/opsiforce/opsiforce-frontend:model-form-zh-20260915-1`，digest `sha256:5f81244c48946a082c532369ea78f671fdb6c49cbb6292b4423450adab599959`。
- Opsiforce 后端最终版本为 `model-form-zh-20260915-2`，补齐了后端参数校验的中文名称，digest `sha256:95a2cbb4a659a63d58401e3b36b05378e7ec3e415de90f0d709ddb197255e5ba`。

使用说明、默认值和构建方式见 `deploy/bifrost-ui/README.md`。本次未进行所有上游模型的逐一推理或最大上下文压力测试。

## 2026-09-15 通用容量调整

- 通用表单初始值改为上下文 131072（128K）、最大回答 65536（64K），增加 64K 快捷选项。已有保存配置不做批量覆盖，Opsiforce 的单次输出预算独立设置。
- 恢复默认值优先保留 Bifrost 原生规格；原生信息不完整且上下文低于推定输出时，仅收缩推定输出，显式矛盾值仍交由中文表单校验处理。
- 读取顺序：此渠道已保存的配置 > Bifrost 原生规格 > 内置具体模型模板 > 通用初始值。通过 provider + model 隔离配置，不按渠道品牌猜测模型容量。
- 8 项模板测试通过，包含 Kimi、MiniMax、DeepSeek 和自定义渠道名称的测试数据。这些是配置逻辑测试，不代表上述渠道的真实 API 已接入或实测。
- 管理界面镜像：`sealos.hub:5000/opsiforce/bifrost-console:model-defaults-20260915-1`；构建包含 TypeScript 检查。上一版为 `model-form-zh-20260915-3`。
- 规格来源可以参考 [Kimi 模型列表](https://platform.kimi.ai/docs/models)、[MiniMax 模型概览](https://platform.minimax.io/docs/api-reference/api-overview)、[DeepSeek 模型规格](https://api-docs.deepseek.com/quick_start/pricing/)。官方信息不等于转发渠道的实际限制；本次没有把这些品牌下的所有型号写成统一模板。
- 40 上控制台滚动更新成功；浏览器验证 GLM 4.5 未配置表单显示 131072 / 65536，清空上下文后回填 131072，64K 按钮存在。取消测试后，GLM 5.3 Flash 已保存的 1000000 / 131072 仍保留；本次未保存或覆盖模型记录。
