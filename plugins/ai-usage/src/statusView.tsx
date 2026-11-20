import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { createPortal } from 'react-dom';
import { RefreshCw, Sparkles, Terminal, Wallet } from 'lucide-react';
import type { SettingsStore } from 'ai-plugin-kit';
import type { ProviderKind } from './providers';
import type { PluginSettings } from './settings';
import type { ProviderStatus, UsageStore } from './store';

export interface StatusViewProps {
  store: UsageStore;
  settingsStore: SettingsStore<PluginSettings>;
  onManualRefresh: () => void;
}

/** 组件样式（移植自 usage-monitor 官方设计，前缀改为 xdb--AiUsage） */
const STYLES = `
button:not(.clickable-icon).xdb--AiUsageTrigger{align-items:center;background:transparent;border:none;border-radius:6px;box-shadow:none;color:inherit;cursor:pointer;display:inline-flex;font:inherit;gap:8px;opacity:.75;padding:2px 6px}
button:not(.clickable-icon).xdb--AiUsageTrigger:hover,button:not(.clickable-icon).xdb--AiUsageTrigger[aria-expanded=true]{background:color-mix(in srgb,currentColor 10%,transparent);opacity:1}
.xdb--AiUsageIcon{flex-shrink:0;opacity:.85}
.xdb--AiUsageMetric{align-items:center;display:inline-flex;font-size:11px;font-variant-numeric:tabular-nums;gap:4px;white-space:nowrap}
.xdb--AiUsageMetric[data-state=error]{opacity:.6}
.xdb--AiUsagePercent{display:inline-block;min-width:4ch}
.xdb--AiUsagePopover{width:340px;border:1px solid color-mix(in srgb,currentColor 12%,transparent);border-radius:10px;background:var(--background-primary,#fff);box-shadow:0 8px 24px rgba(0,0,0,.18);color:var(--text-normal,inherit);z-index:1000}
.xdb--AiUsageBody{display:grid;font-size:12px;gap:10px;padding:12px 14px}
.xdb--AiUsageCard{background:color-mix(in srgb,currentColor 4%,transparent);border:1px solid color-mix(in srgb,currentColor 10%,transparent);border-radius:8px;display:grid;gap:8px;padding:10px 12px}
.xdb--AiUsageCardHeader{align-items:baseline;display:flex;gap:12px;justify-content:space-between}
.xdb--AiUsageCardTitle{align-items:center;display:inline-flex;font-size:11px;font-weight:600;gap:6px;letter-spacing:.04em;opacity:.6;text-transform:uppercase}
.xdb--AiUsageCardPlan{border:1px solid color-mix(in srgb,currentColor 15%,transparent);border-radius:999px;font-size:10px;letter-spacing:.04em;padding:1px 8px;text-transform:uppercase}
.xdb--AiUsageCardSub{font-size:11px;opacity:.55}
.xdb--AiUsageMessage{margin:0;opacity:.85}
.xdb--AiUsageMessage[data-tone=error]{color:#e05252}
.xdb--AiUsageMeter{display:grid;gap:3px}
.xdb--AiUsageRow{display:flex;gap:12px;justify-content:space-between}
.xdb--AiUsageLabel{opacity:.6;white-space:nowrap}
.xdb--AiUsageValue{font-variant-numeric:tabular-nums;text-align:right}
.xdb--AiUsageBar{background:color-mix(in srgb,currentColor 15%,transparent);border-radius:3px;height:4px;overflow:hidden}
.xdb--AiUsageBarFill{background:currentColor;height:100%;transition:width .3s ease}
.xdb--AiUsageBarFill[data-tone=warn]{background:#d99a2b}
.xdb--AiUsageBarFill[data-tone=critical]{background:#e05252}
.xdb--AiUsageReset{font-size:11px;opacity:.55}
.xdb--AiUsageFooter{align-items:center;display:flex;gap:8px;justify-content:space-between}
.xdb--AiUsageFooterTime{font-size:11px;opacity:.55}
button:not(.clickable-icon).xdb--AiUsageRefresh{align-items:center;background:transparent;border:none;border-radius:4px;box-shadow:none;color:inherit;cursor:pointer;display:inline-flex;padding:3px}
button:not(.clickable-icon).xdb--AiUsageRefresh:hover{background:color-mix(in srgb,currentColor 10%,transparent)}
button:not(.clickable-icon).xdb--AiUsageRefresh:disabled{cursor:default;opacity:.5}
.xdb--AiUsageRefreshSpin{animation:xdb--AiUsageSpin 1s linear infinite}
@keyframes xdb--AiUsageSpin{to{transform:rotate(360deg)}}
`.trim();

