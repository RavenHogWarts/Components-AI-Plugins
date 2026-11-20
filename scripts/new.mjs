import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// 用法: pnpm new <name> [显示名] [描述]
// 从 templates/plugin 生成 plugins/<name>，替换 @NAME@/@DISPLAY@/@DESCRIPTION@/@PASCAL@
const [name, display, description] = process.argv.slice(2);
if (!name || !/^[a-z][a-z0-9-]*$/.test(name)) {
  console.error('用法: pnpm new <kebab-case 名称> [显示名] [描述]');
  process.exit(1);
}

const root = path.resolve(fileURLToPath(new URL('.', import.meta.url)), '..');
const templateDir = path.join(root, 'templates', 'plugin');
const targetDir = path.join(root, 'plugins', name);
if (fs.existsSync(targetDir)) {
  console.error(`已存在: plugins/${name}`);
  process.exit(1);
}

const pascal = name
  .split('-')
  .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
  .join('');

const tokens = {
  '@NAME@': name,
  '@DISPLAY@': display || name,
  '@DESCRIPTION@': description || `${name} 插件`,
  '@PASCAL@': pascal,
};

const replace = (text) => {
  let result = text;
  for (const [token, value] of Object.entries(tokens)) {
    result = result.split(token).join(value);
  }
  return result;
};

const walk = (dir) => {
  fs.mkdirSync(dir, { recursive: true });
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const from = path.join(dir, entry.name);
    const to = path.join(targetDir, path.relative(templateDir, from));
    if (entry.isDirectory()) {
      walk(from);
    } else {
      fs.mkdirSync(path.dirname(to), { recursive: true });
      fs.writeFileSync(to, replace(fs.readFileSync(from, 'utf8')), 'utf8');
    }
  }
};
walk(templateDir);
console.log(`已生成 plugins/${name}（显示名：${tokens['@DISPLAY@']}）`);
console.log('后续：');
console.log(`  pnpm install`);
console.log(`  pnpm --filter ${name} deploy`);