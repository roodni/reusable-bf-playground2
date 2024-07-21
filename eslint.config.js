import globals from 'globals';
import js from '@eslint/js';
import solid from 'eslint-plugin-solid/configs/typescript.js';
import * as tsParser from '@typescript-eslint/parser';

export default [
  js.configs.recommended,
  {
    files: ['**/*.{ts,tsx,js}'],
    ...solid,
    languageOptions: {
      parser: tsParser,
      parserOptions: {
        project: 'tsconfig.json',
      },
      globals: {
        ...globals.browser
      }
    },
    rules: {
      'semi': ['error', 'always'],
      'quotes': ['error', 'single']
    }
  },
];