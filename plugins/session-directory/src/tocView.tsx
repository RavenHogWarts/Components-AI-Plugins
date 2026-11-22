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

/** 收缩态手柄上的列表图标（内联 SVG，避免额外图标依赖） */
const GRIP_ICON = (
  <svg
    width="12"
    height="12"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
  >
    <line x1="8" y1="6" x2="21" y2="6" />
    <line x1="8" y1="12" x2="21" y2="12" />
    <line x1="8" y1="18" x2="21" y2="18" />
    <line x1="3" y1="6" x2="3.01" y2="6" />
    <line x1="3" y1="12" x2="3.01" y2="12" />
    <line x1="3" y1="18" x2="3.01" y2="18" />
  </svg>
);

function TocView({ session, factory, getSettings }: TocViewProps) {
  const settings = getSettings();
  const [entries, setEntries] = useState<TocEntry[]>([]);
  const [open, setOpen] = useState(false);
  const [maxHeight, setMaxHeight] = useState(420);
  const rootRef = useRef<HTMLDivElement>(null);

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

  // 悬浮面板高度不超过对话区，避免被 .xdb--Conversation 的 overflow 裁切
  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    const update = () => setMaxHeight(Math.max(160, root.clientHeight - 24));
    update();
    const observer = new ResizeObserver(update);
    observer.observe(root);
    return () => observer.disconnect();
  }, []);

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

  return (
    <div className={`xdb--SessionToc xdb--SessionToc--${settings.side}`} ref={rootRef}>
      <div
        className="xdb--SessionTocHover"
        onMouseEnter={() => setOpen(true)}
        onMouseLeave={() => setOpen(false)}
      >
        <div className="xdb--SessionTocRail" role="button" tabIndex={-1} aria-label="会话目录">
          <span className="xdb--SessionTocGrip">{GRIP_ICON}</span>
          <span className="xdb--SessionTocCount">{entries.length}</span>
        </div>
        {open && (
          <div className="xdb--SessionTocPanel" style={{ maxHeight }}>
            <div className="xdb--SessionTocHeader">会话目录 · {entries.length} 轮</div>
            <div className="xdb--SessionTocList">
              {entries.map((entry) => (
                <button
                  key={entry.turnId}
                  type="button"
                  className="xdb--SessionTocItem"
                  onClick={() => scrollToTurn(entry.turnId)}
                  title={entry.preview || '（空输入）'}
                >
                  <span className="xdb--SessionTocIndex">{entry.index}</span>
                  <span
                    className="xdb--SessionTocPreview"
                    style={{ WebkitLineClamp: settings.previewLines }}
                  >
                    {entry.preview || '（空输入）'}
                  </span>
                </button>
              ))}
            </div>
          </div>
        )}
      </div>
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
