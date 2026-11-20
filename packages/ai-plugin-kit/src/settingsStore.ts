export interface DataApi {
  readData(): Promise<unknown>;
  writeData(value: unknown): Promise<void>;
}

/**
 * 通用设置存储（官方插件模式）：
 * - getSettings 返回稳定快照
 * - update(patch) 合并 → parse 规范化 → 通知订阅者 → 持久化到插件 data.json
 *
 * parse 负责把「旧设置 + 补丁」的合并结果规范化为完整设置对象，
 * 插件侧通常直接传入自己的 loadSettings。
 */
export class SettingsStore<T extends object> {
  private readonly listeners = new Set<() => void>();
  settings: T;

  constructor(
    private readonly data: DataApi,
    initial: T,
    private readonly parse: (raw: unknown) => T,
  ) {
    this.settings = initial;
  }

  getSettings = (): T => this.settings;

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };

  async update(patch: Partial<T>): Promise<T> {
    const next = this.parse({ ...this.settings, ...patch });
    this.settings = next;
    for (const listener of [...this.listeners]) listener();
    await this.data.writeData(next);
    return next;
  }
}