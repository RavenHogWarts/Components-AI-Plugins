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
   * 注入内容最大字符数，防止指南过大撑爆模型上下文（默认 20000）。
   * 可传静态值，或返回当前值的 getter 以便随设置变化。
   */
  readonly maxChars?: number | (() => number);
  /** 包裹标签标题；默认 `${filename} 项目工作指南`。可传静态值或按文件名生成的函数。 */
  readonly tag?: string | ((filename: string) => string);
  /** 匹配的消息角色（默认 'user'）。 */
  readonly matchRole?: 'user' | 'system';
  /** 注入位置（默认 'prepend'，指南置于用户请求之前）。 */
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

/**
 * 把 base 与 name 拼接成平台路径；复用 base 中已有的分隔符（兼容 Windows `\` 与 POSIX `/`），
 * 避免分隔符混用导致读取失败。
 */
export function joinWorkspacePath(base: string, name: string): string {
  const sep = base.includes('\\') ? '\\' : '/';
  return base.endsWith(sep) ? base + name : base + sep + name;
}

/** 读取工作区根目录指南文件并包装为 `<system_reminder>` 块；文件缺失、不可读或为空时返回 undefined。 */
async function readWorkspaceGuide(
  fileApi: FileApi,
  workspacePath: string,
  filename: string,
  maxChars: number,
  tag: string,
): Promise<string | undefined> {
  let text: string;
  try {
    text = await fileApi.readText(joinWorkspacePath(workspacePath, filename));
  } catch {
    return undefined;
  }
  if (!text.trim()) return undefined;
  const limited = text.length > maxChars ? text.slice(0, maxChars) : text;
  return ['<system_reminder>', `<${tag}>`, limited, `</${tag}>`, '</system_reminder>'].join('\n');
}

/**
 * 创建“把工作区根目录的指南文件注入模型上下文”的消息转换器。
 *
 * 命中匹配角色消息时：解析会话工作区路径（未知/失效 ID 回退到 Vault 根目录），
 * 读取工作区根目录的指南文件，按 position 注入一个 `<system_reminder>` 包裹块。
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
      const maxChars = options.maxChars != null ? resolveValue(options.maxChars) : 20000;
      const sessionData = context.session.data as { workspaceId?: string };
      let workspacePath: string;
      try {
        workspacePath = options.workspace.getWorkspacePath(sessionData.workspaceId);
      } catch {
        workspacePath = options.workspace.getWorkspacePath();
      }
      const content = await readWorkspaceGuide(
        options.workspace.getWorkspaceFileApi(),
        workspacePath,
        filename,
        maxChars,
        resolveTag(options.tag, filename),
      );
      if (!content || context.signal.aborted) return undefined;
      return { type: position, intent: options.intent, content: [{ type: 'text', text: content }] };
    },
  };
}
