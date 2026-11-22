export type LoadingPreset =
  | 'default'
  | 'spinner'
  | 'braille'
  | 'star'
  | 'hidden'
  /** assets/anims/ 内置动画素材（运行时发现，存在性由应用时校验） */
  | `anim:${string}`;

/** 动画素材显示尺寸档位（对应 --ai-turn-anim-size） */
export type AnimSize = 'sm' | 'md' | 'lg';

export const ANIM_SIZE_EM: Record<AnimSize, string> = {
  sm: '1.8em',
  md: '2.3em',
  lg: '2.8em',
};

export interface PluginSettings {
  /** 加载动画预设；default = 不覆盖应用原生样式 */
  preset: LoadingPreset;
  /** 替换「正在处理…」的文字；空 = 保持原文 */
  text: string;
  /** 动画素材显示尺寸；仅影响 assets/anims 素材 */
  size: AnimSize;
}

export const DEFAULT_SETTINGS: PluginSettings = { preset: 'default', text: '', size: 'md' };

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
  const size = source.size === 'sm' || source.size === 'lg' ? source.size : 'md';
  return {
    preset,
    size,
    text: typeof source.text === 'string' ? source.text.slice(0, 40) : '',
  };
}