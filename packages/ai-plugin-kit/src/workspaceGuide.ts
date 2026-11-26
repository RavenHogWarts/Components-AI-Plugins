import type { FileApi, MessageTransformer, MessageTransform, TurnExecutionContext } from '@obsidian-components/ai-api';

/**
 * 工作区文件访问的最小契约。
 *
 * `workspaceManager` 服务名未在 ai-api 导出，插件将其注入后按此契约使用；
 * 需要时也可传任意满足同样签名的对象（便于测试）。
 */
export interface WorkspaceFileAccess {
  /** 返回注册目录；省略 ID 返回 Vault。未知或失效 ID 会抛错，调用方需回退。 */
  getWorkspacePath(workspaceId?: string): string;
  /** 工作区文件 API（支持 Vault 相对路径与平台绝对路径）。 */
  getWorkspaceFileApi(): FileApi;
}

/** readMoreHint 回调的输入：用于生成“按需读取更多”的提示。 */
export interface WorkspaceGuideReadMoreInfo {
  /** 传给文件读取 Agent 工具的路径（Vault 相对或系统绝对）。 */
  readonly path: string;
  /** 指南文件名（如 AGENTS.md）。 */
  readonly filename: string;
  /** 文件总行数。 */
  readonly totalLines: number;
  /** 本次注入的行数。 */
  readonly shownLines: number;
  /** 尚未注入的剩余行数。 */
  readonly remainingLines: number;
}

/** createWorkspaceGuideTransformer 的配置。 */
export interface WorkspaceGuideTransformerOptions {
  /** 转换器唯一标识（区分不同来源的注入）。 */
  readonly id: string;
  /** 注入意图说明（用于消息变换来源）。 */
  readonly intent: string;
  /** 工作区访问（通常是注入的 workspaceManager）。 */
  readonly workspace: WorkspaceFileAccess;
  /** 当前是否启用；每次变换读取，设置改动即时生效。 */
  readonly isEnabled?: () => boolean;
  /**
   * 指南文件名（位于工作区根目录，如 AGENTS.md / CLAUDE.md）。
   * 可传静态值，或返回当前值的 getter 以便随设置变化。
   */
  readonly filename: string | (() => string);
  /**
   * 注入内容最大字符数（防撑爆模型上下文）。与 maxLines 二选一；两者都传时 maxLines 优先。
   * 可传静态值，或返回当前值的 getter 以便随设置变化。
   */
  readonly maxChars?: number | (() => number);
  /**
   * 注入内容最大行数（按行截断，用于“只读前 N 行，其余用读取工具按需读取”）。
   * 与 maxChars 二选一；两者都传时 maxLines 优先。
   * 可传静态值，或返回当前值的 getter 以便随设置变化。
   */
  readonly maxLines?: number | (() => number);
  /**
   * 内容被截断（仍有未注入的剩余行）时，生成附加在指南末尾的“按需读取更多”提示；
   * 返回 undefined 则不附加。常用于提示模型调用文件读取工具读取后续内容。
   */
  readonly readMoreHint?: (info: WorkspaceGuideReadMoreInfo) => string | undefined;
  /** 包裹标签标题；默认 `${filename} 项目工作指南`。可传静态值或按文件名生成的函数。 */
  readonly tag?: string | ((filename: string) => string);
  /** 匹配的消息角色（默认 'user'）。 */
  readonly matchRole?: 'user' | 'system';
  /** 注入位置（默认 'prepend'，置于目标内容之前）。 */
  readonly position?: 'prepend' | 'append';
}

/** 解析静态值或 getter，返回当前值。 */
function resolveValue<T>(value: T | (() => T)): T {
  return typeof value === 'function' ? (value as () => T)() : value;
}

/** 解析包裹标签：函数按文件名生成，静态直接用，缺省为 `${filename} 项目工作指南`。 */
function resolveTag(tag: WorkspaceGuideTransformerOptions['tag'], filename: string): string {
  if (typeof tag === 'function') return tag(filename);
  if (typeof tag === 'string') return tag;
  return `${filename} 项目工作指南`;
}

/** 判断是否 Vault 根目录（相对路径场景）。 */
function isVaultPath(workspacePath: string): boolean {
  return workspacePath === '' || workspacePath === '.';
}

/**
 * 把 base 与 name 拼接成平台路径；复用 base 中已有的分隔符（兼容 Windows `\` 与 POSIX `/`），
 * 避免分隔符混用导致读取失败。
 */
