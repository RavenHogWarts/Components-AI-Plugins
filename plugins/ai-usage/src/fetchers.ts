import { spawn } from 'node:child_process';
import type { HttpClient, HttpResponse } from '@obsidian-components/ai-api';
import { deepseekEndpoint, glmEndpoint, type UsageTarget } from './providers';

/** 归一化用量读数 */
export interface UsageWindow {
  label: string;
  /** tokens=Token 用量；tools=工具调用配额；credit=信用额度 */
  kind: 'tokens' | 'tools' | 'credit' | 'other';
  usedPercent?: number;
  used?: number;
  limit?: number;
  resetsAt?: number;
  /** 明细分项（如各工具的调用次数） */
  details?: ReadonlyArray<{ label: string; used?: number }>;
}

export interface UsageAmount {
  label: string;
  text: string;
}

export interface Reading {
  title: string;
  plan?: string;
  windows: UsageWindow[];
  amounts: UsageAmount[];
  notice?: string;
  fetchedAt: number;
}

function recordOf(value: unknown): Record<string, unknown> | undefined {
  return value != null && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;
}

function numberOf(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

function stringOf(value: unknown): string | undefined {
  return typeof value === 'string' && value.length > 0 ? value : undefined;
}

function clampPercent(value: number | undefined): number | undefined {
  if (value == null || !Number.isFinite(value)) return undefined;
  return Math.min(100, Math.max(0, value));
}

function ratioPercent(currentValue: number | undefined, usage: number | undefined): number | undefined {
  if (currentValue == null || usage == null || usage <= 0) return undefined;
  return (currentValue / usage) * 100;
}

async function getJson(
  http: HttpClient,
  url: string,
  headers: Record<string, string>,
): Promise<unknown> {
  const response: HttpResponse<ArrayBuffer> = await http.request({ url, method: 'GET', headers });
  const text = new TextDecoder().decode(response.body);
  if (response.status >= 400) {
    const err = new Error(`HTTP ${response.status}`) as Error & { status?: number };
    err.status = response.status;
    throw err;
  }
  try {
    return JSON.parse(text);
  } catch {
    throw new Error('响应不是有效 JSON');
  }
}

// ---------- GLM ----------

function glmWindowKind(type: string): 'tokens' | 'tools' | 'credit' | 'other' {
  if (type === 'TOKENS_LIMIT') return 'tokens';
  if (type === 'CREDIT_LIMIT') return 'credit';
  if (type === 'TIME_LIMIT') return 'tools';
  return 'other';
}

/** unit=3 表示小时单位（窗口=number 小时）；5 表示 5 小时；6 表示周 */
function glmWindowLabel(type: string, unit: number | undefined, windowNumber: number | undefined): string {
  if (type === 'TOKENS_LIMIT') return 'Token 用量';
  if (type === 'CREDIT_LIMIT') return '信用额度';
  const hours = unit === 3 ? (windowNumber ?? 1) : unit === 6 ? 168 : (unit ?? 5);
  const span = hours >= 24 ? `${hours / 24} 天` : `${hours} 小时`;
  if (type === 'TIME_LIMIT') return `工具调用（每 ${span}）`;
  return span;
}

export async function fetchGlmReading(http: HttpClient, target: UsageTarget): Promise<Reading> {
  const payload = await getJson(http, `${glmEndpoint(target.region ?? 'intl')}/api/monitor/usage/quota/limit`, {
    accept: 'application/json',
    authorization: target.apiKey ?? '',
    'accept-language': 'zh-CN,zh;q=0.9,en;q=0.8',
  });
  const record = recordOf(payload);
  const code = numberOf(record?.['code']);
  if (code != null && code !== 200) {
    throw new Error(`GLM 查询失败：${stringOf(record?.['msg']) ?? `code ${code}`}`);
  }
  const data = recordOf(record?.['data']);
  const limits = Array.isArray(data?.['limits']) ? (data!['limits'] as unknown[]) : [];
  const windows: UsageWindow[] = [];
  for (const raw of limits) {
    const limit = recordOf(raw);
    const type = stringOf(limit?.['type']);
    if (!limit || !type) continue;
    const usage = numberOf(limit['usage']);
    const currentValue = numberOf(limit['currentValue']);
    const reported = numberOf(limit['percentage']);
    const resetsAtRaw = limit['nextResetTime'];
    const resetsAt =
      typeof resetsAtRaw === 'string' && /^\d+$/.test(resetsAtRaw)
        ? Number(resetsAtRaw)
        : numberOf(resetsAtRaw);
    const detailsRaw = Array.isArray(limit['usageDetails']) ? (limit['usageDetails'] as unknown[]) : [];
    const details: Array<{ label: string; used?: number }> = [];
    for (const item of detailsRaw) {
      const detail = recordOf(item);
      const label = stringOf(detail?.['modelCode']);
      const used = numberOf(detail?.['usage']) ?? 0;
      if (label != null && used !== 0) details.push({ label, used });
    }
    windows.push({
      label: glmWindowLabel(type, numberOf(limit['unit']), numberOf(limit['number'])),
      kind: glmWindowKind(type),
      usedPercent: clampPercent(reported ?? ratioPercent(currentValue, usage)),
      used: currentValue,
      limit: usage,
      resetsAt,
      details: details.length > 0 ? details : undefined,
    });
  }
  return {
    title: 'GLM',
    plan: stringOf(data?.['level']),
    windows,
    amounts: [],
    fetchedAt: Date.now(),
  };
}

// ---------- DeepSeek ----------

const DEEPSEEK_AMOUNTS: ReadonlyArray<{ key: string; label: string }> = [
  { key: 'total_balance', label: '总余额' },
  { key: 'topped_up_balance', label: '充值余额' },
  { key: 'granted_balance', label: '赠送余额' },
];

export async function fetchDeepseekReading(http: HttpClient, target: UsageTarget): Promise<Reading> {
  const payload = await getJson(http, `${deepseekEndpoint()}/user/balance`, {
    accept: 'application/json',
    authorization: `Bearer ${target.apiKey ?? ''}`,
  });
  const record = recordOf(payload);
  const infos = Array.isArray(record?.['balance_infos']) ? (record!['balance_infos'] as unknown[]) : [];
  const amounts: UsageAmount[] = [];
  for (const raw of infos) {
    const info = recordOf(raw);
    if (!info) continue;
    const currency = stringOf(info['currency']) ?? '';
    const symbol = currency === 'CNY' ? '¥' : currency.length > 0 ? `${currency} ` : '';
    for (const spec of DEEPSEEK_AMOUNTS) {
      const value = numberOf(info[spec.key]);
      if (value != null) {
        amounts.push({ label: spec.label, text: `${symbol}${value.toFixed(2)}` });
      }
    }
  }
  return {
    title: 'DeepSeek',
    windows: [],
    amounts,
    notice: record?.['is_available'] === false ? '账户当前不可用' : undefined,
    fetchedAt: Date.now(),
  };
}

// ---------- Codex CLI ----------

const RPC_TIMEOUT_MS = 10_000;

class CodexRpc {
  private buffer = '';
  private nextId = 0;
  private readonly waiters = new Map<number, { resolve: (v: unknown) => void; reject: (e: Error) => void }>();

  constructor(
    private readonly child: {
      stdout?: { setEncoding(e: string): void; on(ev: string, fn: (chunk: string) => void): void };
      stdin?: { write(data: string): void };
      once(ev: string, fn: (arg?: unknown) => void): void;
      kill(): void;
    },
  ) {
    child.stdout?.setEncoding('utf8');
    child.stdout?.on('data', (chunk) => this.receive(chunk));
    child.once('error', (error) => this.fail(error instanceof Error ? error : new Error(String(error))));
    child.once('exit', () => this.fail(new Error('codex app-server 提前退出')));
  }

  request(method: string, params: Record<string, unknown> = {}): Promise<unknown> {
    this.nextId += 1;
    const id = this.nextId;
    const line = JSON.stringify({ jsonrpc: '2.0', id, method, params });
    return new Promise((resolve, reject) => {
      this.waiters.set(id, { resolve, reject });
      this.child.stdin?.write(`${line}\n`);
    });
  }

  private receive(chunk: string): void {
    this.buffer += chunk;
    for (;;) {
      const index = this.buffer.indexOf('\n');
      if (index === -1) return;
      const line = this.buffer.slice(0, index).trim();
      this.buffer = this.buffer.slice(index + 1);
      if (line.length > 0) this.dispatch(line);
    }
  }

  private dispatch(line: string): void {
    let parsed: unknown;
    try {
      parsed = JSON.parse(line);
    } catch {
      return;
    }
    const record = recordOf(parsed);
    const id = numberOf(record?.['id']);
    if (record == null || id == null) return;
    const waiter = this.waiters.get(id);
    if (!waiter) return;
    this.waiters.delete(id);
    const error = recordOf(record['error']);
    if (error) waiter.reject(new Error(stringOf(error['message']) ?? 'codex RPC 错误'));
    else waiter.resolve(record['result']);
  }

  private fail(error: Error): void {
    for (const waiter of [...this.waiters.values()]) waiter.reject(error);
    this.waiters.clear();
  }
}

function windowLabelOfMinutes(minutes: number | undefined): string {
  if (minutes == null) return '窗口';
  if (minutes % 1440 === 0) return `${minutes / 1440} 天`;
  if (minutes % 60 === 0) return `${minutes / 60} 小时`;
  return `${minutes} 分钟`;
}

function codexWindow(value: unknown): UsageWindow | undefined {
  const record = recordOf(value);
  if (!record) return undefined;
  const usedPercent = clampPercent(numberOf(record['usedPercent']));
  const minutes = numberOf(record['windowDurationMins']);
  const resetsAt = numberOf(record['resetsAt']);
  if (usedPercent == null && minutes == null && resetsAt == null) return undefined;
  return { label: windowLabelOfMinutes(minutes), kind: 'other', usedPercent, resetsAt };
}

function withTimeoutMs<T>(promise: Promise<T>): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('codex RPC 超时')), RPC_TIMEOUT_MS);
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (error) => {
        clearTimeout(timer);
        reject(error instanceof Error ? error : new Error(String(error)));
      },
    );
  });
}

