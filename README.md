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
packages/ai-plugin-kit 共享包：设置 UI 体系/设置存储/弹层/轮询存储/格式化/视图挂载
vendor/ai-api/         @obsidian-components/ai-api 本地类型声明（npm 未发布；运行时由加载器提供，构建保持 external）
templates/plugin/      新插件模板（pnpm new 使用）
scripts/               构建与部署：build-kit / deploy / deploy-lib / release / release-lib / env / new
docs/                  离线开发参考：services-overview.md（72 服务总览）、api/core-types.md、api/services.md
```

## 工作流

```bash
pnpm install                          # 安装依赖
pnpm new my-plugin 显示名 描述        # 从模板生成 plugins/my-plugin
pnpm --filter my-plugin deploy        # 类型检查 + 生产构建 + 复制到目标库
pnpm --filter my-plugin release       # 类型检查 + 生产构建 + 打包为分发 zip
pnpm --filter my-plugin watch         # 源码变更自动构建并部署
pnpm --filter my-plugin build:dev     # 调试构建（带 inline sourcemap）
pnpm --filter my-plugin typecheck     # 仅类型检查
```

- **首次部署**后在应用 AI 设置中启用，或让 Agent 调用 `pluginManager.refresh()` + `setEnabled(name, true)`。
- **更新已启用插件**：`deploy` 后重载（Agent 调 `pluginManager.reload(name)`，或在设置里开关一次）。

## 发版 / 打包发布

每个插件可独立打包为分发 zip，**内容与部署产物完全一致**（`dist/` 已在 .gitignore，产物不提交）：

```bash
pnpm --filter turn-loading-style release
# → plugins/turn-loading-style/dist/release/turn-loading-style-v0.2.1.zip
pnpm release                          # 根目录：全部插件各自打包
```

zip 内含（与 `<VAULT_ROOT>/.agents/plugins/<name>/` 一一对应）：

```text
<name>/
  ├── plugin.json
  ├── xdb-ai/main.js
  ├── xdb-ai/styles.css   （存在才带：优先插件根 styles.css，其次构建产物）
  └── assets/             （存在才带：整目录递归，如 turn-loading-style 的 anims）
```

- 版本号取自 `plugin.json` 的 `version`，zip 文件名 `<name>-v<version>.zip`；**发版前先改 `plugin.json` 的 `version`**。
- 分发：解压到目标库 `.agents/plugins/` 后启用；或覆盖已部署目录后重载。带静态资源的插件（如 turn-loading-style）`assets/` 会被自动带上，无需额外配置。

## 插件工程约定

- 入口 `src/main.ts`，`export default class extends Plugin`；`static inject` 声明必需服务。
- 清单 `plugin.json`：`name`（kebab-case，稳定标识）+ `version` + `extensions`（`displayName`、`platforms`）。
- 构建产物 `dist/xdb-ai/main.js`；`@obsidian-components/ai-api` 保持 external，其余依赖（含 React）打包。
- 设置界面：`mountSettingsView(api, Form, getInput)` + kit 设置组件，改动即时生效。
- 生命周期：`onResolving` 初始化（await readData 等），`onDisposing` 释放自有订阅/定时器。

## 共享包 ai-plugin-kit

| 导出                                                     | 用途                                                                        |
| -------------------------------------------------------- | --------------------------------------------------------------------------- |
| `SettingsStore<T>`                                       | 官方模式设置存储：`getSettings/subscribe/update(patch)`，自动规范化并持久化 |
| `createReactView(component)`                             | 生成与官方一致的 React 视图类（尺寸上下文 + ErrorBoundary）                 |
| `mountSettingsView(api, form, getInput)`                 | 标准设置视图挂载（density→size 映射 + 包装类样板）                          |
| `Popover`                                                | 通用浮层：Portal 到 body、锚定 fixed、外部点击/Esc 关闭、resize 重对齐      |
| `PollingStore<T>`                                        | 通用轮询存储：稳定快照 + subscribe，供 useSyncExternalStore                 |
| `formatPercent/formatClock/formatCountdown/formatAmount` | 展示格式化                                                                  |
| `SettingsSection / SettingItem(.Label/.Control)`         | 官方 `xdb--Setting*` 布局组件（应用全局样式）                               |
| `SettingText / SettingTextarea / SettingSelect / Button` | 官方风格控件（select 自带 `dropdown` 类，Button 支持原生 data 属性）        |

## 体积优化

生产构建（默认）：**无 sourcemap、无许可注释、优先 ESM 入口（mainFields: module→main）保证树摇**。

| 插件               | 优化前 | 优化后        | 说明                                                             |
| ------------------ | ------ | ------------- | ---------------------------------------------------------------- |
| ai-usage           | 1.74MB | 253KB（-85%） | 去 inline sourcemap；修复 lucide-react 被 CJS 全量打包（~570KB） |
| live-session-title | 1.74MB | 241KB（-86%） | 去 inline sourcemap                                              |

调试需要源码映射时用 `build:dev`。React/react-dom 需按官方约定随插件打包（加载器不提供），跨插件无法共享运行时副本。

## API 参考

- 快速索引：`docs/services-overview.md`（72 个服务）+ `docs/api/services.md`（方法签名）
- 类型契约：`docs/api/core-types.md` + `vendor/ai-api/index.d.ts`
- 需要最新/更深的契约时，请 Creator Agent 调用 `query_services` / `inspect_docs`（按 Service 名或文档 ID）

## Git 提交约定

Conventional Commits（`feat` / `fix` / `chore` / `docs` / `build` / `refactor`），完成一个逻辑单元即时本地提交。
