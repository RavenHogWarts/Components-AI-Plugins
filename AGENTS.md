# AGENTS.md — 给 AI 编码代理的工作指南

本工作区用于开发 **Obsidian Components（xdb-ai）AI 应用插件**。任何 IDE 中的 AI 代理（Claude Code / Cursor / Copilot 等）请按本文件的工作流与规范开发，避免踩已知的坑。

## 1. 项目结构

```text
plugins/<name>/        插件工程（只放业务代码）
  ├── plugin.json      清单：name + version + extensions(displayName/platforms)
  ├── src/             TypeScript 源码；入口 main.ts，default export Plugin 子类
  └── build.mjs        两行：调用 scripts/build-kit.mjs
packages/ai-plugin-kit 共享包（设置 UI/存储/弹层/轮询/格式化/视图挂载）
vendor/ai-api/         @obsidian-components/ai-api 类型声明（npm 未发布；运行时由插件加载器提供）
templates/plugin/      新插件模板
scripts/               build-kit（统一构建）/ deploy（复制到目标库）/ new（脚手架）
docs/                  离线 API 参考：services-overview.md（72 服务）、api/core-types.md、api/services.md
```

- 目标库路径在根目录 `.env`：`VAULT_ROOT=E:\WorkSpace\Obsidian\Scriptorium`
- 部署产物：`<VAULT_ROOT>/.agents/plugins/<name>/{plugin.json, xdb-ai/main.js}`

## 2. 环境与命令

Node ≥ 20 + pnpm ≥ 10。常用命令（在仓库根执行）：

```bash
pnpm install                                  # 首次
pnpm new my-plugin 显示名 描述                # 生成 plugins/my-plugin（含版本/扩展元数据/kit 依赖）
pnpm --filter my-plugin typecheck             # tsc --noEmit
pnpm --filter my-plugin deploy                # 类型检查 + 生产构建 + 复制到目标库
pnpm --filter my-plugin watch                 # 源码变更自动构建并部署
pnpm --filter my-plugin build:dev             # 调试构建（带 inline sourcemap）
```

**部署后需在应用内启用/重载**：在应用的 AI 设置里开关一次；或（若你正运行于应用的 Creator Agent）调用 `pluginManager.refresh()` → `setEnabled(name, true)` / `reload(name)`。其他 IDE 无法直接操作应用，请让用户在设置里切换。

## 3. 插件编写规范

### 清单 plugin.json

```json
{
  "$schema": "https://agent-plugins.org/schemas/1.0.0/plugin.schema.json",
  "name": "my-plugin",
  "description": "……",
  "version": "0.1.0",
  "extensions": { "xdb-ai": {}, "io.github.vran-dev.xdb": { "displayName": "显示名", "platforms": ["all"] } }
}
```

### 入口骨架（src/main.ts）

```ts
import { Plugin } from '@obsidian-components/ai-api';
import type { EventBusApi } from '@obsidian-components/ai-api';

export default class MyPlugin extends Plugin {
  static inject = ['eventBus'] as const;   // 必需服务；通过 this.dependencies['eventBus'] 读取
  private release?: () => void;

  async onResolving(): Promise<void> {
    const settings = await this.api.readData();          // 插件 data.json（卸载重载后保留）
    const bus = this.dependencies['eventBus'] as EventBusApi;
    this.release = bus.subscribe(m => { /* … */ });
    // 可选服务：const footer = this.api.getService('composerViewService')
  }

  async onDisposing(): Promise<void> {
    this.release?.();                                     // 必须释放自有资源
  }
}
```

生命周期：`onResolving`（await 初始化）→ `onResolved` → `onApplicationReady`（可选启动后）→ `onDisposing`/`onDisposed`（清理）。`this.api.signal` 观察卸载取消。

### 设置界面（用 kit，勿手写 DOM）

```ts
import { SettingsStore, createReactView, mountSettingsView, SettingSelect } from 'ai-plugin-kit';

const store = new SettingsStore(this.api, loadSettings(await this.api.readData()), loadSettings);
const Form = createReactView((input: { store: SettingsStore<S>; app: AiApp; manifest: PluginManifest }) =>
  createElement(MySettingsView, input));
mountSettingsView(this.api, Form, () => ({ app: this.api.app, manifest: this.api.manifest, store }));
```

组件内用 kit 的 `SettingsSection/SettingItem(.Label/.Control)/SettingText/SettingTextarea/SettingSelect/Button`——它们使用应用全局类名 `xdb--Setting*`，自动获得官方皮肤。改动即时生效（onChange/onBlur → `store.update(patch)` → 自动持久化），**不要放保存按钮**。

### Composer 底部状态项

```ts
const footer = this.api.getService('composerViewService') as
  { registerFooterItem(i: { id: string; order?: number; renderer: unknown }): void;
    unregisterFooterItem(id: string): void } | undefined;
if (footer) {
  const renderer = createReactView(() => createElement(MyStatusView, { store }));
  footer.registerFooterItem({ id: 'my-plugin', order: 10, renderer });
  this.resources.push(() => footer.unregisterFooterItem('my-plugin'));
}
```

order：官方项 conversation-agent=-1000、conversation-usage=1000；自己取 -2000（最左）/10（中）/2000（最右）。

## 4. API 参考（写代码前先查）