export async function fetchCodexReading(commandPath: string): Promise<Reading> {
  const command = commandPath.length > 0 ? commandPath : 'codex';
  const child = spawn(command, ['-s', 'read-only', '-a', 'never', 'app-server'], {
    stdio: ['pipe', 'pipe', 'ignore'],
  });
  const rpc = new CodexRpc(child);
  try {
    await withTimeoutMs(
      rpc.request('initialize', { clientInfo: { name: 'ai-usage', title: 'ai-usage', version: '0.1.0' } }),
    );
    const response = await withTimeoutMs(rpc.request('account/rateLimits/read'));
    const result = recordOf(recordOf(response)?.['result']);
    const rateLimits = recordOf(result?.['rateLimits']);
    const windows = [codexWindow(rateLimits?.['primary']), codexWindow(rateLimits?.['secondary'])].filter(
      (window): window is UsageWindow => window != null,
    );
    return {
      title: 'Codex',
      plan: stringOf(rateLimits?.['planType']),
      windows,
      amounts: [],
      fetchedAt: Date.now(),
    };
  } finally {
    child.kill();
  }
}
export function canSpawnProcesses(): boolean {
  return (
    typeof process !== 'undefined' &&
    typeof (process as { versions?: { electron?: unknown } }).versions?.electron === 'string'
  );
}

/** 探测 codex CLI 是否可用（一次 spawn --version，4 秒超时） */
export async function probeCodex(command: string): Promise<boolean> {
  if (!canSpawnProcesses()) return false;
  return await new Promise<boolean>((resolve) => {
    let settled = false;
    const done = (value: boolean): void => {
      if (!settled) {
        settled = true;
        resolve(value);
      }
    };
    try {
      const child = spawn(command, ['--version'], { stdio: 'ignore' });
      const timer = setTimeout(() => {
        child.kill();
        done(false);
      }, 4000);
      child.once('error', () => {
        clearTimeout(timer);
        done(false);
      });
      child.once('exit', (code) => {
        clearTimeout(timer);
        done(code === 0);
      });
    } catch {
      done(false);
    }
  });
}