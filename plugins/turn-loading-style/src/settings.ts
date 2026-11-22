export type LoadingPreset =
  | 'default'
  | 'spinner'
  | 'braille'
  | 'star'
  | 'hidden';

export interface PluginSettings {
  /** 加载动画预设；default = 不覆盖应用原生样式 */
  preset: LoadingPreset;
  /** 替换「正在处理…」的文字；空 = 保持原文 */
  text: string;
}

export const DEFAULT_SETTINGS: PluginSettings = { preset: 'default', text: '' };

const PRESETS: readonly LoadingPreset[] = [
  'default',
  'spinner',
  'braille',
  'star',
  'hidden',
];

export function loadSettings(raw: unknown): PluginSettings {
  const source = raw != null && typeof raw === 'object' ? (raw as Record<string, unknown>) : {};
  const preset = PRESETS.includes(source.preset as LoadingPreset)
    ? (source.preset as LoadingPreset)
    : 'default';
  return {
    preset,
    text: typeof source.text === 'string' ? source.text.slice(0, 40) : '',
  };
}