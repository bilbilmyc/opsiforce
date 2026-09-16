# 文件页的项目源码入口

## 2026-09-16：统一源码浏览与保护规则

上一版仅调整前端默认分类；后端依旧过滤 `app/`，所以标准模板生成的源码仍然不可见。本次已修复并部署至 40 测试环境。

- 项目文件展示 `app/` 与旧的根目录项目，不按语言/框架注册。项目源码只读，删除仅允许输出文件、用户上传的子项；响应中的 `canDelete` 决定按钮是否出现，后端独立校验。
- 统一保护 `opsiforce.env.json`、工作区 `data/`、`app/data/`、隐藏目录等路径；内容/下载重新检查打开后的真实路径。允许 `.gitignore`、`.dockerignore`、`.editorconfig`；隐藏依赖目录，但不凭名称过滤 `src/data`、`build`、`target` 等可能的源码。
- 目录丢失、类型错误、无权限不再伪装成空列表；页面显示错误并可重试。可选的输出/上传目录尚未创建时仍返回空分类。
- Go/Rust/Java 的构建文件及 Dockerfile 等可文本预览；源码直接用转义的 pre/code 保留缩进，避免 HTTP 下高亮 worker 不可用时显示 Markdown 围栏。

验证：本地后端 24 项通过、1 项 Linux 专用测试跳过；新镜像在 Linux 非 root 用户下 9 项文件测试全部通过，包括真实 EACCES、符号链接、敏感文件、读取与删除规则。前端分类/格式 4 项、双语 5 项通过，后端与 Vite 构建通过。完整前端类型检查仍有既存 434 行诊断，与前一次检查逐行一致。

真实接口已核对教室管理项目的 `app/backend/src/app.module.ts` 与容器文件 SHA-256 一致；Files 已能展示 app，私密配置与数据库路径返回 404。浏览器分别验证教室管理和旧 FastAPI 项目，源码预览与只读按钮行为正常。新增 `frontend/test/source-files.browser.cjs` 支持任意项目/源码路径，并包含模拟列表失败后重试的检查；这部分故障使用客户端拦截，不修改服务端文件。

部署镜像：backend 为 `files-v2-20260916-1`，frontend 为 `files-v2-20260916-2`：

- backend digest：`sha256:544877154dcf3d23608b18d0f29e9bb6488afe5da005f49a56bd9b55bc6916cb`
- frontend digest：`sha256:971cb38285906d322e71e4ea7dbba6f8c9e2d6da21c3d042e8ccfc5efd8e9601`

测试部署以原镜像的固定 digest 为基础，覆盖本地构建的 files 模块和完整前端静态产物；未更新依赖、数据库或 Agent 镜像。构建上下文、Dockerfile、Linux 测试和推送日志、更新前 Deployment/镜像记录保存在 `/root/opsiforce/deploy/.state/files-v2-20260916/`。后续正式镜像仍可从已更新源码使用 `deploy/docker/Dockerfile.backend` 和 `Dockerfile.frontend` 完整构建。

回滚前端为 `preview-links-20260916-1`，后端为 `model-form-zh-20260915-2`，仓库均为 `sealos.hub:5000/opsiforce`。回滚会恢复旧文件过滤/保护行为，不涉及数据迁移。

多语言组合模板仅完成 [设计规划](../design/multi-stack-templates.md)，未实施运行时改造。

## 2026-09-15 历史修正

2026-09-15 的 FastAPI 项目已经在 `/workspace/fastapi-form-service` 生成文件，但旧文件页固定打开 `generated_files` 对应的「生成文件」分类，因而显示空白。项目源码被归入名称不明确的「其他文件」。文件实际存在，列表 API 和内容 API 均正常。

新版将「其他文件」改为「项目文件」，「生成文件」改为「输出文件」。首次打开按项目文件、输出文件、用户上传的顺序选择有内容的分类。用户主动选择分类或进入目录后，刷新列表不改变选择。空分类提供跳到其他有内容分类的入口。

这是前端入口修正，API 分类 key、文件路径和权限规则不变，也不搬动项目文件。

## 验证

- 修改前浏览器直接打开「文件」找不到项目文件夹；修改后可依次进入项目目录、查看 `main.py`、`requirements.txt` 和 `static/index.html`。
- 3 项分类选择测试、5 项双语测试通过；Vite 构建通过。
- 浏览器检查空分类的跳转入口、手动选择在标签切换和刷新后保留。
- `main.py` 内容 API 与 Agent 容器中的文件 SHA-256 一致。
- 完整 TypeScript 检查仍有仓库既存错误，没有新增诊断类型。

```bash
bun test frontend/test/file-section-state.test.ts
FILES_BASE=http://test-host FILES_PROJECT_ID=project-id FILES_FOLDER=fastapi-form-service \
  node frontend/test/project-files.browser.cjs
```

浏览器用例使用已有的 FastAPI 测试项目，不创建或修改文件。需要 Playwright 和 Chromium；支持 `PLAYWRIGHT_MODULE`、`CHROME_PATH` 指定路径。本地构建预览可通过 `FILES_UPSTREAM` 指向只读初始化数据服务。

## 部署

仅更新 40 的前端 Deployment。镜像 `sealos.hub:5000/opsiforce/opsiforce-frontend:project-files-20260915-1`。构建日志和更新前 Deployment 保存于 `/root/opsiforce/deploy/.state/project-files-20260915`。回滚镜像为 `chat-formal-output-20260915-1`。

已核对运行镜像 digest：`sha256:8035ce2deb79ef7d65c2738d9c4d5228d0e4d1fca417cc751ceceda312e99630`。
