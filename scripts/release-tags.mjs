#!/usr/bin/env node
/**
 * 逐个推送插件的版本 tag，并触发 GitHub Actions 的 Release Plugin 工作流。
 *
 * 为什么不用 `git push --tags`：当一次推送包含多个 tag 时，GitHub Actions 不会为
 * 其中的 tag 触发 `push` 工作流（实测：一次推 5 个 tag → 0 个运行）。逐个 `git push
 * origin <tag>` 才能稳定触发。本脚本即为规避该限制而设。
 *
 * 用法（在仓库根目录执行）：
 *   node scripts/release-tags.mjs <plugin>...            # 如 node scripts/release-tags.mjs ai-usage agents-md
 *   node scripts/release-tags.mjs --all                 # 推送所有 plugins/<name>/plugin.json 的 tag
 *
 * 已发布（GitHub Release 存在）的 tag 会跳过；远端遗留的孤儿 tag（上次批量推送未触发）
 * 会被删除后重推，以恢复触发。
 */
import { execSync } from 'node:child_process';
import { readdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const args = process.argv.slice(2);
const all = args.includes('--all');
const names = all
  ? readdirSync(resolve('plugins'), { withFileTypes: true })
      .filter((e) => e.isDirectory() && readFileSync(resolve('plugins', e.name, 'plugin.json'), 'utf8').includes('"name"'))
      .map((e) => e.name)
  : args.filter((a) => !a.startsWith('--'));

if (!names.length) {
  console.error('用法: node scripts/release-tags.mjs <plugin>...  或  node scripts/release-tags.mjs --all');
  process.exit(1);
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
/** 执行命令并返回 stdout 去空白；stdio 非 pipe 时可能为 null，返回 '' */
const run = (cmd, opts = {}) => {
  try {
    return (execSync(cmd, { stdio: 'pipe', ...opts }) ?? '').toString().trim();
  } catch {
    return '';
  }
};
/** 按退出码判断命令是否成功（不关心输出） */
const ok = (cmd, opts = {}) => {
  try {
    execSync(cmd, { stdio: 'ignore', ...opts });
    return true;
  } catch {
    return false;
  }
};
const tagOf = (name) => `${name}-v${JSON.parse(readFileSync(resolve('plugins', name, 'plugin.json'), 'utf8')).version}`;

let released = 0;
for (const name of names) {
  const tag = tagOf(name);
  if (!ok(`git rev-parse --verify refs/tags/${tag}`)) {
    console.error(`[skip] 本地无 tag ${tag}（先提交并打 tag）`);
    continue;
  }
  // 已发布则跳过，避免删除已发布的 tag
  if (ok(`gh release view ${tag}`)) {
    console.log(`[skip] ${tag} 已有 Release`);
    continue;
  }
  // 删除远端孤儿 tag（上次批量推送可能已存在但未触发）
  if (ok(`git push origin :refs/tags/${tag}`)) {
    console.log(`[clean] 删除远端孤儿 tag ${tag}`);
  }
  // 逐个推送，确保触发工作流
  if (!ok(`git push origin ${tag}`)) {
    console.error(`[fail] ${tag} 推送失败`);
    process.exit(1);
  }
  console.log(`[push] ${tag}`);
  released += 1;
  await sleep(3000);
}
console.log(`完成：推送 ${released} 个 tag${names.length > released ? `，跳过 ${names.length - released} 个` : ''}`);
