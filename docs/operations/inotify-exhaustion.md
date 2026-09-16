# 40 节点运行后页面卡住：inotify 实例额度耗尽

2026-09-16，用户报告运行一段时间后页面转圈、新 App Builder 无法使用、应用页面打不开。

## 现场与原因

- 40 整机负载约 0.7、可用内存约 33 GiB、根盘余量约 44 GiB。平台 `/`、`/api/health`、`/api/projects`、`/api/agents`、`/api/models` 的独立请求正常，非整机 CPU/内存耗尽或平台整体宕机。
- `opsiforce-agent-ed702821` 的 OpenCode 4106 和认证代理 4096 无法返回健康检查，页面停在连接中。应用 3000 曾正常返回，说明应用进程与 Agent 连接状态需要分开判断。
- 启动日志明确报 `couldn't initialize inotify: too many open files` 和 `EMFILE: too many open files, watch '/workspace/app/frontend/hmr-toggle.ts'`，Vite 进入崩溃重试。
- 宿主机 `fs.inotify.max_user_instances=128`。root 直接调用 `inotify_init1` 也失败，errno=24。`max_user_watches=375649`，采样监听引用约 1180，证据指向实例数上限而非监听路径数上限。
- 多个 root 容器与宿主机 root 进程共享 per-UID inotify 额度。项目启动/唤醒增加文件监听器，耗尽后会影响 OpenCode、开发服务器、Code 编辑器和应用状态监听；重建一个 Pod 不会扩大宿主机额度。

`/proc` 采样共约 131 个 inotify fd 引用（含不同 UID 和继承/重复引用），不能把它等同于精确的 root 实例数；系统调用失败与运行日志是确认依据。

## 已执行修复

只把 `fs.inotify.max_user_instances` 从 128 提升到 1024，保留原 watches 和 queued_events 值。持久化文件为 `/etc/sysctl.d/99-opsiforce-inotify.conf`；原值保存在 `/root/opsiforce/deploy/.state/inotify-20260916/sysctl-before.txt`。配置生效后，同一系统调用从 FAIL errno=24 变为 PASS。

已卡住的 OpenCode 没有自行恢复。在 `.opsiforce/recovery-inotify-20260916/` 用 SQLite backup 保存会话数据库和日志后，只终止卡住的 OpenCode，由现有 guard 重新启动。随后内部健康检查返回 healthy=true。排查中也观察到平台因代理失败自动重建该 Pod；因此必须用 Pod UID 和创建时间判断重建，不能把 RESTARTS=0 解释为从未重启。

本次问题发生在已部署的 `model-policy-20260915-4` Agent 镜像。上一轮多技术栈候选镜像没有切换进业务 Pod。

## 修复后验证

六个 Agent Pod 均恢复 Ready。平台 80/30080 入口、Agent 列表、故障项目和两个新建空白项目的会话列表均返回 200，采样响应约 0.18～0.40 秒。浏览器确认原故障项目的聊天记录、提示词输入框和右侧应用表单恢复，最近两分钟未再出现 EMFILE/ENOSPC/监听器初始化失败。

没有额外提交模型生成请求或创建新的业务项目；新建流程本次验证到现有新项目的 Agent 与会话接口就绪，不作为全新应用生成的端到端验收。

## 后续节点预检

在每一个**实际运行 Agent Pod 的 Linux 节点**执行：

```bash
bash deploy/prepare-agent-node.sh --check
# 若额度偏低，在该节点以 root 执行：
bash deploy/prepare-agent-node.sh --apply
```

工具默认只读；apply 提升至至少 1024 并持久化，保留已有更高值，不调整全局文件句柄、监听路径数等无证据相关参数。1024 是当前环境基线，并非无限容量；后续应结合并发 Agent 数和实例使用量调整。

推荐容量告警覆盖 inotify 分配失败、Agent readiness 持续失败、日志 EMFILE/ENOSPC，而不只看 CPU 和内存。长连接超时和前端连接失败提示仍是可独立改进的韧性项，本次没有据猜测认定浏览器连接泄漏，也未把这些机制作为现场根因。
