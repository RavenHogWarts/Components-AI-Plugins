import { Plugin } from '@obsidian-components/ai-api';

/**
 * workspaceManager / WorkspaceFileApi 未收录于 vendor/ai-api 类型快照（2026-11-21），
 * 按 inspect_docs(@obsidian-components/ai-api#WorkspaceManager) 与 WorkspaceFileApi 的最小契约本地声明。
 * 运行时该实例由应用提供，字段/方法与此处一致。
 */
interface WorkspaceData {
  readonly id: string;
  readonly name: string;
  readonly path: string;
  readonly defaultAgentId?: string;
}

interface WorkspaceFileApi {
  readText(path: string): Promise<string>;
  process(path: string, change: (current: string | undefined) => string | undefined): Promise<void>;
}

interface WorkspaceManagerApi {
  getWorkspaces(): readonly WorkspaceData[];
  getWorkspaceFileApi(): WorkspaceFileApi;
  on(type: 'workspace.changed', listener: () => void): () => void;
  /**
   * 非公开但真实存在：重新读取并发布工作区注册。
   * workspaceManager 只暴露 create/rename/update，没有 delete；删除需直接改配置文件后借此刷新 UI。
   */
  load(): Promise<unknown>;
}

/** 会话列表工作区配置文件（相对 Vault 根）。应用侧同一路径。 */
const CONFIG_PATH = '.obsidian/plugins/components/workspace.json';
/** 删除按钮标记类与属性，用于幂等注入与清理。 */
const DELETE_BTN_CLASS = 'xdb--WSDeleteBtn';
const DELETE_ATTR = 'data-ws-delete';

const TRASH_SVG = [
  '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24"',
  ' fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"',
  ' class="lucide lucide-trash-2" aria-hidden="true">',
  '<path d="M3 6h18"></path>',
  '<path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"></path>',
  '<path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"></path>',
  '<line x1="10" x2="10" y1="11" y2="17"></line>',
  '<line x1="14" x2="14" y1="11" y2="17"></line>',
  '</svg>',
].join('');

export default class WorkspaceManagementPlugin extends Plugin {
  static inject = ['workspaceManager'] as const;

  private wm!: WorkspaceManagerApi;
  private observer: MutationObserver | null = null;
  private releaseWorkspace: (() => void) | undefined;

  async onResolving(): Promise<void> {
    // 必需服务缺失时该插件保持 unresolved，这里仅为类型收敛。
    const wm = this.dependencies['workspaceManager'] as WorkspaceManagerApi | undefined;
    if (!wm) return;
    this.wm = wm;

    // 会话列表是动态挂载的：监听 DOM 变化 + 工作区变化事件，保证注入按钮在重渲染后依然存在。
    this.observer = new MutationObserver((records) => {
      if (this.isRelevant(records)) this.scan();
    });
    this.observer.observe(document.body, { childList: true, subtree: true });

    this.releaseWorkspace = wm.on('workspace.changed', () => this.scan());

    this.scan();
  }

  async onDisposing(): Promise<void> {
    this.observer?.disconnect();
    this.observer = null;
    this.releaseWorkspace?.();
    this.releaseWorkspace = undefined;
    // 清理本插件注入的删除按钮，避免 reload 风暴遗留孤儿 DOM。
    document.querySelectorAll<HTMLElement>(`[${DELETE_ATTR}]`).forEach((el) => el.remove());
  }

  /** 为每个可删除（非默认）工作区的操作栏注入删除按钮。幂等：已有按钮则跳过。 */
  private scan(): void {
    const branches = document.querySelectorAll<HTMLElement>('.xdb--SessionWorkspaceBranch');
    for (const branch of branches) {
      const name = branch.getAttribute('aria-label');
      if (!name) continue;
      const actions = branch.querySelector<HTMLElement>('.xdb--SessionWorkspaceActions');
      if (!actions || actions.querySelector(`[${DELETE_ATTR}]`)) continue;
      const ws = this.findDeletable(name);
      if (ws) this.appendDeleteButton(actions, ws);
    }
  }

  /** 仅非默认工作区可删除；默认 Vault 的 id 恒为 'vault'，不在配置文件中。 */
  private findDeletable(name: string): WorkspaceData | undefined {
    return this.wm.getWorkspaces().find((w) => w.id !== 'vault' && w.name === name);
  }

  private appendDeleteButton(actions: HTMLElement, ws: WorkspaceData): void {
    const doc = actions.ownerDocument;
    const btn = doc.createElement('button');
    btn.type = 'button';
    btn.className = `xdb--Button xdb--IconButton ${DELETE_BTN_CLASS}`;
    btn.setAttribute('data-color', 'default');
    btn.setAttribute('data-shape', 'default');
    btn.setAttribute('data-size', 'sm');
    btn.setAttribute('data-slot', 'icon-button');
    btn.setAttribute('data-variant', 'ghost');
    btn.setAttribute(DELETE_ATTR, ws.id);
    btn.title = '删除工作区';
    btn.setAttribute('aria-label', `删除工作区 · ${ws.name}`);
    btn.innerHTML = TRASH_SVG;
    btn.addEventListener('click', (event) => {
      event.preventDefault();
      event.stopPropagation();
      void this.handleDelete(ws, btn);
    });
    actions.appendChild(btn);
  }

  private async handleDelete(ws: WorkspaceData, btn: HTMLButtonElement): Promise<void> {
    const ok = window.confirm(`确定删除工作区「${ws.name}」吗？\n该工作区将从会话列表中移除。`);
    if (!ok) return;
    btn.disabled = true;
    try {
      const filesApi = this.wm.getWorkspaceFileApi();
      let changed = false;
      // 原子读改写配置文件；条目未匹配时返回 undefined 保持文件不变。
      await filesApi.process(CONFIG_PATH, (current) => {
        const list = current ? (JSON.parse(current) as WorkspaceData[]) : [];
        const updated = list.filter((item) => item.id !== ws.id);
        if (updated.length === list.length) return undefined;
        changed = true;
        return JSON.stringify(updated, null, 2);
      });
      if (changed) {
        // 应用侧无公开删除接口，写入后调用其 load() 重新读取并发布，从而驱动会话列表刷新。
        await this.wm.load();
      }
    } catch (error) {
      console.error('[workspace-management] 删除工作区失败', error);
      btn.disabled = false;
      window.alert(`删除工作区失败：${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /** 只对会话列表容器内的 DOM 变化触发重扫，避免全页高频重扫。 */
  private isRelevant(records: MutationRecord[]): boolean {
    return records.some((record) => {
      const target = record.target;
      if (target instanceof Element && target.closest('.xdb--SessionListContainer')) return true;
      for (const node of record.addedNodes) {
        if (!(node instanceof Element)) continue;
        if (
          node.matches('.xdb--SessionWorkspaceBranch') ||
          node.querySelector('.xdb--SessionWorkspaceBranch') ||
          node.closest('.xdb--SessionListContainer')
        ) {
          return true;
        }
      }
      return false;
    });
  }
}
