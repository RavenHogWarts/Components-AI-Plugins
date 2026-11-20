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
scripts/               构建与部署：build-kit / deploy / deploy-lib / env / new
docs/                  离线开发参考：services-overview.md（72 服务总览）、api/core-types.md、api/services.md
```

## 工作流

```bash
pnpm install                          # 安装依赖
pnpm new my-plugin 显示名 描述        # 从模板生成 plugins/my-plugin
pnpm --filter my-plugin deploy        # 类型检查 + 生产构建 + 复制到目标库
pnpm --filter my-plugin watch         # 源码变更自动构建并部署
pnpm --filter my-plugin build:dev     # 调试构建（带 inline sourcemap）
pnpm --filter my-plugin typecheck     # 仅类型检查
```

- **首次部署**后在应用 AI 设置中启用，或让 Agent 调用 `pluginManager.refresh()` + `setEnabled(name, true)`。
- **更新已启用插件**：`deploy` 后重载（Agent 调 `pluginManager.reload(name)`，或在设置里开关一次）。

## 插件工程约定

- 入口 `src/main.ts`，`export default class extends Plugin`；`static inject` 声明必需服务。
- 清单 `plugin.json`：`name`（kebab-case，稳定标识）+ `version` + `extensions`（`displayName`、`platforms`）。
- 构建产物 `dist/xdb-ai/main.js`；`@obsidian-components/ai-api` 保持 external，其余依赖（含 React）打包。
- 设置界面：`mountSettingsView(api, Form, getInput)` + kit 设置组件，改动即时生效。
- 生命周期：`onResolving` 初始化（await readData 等），`onDisposing` 释放自有订阅/定时器。

## 共享包 ai-plugin-kit

| 导出 | 用途 |
| --- | --- |
| `SettingsStore<T>` | 官方模式设置存储：`getSettings/subscribe/update(patch)`，自动规范化并持久化 |
| `createReactView(component)` | 生成与官方一致的 React 视图类（尺寸上下文 + ErrorBoundary） |
| `mountSettingsView(api, form, getInput)` | 标准设置视图挂载（density→size 映射 + 包装类样板） |
| `Popover` | 通用浮层：Portal 到 body、锚定 fixed、外部点击/Esc 关闭、resize 重对齐 |
| `PollingStore<T>` | 通用轮询存储：稳定快照 + subscribe，供 useSyncExternalStore |
| `formatPercent/formatClock/formatCountdown/formatAmount` | 展示格式化 |
| `SettingsSection / SettingItem(.Label/.Control)` | 官方 `xdb--Setting*` 布局组件（应用全局样式） |
| `SettingText / SettingTextarea / SettingSelect / Button` | 官方风格控件（select 自带 `dropdown` 类，Button 支持原生 data 属性） |

## 体积优化

生产构建（默认）：**无 sourcemap、无许可注释、优先 ESM 入口（mainFields: module→main）保证树摇**。

| 插件 | 优化前 | 优化后 | 说明 |
| --- | --- | --- | --- |
| ai-usage | 1.74MB | 253KB（-85%） | 去 inline sourcemap；修复 lucide-react 被 CJS 全量打包（~570KB） |
| live-session-title | 1.74MB | 241KB（-86%） | 去 inline sourcemap |

调试需要源码映射时用 `build:dev`。React/react-dom 需按官方约定随插件打包（加载器不提供），跨插件无法共享运行时副本。

## API 参考

- 快速索引：`docs/services-overview.md`（72 个服务）+ `docs/api/services.md`（方法签名）
- 类型契约：`docs/api/core-types.md` + `vendor/ai-api/index.d.ts`
- 需要最新/更深的契约时，请 Creator Agent 调用 `query_services` / `inspect_docs`（按 Service 名或文档 ID）

## Git 提交约定

Conventional Commits（`feat` / `fix` / `chore` / `docs` / `build` / `refactor`），完成一个逻辑单元即时本地提交。

## 已发布插件

### ai-usage（v0.3.0）

监控已配置模型的用量，Composer 底部状态项（usage-monitor 官方设计语言）。

- 来源：GLM（bigmodel.cn / z.ai）与 DeepSeek 复用已配置连接的 Key；Codex 经 codex CLI（探测可用才展示）
- 显示：正向（已用）/逆向（剩余）可配；弹层含套餐徽章、进度条（警告/危险色调）、重置倒计时、余额
- 按已配置来源独立开关；底部位置左/中/右可配；轮询 1-60 分钟可配

### live-session-title（v0.2.0）

根据对话最新内容持续更新会话标题；按会话 ID / 标题正则 / Agent 名单排除（可从现有会话选择）。

- 触发：`session.updated` 按会话防抖（默认 8s），转写游标判重防循环
- 设置：模型/提示词/长度/防抖/参考条数，保存即生效

### 验证记录（2026-11-20，应用内实测）

| 检查项 | 结果 |
| --- | --- |
| live-session-title：加载/标题更新/排除/禁用释放/重载 | 全部通过 |
| ai-usage：加载/footer 注册与释放/位置三档/GLM 端点 200 | 全部通过 |
| ai-usage：弹层 Portal 渲染/外点关闭/进度条/倒计时 | DOM 实测通过 |
| ai-usage：重载孤儿根自愈 | 连续 3 次重载压测单根稳定 |
| kit 公共件迁移后两插件回归 | loaded 零错误，功能正常 |

未覆盖：设置界面的视觉外观（类名结构与官方插件一致，由应用全局样式渲染）。