| 需求 | 服务 / 方法 | 备注 |
| --- | --- | --- |
| 监听对话变化 | `eventBus.subscribe`，过滤 `type === 'session.updated'` | 消息含 sessionId |
| 读/改会话 | `sessionManager.getById(id)` → `session.update({...session.data, title})` | status 非idle时别写 |
| 直接调 LLM | `modelProviderManager.getModel(ref).generate({messages, signal})` | 无需建会话；messages 用 parts 形式 `{type:'text',text}` |
| 读对话内容 | `transcriptFactory.create(session).nodes` → `close()` | 实测结构：turn→(message/step)→message；`cursor` 单调可做判重 |
| 模型连接/凭据 | `modelProviderManager.listConnections()` | 字段 `baseUrl/apiKey`（识别供应商、复用凭据） |
| HTTP | `app.httpClient.request({url, method, headers})` | 响应 body 为 ArrayBuffer；状态≥400 需自抛 |
| 注册 Agent 工具 | `toolManager.register({ spec, execute })` | spec.parameters 为 JSON Schema |
| 定时任务 | `jobManager.saveJob({id,title,instruction,schedule})` | schedule 为 iCalendar 文本 |
| 打开页面 | `panelViewManager.openView(viewId, params, mode)` | mode: current/tab/split/panel |

- **完整类型**：`vendor/ai-api/index.d.ts`（IDE 直接补全）
- **方法速查**：`docs/api/services.md`；**类型契约**：`docs/api/core-types.md`；**服务总览（72 个）**：`docs/services-overview.md`
- 需要更新/更深的契约：在应用内让 Creator Agent 调用 `query_services` / `inspect_docs`（按 Service 名或文档 ID，如 `@atra/api#Session`）

## 5. 构建铁律（违反即产物不可用/暴涨）

1. `@obsidian-components/ai-api` **必须保持 external**（加载器运行时提供同一 Plugin 类）。
2. 其余依赖（含 React/react-dom/lucide-react）**随插件打包**——加载器不提供。
3. 统一走 `scripts/build-kit.mjs`：已内置 `mainFields: ['module','main']`（否则 lucide-react 命中 CJS 全量包 ~570KB 无法树摇）、生产无 sourcemap/许可注释。
4. 产物体积参考：React 型插件 ≈ 240-260KB。

## 6. 踩坑录（实战验证过的教训）

1. **useSyncExternalStore 契约**：通知后若快照引用未变（`Object.is` 相同），React 跳过重渲染。跨 store 联动时，被读取的每个 store 都要用 `useSyncExternalStore` 订阅（设置直读曾导致“改设置不刷新”）。
2. **footer 项延迟挂载**：注销后立即重注册同 ID 安全（服务延迟收敛）；但 reload 风暴可能遗留孤儿 DOM——视图挂载时按根 ref 自愈清理同名根。
3. **弹层必须 Portal 到 body + fixed 定位**：容器内 absolute 会被 Composer 裁切（kit `Popover` 已处理，含外点/Esc 关闭）。
4. **官方皮肤=官方类名**：`xdb--Setting*`、`xdb--Button`（含 data-variant/data-size/data-color 等属性）、`dropdown`。自写 all:unset 会得到怪异按钮。
5. **GLM 用量语义**（z.ai / bigmodel.cn）：`TOKENS_LIMIT`＝剩余额度（仅 percentage）；`TIME_LIMIT`＝工具调用配额（usage/currentValue/usageDetails，明细 modelCode: search-prime/web-reader/zread）。重置显示：24h 内「剩余 X小时Y分 · HH:mm 重置」，更远「M月D日 重置」（kit `formatReset`）。
6. **Codex 用量**走本地 `codex -s read-only -a never app-server` 的 stdio JSON-RPC（initialize → account/rateLimits/read）；DeepSeek `GET /user/balance`（Bearer）。
7. **会话标题自动更新防循环**：用 `transcript.cursor` 判重——自己写标题触发 session.updated，但游标未前进即跳过。
8. **Windows/PowerShell 写文件**：必须 `[IO.File]::WriteAllText(绝对路径, 内容, [Text.UTF8Encoding]::new($false))`。相对路径在 .NET API 下相对进程目录而非 PowerShell 当前目录；含中文的 here-string 用单引号 `@' '@`；双引号字符串里 `` `n ``/`${}` 会被插值损坏。git commit 中文请用 `-F <UTF-8 文件>`。
9. **插件数据**：`this.api.readData()/writeData()`（data.json）；外部管理用 `pluginManager.readData/writeData(name)` + `reload(name)`。
10. **改设置立即生效**：设置保存在视图层即时 `store.update`，运行逻辑用 getter 读取当前值；不要只在加载时读一次。

## 7. 验证清单（每个插件发布前）

- [ ] `typecheck` 零错误；`deploy` 成功
- [ ] 应用内：启用后 `loaded` 且 `errors: []`
- [ ] 核心功能实际触发一次（不要只看加载状态）
- [ ] 禁用 → 自有注册（footer 项/订阅/定时器）确实释放
- [ ] 重新启用/重载 → 功能恢复，无孤儿 DOM
- [ ] 设置修改 → 立即生效（含 UI 与运行行为两条链路）
- [ ] `git status` 干净，提交信息符合 Conventional Commits

## 8. Git 规范

Conventional Commits（`feat`/`fix`/`chore`/`docs`/`build`/`refactor`），完成一个逻辑单元即时本地提交；范围用插件名（如 `feat(ai-usage): …`）。提交信息一律经 UTF-8 文件 `-F` 传入，避免命令行编码损坏。