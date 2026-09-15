# 文件页的项目源码入口

## 原因与修正

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
