import tseslint from 'typescript-eslint';

// 仅启用注释规范（完整规范见 AGENTS.md「注释规范」）
export default tseslint.config(
  // templates 含 @NAME@ 等脚手架占位符，非合法源码，不参与 lint
  { ignores: ['**/dist/**', '**/node_modules/**', 'templates/**'] },
  {
    files: ['**/*.{ts,tsx,mjs,js}'],
    languageOptions: {
      parser: tseslint.parser,
      parserOptions: { ecmaVersion: 'latest', sourceType: 'module' },
    },
    rules: {
      // // 与 /* 之后必须有空格
      'spaced-comment': ['error', 'always', { markers: ['/'] }],
      // 其余警告标记一律禁用；TODO 允许但必须带说明：TODO(领域): 描述
      'no-warning-comments': ['warn', { terms: ['fixme', 'xxx', 'hack'], location: 'anywhere' }],
    },
  },
);