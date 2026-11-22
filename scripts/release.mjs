import fs from 'node:fs';
import path from 'node:path';
import { releasePlugin } from './release-lib.mjs';

// 用法: node scripts/release.mjs [插件目录]
// 省略目录时使用当前目录（或向上查找包含 plugin.json 的目录）
let dir = path.resolve(process.argv[2] || process.cwd());
while (!fs.existsSync(path.join(dir, 'plugin.json'))) {
  const parent = path.dirname(dir);
  if (parent === dir) {
    console.error('未找到 plugin.json：请传入插件目录，或在插件目录内执行');
    process.exit(1);
  }
  dir = parent;
}

try {
  await releasePlugin(dir);
} catch (error) {
  console.error(`[release] 失败: ${error.message}`);
  process.exit(1);
}
