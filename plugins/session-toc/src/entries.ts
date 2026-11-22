import type { TranscriptNode } from '@obsidian-components/ai-api';

/** 会话内目录的一条：对应一个轮次（turn）及其用户输入与回复 */
export interface TocEntry {
  /** 轮次 ID，用于拼出 DOM 的 data-node-key 值 */
  readonly turnId: string;
  /** 与转写节点渲染出的 data-node-key 完全一致，可直接用于查询 */
  readonly key: string;
  /** 该轮次用户输入的纯文本预览 */
  readonly preview: string;
  /** 该轮次助手回复的纯文本预览（取首个文本回复） */
  readonly reply: string;
  /** 轮次状态（completed / running / cancelled） */
  readonly status?: string;
  /** 1 起始的轮次序号 */
  readonly index: number;
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

/**
 * 深度遍历转写节点，按顺序为每个 turn 收集用户输入文本与首个助手回复文本。
 * 实测节点结构：turn → (message | system_prompt | step*)，step → message；
 * message 节点 payload 为 { message: { role, content } }；DOM 用 data-node-key="turn:<turnId>" 标记。
 */
export function buildTocEntries(nodes: readonly TranscriptNode[]): TocEntry[] {
  const entries: TocEntry[] = [];
  let index = 0;

  const visit = (node: TranscriptNode): void => {
    if (node.type === 'turn') {
      index += 1;
      const payload = node.payload as { turnId?: unknown; status?: unknown } | undefined;
      const turnId = typeof payload?.turnId === 'string' ? payload.turnId : node.key;

      let preview = '';
      let reply = '';
      const collectText = (current: TranscriptNode): void => {
        if (current.type === 'message') {
          const message = (
            current.payload as { message?: { role?: unknown; content?: unknown } } | undefined
          )?.message;
          if (message?.role === 'user') {
            const text = partsText(message.content);
            if (preview.length === 0 && text.length > 0) preview = text;
          } else if (message?.role === 'assistant') {
            const text = partsText(message.content);
            // 取最后一个非空助手文本：最终回复，而非中途的思考/执行旁白
            if (text.length > 0) reply = text;
          }
        }
        for (const child of current.children) collectText(child);
      };
      collectText(node);

      entries.push({
        turnId,
        key: `turn:${turnId}`,
        preview,
        reply,
        status: typeof payload?.status === 'string' ? payload.status : undefined,
        index,
      });
    }
    for (const child of node.children) visit(child);
  };

  for (const node of nodes) visit(node);
  return entries;
}
