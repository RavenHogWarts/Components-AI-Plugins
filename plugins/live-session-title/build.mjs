import { build, context } from 'esbuild';
import { deployPlugin } from '../../scripts/deploy-lib.mjs';

const watch = process.argv.includes('--watch');

/** @type {import('esbuild').BuildOptions} */
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
};

if (!watch) {
  await build(options);
} else {
  const ctx = await context({
    ...options,
    plugins: [
      {
        name: 'deploy-on-rebuild',
        setup(builder) {
          builder.onEnd(async (result) => {
            if (result.errors.length === 0) {
              try {
                await deployPlugin(process.cwd());
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