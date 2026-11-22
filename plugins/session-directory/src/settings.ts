export interface PluginSettings {
  /** 是否显示对话侧边的会话目录条 */
  enabled: boolean;
  /** 目录条固定在对话窗口的哪一侧 */
  side: 'left' | 'right';
  /** 每条目录项显示的用户输入预览行数 */
  previewLines: number;
}

export const DEFAULT_SETTINGS: PluginSettings = {
  enabled: true,
  side: 'left',
  previewLines: 3,
};

function asNumber(value: unknown, fallback: number, min: number, max: number): number {
  const n = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, Math.round(n)));
}

/** 从持久化 JSON（可能缺失或含旧字段）合并出完整设置 */
export function loadSettings(raw: unknown): PluginSettings {
  const source = raw != null && typeof raw === 'object' ? (raw as Record<string, unknown>) : {};
  const side = source.side === 'left' ? 'left' : source.side === 'right' ? 'right' : DEFAULT_SETTINGS.side;
  return {
    enabled: source.enabled !== false,
    side,
    previewLines: asNumber(source.previewLines, DEFAULT_SETTINGS.previewLines, 1, 10),
  };
}
