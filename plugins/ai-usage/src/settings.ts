export type DisplayMode = 'used' | 'remaining';

/** 状态项在 Composer 底部的停靠位置 */
export type FooterPosition = 'left' | 'center' | 'right';

export interface PluginSettings {
  /** 正向（已用）或逆向（剩余）显示 */
  displayMode: DisplayMode;
  /** 底部停靠位置 */
  footerPosition: FooterPosition;
  /** 轮询间隔（分钟，1..60） */
  pollMinutes: number;
  /** codex CLI 命令路径；空 = codex */
  codexCommandPath: string;
  /** 已关闭用量查询的目标 key（连接名或 'codex'）；缺失视为开启 */
  disabled: string[];
}

export const DEFAULT_SETTINGS: PluginSettings = {
  displayMode: 'used',
  footerPosition: 'center',
  pollMinutes: 5,
  codexCommandPath: '',
  disabled: [],
};

function asNumber(value: unknown, fallback: number, min: number, max: number): number {
  const n = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, Math.round(n)));
}

function asStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is string => typeof item === 'string' && item.length > 0);
}

export function loadSettings(raw: unknown): PluginSettings {
  const source = raw != null && typeof raw === 'object' ? (raw as Record<string, unknown>) : {};
  return {
    displayMode: source.displayMode === 'remaining' ? 'remaining' : 'used',
    footerPosition:
      source.footerPosition === 'left' || source.footerPosition === 'right'
        ? source.footerPosition
        : 'center',
    pollMinutes: asNumber(source.pollMinutes, DEFAULT_SETTINGS.pollMinutes, 1, 60),
    codexCommandPath: typeof source.codexCommandPath === 'string' ? source.codexCommandPath.trim() : '',
    disabled: asStringArray(source.disabled),
  };
}

export function isEnabled(settings: PluginSettings, key: string): boolean {
  return !settings.disabled.includes(key);
}