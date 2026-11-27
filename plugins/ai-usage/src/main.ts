import { Plugin } from '@obsidian-components/ai-api';
import type { AiApp, ModelProviderManager, PluginManifest } from '@obsidian-components/ai-api';
import { createElement } from 'react';
import { createReactView, mountSettingsView, PollingStore, SettingsStore } from 'ai-plugin-kit';
import {
  canSpawnProcesses,
  fetchCodexReading,
  fetchCopilotReading,
  fetchDeepseekReading,
  fetchGlmReading,
  probeCodex,
  type Reading,
} from './fetchers';
import { classifyConnections, codexTarget, COPILOT_TOKEN_SECRET, type UsageTarget } from './providers';
import { isEnabled, loadSettings, type FooterPosition, type PluginSettings } from './settings';
import { AiUsageSettingsView } from './settingsView';
import type { ProviderStatus } from './store';
import { UsageStatusView } from './statusView';

interface ComposerFooterItem {
  id: string;
  order?: number;
  renderer: unknown;
}

interface ComposerFooterService {
  registerFooterItem(item: ComposerFooterItem): void;
  unregisterFooterItem(id: string): void;
}

const STATUS_ITEM_ID = 'ai-usage';

function footerOrderOf(position: FooterPosition): number {
  return position === 'left' ? -2000 : position === 'right' ? 2000 : 10;
}

function failureMessage(error: unknown, target: UsageTarget): string {
  const status = (error as { status?: number } | null)?.status;
  const hint =
    target.kind === 'glm'
      ? '请检查该连接的 GLM API Key'
      : target.kind === 'deepseek'
        ? '请检查该连接的 DeepSeek API Key'
        : target.kind === 'copilot'
          ? '请先在 GitHub Copilot 插件中完成授权'
          : '请先安装并运行 codex login';
  if (status === 401 || status === 403) return `认证失败（HTTP ${status}）：${hint}`;
  return error instanceof Error ? error.message : String(error);
}

export default class AiUsagePlugin extends Plugin {
  static inject = ['modelProviderManager'] as const;

  private settingsStore?: SettingsStore<PluginSettings>;
  private usageStore?: PollingStore<readonly ProviderStatus[]>;
  private readonly resources: Array<() => void> = [];
  private codexProbes = new Map<string, Promise<boolean>>();

