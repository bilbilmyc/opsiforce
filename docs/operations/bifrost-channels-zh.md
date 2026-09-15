# 在 Bifrost 新增模型渠道

测试环境入口：[模型渠道](http://12.2.40.40:38080/workspace/providers)。普通用户使用「新增渠道 → 快速添加」即可。

## 新增渠道

1. 点击「新增渠道」，选择「快速添加（Kimi / MiniMax / DeepSeek / 中转）」。
2. 选择接入模板。官方模板会填写接口基础地址、渠道名称和一个示例模型；示例模型需要你的账号具备调用权限。
3. 填写 API 密钥。官方密钥与中转服务密钥应使用各自对应的接口地址。
4. 核对模型 ID，每行一个。这里填写渠道提供的准确名称，例如 `MiniMax-M2.7`；大小写和斜杠会保留。不要自行加上 Bifrost 渠道名称前缀。
5. 点击「创建渠道并配置模型」。系统依次创建渠道、保存暂未启用的密钥、保存模型能力，再按勾选状态启用密钥。
6. 到 [模型管理](http://12.2.40.40:38080/workspace/model-catalog?tab=attributes) 找到该渠道的模型，核对容量、工具调用、图片输入和思考模式。未知型号初始填写 128K 上下文、64K 最大输出，不代表已经检测过它的真实能力。
7. 在 [Opsiforce 默认设置](http://12.2.40.40/settings/defaults) 刷新模型目录，选择模型和运行策略，然后在测试对话里发送一个简单问题验证。正常情况下目录会自动同步，已有对话的模型选择不会被自动替换。

如果中途失败，页面会显示失败步骤。点击「继续完成配置」会保留已完成步骤；重新打开窗口后，可以在已经创建的渠道中继续编辑密钥和模型。保存成功表示配置写入成功，上游是否能正常调用还需发送真实请求验证。

## 官方模板与中转服务

| 选择 | 自动填写的接口基础地址 | 密钥来源 |
| --- | --- | --- |
| Kimi 官方（国内） | `https://api.moonshot.cn/v1` | Kimi 国内开放平台 |
| MiniMax 官方（国内） | `https://api.minimaxi.com/v1` | MiniMax 国内开放平台 |
| DeepSeek 官方 | `https://api.deepseek.com/v1` | DeepSeek 开放平台 |
| 其他渠道 / 中转服务 | 自己填写 | 对应中转服务 |

地址以服务商提供的文档为准。不要把 `/chat/completions` 加到基础地址末尾。不同地区和套餐的密钥可能需要不同地址；这时选择「其他渠道 / 中转服务」。

模板采用 OpenAI 兼容的 Chat Completions 协议，只启用对话和流式对话。模型列表直接使用你填写的 ID，不依赖上游一定实现 `/models`。需要 Azure、Bedrock、Anthropic 原生协议或内网自建上游时，使用高级渠道配置。

来源：[Kimi 快速开始](https://platform.kimi.com/docs/get-api-key)、[MiniMax OpenAI 兼容接口](https://platform.minimaxi.com/docs/api-reference/text-chat-openai)、[DeepSeek 接入文档](https://api-docs.deepseek.com/)。核对日期：2026-09-15。

## 常见问题

- **同一个服务加两个渠道**：使用不同名称，例如 `kimi-main` 和 `kimi-backup`。能力配置按「渠道 + 模型」隔离。
- **模型没有出现在 Opsiforce**：检查密钥是否启用、模型 ID 是否绑定、模型配置是否已保存，再刷新目录。
- **401 / 403**：检查密钥、账号权限，以及密钥是否属于当前接口地址。
- **404**：检查基础地址、模型 ID 和套餐接口。
- **思考开关关闭后模型仍思考**：关闭表示不额外发送思考强度设置，模型自身的默认行为由上游决定。
- **输出仍没有达到 64K**：64K 是模板中的能力上限，实际单次预算在 Opsiforce 运行策略里设置；上游也可能有更低限制。

## 开发与部署

中文界面保存在 `deploy/bifrost-ui/overlay/ui/`。网关目录修复保存在 `deploy/bifrost-ui/gateway/`，首次保存模型能力会自动补齐缺失的目录行，价格保持未知，不写入虚构费用。

网关固定使用正式标签 `transports/v2.0.0` 对应提交 `e4a30d6041c0446603aea615bc5da340dac001b1`；不要用同名的 `v2.0.0` 分支替代。已核对其 Bifrost 模块版本与原运行镜像一致。

40 主机上执行：

```bash
cd /root/opsiforce
bash deploy/bifrost-ui/build.sh channel-onboarding-20260915-3
bash deploy/bifrost-ui/gateway/build.sh catalog-onboarding-20260915-3
kubectl apply -f deploy/bifrost-ui/console.yaml
kubectl -n opsiforce set image deployment/opsiforce-bifrost bifrost=sealos.hub:5000/opsiforce/bifrost:catalog-onboarding-20260915-3
kubectl -n opsiforce rollout status deployment/opsiforce-bifrost-console
kubectl -n opsiforce rollout status deployment/opsiforce-bifrost
```

网关镜像内嵌的界面版本由 gateway/Dockerfile 中的控制台镜像决定。升级时一并更新该镜像引用。

旧版网关需要手动初始化目录；上述修复版本正常新增渠道不再需要运行 SQL 或迁移脚本。旧迁移脚本仅用于旧环境的数据迁移。

## 本次验收结果

- 12 项中文表单和模板测试、15 项后端目录和模型策略测试、196 项运行时回归、3 项对话完成状态测试通过。后端、Agent 核心、聊天 UI 类型检查通过；Bifrost 界面完整构建及 TypeScript 检查通过。
- 原网关上：创建临时渠道后，保存模型能力稳定返回 500（缺少 pricing row）。最终修复镜像中，同一测试返回 204，目录读回成功。回归入口：`deploy/bifrost-ui/gateway/onboarding-smoke.mjs`，在测试环境中向后端容器的 Node 标准输入传入脚本执行；脚本不打印管理员凭据。测试后需清理对应 `codex-onboarding-smoke` 目录行并刷新缓存。
- 真实浏览器：内网 HTTP 下正常打开向导；Kimi 模板自动填写地址和模型示例；完整 `/chat/completions` 地址会被中文校验阻止；模型保存失败后的重试不会重复创建密钥。
- 连续创建两个不同渠道成功，自动密钥名称带渠道前缀，不触发 Bifrost 的跨渠道唯一名称约束。
- 临时测试模型启用后，Opsiforce 同步读到 128K / 64K 能力并标记可用；默认模型不变。测试结束后渠道、密钥、目录行已清理，最终恢复原有 10 个可用模型，原模型属性逐项对比一致。
- 真实 Agent 经新网关读取 `/workspace/data/model-policy-smoke.txt`，最终回复「Bifrost 渠道调试通过：MODEL_POLICY_OK」，finish 为 stop，session outcome 为 succeeded。此真实调用使用现有 Zai / GLM-5.3 渠道；没有 Kimi、MiniMax、DeepSeek 的真实账号密钥，因此不宣称这三个官方渠道已完成真实调用测试。
- 匿名访问 Bifrost 管理 API 仍返回 401。
- 最终界面：`bifrost-console:channel-onboarding-20260915-3`，digest `sha256:0e9283169b1b135767d86c4808cb6b8cf5ebbc565f9096d87fe9cca884e61317`。
- 最终网关：`bifrost:catalog-onboarding-20260915-3`，digest `sha256:7e804b01444bdcf41db17c557b68708e6fe228a983631e3a9797bf7765855e3b`。
- 部署前资源与数据库备份：40 的 `/root/opsiforce/deploy/.state/channel-onboarding-20260915/`。

注意：名为 `v2.0.0` 的源码分支比当前正式发布标签旧，依赖不匹配的首次候选镜像未通过启动检查，已撤回，原 Pod 一直提供服务。最终镜像改用 `transports/v2.0.0` 正式发布提交及其锁定依赖，滚动更新成功，没有通过修改数据库字段来绕过兼容问题。
