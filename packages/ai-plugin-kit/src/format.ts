/** 常用展示格式化 */

export function formatPercent(value: number): string {
  return `${Math.round(value)}%`;
}

export function formatClock(epochMs: number): string {
  return new Date(epochMs).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

export function formatCountdown(resetsAt: number, now = Date.now()): string {
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

export function formatAmount(value: number, currency?: string): string {
  const symbol = currency === 'CNY' ? '¥' : currency === 'USD' ? '$' : currency ? `${currency} ` : '';
  return `${symbol}${value.toFixed(2)}`;
}