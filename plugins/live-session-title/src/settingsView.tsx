import { useEffect, useMemo, useState } from 'react';
import type { AiApp, ModelRef, PluginManifest, SessionData } from '@obsidian-components/ai-api';
import { DEFAULT_PROMPT, type PluginSettings } from './settings';
import type { SettingsStore } from './settingsStore';
import { Button, SettingsSection, SettingItem, SettingSelect, SettingText, SettingTextarea } from './settingsKit';

export interface LiveSessionTitleViewProps {
  store: SettingsStore;
  app: AiApp;
  manifest: PluginManifest;
}

function agentLabelOf(data: SessionData): string {
  const agent = data.agent;
  if (typeof agent === 'string') {
    const short = agent.split(/[/:]/).filter(Boolean).pop();
    return short && short.length > 0 ? short : agent;
  }
  if (agent != null && typeof agent === 'object') {
    return String(agent.name || agent.id || '');
  }
  return '默认 Agent';
}

function sessionLabel(data: SessionData): string {
  const title = data.title && data.title.length > 0 ? data.title : '（无标题）';
  return `${title} · ${agentLabelOf(data)} · ${data.id.slice(0, 8)}`;
}

function toLines(text: string): string[] {
  return text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0);
}

function PromptField(props: { value: string; onApply: (patch: Partial<PluginSettings>) => void }) {
  const [text, setText] = useState(props.value);
  useEffect(() => {
    setText(props.value);
  }, [props.value]);
  return (
    <SettingTextarea
      label="标题生成提示词"
      description="可用 {maxLength} 占位符，插入标题最大长度；留空使用内置默认提示词"
      rows={8}
      value={text}
      onChange={(event) => setText(event.currentTarget.value)}
      onBlur={() => {
        if (text !== props.value) props.onApply({ prompt: text });
      }}
    />
  );
}

