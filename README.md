# Components AI Plugins

Obsidian Components AI 插件开发工作区：TypeScript 编写源码，esbuild 编译为 CommonJS，部署脚本把产物复制到目标库的 `.agents/plugins/` 下。

## 环境

- Node >= 20，pnpm >= 10（本机验证：Node 24 / pnpm 12）
- 目标库路径在根目录 `.env` 中配置（参考 `.env.example`）：

```ini
VAULT_ROOT=E:\WorkSpace\Obsidian\Scriptorium
```

## 目录结构

```text
plugins/<name>/     插件工程（TS 源码 + plugin.json + build.mjs）
vendor/ai-api/      @obsidian-components/ai-api 本地类型声明（运行时由加载器提供，构建保持 external）
scripts/            部署脚本（deploy.mjs / deploy-lib.mjs / env.mjs）
```

## 工作流

```bash
pnpm install                                # 安装依赖
pnpm --filter live-session-title typecheck  # 类型检查
pnpm --filter live-session-title build      # 编译到 dist/xdb-ai/main.js
pnpm --filter live-session-title deploy     # 类型检查 + 编译 + 复制到目标库
pnpm --filter live-session-title watch      # 监听变更：自动构建并部署
```

- 首次部署后，在应用的 AI 设置中启用插件（或让 Agent 调用 `pluginManager.refresh()` + `setEnabled(name, true)`）。
- 修改已启用的插件后执行 `pnpm deploy`，再重载插件生效（`pluginManager.reload('live-session-title')`）。

## 插件：live-session-title

根据对话最新内容持续更新会话标题。

- **触发**：事件总线 `session.updated`，按会话独立防抖（默认 8 秒），仅当会话空闲且内容游标前进时才生成
- **防循环**：以转写游标（transcript.cursor）判重，插件自己写入标题不会再次触发生成
- **标题模型**：默认跟随会话模型，可在设置中指定
- **排除规则**：会话 ID / 标题正则 / Agent 名单（设置界面每行一条）
- **设置**：保存在插件 `data.json`，保存后立即生效，无需重载

## Git 提交约定

使用 Conventional Commits（`feat` / `fix` / `chore` / `docs` / `build` / `refactor`），完成一个逻辑单元即时本地提交。