import { useEffect, useState } from 'react';
import type { AiApp, PluginManifest } from '@obsidian-components/ai-api';
import { SettingsSection, SettingSelect, SettingText, type SettingsStore } from 'ai-plugin-kit';
import type { AnimEntry } from './anims';
import type { PluginSettings } from './settings';

export interface TurnLoadingViewProps {
  store: SettingsStore<PluginSettings>;
  app: AiApp;
  manifest: PluginManifest;
  getAnims: () => readonly AnimEntry[];
}

const BASIC_OPTIONS: ReadonlyArray<{ value: string; label: string }> = [
  { value: 'default', label: '应用默认（波浪条）' },
  { value: 'spinner', label: '旋转圆环' },
  { value: 'braille', label: '盲文旋转 ⠋' },
  { value: 'star', label: '星形旋转 ✦' },
  { value: 'hidden', label: '隐藏图标（仅文字）' },
];

const KIND_LABEL: Record<AnimEntry['kind'], string> = {
  lottie: 'Lottie',
  svg: 'SVG',
  img: '图片',
};

export function TurnLoadingSettingsView(props: TurnLoadingViewProps) {
  const { store, manifest, getAnims } = props;
  const [settings, setSettings] = useState<PluginSettings>(() => store.getSettings());
  const [anims, setAnims] = useState<readonly AnimEntry[]>(() => getAnims());
  const apply = (patch: Partial<PluginSettings>): void => {
    void store.update(patch).then(setSettings);
  };

  useEffect(() => {
    const timer = setInterval(() => setAnims(getAnims()), 4000);
    return () => clearInterval(timer);
  }, [getAnims]);

  const validValues = [...BASIC_OPTIONS.map((option) => option.value), ...anims.map((anim) => anim.id)];

  return (
    <SettingsSection header={`加载指示器 · v${manifest.version ?? '0.0.0'}`}>
      <SettingSelect
        label="加载动画"
        description="对话处理中「正在处理…」前的图标样式；保存后立即生效"
        value={settings.preset}
        onChange={(event) => {
          const value = event.currentTarget.value;
          if (validValues.includes(value)) apply({ preset: value as PluginSettings['preset'] });
        }}
      >
        {BASIC_OPTIONS.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
        {anims.length > 0 ? (
          <optgroup label="动画素材（assets/anims）">
            {anims.map((anim) => (
              <option key={anim.id} value={anim.id}>
                {KIND_LABEL[anim.kind]} · {anim.label}
              </option>
            ))}
          </optgroup>
        ) : null}
      </SettingSelect>
      <SettingText
        label="提示文字"
        description="替换「正在处理…」；留空保持原文"
        placeholder="正在处理…"
        value={settings.text}
        onBlur={(event) => apply({ text: event.currentTarget.value })}
      />
    </SettingsSection>
  );
}