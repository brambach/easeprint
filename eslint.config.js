import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import astro from 'eslint-plugin-astro';
import globals from 'globals';

export default [
  { ignores: ['dist/', 'extension/dist/', 'extension/dist-test/', 'public/', '.astro/', 'node_modules/', 'playwright-report/', 'test-results/', 'data/'] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  ...astro.configs.recommended,
  {
    languageOptions: { globals: { ...globals.browser, ...globals.node } },
    rules: {
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
    },
  },
  // Playwright fixtures take an empty destructuring pattern when they need no other fixture.
  { files: ['tests/extension/**'], rules: { 'no-empty-pattern': 'off' } },
];
