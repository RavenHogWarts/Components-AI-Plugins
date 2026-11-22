import { Plugin } from '@obsidian-components/ai-api';
import type { AiApp, ConversationViewProps, PluginManifest, TranscriptFactory, View } from '@obsidian-components/ai-api';
import { createElement } from 'react';
import { createReactView, mountSettingsView, SettingsStore } from 'ai-plugin-kit';
import { loadSettings, type PluginSettings } from './settings';
import { SessionDirectorySettingsView } from './settingsView';
import { createTocBlockRenderer } from './tocView';

/** conversationViewService 为内部插件服务，未在 ai-api 导出，此处以最小契约约束 */
interface ConversationViewService {
  registerBlock(block: View<ConversationViewProps>): void;
  unregisterBlock(id: string): void;
}

export default class SessionDirectoryPlugin extends Plugin {
  static inject = ['conversationViewService', 'transcriptFactory'] as const;

  private static readonly BLOCK_ID = 'session-toc.toc';

  private store?: SettingsStore<PluginSettings>;
  private conversation?: ConversationViewService;

  async onResolving(): Promise<void> {
    const { api } = this;
    this.store = new SettingsStore(api, loadSettings(await api.readData()), loadSettings);
    this.conversation = this.dependencies['conversationViewService'] as ConversationViewService;
    const factory = this.dependencies['transcriptFactory'] as TranscriptFactory;

    this.conversation.registerBlock({
      id: SessionDirectoryPlugin.BLOCK_ID,
      order: 2000,
      renderer: createTocBlockRenderer(factory, this.store),
    });

    this.provideSettingsView(api, this.store);
  }

  async onDisposing(): Promise<void> {
    // 释放本插件直接持有的注册（面板块 / 设置视图由框架代管）
    this.conversation?.unregisterBlock(SessionDirectoryPlugin.BLOCK_ID);
    this.conversation = undefined;
    this.store = undefined;
  }

  private provideSettingsView(
    api: SessionDirectoryPlugin['api'],
    store: SettingsStore<PluginSettings>,
  ): void {
    const Form = createReactView((input: {
      store: SettingsStore<PluginSettings>;
      app: AiApp;
      manifest: PluginManifest;
    }) => createElement(SessionDirectorySettingsView, input));
    mountSettingsView(api, Form, () => ({ app: api.app, manifest: api.manifest, store }));
  }
}
