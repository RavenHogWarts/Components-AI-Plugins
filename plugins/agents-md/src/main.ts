import { createElement } from 'react';
import { Plugin } from '@obsidian-components/ai-api';
import type { AiApp, MessageTransformer, PluginContext, PluginManifest } from '@obsidian-components/ai-api';
import { createReactView, createWorkspaceGuideTransformer, mountSettingsView, SettingsStore } from 'ai-plugin-kit';
import type { WorkspaceFileAccess } from 'ai-plugin-kit';
import { loadSettings, DEFAULT_SETTINGS, type PluginSettings } from './settings';
import { AgentsMdSettingsView } from './settingsView';

export default class AgentsMdPlugin extends Plugin {
  static inject = ['workspaceManager'] as const;

  private store?: SettingsStore<PluginSettings>;
  private readonly transformer: MessageTransformer;

  constructor(dependencies: Record<string, unknown>, api: PluginContext) {
    super(dependencies, api);
    // 复用 ai-plugin-kit 的通用“工作区根目录指南注入”能力；文件名/上限/启用随设置实时读取
    this.transformer = createWorkspaceGuideTransformer({
      id: 'agents-md.guide',
      intent: '项目工作指南 AGENTS.md',
      workspace: dependencies['workspaceManager'] as WorkspaceFileAccess,
      isEnabled: () => this.store?.getSettings().enabled ?? true,
      filename: () => this.store?.getSettings().filename ?? 'AGENTS.md',
      maxChars: () => this.store?.getSettings().maxChars ?? DEFAULT_SETTINGS.maxChars,
    });
  }

  async onResolving(): Promise<void> {
    this.store = new SettingsStore(this.api, loadSettings(await this.api.readData()), loadSettings);
    this.api.app.messageTransformerManager.register(this.transformer);
    this.provideSettingsView();
  }

  async onDisposing(): Promise<void> {
    // 直接持有的注册（消息转换器）在此撤销；设置视图由框架代管
    this.api.app.messageTransformerManager.unregister(this.transformer);
    this.store = undefined;
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
