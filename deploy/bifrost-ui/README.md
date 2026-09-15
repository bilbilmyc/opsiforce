# Bifrost 中文模型配置界面

本目录基于 maximhq/bifrost 的 `ae2e1905d6afb1320f7bd74d3557dc31ddd062cc` 构建管理界面。`overlay/ui` 包含中文模型表单、默认模板、校验、模型列表及相关入口的修改。上游许可证见 `UPSTREAM-LICENSE`。

## 使用

在 Bifrost 的「模型 → 模型管理 → 模型配置」中点击模型行右侧的编辑按钮。

- 初次配置已经填好所有基础项，直接调整开关并保存即可。
- 上下文和回答长度有快捷选项；清空并离开输入框时恢复该模型的默认值。
- 「恢复默认配置」优先使用 Bifrost 提供的规格，再用对应模型模板补齐，未识别模型使用通用初始配置。
- 「复制为模板」后打开同一页面内的其他模型，点击「应用已复制的模板」。复制内容在当前页面内保留，刷新页面后清除。
- 已有渠道的实际配置优先于模板，不会在打开表单时被覆盖。高级设置折叠显示，其他自定义属性保存时保留。
- 中文化范围是本次新增的模型能力配置、模板、校验、模型管理入口、Opsiforce 运行策略和聊天思考强度选项。Bifrost 的其他业务模块沿用原界面。

| 配置 | 通用初始值 | GLM 5.3 | GLM 5.3 Flash |
| --- | --- | --- | --- |
| 上下文总容量 | 131072 | 1000000 | 1000000 |
| 最大回答长度 | 65536 | 131072 | 131072 |
| 工具调用 / 流式输出 | 开启 | 开启 | 开启 |
| 图片输入 | 关闭 | 关闭 | 开启 |
| 思考配置 | 关闭 | 共用额度，低/高/最高 | 共用额度，低/高/最高 |

通用初始值用于方便填写，不代表系统自动探测了渠道能力。模型模板的能力依据记录在备注中；渠道限制不同时可以修改。关闭思考配置表示不再发送额外的思考强度参数，模型内部是否仍进行推理取决于上游模型。独立思考模式仍需在 Opsiforce 设置思考预留长度。

## 构建

```bash
bash deploy/bifrost-ui/build.sh model-defaults-20260915-1
```

首次下载完整上游源码，缓存保存在 `deploy/.state/bifrost-ui/`。此后复用下载和镜像构建缓存。构建执行上游 Vite 构建和 TypeScript 检查。升级上游版本时应重新检查覆盖文件和 API 兼容性。

管理界面使用独立的 Nginx 容器；网关目录修复镜像通过 `gateway/build.sh` 单独构建，业务数据库继续使用原部署。所有管理 API、认证、Cookie 和推理请求转发至 `opsiforce-bifrost:8080`；静态页面单独提供。集群内部模型调用继续直接使用原网关 Service。

`console.yaml` 为 40 测试环境清单。首次切换先部署 Deployment 并等待就绪，再将原 `opsiforce-bifrost` Service 从 NodePort 改为 ClusterIP，移除它的 `nodePort: 38080`，随后创建控制台 Service 使用 38080。不要同时让两个 Service 占用同一 NodePort。更新控制台时直接 apply 清单即可。

配合 `gateway/` 中的目录修复镜像，新渠道首次保存模型能力时自动创建目录行，不需要手动初始化。使用旧网关镜像时仍需运行旧准备脚本。新增渠道的完整步骤见 [中文渠道指南](../../docs/operations/bifrost-channels-zh.md)。

## 校验

```bash
BIFROST_SOURCE=/path/to/bifrost node --experimental-strip-types --test deploy/bifrost-ui/model-capabilities.test.mjs
```

浏览器验收使用实际管理页面，覆盖默认值、留空回填、开关、中文错误提示、复制模板、保存与读回。修改表单后应验证窄屏下提示消息不会挡住底部按钮。

## 回滚

旧 Deployment/Service/ConfigMap 和两个数据库备份位于 40 的 `deploy/.state/model-form-zh-20260915/`。回滚 UI 时先释放控制台 Service 的 38080，再将原网关 Service 恢复为 NodePort 38080；不需要恢复数据库，也不影响已保存的模型能力。
