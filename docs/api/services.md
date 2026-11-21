# 服务契约速览（方法签名摘录）

> 由 `inspect_docs` 拉取（2026-11-20）。完整注释与示例见 Agent 工具 `inspect_docs`；
> 本地类型声明见 `vendor/ai-api/index.d.ts`；服务清单见 `services-overview.md`。

## sessionManager

```ts
create(request?: CreateSessionRequest): Promise<Session>;
resolveDefaults(agent?, model?): Promise<{ agent: AgentData; model: { ref; reasoning } }>;
getById(id): Promise<Session | null>;        // null = 确认不存在
list(): Promise<readonly SessionData[]>;     // 记录副本，编辑不落盘
getAncestors/getDescendants/getChildren(id): Promise<readonly SessionData[]>;
fork(sessionId, targetEventId): Promise<string>;
delete(id): Promise<void>;                   // 删除会话及其分组后代
removeOrphans(): Promise<void>;
on(type: 'session.added'|'session.updated'|'session.removed', cb): () => void;
load(): Promise<void>;                       // 查询与观察前的准备
```

Session 核心成员：`id/created/parentId/data/status/events/inbox`；
`on('session.updated')`、`update(data)`（完整业务数据，含 title）、`append(userMessage)`、`run(messageId)`、
`edit(messageId, content)`、`continue()`、`stop()`、`resolveInterruption(resolution)`。

## eventBus

```ts
publish(message | readonly Message[], signal?): Promise<void>;
subscribe(listener: (m: EventMessage) => void): () => void;   // 只观察未来消息
once(predicate, signal?): Promise<EventMessage>;
```

会话每次变化都会在总线发布 `type: 'session.updated'`（含 `sessionId`）。

## modelProviderManager

```ts
// 解析执行模型（标题生成等独立调用入口）
getModel(ref: ModelRef, overrides?: { maxOutputTokens?: number }): Model;
listChoices(): readonly ModelChoice[];         // 设置界面的模型下拉数据
listModels(): readonly Model[];                // 已构造的执行模型
getModelData(ref): ModelData;
// 连接与模型配置管理
addConnection / createConnection / updateConnection / removeConnection / moveConnection
addModel(connection, modelId, suggestion?, signal?): Promise<ModelRef | undefined>
updateModel / removeModel / listConnections / listTemplates / registerTemplate / unregisterTemplate
// Provider 工厂
register / unregister / listProviders / matchProvider / createProvider
```

## transcriptFactory / transcriptProjectorManager

```ts
transcriptFactory.create(session): Transcript;   // close() 释放订阅
Transcript: { nodes, cursor, on('transcript.updated'|'transcript.failed'), close() }
transcriptProjectorManager.register(projector): symbol; unregister(ref); list(); on('transcript.projectors.change', cb)
```

## pluginManager

```ts
list(): readonly PluginInfo[]; get(name): PluginInfo | undefined;
isPluginService(name): boolean;
on('plugin.added'|'plugin.updated'|'plugin.removed', cb): () => void;
setEnabled(name, enabled): Promise<void>;   // 持久化启用意图并加载/卸载
reload(name): Promise<void>;                // 重新读取清单/代码/资产
delete(name): Promise<void>;
refresh(): Promise<void>;                   // 刷新清单；新代码仅经 enable/reload 运行
readData(name): Promise<JsonValue | undefined>;   // 未启用也可读
writeData(name, value): Promise<void>;            // 整体替换；重载已启用插件后生效
```

Manager 操作使用 manifest 的 name（不带 `plugin.` 前缀）。

## agentManager

```ts
register(agent: AgentData, signal?): Promise<Cleanup>;   // 只读注册，发布 agent.added/removed
// 继承 AgentManagerApi：查询与持久化 Agent 定义（详见 inspect_docs）
```

## appDataManager

```ts
get(): AppData;                 // 只读快照
path(...parts): string;         // 数据目录下的相对路径
on('app.data.updated', cb): Cleanup;
update(change: (current) => AppData | undefined): Promise<void>;  // 同步不可变替换
```

## files（FileApi）

```ts
resolvePath(path): string;
stat / readText / read / write / append / process(path, (cur) => next|undefined)
list(path): Promise<readonly FileEntry[]>;  mkdir; copy; move; remove; trash
readonly subscribe?; readonly getNativePath?;   // 可用时提供
```

## i18n

```ts
readonly language: string;
get(namespace): snapshot | undefined;
register<T>(namespace, translations): Localizer<T>;   // 英文必填；Localizer.get()/dispose()
```

## panelViewManager

```ts
registerView(view) / unregisterView(viewId) / getViews() / getView(viewId)
openView(viewId, params?, mode?): Promise<void>;   // 默认新标签页；'panel' 在左侧
on(PanelViewEvent['type'], cb): () => void;
```

