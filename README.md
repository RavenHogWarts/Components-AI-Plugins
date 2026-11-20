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
## 验证记录（2026-11-20，应用内实测）

| 检查项 | 结果 |
| --- | --- |
| 加载（refresh + setEnabled） | loaded，无错误 |
| 标题自动更新（新会话，话题：秦始皇统一六国） | 「标题插件功能测试」→「秦始皇统一六国的历史事件与意义」 |
| 排除会话 ID（writeData + reload 后发新话题） | 标题保持不变 |
| 禁用卸载（setEnabled false，状态 unloaded） | 新消息完成后标题不再变化，订阅已释放 |
| 重新启用 | 标题恢复更新，随最新话题变为「手冲咖啡水温对风味的影响」 |
| 设置持久化 | data.json 读写 + 重载后按最新设置运行 |

未覆盖：设置界面（Settings View）未做视觉验证，仅验证了其背后的数据读写与加载路径。