# Python / FastAPI 后端

此项目使用实验配方 `fastapi@1`，没有绑定 React/Vue 前端。

- 在 Agent 工作区执行 `opsiforce-runtime run`，使用 APP_PORT（默认 3000）。
- 源码位于 backend；startup.sh 和 run-backend.sh 保留平台的 app-backend 守护进程。
- `/api/health` 检查服务，`/api/items` 支持 GET/POST，POST JSON 示例：`{"name":"示例"}`。
- 不启用文件热监听；修改源码或配置后使用平台“重启应用”。
- 用户配置写入 app/opsiforce.env.json（字符串字典），重启后生效。APP_GREETING 是公开示例欢迎语，其他配置留在服务端。
- 数据存放 app/data/app.db；源码发布排除数据、配置、虚拟环境、构建产物和缓存。
- 功能验收后再写 app/app.meta.json，例如 `{"name":"我的应用","description":"说明"}`，由平台识别应用。

首次运行需要访问依赖源；生产也使用相同启动脚本。数据库只有幂等初始建表，后续表结构修改需添加版本化迁移。业务认证和完整业务界面由项目实现。
