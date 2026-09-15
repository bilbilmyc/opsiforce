# Opsiforce 中英文界面

侧边栏底部的「语言 / Language」支持简体中文和 English。首次打开默认简体中文；选择保存在当前浏览器，刷新后保留，同源标签页自动同步。切换不刷新页面，不重置正在编辑的表单。

## 范围

覆盖 Opsiforce 导航、首页、工作区、默认设置、环境、预算、定时任务、容器、存储、外部服务，以及项目操作、文件预览、导入导出和常用提示。内嵌聊天复用 OpenCode 原有语言包，跟随平台选择；本项目新增的对话完成状态也支持两种语言。

项目名称、自定义工作区和环境名称、模型 ID、渠道名称、文件内容、对话内容、上游错误及模型来源备注保留原文。只转换内置开发／生产环境的显示名称，存储值、URL 标识、API 参数和权限标识保持不变。Bifrost 控制台与外部编辑器不由此开关控制。

## 实现

- `frontend/src/i18n/messages.ts`：中英文界面文案。
- `frontend/src/i18n/translate.ts`：纯文本翻译与参数替换；参数不再参与翻译。
- `frontend/src/i18n/index.ts`：语言状态、浏览器保存和日期语言。
- `frontend/src/components/language-switcher.tsx`：语言切换入口。

新增文案使用 `t('English copy')`，动态值使用占位符，例如 `t('Open {0}', { 0: filename })`。不要对用户数据调用翻译函数。Solid 组件应在渲染表达式、响应式函数或配置对象的 getter 中读取翻译，避免在模块初始化时固定语言。业务 ID 与显示文案分开存放。

## 验证

```bash
yarn workspace @opsiforce/frontend exec node --test test/i18n.test.cjs
yarn workspace @opsiforce/frontend build
```

5 项自动化检查通过，覆盖双向翻译、参数和用户内容保留、词条占位符及聊天终止状态。本地及 40 真实浏览器检查均通过，覆盖 10 个主要页面、切换时保留模型选择和表单草稿、刷新保存、跨标签页同步及手机端切换。模型默认值和运行策略保存请求另由模拟接口验证；真实检查前后 51 个模型的能力与策略、平台默认模型均一致。

完整前端类型检查仍有仓库原有的 OpenCode 模块解析和工具栏类型错误，不作为全量通过声明。

## 40 测试环境

前端镜像：`sealos.hub:5000/opsiforce/opsiforce-frontend:ui-language-20260915-1`。

已核对运行中 Pod 的 digest：`sha256:34233412035bea8b8a42317ff321c8ffd0655b016b927d57ff7a3e0e8c6a74bf`。前端滚动更新完成，Pod 为 `1/1 Ready`。

本次使用独立构建目录 `/root/opsiforce/deploy/.state/ui-language-20260915/source`，只更新前端 Deployment。该目录上一级保留构建日志和更新前的 `frontend-before.yaml`。回滚时将前端镜像改回 `model-picker-20260915-1`；不需要回滚数据库或模型配置。
