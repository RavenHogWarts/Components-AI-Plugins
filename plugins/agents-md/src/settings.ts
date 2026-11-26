export interface PluginSettings {
  /** 是否自动读取仓库根目录的项目工作指南并追加到系统指令 */
  enabled: boolean;
  /** 指南文件名（位于仓库根目录） */
  filename: string;
  /** 注入指南的最大行数（其余内容由 read_file 工具按需读取） */
  maxLines: number;
}

export const DEFAULT_SETTINGS: PluginSettings = {
  enabled: true,
  filename: 'AGENTS.md',
  maxLines: 200,
};

function asText(value: unknown, fallback: string): string {
  return typeof value === 'string' && value.trim().length > 0 ? value : fallback;
}

function asNumber(value: unknown, fallback: number, min: number, max: number): number {
  const n = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, Math.round(n)));
}

/** 从持久化 JSON（可能缺失或含旧字段）合并出完整设置 */
export function loadSettings(raw: unknown): PluginSettings {
  const source = raw != null && typeof raw === 'object' ? (raw as Record<string, unknown>) : {};
  return {
    enabled: source.enabled !== false,
    filename: asText(source.filename, DEFAULT_SETTINGS.filename),
    maxLines: asNumber(source.maxLines, DEFAULT_SETTINGS.maxLines, 10, 5000),
  };
}
