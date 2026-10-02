import js from '@eslint/js';

export default [
  { ignores: ['dist/**', 'node_modules/**', 'docs/**', 'uploads/**', 'coverage/**'] },
  {
    files: ['src/**/*.{js,jsx}', 'scripts/**/*.{js,mjs}', 'vite.config.js', 'postcss.config.js'],
    languageOptions: {
      ecmaVersion: 2024,
      sourceType: 'module',
      parserOptions: { ecmaFeatures: { jsx: true } },
    },
    rules: {
      ...js.configs.recommended.rules,
      'no-unused-vars': 'off',
      'no-empty': 'off',
      'no-undef': 'off',
      'no-useless-assignment': 'off',
      'no-control-regex': 'off',
      'no-eval': 'error',
      'no-implied-eval': 'error',
      'no-new-func': 'error',
      'no-debugger': 'warn',
    },
  },
];
