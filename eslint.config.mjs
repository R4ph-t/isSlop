import js from '@eslint/js';
import globals from 'globals';

export default [
  {
    ignores: ['dist/**', 'node_modules/**']
  },
  js.configs.recommended,
  {
    files: ['**/*.js'],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'script',
      globals: {
        ...globals.browser,
        ...globals.webextensions
      }
    },
    rules: {
      'no-unused-vars': ['error', { argsIgnorePattern: '^_', caughtErrors: 'none' }],
      'no-empty': ['error', { allowEmptyCatch: true }]
    }
  },
  {
    files: [
      'engine.js',
      'finders.js',
      'scan-dom.js',
      'packs/*.js',
      'test.js',
      'test-dom.js',
      'scripts/*.js'
    ],
    languageOptions: {
      globals: {
        ...globals.node
      }
    }
  }
];