## hookManager

```ts
register(hook: AgentHook, ownerId: string, signal: AbortSignal, order?): symbol;
unregister(ref): void;
aroundTurnExecution(ctx, next) / aroundStep(ctx, next)
aroundModelRequest(ctx, next): Promise<ModelResponse>
aroundToolCall(ctx, next): Promise<ToolResult>
beforeToolCalls(ctx): Promise<void>
projectContext(events, turnId, model: ModelData): Message[];
```

## messageTransformerManager

```ts
register(transformer) / unregister(transformer) / list()
// transformer: { id, intent, match(event), transform() => { type:'append'|'prepend'|'replace', content } }
```

## interruptionManager

```ts
register(definition: { type }, signal?): symbol;
unregister(ref); getRegistration(type); get(type); list();
listContinuable(interruptions); on(InterruptionDefinitionEvent['type'], cb)
```

## toolManager

```ts
containsTool(agent, toolName): boolean;
register<Input>(tool: Tool, signal?): void;   // 同名后者生效
unregister(name); on('tool.added'|... , cb)
// 继承 ToolQueryApi：get/list 等查询
```

## mcpManager

```ts
containsMcpServer(agent, serverId);
getServer(id): Promise<McpServer | null>;     // 不连接
listServers(); addServer(config); updateServer(config); removeServer(id);
on(McpServerEvent['type'], cb): () => void;
```

## skillManager

```ts
containsSkill(agent, skillName); list(): readonly Skill[];
on(SkillEvent['type'], cb); reload();
create(name): Promise<Skill>; remove(path): Promise<void>;   // 需来源支持
```

## httpClient / httpClients

```ts
httpClient.request(request: HttpRequest): Promise<HttpResponse<ArrayBuffer>>;
httpClient.stream(request): Promise<HttpResponse<ReadableStream<Uint8Array> | null>>;
httpClients.installClient(client, matches, signal): Cleanup;
httpClients.installStreamClient(client): Cleanup;
```

## botProviderManager

```ts
add(provider, signal?): Promise<void>; remove(id); list(): Promise<readonly BotProvider[]>; getById(id)
```

## 会话/对话界面扩展

```ts
// conversationViewService
registerBlock(block: View<ConversationViewProps>) / unregisterBlock(id)
open({ container, defaultContent? }): release   // 容器内挂载草稿
open(): Promise<void>                            // 新建工作区面板
openSession(sessionId): Promise<void>

// composerViewService
registerHeaderItem / unregisterHeaderItem / listHeaderItems
registerFooterItem / unregisterFooterItem / listFooterItems
on(ComposerViewEvent, cb)

// composerEditorViewService
renderEditor(container, editorProps)
registerHeaderItem / registerFooterItem / list*
registerCodemirrorExtension(id, extension) / unregisterCodemirrorExtension(id) / listCodemirrorExtensions()

// sessionListView
open(): Promise<void>
open(container: HTMLElement): () => Promise<void>   // 返回 release
registerItem(item: View) / unregisterItem(id)       // 工具栏(-1000)与内容(1000)之间有序插入
```

## webSearchProviderManager

```ts
registerProvider(provider, signal): () => void;
listProviders(); getDefaultProvider(); setDefaultProvider(id | undefined): Promise<void>;
on(WebSearchProviderEvent['type'], cb)
```

## obsidianEditorExtensions

```ts
register(extension: Extension, signal: AbortSignal): void;   // 取消信号移除扩展
```

## databaseManager（.xdb）

```ts
open(path: string): Promise<Database>;     // vault 相对路径，含 .xdb 扩展名
close(database): Promise<void>;            // 与 open 配对；无其他持有者时保存
// Database：getData()、updateCell(rowId, field, value)、flush()、行/视图/字段/公式配置、变更通知
```

## jobManager

```ts
listJobs(); saveJob(job); deleteJob(jobId); resetJobs();
executeJob(jobId): Promise<string>;        // 返回执行 ID
listJobExecutions(jobId?); getJobExecution(id);
on(JobEventMap 键, cb): () => void;
// Job: { id, title, instruction, schedule(ICS/RRULE), sessionId? }
```

## markdownRenderer / attachmentStore / yaml

```ts
markdownRenderer.render(content, container, signal): Promise<void>;
attachmentStore.save(bytes: Uint8Array, mediaType?, fileName?): Promise<string>;  // 返回 FileApi 路径
yaml.parse(content): unknown; yaml.stringify(value: JsonValue): string;
```

## PluginContext（this.api）

