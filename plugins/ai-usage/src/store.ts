import type { Reading } from './fetchers';
import type { ProviderKind } from './providers';

export type ProviderStatus = {
  key: string;
  title: string;
  subtitle: string;
  kind: ProviderKind;
  result:
    | { type: 'ok'; reading: Reading }
    | { type: 'error'; message: string }
    | undefined;
};

export interface Snapshot {
  entries: readonly ProviderStatus[];
  fetchedAt: number;
  refreshing: boolean;
}

/** 轮询 + 快照存储；getSnapshot/subscribe 稳定引用，供 React 外部存储使用 */
export class UsageStore {
  private timer?: ReturnType<typeof setTimeout>;
  private cycle = 0;
  private readonly listeners = new Set<() => void>();

  constructor(
    private readonly read: () => Promise<readonly ProviderStatus[]>,
    private readonly pollMs: () => number,
    private readonly signal: AbortSignal,
  ) {}

  private snapshot: Snapshot = { entries: [], fetchedAt: 0, refreshing: false };

  getSnapshot = (): Snapshot => this.snapshot;

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };

  start(): void {
    void this.refresh();
  }

  stop(): void {
    this.cycle += 1;
    if (this.timer != null) clearTimeout(this.timer);
    this.timer = undefined;
  }

  /** 设置变化后通知界面重渲染（不触发网络） */
  notify(): void {
    for (const listener of [...this.listeners]) listener();
  }

  async refresh(): Promise<void> {
    const cycle = ++this.cycle;
    this.snapshot = { ...this.snapshot, refreshing: true };
    this.notify();
    let entries: readonly ProviderStatus[];
    try {
      entries = await this.read();
    } catch (error) {
      entries = [];
      console.warn('[ai-usage] 读取失败:', error);
    }
    if (cycle !== this.cycle || this.signal.aborted) return;
    this.snapshot = { entries, fetchedAt: Date.now(), refreshing: false };
    this.notify();
    this.schedule();
  }

  private schedule(): void {
    if (this.timer != null) clearTimeout(this.timer);
    this.timer = setTimeout(() => {
      this.timer = undefined;
      void this.refresh();
    }, Math.max(30_000, this.pollMs()));
  }
}