export function joinWorkspacePath(base: string, name: string): string {
  const sep = base.includes('\\') ? '\\' : '/';
  return base.endsWith(sep) ? base + name : base + sep + name;
}

/** 按 maxLines/maxChars 截断文本，返回展示内容与剩余行数。 */
function truncate(
  text: string,
  maxLines: number | undefined,
  maxChars: number | undefined,
): { shown: string; shownLines: number; remainingLines: number; totalLines: number } {
  const allLines = text.split('\n');
  const totalLines = allLines.length;
  if (maxLines != null) {
    const n = Math.max(1, Math.floor(maxLines));
    return { shown: allLines.slice(0, n).join('\n'), shownLines: n, remainingLines: Math.max(0, totalLines - n), totalLines };
  }
  if (maxChars != null) {
    const shown = text.slice(0, Math.max(1, Math.floor(maxChars)));
    const shownLines = shown.split('\n').length;
    return { shown, shownLines, remainingLines: Math.max(0, totalLines - shownLines), totalLines };
  }
  return { shown: text, shownLines: totalLines, remainingLines: 0, totalLines };
}

/** 读取工作区根目录指南文件并包装为 `<system_reminder>` 块；文件缺失、不可读或为空时返回 undefined。 */
async function readWorkspaceGuide(
  fileApi: FileApi,
  toolPath: string,
  filename: string,
  maxLines: number | undefined,
  maxChars: number | undefined,
  tag: string,
  readMoreHint: WorkspaceGuideTransformerOptions['readMoreHint'],
): Promise<string | undefined> {
  let text: string;
  try {
    text = await fileApi.readText(toolPath);
  } catch {
    return undefined;
  }
  if (!text.trim()) return undefined;
  const { shown, shownLines, remainingLines, totalLines } = truncate(text, maxLines, maxChars);
  const lines = ['<system_reminder>', `<${tag}>`, shown, `</${tag}>`];
  if (remainingLines > 0 && readMoreHint) {
    const hint = readMoreHint({ path: toolPath, filename, totalLines, shownLines, remainingLines });
    if (hint) lines.push(hint);
  }
  lines.push('</system_reminder>');
  return lines.join('\n');
}

/**
 * 创建“把工作区根目录的指南文件注入模型上下文”的消息转换器。
 *
 * 命中匹配角色消息时：解析会话工作区路径（未知/失效 ID 回退到 Vault 根目录），
 * 读取工作区根目录的指南文件，按 position 注入一个 `<system_reminder>` 包裹块。
 * 可选按行数/字符数截断，并在截断时用 readMoreHint 生成“按需读取更多”提示。
 * 未启用、信号已中止、文件缺失/不可读/为空时不注入。用 messageTransformerManager.register 注册，
 * 卸载时用同一实例 unregister。
 */
export function createWorkspaceGuideTransformer(options: WorkspaceGuideTransformerOptions): MessageTransformer {
  const matchRole = options.matchRole ?? 'user';
  const position = options.position ?? 'prepend';
  return {
    id: options.id,
    intent: options.intent,
    match: (event) => event.payload.message.role === matchRole,
    transform: async (_event: unknown, context: TurnExecutionContext): Promise<MessageTransform | undefined> => {
      if (options.isEnabled?.() === false || context.signal.aborted) return undefined;
      const filename = resolveValue(options.filename);
      const maxChars = options.maxChars != null ? resolveValue(options.maxChars) : undefined;
      const maxLines = options.maxLines != null ? resolveValue(options.maxLines) : undefined;
      const sessionData = context.session.data as { workspaceId?: string };
      let workspacePath: string;
      try {
        workspacePath = options.workspace.getWorkspacePath(sessionData.workspaceId);
      } catch {
        workspacePath = options.workspace.getWorkspacePath();
      }
      // 读取与“读取更多提示”共用同一路径：Vault 用相对路径，注册工作区用绝对路径
      const toolPath = isVaultPath(workspacePath) ? filename : joinWorkspacePath(workspacePath, filename);
      const content = await readWorkspaceGuide(
        options.workspace.getWorkspaceFileApi(),
        toolPath,
        filename,
        maxLines,
        maxChars,
        resolveTag(options.tag, filename),
        options.readMoreHint,
      );
      if (!content || context.signal.aborted) return undefined;
      return { type: position, intent: options.intent, content: [{ type: 'text', text: content }] };
    },
  };
}
