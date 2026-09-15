# 对话思考与状态显示

## 修复内容

- Opsiforce 的聊天时间线将思考放在独立消息区域，默认展开，点击一次即可收起或再次展开。工具操作沿用详细模式。
- 模型已开始思考但正文尚未到达时，显示等待说明；没有正文的标题不提供空折叠按钮。收到实时思考片段后直接显示正文。
- 长思考正文最高 320px，内部滚动，避免单段内容撑满整个对话页。
- 活动状态复用时间线原有状态位置；终止状态放在与消息相同的居中列内，消除左侧错位与重复的 Working 提示。
- 补充思考、通知、模型切换及继续对话输入提示的中文词条，随 Opsiforce 语言开关切换。

仅展示服务端实际返回的思考内容。中途读取消息接口可能得到空字符串：实时片段通过 `session.reasoning.delta` 事件传递，思考结束后再持久化全文。不能仅凭中途快照判断模型没有返回思考。

## 验证

2026-09-15：

- 修改前的页面在提供思考正文的浏览器测试中无法直接看到正文；修改后相同条件通过。
- 浏览器模拟数据回归覆盖默认展开、单次折叠、空状态、实时 SSE 片段、长正文滚动、中英文切换、手机宽度、完成状态对齐。所有对话写请求均被模拟或拒绝，没有提交模型请求。
- 63 项时间线投影与进度测试、5 项双语测试通过；前端 Vite 构建通过。
- 完整 TypeScript 检查仍存在仓库已有错误；与本次修改前日志比较，没有新增诊断类型。
- 部署后读取真实 FastAPI 对话，确认模型思考正文默认展开，正文区域高度 320px，位置与输入框相差 8px；完成提示对齐且无浏览器脚本错误。

可重跑浏览器回归（在已运行的测试环境选择一个现有开发环境会话，开发环境 ID 与项目 ID 相同）：

```bash
CHAT_TEST_BASE=http://test-host \
CHAT_PROJECT_ID=existing-project-id \
CHAT_SESSION_ID=existing-session-id \
node frontend/test/chat-timeline.browser.cjs
```

运行环境需可导入 Playwright 并安装 Chromium。可以通过 `PLAYWRIGHT_MODULE` 指定模块路径，`CHROME_PATH` 指定浏览器，`CHAT_TEST_OUTPUT` 指定截图目录。测试本地构建预览时，将 `CHAT_TEST_BASE` 指向本地预览，将 `CHAT_UPSTREAM_URL` 指向提供只读初始化数据的测试服务。

## 部署与回滚

本次仅更新 40 的前端 Deployment，不修改 Agent、数据库、渠道或模型设置。

- 镜像：`sealos.hub:5000/opsiforce/opsiforce-frontend:chat-reasoning-20260915-1`
- 已核对运行 Pod 的 digest：`sha256:b633c34b8a4df26b1195c29473059cb466db010a25fd11e974483a26f3ff49a9`
- 隔离构建目录：`/root/opsiforce/deploy/.state/chat-reasoning-20260915/source`
- 上级目录保留 `build.log` 和 `frontend-before.yaml`。
- 回滚镜像：`sealos.hub:5000/opsiforce/opsiforce-frontend:ui-language-20260915-1`。
