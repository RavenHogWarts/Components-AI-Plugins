import { Plugin } from '@obsidian-components/ai-api';
import type {
  AiApp,
  EventBusApi,
  ModelProviderManager,
  PluginManifest,
  SessionManager,
  TranscriptFactory,
} from '@obsidian-components/ai-api';
import { createElement } from 'react';
import { loadSettings, type PluginSettings } from './settings';
import { createReactView, mountSettingsView, SettingsStore } from 'ai-plugin-kit';
import { LiveSessionTitleSettingsView } from './settingsView';
import { TitleService } from './titleService';

export default class LiveSessionTitlePlugin extends Plugin {
  static inject = [
    'eventBus',
    'sessionManager',
    'modelProviderManager',
    'transcriptFactory',
  ] as const;

  private store?: SettingsStore<PluginSettings>;
  private titleService?: TitleService;

  async onResolving(): Promise<void> {
    const { api } = this;
    this.store = new SettingsStore(api, loadSettings(await api.readData()), loadSettings);
    this.titleService = new TitleService(
      {
        eventBus: this.dependencies['eventBus'] as EventBusApi,
        sessionManager: this.dependencies['sessionManager'] as SessionManager,
        modelProviderManager: this.dependencies['modelProviderManager'] as ModelProviderManager,
        transcriptFactory: this.dependencies['transcriptFactory'] as TranscriptFactory,
      },
      this.store.getSettings,
      api.signal,
    );
    this.titleService.start();
    this.provideSettingsView(api, this.store);
  }

  async onDisposing(): Promise<void> {
    this.titleService?.dispose();
    this.titleService = undefined;
    this.store = undefined;
  }

  /** 与官方插件一致的设置视图挂载方式（React + 尺寸上下文，kit 公共件） */
  private provideSettingsView(api: LiveSessionTitlePlugin['api'], store: SettingsStore<PluginSettings>): void {
    const Form = createReactView((input: {
      store: SettingsStore<PluginSettings>;
      app: AiApp;
      manifest: PluginManifest;
    }) => createElement(LiveSessionTitleSettingsView, input));
    mountSettingsView(api, Form, () => ({ app: api.app, manifest: api.manifest, store }));
  }
}