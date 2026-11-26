import { createElement } from 'react';
import { Plugin } from '@obsidian-components/ai-api';
import type {
  AiApp,
  FileApi,
  MessageTransform,
  MessageTransformer,
  PluginContext,
  PluginManifest,
  TurnExecutionContext,
} from '@obsidian-components/ai-api';
import { createReactView, mountSettingsView, SettingsStore } from 'ai-plugin-kit';
import { loadSettings, type PluginSettings } from './settings';
import { AgentsMdSettingsView } from './settingsView';

/** workspaceManager 服务名未在 ai-api 导出，此处以最小契约约束 */
interface WorkspaceManagerApi {
  getWorkspacePath(workspaceId?: string): string;
  getWorkspaceFileApi(): FileApi;
}

interface SessionDataWithWorkspace {
  workspaceId?: string;
}

/**
 * 把 base 与 name 拼接成平台路径；优先复用 base 中已有的分隔符，
 * 避免 Windows 与 POSIX 路径分隔符混用导致读取失败。
 */
function joinPath(base: string, name: string): string {
  const sep = base.includes('\\') ? '\\' : base.includes('/') ? '/' : '/';
  return base.endsWith(sep) ? base + name : base + sep + name;
}

export default class AgentsMdPlugin extends Plugin {
  static inject = ['workspaceManager'] as const;

  private store?: SettingsStore<PluginSettings>;
  private workspace?: WorkspaceManagerApi;
  private readonly transformer: MessageTransformer;

  constructor(dependencies: Record<string, unknown>, api: PluginContext) {
    super(dependencies, api);
    this.transformer = {
      id: 'agents-md.guide',
      intent: '项目工作指南 AGENTS.md',
      match: (event) => event.payload.message.role === 'user',
      transform: async (_event, context) => this.buildGuide(context),
    };
  }

  async onResolving(): Promise<void> {
    this.workspace = this.dependencies['workspaceManager'] as WorkspaceManagerApi;
    this.store = new SettingsStore(this.api, loadSettings(await this.api.readData()), loadSettings);
    this.api.app.messageTransformerManager.register(this.transformer);
    this.provideSettingsView();
  }

  async onDisposing(): Promise<void> {
    // 直接持有的注册（消息转换器）在此撤销；设置视图由框架代管
    this.api.app.messageTransformerManager.unregister(this.transformer);
    this.store = undefined;
    this.workspace = undefined;
  }

  /** 构造本次用户消息的指南注入；无指南或未启用时返回 undefined（不注入） */
  private async buildGuide(context: TurnExecutionContext): Promise<MessageTransform | undefined> {
    const store = this.store;
    const workspace = this.workspace;
    if (!store || !workspace || context.signal.aborted) return undefined;

    const settings = store.getSettings();
    if (!settings.enabled) return undefined;

    const sessionData = context.session.data as unknown as SessionDataWithWorkspace;
    let workspacePath: string;
    try {
      workspacePath = workspace.getWorkspacePath(sessionData.workspaceId);
    } catch {
      // 未知或失效的工作区 ID：回退到 Vault 根目录
      workspacePath = workspace.getWorkspacePath();
    }

    const content = await this.readGuide(workspace, workspacePath, settings);
    if (!content || context.signal.aborted) return undefined;
    return {
      type: 'prepend',
      intent: '项目工作指南 AGENTS.md',
      content: [{ type: 'text', text: content }],
    };
  }

  /** 读取并包装项目工作指南；文件缺失、不可读或为空时返回 undefined */
  private async readGuide(
    workspace: WorkspaceManagerApi,
    workspacePath: string,
    settings: PluginSettings,
  ): Promise<string | undefined> {
    const fileApi = workspace.getWorkspaceFileApi();
    const target = joinPath(workspacePath, settings.filename);
    let text: string;
    try {
      text = await fileApi.readText(target);
    } catch {
      return undefined;
    }
    if (!text.trim()) return undefined;
    const limited = text.length > settings.maxChars ? text.slice(0, settings.maxChars) : text;
    const tag = `${settings.filename} 项目工作指南`;
    return ['<system_reminder>', `<${tag}>`, limited, `</${tag}>`, '</system_reminder>'].join('\n');
  }

  private provideSettingsView(): void {
    const api = this.api;
    const store = this.store;
    if (!store) return;
    const Form = createReactView((input: { store: SettingsStore<PluginSettings>; app: AiApp; manifest: PluginManifest }) =>
      createElement(AgentsMdSettingsView, input),
    );
    mountSettingsView(api, Form, () => ({ store, app: api.app, manifest: api.manifest }));
  }
}
