import { Plugin } from '@obsidian-components/ai-api';
import type { AiApp, PluginManifest } from '@obsidian-components/ai-api';
import { createElement } from 'react';
import { createReactView, mountSettingsView, SettingsStore } from 'ai-plugin-kit';
import { loadSettings, type PluginSettings } from './settings';
import { TurnLoadingSettingsView } from './settingsView';

/**
 * 通过 body 数据属性 + CSS 变量驱动 styles.css 中的预设：
 * body[data-ai-turn-loading] 选择动画，--ai-turn-loading-text 传入自定义文字。
 */
export default class TurnLoadingStylePlugin extends Plugin {
  static inject = [] as const;

  private store?: SettingsStore<PluginSettings>;
  private releaseSettings?: () => void;

  async onResolving(): Promise<void> {
    const { api } = this;
    this.store = new SettingsStore(api, loadSettings(await api.readData()), loadSettings);
    this.apply();
    this.releaseSettings = this.store.subscribe(() => this.apply());

    const Form = createReactView((input: {
      store: SettingsStore<PluginSettings>;
      app: AiApp;
      manifest: PluginManifest;
    }) => createElement(TurnLoadingSettingsView, input));
    mountSettingsView(api, Form, () => ({
      app: api.app,
      manifest: api.manifest,
      store: this.store!,
    }));
  }

  private apply(): void {
    const settings = this.store!.getSettings();
    document.body.dataset.aiTurnLoading = settings.preset;
    const text = settings.text.trim();
    if (text.length > 0) {
      document.body.dataset.aiTurnText = '1';
      document.body.style.setProperty('--ai-turn-loading-text', JSON.stringify(text));
    } else {
      delete document.body.dataset.aiTurnText;
      document.body.style.removeProperty('--ai-turn-loading-text');
    }
  }

  async onDisposing(): Promise<void> {
    this.releaseSettings?.();
    this.releaseSettings = undefined;
    delete document.body.dataset.aiTurnLoading;
    delete document.body.dataset.aiTurnText;
    document.body.style.removeProperty('--ai-turn-loading-text');
    this.store = undefined;
  }
}