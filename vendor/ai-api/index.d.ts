/**
 * @obsidian-components/ai-api 本地类型声明（仅类型，无运行时代码）。
 *
 * 运行时该模块由应用插件加载器提供，构建时必须保持 external。
 * 声明依据官方契约文档整理（docs/api/ 保存原始文档快照）。
 * 标注「internal」的类型实际属于 @obsidian-components/ai-internal-plugins
 * 等命名空间，此处统一收纳便于直接引用；运行时不受影响。
 */

// ==================== Summer 基础 ====================
export type ServiceName = string;

/** loose：服务定义 */
export interface ServiceDefinition {
  [key: string]: unknown;
}

export interface ApplicationContext {
  readonly status: string;
  readonly services: ReadonlyMap<string, unknown>;
  load(): Promise<void>;
  unload(): Promise<void>;
  registerService(service: ServiceDefinition): Promise<void>;
  unregisterService(name: ServiceName): Promise<void>;
  getService<Name extends ServiceName>(name: Name): unknown;
}

/** 幂等资源释放；调用方 await 异步清理并上报失败 */
export type Cleanup = () => void | Promise<void>;

// ==================== 基础数据类型 ====================
export type JsonValue = string | number | boolean | null | JsonValue[] | { [key: string]: JsonValue };

export interface ModelRef {
  readonly provider: string;
  readonly model: string;
}

export interface ReasoningOptions {
  readonly effort?: string;
  readonly enabled?: boolean;
  readonly budgetTokens?: number;
}

export type SessionStatus = 'idle' | 'running' | 'interrupted' | 'unknown';

