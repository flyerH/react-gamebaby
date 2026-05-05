import js from '@eslint/js';
import globals from 'globals';
import tseslint from 'typescript-eslint';
import reactHooks from 'eslint-plugin-react-hooks';
import reactRefresh from 'eslint-plugin-react-refresh';

// 引擎层确定性回放约束的统一提示文案
const DETERMINISTIC_MSG =
  '违反确定性回放约束：请改用 ctx.rng / ctx.now。详见 docs/ARCHITECTURE.md §5。';

export default tseslint.config(
  js.configs.recommended,
  ...tseslint.configs.recommendedTypeChecked,

  {
    files: ['**/*.{ts,tsx}'],
    languageOptions: {
      globals: { ...globals.browser, ...globals.node },
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
    plugins: {
      'react-hooks': reactHooks,
      'react-refresh': reactRefresh,
    },
    rules: {
      ...reactHooks.configs.recommended.rules,
      'react-refresh/only-export-components': ['warn', { allowConstantExport: true }],
    },
  },

  {
    // 确定性回放约束的覆盖面：
    //   - engine/sdk/games/ai 四层是核心纯函数链路
    //   - platform/headless 是 Node 训练 / 测试用的离屏适配器，必须确定性
    //   - 文件后缀同时覆盖 .ts 与 .tsx（防御性：将来在这些层若新建 .tsx 也拦截）
    //   - platform/browser 故意不在范围内 —— 它是唯一允许直接读墙钟 / DOM 的桥
    files: ['src/{engine,sdk,games,ai,platform/headless}/**/*.{ts,tsx}'],
    rules: {
      'no-restricted-properties': [
        'error',
        { object: 'Math', property: 'random', message: DETERMINISTIC_MSG },
        { object: 'Date', property: 'now', message: DETERMINISTIC_MSG },
      ],
      'no-restricted-globals': ['error', { name: 'performance', message: DETERMINISTIC_MSG }],
    },
  }
);
