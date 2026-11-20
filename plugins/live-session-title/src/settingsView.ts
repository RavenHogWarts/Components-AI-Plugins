import type { ModelChoice } from '@obsidian-components/ai-api';
import { loadSettings, type PluginSettings } from './settings';

export interface SettingsHost {
  getSettings(): PluginSettings;
  saveSettings(next: PluginSettings): Promise<void>;
  listModelChoices(): readonly ModelChoice[];
}

const STYLES = {
  root: 'display:flex;flex-direction:column;gap:16px;max-width:560px;font-size:14px;',
  row: 'display:flex;flex-direction:column;gap:6px;',
  label: 'font-weight:600;',
  hint: 'font-size:12px;opacity:0.75;',
  input:
    'width:100%;box-sizing:border-box;padding:6px 8px;border-radius:6px;border:1px solid var(--background-modifier-border, #ccc);background:var(--background-primary, #fff);color:inherit;font:inherit;',
  textarea:
    'width:100%;box-sizing:border-box;min-height:72px;padding:6px 8px;border-radius:6px;border:1px solid var(--background-modifier-border, #ccc);background:var(--background-primary, #fff);color:inherit;font:inherit;resize:vertical;',
  checkRow: 'display:flex;align-items:center;gap:8px;',
  button:
    'align-self:flex-start;padding:6px 18px;border-radius:6px;border:none;background:var(--interactive-accent, #7c5cff);color:var(--text-on-accent, #fff);cursor:pointer;font:inherit;',
  status: 'font-size:12px;opacity:0;',
};

export class SettingsView {
  private cleanup: Array<() => void> = [];
  private root?: HTMLElement;

  constructor(private readonly host: SettingsHost) {}

  mount(container: HTMLElement): void {
    const doc = container.ownerDocument;
    const settings = this.host.getSettings();
    const root = doc.createElement('div');
    root.setAttribute('style', STYLES.root);

    const listen = (el: HTMLElement, type: string, fn: () => void): void => {
      el.addEventListener(type, fn);
      this.cleanup.push(() => el.removeEventListener(type, fn));
    };
    const row = (label: string, control: HTMLElement, hint?: string): HTMLElement => {
      const wrap = doc.createElement('div');
      wrap.setAttribute('style', STYLES.row);
      const lab = doc.createElement('span');
      lab.setAttribute('style', STYLES.label);
      lab.textContent = label;
      wrap.append(lab, control);
      if (hint) {
        const h = doc.createElement('div');
        h.setAttribute('style', STYLES.hint);
        h.textContent = hint;
        wrap.append(h);
      }
      root.append(wrap);
      return control;
    };

    // 启用开关
    const check = doc.createElement('input');
    check.type = 'checkbox';
    check.checked = settings.enabled;
    const checkWrap = doc.createElement('div');
    checkWrap.setAttribute('style', STYLES.checkRow);
    checkWrap.append(check);
    const checkLabel = doc.createElement('span');
    checkLabel.textContent = '启用：根据对话最新内容持续更新会话标题';
    checkWrap.append(checkLabel);
    root.append(checkWrap);

    // 标题模型
    const modelSelect = doc.createElement('select');
    modelSelect.setAttribute('style', STYLES.input);
    const follow = doc.createElement('option');
    follow.value = '';
    follow.textContent = '跟随会话模型（默认）';
    modelSelect.append(follow);
    const current = settings.model ? JSON.stringify(settings.model) : '';
    for (const choice of this.host.listModelChoices()) {
      const option = doc.createElement('option');
      option.value = JSON.stringify(choice.ref);
      option.textContent = choice.label;
      if (current === option.value) option.selected = true;
      modelSelect.append(option);
    }
    row('标题生成模型', modelSelect, '生成标题时使用的模型；默认跟随每个会话自己的模型');

    // 提示词
    const prompt = doc.createElement('textarea');
    prompt.setAttribute('style', STYLES.textarea);
    prompt.value = settings.prompt;
    row('标题生成提示词', prompt, '可用 {maxLength} 占位符，插入标题最大长度');

    // 数字项
    const numberInput = (value: number, min: number, max: number): HTMLInputElement => {
      const input = doc.createElement('input');
      input.setAttribute('style', STYLES.input);
      input.type = 'number';
      input.min = String(min);
      input.max = String(max);
      input.value = String(value);
      return input;
    };
    const maxLength = numberInput(settings.maxLength, 4, 120);
    row('标题最大长度（字）', maxLength);
    const debounceMs = numberInput(settings.debounceMs, 0, 600000);
    row('防抖时间（毫秒）', debounceMs, '对话更新后等待多久再生成标题，避免频繁调用模型');
    const historyMessages = numberInput(settings.historyMessages, 1, 60);
    row('参考消息条数', historyMessages, '送入模型的最近用户/助手消息数量');

    // 排除规则
    const textarea = (lines: readonly string[]): HTMLTextAreaElement => {
      const el = doc.createElement('textarea');
      el.setAttribute('style', STYLES.textarea);
      el.value = lines.join('\n');
      return el;
    };
    const exIds = textarea(settings.exclusions.sessionIds);
    row('排除会话 ID', exIds, '每行一个；完整会话 ID');
    const exTitles = textarea(settings.exclusions.titlePatterns);
    row('排除标题（正则）', exTitles, '每行一个；当前标题匹配则不更新（非法正则按子串处理）');
    const exAgents = textarea(settings.exclusions.agents);
    row('排除 Agent', exAgents, '每行一个；Agent 名称或标识的子串（不区分大小写）');

    // 保存
    const save = doc.createElement('button');
    save.setAttribute('style', STYLES.button);
    save.textContent = '保存设置';
    const status = doc.createElement('span');
    status.setAttribute('style', STYLES.status);
    listen(save, 'click', () => {
      void (async () => {
        const lines = (el: HTMLTextAreaElement): string[] =>
          el.value
            .split(/\r?\n/)
            .map((line) => line.trim())
            .filter((line) => line.length > 0);
        const modelValue = modelSelect.value;
        const next = loadSettings({
          enabled: check.checked,
          model: modelValue ? JSON.parse(modelValue) : undefined,
          prompt: prompt.value,
          maxLength: maxLength.value,
          debounceMs: debounceMs.value,
          historyMessages: historyMessages.value,
          exclusions: {
            sessionIds: lines(exIds),
            titlePatterns: lines(exTitles),
            agents: lines(exAgents),
          },
        });
        try {
          await this.host.saveSettings(next);
          status.textContent = '已保存，立即生效';
          status.style.opacity = '1';
        } catch (error) {
          status.textContent = '保存失败：' + String(error);
          status.style.opacity = '1';
        }
      })();
    });
    root.append(save, status);

    container.append(root);
    this.root = root;
  }

  unmount(): void {
    for (const fn of this.cleanup) fn();
    this.cleanup = [];
    this.root?.remove();
    this.root = undefined;
  }
}