  async onResolving(): Promise<void> {
    const { api } = this;
    const app = api.app;
    const modelProviderManager = this.dependencies['modelProviderManager'] as ModelProviderManager;

    // Copilot 用量凭据由 copilot 插件写入 Obsidian secretStorage（可选服务）
    const obsidianApp = api.getService('obsidianApp') as
      | { secretStorage?: { getSecret?(key: string): string | null } }
      | undefined;
    const readCopilotToken = (): string => {
      const token = obsidianApp?.secretStorage?.getSecret?.(COPILOT_TOKEN_SECRET);
      return typeof token === 'string' && token.trim() ? token.trim() : '';
    };
    const requireCopilotToken = (): string => {
      const token = readCopilotToken();
      if (!token) throw new Error('请先在 GitHub Copilot 插件中完成授权');
      return token;
    };

    this.settingsStore = new SettingsStore(api, loadSettings(await api.readData()), loadSettings);
    const settingsStore = this.settingsStore;

    const probe = (command: string): Promise<boolean> => {
      const key = command.length > 0 ? command : 'codex';
      let cached = this.codexProbes.get(key);
      if (!cached) {
        cached = probeCodex(key).catch(() => false);
        this.codexProbes.set(key, cached);
      }
      return cached;
    };

    const getTargets = (): UsageTarget[] => {
      const settings = settingsStore.getSettings();
      const list = classifyConnections(modelProviderManager.listConnections());
      const wantsCodex = canSpawnProcesses();
      return wantsCodex
        ? [...list, codexTarget(settings.codexCommandPath)]
        : list;
    };
    // 按目标分发到对应读取实现（保持行为一致，仅提取以便阅读）
    const readTarget = async (target: UsageTarget, codexCommandPath: string): Promise<Reading> => {
      if (target.kind === 'glm') return fetchGlmReading(app.httpClient, target);
      if (target.kind === 'deepseek') return fetchDeepseekReading(app.httpClient, target);
      if (target.kind === 'copilot') return fetchCopilotReading(app.httpClient, requireCopilotToken());
      return fetchCodexReading(codexCommandPath);
    };
    // Codex 可用性放在 read() 内探测（结果按命令缓存）：避免每次列出目标都 spawn 一次探测进程
    const read = async (): Promise<readonly ProviderStatus[]> => {
      const settings = settingsStore.getSettings();
      const codexReady = await probe(settings.codexCommandPath);
      const targets = getTargets()
        .filter((target) => target.kind !== 'codex' || codexReady)
        .filter((target) => isEnabled(settings, target.key));
      return Promise.all(
        targets.map(async (target): Promise<ProviderStatus> => {
          const base = { key: target.key, title: target.title, subtitle: target.subtitle, kind: target.kind };
          try {
            const reading = await readTarget(target, settings.codexCommandPath);
            return { ...base, result: { type: 'ok', reading } };
          } catch (error) {
            return { ...base, result: { type: 'error', message: failureMessage(error, target) } };
          }
        }),
      );
    };

    this.usageStore = new PollingStore<readonly ProviderStatus[]>(
      read,
      () => settingsStore.getSettings().pollMinutes * 60_000,
      api.signal,
      [],
    );
    const usageStore = this.usageStore;
    usageStore.start();

    // Composer 底部状态项（可选服务；停靠位置由设置决定，变更时重注册）
    const footer = api.getService('composerViewService') as ComposerFooterService | undefined;
    const registerFooter = (position: FooterPosition): void => {
      if (!footer) return;
      footer.unregisterFooterItem(STATUS_ITEM_ID);
      const renderer = createReactView(() =>
        createElement(UsageStatusView, {
          store: usageStore,
          settingsStore,
          onManualRefresh: () => {
            void usageStore.refresh();
          },
        }),
      );
      const item: ComposerFooterItem = { id: STATUS_ITEM_ID, order: footerOrderOf(position), renderer };
      footer.registerFooterItem(item);
    };
    if (footer) {
      registerFooter(settingsStore.getSettings().footerPosition);
      this.resources.push(() => footer.unregisterFooterItem(STATUS_ITEM_ID));
    }

    // 设置变化：通知界面重渲染；开关/命令路径变化立即重查，位置变化重注册
    let lastReaction = { disabled: '', codexCommandPath: '', footerPosition: '' };
    const syncReaction = (): void => {
      const settings = settingsStore.getSettings();
      usageStore.notify();
      const next = {
        disabled: [...settings.disabled].sort().join(','),
        codexCommandPath: settings.codexCommandPath,
        footerPosition: settings.footerPosition,
      };
      if (next.disabled !== lastReaction.disabled || next.codexCommandPath !== lastReaction.codexCommandPath) {
        void usageStore.refresh();
      }
      if (next.footerPosition !== lastReaction.footerPosition) {
        registerFooter(settings.footerPosition);
      }
      lastReaction = next;
    };
    syncReaction();
    settingsStore.subscribe(syncReaction);

    const getTargetsRef = (): readonly UsageTarget[] => getTargets();
    // markdownRenderer 可选：设置说明块用它渲染 MD/HTML，缺失时说明块回退纯文本
    const markdownRenderer = api.getService('markdownRenderer') as
      | { render(content: string, container: HTMLElement, signal: AbortSignal): Promise<void> }
      | undefined;
    const renderMarkdown = markdownRenderer
      ? (content: string, container: HTMLElement, signal: AbortSignal): Promise<void> =>
          markdownRenderer.render(content, container, signal)
      : undefined;
    const Form = createReactView((input: {
      store: SettingsStore<PluginSettings>;
      app: AiApp;
      manifest: PluginManifest;
      getTargets: () => readonly UsageTarget[];
      renderMarkdown?: (content: string, container: HTMLElement, signal: AbortSignal) => Promise<void>;
    }) => createElement(AiUsageSettingsView, input));
    mountSettingsView(api, Form, () => ({
      app,
      manifest: api.manifest,
      store: settingsStore,
      getTargets: getTargetsRef,
      renderMarkdown,
    }));
  }

  async onDisposing(): Promise<void> {
    this.usageStore?.stop();
    this.usageStore = undefined;
    for (const release of this.resources.splice(0).reverse()) release();
  }
}