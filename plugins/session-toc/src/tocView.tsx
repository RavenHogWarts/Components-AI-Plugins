import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import type { ConversationViewProps, Session, TranscriptFactory } from '@obsidian-components/ai-api';
import type { SettingsStore } from 'ai-plugin-kit';
import { buildTocEntries, type TocEntry } from './entries';
import type { PluginSettings } from './settings';

interface TocViewProps {
  session?: Session;
  factory: TranscriptFactory;
  store: SettingsStore<PluginSettings>;
}

/** 悬浮卡最大高度估算（像素），用于把卡片底部夹在会话区内 */
const TIP_EST = 170;
/** 每个刻度的间距（像素），与 ZCode 原生 turn navigator 一致 */
const TICK_STEP = 10;

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), Math.max(min, max));
}

interface HoverState {
  turnId: string;
  /** 刻度按钮顶部在会话区内的纵向位置（像素，相对根元素顶部） */
  top: number;
}

function TocView({ session, factory, store }: TocViewProps) {
  // 订阅设置存储：设置变更（含侧边/预览行数/启用）即时重渲染，无需重新 hover
  const settings = useSyncExternalStore(store.subscribe, store.getSettings);
  const [entries, setEntries] = useState<TocEntry[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [hovered, setHovered] = useState<HoverState | null>(null);
  const [railHeight, setRailHeight] = useState(0);
  const rootRef = useRef<HTMLDivElement>(null);
  const entriesRef = useRef<TocEntry[]>([]);
  const closeTimer = useRef<number | undefined>(undefined);
  const activeRaf = useRef(0);

  entriesRef.current = entries;

  const getScope = (): { conv: HTMLElement | null; transcript: HTMLElement | null } => {
    const root = rootRef.current;
    if (!root) return { conv: null, transcript: null };
    const conv = root.closest('.xdb--Conversation') as HTMLElement | null;
    const transcript = (conv?.querySelector('.xdb--Transcript') as HTMLElement | null) ?? null;
    return { conv, transcript };
  };

  // 当前活动轮次：位于转写区视口顶部的那个
  const updateActive = (): void => {
    const { conv, transcript } = getScope();
    if (!conv || !transcript) return;
    const trTop = transcript.getBoundingClientRect().top;
    let best: string | null = null;
    let bestOffset = Infinity;
    let last: string | null = null;
    let lastTop = -Infinity;
    for (const entry of entriesRef.current) {
      const el = conv.querySelector(`[data-node-key="${CSS.escape(entry.key)}"]`);
      if (!el) continue;
      const top = el.getBoundingClientRect().top - trTop;
      if (top >= 0 && top < bestOffset) {
        bestOffset = top;
        best = entry.turnId;
      }
      if (top > lastTop) {
        lastTop = top;
        last = entry.turnId;
      }
    }
    setActiveId(best ?? last);
  };

  // 跟随当前会话创建转写，内容更新时重建目录条目；切换会话自动重建
  useEffect(() => {
    if (!session) {
      setEntries([]);
      return;
    }
    let transcript: ReturnType<TranscriptFactory['create']> | undefined;
    try {
      transcript = factory.create(session);
    } catch {
      setEntries([]);
      return;
    }
    const release = transcript.on('transcript.updated', (nodes) => {
      setEntries(buildTocEntries(nodes));
    });
    setEntries(buildTocEntries(transcript.nodes));
    return () => {
      release();
      transcript?.close();
    };
  }, [session, factory]);

  // 内容更新后稍候（等 DOM 布局稳定）再重算活动轮次
  useEffect(() => {
    const id = window.setTimeout(updateActive, 80);
    return () => window.clearTimeout(id);
  }, [entries]);

  // 监听转写区滚动（capture 捕获不冒泡的 scroll），节流更新活动轮次
  useEffect(() => {
    const onScroll = () => {
      window.cancelAnimationFrame(activeRaf.current);
      activeRaf.current = window.requestAnimationFrame(updateActive);
    };
    document.addEventListener('scroll', onScroll, true);
    return () => {
      document.removeEventListener('scroll', onScroll, true);
      window.cancelAnimationFrame(activeRaf.current);
    };
  }, []);

  // 测量会话区高度，尺寸变化时重算活动轮次
  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    const update = () => {
      setRailHeight(root.clientHeight);
      updateActive();
    };
    update();
    const observer = new ResizeObserver(update);
    observer.observe(root);
    return () => observer.disconnect();
  }, []);

  useEffect(
    () => () => {
      window.clearTimeout(closeTimer.current);
    },
    [],
  );

  const openFromTick = (turnId: string, el: HTMLElement): void => {
    window.clearTimeout(closeTimer.current);
    const root = rootRef.current;
    if (!root) return;
    const r = el.getBoundingClientRect();
    const rootR = root.getBoundingClientRect();
    // 卡片顶部对齐刻度按钮顶部（按钮高 10px，取按钮上缘）
    setHovered({ turnId, top: r.top - rootR.top });
  };
  const openFromTip = (turnId: string): void => {
    window.clearTimeout(closeTimer.current);
    setHovered((prev) => (prev?.turnId === turnId ? prev : { turnId, top: 0 }));
  };
  const scheduleClose = (): void => {
    window.clearTimeout(closeTimer.current);
    closeTimer.current = window.setTimeout(() => setHovered(null), 160);
  };

  const scrollToTurn = (turnId: string): void => {
    const doc = rootRef.current?.ownerDocument ?? document;
    const el = doc.querySelector(`[data-node-key="${CSS.escape(`turn:${turnId}`)}"]`);
    el?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  if (!settings.enabled || entries.length === 0) {
    return (
      <div className={`xdb--SessionToc xdb--SessionToc--${settings.side}`} ref={rootRef} hidden />
    );
  }

  const hoveredEntry = hovered ? entries.find((entry) => entry.turnId === hovered.turnId) : undefined;
  // 底部夹取基于会话区高度：卡片顶部对齐刻度按钮，仅防止底部溢出会话区
  const convEl = rootRef.current?.closest('.xdb--Conversation') as HTMLElement | null;
  const convHeight = convEl?.clientHeight ?? railHeight;
  const rootTop = rootRef.current ? rootRef.current.getBoundingClientRect().top : 0;
  const convTop = convEl ? convEl.getBoundingClientRect().top : 0;
  const maxTipY = Math.max(0, convHeight - (rootTop - convTop) - TIP_EST);
  const tipY = hovered && railHeight > 0 ? clamp(hovered.top, 0, maxTipY) : 0;

  return (
    <div className={`xdb--SessionToc xdb--SessionToc--${settings.side}`} ref={rootRef}>
      <div className="xdb--SessionTocRail" onMouseLeave={scheduleClose}>
        <div className="xdb--SessionTocList" style={{ height: entries.length * TICK_STEP }}>
          {entries.map((entry, index) => (
            <button
              key={entry.turnId}
              type="button"
              className={`clickable-icon xdb--SessionTocTick${activeId === entry.turnId ? ' xdb--SessionTocTick--active' : ''}${hovered?.turnId === entry.turnId ? ' xdb--SessionTocTick--hovered' : ''}`}
              style={{ top: index * TICK_STEP }}
              onMouseEnter={(e) => openFromTick(entry.turnId, e.currentTarget)}
              onClick={() => scrollToTurn(entry.turnId)}
              aria-posinset={entry.index}
              aria-setsize={entries.length}
              aria-current={activeId === entry.turnId ? 'location' : undefined}
              data-turn-id={entry.turnId}
            >
              <span className="xdb--SessionTocTickBar" aria-hidden="true" />
            </button>
          ))}
        </div>
      </div>
      {hoveredEntry && (
        <div
          className="xdb--SessionTocTip"
          style={{ top: tipY, maxHeight: Math.max(80, convHeight - 16) }}
          onMouseEnter={() => openFromTip(hoveredEntry.turnId)}
          onMouseLeave={scheduleClose}
        >
          <span className="xdb--SessionTocTipIndex">{hoveredEntry.index}</span>
          <div className="xdb--SessionTocTipBody">
            <span className="xdb--SessionTocTipText" style={{ WebkitLineClamp: settings.previewLines }}>
              {hoveredEntry.preview || '（空输入）'}
            </span>
            <span className="xdb--SessionTocTipReply" style={{ WebkitLineClamp: settings.replyLines }}>
              {hoveredEntry.reply || '（无回复）'}
            </span>
          </div>
        </div>
      )}
    </div>
  );
}

/**
 * 会话面板块的可挂载渲染器，对齐 conversationViewService.registerBlock 的 View 契约：
 * mount 一次后复用 root，宿主以新 props 重调 mount 时增量更新。
 */
export function createTocBlockRenderer(
  factory: TranscriptFactory,
  store: SettingsStore<PluginSettings>,
): new () => { mount(container: HTMLElement, props?: ConversationViewProps): void; unmount(): void } {
  return class {
    private root?: Root;
    mount(container: HTMLElement, props?: ConversationViewProps): void {
      const element = <TocView session={props?.session} factory={factory} store={store} />;
      if (this.root) {
        this.root.render(element);
      } else {
        this.root = createRoot(container);
        this.root.render(element);
      }
    }
    unmount(): void {
      this.root?.unmount();
      this.root = undefined;
    }
  };
}
