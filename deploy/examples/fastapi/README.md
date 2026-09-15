# FastAPI 接入 Opsiforce

保留现有 Python 后端和原生静态页面，通过小型适配层接入平台预览、健康检查、进程重启及 Production 发布。此示例已用于 `fastapi-form-service`。

## 文件位置

- 应用源码：`/workspace/fastapi-form-service/`。
- 将 `start.sh`、`opsiforce_runtime.py`、`requirements.lock` 放到该源码目录。
- 将 `platform-startup.sh` 安装为 `/workspace/app/startup.sh`，两个 shell 脚本都要可执行。使用其他源码目录时，调整其中的路径。
- 在 `/workspace/app/app.meta.json` 保存应用名称和描述，例如：

```json
{"name":"FastAPI 表单服务","description":"FastAPI 与原生 HTML/CSS/JS 表单服务"}
```

在现有 `main.py` 中接入适配层：

```python
from opsiforce_runtime import database_path, install_metadata_route

BASE_DIR = Path(__file__).resolve().parent
DB_PATH = database_path(BASE_DIR)

app = FastAPI(...)
install_metadata_route(app)
```

保留现有的数据库初始化、业务路由及静态页面路由。适配层额外提供 `/api/app-meta`；该接口返回成功且 `exists` 为 true 后，平台才将应用标记为可预览和发布。

## 启动与数据

平台原有的 `guard webapp` 启动入口脚本，入口再使用 `guard app-backend` 托管 Python。沿用 `app-backend` 名称，平台的“重启应用”才能找到该进程。应用监听 `0.0.0.0:${APP_PORT:-3000}`。

`start.sh` 为每个环境创建自己的 `.venv`。首次启动或锁文件变化时安装依赖；正常重启不重复安装。锁文件是已验证环境中实际运行的 15 个包版本，升级依赖后要同步更新锁文件并重新验证。

平台启动时，SQLite 位于 `/workspace/app/data/fastapi.db`。开发和生产各有一份；生产再次发布时保留。直接在平台外运行且没有 `APP_DATA_DIR` 时，适配层兼容源码目录的 `data.db`。

源码仓库的 `.gitignore` 应包含：

```gitignore
**/.venv/
**/__pycache__/
fastapi-form-service/data.db*
```

平台已有的 `data/` 忽略规则覆盖 `app/data`。发布前用 `git ls-files` 确认数据库、虚拟环境和备份未被跟踪。若旧数据库已有业务记录，先做 SQLite backup，再迁移到持久目录；不要直接覆盖另一个已有数据库。

## 发布

1. 启动并确认 `/`、静态资源、`/api/health`、`/api/app-meta` 正常。
2. 通过 `APP_PUBLIC_URL` 指定的地址验证开发应用。
3. 在 Opsiforce 顶部环境菜单选择生产目标，点击“发布”。
4. 发布完成后，使用生产环境的“打开应用／复制链接”获取地址。
5. 修改开发代码后，先重启开发应用并验证，再选择“发布更新”。生产使用独立目录和进程，不会直接跟随开发代码变化。

首次发布会复制被 git 跟踪的源码，不会复制开发数据库。需要迁移开发数据时应单独安排数据导入。

当前示例关闭 uvicorn 的自动重载；开发代码更新后使用平台“重启应用”应用改动。生产不使用 `--reload`。
