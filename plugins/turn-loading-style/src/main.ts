import { Plugin } from '@obsidian-components/ai-api';
import type { AiApp, PluginManifest } from '@obsidian-components/ai-api';
import { createElement } from 'react';
import { createReactView, mountSettingsView, SettingsStore } from 'ai-plugin-kit';
import { loadAnims, type AnimEntry, type AnimRuntime } from './anims';
import { LottieHost } from './lottieHost';
import { ANIM_SIZE_EM, loadSettings, type PluginSettings } from './settings';
import { TurnLoadingSettingsView } from './settingsView';

/**
 * 三通道驱动：
 * - styles.css 静态预设（body[data-ai-turn-loading] 键控）
 * - assets/anims/ 素材：svg/gif/webp 注入运行时样式；json 由 LottieHost 挂载播放
 * - --ai-turn-loading-text 传入自定义文字
 */
export default class TurnLoadingStylePlugin extends Plugin {
  static inject = [] as const;

  private store?: SettingsStore<PluginSettings>;
  private releaseSettings?: () => void;
  private anims?: AnimRuntime;
  private readonly host = new LottieHost();
  private lottieActive = false;

  async onResolving(): Promise<void> {
    const { api } = this;
    this.store = new SettingsStore(api, loadSettings(await api.readData()), loadSettings);
    this.anims = await loadAnims(api.app.files, `.agents/plugins/${api.manifest.name}`);
    this.apply();
    this.releaseSettings = this.store.subscribe(() => this.apply());

    const getAnims = (): readonly AnimEntry[] => this.anims?.entries ?? [];
    const Form = createReactView((input: {
      store: SettingsStore<PluginSettings>;
      app: AiApp;
      manifest: PluginManifest;
      getAnims: () => readonly AnimEntry[];
    }) => createElement(TurnLoadingSettingsView, input));
    mountSettingsView(api, Form, () => ({
      app: api.app,
      manifest: api.manifest,
      store: this.store!,
      getAnims,
    }));
  }

  private apply(): void {
    const preset = this.store!.getSettings().preset;

    let lottieData: unknown;
    if (typeof preset === 'string' && preset.startsWith('anim:')) {
      const entry = this.anims?.entries.find((item) => item.id === preset);
      if (entry == null) {
        // 素材缺失（被删除/未部署）：回退应用默认
        this.finish('default');
        return;
      }
      if (entry.kind === 'lottie') {
        const text = this.anims?.lottieText.get(preset);
        if (text != null) {
          try {
            lottieData = JSON.parse(text);
          } catch (error) {
            console.warn('[turn-loading-style] Lottie JSON 无效:', error);
          }
        }
      }
    }

    if (lottieData != null) {
      this.host.start(lottieData);
      this.lottieActive = true;
    } else if (this.lottieActive) {
      this.host.stop();
      this.lottieActive = false;
    }
    this.finish(preset);
  }

  private finish(preset: string): void {
    const settings = this.store!.getSettings();
    document.body.dataset.aiTurnLoading = preset;
    document.body.style.setProperty('--ai-turn-anim-size', ANIM_SIZE_EM[settings.size]);
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
    this.host.stop();
    this.lottieActive = false;
    this.anims?.dispose();
    this.anims = undefined;
    delete document.body.dataset.aiTurnLoading;
    delete document.body.dataset.aiTurnText;
    document.body.style.removeProperty('--ai-turn-loading-text');
    document.body.style.removeProperty('--ai-turn-anim-size');
    this.store = undefined;
  }
}