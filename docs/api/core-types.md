# 核心类型契约（@atra/api / @obsidian-components/ai-api）

> 由 `inspect_docs` 拉取的官方文档快照（2026-11-20）。对应本地类型声明见 `vendor/ai-api/index.d.ts`。

## 会话状态与数据

```ts
export type SessionStatus = 'idle' | 'running' | 'interrupted' | 'unknown';

export interface ReasoningOptions {
    readonly effort?: string;
    readonly enabled?: boolean;
    readonly budgetTokens?: number;
}

export interface SessionData {
    readonly id: string;
    readonly created: number;
    readonly parentId?: string;
    status?: string;
    title?: string;
    agent?: string | AgentData;
    model?: { readonly ref: ModelRef; readonly reasoning: ReasoningOptions };
    options?: Readonly<Record<string, unknown>>;
}

export interface ModelRef {
    readonly provider: string;
    readonly model: string;
}

export interface AgentData {
    [key: string]: unknown;
    id: string;
    name: string;
    description?: string;
    systemPrompt?: string;
    tools: string[];
    toolExecution?: ToolExecutionOptions;
}

export type SessionManagerEvent =
    | SessionAddedEvent | SessionUpdatedEvent | SessionRemovedEvent;
```

## 事件

```ts
export interface EventMessage {
    readonly sessionId?: string;
    readonly turnId?: string;
    readonly type: string;
}

export interface EventData extends EventMessage {
    readonly id: string;
    readonly sessionId: string;
    readonly timestamp: number;
    readonly turnId?: string;
    readonly payload: unknown;
}
```

## 消息部件

```ts
export interface BasePart<Metadata extends PartMetadata = PartMetadata> {
    readonly metadata?: Metadata;
}

export interface TextPart extends BasePart {
    readonly type: 'text';
    readonly id?: string;
    readonly text: string;
}

export interface FilePart extends BasePart {
    readonly type: 'file';
    readonly url: string;
    readonly fileName?: string;
    readonly mediaType: string;
}

export interface ReasoningPart extends BasePart<ReasoningPartMetadata> {
    readonly type: 'reasoning';
    readonly id?: string;
    readonly text: string;
}

export interface ReasoningPartMetadata extends PartMetadata {
    readonly startTime?: number;
    readonly endTime?: number;
}

export interface ToolCallPart {
    readonly type: 'tool_call';
    readonly toolCallId: string;
    readonly toolName: string;
    readonly arguments: string;
}

export interface ToolResult {
    readonly content: readonly (TextPart | FilePart)[];
    readonly isError?: boolean;
}

export interface ToolCallResultPart extends ToolResult {
    readonly type: 'tool_call_result';
    readonly toolCallId: string;
    readonly toolName: string;
}

export type UserMessagePart = TextPart | FilePart;
export type SystemMessagePart = TextPart;
export type ToolMessagePart = ToolCallResultPart;
export type AssistantMessagePart = TextPart | ReasoningPart | ToolCallPart | ToolCallResultPart | FilePart;
```

## 消息

```ts
export interface BaseMessage {
    readonly id?: string;
    readonly metadata?: Readonly<Record<string, unknown>>;
    readonly timestamp?: number;
}

export interface SystemMessage extends BaseMessage {
    readonly role: 'system';
    readonly content: readonly SystemMessagePart[];
}

export interface UserMessage extends BaseMessage {
    readonly originMessageId?: string;
    readonly role: 'user';
    readonly content: readonly UserMessagePart[];
}

export interface AssistantMessage extends BaseMessage {
    readonly role: 'assistant';
    readonly content: readonly AssistantMessagePart[];
}

export interface ToolMessage extends BaseMessage {
    readonly role: 'tool';
    readonly content: readonly ToolMessagePart[];
}

export type Message = SystemMessage | UserMessage | AssistantMessage | ToolMessage;
```

## 模型

