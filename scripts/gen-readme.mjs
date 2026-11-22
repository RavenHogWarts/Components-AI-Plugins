import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// 从 plugins/*/plugin.json 重新生成 README 的「已发布插件」区块（PLUGIN-LIST 标记之间）。
// 版本/描述/下载链接全部取自 plugin.json（单一来源），发版后跑一次：node scripts/gen-readme.mjs
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const readmePath = path.join(root, 'README.md');
const pluginsDir = path.join(root, 'plugins');

const rootPkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
const repoUrl = (rootPkg.repository && (rootPkg.repository.url || rootPkg.repository)) || '';
const m = repoUrl.match(/github\.com[/:]([^/]+)\/([^/]+?)(?:\.git)?$/);
if (!m) throw new Error('无法从 package.json repository.url 解析 owner/repo（形如 git+https://github.com/<owner>/<repo>.git）');
const [, owner, repo] = m;

// 收集所有插件（列表按名称字母排序；版本/描述取自 plugin.json 单一来源）
const plugins = [];
for (const entry of fs.readdirSync(pluginsDir, { withFileTypes: true })) {
  if (!entry.isDirectory()) continue;
  const manifestPath = path.join(pluginsDir, entry.name, 'plugin.json');
  if (!fs.existsSync(manifestPath)) continue;
  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  if (!manifest.name) continue;
  plugins.push({
    name: manifest.name,
    version: manifest.version || '0.0.0',
    description: manifest.description || '',
  });
}
plugins.sort((a, b) => a.name.localeCompare(b.name));

const base = `https://github.com/${owner}/${repo}`;
const block = plugins
  .map((p) => {
    const tag = `${p.name}-v${p.version}`;
    const zip = `${p.name}-v${p.version}.zip`;
    const url = `${base}/releases/download/${tag}/${zip}`;
    // 单个徽标：显示最新发布版本，点击跳转下载 zip
    const badge = `https://img.shields.io/github/v/release/${owner}/${repo}?filter=${p.name}-v*&label=${encodeURIComponent('下载')}`;
    return [
      `### ${p.name}（v${p.version}）`,
      '',
      p.description,
      '',
      `[![下载 ${zip}](${badge})](${url})`,
      '',
    ].join('\n');
  })
  .join('\n');

const START = '<!-- PLUGIN-LIST:START -->';
const END = '<!-- PLUGIN-LIST:END -->';
let readme = fs.readFileSync(readmePath, 'utf8');
const s = readme.indexOf(START);
const e = readme.indexOf(END);
if (s === -1 || e === -1) {
  throw new Error('README 缺少 PLUGIN-LIST 标记（<!-- PLUGIN-LIST:START --> / <!-- PLUGIN-LIST:END -->）');
}
readme = readme.slice(0, s + START.length) + '\n' + block + '\n' + readme.slice(e);
fs.writeFileSync(readmePath, readme, 'utf8');
console.log(`[gen-readme] 已更新 ${plugins.length} 个插件列表（${owner}/${repo}）`);
