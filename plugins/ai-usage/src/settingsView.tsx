import { useEffect, useState } from 'react';
import type { AiApp, PluginManifest } from '@obsidian-components/ai-api';
import { SettingsSection, SettingSelect, SettingText, type SettingsStore } from 'ai-plugin-kit';
import { isEnabled, type PluginSettings } from './settings';
import type { UsageTarget } from './providers';

export interface AiUsageViewProps {
  store: SettingsStore<PluginSettings>;
  app: AiApp;
  manifest: PluginManifest;
  getTargets: () => readonly UsageTarget[];
}

export function AiUsageSettingsView(props: AiUsageViewProps) {
  const { store, manifest, getTargets } = props;
  const [settings, setSettings] = useState<PluginSettings>(() => store.getSettings());
  const [targets, setTargets] = useState<readonly UsageTarget[]>(() => getTargets());
  const apply = (patch: Partial<PluginSettings>): void => {
    void store.update(patch).then(setSettings);
  };

  useEffect(() => {
    const timer = setInterval(() => setTargets(getTargets()), 5000);
    return () => clearInterval(timer);
  }, [getTargets]);

  const setEnabled = (key: string, enabled: boolean): void => {
    apply({
      disabled: enabled
        ? settings.disabled.filter((entry) => entry !== key)
        : [...settings.disabled, key],
    });
  };

  return (
    <>
      <SettingsSection header={`AI 用量监控 · v${manifest.version ?? '0.0.0'}`}>
        <SettingSelect
          label="显示方式"
          description="正向显示已用量百分比；逆向显示剩余量百分比（余额类数据始终显示余额）"
          value={settings.displayMode}
          onChange={(event) => apply({ displayMode: event.currentTarget.value === 'remaining' ? 'remaining' : 'used' })}
        >
          <option value="used">正向（显示已用）</option>
          <option value="remaining">逆向（显示剩余）</option>
        </SettingSelect>
        <SettingSelect
          label="底部显示位置"
          description="状态项在 Composer 底部的停靠位置：左侧在 Agent 选择器之前，右侧在官方用量项之后"
          value={settings.footerPosition}
          onChange={(event) =>
            apply({
              footerPosition:
                event.currentTarget.value === 'left'
                  ? 'left'
                  : event.currentTarget.value === 'right'
                    ? 'right'
                    : 'center',
            })
          }
        >
          <option value="left">左侧</option>
          <option value="center">中间（默认）</option>
          <option value="right">右侧</option>
        </SettingSelect>        <SettingText
          label="轮询间隔（分钟）"
          description="自动刷新用量的时间间隔（1-60）"
          type="number"
          min={1}
          max={60}
          value={settings.pollMinutes}
          onBlur={(event) => apply({ pollMinutes: Number(event.currentTarget.value) })}
        />
        <SettingText
          label="codex CLI 命令路径"
          description="留空使用 PATH 中的 codex；安装并登录 codex CLI 后才会出现 Codex 开关"
          placeholder="codex"
          value={settings.codexCommandPath}
          onBlur={(event) => apply({ codexCommandPath: event.currentTarget.value.trim() })}
        />
      </SettingsSection>

      <SettingsSection header="用量查询开关（按已配置来源）">
        {targets.map((target) => (
          <SettingSelect
            key={target.key}
            label={`${target.title}${target.key !== target.title ? ` · ${target.key}` : ''}`}
            description={target.subtitle}
            value={isEnabled(settings, target.key) ? '1' : '0'}
            onChange={(event) => setEnabled(target.key, event.currentTarget.value === '1')}
          >
            <option value="1">开启查询</option>
            <option value="0">关闭查询</option>
          </SettingSelect>
        ))}
        {targets.length === 0 ? (
          <SettingSelect label="暂无可用来源" disabled value="" onChange={() => undefined}>
            <option value="">未检测到支持用量查询的连接</option>
          </SettingSelect>
        ) : null}
      </SettingsSection>

      <SettingsSection header="说明">
        <SettingSelect label="支持的用量来源" disabled value="" onChange={() => undefined}>
          <option value="">GLM（open.bigmodel.cn / api.z.ai）· DeepSeek（api.deepseek.com）· Codex CLI</option>
        </SettingSelect>
        <SettingText
          label="凭据来源"
          description="复用应用中已配置模型连接的 API Key；第三方代理连接不支持用量查询"
          disabled
          value=""
          onChange={() => undefined}
        />
      </SettingsSection>
    </>
  );
}