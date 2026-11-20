import { Plugin } from '@obsidian-components/ai-api';
import type {
  EventBusApi,
  ModelProviderManager,
  SessionManager,
  TranscriptFactory,
} from '@obsidian-components/ai-api';
import { loadSettings, type PluginSettings } from './settings';
import { SettingsView, type SettingsHost } from './settingsView';
import { TitleService } from './titleService';

export default class LiveSessionTitlePlugin extends Plugin {
  static inject = [
    'eventBus',
    'sessionManager',
    'modelProviderManager',
    'transcriptFactory',
  ] as const;

  private settings: PluginSettings = loadSettings(undefined);
  private titleService?: TitleService;

  async onResolving(): Promise<void> {
    this.settings = loadSettings(await this.api.readData());

    this.titleService = new TitleService(
      {
        eventBus: this.dependencies['eventBus'] as EventBusApi,
        sessionManager: this.dependencies['sessionManager'] as SessionManager,
        modelProviderManager: this.dependencies['modelProviderManager'] as ModelProviderManager,
        transcriptFactory: this.dependencies['transcriptFactory'] as TranscriptFactory,
      },
      () => this.settings,
      this.api.signal,
    );
    this.titleService.start();

    const host: SettingsHost = {
      getSettings: () => this.settings,
      saveSettings: async (next) => {
        this.settings = next;
        await this.api.writeData(next);
      },
      listModelChoices: () =>
        (this.dependencies['modelProviderManager'] as ModelProviderManager).listChoices(),
    };
    let view: SettingsView | undefined;
    this.api.setSettingsView(
      class {
        mount(container: HTMLElement): void {
          view = new SettingsView(host);
          view.mount(container);
        }
        unmount(): void {
          view?.unmount();
          view = undefined;
        }
      },
    );
  }

  async onDisposing(): Promise<void> {
    this.titleService?.dispose();
    this.titleService = undefined;
  }
}