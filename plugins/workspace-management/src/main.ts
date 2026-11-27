import { Plugin } from '@obsidian-components/ai-api';

/**
 * workspaceManager / WorkspaceFileApi / SessionManager / AppDataManager 未收录于
 * vendor/ai-api 类型快照，按 inspect_docs 与运行时实际契约做最小本地声明。
 */
interface WorkspaceData {
  readonly id: string;
  readonly name: string;
  readonly path: string;
  readonly defaultAgentId?: string;
}

interface WorkspaceFileApi {
  readText(path: string): Promise<string>;
  write(path: string, content: string | Uint8Array): Promise<void>;
  process(path: string, change: (current: string | undefined) => string | undefined): Promise<void>;
  remove(path: string): Promise<void>;
  list(path: string): Promise<readonly unknown[]>;
}

interface WorkspaceManagerApi {
  getWorkspaces(): readonly WorkspaceData[];
  getWorkspaceFileApi(): WorkspaceFileApi;
  on(type: 'workspace.changed', listener: () => void): () => void;
  /** 非公开但真实存在：重新读取并发布工作区注册。workspaceManager 无公开 delete。 */
  load(): Promise<unknown>;
}

interface SessionRecord {
  readonly id: string;
  readonly title?: string;
  readonly workspaceId?: string;
}

interface SessionManagerApi {
  list(): Promise<readonly SessionRecord[]>;
  getById(id: string): Promise<SessionRecord | null>;
  delete(id: string): Promise<void>;
}

interface AppDataManagerApi {
  path(...parts: readonly string[]): string;
}

/** 事件总线：用于主动补发 session.removed（应用删除会话时可能未发布，导致列表要重启才刷新）。 */
interface EventBusApi {
  publish(message: { type: string; sessionId?: string }): Promise<void>;
}

