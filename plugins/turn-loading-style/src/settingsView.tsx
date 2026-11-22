import { useState } from 'react';
import type { AiApp, PluginManifest } from '@obsidian-components/ai-api';
import { SettingsSection, SettingSelect, SettingText, type SettingsStore } from 'ai-plugin-kit';
import type { LoadingPreset, PluginSettings } from './settings';

export interface TurnLoadingViewProps {
  store: SettingsStore<PluginSettings>;
  app: AiApp;
  manifest: PluginManifest;
}

const PRESET_OPTIONS: ReadonlyArray<{ value: LoadingPreset; label: string }> = [
  { value: 'default', label: '应用默认（波浪条）' },
  { value: 'spinner', label: '旋转圆环' },
  { value: 'braille', label: '盲文旋转 ⠋' },
  { value: 'star', label: '星形旋转 ✦' },
  { value: 'hidden', label: '隐藏图标（仅文字）' },
];

export function TurnLoadingSettingsView(props: TurnLoadingViewProps) {
  const { store, manifest } = props;
  const [settings, setSettings] = useState<PluginSettings>(() => store.getSettings());
  const apply = (patch: Partial<PluginSettings>): void => {
    void store.update(patch).then(setSettings);
  };

  return (
    <SettingsSection header={`加载指示器 · v${manifest.version ?? '0.0.0'}`}>
      <SettingSelect
        label="加载动画"
        description="对话处理中「正在处理…」前的图标样式；保存后立即生效"
        value={settings.preset}
        onChange={(event) => {
          const next = PRESET_OPTIONS.find((option) => option.value === event.currentTarget.value);
          apply({ preset: next ? next.value : 'default' });
        }}
      >
        {PRESET_OPTIONS.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
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