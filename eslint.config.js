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
    files: ['src/{engine,sdk,games,ai}/**/*.ts'],
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
