# 应用服务总览（query_services 快照 · 72 项）

> 通过 Agent 工具 `query_services` 获取（2026-11-20）。开发时可用 `inspect_docs` 按 Service 名或文档 ID 拉取最新契约。

## 核心容器与应用

| 服务 | 说明 |
| --- | --- |
| atraApp | 内部执行服务；应用操作请用 agentManager / sessionManager / modelProviderManager / toolManager / hookManager |
| aiApp | 插件访问 AI 应用 API 的入口（this.api.app），按能力选用命名服务 |
| appDataManager | 读写应用级设置（默认 Agent/模型/工具权限模式等），观察保存成功事件，解析数据目录路径 |
| eventBus | 发布/订阅应用与 Agent 执行的实时事件，或等待下一个匹配事件 |
| i18n | 注册翻译字典并按应用语言查询（英文兜底） |
| yaml | 解析 YAML 文本 / 将 JSON 兼容值序列化为 YAML |

## 会话与转写

| 服务 | 说明 |
| --- | --- |
| sessionManager | 创建 Agent 会话、查询记录、按 ID 打开、分组/派生/删除，用返回的 Session 发消息与控制执行 |
| transcriptFactory | 创建跟随会话的 Transcript（事件解释为节点）；关闭自己创建的 Transcript |
| transcriptProjectorManager | 注册/观察「会话事件 → 转写节点」的投影规则 |
| conversationViewService | 打开会话与注册对话面板中的有序块 |
| sessionListView | 打开会话列表面板/挂载列表，注册有序扩展项 |
| system.conversation | 对话面板（发送消息、查看回复） |

## 模型与工具

| 服务 | 说明 |
| --- | --- |
| modelProviderManager | 配置模型连接与模型项，注册 Provider 工厂与设置模板；列出可选模型、解析执行 Model |
| toolManager | 注册/移除/查询 Agent 工具，观察注册变化 |
| hookManager | 在 Turn/Step/模型请求/工具调用周围注册有序 Hook |
| messageTransformerManager | 注册对新消息的追加/前置/替换变换 |
| interruptionManager | 注册工具审批、用户提问等中断的定义（展示/投影/继续） |
| mcpManager | 管理 MCP 服务器配置；连接、列工具、调用工具 |
| system.mcp | 提供 list_server_tools / call_server_tool 两个 Agent 工具 |
| webSearchProviderManager | 注册/列出 web_search 与 web_fetch 工具的提供者，设置默认 |

## Agent/Skill/任务

| 服务 | 说明 |
| --- | --- |
| agentManager | 增删改查保存的 Agent 定义；为插件加载注册只读定义 |
| system.agent-folder | 让库中 Markdown Agent 定义可用 |
| skillManager | 发现/列出/刷新 Agent 技能目录，观察变化；来源支持时可增删 |
| system.skills / system.skill-folders | 技能工具与技能目录发现 |
| jobManager | 为会话调度一次性/周期指令；列出、保存、删除、手动执行、查历史 |
| system.task | 任务（Jobs）页面 |

## 文件/网络/平台

| 服务 | 说明 |
| --- | --- |
| files | 平台无关文件读写（根相对路径）：文本/二进制、目录、元数据、变更通知、原子更新、复制/移动/删除/回收站 |
| obsidianApp | 原生 Obsidian App（Vault/Workspace/MetadataCache）；可移植访问请用 files |
| httpClient | 发送 HTTP(S) 请求，读完整或流式响应，支持取消 |
| httpClients | 安装匹配请求的 HTTP 传输或仅覆盖流式传输 |
| attachmentStore | 保存导入字节到共享附件存储，返回 FileApi 路径 |
| markdownRenderer | 将 Markdown 渲染进 DOM 容器（安装提供时可用） |
| obsidianEditorExtensions | 在 Obsidian 笔记编辑器安装原生 CodeMirror 6 扩展 |
| desktop-proxy | 桌面端经 Obsidian 转发 HTTP 流式响应 |
| mobile-connection | 帮助移动端模型连接走 Obsidian 网络 |

## 界面扩展

| 服务 | 说明 |
| --- | --- |
| panelViewManager | 按 ID 注册/查找/打开应用页面 |
| composerViewService | 在 Composer 头部/底部注册有序控件 |
| composerEditorViewService | 注册对话编辑器控件与 CodeMirror 扩展 |
| system.new-conversation | 在当前面板开新对话 |
| system.enter-to-submit | 回车发送 |
| system.editor-references | @ 后建议文件/Agent，/ 后建议技能 |
| system.plugin-panel | 会话列表中的 AI 设置快捷入口 |
| system.settings | 模型/Agent/技能/MCP/插件设置页 |
| system.session-list | 可搜索的会话列表 |

## 插件体系

| 服务 | 说明 |
| --- | --- |
| pluginManager | 发现插件包、检查状态与错误、启用/禁用/重载；按 manifest 名读写插件设置 JSON |
| pluginStyleSheets | 内部服务：把插件样式应用到窗口（样式放 xdb-ai/styles.css） |
| plugin.creator | Creator Agent 与 query_services/inspect_docs/execute_js 工具 |
| plugin.*（内置功能插件） | agent-group-chat 群聊、ask-user-tool、auto-session-title、bash-tool、bot-send-tool、editor-context、feishu-bot、file-read-tools、file-write-tools、next-suggestion、session-compaction、session-notification、subagent、todo-tool、tool-approval-view、web-search、desktop-proxy、mobile-connection 等 |

## 数据库

| 服务 | 说明 |
| --- | --- |
| databaseManager | 按 vault 相对路径打开 .xdb 数据库：查询/过滤行、编辑记录、配置字段/公式/视图；open 与 close 配对 |