export interface ToolExecutionOptions {
  [key: string]: unknown;
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

export interface SessionData {
  readonly id: string;
  readonly created: number;
  readonly parentId?: string;
  status?: string;
  title?: string;
  agent?: string | AgentData;
  model?: {
    readonly ref: ModelRef;
    readonly reasoning: ReasoningOptions;
  };
  options?: Readonly<Record<string, unknown>>;
}

export interface CreateSessionRequest {
  title?: string;
  agent?: string;
  model?: ModelRef;
  [key: string]: unknown;
}

export type SessionManagerEvent =
  | { readonly type: 'session.added'; readonly id: string }
  | { readonly type: 'session.updated'; readonly id: string }
  | { readonly type: 'session.removed'; readonly id: string };

// ==================== 事件总线 ====================
export interface EventMessage {
  readonly sessionId?: string;
  readonly turnId?: string;
  readonly type: string;
}

export type EventListener<Message> = (message: Message) => void | Promise<void>;

export interface EventBusApi {
  publish(message: EventMessage | readonly EventMessage[], signal?: AbortSignal): Promise<void>;
  subscribe(listener: EventListener<EventMessage>): () => void;
  once(predicate: (message: EventMessage) => boolean, signal?: AbortSignal): Promise<EventMessage>;
}

// ==================== 会话 ====================
export interface EventData extends EventMessage {
  readonly id: string;
  readonly sessionId: string;
  readonly timestamp: number;
  readonly turnId?: string;
  readonly payload: unknown;
}

/** loose */
export interface MessageInbox {
  [key: string]: unknown;
}

/** loose */
export interface InterruptionResolution<Payload = unknown> {
  [key: string]: unknown;
}

export interface Session {
  readonly id: string;
  readonly created: number;
  readonly parentId?: string;
  readonly data: SessionData;
  readonly status: SessionStatus;
  readonly events: readonly EventData[];
  readonly inbox: MessageInbox;
  on(type: 'session.updated', listener: () => void): () => void;
  update(data: SessionData): Promise<void>;
  append(message: UserMessage, fromMessageId?: string): Promise<void>;
  run(messageId: string, fromMessageId?: string): Promise<void>;
  edit(messageId: string, content: readonly UserMessagePart[]): Promise<void>;
  continue(): Promise<void>;
  stop(): Promise<void>;
  resolveInterruption<Payload = unknown>(resolution: InterruptionResolution<Payload>): Promise<void>;
}

export interface SessionManager {
  create(request?: CreateSessionRequest): Promise<Session>;
  resolveDefaults(agent?: string, model?: ModelRef): Promise<{
    readonly agent: AgentData;
    readonly model: { readonly ref: ModelRef; readonly reasoning: ReasoningOptions };
  }>;
  getById(id: string): Promise<Session | null>;
  list(): Promise<readonly SessionData[]>;
  getAncestors(id: string): Promise<readonly SessionData[]>;
  getDescendants(id: string): Promise<readonly SessionData[]>;
  getChildren(id: string): Promise<readonly SessionData[]>;
  fork(sessionId: string, targetEventId: string): Promise<string>;
  delete(id: string): Promise<void>;
  removeOrphans(): Promise<void>;
  on<Type extends SessionManagerEvent['type']>(
    eventName: Type,
    callback: (event: Extract<SessionManagerEvent, { readonly type: Type }>) => void | Promise<void>,
  ): () => void;
  load(): Promise<void>;
  unload(): Promise<void>;
}

// ==================== 消息部件与消息 ====================
export interface PartMetadata {
  [key: string]: unknown;
}

export interface BasePart<Metadata extends PartMetadata = PartMetadata> {
  readonly metadata?: Metadata;
}

export interface ReasoningPartMetadata extends PartMetadata {
  readonly startTime?: number;
  readonly endTime?: number;
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

// ==================== 转写（Transcript） ====================
export interface TranscriptNode {
  readonly key: string;
  readonly type: string;
  readonly payload: unknown;
  readonly children: readonly TranscriptNode[];
}

export interface Transcript {
  readonly nodes: readonly TranscriptNode[];
  readonly cursor: number;
  on(type: 'transcript.updated', listener: (nodes: readonly TranscriptNode[]) => void): () => void;
  on(type: 'transcript.failed', listener: (error: unknown) => void): () => void;
  close(): void;
}

export interface TranscriptFactory {
  create(session: Session): Transcript;
}

/** loose */
export interface TranscriptProjector {
  [key: string]: unknown;
}

export interface TranscriptProjectorManager {
  register(projector: TranscriptProjector): symbol;
  unregister(ref: symbol): void;
  list(): readonly TranscriptProjector[];
  on(type: 'transcript.projectors.change', listener: (event: unknown) => void | Promise<void>): () => void;
}
// ==================== 模型 ====================
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

/** Provider 报告的模型事实（不含用户字段） */
export interface ModelDetail {
  readonly modelId: string;
  readonly name?: string;
  readonly contextWindow?: number;
  readonly inputTokenLimit?: number;
  readonly outputTokenLimit?: number;
  readonly supportedInputTypes?: readonly ModelInputType[];
  readonly supportedOutputTypes?: readonly ModelOutputType[];
  readonly toolCalling?: boolean;
  readonly reasoning?: false | ReasoningCapabilities;
}

export interface ModelChoice {
  readonly ref: ModelRef;
  readonly label: string;
  readonly model: ModelData;
  readonly providerName: string;
}

export interface WebSearchInput {
  readonly query: string;
  readonly sessionId: string;
  readonly signal: AbortSignal;
}

export interface WebSearchResult {
  readonly url: string;
  readonly title?: string;
  readonly content?: string;
}

export interface WebSearchResponse {
  readonly results: readonly WebSearchResult[];
}

/** loose */
export interface WebFetchInput {
  readonly url: string;
  readonly signal: AbortSignal;
  [key: string]: unknown;
}

/** 从页面取回的文本 */
export interface WebFetchResponse {
  readonly title?: string;
  readonly content: string;
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

export interface ModelStreamChunk {
  delta: (TextPart | ReasoningPart | FilePart)[];
  usage?: Usage;
  finishReason?: FinishReason;
}

/** 可执行模型；generate 为独立调用入口（无需会话） */
export interface Model {
  readonly data: ModelData;
  readonly provider: ModelProvider;
  generate(request: ModelRequest): Promise<ModelResponse>;
  stream?(request: ModelRequest): AsyncIterable<ModelStreamChunk>;
  webSearch?(input: WebSearchInput): Promise<WebSearchResponse>;
  webFetch?(input: WebFetchInput): Promise<WebFetchResponse> | undefined;
}

/** 可执行连接：暴露已配置模型并创建 Model */
export interface ModelProvider {
  readonly name: string;
  readonly modelData: readonly ModelData[];
  createModel(data: ModelData): Model;
}

export interface ModelProviderData {
  readonly type: string;
  readonly name: string;
  readonly models: readonly ModelData[];
  readonly options?: unknown;
}

/** 工厂创建连接时的基础设施依赖 */
export interface ModelProviderFactoryContext {
  readonly http: HttpClient;
  readonly getEnv: (name: string) => string | undefined;
}

export interface ModelProviderFactory {
  readonly type: string;
  readonly name: string;
  readonly order?: number;
  match(data: ModelProviderData): boolean;
  createProvider(data: ModelProviderData, context: ModelProviderFactoryContext): ModelProvider;
}

export type ModelProviderEventMap = {
  'model.provider.added': { readonly type: 'model.provider.added' };
  'model.provider.updated': { readonly type: 'model.provider.updated' };
  'model.provider.removed': { readonly type: 'model.provider.removed' };
};

export interface ModelProviderManagerApi {
  register(factory: ModelProviderFactory): void;
  unregister(type: string): void;
  listProviders(): readonly ModelProviderFactory[];
  on(eventName: string, callback: (event: unknown) => void | Promise<void>): () => void;
  matchProvider(data: ModelProviderData): ModelProviderFactory | undefined;
  createProvider(data: ModelProviderData): ModelProvider;
  listModelProviderInstances(): readonly ModelProvider[];
  getModelProviderInstance(name: string): ModelProvider | undefined;
  listModels(): readonly Model[];
  getModelData(ref: ModelRef): ModelData;
  getModel(ref: ModelRef, overrides?: { readonly maxOutputTokens?: number }): Model;
}

/** 持久化连接（baseUrl/apiKey 供凭据复用） */
export interface ModelConnectionData {
  readonly type: string;
  readonly name: string;
  readonly baseUrl: string;
  readonly apiKey?: string;
  readonly templateId?: string;
  readonly models?: readonly unknown[];
  readonly options?: unknown;
  readonly [key: string]: unknown;
}

/** 连接编辑命令输入 */
export interface ModelConnectionDetails {
  readonly type: string;
  readonly name: string;
  readonly baseUrl: string;
  readonly apiKey?: string;
  readonly templateId?: string;
  readonly apiFormat?: string;
  readonly options?: unknown;
}

export interface ModelProviderTemplate {
  readonly id: string;
  readonly name: string;
  readonly description: string;
  readonly doc?: string;
  readonly type: string;
  readonly baseUrl?: string;
  readonly apiFormat?: string;
  readonly options?: unknown;
  readonly models?: readonly ModelDetail[];
}

export type ModelTemplateEventMap = {
  'model.template.added': { readonly type: 'model.template.added' };
  'model.template.updated': { readonly type: 'model.template.updated' };
  'model.template.removed': { readonly type: 'model.template.removed' };
};

export interface ModelProviderManager extends ModelProviderManagerApi {
  registerTemplate(template: ModelProviderTemplate): symbol;
  unregisterTemplate(ref: symbol): void;
  listTemplates(): readonly ModelProviderTemplate[];
  listConnections(): readonly ModelConnectionData[];
  addConnection(details: ModelConnectionDetails): Promise<void>;
  createConnection(templateId: string): Promise<ModelConnectionData>;
  updateConnection(previousName: string, details: ModelConnectionDetails, index?: number): Promise<void>;
  removeConnection(name: string, index?: number): Promise<void>;
  moveConnection(name: string, beforeName?: string): Promise<void>;
  addModel(connection: ModelConnectionData, modelId: string, suggestion?: ModelDetail, signal?: AbortSignal): Promise<ModelRef | undefined>;
  updateModel(previous: ModelRef, model: ModelData & { [key: string]: unknown }): Promise<void>;
  removeModel(ref: ModelRef): Promise<void>;
  listChoices(): readonly ModelChoice[];
}

// ==================== 工具（Agent Tool） ====================
/** 最小 JSON Schema 文档（LLM 工具定义用） */
export type JSONSchema = Readonly<Record<string, unknown>>;

export interface ToolSpec {
  readonly name: string;
  readonly description: string;
  readonly parameters: JSONSchema;
}

/** loose */
export interface ToolContext {
  [key: string]: unknown;
}

/** loose */
export interface ToolExecutionContext {
  readonly signal?: AbortSignal;
  [key: string]: unknown;
}

export interface Tool<Input = unknown> {
  readonly spec: ToolSpec;
  readonly deferLoading?: boolean;
  readonly needsApproval?: boolean;
  readonly enabledWhen?: (context: ToolContext) => boolean;
  execute(input: Input, context: ToolExecutionContext): ToolResult | Promise<ToolResult>;
}

export type ToolEvent =
  | { readonly type: 'tool.added'; readonly toolName: string }
  | { readonly type: 'tool.updated'; readonly toolName: string }
  | { readonly type: 'tool.removed'; readonly toolName: string };

export interface ToolQueryApi {
  get(name: string): Tool | undefined;
  list(): readonly Tool[];
}

export interface ToolManagerApi extends ToolQueryApi {
  containsTool(agent: AgentData, toolName: string): boolean;
  register<Input>(tool: Tool<Input>, signal?: AbortSignal): void;
  unregister(name: string): void;
  on<Type extends ToolEvent['type']>(
    eventName: Type,
    callback: (event: Extract<ToolEvent, { readonly type: Type }>) => void | Promise<void>,
  ): () => void;
}

// ==================== Hook / 消息变换 ====================
/** loose：Session 侧上下文与工具执行器 */
export interface SessionContext {
  [key: string]: unknown;
}
/** loose */
export interface Step {
  [key: string]: unknown;
}
/** loose */
export interface ToolExecutor {
  [key: string]: unknown;
}
/** loose */
export interface InterruptionRequest<Payload = unknown> {
  readonly requestId: string;
  readonly type: string;
  readonly payload: Payload;
  [key: string]: unknown;
}

/** 一次推进活动的固定选择与借用能力 */
export interface TurnExecutionContext extends SessionContext {
  readonly turnId: string;
  readonly history: readonly EventData[];
  readonly signal: AbortSignal;
  readonly agent: AgentData;
  readonly model: Model;
  readonly reasoning: ReasoningOptions;
  readonly options: Readonly<Record<string, unknown>>;
  readonly toolExecutor: ToolExecutor;
  interrupt<RequestedPayload = unknown, ResolvedPayload = unknown>(
    request: InterruptionRequest<RequestedPayload>,
  ): Promise<Interruption<RequestedPayload, ResolvedPayload>>;
}

export interface ToolCallsHookContext extends TurnExecutionContext {
  readonly calls: readonly ToolCallPart[];
}

export interface StepHookContext extends TurnExecutionContext {
  readonly step: Step;
  readonly tools: readonly Tool[];
}

export interface ModelRequestHookContext {
  readonly modelCallId: string;
  readonly model: Model;
  readonly request: ModelRequest;
  readonly signal: AbortSignal;
  readonly execution?: TurnExecutionContext;
  readonly history?: readonly EventData[];
}

export interface ToolCallHookContext extends TurnExecutionContext {
  readonly proposal: ToolCallPart;
  readonly call: ToolCallPart;
  readonly tool?: Tool;
}

export interface ContextProjectionContext {
  readonly turnId: string;
  readonly events: readonly EventData[];
  readonly model: ModelData;
}

export type TurnExecutionHook = (context: TurnExecutionContext, next: () => Promise<void>) => Promise<void>;
export type StepHook = (context: StepHookContext, next: () => Promise<void>) => Promise<void>;
export type ModelRequestHook = (context: ModelRequestHookContext, next: () => Promise<ModelResponse>) => Promise<ModelResponse>;
export type ToolCallHook = (context: ToolCallHookContext, next: (call: ToolCallPart) => Promise<ToolResult>) => Promise<ToolResult>;
export type BeforeToolCallsHook = (context: ToolCallsHookContext) => Promise<void>;
export type ContextProjector = (messages: readonly Message[], context: ContextProjectionContext) => readonly Message[];

export interface AgentHook {
  readonly aroundTurnExecution?: TurnExecutionHook;
  readonly aroundStep?: StepHook;
  readonly aroundModelRequest?: ModelRequestHook;
  readonly aroundToolCall?: ToolCallHook;
  readonly beforeToolCalls?: BeforeToolCallsHook;
  readonly projectContext?: ContextProjector;
}

export interface HookManagerApi {
  register(hook: AgentHook, ownerId: string, signal: AbortSignal, order?: number): symbol;
  unregister(ref: symbol): void;
  aroundTurnExecution(context: TurnExecutionContext, next: () => Promise<void>): Promise<void>;
  aroundStep(context: StepHookContext, next: () => Promise<void>): Promise<void>;
  aroundModelRequest(context: ModelRequestHookContext, next: () => Promise<ModelResponse>): Promise<ModelResponse>;
  aroundToolCall(context: ToolCallHookContext, next: (call: ToolCallPart) => Promise<ToolResult>): Promise<ToolResult>;
  beforeToolCalls(context: ToolCallsHookContext): Promise<void>;
  projectContext(events: readonly EventData[], turnId: string, model: ModelData): Message[];
}

/** 消息部件全集 */
export type Part = TextPart | ReasoningPart | FilePart | ToolCallPart | ToolCallResultPart;

export interface MessageCreatedEvent extends EventData {
  readonly durable: true;
  readonly type: 'message.created';
  readonly turnId: string;
  readonly payload: {
    readonly message: Message & { readonly id: string };
    readonly transforms: readonly MessageTransform[];
    readonly modelCallId?: string;
    readonly originMessageId?: string;
  };
}

export interface MessageTransform {
  readonly type: 'append' | 'prepend' | 'replace';
  readonly intent?: string;
  readonly content: readonly Part[];
}

export interface MessageTransformer {
  readonly id: string;
  readonly intent?: string;
  match(event: MessageCreatedEvent): boolean;
  transform(event: MessageCreatedEvent, context: TurnExecutionContext): MessageTransform | undefined | Promise<MessageTransform | undefined>;
}

export interface MessageTransformerManager {
  register(transformer: MessageTransformer): void;
  unregister(transformer: MessageTransformer): void;
  list(): readonly MessageTransformer[];
}

// ==================== 中断 ====================
/** loose */
export type InterruptionStatus = 'pending' | 'resolved';

export interface Interruption<RequestedPayload = unknown, ResolvedPayload = unknown> {
  readonly requestId: string;
  readonly sessionId: string;
  readonly turnId: string;
  readonly type: string;
  readonly payload: RequestedPayload;
  readonly created: number;
  readonly resolved: { readonly payload?: ResolvedPayload } | undefined;
  readonly status: InterruptionStatus;
}

/** 中断视图的场景输入 */
export interface InterruptionViewProps<App = unknown> {
  readonly app: App;
  readonly session: Session;
  readonly readOnly: boolean;
  readonly onViewSession?: (sessionId: string) => void;
  readonly refresh: () => Promise<void>;
  readonly requests: readonly Interruption[];
}

export interface InterruptionDefinition<App = unknown> {
  readonly type: string;
  readonly view?: ViewRendererConstructor<InterruptionViewProps<App>>;
  continue?(session: Session, interruptions: readonly Interruption[], signal: AbortSignal): Promise<void>;
  project?(requests: readonly Interruption[]): readonly Interruption[];
}

export interface InterruptionRegistration {
  readonly definition: InterruptionDefinition;
  readonly signal: AbortSignal;
}

export interface InterruptionDefinitionEvent {
  readonly type: string;
  [key: string]: unknown;
}

export interface InterruptionManager {
  register(definition: InterruptionDefinition, signal?: AbortSignal): symbol;
  unregister(ref: symbol): void;
  getRegistration(type: string): InterruptionRegistration | undefined;
  get(type: string): InterruptionDefinition | undefined;
  list(): readonly InterruptionDefinition[];
  listContinuable(interruptions: readonly Interruption[]): readonly Interruption[];
  on<T extends InterruptionDefinitionEvent['type']>(
    type: T,
    listener: (event: Extract<InterruptionDefinitionEvent, { readonly type: T }>) => void | Promise<void>,
  ): () => void;
}

// ==================== Agent 管理 ====================
export type AgentEvent =
  | { readonly type: 'agent.added'; readonly id: string }
  | { readonly type: 'agent.updated'; readonly id: string }
  | { readonly type: 'agent.removed'; readonly id: string };

export interface AgentManagerApi {
  create(agent: AgentData): Promise<AgentData>;
  save(agent: AgentData): Promise<AgentData>;
  getById(id: string): Promise<AgentData | null>;
  list(): Promise<AgentData[]>;
  delete(id: string): Promise<boolean>;
  on<Type extends AgentEvent['type']>(
    eventName: Type,
    listener: (event: Extract<AgentEvent, { readonly type: Type }>) => void | Promise<void>,
  ): () => void;
}

export interface AgentManager extends AgentManagerApi {
  register(agent: AgentData, signal?: AbortSignal): Promise<Cleanup>;
}
// ==================== 应用数据 ====================
export interface AppData {
  readonly aiBaseFolder: string;
  readonly defaultAgentId: string;
  readonly defaultModel?: {
    readonly ref: ModelRef;
    readonly reasoning?: ReasoningOptions;
  };
  readonly providers: readonly ModelConnectionData[];
}

export type AppDataChange = (current: AppData) => AppData | undefined;

export interface AppDataUpdatedEvent {
  readonly type: 'app.data.updated';
  readonly current: AppData;
}

export interface AppDataManager {
  get(): AppData;
  path(...parts: readonly string[]): string;
  on(type: 'app.data.updated', listener: (event: AppDataUpdatedEvent) => void | Promise<void>): Cleanup;
  update(change: AppDataChange): Promise<void>;
}

// ==================== 文件 ====================
export type FileType = 'file' | 'directory';

export interface FileStat {
  readonly type: FileType;
  readonly size?: number;
  readonly mtime?: number;
}

export interface FileEntry {
  readonly path: string;
  readonly type: FileType;
}

export interface FileChangeEvent {
  readonly type: 'create' | 'modify' | 'remove' | 'move';
  readonly path: string;
  readonly oldPath?: string;
}

export interface FileApi {
  readonly subscribe?: (listener: (event: FileChangeEvent) => void) => () => void;
  readonly getNativePath?: (path: string) => string;
  resolvePath(path: string): string;
  stat(path: string): Promise<FileStat | undefined>;
  readText(path: string): Promise<string>;
  read(path: string): Promise<Uint8Array>;
  write(path: string, content: string | Uint8Array): Promise<void>;
  append(path: string, content: string | Uint8Array): Promise<void>;
  process(path: string, change: (current: string | undefined) => string | undefined): Promise<void>;
  list(path: string): Promise<readonly FileEntry[]>;
  mkdir(path: string): Promise<void>;
  copy(source: string, destination: string): Promise<void>;
  move(source: string, destination: string): Promise<void>;
  remove(path: string): Promise<void>;
  trash(path: string): Promise<void>;
}

// ==================== i18n ====================
export interface Localizer<T extends object> {
  get(): Readonly<T>;
  dispose(): void;
}

/** loose */
export interface Translations<T> {
  [language: string]: T;
}

export interface I18n {
  readonly language: string;
  get<Name extends string>(namespace: Name): Readonly<Record<string, unknown>> | undefined;
  register<T extends Record<string, unknown>>(namespace: string, translations: Translations<T>): Localizer<T>;
}

// ==================== 面板 / 视图 ====================
export interface ViewRenderer {
  mount(container: HTMLElement): void;
  unmount?(): void;
}

export interface ViewRendererConstructor<Props extends object = Record<string, never>> {
  new (): {
    mount(container: HTMLElement, props?: Props): void;
    unmount?(): void;
  };
}

/** 可在多个位置独立挂载的视图（composer/conversation/footer 注册件的结构） */
export interface View<Props extends object = Record<string, never>> {
  readonly id: string;
  readonly order?: number;
  readonly renderer: ViewRendererConstructor<Props>;
}

/** 面板挂载视图的参数输入 */
export interface PanelViewProps {
  readonly params: ViewParams;
  readonly setParams: (params: ViewParams) => void;
  readonly signal: AbortSignal;
  readonly setHeader?: (header?: PanelHeader) => void;
  readonly close?: () => void | Promise<void>;
}

export interface PanelView extends View<PanelViewProps> {
  readonly title?: string;
  readonly icon?: string;
}

export type ViewParams = Readonly<Record<string, JsonValue>>;

export type PanelViewEvent =
  | { readonly type: 'panel.view.added'; readonly view: PanelView }
  | { readonly type: 'panel.view.removed'; readonly view: PanelView };

export type PanelOpenMode = 'current' | 'tab' | 'split' | 'panel';

export interface PanelViewManager {
  registerView(view: PanelView): void;
  unregisterView(viewId: string): void;
  getViews(): PanelView[];
  getView(viewId: string): PanelView | undefined;
  openView(viewId: string, params?: ViewParams, mode?: PanelOpenMode): Promise<void>;
  on(type: PanelViewEvent['type'], listener: (event: PanelViewEvent) => void | Promise<void>): () => void;
}

// ==================== Bot ====================
/** loose */
export interface BotProviderData {
  readonly id: string;
  readonly [key: string]: unknown;
}

/** loose */
export interface Bot {
  readonly [key: string]: unknown;
}

export interface BotProvider {
  readonly data: BotProviderData;
  list(): Promise<Bot[]>;
  getById(id: string): Promise<Bot | null>;
  on(event: 'bot.added' | 'bot.updated' | 'bot.removed', listener: (botId: string) => void): Cleanup;
}

export interface BotProviderManager {
  add(provider: BotProvider, signal?: AbortSignal): Promise<void>;
  remove(id: string): void;
  list(): Promise<readonly BotProvider[]>;
  getById(id: string): Promise<BotProvider | null>;
}

// ==================== HTTP ====================
export interface HttpRequest {
  readonly url: string;
  readonly method?: string;
  readonly headers?: Readonly<Record<string, string>>;
  readonly body?: string | ArrayBuffer;
  readonly signal?: AbortSignal;
  readonly redirect?: 'manual';
}

export interface HttpResponse<TBody> {
  readonly status: number;
  readonly statusText?: string;
  readonly headers: Readonly<Record<string, string>>;
  readonly body: TBody;
}

export interface HttpClient {
  request(request: HttpRequest): Promise<HttpResponse<ArrayBuffer>>;
  stream(request: HttpRequest): Promise<HttpResponse<ReadableStream<Uint8Array> | null>>;
}

export interface HttpClients {
  installClient(client: HttpClient, matches: (request: HttpRequest) => boolean, signal: AbortSignal): Cleanup;
  installStreamClient(client: HttpClient): Cleanup;
}

// ==================== 其他管理器 ====================
export interface MarkdownApi {
  render(content: string, container: HTMLElement, signal: AbortSignal): Promise<void>;
}

export interface AttachmentStore {
  save(bytes: Uint8Array, mediaType?: string, fileName?: string): Promise<string>;
}

export interface YamlApi {
  parse(content: string): unknown;
  stringify(value: JsonValue): string;
}

export interface Skill {
  readonly name: string;
  readonly description: string;
  readonly path: string;
  readonly author?: string;
  readonly version?: string;
}

export type SkillEvent =
  | { readonly type: 'skill.added'; readonly name: string }
  | { readonly type: 'skill.updated'; readonly name: string }
  | { readonly type: 'skill.removed'; readonly name: string };

export interface SkillManager {
  containsSkill(agent: AgentData, skillName: string): boolean;
  list(): readonly Skill[];
  on<T extends SkillEvent['type']>(
    type: T,
    listener: (event: Extract<SkillEvent, { readonly type: T }>) => void | Promise<void>,
  ): () => void;
  reload(): Promise<void>;
  create(name: string): Promise<Skill>;
  remove(path: string): Promise<void>;
}

// ==================== MCP ====================
/** loose */
export interface McpToolPage {
  readonly tools?: readonly unknown[];
  readonly nextCursor?: string;
  [key: string]: unknown;
}

/** loose */
export interface McpCallResult {
  readonly content?: readonly unknown[];
  readonly isError?: boolean;
  [key: string]: unknown;
}

export type McpServerStatus = 'connected' | 'disconnected' | 'connecting' | (string & {});

export interface McpServerData {
  readonly id: string;
  readonly name: string;
  readonly description?: string;
  readonly enabled: boolean;
  readonly url: string;
  readonly headers: Readonly<Record<string, string>>;
}

export interface McpServer {
  readonly data: McpServerData;
  readonly status: McpServerStatus;
  connect(): Promise<void>;
  disconnect(): Promise<void>;
  listTools(cursor?: string, signal?: AbortSignal): Promise<McpToolPage>;
  callTool(name: string, args: Readonly<Record<string, unknown>>, signal?: AbortSignal): Promise<McpCallResult>;
}

export type McpServerEvent =
  | { readonly type: 'mcp.server.added'; readonly id: string }
  | { readonly type: 'mcp.server.updated'; readonly id: string }
  | { readonly type: 'mcp.server.removed'; readonly id: string };

export interface McpManager {
  containsMcpServer(agent: AgentData, serverId: string): boolean;
  getServer(id: string): Promise<McpServer | null>;
  listServers(): Promise<readonly McpServer[]>;
  addServer(config: McpServerData): Promise<void>;
  updateServer(config: McpServerData): Promise<void>;
  removeServer(id: string): Promise<void>;
  on<T extends McpServerEvent['type']>(
    event: T,
    listener: (event: Extract<McpServerEvent, { readonly type: T }>) => void | Promise<void>,
  ): () => void;
}

// ==================== internal：对话/Composer/编辑器视图属性 ====================
// 实际命名空间 @obsidian-components/ai-internal-plugins；仅类型参考

/** Conversation 可读写的会话草稿字段 */
export interface ConversationSessionData {
  title?: SessionData['title'];
  agent?: SessionData['agent'];
  model?: SessionData['model'];
  options?: SessionData['options'];
}

export interface ConversationSessionDataProps {
  readonly sessionData: Readonly<ConversationSessionData>;
  readonly setSessionData: (update: (previous: Readonly<ConversationSessionData>) => ConversationSessionData) => Promise<void>;
}

export interface ComposerViewProps extends ConversationSessionDataProps {
  readonly aiApp: AiApp;
  readonly session?: Session;
  readonly editor?: ComposerEditorInstance;
  readonly onSubmit: (content: UserMessagePart[]) => Promise<void>;
  readonly defaultContent?: UserMessagePart[];
}

export interface ConversationViewProps extends ConversationSessionDataProps {
  readonly aiApp: AiApp;
  readonly session?: Session;
  readonly defaultContent?: UserMessagePart[];
  readonly onSessionIdChange: (sessionId: string) => void;
}

export interface ComposerEditorViewProps extends ConversationSessionDataProps {
  readonly aiApp: AiApp;
  readonly session?: Session;
  readonly onSubmit?: (content: UserMessagePart[]) => void | Promise<void>;
  readonly disabled?: boolean;
  readonly placeholder?: string;
  readonly defaultContent?: readonly UserMessagePart[];
  readonly content?: readonly UserMessagePart[];
  readonly onContentChange?: (content: readonly UserMessagePart[]) => void;
  readonly onEditorReady?: (editor: unknown) => void;
  readonly onEditorDestroy?: (editor: unknown) => void;
}

// ==================== internal：Job（定时任务） ====================

export interface Job {
  readonly id: string;
  readonly title: string;
  readonly agentId?: string;
  readonly sessionId?: string;
  readonly instruction: string;
  /** iCalendar 文本（本地 DTSTART + IANA TZID；省略 RRULE 行则只跑一次） */
  readonly schedule: string;
}

export type JobExecutionStatus = 'pending' | 'paused' | 'completed' | 'failed' | (string & {});

export interface JobExecution {
  readonly id: string;
  readonly jobId: string;
  readonly scheduledAt?: number;
  readonly createdAt: number;
  readonly sessionId?: string;
  readonly status: JobExecutionStatus;
  readonly error?: string;
}

/** loose：事件载荷 */
export interface JobEventMap {
  'job.added': { readonly jobId: string };
  'job.updated': { readonly jobId: string };
  'job.removed': { readonly jobId: string };
  'jobs.reset': Record<string, never>;
  'job.execution.created': { readonly executionId: string; readonly jobId: string };
  'job.execution.started': { readonly executionId: string; readonly jobId: string };
  'job.execution.paused': { readonly executionId: string; readonly jobId: string };
  'job.execution.resumed': { readonly executionId: string; readonly jobId: string };
  'job.execution.completed': { readonly executionId: string; readonly jobId: string };
  'job.execution.failed': { readonly executionId: string; readonly jobId: string };
  'job.execution.cancelled': { readonly executionId: string; readonly jobId: string };
  'job.execution.unavailable': { readonly executionId: string; readonly jobId: string };
}

export interface JobManager {
  listJobs(): Promise<readonly Job[]>;
  saveJob(job: Job): Promise<void>;
  deleteJob(jobId: string): Promise<void>;
  resetJobs(): Promise<void>;
  executeJob(jobId: string): Promise<string>;
  listJobExecutions(jobId?: string): Promise<readonly JobExecution[]>;
  getJobExecution(executionId: string): Promise<JobExecution | undefined>;
  on<Type extends keyof JobEventMap>(eventName: Type, listener: (event: JobEventMap[Type]) => void | Promise<void>): () => void;
}

// ==================== 插件管理器 ====================
export interface PluginManifest {
  readonly name: string;
  readonly version?: string;
  readonly description?: string;
  readonly [key: string]: unknown;
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

export type PluginEvent =
  | { readonly type: 'plugin.added'; readonly pluginName: string; readonly current: PluginInfo }
  | { readonly type: 'plugin.updated'; readonly pluginName: string; readonly current: PluginInfo }
  | { readonly type: 'plugin.removed'; readonly pluginName: string };

export interface PluginManager {
  list(): readonly PluginInfo[];
  get(name: string): PluginInfo | undefined;
  isPluginService(name: string): boolean;
  on<T extends PluginEvent['type']>(
    type: T,
    listener: (event: Extract<PluginEvent, { readonly type: T }>) => void | Promise<void>,
  ): () => void;
  setEnabled(name: string, enabled: boolean): Promise<void>;
  reload(name: string): Promise<void>;
  delete(name: string): Promise<void>;
  refresh(): Promise<void>;
  readData(name: string): Promise<JsonValue | undefined>;
  writeData(name: string, value: JsonValue): Promise<void>;
}

// ==================== 插件上下文与基类 ====================
/** 当前插件加载的 JSON 数据访问；数据在卸载/重载后保留 */
export interface PluginDataApi {
  readData(): Promise<unknown>;
  writeData(value: unknown): Promise<void>;
}

export interface AiApp {
  readonly applicationContext: ApplicationContext;
  readonly i18n: I18n;
  readonly agentManager: AgentManager;
  readonly sessionManager: SessionManager;
  readonly hookManager: HookManagerApi;
  readonly messageTransformerManager: MessageTransformerManager;
  readonly interruptionManager: InterruptionManager;
  readonly transcriptProjectorManager: TranscriptProjectorManager;
  readonly transcriptFactory: TranscriptFactory;
  readonly modelProviderManager: ModelProviderManager;
  readonly toolManager: ToolManagerApi;
  readonly eventBus: EventBusApi;
  readonly panelViewManager: PanelViewManager;
  readonly files: FileApi;
  readonly appDataManager: AppDataManager;
  readonly pluginManager: PluginManager;
  readonly skillManager: SkillManager;
  readonly botProviderManager: BotProviderManager;
  readonly mcpManager: McpManager;
  readonly httpClient: HttpClient;
}

export interface PluginContext extends PluginDataApi {
  readonly app: AiApp;
  readonly manifest: PluginManifest;
  /** 当前加载结束或应用停止时取消；私有工作必须观察它 */
  readonly signal: AbortSignal;
  setSettingsView(renderer: ViewRendererConstructor | undefined): void;
  registerService(service: ServiceDefinition): Promise<void>;
  unregisterService(name: ServiceName): Promise<void>;
  getService(name: ServiceName): unknown;
}

/**
 * 插件基类。default export 一个具体子类。
 * 生命周期钩子带 ApplicationContext 参数（子类覆盖时可省略）。
 */
export declare class Plugin {
  static readonly inject: readonly ServiceName[];
  constructor(dependencies: Record<string, unknown>, api: PluginContext);
  protected readonly dependencies: Record<string, unknown>;
  readonly api: PluginContext;
  onResolving(_context: ApplicationContext): void | Promise<void>;
  onResolved(_context: ApplicationContext): void | Promise<void>;
  onDisposing(_context: ApplicationContext): void | Promise<void>;
  onDisposed(_context: ApplicationContext): void | Promise<void>;
  onApplicationReady(): void | Promise<void>;
}
// ==================== 第三轮补全：编辑器/视图/搜索/面板/xdb ====================

/** Composer 编辑区实例（扩展与控件借用；只释放自己安装的部分） */
export interface ComposerEditorInstance {
  readonly app: AiApp;
  readonly editorView: unknown | undefined;
  getSession(): Session | undefined;
  getContent(): readonly UserMessagePart[];
  setContent(content: readonly UserMessagePart[]): void;
  onContentChange(listener: (content: readonly UserMessagePart[]) => void): () => void;
}

/** Composer 头/底集合变更事件名 */
export type ComposerViewEvent = 'composer.header-item.changed' | 'composer.footer-item.changed';
export type ComposerEditorViewEvent =
  | 'composer-editor.header-item.changed'
  | 'composer-editor.footer-item.changed'
  | 'composer-editor.codemirror-extension.changed';

/** 为当前编辑区构建 CodeMirror 扩展 */
export type EditorExtension = (editor: ComposerEditorInstance) => unknown;

/** 面板标题与操作 */
export interface PanelHeader {
  readonly title?: string;
  readonly actions?: readonly unknown[];
  readonly menu?: readonly (readonly unknown[])[];
}

/** Web 搜索提供者（web_search/web_fetch 工具后端） */
export interface WebSearchRequest {
  readonly query: string;
  readonly limit?: number;
}
export interface WebFetchRequest {
  readonly url: string;
  readonly timeout?: number;
}
export interface WebFetchResult extends WebFetchResponse {
  readonly providerName: string;
}
export interface WebSearchProviderData {
  readonly id: string;
  readonly name: string;
}
export interface WebSearchProvider {
  readonly data: WebSearchProviderData;
  search(request: WebSearchRequest, signal: AbortSignal): Promise<WebSearchResponse>;
  fetch?(request: WebFetchRequest, signal: AbortSignal): Promise<WebFetchResult>;
}
export type WebSearchProviderEvent =
  | { readonly type: 'web-search.provider.added'; readonly providerId: string }
  | { readonly type: 'web-search.provider.removed'; readonly providerId: string }
  | { readonly type: 'web-search.default-provider.updated'; readonly providerId?: string };

/** AI SDK 连接格式与请求覆写 */
export type ApiFormat = 'openai_chat_completions' | 'openai_responses' | 'anthropic_messages';
export interface HttpRequestOverrides {
  readonly extraBody?: Readonly<Record<string, JsonValue>>;
  readonly extraHeaders?: Readonly<Record<string, string>>;
}
export interface AiSdkConnectionOptions extends HttpRequestOverrides {
  readonly streaming?: boolean;
}

/** 转写节点视图（对话面板自定义节点渲染/命令） */
export interface NodeViewProps {
  [key: string]: unknown;
}
/** loose：节点视图定义 */
export interface NodeViewDefinition {
  [key: string]: unknown;
}
/** loose：节点命令定义 */
export interface NodeActionDefinition {
  readonly id?: string;
  [key: string]: unknown;
}
export interface TranscriptView {
  registerTurnProgress(item: View<NodeViewProps>): void;
  unregisterTurnProgress(id: string): void;
  registerNodeView(definition: NodeViewDefinition, options?: { readonly signal?: AbortSignal }): symbol;
  unregisterNodeView(ref: symbol): void;
  listNodeViews(): readonly NodeViewDefinition[];
  registerNodeAction(definition: NodeActionDefinition): symbol;
  unregisterNodeAction(ref: symbol): void;
  listNodeActions(): readonly NodeActionDefinition[];
  onNode(type: string, listener: (event: unknown) => void | Promise<void>): () => void;
}

// ==================== xdb 数据库（.xdb 文件编程访问） ====================

/** loose：字段/视图/行/全局过滤子 API */
export interface XdbFieldApi { [key: string]: unknown; }
export interface XdbGlobalFilterApi { [key: string]: unknown; }
export interface XdbViewApi { [key: string]: unknown; }
export interface XdbRowApi {
  [key: string]: unknown;
}
/** loose */
export interface FilterItem {
  [key: string]: unknown;
}
/** loose */
export interface DatabaseContext {
  [key: string]: unknown;
}
/** loose */
export interface DatabaseData {
  readonly rows: readonly { readonly id: string; readonly [field: string]: unknown }[];
  readonly [key: string]: unknown;
}
/** loose */
export interface DatabaseDefinitionSnapshot {
  [key: string]: unknown;
}
/** loose */
export interface DatabaseDataSnapshot {
  [key: string]: unknown;
}
export type DatabaseSubscriber = () => void;
export type DatabaseUnsubscribe = () => void;

export interface Database extends XdbFieldApi, XdbGlobalFilterApi, XdbViewApi, XdbRowApi {
  getId(): string;
  getDefinitionPath(): string;
  getDefinition(): DatabaseDefinitionSnapshot;
  subscribeDefinition(listener: DatabaseSubscriber): DatabaseUnsubscribe;
  getDataSnapshot(context?: DatabaseContext): DatabaseDataSnapshot | null;
  subscribeData(listener: DatabaseSubscriber, context?: DatabaseContext): DatabaseUnsubscribe;
  getData(filter?: FilterItem, context?: DatabaseContext): Promise<DatabaseData>;
  getAllData(filter?: FilterItem, context?: DatabaseContext): Promise<DatabaseData>;
  matchesFilter(item: Record<string, unknown>, filter: FilterItem, context?: DatabaseContext): boolean;
  evaluateFormula(expression: string, item: Record<string, unknown>, context?: DatabaseContext): unknown;
  updateSource(source: string, options?: Record<string, unknown>): Promise<void>;
  activate(): Promise<void>;
  freeze(): Promise<void>;
  flush(): Promise<void>;
  unload(): Promise<void>;
}

export interface DatabaseManager {
  open(path: string): Promise<Database>;
  close(database: Database): Promise<void>;
}