```ts
readonly app: AiApp;              // 上列全部服务 + applicationContext + i18n
readonly manifest: PluginManifest;
readonly signal: AbortSignal;     // 加载结束/应用停止时取消
setSettingsView(renderer | undefined);
registerService(service): Promise<void>; unregisterService(name);
getService(name): unknown;        // 可选能力；undefined 表示未解析
readData(): Promise<JsonValue | undefined>;
writeData(value: JsonValue): Promise<void>;   // 插件 data.json，卸载重载后保留
```
---

## 补全契约（2026-11-21 第二轮拉取）

### View（composer/conversation/footer 注册件的通用结构）

```ts
export interface View<Props extends object = never> {
  readonly id: string;
  readonly order?: number;
  readonly renderer: ViewRendererConstructor<Props>;
}
```

### AgentManager（CRUD + 只读注册）

```ts
create(agent: AgentData): Promise<AgentData>;
save(agent: AgentData): Promise<AgentData>;
getById(id): Promise<AgentData | null>;
list(): Promise<AgentData[]>;
delete(id): Promise<boolean>;
on('agent.added'|'agent.updated'|'agent.removed', cb): () => void;
register(agent: AgentData, signal?): Promise<Cleanup>;  // 插件加载域只读注册
```

### Agent Tool 注册（toolManager.register）

```ts
export interface ToolSpec {
  readonly name: string;
  readonly description: string;
  readonly parameters: JSONSchema;
}

export interface Tool<Input = unknown> {
  readonly spec: ToolSpec;
  readonly deferLoading?: boolean;      // 默认 true：经 call_tools 间接暴露
  readonly needsApproval?: boolean;     // false 跳过审批
  readonly enabledWhen?: (context: ToolContext) => boolean;
  execute(input: Input, context: ToolExecutionContext): ToolResult | Promise<ToolResult>;
}
```

### AppData / 应用设置

```ts
export interface AppData {
  readonly aiBaseFolder: string;
  readonly defaultAgentId: string;
  readonly defaultModel?: { readonly ref: ModelRef; readonly reasoning?: ReasoningOptions };
  readonly providers: readonly ModelConnectionData[];
}
update(change: (current: AppData) => AppData | undefined): Promise<void>;  // 同步不可变替换
```

### HTTP

```ts
export interface HttpRequest {
  readonly url: string;
  readonly method?: string;
  readonly headers?: Readonly<Record<string, string>>;
  readonly body?: string | ArrayBuffer;
  readonly signal?: AbortSignal;
  readonly redirect?: 'manual';
}
export interface HttpResponse<TBody> { status; statusText?; headers; body: TBody }
```

### 模型连接（凭据复用）

```ts
export interface ModelConnectionData {
  readonly type: string; readonly name: string;
  readonly baseUrl: string;        // 识别供应商（如 api.z.ai / api.deepseek.com）
  readonly apiKey?: string;        // 复用给用量查询等
  readonly templateId?: string; readonly models?; readonly options?;
}
```

### 中断（Interruption）

```ts
export interface Interruption<P, R> {
  readonly requestId; sessionId; turnId; type; payload: P; created;
  readonly resolved: { payload?: R } | undefined;
  readonly status: 'pending' | 'resolved';
}
export interface InterruptionDefinition {
  readonly type: string;
  readonly view?: ViewRendererConstructor<InterruptionViewProps>;
  continue?(session, interruptions, signal): Promise<void>;
  project?(requests): readonly Interruption[];
}
```

### MCP 服务器

```ts
export interface McpServerData {
  readonly id: string; readonly name: string; readonly enabled: boolean;
  readonly url: string; readonly headers: Readonly<Record<string, string>>;
}
export interface McpServer {
  readonly data: McpServerData; readonly status;
  connect(): Promise<void>; disconnect(): Promise<void>;
  listTools(cursor?, signal?): Promise<McpToolPage>;
  callTool(name, args, signal?): Promise<McpCallResult>;
}
```

### Composer / Conversation / 编辑器视图输入（internal）

```ts
export interface ComposerViewProps {
  readonly aiApp: AiApp; readonly session?: Session; readonly editor?: ComposerEditorInstance;
  readonly onSubmit: (content: UserMessagePart[]) => Promise<void>;
  readonly defaultContent?: UserMessagePart[];
}
export interface ConversationViewProps {
  readonly aiApp; session?; defaultContent?;
  readonly onSessionIdChange: (sessionId: string) => void;
}
// ComposerEditorViewProps：编辑器自有实例（onContentChange/onEditorReady/onSubmit 等）
```

### Job（定时任务，internal）

```ts
export interface Job {
  readonly id; title; agentId?; sessionId?; instruction;
  readonly schedule: string;   // iCalendar：DTSTART;TZID=Asia/Shanghai:... \n RRULE:FREQ=...
}
// JobExecution: { id; jobId; scheduledAt?; createdAt; sessionId?; status; error? }
// 事件：job.added/updated/removed、jobs.reset、job.execution.created/started/paused/
//       resumed/completed/failed/cancelled/unavailable
```

