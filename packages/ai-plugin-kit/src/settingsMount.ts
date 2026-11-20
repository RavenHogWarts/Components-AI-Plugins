import type { PluginContext } from '@obsidian-components/ai-api';
import type { SettingsSize } from './settingsKit';

type ReactForm<Input extends Record<string, unknown>> = new () => {
  mount(container: HTMLElement, props: { size: SettingsSize; input: Input }): void;
  unmount(): void;
};

/**
 * 标准设置视图挂载（官方模式）：
 * 读取容器 data-size 密度映射为 xs/sm/md/lg，把 getInput() 作为视图输入。
 */
export function mountSettingsView<Input extends Record<string, unknown>>(
  api: PluginContext,
  form: ReactForm<Input>,
  getInput: () => Input,
): void {
  api.setSettingsView(
    class {
      private readonly view = new form();
      mount(container: HTMLElement): void {
        const density = container.dataset.size;
        const size: SettingsSize = density === 'xs' || density === 'sm' || density === 'lg' ? density : 'md';
        this.view.mount(container, { size, input: getInput() });
      }
      unmount(): void {
        this.view.unmount();
      }
    },
  );
}