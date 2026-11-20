/**
 * @obsidian-components/ai-api 本地类型声明（仅类型，无运行时代码）。
 *
 * 运行时该模块由应用插件加载器提供，构建时必须保持 external。
 * 声明依据官方契约文档整理（docs/api/ 保存了原始文档），
 * 覆盖插件开发完整面：消息/模型/会话/事件/转写/插件生命周期/全部 AiApp 服务。
 * 未取到文档的辅助类型以宽松占位（标注 loose）。
 */

// ==================== Summer 基础 ====================
/** loose：服务名（实际为 keyof Services & string） */
export type ServiceName = string;
/** loose：服务定义 */
export interface ServiceDefinition {
  [key: string]: unknown;
}
/** 应用上下文（Summer 容器） */
export interface ApplicationContext {
  readonly status: string;
  readonly services: ReadonlyMap<string, unknown>;
  load(): Promise<void>;
  unload(): Promise<void>;
  registerService(service: ServiceDefinition): Promise<void>;
  unregisterService(name: ServiceName): Promise<void>;
  getService<Name extends ServiceName>(name: Name): unknown;
}

// ==================== 基础数据类型 ====================
export type JsonValue = string | number | boolean | null | JsonValue[] | { [key: string]: JsonValue };

/** 模型结构化标识：provider 为连接名，model 为服务端模型 id */
export interface ModelRef {
  readonly provider: string;
  readonly model: string;
}

/** 单次请求的推理选择；不持久化在模型配置上 */
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

export interface EventBusApi {
  publish(message: EventMessage | readonly EventMessage[], signal?: AbortSignal): Promise<void>;
  subscribe(listener: (message: EventMessage) => void): () => void;
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

export interface MessageInbox {
  [key: string]: unknown;
}

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

/** loose：转写投影规则 */
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

export interface ModelChoice {
  readonly ref: ModelRef;
  readonly label: string;
  readonly model: ModelData;
  readonly providerName: string;
}

export interface WebSearchInput {
  [key: string]: unknown;
}
export interface WebSearchResponse {
  [key: string]: unknown;
}
export interface WebFetchInput {
  [key: string]: unknown;
}
export interface WebFetchResponse {
  [key: string]: unknown;
}

export interface ModelRequest {
  readonly messages: readonly Message[];
  readonly tools?: readonly unknown[];
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
  generate(request: ModelRequest): Promise<ModelResponse>;
  webSearch?(input: WebSearchInput): Promise<WebSearchResponse>;
  webFetch?(input: WebFetchInput): Promise<WebFetchResponse> | undefined;
}

/** loose */
export interface ModelProvider {
  [key: string]: unknown;
}
/** loose */
export interface ModelProviderData {
  [key: string]: unknown;
}
/** loose */
export interface ModelProviderFactory {
  [key: string]: unknown;
}

export interface ModelProviderManagerApi {
  register(factory: ModelProviderFactory): void;
  unregister(type: string): void;
  listProviders(): readonly ModelProviderFactory[];
  on<T extends string>(eventName: T, callback: (event: unknown) => void | Promise<void>): () => void;
  matchProvider(data: ModelProviderData): ModelProviderFactory | undefined;
  createProvider(data: ModelProviderData): ModelProvider;
  listModelProviderInstances(): readonly ModelProvider[];
  getModelProviderInstance(name: string): ModelProvider | undefined;
  listModels(): readonly Model[];
  getModelData(ref: ModelRef): ModelData;
  getModel(ref: ModelRef, overrides?: { readonly maxOutputTokens?: number }): Model;
}

/** loose：模型连接与配置编辑（详见 docs/api/services.md） */
export interface ModelConnectionData {
  [key: string]: unknown;
}
/** loose */
export interface ModelConnectionDetails {
  [key: string]: unknown;
}
/** loose */
export interface ModelProviderTemplate {
  [key: string]: unknown;
}
/** loose */
export interface AiSdkModelData {
  [key: string]: unknown;
}
/** loose */
export interface ModelDetail {
  [key: string]: unknown;
}

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
  updateModel(previous: ModelRef, model: AiSdkModelData): Promise<void>;
  removeModel(ref: ModelRef): Promise<void>;
  listChoices(): readonly ModelChoice[];
}

// ==================== Hook / 工具 / 消息变换 ====================
/** loose：Agent 执行钩子（aroundTurnExecution / aroundStep / aroundModelRequest / aroundToolCall / beforeToolCalls / projectContext） */
export interface AgentHook {
  [key: string]: unknown;
}

export interface HookManagerApi {
  register(hook: AgentHook, ownerId: string, signal: AbortSignal, order?: number): symbol;
  unregister(ref: symbol): void;
  aroundTurnExecution(context: unknown, next: () => Promise<void>): Promise<void>;
  aroundStep(context: unknown, next: () => Promise<void>): Promise<void>;
  aroundModelRequest(context: unknown, next: () => Promise<ModelResponse>): Promise<ModelResponse>;
  aroundToolCall(context: unknown, next: () => Promise<ToolResult>): Promise<ToolResult>;
  beforeToolCalls(context: unknown): Promise<void>;
  projectContext(events: readonly EventData[], turnId: string, model: ModelData): Message[];
}

/** loose */
export interface MessageTransformer {
  readonly id: string;
  [key: string]: unknown;
}

export interface MessageTransformerManager {
  register(transformer: MessageTransformer): void;
  unregister(transformer: MessageTransformer): void;
  list(): readonly MessageTransformer[];
}

/** loose */
export interface Tool {
  readonly name?: string;
  [key: string]: unknown;
}
/** loose */
export interface ToolEvent {
  readonly type: string;
  [key: string]: unknown;
}
/** loose */
export interface ToolQueryApi {
  [key: string]: unknown;
}

