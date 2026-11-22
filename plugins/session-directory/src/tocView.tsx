import { useEffect, useRef, useState } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import type { ConversationViewProps, Session, TranscriptFactory } from '@obsidian-components/ai-api';
import { buildTocEntries, type TocEntry } from './entries';
import type { PluginSettings } from './settings';

interface TocViewProps {
  session?: Session;
  factory: TranscriptFactory;
  getSettings: () => PluginSettings;
}

/** 悬浮卡半高估算（像素），用于把卡片垂直夹在会话区内 */
const TIP_HALF = 56;

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), Math.max(min, max));
}

function TocView({ session, factory, getSettings }: TocViewProps) {
  const settings = getSettings();
  const [entries, setEntries] = useState<TocEntry[]>([]);
  /** turnId → 该轮次在对话内容中的相对位置（0..1） */
  const [positions, setPositions] = useState<Record<string, number>>({});
  const [hovered, setHovered] = useState<string | null>(null);
  const [railHeight, setRailHeight] = useState(0);
  const rootRef = useRef<HTMLDivElement>(null);
  const entriesRef = useRef<TocEntry[]>([]);
  const closeTimer = useRef<number | undefined>(undefined);

  entriesRef.current = entries;

  // 从 DOM 读取每个轮次的相对位置：刻度按内容位置比例分布（迷你地图）
  const recompute = (): void => {
    const root = rootRef.current;
    if (!root) return;
    const conv = root.closest('.xdb--Conversation') as HTMLElement | null;
    const transcript = conv?.querySelector('.xdb--Transcript') as HTMLElement | null;
    if (!conv || !transcript) return;
    const list = (transcript.querySelector('.xdb--TranscriptList') as HTMLElement | null) ?? transcript;
    const listTop = list.getBoundingClientRect().top;
    const total = list.scrollHeight;
    const next: Record<string, number> = {};
    for (const entry of entriesRef.current) {
      const el = conv.querySelector(`[data-node-key="${CSS.escape(entry.key)}"]`);
      if (el) {
        const top = el.getBoundingClientRect().top - listTop;
        next[entry.turnId] = total > 0 ? clamp(top / total, 0, 1) : 0;
      }
    }
    setPositions(next);
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

  // 内容更新后稍候（等 DOM 布局稳定）再重算刻度位置
  useEffect(() => {
    const id = window.setTimeout(recompute, 80);
    return () => window.clearTimeout(id);
  }, [entries]);

  // 测量会话区高度，尺寸变化时重算（含后台面板重新可见时的布局重建）
  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    const update = () => {
      setRailHeight(root.clientHeight);
      recompute();
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

  const open = (turnId: string): void => {
    window.clearTimeout(closeTimer.current);
    setHovered(turnId);
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

  const hoveredEntry = hovered ? entries.find((entry) => entry.turnId === hovered) : undefined;
  const tipY =
    hoveredEntry && railHeight > 0
      ? clamp((positions[hoveredEntry.turnId] ?? 0) * railHeight, TIP_HALF, railHeight - TIP_HALF)
      : 0;

  return (
    <div className={`xdb--SessionToc xdb--SessionToc--${settings.side}`} ref={rootRef}>
      <div className="xdb--SessionTocRail" onMouseLeave={scheduleClose}>
        {entries.map((entry) => (
          <button
            key={entry.turnId}
            type="button"
            className={`xdb--SessionTocTick${entry.status === 'running' ? ' xdb--SessionTocTick--running' : ''}${hovered === entry.turnId ? ' xdb--SessionTocTick--active' : ''}`}
            style={{ top: `${(positions[entry.turnId] ?? 0) * 100}%` }}
            onMouseEnter={() => open(entry.turnId)}
            onClick={() => scrollToTurn(entry.turnId)}
            aria-label={`跳转到第 ${entry.index} 轮`}
          />
        ))}
      </div>
      {hoveredEntry && (
        <div
          className="xdb--SessionTocTip"
          style={{ top: tipY, maxHeight: Math.max(80, railHeight - 32) }}
          onMouseEnter={() => open(hoveredEntry.turnId)}
          onMouseLeave={scheduleClose}
        >
          <span className="xdb--SessionTocTipIndex">{hoveredEntry.index}</span>
          <span className="xdb--SessionTocTipText" style={{ WebkitLineClamp: settings.previewLines }}>
            {hoveredEntry.preview || '（空输入）'}
          </span>
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
  getSettings: () => PluginSettings,
): new () => { mount(container: HTMLElement, props?: ConversationViewProps): void; unmount(): void } {
  return class {
    private root?: Root;
    mount(container: HTMLElement, props?: ConversationViewProps): void {
      const element = <TocView session={props?.session} factory={factory} getSettings={getSettings} />;
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
