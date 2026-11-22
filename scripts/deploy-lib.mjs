import fs from 'node:fs';
import path from 'node:path';
import { findEnvFile, parseEnv } from './env.mjs';

/**
 * 收集一个插件工程待发布的文件集合（部署与发版 zip 共用，保证两者内容一致）。
 * 约定（与部署产物一一对应）：
 *   - plugin.json（必需）
 *   - dist/xdb-ai/main.js（必需，构建产物）
 *   - xdb-ai/styles.css（可选：优先插件根 styles.css，其次构建产物内的）
 *   - assets/**（可选：整目录递归）
 *
 * 返回 { manifest, files: [{ rel, abs }] }，rel 统一用 "/" 分隔。
 */
export function collectPluginFiles(pluginDir) {
  const manifestPath = path.join(pluginDir, 'plugin.json');
  if (!fs.existsSync(manifestPath)) {
    throw new Error(`未找到 plugin.json: ${manifestPath}`);
  }
  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  if (!manifest.name) throw new Error('plugin.json 缺少 name 字段');

  const files = [];
  const add = (rel, abs) => {
    if (fs.existsSync(abs)) files.push({ rel, abs });
  };

  // 清单
  add('plugin.json', manifestPath);

  // 构建产物（必须存在）
  const entry = path.join(pluginDir, 'dist', 'xdb-ai', 'main.js');
  if (!fs.existsSync(entry)) {
    throw new Error(`构建产物缺失: ${entry}，请先执行 pnpm build`);
  }
  add('xdb-ai/main.js', entry);

  // 样式：优先插件根目录静态 styles.css，其次构建产物内的
  const stylesRoot = path.join(pluginDir, 'styles.css');
  const stylesDist = path.join(pluginDir, 'dist', 'xdb-ai', 'styles.css');
  if (fs.existsSync(stylesRoot)) add('xdb-ai/styles.css', stylesRoot);
  else add('xdb-ai/styles.css', stylesDist);

  // assets：整目录递归
  const assetsDir = path.join(pluginDir, 'assets');
  if (fs.existsSync(assetsDir)) {
    const walk = (dir, prefix) => {
      for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const abs = path.join(dir, entry.name);
        const rel = `${prefix}/${entry.name}`;
        if (entry.isDirectory()) walk(abs, rel);
        else files.push({ rel, abs });
      }
    };
    walk(assetsDir, 'assets');
  }

  return { manifest, files };
}

/**
 * 将一个插件工程的构建产物部署到目标库：
 *   <VAULT_ROOT>/.agents/plugins/<manifest.name>/
 *     ├── plugin.json
 *     └── xdb-ai/main.js（可选 styles.css / assets）
 */
export async function deployPlugin(pluginDir, { silent = false } = {}) {
  const { manifest, files } = collectPluginFiles(pluginDir);

  const env = parseEnv(findEnvFile(pluginDir));
  const vaultRoot = process.env.VAULT_ROOT || env.VAULT_ROOT;
  if (!vaultRoot || !fs.existsSync(vaultRoot)) {
    throw new Error('未配置有效的 VAULT_ROOT，请在工作区 .env 中设置库根目录');
  }

  const target = path.join(vaultRoot, '.agents', 'plugins', manifest.name);
  for (const { rel, abs } of files) {
    const to = path.join(target, rel);
    fs.mkdirSync(path.dirname(to), { recursive: true });
    fs.copyFileSync(abs, to);
  }

  if (!silent) {
    console.log(`[deploy] ${manifest.name} -> ${path.relative(vaultRoot, target)} 完成`);
  }
  return target;
}
