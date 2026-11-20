import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { build, context } from 'esbuild';
import { deployPlugin } from './deploy-lib.mjs';

/**
 * 插件统一构建入口。插件目录下的 build.mjs 只需：
 *   import { runPluginBuild } from '../../scripts/build-kit.mjs';
 *   await runPluginBuild(import.meta.url);
 *
 * 约定：入口 src/main.ts → 产物 dist/xdb-ai/main.js（CJS，ai-api external）。
 * 需要差异化时传入 overrides 覆盖任意 esbuild 选项。
 */
export async function runPluginBuild(metaUrl, overrides = {}) {
  const pluginDir = path.dirname(fileURLToPath(metaUrl));
  const watch = process.argv.includes('--watch');

  const options = {
    entryPoints: ['src/main.ts'],
    outfile: 'dist/xdb-ai/main.js',
    bundle: true,
    format: 'cjs',
    platform: 'node',
    target: 'node18',
    jsx: 'automatic',
    minify: true,
    define: { 'process.env.NODE_ENV': '"production"' },
    // 运行时由插件加载器提供，必须保持 external
    external: ['@obsidian-components/ai-api'],
    sourcemap: 'inline',
    logLevel: 'info',
    absWorkingDir: pluginDir,
    ...overrides,
  };

  if (!watch) {
    await build(options);
    return;
  }

  const ctx = await context({
    ...options,
    plugins: [
      {
        name: 'deploy-on-rebuild',
        setup(builder) {
          builder.onEnd(async (result) => {
            if (result.errors.length === 0) {
              try {
                await deployPlugin(pluginDir);
              } catch (error) {
                console.error(`[watch] 部署失败: ${error.message}`);
              }
            }
          });
        },
      },
    ],
  });
  await ctx.watch();
  console.log('[watch] 已启动：源码变更将自动构建并部署到目标库');
}