function formatPercent(value: number): string {
  return `${Math.round(value)}%`;
}

function formatClock(epochMs: number): string {
  return new Date(epochMs).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

function formatCountdown(resetsAt: number, now = Date.now()): string {
  const remainingMs = resetsAt - now;
  if (remainingMs <= 0) return '已到重置时间';
  const minutes = Math.round(remainingMs / 60000);
  const days = Math.floor(minutes / 1440);
  const hours = Math.floor((minutes % 1440) / 60);
  const mins = minutes % 60;
  if (days > 0) return `${days}天${hours}小时`;
  if (hours > 0) return `${hours}小时${mins}分`;
  return `${mins}分钟`;
}

function IconOfKind(kind: ProviderKind) {
  if (kind === 'codex') return Terminal;
  return kind === 'glm' ? Sparkles : Wallet;
}

/** 摘要百分比：正向=已用，逆向=剩余 */
function summaryPercent(status: ProviderStatus, mode: PluginSettings['displayMode']): number | undefined {
  if (status.result?.type !== 'ok') return undefined;
  const window = status.result.reading.windows.find((w) => w.usedPercent != null);
  if (!window || window.usedPercent == null) return undefined;
  return mode === 'used' ? window.usedPercent : 100 - window.usedPercent;
}

function metricText(status: ProviderStatus, mode: PluginSettings['displayMode']): string {
  const percent = summaryPercent(status, mode);
  if (percent != null) return formatPercent(percent);
  if (status.result?.type === 'ok') {
    const amount = status.result.reading.amounts[0];
    if (amount) return amount.text;
    return '—';
  }
  if (!status.result) return '…';
  return '!';
}

function ProviderMetric(props: { status: ProviderStatus; mode: PluginSettings['displayMode'] }) {
  const { status, mode } = props;
  const state = !status.result ? 'pending' : status.result.type === 'ok' ? 'ok' : 'error';
  const Icon = IconOfKind(status.kind);
  return (
    <span className="xdb--AiUsageMetric" data-state={state}>
      <Icon className="xdb--AiUsageIcon" size={12} aria-hidden="true" />
      {status.title}
      <span className="xdb--AiUsagePercent">{metricText(status, mode)}</span>
    </span>
  );
}

function WindowMeter(props: {
  label: string;
  usedPercent: number;
  mode: PluginSettings['displayMode'];
  resetsAt?: number;
}) {
  const { label, usedPercent, mode, resetsAt } = props;
  const shown = mode === 'used' ? usedPercent : 100 - usedPercent;
  const tone = mode === 'remaining'
    ? shown <= 10 ? 'critical' : shown <= 30 ? 'warn' : undefined
    : shown >= 90 ? 'critical' : shown >= 70 ? 'warn' : undefined;
  const verb = mode === 'used' ? '已用' : '剩余';
  return (
    <div className="xdb--AiUsageMeter">
      <div className="xdb--AiUsageRow">
        <span className="xdb--AiUsageLabel">{label}</span>
        <span className="xdb--AiUsageValue">
          {verb} {formatPercent(shown)}
        </span>
      </div>
      <div
        className="xdb--AiUsageBar"
        role="progressbar"
        aria-label={label}
        aria-valuenow={Math.round(shown)}
        aria-valuetext={`${verb} ${formatPercent(shown)}`}
      >
        <div
          className="xdb--AiUsageBarFill"
          data-tone={tone}
          style={{ width: `${Math.min(100, Math.max(0, shown))}%` }}
        />
      </div>
      {resetsAt != null && (
        <span className="xdb--AiUsageReset">{formatCountdown(resetsAt)}后重置</span>
      )}
    </div>
  );
}

function ProviderCard(props: { status: ProviderStatus; mode: PluginSettings['displayMode'] }) {
  const { status, mode } = props;
  const result = status.result;
  return (
    <section className="xdb--AiUsageCard" aria-label={status.title}>
      <header className="xdb--AiUsageCardHeader">
        <span className="xdb--AiUsageCardTitle">{status.title}</span>
        {result?.type === 'ok' && result.reading.plan ? (
          <span className="xdb--AiUsageCardPlan">{result.reading.plan}</span>
        ) : null}
      </header>
      {status.subtitle ? <span className="xdb--AiUsageCardSub">{status.subtitle}</span> : null}
      {!result ? (
        <p className="xdb--AiUsageMessage">正在获取…</p>
      ) : result.type !== 'ok' ? (
        <p className="xdb--AiUsageMessage" data-tone="error">{result.message}</p>
      ) : result.reading.windows.length === 0 && result.reading.amounts.length === 0 ? (
        <p className="xdb--AiUsageMessage">接口未返回特定数据。</p>
      ) : (
        <>
          {result.reading.windows
            .filter((window) => window.usedPercent != null)
            .map((window) => (
              <WindowMeter
                key={window.label}
                label={window.label}
                usedPercent={window.usedPercent ?? 0}
                mode={mode}
                resetsAt={window.resetsAt}
              />
            ))}
          {result.reading.amounts.map((amount) => (
            <div key={amount.label} className="xdb--AiUsageRow">
              <span className="xdb--AiUsageLabel">{amount.label}</span>
              <span className="xdb--AiUsageValue">{amount.text}</span>
            </div>
          ))}
          {result.reading.notice ? (
            <p className="xdb--AiUsageMessage" data-tone="error">{result.reading.notice}</p>
          ) : null}
        </>
      )}
    </section>
  );
}

export function UsageStatusView(props: StatusViewProps) {
  const snapshot = useSyncExternalStore(props.store.subscribe, props.store.getSnapshot);
  const settings = props.settingsStore.getSettings();
  const [open, setOpen] = useState(false);
  const [rect, setRect] = useState<DOMRect | null>(null);
  const buttonRef = useRef<HTMLButtonElement | null>(null);
  const rootRef = useRef<HTMLDivElement | null>(null);

  // 自愈：清理历史 reload 遗留的孤儿根（以根元素 ref 判定归属，与按钮渲染无关）
  useEffect(() => {
    const own = rootRef.current;
    for (const el of [...document.querySelectorAll('[data-ai-usage-root]')]) {
      if (el === own) continue;
      el.remove();
    }
  }, []);

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

  const viewportWidth = typeof window !== 'undefined' ? window.innerWidth : 360;
  const left =
    rect != null
      ? Math.min(Math.max(8, rect.right - 340), Math.max(8, viewportWidth - 348))
      : 8;
  const top = rect != null ? Math.max(8, rect.top - 8) : 8;

  return (
    <div ref={rootRef} data-ai-usage-root style={{ display: 'inline-flex', alignItems: 'center' }}>
      <style>{STYLES}</style>
      {snapshot.entries.length > 0 ? (
        <button
          ref={buttonRef}
          type="button"
          className="xdb--AiUsageTrigger"
          aria-haspopup="dialog"
          aria-expanded={open}
          aria-label="AI 用量"
          onClick={() => setOpen((value) => !value)}
        >
          {snapshot.entries.map((status) => (
            <ProviderMetric key={status.key} status={status} mode={settings.displayMode} />
          ))}
        </button>
      ) : null}
      {open && snapshot.entries.length > 0
        ? createPortal(
            <div
              data-ai-usage-popover
              className="xdb--AiUsagePopover"
              role="dialog"
              aria-label="AI 用量"
              style={{ position: 'fixed', left: `${left}px`, top: `${top}px`, transform: 'translateY(-100%)' }}
            >
              <div className="xdb--AiUsageBody">
                {snapshot.entries.map((status) => (
                  <ProviderCard key={status.key} status={status} mode={settings.displayMode} />
                ))}
                <div className="xdb--AiUsageFooter">
                  <span className="xdb--AiUsageFooterTime">
                    {snapshot.fetchedAt > 0 ? `更新于 ${formatClock(snapshot.fetchedAt)}` : '正在获取…'}
                  </span>
                  <button
                    type="button"
                    className="xdb--AiUsageRefresh"
                    onClick={props.onManualRefresh}
                    disabled={snapshot.refreshing}
                    aria-label="手动刷新"
                  >
                    <RefreshCw
                      size={12}
                      aria-hidden="true"
                      className={snapshot.refreshing ? 'xdb--AiUsageRefreshSpin' : undefined}
                    />
                  </button>
                </div>
              </div>
            </div>,
            document.body,
          )
        : null}
    </div>
  );
}