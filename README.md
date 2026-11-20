# Components AI Plugins

Obsidian Components AI 插件开发工作区：TypeScript 源码 → esbuild 编译（CJS）→ 部署脚本复制到目标库 `.agents/plugins/`。

## 环境

- Node >= 20，pnpm >= 10（本机：Node 24 / pnpm 12）
- 目标库路径在根目录 `.env`（参考 `.env.example`）：

```ini
VAULT_ROOT=E:\WorkSpace\Obsidian\Scriptorium
```

## 目录结构

```text
plugins/<name>/        插件工程（只放业务代码，共享内容在 kit）
packages/ai-plugin-kit 共享包：官方风格设置 UI（xdb--Setting* 体系）、泛型 SettingsStore、React 视图挂载
vendor/ai-api/         @obsidian-components/ai-api 本地类型声明（npm 未发布；运行时由加载器提供，构建保持 external）
templates/plugin/      新插件模板（pnpm new 使用）
scripts/               构建与部署：build-kit / deploy / deploy-lib / env / new
docs/                  离线开发参考：services-overview.md（72 服务总览）、api/core-types.md、api/services.md
```

## 工作流

```bash
pnpm install                          # 安装依赖
pnpm new my-plugin 显示名 描述        # 从模板生成 plugins/my-plugin
pnpm --filter my-plugin deploy        # 类型检查 + 编译 + 复制到目标库
pnpm --filter my-plugin watch         # 源码变更自动构建并部署
pnpm --filter my-plugin typecheck     # 仅类型检查
```

- **首次部署**后在应用 AI 设置中启用，或让 Agent 调用 `pluginManager.refresh()` + `setEnabled(name, true)`。
- **更新已启用插件**：`deploy` 后重载（Agent 调 `pluginManager.reload(name)`，或在设置里开关一次）。

## 插件工程约定

- 入口 `src/main.ts`，`export default class extends Plugin`；`static inject` 声明必需服务。
- 清单 `plugin.json`：`name`（kebab-case，稳定标识）+ `version` + `extensions`（`displayName`、`platforms`）。
- 构建产物 `dist/xdb-ai/main.js`；`@obsidian-components/ai-api` 保持 external，其余依赖（含 React）打包。
- 设置界面：`import { SettingsStore, createReactView, SettingItem... } from 'ai-plugin-kit'`，
  改动即时生效（onBlur/onChange → store.update → writeData），无需保存按钮。
- 生命周期：`onResolving` 初始化（await readData 等），`onDisposing` 释放自有订阅/定时器。

## 共享包 ai-plugin-kit

| 导出 | 用途 |
| --- | --- |
| `SettingsStore<T>` | 官方模式设置存储：`getSettings/subscribe/update(patch)`，自动规范化并持久化 |
| `createReactView(component)` | 生成与官方一致的 React 视图类（尺寸上下文 + ErrorBoundary） |
| `SettingsSection / SettingItem(.Label/.Control)` | 官方 `xdb--Setting*` 布局组件（应用全局样式） |
| `SettingText / SettingTextarea / SettingSelect / Button` | 官方风格控件（select 自带 `dropdown` 类） |

## API 参考

- 快速索引：`docs/services-overview.md`（72 个服务）+ `docs/api/services.md`（方法签名）
- 类型契约：`docs/api/core-types.md` + `vendor/ai-api/index.d.ts`
- 需要最新/更深的契约时，请 Creator Agent 调用 `query_services` / `inspect_docs`（按 Service 名或文档 ID）

## Git 提交约定

Conventional Commits（`feat` / `fix` / `chore` / `docs` / `build` / `refactor`），完成一个逻辑单元即时本地提交。

## 已发布插件

### live-session-title（v0.2.0）

根据对话最新内容持续更新会话标题；支持按会话 ID / 标题正则 / Agent 名单排除（可从现有会话选择），可配置标题模型、提示词、长度、防抖与参考消息数。

- 触发：`session.updated` 按会话防抖（默认 8s），空闲且转写游标前进才生成；自写入不触发（游标判重防循环）
- 设置：`data.json` 持久化，保存即生效；会话标题动态更新 · v0.2.0

### 验证记录（2026-11-20，应用内实测）

| 检查项 | 结果 |
| --- | --- |
| 加载（refresh + setEnabled） | loaded，无错误 |
| 标题自动更新 | 「标题插件功能测试」→「秦始皇统一六国的历史事件与意义」 |
| 持续跟踪最新话题 | →「手冲咖啡水温对风味的影响」（话题切换后） |
| 排除会话 ID（writeData + reload） | 标题保持不变 |
| 禁用卸载（unloaded） | 新消息后标题不再变化，订阅已释放 |
| 重新启用 | 功能恢复，按最新 data.json 运行 |
| v0.2.0 官方风格设置界面重构后回归 | loaded 零错误；标题→「敦煌莫高窟的艺术价值介绍」 |
| 共享包抽取（ai-plugin-kit）迁移后回归 | loaded 零错误（v0.2.0） |

未覆盖：设置界面的视觉外观（类名结构与官方插件一致，由应用全局样式渲染）。