import { useState } from 'react';
import type { AiApp, PluginManifest } from '@obsidian-components/ai-api';
import type { SettingsStore } from 'ai-plugin-kit';
import { Button, SettingItem, SettingSelect, SettingText, SettingsSection } from 'ai-plugin-kit';
import { DEFAULT_SETTINGS, type PluginSettings } from './settings';

export interface SessionDirectoryViewProps {
  store: SettingsStore<PluginSettings>;
  app: AiApp;
  manifest: PluginManifest;
}

export function SessionDirectorySettingsView(props: SessionDirectoryViewProps) {
  const { store, manifest } = props;
  const [settings, setSettings] = useState<PluginSettings>(() => store.getSettings());
  const apply = (patch: Partial<PluginSettings>): void => {
    void store.update(patch).then(setSettings);
  };

  return (
    <SettingsSection header={`会话目录快速跳转 · v${manifest.version ?? '0.0.0'}`}>
      <SettingSelect
        label="启用状态"
        description="关闭后隐藏对话窗口侧边的会话目录条"
        value={settings.enabled ? '1' : '0'}
        onChange={(event) => apply({ enabled: event.currentTarget.value === '1' })}
      >
        <option value="1">开启</option>
        <option value="0">关闭</option>
      </SettingSelect>
      <SettingSelect
        label="目录条位置"
        description="会话目录条固定在对话窗口的哪一侧"
        value={settings.side}
        onChange={(event) => apply({ side: event.currentTarget.value === 'left' ? 'left' : 'right' })}
      >
        <option value="left">左侧</option>
        <option value="right">右侧</option>
      </SettingSelect>
      <SettingText
        label="预览行数"
        description="每条目录项显示的用户输入内容行数"
        type="number"
        min={1}
        max={10}
        value={settings.previewLines}
        onBlur={(event) => apply({ previewLines: Number(event.currentTarget.value) })}
      />
      <SettingText
        label="回复预览行数"
        description="悬浮卡中显示的各轮次助手回复内容行数"
        type="number"
        min={1}
        max={10}
        value={settings.replyLines}
        onBlur={(event) => apply({ replyLines: Number(event.currentTarget.value) })}
      />
      <SettingItem>
        <SettingItem.Label>恢复默认</SettingItem.Label>
        <SettingItem.Control>
          <Button
            size="sm"
            variant="outline"
            onClick={() => apply({ ...DEFAULT_SETTINGS })}
          >
            恢复默认设置
          </Button>
        </SettingItem.Control>
      </SettingItem>
    </SettingsSection>
  );
}