### Hook 注册结构

```ts
export interface AgentHook {
  readonly aroundTurnExecution?: TurnExecutionHook;
  readonly aroundStep?: StepHook;
  readonly aroundModelRequest?: ModelRequestHook;
  readonly aroundToolCall?: ToolCallHook;
  readonly beforeToolCalls?: BeforeToolCallsHook;
  readonly projectContext?: ContextProjector;
}
// hookManager.register(hook, ownerId, signal, order?) → symbol
```

### MessageTransformer

```ts
export interface MessageTransformer {
  readonly id: string; readonly intent?: string;
  match(event: MessageCreatedEvent): boolean;
  transform(event, context): { type: 'append'|'prepend'|'replace'; content } | undefined;
}
```
---

## 第三轮补全（Hook 上下文 / 视图输入 / 面板 / 搜索提供者）

### TurnExecutionContext（Hook 上下文基座）

```ts
export interface TurnExecutionContext extends SessionContext {
  readonly turnId: string;
  readonly history: readonly EventData[];   // 本次活动前的祖先事实
  readonly signal: AbortSignal;
  readonly agent: AgentData;
  readonly model: Model;
  readonly reasoning: ReasoningOptions;
  readonly options: Readonly<Record<string, unknown>>;
  readonly toolExecutor: ToolExecutor;
  interrupt(request: InterruptionRequest): Promise<Interruption>;  // 提交业务中断请求
}
// StepHookContext: + { step; tools: readonly Tool[] }
// ModelRequestHookContext: { modelCallId; model; request; signal; execution?; history? }
// ToolCallHookContext: + { proposal: ToolCallPart; call: ToolCallPart; tool? }
// ToolCallsHookContext: + { calls: readonly ToolCallPart[] }
```

Hook 类型：`TurnExecutionHook/StepHook/ModelRequestHook/ToolCallHook/BeforeToolCallsHook/ContextProjector`；
next 契约：最多调用一次并 await（ToolCallHookNext 接收候选 `call: ToolCallPart`）。

### MessageCreatedEvent（MessageTransformer 输入）

```ts
export interface MessageCreatedEvent extends EventData {
  readonly durable: true;
  readonly type: 'message.created';
  readonly payload: {
    readonly message: Message & { readonly id: string };  // 变换前完整输入
    readonly transforms: readonly MessageTransform[];     // 已应用变换（顺序）
    readonly modelCallId?: string;
    readonly originMessageId?: string;
  };
}
```

### Conversation 视图输入

```ts
export interface ConversationSessionData { title?; agent?; model?; options? }
export interface ConversationSessionDataProps {
  readonly sessionData: Readonly<ConversationSessionData>;
  readonly setSessionData: (update: (prev) => ConversationSessionData) => Promise<void>;
}
// ComposerViewProps / ConversationViewProps / ComposerEditorViewProps 均继承之
```

### ComposerEditorInstance（编辑区实例）

```ts
getContent(): readonly UserMessagePart[];
setContent(content): void;
getSession(): Session | undefined;
onContentChange(listener): () => void;
readonly editorView;  // 已连接的原生编辑器视图
```

### 面板视图输入 PanelViewProps

```ts
{ params; setParams(params); signal; setHeader?(header?: PanelHeader); close?() }
// PanelHeader: { title?; actions?; menu?: actionGroup[][] }
```

### WebSearchProvider（自定义搜索后端）

```ts
search(request: { query; limit?: 1..50 }, signal): Promise<WebSearchResponse>;
fetch?(request: { url; timeout? }, signal): Promise<WebFetchResult & { providerName }>;
```

### 模型连接声明链

```ts
AiSdkModelProviderData extends ModelProviderData {
  models; baseUrl?; apiKey?; apiFormat?: 'openai_chat_completions'|'openai_responses'|'anthropic_messages';
  options?: AiSdkConnectionOptions /* { streaming?, extraBody?, extraHeaders? } */
}
```

### xdb Database（databaseManager.open 返回值）

```ts
getId() / getDefinitionPath() / getDefinition() / subscribeDefinition(cb)
getDataSnapshot(ctx?) / subscribeData(cb, ctx?)
getData(filter?, ctx?) / getAllData(filter?, ctx?)   // 后者跳过全局过滤
matchesFilter(item, filter, ctx?) / evaluateFormula(expr, item, ctx?)
updateSource(source, options?) / activate() / freeze() / flush() / unload()
// 子 API：XdbFieldApi / XdbGlobalFilterApi / XdbViewApi / XdbRowApi（行编辑等，见 inspect_docs）
```