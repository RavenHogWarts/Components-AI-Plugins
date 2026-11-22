import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

// 用法: node scripts/gh-release.mjs [插件目录] [--dry-run]
// 将已构建的分发 zip 发布为 GitHub Release（tag = <name>-v<version>），资产 = <name>-v<version>.zip。
// 前置：pnpm --filter <name> release（生成本地 zip）。
let dir = path.resolve(process.argv[2] || process.cwd());
while (!fs.existsSync(path.join(dir, 'plugin.json'))) {
  const parent = path.dirname(dir);
  if (parent === dir) {
    console.error('未找到 plugin.json：请传入插件目录，或在插件目录内执行');
    process.exit(1);
  }
  dir = parent;
}
const dryRun = process.argv.includes('--dry-run');

const manifest = JSON.parse(fs.readFileSync(path.join(dir, 'plugin.json'), 'utf8'));
const { name, version = '0.0.0', description = '' } = manifest;
const display = manifest.extensions?.['io.github.vran-dev.xdb']?.displayName || name;
const zip = path.join(dir, 'dist', 'release', `${name}-v${version}.zip`);
if (!fs.existsSync(zip)) {
  console.error(`[gh-release] 缺少分发 zip: ${zip}，请先运行 pnpm --filter ${name} release`);
  process.exit(1);
}

const tag = `${name}-v${version}`;
const title = `${display} v${version}`;
const notes = description || title;
const args = ['release', 'create', tag, zip, '--title', title, '--notes', notes];

if (dryRun) {
  console.log(`[gh-release] DRY-RUN: gh ${args.join(' ')}`);
  console.log(`[gh-release] 资产: ${path.basename(zip)}`);
} else {
  // 幂等：同一 tag 可能被本地 release:gh 与 CI workflow（tag 推送触发）重复创建，
  // Release 已存在则跳过，避免 "release with the same tag name already exists" 报错。
  const exists = spawnSync('gh', ['release', 'view', tag, '--json', 'tagName'], { encoding: 'utf8' });
  if (exists.status === 0) {
    console.log(`[gh-release] Release ${tag} 已存在，跳过创建（幂等，资产已就绪）`);
    process.exit(0);
  }
  const result = spawnSync('gh', args, { stdio: 'inherit' });
  if (result.status !== 0) {
    console.error(`[gh-release] gh release create 失败（exit ${result.status}）`);
    process.exit(result.status || 1);
  }
  console.log(`[gh-release] 已发布 ${tag}（资产：${path.basename(zip)}）`);
}
