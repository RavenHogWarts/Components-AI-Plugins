# 内置功能服务与官方插件（全量清单）

> 2026-11-21 由 query_services / inspect_docs 拉取。`system.*` 为应用内置功能；
> `plugin.*` 为官方内置插件（可按 manifest 名经 pluginManager 配置/禁用）。

## system.* 功能服务

| 服务 | 说明 |
| --- | --- |
| system.conversation | 对话面板（发消息/看回复）；扩展用 conversationViewService |
| system.session-list | 可搜索会话列表；扩展用 sessionListView |
| system.settings | 设置页（模型/Agent/技能/MCP/插件）；用 panelViewManager 打开 |
| system.new-conversation | 在当前工作区面板开新对话 |
| system.enter-to-submit | 回车发送 |
| system.editor-references | @ 后建议文件/Agent，/ 后建议技能 |
| system.plugin-panel | 会话列表中的 AI 设置快捷入口 |
| system.task | 任务页（定时指令）；用 jobManager 调度 |
| system.mcp | list_server_tools / call_server_tool 两个 Agent 工具 |
| system.skills / system.skill-folders | skill 工具；从应用与库目录发现技能 |
| system.agent-folder | 让库中 Markdown Agent 定义可用（agentManager 管理） |
| system.model-providers | 设置页内置模型供应商（modelProviderManager 配置） |
| system.obsidian-editor | 原生 Obsidian 编辑器扩展宿主（obsidianEditorExtensions） |
| system.tool-output | 大工具结果可读化与落盘链接 |
| system.system-info-reminder | 在模型上下文记录执行时间与环境 |

## plugin.* 官方插件

工具类：ask-user-tool（ask_user）、bash-tool（bash）、todo-tool（todo_write）、
subagent（run_agent）、bot-send-tool（bot_send）、web-search（web_search/web_fetch）、
file-read-tools / file-write-tools（文件读写搜索）、plugin.mcp（见 system.mcp）。

功能类：agent-group-chat（群聊）、auto-session-title（新会话标题）、
session-compaction（长对话摘要）、session-notification（完成/失败/审批通知）、
next-suggestion（下一条建议）、editor-context（草稿附带活动笔记）、
tool-approval-view（工具审批）、desktop-proxy（桌面 HTTP 流）、mobile-connection（移动端联网）、
usage-monitor（订阅用量监控，Composer 底部）。

## 内置插件设置格式（pluginManager.writeData 后 reload 生效）

```ts
// auto-session-title
interface TitleSettings { maxLength?: number; model?: ModelRef; prompt?: string }

// bash-tool
interface BashToolSettingsData {
  defaultTimeoutSeconds?: number;  // 默认 120
  maxTimeoutSeconds?: number;      // 默认 600，≤3600
  shellPath?: string;              // 空=平台默认
}

// session-compaction
interface SessionCompactionSettings {
  threshold?: number;      // (0,1] 会话预算占比，默认 1
  reserveTokens?: number;  // 预留响应 token
  model?: ModelRef;        // 缺省跟随会话模型
  prompt?: string;
}

// editor-context
interface EditorContextSettings { defaultEnabled?: boolean }  // 默认 true

// mobile-connection
interface MobileConnectionSettings { providers?: readonly string[] }  // 连接名列表
```

## usage-monitor 用量协议（逆向还原，ai-usage 同源）

- **GLM**：`GET {open.bigmodel.cn|api.z.ai}/api/monitor/usage/quota/limit`，头 `authorization: <apiKey>`（不带 Bearer）。
  `data.limits[]`：`TOKENS_LIMIT`＝剩余额度（仅 percentage，5 小时滚动）；
  `TIME_LIMIT`＝工具调用配额（usage=总额/currentValue=已用/usageDetails 各工具次数，长周期重置）。
- **DeepSeek**：`GET api.deepseek.com/user/balance`，头 `Bearer`；balance_infos（total/topped_up/granted，CNY）。
- **Codex**：本地 `codex -s read-only -a never app-server`，stdio 行分隔 JSON-RPC：
  `initialize`（clientInfo）→ `account/rateLimits/read` → result.rateLimits.{planType,primary,secondary}
  （usedPercent/windowDurationMins/resetsAt）。
- 凭据复用：`modelProviderManager.listConnections()` 的 `baseUrl`+`apiKey`（官方域名匹配：
  open.bigmodel.cn / api.z.ai / api.deepseek.com）。