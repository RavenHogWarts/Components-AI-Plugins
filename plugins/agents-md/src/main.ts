import { createElement } from 'react';
import { Plugin } from '@obsidian-components/ai-api';
import type { AiApp, MessageTransformer, PluginContext, PluginManifest } from '@obsidian-components/ai-api';
import { createReactView, createWorkspaceGuideTransformer, mountSettingsView, SettingsStore } from 'ai-plugin-kit';
import type { WorkspaceFileAccess } from 'ai-plugin-kit';
import { loadSettings, DEFAULT_SETTINGS, type PluginSettings } from './settings';
import { AgentsMdSettingsView } from './settingsView';

/** 文件读取 Agent 工具名（由 plugin.file-read-tools 提供，支持 path/offset/limit）。 */
const READ_TOOL_NAME = 'read_file';

export default class AgentsMdPlugin extends Plugin {
  static inject = ['workspaceManager'] as const;

  private store?: SettingsStore<PluginSettings>;
  private readonly transformer: MessageTransformer;

  constructor(dependencies: Record<string, unknown>, api: PluginContext) {
    super(dependencies, api);
    // 复用 ai-plugin-kit 的通用“工作区根目录指南注入”能力：
    // 追加到系统指令，只注入前 maxLines 行，其余内容提示用 read_file 按需读取
    this.transformer = createWorkspaceGuideTransformer({
      id: 'agents-md.guide',
      intent: '项目工作指南 AGENTS.md',
      workspace: dependencies['workspaceManager'] as WorkspaceFileAccess,
      isEnabled: () => this.store?.getSettings().enabled ?? true,
      filename: () => this.store?.getSettings().filename ?? DEFAULT_SETTINGS.filename,
      maxLines: () => this.store?.getSettings().maxLines ?? DEFAULT_SETTINGS.maxLines,
      matchRole: 'system',
      position: 'append',
      readMoreHint: ({ path, filename, totalLines, shownLines, remainingLines }) =>
        [
          '',
          `[提示] ${filename} 共 ${totalLines} 行，已展示前 ${shownLines} 行，剩余 ${remainingLines} 行未注入。`,
          `如需查看后续内容，请用 ${READ_TOOL_NAME} 工具按需读取：${READ_TOOL_NAME}({ path: "${path}", offset: ${shownLines + 1}, limit: ${remainingLines} })`,
        ].join('\n'),
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
