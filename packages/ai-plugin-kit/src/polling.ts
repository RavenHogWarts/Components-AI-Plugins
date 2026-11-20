export interface PollSnapshot<T> {
  readonly value: T;
  readonly fetchedAt: number;
  readonly refreshing: boolean;
}

/**
 * 通用轮询存储：read() 周期执行，稳定 getSnapshot/subscribe 供
 * React useSyncExternalStore 使用；信号中止后停止调度。
 */
export class PollingStore<T> {
  private timer?: ReturnType<typeof setTimeout>;
  private cycle = 0;
  private readonly listeners = new Set<() => void>();
  private snapshot: PollSnapshot<T>;

  constructor(
    private readonly read: () => Promise<T>,
    private readonly pollMs: () => number,
    private readonly signal: AbortSignal,
    initialValue: T,
  ) {
    this.snapshot = { value: initialValue, fetchedAt: 0, refreshing: false };
  }

  getSnapshot = (): PollSnapshot<T> => this.snapshot;

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };

  /** 设置变化后通知界面重渲染（不触发读取） */
  notify(): void {
    for (const listener of [...this.listeners]) listener();
  }

  start(): void {
    void this.refresh();
  }

  stop(): void {
    this.cycle += 1;
    if (this.timer != null) clearTimeout(this.timer);
    this.timer = undefined;
  }

  async refresh(): Promise<void> {
    const cycle = ++this.cycle;
    this.snapshot = { ...this.snapshot, refreshing: true };
    this.notify();
    try {
      const value = await this.read();
      this.finish(cycle, value);
    } catch (error) {
      console.warn('[polling] 读取失败:', error);
      this.finish(cycle);
    }
  }

  private finish(cycle: number, value?: T): void {
    if (cycle !== this.cycle || this.signal.aborted) return;
    this.snapshot = {
      value: value ?? this.snapshot.value,
      fetchedAt: Date.now(),
      refreshing: false,
    };
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