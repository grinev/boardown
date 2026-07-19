import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import react from 'eslint-plugin-react';
import reactHooks from 'eslint-plugin-react-hooks';
import prettier from 'eslint-config-prettier';
import globals from 'globals';

export default tseslint.config(
  {
    ignores: ['**/dist/**', '**/node_modules/**', '**/*.d.ts', '**/coverage/**'],
  },
  js.configs.recommended,
  {
    files: ['packages/**/*.{ts,tsx}'],
    extends: [...tseslint.configs.recommendedTypeChecked],
    languageOptions: {
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
    rules: {
      '@typescript-eslint/no-unused-vars': ['error', { ignoreRestSiblings: true }],
      // Application source logs through @boardown/core's logger, never the
      // console: only the web dev shell installs a sink, so a shipped shell
      // cannot leak output. Build and dev scripts are .mjs and stay exempt —
      // their output is ordinary tool output.
      'no-console': 'error',
    },
  },
  {
    files: ['packages/**/*.test.{ts,tsx}'],
    rules: {
      // Mock FsAdapter implementations must be async to satisfy the interface.
      '@typescript-eslint/require-await': 'off',
    },
  },
  {
    files: ['packages/{web,ui,vscode,electron}/**/*.{ts,tsx}'],
    ...react.configs.flat.recommended,
    ...react.configs.flat['jsx-runtime'],
    languageOptions: {
      ...react.configs.flat.recommended.languageOptions,
      globals: {
        ...globals.browser,
      },
    },
    settings: {
      react: { version: '18' },
    },
  },
  {
    files: ['packages/{web,ui,vscode,electron}/**/*.{ts,tsx}'],
    plugins: { 'react-hooks': reactHooks },
    rules: reactHooks.configs.recommended.rules,
  },
  {
    files: ['packages/core/**/*.ts'],
    languageOptions: {
      globals: {
        ...globals.node,
      },
    },
  },
  {
    files: ['**/*.mjs'],
    languageOptions: {
      globals: {
        ...globals.node,
      },
    },
  },
  prettier,
);
