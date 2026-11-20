import { loadSettings, type PluginSettings } from './settings';

interface DataApi {
  readData(): Promise<unknown>;
  writeData(value: unknown): Promise<void>;
}

/**
 * 设置存储（官方插件模式）：
 * - getSettings 返回稳定快照
 * - update(patch) 合并 → 规范化 → 通知订阅者 → 持久化到插件 data.json
 */
export class SettingsStore {
  private readonly listeners = new Set<() => void>();
  settings: PluginSettings;

  constructor(
    private readonly data: DataApi,
    initial: PluginSettings,
  ) {
    this.settings = initial;
  }

  getSettings = (): PluginSettings => this.settings;

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };

  async update(patch: Partial<PluginSettings>): Promise<PluginSettings> {
    const next = loadSettings({
      ...this.settings,
      ...patch,
      exclusions: { ...this.settings.exclusions, ...(patch.exclusions ?? {}) },
    });
    this.settings = next;
    for (const listener of [...this.listeners]) listener();
    await this.data.writeData(next);
    return next;
  }
}