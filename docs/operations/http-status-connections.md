# HTTP 多标签页状态连接耗尽

2026-09-16 在 40 模板验收中复现，与此前节点 inotify 额度耗尽是不同问题。

## 信号和验证

同时打开多个项目标签后，文件页一直显示加载、聊天面板空白、新建页的初始化请求等待。后端 curl 和应用 HTTP 接口仍正常。关闭一个验收标签后，另一个标签的文件列表立即从等待恢复为 app、.gitignore 等实际文件。

初始假设按优先级为浏览器连接占用、服务器再次资源耗尽、前端渲染阻塞。关闭一个客户端页面就恢复其他页面、独立 HTTP 请求持续成功，支持第一项。实际状态订阅回归测试复现三个页保留 6 条平台 SSE，预期只保留前台连接：

```text
yarn workspace @opsiforce/frontend exec node --test test/background-streams.test.cjs
before: AssertionError 6 !== 2
```

[MDN 的 SSE 文档](https://developer.mozilla.org/en-US/docs/Web/API/Server-sent_events/Using_server-sent_events)说明，HTTP/1 下每浏览器、每域名的连接上限通常是 6。HTTP/2 的流限制不同。单独改可见性不足以覆盖多个可见窗口，因此普通 HTTP 还需要有限时长的请求。

## 修复

- 平台状态订阅通过 `createStatusSource` 统一选择传输：HTTP 使用串行、可取消的 JSON 快照请求，完成后 3 秒再请求；HTTPS 保留 SSE。
- 项目状态与 Agent 状态的原有事件接口支持 `snapshot=1`，沿用相同身份/可见性检查，返回后结束响应。发布、导入、导出、复制任务使用已有的 job JSON 接口。
- 后台/离开页面释放状态订阅，返回时读取最新快照；服务端任务继续运行。项目切换或卸载会取消请求和定时器，不累积后台轮询。
- OpenCode 聊天保持原有实时订阅和后台执行行为；本次仅释放平台状态连接，避免改变长时间后台模型任务的保活语义。

HTTP 的状态展示最多多等待一个轮询周期，不影响模型生成本身。大量同时可见聊天窗口仍应使用 HTTPS + HTTP/2：聊天实时连接也占用 HTTP/1 的连接额度，本次没有声称取消浏览器的固有限制。

## 回归测试

`frontend/test/background-streams.test.cjs` 运行实际状态 hooks，覆盖多标签释放/恢复、不重复连接、卸载关闭；验证多个可见 HTTP 页面使用有限请求、保留身份参数并取消请求。

后端测试覆盖快照复用身份和项目可见性检查、直接结束响应。浏览器验收需刷新到新版本后再测试多个标签；已经打开的旧页面仍在执行旧代码，需要刷新或关闭。