```ts
export type ModelInputType = 'text' | 'image' | 'video' | 'pdf';
export type ModelOutputType = 'text' | 'image' | 'video';

export interface ReasoningCapabilities {
    readonly efforts?: readonly string[];
    readonly toggle?: boolean;
    readonly budget?: { readonly min?: number; readonly max?: number };
}

export interface ModelData {
    readonly modelId: string;
    readonly name?: string;
    readonly contextWindow?: number;
    readonly inputTokenLimit?: number;
    readonly outputTokenLimit?: number;
    readonly maxOutputTokens?: number;
    readonly supportedInputTypes: readonly ModelInputType[];
    readonly supportedOutputTypes: readonly ModelOutputType[];
    readonly toolCalling?: boolean;
    readonly reasoning?: false | ReasoningCapabilities;
}

export interface ModelRequest {
    readonly messages: readonly Message[];
    readonly tools?: readonly ToolSpec[];
    readonly reasoning?: ReasoningOptions;
    readonly signal?: AbortSignal;
    readonly sessionId?: string;
}

export interface Usage {
    inputTokens?: number;
    inputTokenDetails?: {
        noCacheTokens?: number;
        cacheReadTokens?: number;
        cacheWriteTokens?: number;
    };
    outputTokens?: number;
    outputTokenDetails?: { textTokens?: number; reasoningTokens?: number };
    totalTokens?: number;
    raw?: Readonly<Record<string, unknown>>;
}

export type FinishReason = 'stop' | 'length' | 'tool-calls' | 'content-filter' | 'error';

export interface ModelResponse {
    message: AssistantMessage;
    usage?: Usage;
    finishReason?: FinishReason;
}

export interface Model {
    readonly data: ModelData;
    readonly provider: ModelProvider;
    generate(request: ModelRequest): Promise<ModelResponse>;
    stream?(request: ModelRequest): AsyncIterable<ModelStreamChunk>;
    webSearch?(input: WebSearchInput): Promise<WebSearchResponse>;
    webFetch?(input: WebFetchInput): Promise<WebFetchResponse> | undefined;
}
```

## 插件生命周期与清单

```ts
export abstract declare class Plugin<Inject extends readonly ServiceName[] = readonly []> implements ServiceHook {
    static readonly inject: readonly ServiceName[];
    constructor(protected readonly dependencies: Dependencies<Inject>, protected readonly api: PluginContext);
    onResolving(_context: ApplicationContext): void | Promise<void>;
    onResolved(_context: ApplicationContext): void | Promise<void>;
    onDisposing(_context: ApplicationContext): void | Promise<void>;
    onDisposed(_context: ApplicationContext): void | Promise<void>;
    onApplicationReady(): void | Promise<void>;
}

export interface PluginDataApi {
    readData(): Promise<JsonValue | undefined>;
    writeData(value: JsonValue): Promise<void>;
}

export type PluginStatus = 'unloaded' | 'loading' | 'loaded' | 'unloading';

export interface PluginError extends Error {
    readonly type?: 'load';
    readonly pluginName?: string;
    readonly path?: string;
}

export interface PluginInfo {
    readonly manifest: PluginManifest;
    readonly path: string | undefined;
    readonly enabled: boolean;
    readonly supported: boolean;
    readonly status: PluginStatus;
    readonly errors: readonly PluginError[];
}

export type PluginEvent = PluginAddedEvent | PluginUpdatedEvent | PluginRemovedEvent;

export interface ApplicationContext extends EventBus {
    readonly status: ContextStatus;
    readonly services: ReadonlyMap<ServiceName, ServiceWrapper>;
    load(): Promise<void>;
    unload(): Promise<void>;
    registerService<Name extends ServiceName, const Inject extends readonly ServiceName[] = []>(service: ServiceDefinition<Name, Inject>): Promise<void>;
    unregisterService(name: ServiceName): Promise<void>;
    getService<Name extends ServiceName>(name: Name): Services[Name] | undefined;
}

export type ServiceName = keyof Services & string;

export type Dependencies<Inject extends readonly ServiceName[]> = {
    readonly [Dependency in Inject[number]]: Services[Dependency];
};
```

## 转写节点（实测结构补充）

```ts
export interface TranscriptNode {
    readonly key: string;
    readonly type: string;       // 实测：turn / message / system_prompt / step / turn_notice
    readonly payload: unknown;
    readonly children: readonly TranscriptNode[];
}
```

实测节点结构（2026-11-20，Creator Agent 于真实会话采样）：

- 顶层为 `turn` 节点，payload `{ turnId, status: 'completed'|'cancelled'|'running', startedAt, durationMs? }`
- turn 子节点：`message`（用户）、`system_prompt`、若干 `step`
- step 子节点：`message`（助手），payload 为 `{ turnId, eventId, message: { role, content: parts }, streaming, timestamp }`
- 助手 parts 含 `reasoning`（带 text）、`tool_call`、最终 `text`；用户 parts 为 `text`
- `Transcript.cursor` 为完成内容边界（单调递增），可用作「内容是否前进」的判重游标