/** 会话列表工作区配置文件（相对 Vault 根）。 */
const CONFIG_PATH = '.obsidian/plugins/components/workspace.json';
/** 被删除工作区会话的归组标识（虚拟分组，不写入 workspace.json）。 */
const REMOVED_ID = 'xdb-removed-workspaces';
const REMOVED_LABEL = '已删除工作区';
/** 应用对无主会话分组的默认标签与角标（插件启用时改名为 REMOVED_LABEL 并移除角标）。 */
const ORPHAN_LABEL = '工作区不可用';
const ORPHAN_CHIP_TEXT = '本机不可用';
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
  static inject = ['workspaceManager', 'sessionManager', 'appDataManager', 'eventBus'] as const;

  private wm!: WorkspaceManagerApi;
  private sm!: SessionManagerApi;
  private fa!: WorkspaceFileApi;
  private appData!: AppDataManagerApi;
  private eventBus?: EventBusApi;
  private observer: MutationObserver | null = null;
  private releaseWorkspace: (() => void) | undefined;
  private draggedSessionId: string | null = null;

  /**
   * 会话目录（相对 Vault 根）。不缓存：每次由 appDataManager 按当前 AI 基础目录配置解析，
   * 用户改动 aiBaseFolder 后无需重载插件即可跟随。
   */
  private get sessionsRel(): string {
    return this.appData.path('sessions');
  }

  async onResolving(): Promise<void> {
    const wm = this.dependencies['workspaceManager'] as WorkspaceManagerApi | undefined;
    const sm = this.dependencies['sessionManager'] as SessionManagerApi | undefined;
    const appData = this.dependencies['appDataManager'] as AppDataManagerApi | undefined;
    if (!wm || !sm || !appData) return;
    this.wm = wm;
    this.sm = sm;
    this.fa = wm.getWorkspaceFileApi();
    this.appData = appData;
    this.eventBus = this.dependencies['eventBus'] as EventBusApi | undefined;

    this.observer = new MutationObserver((records) => {
      if (this.isRelevant(records)) this.scan();
    });
    this.observer.observe(document.body, { childList: true, subtree: true });

    this.releaseWorkspace = wm.on('workspace.changed', () => this.scan());

    this.scan();
    // 合并历史遗留的无主会话到虚拟分组（幂等：无主会话存在时才写文件）。
    void this.migrateOrphans();
  }

  async onDisposing(): Promise<void> {
    this.observer?.disconnect();
    this.observer = null;
    this.releaseWorkspace?.();
    this.releaseWorkspace = undefined;
    document.querySelectorAll<HTMLElement>(`[${DELETE_ATTR}]`).forEach((el) => el.remove());
    document.querySelectorAll('.xdb--WSDropTarget').forEach((el) => el.classList.remove('xdb--WSDropTarget'));
    document.querySelectorAll('[data-slot="session-list-item"]').forEach((el) => el.removeAttribute('draggable'));
    this.draggedSessionId = null;
    // 恢复"已删除工作区"分组的默认标签与角标：标签是插件 DOM 改动，禁用后应回到应用默认，避免残留。
    this.restoreRemovedBranch();
  }

  // ===== 扫描与注入 =====

  private scan(): void {
    this.cleanupStaleButtons();
    this.injectDeleteButtons();
    this.relabelRemovedBranch();
    this.wireDragDrop();
  }

  /** 删除已失效工作区的删除按钮（含被删工作区残留的 disabled 按钮）。 */
  private cleanupStaleButtons(): void {
    const deletable = new Set(
      this.wm.getWorkspaces().filter((w) => w.id !== 'vault' && w.id !== REMOVED_ID).map((w) => w.id),
    );
    document.querySelectorAll<HTMLElement>(`[${DELETE_ATTR}]`).forEach((btn) => {
      if (!deletable.has(btn.getAttribute(DELETE_ATTR) ?? '')) btn.remove();
    });
  }

  private injectDeleteButtons(): void {
    const branches = document.querySelectorAll<HTMLElement>('.xdb--SessionWorkspaceBranch');
    for (const branch of branches) {
      const name = branch.getAttribute('aria-label');
      if (!name || name === REMOVED_LABEL) continue;
      const actions = branch.querySelector<HTMLElement>('.xdb--SessionWorkspaceActions');
      if (!actions || actions.querySelector(`[${DELETE_ATTR}]`)) continue;
      const ws = this.findDeletable(name);
      if (ws) this.appendDeleteButton(actions, ws);
    }
  }

  private findDeletable(name: string): WorkspaceData | undefined {
    return this.wm
      .getWorkspaces()
      .find((w) => w.id !== 'vault' && w.id !== REMOVED_ID && w.name === name);
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

  /** 把虚拟"已删除工作区"分组的标签改名并去掉"本机不可用"标记。 */
  private relabelRemovedBranch(): void {
    const branch = document.querySelector<HTMLElement>(
      `[data-session-id="workspace:${REMOVED_ID}"]`,
    );
    if (!branch) return;
    const label = branch.querySelector('.xdb--SessionListLabel');
    if (label && label.textContent !== REMOVED_LABEL) label.textContent = REMOVED_LABEL;
    branch.querySelector('.xdb--Chip')?.remove();
  }

  /** 插件禁用时恢复"已删除工作区"分组的默认标签与"本机不可用"角标，避免 DOM 改动残留。 */
  private restoreRemovedBranch(): void {
    const branch = document.querySelector<HTMLElement>(
      `[data-session-id="workspace:${REMOVED_ID}"]`,
    );
    if (!branch) return;
    const label = branch.querySelector('.xdb--SessionListLabel');
    if (label && label.textContent === REMOVED_LABEL) label.textContent = ORPHAN_LABEL;
    if (label && !branch.querySelector('.xdb--Chip')) {
      const chip = label.ownerDocument.createElement('span');
      chip.setAttribute('data-variant', 'plain');
      chip.setAttribute('data-color', 'warning');
      chip.className = 'xdb--Chip';
      chip.textContent = ORPHAN_CHIP_TEXT;
      label.after(chip);
    }
  }

  // ===== 删除工作区 =====

  private async handleDelete(ws: WorkspaceData, btn: HTMLButtonElement): Promise<void> {
    const decision = await this.confirmWorkspaceDelete(ws);
    if (!decision) return;
    btn.disabled = true;
    const failures: string[] = [];
    try {
      let changed = false;
      await this.fa.process(CONFIG_PATH, (current) => {
        const list = current ? (JSON.parse(current) as WorkspaceData[]) : [];
        const updated = list.filter((item) => item.id !== ws.id);
        if (updated.length === list.length) return undefined;
        changed = true;
        return JSON.stringify(updated, null, 2);
      });
      if (!changed) {
        btn.disabled = false;
        return;
      }
      const sessions = await this.sm.list();
      const affected = sessions.filter((session) => session.workspaceId === ws.id);
      for (const session of affected) {
        try {
          if (decision === 'withSessions') {
            // 连同会话一起删除：删除会话记录；无论记录删除是否抛错，都清理其文件夹残留，
            // 确保 inbox.json/日志等连同文件夹一起删除。
            try {
              await this.sm.delete(session.id);
            } finally {
              await this.removeSessionFolder(session.id);
            }
            // 会话列表只在收到 session.removed 时刷新；应用删除会话可能未发布该事件
            // （或发布前抛错），此时列表要等重启才消失。这里主动补发，保证立即刷新。
            await this.publishSessionRemoved(session.id);
          } else {
            // 仅删除工作区：会话归入虚拟"已删除工作区"分组。
            await this.setSessionWorkspace(session.id, REMOVED_ID);
          }
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          if (decision === 'withSessions') {
            // sm.delete 可能在记录删除后因文件夹清理失败而抛错；此时会话已从列表删除，
            // 仅记录警告，不要误报为用户可见的失败。
            const stillExists = await this.sm
              .getById(session.id)
              .then((s) => s !== null)
              .catch(() => false);
            if (stillExists) failures.push(`${session.title || session.id}: ${message}`);
            else console.warn(`[workspace-management] 会话 ${session.id} 已删除，但文件夹清理失败`, error);
          } else {
            failures.push(`${session.title || session.id}: ${message}`);
          }
        }
      }
      // 始终刷新工作区注册，即使部分会话处理失败，避免工作区残留在状态里。
      await this.wm.load();
    } catch (error) {
      console.error('[workspace-management] 删除工作区失败', error);
      btn.disabled = false;
      window.alert(`删除工作区失败：${error instanceof Error ? error.message : String(error)}`);
      return;
    }
    if (failures.length) {
      console.warn('[workspace-management] 部分会话处理失败', failures);
      window.alert(`工作区已删除，但部分会话处理失败：\n${failures.slice(0, 5).join('\n')}`);
    }
  }

  /**
   * 自绘删除确认弹窗（Portal 到 body + fixed），提供两种处理方式与取消。
   * 应用无现成可用的选择对话框（window.confirm 只能返回布尔），故用应用按钮样式自绘。
   * @returns 'workspace' 仅删工作区（会话归入已删除工作区）| 'withSessions' 连同会话删除 | null 取消。
   */
  private confirmWorkspaceDelete(ws: WorkspaceData): Promise<'workspace' | 'withSessions' | null> {
    return new Promise((resolve) => {
      const doc = document;
      const backdrop = doc.createElement('div');
      backdrop.className = 'xdb--WSModalBackdrop';
      const modal = doc.createElement('div');
      modal.className = 'xdb--WSModal';
      modal.setAttribute('role', 'dialog');
      modal.setAttribute('aria-modal', 'true');
      const title = doc.createElement('div');
      title.className = 'xdb--WSModalTitle';
      title.textContent = `删除工作区「${ws.name}」`;
      const body = doc.createElement('div');
      body.className = 'xdb--WSModalBody';
      body.textContent = '工作区将从列表中移除。请选择其会话的处理方式：';
      const actions = doc.createElement('div');
      actions.className = 'xdb--WSModalActions';
      let settled = false;
      let keyHandler: ((event: KeyboardEvent) => void) | null = null;
      const close = (result: 'workspace' | 'withSessions' | null): void => {
        if (settled) return;
        settled = true;
        if (keyHandler) doc.removeEventListener('keydown', keyHandler);
        backdrop.remove();
        resolve(result);
      };
      const makeButton = (
        act: 'cancel' | 'workspace' | 'withSessions',
        label: string,
        extraClass = '',
        variant = 'ghost',
        color = 'default',
      ): HTMLButtonElement => {
        const button = doc.createElement('button');
        button.type = 'button';
        button.className = `xdb--Button ${extraClass}`.trim();
        button.setAttribute('data-act', act);
        button.setAttribute('data-variant', variant);
        button.setAttribute('data-color', color);
        button.setAttribute('data-size', 'sm');
        button.textContent = label;
        button.addEventListener('click', () =>
          close(act === 'cancel' ? null : act === 'withSessions' ? 'withSessions' : 'workspace'),
        );
        return button;
      };
      actions.appendChild(makeButton('cancel', '取消'));
      actions.appendChild(makeButton('workspace', '仅删除工作区（会话归入已删除工作区）', '', 'soft'));
      actions.appendChild(makeButton('withSessions', '连同会话一起删除', 'xdb--WSDeleteConfirm', 'solid', 'danger'));
      modal.append(title, body, actions);
      backdrop.appendChild(modal);
      const onKey = (event: KeyboardEvent): void => {
        if (event.key === 'Escape') close(null);
      };
      keyHandler = onKey;
      backdrop.addEventListener('click', (event) => {
        if (event.target === backdrop) close(null);
      });
      doc.addEventListener('keydown', keyHandler);
      doc.body.appendChild(backdrop);
    });
  }

  /** 合并所有无主会话（workspaceId 已不在注册中）到虚拟分组。 */
  private async migrateOrphans(): Promise<void> {
    try {
      const registered = new Set(this.wm.getWorkspaces().map((w) => w.id));
      const sessions = await this.sm.list();
      const orphans = sessions.filter((s) => {
        const wid = s.workspaceId;
        return !!wid && wid !== 'vault' && wid !== REMOVED_ID && !registered.has(wid);
      });
      for (const session of orphans) await this.setSessionWorkspace(session.id, REMOVED_ID);
    } catch (error) {
      console.error('[workspace-management] 合并无主会话失败', error);
    }
  }

  /**
   * 直接改写会话记录里的 workspaceId（应用禁止通过 Session.update 修改，但会侦测本文件的变更并重新分组）。
   * 记录缺失时静默跳过。
   */
  private async setSessionWorkspace(sessionId: string, workspaceId: string): Promise<void> {
    const file = `${this.sessionsRel}/${sessionId}/session.json`;
    let text: string;
    try {
      text = await this.fa.readText(file);
    } catch {
      return;
    }
    const data = JSON.parse(text) as { workspaceId?: string; [key: string]: unknown };
    if (data.workspaceId === workspaceId) return;
    data.workspaceId = workspaceId;
    await this.fa.write(file, JSON.stringify(data, null, 2));
  }

  /**
   * 强制删除会话文件夹（含 session.json、inbox.json、日志等）。
   * sm.delete 依赖 files.trash，可能在记录删除后仍留下文件夹残留；此处用 remove 永久删除兜底。
   * remove 偶发未生效时重试一次；文件夹已不存在时静默返回。
   */
  private async removeSessionFolder(sessionId: string): Promise<void> {
    const target = `${this.sessionsRel}/${sessionId}`;
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        await this.fa.remove(target);
      } catch (error) {
        console.warn(`[workspace-management] 清理会话文件夹失败: ${sessionId}`, error);
      }
      if (!await this.sessionFolderExists(target)) return;
    }
  }

  /** 会话文件夹是否存在。用 list 判定：fa.stat 对已删除文件夹会假阳性。 */
  private async sessionFolderExists(target: string): Promise<boolean> {
    try {
      await this.fa.list(target);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * 补发 session.removed，确保会话列表立即刷新。
   * 会话列表仅在该事件（经 eventBus 单 type 订阅）触发时重新读取并移除行；
   * 若应用自身未发布（如删除前抛错），不发此事件则列表要等重启才消失。
   * 会话仍存在时发布无害：列表重读会保留该行。
   */
  private async publishSessionRemoved(sessionId: string): Promise<void> {
    try {
      await this.eventBus?.publish({ type: 'session.removed', sessionId });
    } catch (error) {
      console.warn('[workspace-management] 补发 session.removed 失败', error);
    }
  }

  // ===== 拖拽改归属 =====

  private wireDragDrop(): void {
    // 会话行可拖拽（工作区分支行 data-session-id 以 workspace: 开头，跳过）。
    const sessionItems = document.querySelectorAll<HTMLElement>(
      '[data-slot="session-list-virtual-item"][data-session-id]:not([data-session-id^="workspace:"])',
    );
    for (const item of sessionItems) {
      const row = item.querySelector<HTMLElement>('.xdb--SessionListRow') ?? item;
      if (row.getAttribute('draggable') === 'true') continue;
      row.setAttribute('draggable', 'true');
      // 从 currentTarget 读取当前会话 ID，避免虚拟列表复用节点后闭包读到过期 ID。
      row.addEventListener('dragstart', (event) => this.onDragStart(event));
      row.addEventListener('dragend', () => this.onDragEnd());
    }
    // 工作区分支作为放置目标。
    const branches = document.querySelectorAll<HTMLElement>('.xdb--SessionWorkspaceBranch');
    for (const branch of branches) {
      if (branch.dataset.dropWired === '1') continue;
      branch.dataset.dropWired = '1';
      branch.addEventListener('dragover', (event) => this.onDragOver(event));
      branch.addEventListener('dragleave', () => this.onDragLeave());
      branch.addEventListener('drop', (event) => void this.onDrop(event));
    }
  }

  private onDragStart(event: DragEvent): void {
    const row = event.currentTarget as HTMLElement | null;
    const sessionId = row?.closest<HTMLElement>('[data-session-id]')?.getAttribute('data-session-id') ?? '';
    if (!sessionId) {
      event.preventDefault();
      return;
    }
    this.draggedSessionId = sessionId;
    if (event.dataTransfer) {
      event.dataTransfer.setData('text/plain', sessionId);
      event.dataTransfer.effectAllowed = 'move';
    }
  }

  private onDragEnd(): void {
    this.draggedSessionId = null;
    document.querySelectorAll('.xdb--WSDropTarget').forEach((el) => el.classList.remove('xdb--WSDropTarget'));
  }

  private onDragOver(event: DragEvent): void {
    if (!event.dataTransfer || !this.draggedSessionId) return;
    event.preventDefault();
    event.dataTransfer.dropEffect = 'move';
    (event.currentTarget as HTMLElement).classList.add('xdb--WSDropTarget');
  }

  private onDragLeave(): void {
    document.querySelectorAll('.xdb--WSDropTarget').forEach((el) => el.classList.remove('xdb--WSDropTarget'));
  }

  private async onDrop(event: DragEvent): Promise<void> {
    const branch = event.currentTarget as HTMLElement;
    branch.classList.remove('xdb--WSDropTarget');
    event.preventDefault();
    const sessionId =
      this.draggedSessionId ?? event.dataTransfer?.getData('text/plain') ?? '';
    const target = branch.closest<HTMLElement>('[data-session-id]');
    const targetKey = target?.getAttribute('data-session-id') ?? '';
    if (!sessionId || !targetKey.startsWith('workspace:')) return;
    const workspaceId = targetKey.slice('workspace:'.length);
    try {
      await this.setSessionWorkspace(sessionId, workspaceId);
    } catch (error) {
      console.error('[workspace-management] 移动会话失败', error);
      window.alert(`移动会话失败：${error instanceof Error ? error.message : String(error)}`);
    } finally {
      this.draggedSessionId = null;
    }
  }

  // ===== 观察器过滤 =====

  private isRelevant(records: MutationRecord[]): boolean {
    return records.some((record) => {
      const target = record.target;
      if (target instanceof Element && target.closest('.xdb--SessionListContainer')) return true;
      for (const node of record.addedNodes) {
        if (!(node instanceof Element)) continue;
        if (
          node.matches('.xdb--SessionWorkspaceBranch, .xdb--SessionListRow') ||
          node.querySelector('.xdb--SessionWorkspaceBranch, .xdb--SessionListRow') ||
          node.closest('.xdb--SessionListContainer')
        ) {
          return true;
        }
      }
      return false;
    });
  }
}
