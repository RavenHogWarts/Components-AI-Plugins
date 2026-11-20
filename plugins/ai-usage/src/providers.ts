/** 从已配置的模型连接中识别支持用量查询的目标 */

export type ProviderKind = 'glm' | 'deepseek' | 'codex';

export interface UsageTarget {
  /** 稳定 key：连接名或 'codex' */
  key: string;
  kind: ProviderKind;
  /** 展示标题 */
  title: string;
  /** 副标题（baseUrl 等） */
  subtitle: string;
  /** GLM 区域（仅 glm） */
  region?: 'cn' | 'intl';
  /** 复用的 API Key（glm/deepseek） */
  apiKey?: string;
}

const GLM_ENDPOINTS = { cn: 'https://open.bigmodel.cn', intl: 'https://api.z.ai' } as const;
const DEEPSEEK_ENDPOINT = 'https://api.deepseek.com';

function hostnameOf(baseUrl: unknown): string | undefined {
  if (typeof baseUrl !== 'string' || baseUrl.length === 0) return undefined;
  try {
    return new URL(baseUrl).hostname;
  } catch {
    return undefined;
  }
}

function isGlmHostname(hostname: string): boolean {
  return ['open.bigmodel.cn', 'api.z.ai'].some(
    (host) => hostname === host || hostname.endsWith(`.${host}`),
  );
}

function glmRegionOf(hostname: string): 'cn' | 'intl' {
  return hostname === 'bigmodel.cn' || hostname.endsWith('.bigmodel.cn') ? 'cn' : 'intl';
}

function isDeepseekHostname(hostname: string): boolean {
  return hostname === 'api.deepseek.com' || hostname.endsWith('.deepseek.com');
}

/** 连接记录的宽松视图（ModelConnectionData 未公开字段结构） */
export interface ConnectionLike {
  readonly name?: unknown;
  readonly baseUrl?: unknown;
  readonly apiKey?: unknown;
}

/** 分类已配置连接；只返回匹配 GLM / DeepSeek 官方域名且带 Key 的连接 */
export function classifyConnections(connections: readonly unknown[]): UsageTarget[] {
  const targets: UsageTarget[] = [];
  for (const raw of connections) {
    const connection = raw as ConnectionLike;
    const hostname = hostnameOf(connection.baseUrl);
    const apiKey =
      typeof connection.apiKey === 'string' ? connection.apiKey.trim() : '';
    const name = typeof connection.name === 'string' ? connection.name : hostname ?? '未命名连接';
    if (!hostname || apiKey.length === 0) continue;
    if (isGlmHostname(hostname)) {
      targets.push({
        key: name,
        kind: 'glm',
        title: 'GLM',
        subtitle: `${name} · ${hostname}`,
        region: glmRegionOf(hostname),
        apiKey,
      });
    } else if (isDeepseekHostname(hostname)) {
      targets.push({
        key: name,
        kind: 'deepseek',
        title: 'DeepSeek',
        subtitle: `${name} · ${hostname}`,
        apiKey,
      });
    }
  }
  return targets;
}

export function codexTarget(commandPath: string): UsageTarget {
  return {
    key: 'codex',
    kind: 'codex',
    title: 'Codex',
    subtitle: commandPath && commandPath.length > 0 ? commandPath : 'codex CLI',
  };
}

export function glmEndpoint(region: 'cn' | 'intl'): string {
  return GLM_ENDPOINTS[region];
}

export function deepseekEndpoint(): string {
  return DEEPSEEK_ENDPOINT;
}