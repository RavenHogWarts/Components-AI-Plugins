import { Plugin } from '@obsidian-components/ai-api';

/**
 * 轮询已启用插件的部署文件（xdb-ai/main.js），mtime/size 变化即自动 reload——
 * pnpm deploy 后无需手动切换开关，代码即时生效。
 *
 * 说明：files.subscribe 的监听范围不含 .agents 隐藏目录（实测），
 * 故采用应用内轮询（默认 2 秒，本地 stat 开销极低）。
 */
export default class DevHotReloadPlugin extends Plugin {
  static inject = [] as const;

  private timer?: ReturnType<typeof setInterval>;
  private readonly baseline = new Map<string, string>();
  private primed = false;
  private scanning = false;

  onApplicationReady(): void {
    this.timer = setInterval(() => void this.scan(), 2000);
  }

  private async scan(): Promise<void> {
    if (this.api.signal.aborted || this.scanning) return;
    this.scanning = true;
    try {
      const plugins = this.api.app.pluginManager;
      for (const info of plugins.list()) {
        if (this.api.signal.aborted) return;
        if (!info.enabled || info.status !== 'loaded') continue;
        const name = info.manifest.name;
        // 跳过自身：自身部署后无法自举，需手动重载一次；若在 scan 中途重载自身会重启定时器造成竞态
        if (name === this.api.manifest.name || !info.path) continue;
        const entry = this.entryPath(info.path);
        let key: string;
        try {
          const stat = await this.api.app.files.stat(entry);
          key = stat ? `${stat.mtime ?? 0}:${stat.size ?? 0}` : '';
        } catch {
          // stat 瞬时失败（Windows 部署写锁等）：保留基线，避免误重载
          continue;
        }
        const previous = this.baseline.get(name);
        this.baseline.set(name, key);
        // 首轮只建基线；之后文件变化才重载
        if (!this.primed || previous === undefined || key === previous || key === '') continue;
        try {
          await plugins.reload(name);
          console.log(`[dev-hot-reload] 已重载 ${name}`);
        } catch (error) {
          console.warn(`[dev-hot-reload] 重载 ${name} 失败:`, error);
        }
      }
      this.primed = true;
    } finally {
      this.scanning = false;
    }
  }

  /** info.path 为原生路径（Win 用 `\\`，POSIX 用 `/`），按实际分隔符拼 main.js */
  private entryPath(base: string): string {
    const sep = base.includes('\\') ? '\\' : '/';
    return `${base}${sep}xdb-ai${sep}main.js`;
  }

  onDisposing(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = undefined;
    this.baseline.clear();
    this.primed = false;
    this.scanning = false;
  }
}
