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
/**
 * 官方风格的重置时间展示：
 * - 已到期 → 已重置
 * - 24 小时内 → 剩余 X小时Y分 · HH:mm 重置
 * - 更远 → M月D日 重置
 */
export function formatReset(resetsAt: number, now = Date.now()): string {
  const remainingMs = resetsAt - now;
  if (remainingMs <= 0) return '已重置';
  const date = new Date(resetsAt);
  const pad = (n: number) => String(n).padStart(2, '0');
  if (remainingMs < 24 * 3600_000) {
    const totalMinutes = Math.floor(remainingMs / 60000);
    const hours = Math.floor(totalMinutes / 60);
    const minutes = totalMinutes % 60;
    const span = hours > 0 ? `${hours}小时${minutes}分` : `${minutes}分${Math.floor((remainingMs % 60000) / 1000)}秒`;
    return `剩余 ${span} · ${pad(date.getHours())}:${pad(date.getMinutes())} 重置`;
  }
  return `${date.getMonth() + 1}月${date.getDate()}日 重置`;
}