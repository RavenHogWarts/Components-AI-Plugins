import fs from 'node:fs';
import path from 'node:path';
import AdmZip from 'adm-zip';
import { collectPluginFiles } from './deploy-lib.mjs';

/**
 * 将一个插件工程打包为分发 zip：<插件目录>/dist/release/<name>-v<version>.zip
 * 内容与部署产物完全一致（collectPluginFiles：plugin.json + xdb-ai/main.js +
 * 可选 xdb-ai/styles.css + 可选 assets/**），无需为带资源的插件（如 turn-loading-style）额外配置。
 * 返回 zip 绝对路径。
 */
export async function releasePlugin(pluginDir, { silent = false } = {}) {
  const { manifest, files } = collectPluginFiles(pluginDir);

  const version = manifest.version || '0.0.0';
  const zipName = `${manifest.name}-v${version}.zip`;
  const outDir = path.join(pluginDir, 'dist', 'release');
  fs.mkdirSync(outDir, { recursive: true });
  const outPath = path.join(outDir, zipName);

  const zip = new AdmZip();
  for (const { rel, abs } of files) {
    zip.addFile(`${manifest.name}/${rel}`, fs.readFileSync(abs));
  }
  zip.writeZip(outPath);

  const size = fs.statSync(outPath).size;
  if (!silent) {
    console.log(`[release] ${manifest.name}@${version} -> dist/release/${zipName}（${(size / 1024).toFixed(1)} KB，${files.length} 个文件）`);
    for (const { rel } of files) console.log(`  - ${manifest.name}/${rel}`);
  }
  return outPath;
}
