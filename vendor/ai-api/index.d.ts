/**
 * @obsidian-components/ai-api 本地类型声明（仅类型，无运行时代码）。
 *
 * 运行时该模块由应用插件加载器提供，构建时必须保持 external。
 * 声明依据官方契约文档（pluginManager / aiApp / sessionManager / eventBus /
 * transcriptFactory / modelProviderManager）整理，只覆盖本工作区用到的部分；
 * 未用到的成员以宽松类型占位。
 */

// ---------- 基础类型 ----------
export type JsonValue = string | number | boolean | null | JsonValue[] | { [key: string]: JsonValue };

export interface ModelRef {
  readonly provider: string;
  readonly model: string;
}

export interface ReasoningOptions {
  [key: string]: unknown;
}

export type SessionStatus = 'idle' | 'running' | 'interrupted' | 'unknown' | (string & {});

export interface AgentData {
  [key: string]: unknown;
  id: string;
  name: string;
  description?: string;
  systemPrompt?: string;
  tools: string[];
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

// ---------- 事件总线 ----------
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

// ---------- 会话 ----------
export interface EventData extends EventMessage {
  readonly id: string;
  readonly sessionId: string;
  readonly timestamp: number;
  readonly turnId?: string;
  readonly payload: unknown;
}

export interface Session {
  readonly id: string;
  readonly created: number;
  readonly parentId?: string;
  readonly data: SessionData;
  readonly status: SessionStatus;
  readonly events: readonly EventData[];
  readonly inbox: unknown;
  on(type: 'session.updated', listener: () => void): () => void;
  update(data: SessionData): Promise<void>;
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

export interface SessionManager {
  create(request?: CreateSessionRequest): Promise<Session>;
  getById(id: string): Promise<Session | null>;
  list(): Promise<readonly SessionData[]>;
  on<Type extends SessionManagerEvent['type']>(
    eventName: Type,
    callback: (event: Extract<SessionManagerEvent, { readonly type: Type }>) => void | Promise<void>,
  ): () => void;
  load(): Promise<void>;
  delete(id: string): Promise<void>;
}

// ---------- 转写（Transcript） ----------
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

// ---------- 模型 ----------
export interface ModelChoice {
  readonly ref: ModelRef;
  readonly label: string;
  readonly model: unknown;
  readonly providerName: string;
}

export interface ModelProviderManager {
  getModel(ref: ModelRef, overrides?: { readonly maxOutputTokens?: number }): Model;
  listChoices(): readonly ModelChoice[];
}

export interface BaseMessage {
  readonly id?: string;
  readonly metadata?: Readonly<Record<string, unknown>>;
  readonly timestamp?: number;
}

export interface UserMessagePart {
  readonly type: string;
  readonly text?: string;
  readonly [key: string]: unknown;
}

export interface UserMessage extends BaseMessage {
  readonly role: 'user';
  readonly content: readonly UserMessagePart[];
}

export interface AssistantMessagePart {
  readonly type: string;
  readonly text?: string;
  readonly [key: string]: unknown;
}

export interface AssistantMessage extends BaseMessage {
  readonly role: 'assistant';
  readonly content: readonly AssistantMessagePart[];
}

export type Message =
  | { readonly role: 'system'; readonly content: readonly UserMessagePart[] }
  | UserMessage
  | AssistantMessage
  | { readonly role: 'tool'; readonly content: readonly unknown[] };

export interface ModelRequest {
  readonly messages: readonly Message[];
  readonly tools?: readonly unknown[];
  readonly reasoning?: ReasoningOptions;
  readonly signal?: AbortSignal;
  readonly sessionId?: string;
}

export interface ModelResponse {
  message: AssistantMessage;
  usage?: unknown;
  finishReason?: string;
}

export interface Model {
  readonly data: unknown;
  generate(request: ModelRequest): Promise<ModelResponse>;
}

// ---------- 插件 ----------
export interface ViewRenderer {
  mount(container: HTMLElement): void;
  unmount?(): void;
}

export interface ViewRendererConstructor {
  new (): ViewRenderer;
}

export interface PluginManifest {
  readonly name: string;
  readonly version?: string;
  readonly description?: string;
  readonly [key: string]: unknown;
}

export interface AiApp {
  readonly eventBus: EventBusApi;
  readonly sessionManager: SessionManager;
  readonly transcriptFactory: TranscriptFactory;
  readonly modelProviderManager: ModelProviderManager;
  readonly [key: string]: unknown;
}

export interface PluginContext {
  readonly app: AiApp;
  readonly manifest: PluginManifest;
  /** 当前加载结束或应用停止时取消；私有工作必须观察它 */
  readonly signal: AbortSignal;
  setSettingsView(renderer: ViewRendererConstructor | undefined): void;
  registerService(service: unknown): Promise<void>;
  unregisterService(name: string): Promise<void>;
  getService(name: string): unknown;
  readData(): Promise<unknown>;
  writeData(value: unknown): Promise<void>;
}

export class Plugin {
  static inject?: readonly string[];
  protected constructor(
    dependencies: Record<string, unknown>,
    api: PluginContext,
  );
  protected readonly dependencies: Record<string, unknown>;
  readonly api: PluginContext;
  onResolving(): void | Promise<void> {}
  onResolved(): void | Promise<void> {}
  onApplicationReady(): void | Promise<void> {}
  onDisposing(): void | Promise<void> {}
  onDisposed(): void | Promise<void> {}
}
