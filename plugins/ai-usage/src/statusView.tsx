import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { createPortal } from 'react-dom';
import { Button, type SettingsStore } from 'ai-plugin-kit';
import type { PluginSettings } from './settings';
import type { ProviderStatus, UsageStore } from './store';

export interface StatusViewProps {
  store: UsageStore;
  settingsStore: SettingsStore<PluginSettings>;
  onManualRefresh: () => void;
}

const POPOVER_WIDTH = 320;

function formatPercent(value: number): string {
  return `${Math.round(value)}%`;
}

function formatCount(value: number | undefined): string | undefined {
  if (value == null || !Number.isFinite(value)) return undefined;
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}M`;
  if (value >= 1_000) return `${(value / 1_000).toFixed(1)}k`;
  return String(Math.round(value));
}

function formatTime(ts: number): string {
  const date = new Date(ts);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;
}

/** 紧凑单行摘要（状态栏用） */
function shortText(status: ProviderStatus, mode: PluginSettings['displayMode']): string | undefined {
  if (!status.result) return '…';
  if (status.result.type === 'error') return '✕';
  const reading = status.result.reading;
  const percentWindow = reading.windows.find((w) => w.usedPercent != null);
  if (percentWindow && percentWindow.usedPercent != null) {
    const used = percentWindow.usedPercent;
    return mode === 'used' ? formatPercent(used) : `剩${formatPercent(100 - used)}`;
  }
  const amount = reading.amounts[0];
  if (amount) return amount.text;
  return '—';
}

function WindowLine(props: {
  label: string;
  usedPercent?: number;
  used?: number;
  limit?: number;
  resetsAt?: number;
  mode: PluginSettings['displayMode'];
}) {
  const { label, usedPercent, used, limit, resetsAt, mode } = props;
  const parts: string[] = [];
  if (usedPercent != null) {
    parts.push(
      mode === 'used' ? `已用 ${formatPercent(usedPercent)}` : `剩余 ${formatPercent(100 - usedPercent)}`,
    );
  }
  const usedText = formatCount(used);
  const limitText = formatCount(limit);
  if (usedText && limitText) {
    const remainingText = formatCount((limit ?? 0) - (used ?? 0));
    parts.push(mode === 'used' ? `${usedText}/${limitText}` : `${remainingText}/${limitText}`);
  }
  if (resetsAt) parts.push(`重置 ${formatTime(resetsAt)}`);
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', gap: '12px' }}>
      <span style={{ opacity: 0.8 }}>{label}</span>
      <span>{parts.join(' · ')}</span>
    </div>
  );
}

function ProviderSection(props: { status: ProviderStatus; mode: PluginSettings['displayMode'] }) {
  const { status, mode } = props;
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: '12px', fontWeight: 600 }}>
        <span>
          {status.title}
          {status.result?.type === 'ok' && status.result.reading.plan
            ? ` · ${status.result.reading.plan}`
            : ''}
        </span>
      </div>
      {status.result?.type === 'error' ? (
        <div style={{ color: 'var(--text-error, #e93147)' }}>{status.result.message}</div>
      ) : null}
      {status.result?.type === 'ok' ? (
        <>
          {status.result.reading.notice ? (
            <div style={{ opacity: 0.75 }}>{status.result.reading.notice}</div>
          ) : null}
          {status.result.reading.windows.map((window, index) => (
            <WindowLine key={`${window.label}-${index}`} {...window} mode={mode} />
          ))}
          {status.result.reading.amounts.map((amount) => (
            <div key={amount.label} style={{ display: 'flex', justifyContent: 'space-between', gap: '12px' }}>
              <span style={{ opacity: 0.8 }}>{amount.label}</span>
              <span>{amount.text}</span>
            </div>
          ))}
        </>
      ) : null}
      {status.subtitle ? <div style={{ fontSize: '11px', opacity: 0.55 }}>{status.subtitle}</div> : null}
    </div>
  );
}

export function UsageStatusView(props: StatusViewProps) {
  const snapshot = useSyncExternalStore(props.store.subscribe, props.store.getSnapshot);
  const settings = props.settingsStore.getSettings();
  const [open, setOpen] = useState(false);
  const [rect, setRect] = useState<DOMRect | null>(null);
  const buttonRef = useRef<HTMLButtonElement | null>(null);

  useEffect(() => {
    if (!open) return undefined;
    const syncRect = (): void => {
      if (buttonRef.current) setRect(buttonRef.current.getBoundingClientRect());
    };
    syncRect();
    window.addEventListener('resize', syncRect);
    return () => window.removeEventListener('resize', syncRect);
  }, [open]);

  useEffect(() => {
    if (!open) return undefined;
    const onPointerDown = (event: MouseEvent): void => {
      const target = event.target as HTMLElement | null;
      if (target == null) return;
      if (target.closest('[data-ai-usage-root]') != null) return;
      if (target.closest('[data-ai-usage-popover]') != null) return;
      setOpen(false);
    };
    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', onPointerDown);
    document.addEventListener('click', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('mousedown', onPointerDown);
      document.removeEventListener('click', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [open]);

  const summary = snapshot.entries
    .map((status) => {
      const text = shortText(status, settings.displayMode);
      return text ? `${status.title} ${text}` : status.title;
    })
    .join(' · ');

  const viewportWidth = typeof window !== 'undefined' ? window.innerWidth : POPOVER_WIDTH + 16;
  const popoverLeft =
    rect != null ? Math.min(Math.max(8, rect.right - POPOVER_WIDTH), Math.max(8, viewportWidth - POPOVER_WIDTH - 8)) : 8;
  const popoverTop = rect != null ? Math.max(8, rect.top - 8) : 8;

  return (
    <div data-ai-usage-root style={{ display: 'inline-flex', alignItems: 'center', fontVariantNumeric: 'tabular-nums' }}>
      <button
        ref={buttonRef}
        type="button"
        onClick={() => setOpen((value) => !value)}
        style={{
          all: 'unset',
          cursor: 'pointer',
          padding: '2px 8px',
          borderRadius: '6px',
          opacity: snapshot.entries.length === 0 ? 0.6 : 1,
        }}
        title="AI 用量"
      >
        {snapshot.refreshing ? '⟳ ' : ''}
        {summary.length > 0 ? summary : 'AI 用量'}
      </button>
      {open
        ? createPortal(
            <div
              data-ai-usage-popover
              style={{
                position: 'fixed',
                left: `${popoverLeft}px`,
                top: `${popoverTop}px`,
                width: `${POPOVER_WIDTH}px`,
                transform: 'translateY(-100%)',
                zIndex: 1000,
                display: 'flex',
                flexDirection: 'column',
                gap: '10px',
                padding: '12px 14px',
                borderRadius: '10px',
                border: '1px solid var(--background-modifier-border, #ccc)',
                background: 'var(--background-primary, #fff)',
                boxShadow: '0 8px 24px rgba(0,0,0,0.18)',
                fontSize: '12px',
                color: 'var(--text-normal, inherit)',
              }}
            >
              {snapshot.entries.map((status) => (
                <ProviderSection key={status.key} status={status} mode={settings.displayMode} />
              ))}
              {snapshot.entries.length === 0 ? (
                <div style={{ opacity: 0.7 }}>暂无已启用的用量来源</div>
              ) : null}
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  gap: '8px',
                  borderTop: '1px solid var(--background-modifier-border, #eee)',
                  paddingTop: '8px',
                }}
              >
                <span style={{ opacity: 0.6 }}>
                  {snapshot.fetchedAt > 0 ? `更新于 ${formatTime(snapshot.fetchedAt)}` : '尚未更新'}
                </span>
                <Button size="sm" variant="ghost" disabled={snapshot.refreshing} onClick={props.onManualRefresh}>
                  刷新
                </Button>
              </div>
            </div>,
            document.body,
          )
        : null}
    </div>
  );
}