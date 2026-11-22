export type LoadingPreset =
  | 'default'
  | 'spinner'
  | 'braille'
  | 'star'
  | 'hidden'
  /** assets/anims/ 内置动画素材（运行时发现，存在性由应用时校验） */
  | `anim:${string}`;

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
  const value = source.preset;
  const preset =
    PRESETS.includes(value as LoadingPreset) || (typeof value === 'string' && /^anim:[\w-]+$/.test(value))
      ? (value as LoadingPreset)
      : 'default';
  return {
    preset,
    text: typeof source.text === 'string' ? source.text.slice(0, 40) : '',
  };
}