export interface ToolManagerApi extends ToolQueryApi {
  containsTool(agent: AgentData, toolName: string): boolean;
  register<Input>(tool: Tool, signal?: AbortSignal): void;
  unregister(name: string): void;
  on<Type extends ToolEvent['type']>(
    eventName: Type,
    callback: (event: Extract<ToolEvent, { readonly type: Type }>) => void | Promise<void>,
  ): () => void;
}

// ==================== 中断 ====================
/** loose */
export interface InterruptionDefinition<App = unknown> {
  readonly type: string;
  [key: string]: unknown;
}
/** loose */
export interface InterruptionRegistration {
  [key: string]: unknown;
}
/** loose */
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
  listContinuable(interruptions: readonly unknown[]): readonly unknown[];
  on<T extends InterruptionDefinitionEvent['type']>(
    type: T,
    listener: (event: Extract<InterruptionDefinitionEvent, { readonly type: T }>) => void | Promise<void>,
  ): () => void;
}

// ==================== 其他管理器 ====================
/** loose：Agent 查询基座 */
export interface AgentManagerApi {
  [key: string]: unknown;
}
/** loose */
export interface Cleanup {
  (): Promise<void> | void;
}

export interface AgentManager extends AgentManagerApi {
  register(agent: AgentData, signal?: AbortSignal): Promise<Cleanup>;
}

/** loose */
export interface AppData {
  [key: string]: unknown;
}
/** loose */
export interface AppDataUpdatedEvent {
  readonly current: AppData;
}
/** loose */
export interface AppDataChange {
  (current: AppData): AppData | undefined;
}

export interface AppDataManager {
  get(): AppData;
  path(...parts: readonly string[]): string;
  on(type: 'app.data.updated', listener: (event: AppDataUpdatedEvent) => void | Promise<void>): Cleanup;
  update(change: AppDataChange): Promise<void>;
}

/** loose */
export interface FileStat {
  [key: string]: unknown;
}
/** loose */
export interface FileEntry {
  [key: string]: unknown;
}
/** loose */
export interface FileChangeEvent {
  [key: string]: unknown;
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

/** loose */
export interface Translations<T> {
  [language: string]: T;
}
/** loose */
export interface Localizer<T> {
  get(): T;
  dispose(): void;
}

export interface I18n {
  readonly language: string;
  get<Name extends string>(namespace: Name): Readonly<Record<string, unknown>> | undefined;
  register<T extends Record<string, unknown>>(namespace: string, translations: Translations<T>): Localizer<T>;
}

/** loose */
export interface PanelView {
  readonly id?: string;
  [key: string]: unknown;
}
/** loose */
export interface ViewParams {
  [key: string]: unknown;
}
/** loose */
export interface PanelViewEvent {
  readonly type: string;
  [key: string]: unknown;
}

export interface PanelViewManager {
  registerView(view: PanelView): void;
  unregisterView(viewId: string): void;
  getViews(): PanelView[];
  getView(viewId: string): PanelView | undefined;
  openView(viewId: string, params?: ViewParams, mode?: string): Promise<void>;
  on(type: PanelViewEvent['type'], listener: (event: PanelViewEvent) => void | Promise<void>): () => void;
}

/** loose */
export interface BotProvider {
  readonly data?: { readonly id: string; [key: string]: unknown };
  [key: string]: unknown;
}

export interface BotProviderManager {
  add(provider: BotProvider, signal?: AbortSignal): Promise<void>;
  remove(id: string): void;
  list(): Promise<readonly BotProvider[]>;
  getById(id: string): Promise<BotProvider | null>;
}

/** loose */
export interface HttpRequest {
  readonly url: string;
  [key: string]: unknown;
}
/** loose */
export interface HttpResponse<Body> {
  readonly status: number;
  readonly headers: Record<string, string>;
  readonly body: Body;
}

export interface HttpClient {
  request(request: HttpRequest): Promise<HttpResponse<ArrayBuffer>>;
  stream(request: HttpRequest): Promise<HttpResponse<ReadableStream<Uint8Array> | null>>;
}

export interface HttpClients {
  installClient(client: HttpClient, matches: (request: HttpRequest) => boolean, signal: AbortSignal): Cleanup;
  installStreamClient(client: HttpClient): Cleanup;
}

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

/** loose */
export interface Skill {
  [key: string]: unknown;
}
/** loose */
export interface SkillEvent {
  readonly type: string;
  [key: string]: unknown;
}

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

/** loose */
export interface McpServer {
  [key: string]: unknown;
}
/** loose */
export interface McpServerData {
  [key: string]: unknown;
}
/** loose */
export interface McpServerEvent {
  readonly type: string;
  [key: string]: unknown;
}

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

export interface PluginAddedEvent {
  readonly type: 'plugin.added';
  readonly pluginName: string;
  readonly current: PluginInfo;
}
export interface PluginUpdatedEvent {
  readonly type: 'plugin.updated';
  readonly pluginName: string;
  readonly current: PluginInfo;
}
export interface PluginRemovedEvent {
  readonly type: 'plugin.removed';
  readonly pluginName: string;
}
export type PluginEvent = PluginAddedEvent | PluginUpdatedEvent | PluginRemovedEvent;

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
export interface ViewRenderer {
  mount(container: HTMLElement): void;
  unmount?(): void;
}

export interface ViewRendererConstructor {
  new (): ViewRenderer;
}

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
  getService<Name extends ServiceName>(name: Name): unknown;
}

/**
 * 插件基类。default export 一个具体子类。
 * 生命周期钩子带 ApplicationContext 参数（可省略不写）。
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