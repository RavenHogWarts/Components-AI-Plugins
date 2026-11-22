import type {
  EventBusApi,
  ModelProviderManager,
  SessionManager,
  TranscriptFactory,
} from '@obsidian-components/ai-api';
import { generateTitle } from './generate';
import { isExcluded, type PluginSettings } from './settings';
import { collectHistory } from './text';

export interface TitleServiceDeps {
  eventBus: EventBusApi;
  sessionManager: SessionManager;
  modelProviderManager: ModelProviderManager;
  transcriptFactory: TranscriptFactory;
}

type Timer = ReturnType<typeof setTimeout>;

/**
 * 监听事件总线的 session.updated，按会话防抖后：
 * 校验空闲 / 排除规则 / 内容游标前进 → 调模型生成标题 → session.update 写回。
 *
 * 防循环：以转写游标（transcript.cursor）判重——我们自己写入标题虽然也会触发
 * session.updated，但游标未前进，直接跳过。
 */
export class TitleService {
  private readonly timers = new Map<string, Timer>();
  private readonly inflight = new Set<string>();
  private readonly lastCursor = new Map<string, number>();
  private releaseBus?: () => void;

  constructor(
    private readonly deps: TitleServiceDeps,
    private readonly getSettings: () => PluginSettings,
    private readonly signal: AbortSignal,
  ) {}

  start(): void {
    this.releaseBus = this.deps.eventBus.subscribe((message) => {
      if (message.type === 'session.updated' && typeof message.sessionId === 'string') {
        this.schedule(message.sessionId);
      }
    });
  }

  dispose(): void {
    this.releaseBus?.();
    this.releaseBus = undefined;
    for (const timer of this.timers.values()) clearTimeout(timer);
    this.timers.clear();
  }

  private schedule(sessionId: string): void {
    if (this.signal.aborted || !this.getSettings().enabled) return;
    const existing = this.timers.get(sessionId);
    if (existing) clearTimeout(existing);
    this.timers.set(
      sessionId,
      setTimeout(() => {
        this.timers.delete(sessionId);
        void this.refreshTitle(sessionId);
      }, this.getSettings().debounceMs),
    );
  }

  private async refreshTitle(sessionId: string): Promise<void> {
    if (this.signal.aborted || this.inflight.has(sessionId)) return;
    const settings = this.getSettings();
    if (!settings.enabled) return;

    this.inflight.add(sessionId);
    try {
      const session = await this.deps.sessionManager.getById(sessionId);
      if (!session) {
        this.lastCursor.delete(sessionId);
        return;
      }
      // 只在空闲（当前轮次已结束）时更新，避免生成中途反复触发
      if (session.status !== 'idle') return;
      if (isExcluded(session.data, settings)) return;

      let transcript;
      try {
        transcript = this.deps.transcriptFactory.create(session);
      } catch {
        return; // 无法解释事件时跳过，等待下次更新
      }
      const cursor = transcript.cursor;
      const nodes = transcript.nodes;
      transcript.close();

      if ((this.lastCursor.get(sessionId) ?? -1) >= cursor) return;
      this.lastCursor.set(sessionId, cursor);

      const history = collectHistory(nodes, settings.historyMessages * 2);
      if (history.length === 0) return;

      const title = await generateTitle(
        this.deps.modelProviderManager,
        session,
        history,
        settings,
        this.signal,
      );
      if (title == null) return;

      // 模型调用期间会话可能已开始/结束新轮次：重读最新数据并仅在空闲时写回。
      // 避免用过期数据覆盖新内容；也避免在应用活跃持久化（status/事件保存）时
      // 并发写同一 session.json——Windows 下并发保存会触发原子重命名 EPERM。
      const latest = await this.deps.sessionManager.getById(sessionId);
      if (!latest || latest.status !== 'idle') return;
      if (title === latest.data.title) return;

      this.signal.throwIfAborted();
      await latest.update({ ...latest.data, title });
    } catch (error) {
      if (!this.signal.aborted) {
        console.warn('[live-session-title] 更新标题失败:', error);
      }
    } finally {
      this.inflight.delete(sessionId);
    }
  }
}