export function LiveSessionTitleSettingsView(props: LiveSessionTitleViewProps) {
  const { store, app, manifest } = props;
  const [settings, setSettings] = useState<PluginSettings>(() => store.getSettings());
  const apply = (patch: Partial<PluginSettings>): void => {
    void store.update(patch).then(setSettings);
  };

  const modelItems = useMemo(() => app.modelProviderManager.listChoices(), [app]);

  const [sessions, setSessions] = useState<readonly SessionData[]>([]);
  useEffect(() => {
    let alive = true;
    void app.sessionManager
      .list()
      .then((list) => {
        if (alive) setSessions([...list].sort((a, b) => b.created - a.created));
      })
      .catch(() => undefined);
    return () => {
      alive = false;
    };
  }, [app]);

  const agentOptions = useMemo(() => {
    const seen = new Set<string>();
    const options: Array<{ key: string; label: string }> = [];
    for (const data of sessions) {
      const label = agentLabelOf(data);
      const key = label.toLowerCase();
      if (label.length > 0 && !seen.has(key)) {
        seen.add(key);
        options.push({ key, label });
      }
    }
    return options;
  }, [sessions]);

  const [pickedSession, setPickedSession] = useState('');
  const [pickedAgent, setPickedAgent] = useState('');
  const [manualAgent, setManualAgent] = useState('');

  const availableSessions = sessions.filter(
    (data) => !settings.exclusions.sessionIds.includes(data.id),
  );
  const availableAgents = agentOptions.filter(
    (option) => !settings.exclusions.agents.some((entry) => entry.toLowerCase() === option.key),
  );
  const excludedSessionRows = settings.exclusions.sessionIds.map((id) => {
    const found = sessions.find((data) => data.id === id);
    return { id, label: found ? sessionLabel(found) : `${id}（会话可能已删除）` };
  });

  const modelValue = settings.model ? JSON.stringify(settings.model) : '';

  return (
    <>
      <SettingsSection header={`会话标题动态更新 · v${manifest.version ?? '0.0.0'}`}>
        <SettingSelect
          label="启用状态"
          description="关闭后完全停止监听与标题更新"
          value={settings.enabled ? '1' : '0'}
          onChange={(event) => apply({ enabled: event.currentTarget.value === '1' })}
        >
          <option value="1">开启</option>
          <option value="0">关闭</option>
        </SettingSelect>
        <SettingSelect
          label="标题生成模型"
          description="生成标题时使用的模型；默认跟随每个会话自己的模型"
          value={modelValue}
          onChange={(event) => {
            const key = event.currentTarget.value;
            const ref = key ? (JSON.parse(key) as ModelRef) : undefined;
            apply({ model: ref });
          }}
        >
          <option value="">跟随会话模型（默认）</option>
          {modelItems.map((item) => (
            <option key={JSON.stringify(item.ref)} value={JSON.stringify(item.ref)}>
              {item.label}
            </option>
          ))}
        </SettingSelect>
        <PromptField value={settings.prompt} onApply={apply} />
        <SettingItem>
          <SettingItem.Label>恢复默认</SettingItem.Label>
          <SettingItem.Control>
            <Button
              size="sm"
              variant="outline"
              disabled={settings.prompt === DEFAULT_PROMPT}
              onClick={() => apply({ prompt: DEFAULT_PROMPT })}
            >
              恢复默认提示词
            </Button>
          </SettingItem.Control>
        </SettingItem>
        <SettingText
          label="标题最大长度（字）"
          description="超出长度的标题会被截断"
          type="number"
          min={4}
          max={120}
          value={settings.maxLength}
          onBlur={(event) => apply({ maxLength: Number(event.currentTarget.value) })}
        />
        <SettingText
          label="防抖时间（毫秒）"
          description="对话更新后等待多久再生成标题，避免频繁调用模型"
          type="number"
          min={0}
          max={600000}
          step={500}
          value={settings.debounceMs}
          onBlur={(event) => apply({ debounceMs: Number(event.currentTarget.value) })}
        />
        <SettingText
          label="参考消息条数"
          description="送入模型的最近用户/助手消息数量"
          type="number"
          min={1}
          max={60}
          value={settings.historyMessages}
          onBlur={(event) => apply({ historyMessages: Number(event.currentTarget.value) })}
        />
      </SettingsSection>

      <SettingsSection header="排除规则">
        <SettingItem>
          <SettingItem.Label description="从现有会话中选择；被排除的会话不再自动更新标题">
            排除会话
          </SettingItem.Label>
          <SettingItem.Control style={{ display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap', minInlineSize: 0 }}>
            <select
              className="dropdown xdb--SettingControl"
              style={{ minInlineSize: '220px' }}
              value={pickedSession}
              onChange={(event) => setPickedSession(event.currentTarget.value)}
            >
              <option value="">{availableSessions.length > 0 ? '选择会话…' : '无可选会话'}</option>
              {availableSessions.map((data) => (
                <option key={data.id} value={data.id}>
                  {sessionLabel(data)}
                </option>
              ))}
            </select>
            <Button
              size="sm"
              variant="outline"
              disabled={pickedSession.length === 0}
              onClick={() => {
                apply({
                  exclusions: {
                    ...settings.exclusions,
                    sessionIds: [...settings.exclusions.sessionIds, pickedSession],
                  },
                });
                setPickedSession('');
              }}
            >
              添加
            </Button>
          </SettingItem.Control>
        </SettingItem>
        {excludedSessionRows.map((row) => (
          <SettingItem key={row.id}>
            <SettingItem.Label>{row.label}</SettingItem.Label>
            <SettingItem.Control>
              <Button
                size="sm"
                variant="ghost"
                onClick={() =>
                  apply({
                    exclusions: {
                      ...settings.exclusions,
                      sessionIds: settings.exclusions.sessionIds.filter((id) => id !== row.id),
                    },
                  })
                }
              >
                移除
              </Button>
            </SettingItem.Control>
          </SettingItem>
        ))}
        <SettingItem>
          <SettingItem.Label description="从现有会话的 Agent 中选择，或手动输入名称/标识（不区分大小写子串匹配）">
            排除 Agent
          </SettingItem.Label>
          <SettingItem.Control style={{ display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap', minInlineSize: 0 }}>
            <select
              className="dropdown xdb--SettingControl"
              style={{ minInlineSize: '150px' }}
              value={pickedAgent}
              onChange={(event) => setPickedAgent(event.currentTarget.value)}
            >
              <option value="">{availableAgents.length > 0 ? '选择 Agent…' : '无可选 Agent'}</option>
              {availableAgents.map((option) => (
                <option key={option.key} value={option.label}>
                  {option.label}
                </option>
              ))}
            </select>
            <SettingText
              aria-label="手动输入 Agent 名称或标识"
              placeholder="或输入关键字"
              style={{ minInlineSize: '140px' }}
              value={manualAgent}
              onChange={(event) => setManualAgent(event.currentTarget.value)}
            />
            <Button
              size="sm"
              variant="outline"
              disabled={pickedAgent.length === 0 && manualAgent.trim().length === 0}
              onClick={() => {
                const value = (pickedAgent || manualAgent).trim();
                if (value.length === 0) return;
                apply({
                  exclusions: {
                    ...settings.exclusions,
                    agents: [...settings.exclusions.agents, value],
                  },
                });
                setPickedAgent('');
                setManualAgent('');
              }}
            >
              添加
            </Button>
          </SettingItem.Control>
        </SettingItem>
        {settings.exclusions.agents.map((agent) => (
          <SettingItem key={agent}>
            <SettingItem.Label>{agent}</SettingItem.Label>
            <SettingItem.Control>
              <Button
                size="sm"
                variant="ghost"
                onClick={() =>
                  apply({
                    exclusions: {
                      ...settings.exclusions,
                      agents: settings.exclusions.agents.filter((entry) => entry !== agent),
                    },
                  })
                }
              >
                移除
              </Button>
            </SettingItem.Control>
          </SettingItem>
        ))}
        <SettingTextarea
          label="排除标题（正则）"
          description="每行一个；当前标题匹配则不更新该会话（非法正则按子串处理）"
          rows={4}
          placeholder={'例如：\n^测试\n^\\[固定\\]'}
          value={settings.exclusions.titlePatterns.join('\n')}
          onBlur={(event) =>
            apply({
              exclusions: { ...settings.exclusions, titlePatterns: toLines(event.currentTarget.value) },
            })
          }
        />
      </SettingsSection>
    </>
  );
}