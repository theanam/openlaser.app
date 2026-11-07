import js from '@eslint/js';
import svelte from 'eslint-plugin-svelte';
import globals from 'globals';
import ts from 'typescript-eslint';
import svelteConfig from './svelte.config.js';

export default ts.config(
  {
    ignores: [
      'dist',
      'dev-dist',
      'node_modules',
      'coverage',
      'test-results',
      'playwright-report',
      'openlaser-design',
      'packages/*/dist',
    ],
  },
  js.configs.recommended,
  ...ts.configs.recommended,
  ...svelte.configs.recommended,
  {
    languageOptions: { globals: { ...globals.browser, ...globals.node } },
    rules: {
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
      // State holds immutable values (sets and maps are replaced, never mutated), so the
      // reactive collection classes would add cost without changing behaviour.
      'svelte/prefer-svelte-reactivity': 'off',
    },
  },
  {
    // The app reaches libopenlaser through its four entry points; deeper paths are private.
    files: ['src/**/*.ts', 'src/**/*.svelte', 'tests/**/*.ts', 'scripts/**/*.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              regex: '^libopenlaser/[^/]+/',
              message: 'Import from a libopenlaser entry point, such as libopenlaser/machine.',
            },
          ],
        },
      ],
    },
  },
  {
    // The library stands alone: it never imports the app.
    files: ['packages/libopenlaser/src/**/*.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              regex: '^(\\$lib|\\$app|libopenlaser)(/|$)',
              message: 'libopenlaser never imports the app; use relative imports.',
            },
          ],
        },
      ],
    },
  },
  {
    files: ['**/*.svelte', '**/*.svelte.ts'],
    languageOptions: {
      parserOptions: {
        projectService: true,
        extraFileExtensions: ['.svelte'],
        parser: ts.parser,
        svelteConfig,
      },
    },
  },
);
