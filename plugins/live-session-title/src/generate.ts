import type { ModelProviderManager, Session } from '@obsidian-components/ai-api';
import type { PluginSettings } from './settings';
import type { HistoryEntry } from './text';

/** 清洗模型输出为可用的标题 */
export function sanitizeTitle(raw: string, maxLength: number): string {
  let title = raw
    .replace(/^[\s"'`「『（《【]+/, '')
    .replace(/[\s"'`」』）》】。.!！?？…]+$/, '')
    .split(/\r?\n/)[0]
    .trim()
    .replace(/\s+/g, ' ');
  const chars = [...title];
  if (chars.length > maxLength) {
    title = chars.slice(0, maxLength).join('').trim();
  }
  return title;
}

/** 调用模型生成标题；失败或无效时返回 undefined */
export async function generateTitle(
  modelProviderManager: ModelProviderManager,
  session: Session,
  history: readonly HistoryEntry[],
  settings: PluginSettings,
  signal: AbortSignal,
): Promise<string | undefined> {
  const ref = settings.model ?? session.data.model?.ref;
  if (!ref) return undefined;

  const transcriptText = history
    .map((entry) => (entry.role === 'user' ? `用户：${entry.text}` : `助手：${entry.text}`))
    .join('\n');
  const instruction = settings.prompt.replaceAll('{maxLength}', String(settings.maxLength));

  const model = modelProviderManager.getModel(ref, { maxOutputTokens: 128 });
  const response = await model.generate({
    messages: [
      {
        role: 'user',
        content: [
          {
            type: 'text',
            text: `${instruction}\n\n当前标题：${session.data.title ?? '（无）'}\n\n对话记录：\n${transcriptText}`,
          },
        ],
      },
    ],
    signal,
  });

  const text = response.message.content
    .filter((part) => part.type === 'text' && typeof part.text === 'string')
    .map((part) => part.text as string)
    .join('')
    .trim();
  if (text.length === 0) return undefined;
  const title = sanitizeTitle(text, settings.maxLength);
  return title.length > 0 ? title : undefined;
}
