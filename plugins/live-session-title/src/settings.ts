import type { ModelRef, SessionData } from '@obsidian-components/ai-api';

export interface Exclusions {
  /** 精确排除的会话 ID */
  sessionIds: string[];
  /** 当前标题匹配（正则，失败则按子串）即排除 */
  titlePatterns: string[];
  /** Agent 标识或名称匹配即排除（不区分大小写子串） */
  agents: string[];
}

export interface PluginSettings {
  enabled: boolean;
  /** 指定标题生成模型；缺省跟随会话模型 */
  model?: ModelRef;
  prompt: string;
  maxLength: number;
  debounceMs: number;
  historyMessages: number;
  exclusions: Exclusions;
}

export const DEFAULT_PROMPT = [
  '你是会话标题生成器。根据下面的对话记录（重点关注最近的内容）为这个会话生成一个简短标题，要求：',
  '- 用简体中文概括当前讨论的核心主题；',
  '- 不超过 {maxLength} 个字；',
  '- 只输出标题文字本身，不要引号、书名号、句号或换行。',
].join('\n');

export const DEFAULT_SETTINGS: PluginSettings = {
  enabled: true,
  prompt: DEFAULT_PROMPT,
  maxLength: 30,
  debounceMs: 8000,
  historyMessages: 10,
  exclusions: { sessionIds: [], titlePatterns: [], agents: [] },
};

function asStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is string => typeof item === 'string' && item.trim().length > 0);
}

function asNumber(value: unknown, fallback: number, min: number, max: number): number {
  const n = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, Math.round(n)));
}

/** 从持久化 JSON（可能缺失或含旧字段）合并出完整设置 */
export function loadSettings(raw: unknown): PluginSettings {
  const source = raw != null && typeof raw === 'object' ? (raw as Record<string, unknown>) : {};
  const model = source.model as ModelRef | undefined;
  const exclusions =
    source.exclusions != null && typeof source.exclusions === 'object'
      ? (source.exclusions as Record<string, unknown>)
      : {};
  return {
    enabled: source.enabled !== false,
    model:
      model != null && typeof model.provider === 'string' && typeof model.model === 'string'
        ? { provider: model.provider, model: model.model }
        : undefined,
    prompt:
      typeof source.prompt === 'string' && source.prompt.trim().length > 0
        ? source.prompt
        : DEFAULT_PROMPT,
    maxLength: asNumber(source.maxLength, DEFAULT_SETTINGS.maxLength, 4, 120),
    debounceMs: asNumber(source.debounceMs, DEFAULT_SETTINGS.debounceMs, 0, 600000),
    historyMessages: asNumber(source.historyMessages, DEFAULT_SETTINGS.historyMessages, 1, 60),
    exclusions: {
      sessionIds: asStringArray(exclusions.sessionIds),
      titlePatterns: asStringArray(exclusions.titlePatterns),
      agents: asStringArray(exclusions.agents),
    },
  };
}

/** 当前会话是否命中排除规则 */
export function isExcluded(data: SessionData, settings: PluginSettings): boolean {
  const { exclusions } = settings;
  if (exclusions.sessionIds.includes(data.id)) return true;

  const title = data.title ?? '';
  if (title.length > 0) {
    for (const pattern of exclusions.titlePatterns) {
      try {
        if (new RegExp(pattern, 'i').test(title)) return true;
      } catch {
        if (title.toLowerCase().includes(pattern.toLowerCase())) return true;
      }
    }
  }

  if (exclusions.agents.length > 0 && data.agent != null) {
    const identities: string[] = [];
    if (typeof data.agent === 'string') {
      identities.push(data.agent);
    } else {
      identities.push(String(data.agent.name ?? ''), String(data.agent.id ?? ''));
    }
    const haystack = identities.filter(Boolean).join('\n').toLowerCase();
    if (exclusions.agents.some((entry) => haystack.includes(entry.trim().toLowerCase()))) {
      return true;
    }
  }
  return false;
}
