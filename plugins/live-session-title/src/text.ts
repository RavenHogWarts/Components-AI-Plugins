import type { TranscriptNode } from '@obsidian-components/ai-api';

export interface HistoryEntry {
  role: 'user' | 'assistant';
  text: string;
}

/** 从消息 parts 中提取纯文本（仅取 text 部件，忽略 reasoning / tool_call） */
function partsText(content: unknown): string {
  if (typeof content === 'string') return content.trim();
  if (!Array.isArray(content)) return '';
  const parts: string[] = [];
  for (const part of content) {
    if (
      part != null &&
      typeof part === 'object' &&
      (part as { type?: unknown }).type === 'text' &&
      typeof (part as { text?: unknown }).text === 'string'
    ) {
      parts.push((part as { text: string }).text);
    }
  }
  return parts.join('').trim();
}

interface MessageLike {
  role?: unknown;
  content?: unknown;
}

/** 单条消息进入提示词前的最大长度 */
const MAX_ENTRY_CHARS = 600;

/**
 * 深度遍历转写节点，按顺序收集用户与助手的文本消息。
 * 实测节点结构：turn → (message | system_prompt | step*)，step → message；
 * message 节点 payload 为 { message: { role, content } }。
 */
export function collectHistory(nodes: readonly TranscriptNode[], limit: number): HistoryEntry[] {
  const entries: HistoryEntry[] = [];
  const visit = (node: TranscriptNode): void => {
    if (node.type === 'message' && node.payload != null && typeof node.payload === 'object') {
      const message = (node.payload as { message?: MessageLike }).message;
      if (message != null && (message.role === 'user' || message.role === 'assistant')) {
        const text = partsText(message.content);
        if (text.length > 0) entries.push({ role: message.role, text });
      }
    }
    for (const child of node.children) visit(child);
  };
  for (const node of nodes) visit(node);
  return entries
    .slice(-limit)
    .map((entry) => ({
      role: entry.role,
      text:
        entry.text.length > MAX_ENTRY_CHARS
          ? `${entry.text.slice(0, MAX_ENTRY_CHARS)}…`
          : entry.text,
    }));
}
