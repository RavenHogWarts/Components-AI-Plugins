import { useState } from 'react';
import type { AiApp, PluginManifest } from '@obsidian-components/ai-api';
import type { SettingsStore } from 'ai-plugin-kit';
import { Button, SettingItem, SettingSelect, SettingText, SettingsSection } from 'ai-plugin-kit';
import { DEFAULT_SETTINGS, type PluginSettings } from './settings';

export interface AgentsMdViewProps {
  store: SettingsStore<PluginSettings>;
  app: AiApp;
  manifest: PluginManifest;
}

export function AgentsMdSettingsView(props: AgentsMdViewProps) {
  const { store, manifest } = props;
  const [settings, setSettings] = useState<PluginSettings>(() => store.getSettings());
  const apply = (patch: Partial<PluginSettings>): void => {
    void store.update(patch).then(setSettings);
  };

  return (
    <SettingsSection header={`AGENTS.md 项目指南 · v${manifest.version ?? '0.0.0'}`}>
      <SettingSelect
        label="启用状态"
        description="开启后，在系统指令中追加仓库根目录的项目工作指南，Agent 执行任务前即可遵循"
        value={settings.enabled ? '1' : '0'}
        onChange={(event) => apply({ enabled: event.currentTarget.value === '1' })}
      >
        <option value="1">开启</option>
        <option value="0">关闭</option>
      </SettingSelect>
      <SettingText
        label="指南文件名"
        description="位于仓库根目录的工作指南文件名（例如 AGENTS.md 或 CLAUDE.md）"
        value={settings.filename}
        onBlur={(event) => apply({ filename: event.currentTarget.value })}
      />
      <SettingText
        label="最大注入行数"
        description="只把指南前 N 行追加到系统指令；更多内容由 read_file 工具按需读取"
        type="number"
        min={10}
        max={5000}
        value={settings.maxLines}
        onBlur={(event) => apply({ maxLines: Number(event.currentTarget.value) })}
      />
      <SettingItem>
        <SettingItem.Label>恢复默认</SettingItem.Label>
        <SettingItem.Control>
          <Button size="sm" variant="outline" onClick={() => apply({ ...DEFAULT_SETTINGS })}>
            恢复默认设置
          </Button>
        </SettingItem.Control>
      </SettingItem>
    </SettingsSection>
  );
}
