import fs from 'node:fs';
import path from 'node:path';
import { findEnvFile, parseEnv } from './env.mjs';

/**
 * 将一个插件工程的构建产物部署到目标库：
 *   <VAULT_ROOT>/.agents/plugins/<manifest.name>/
 *     ├── plugin.json
 *     └── xdb-ai/main.js（可选 styles.css）
 */
export async function deployPlugin(pluginDir, { silent = false } = {}) {
  const manifestPath = path.join(pluginDir, 'plugin.json');
  if (!fs.existsSync(manifestPath)) {
    throw new Error(`未找到 plugin.json: ${manifestPath}`);
  }
  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  if (!manifest.name) throw new Error('plugin.json 缺少 name 字段');

  const entry = path.join(pluginDir, 'dist', 'xdb-ai', 'main.js');
  if (!fs.existsSync(entry)) {
    throw new Error(`构建产物缺失: ${entry}，请先执行 pnpm build`);
  }

  const env = parseEnv(findEnvFile(pluginDir));
  const vaultRoot = process.env.VAULT_ROOT || env.VAULT_ROOT;
  if (!vaultRoot || !fs.existsSync(vaultRoot)) {
    throw new Error('未配置有效的 VAULT_ROOT，请在工作区 .env 中设置库根目录');
  }

  const target = path.join(vaultRoot, '.agents', 'plugins', manifest.name);
  fs.mkdirSync(path.join(target, 'xdb-ai'), { recursive: true });
  fs.copyFileSync(manifestPath, path.join(target, 'plugin.json'));
  fs.copyFileSync(entry, path.join(target, 'xdb-ai', 'main.js'));

  const styles = path.join(pluginDir, 'dist', 'xdb-ai', 'styles.css');
  if (fs.existsSync(styles)) {
    fs.copyFileSync(styles, path.join(target, 'xdb-ai', 'styles.css'));
  }

  if (!silent) {
    console.log(`[deploy] ${manifest.name} -> ${path.relative(vaultRoot, target)} 完成`);
  }
  return target;
}
