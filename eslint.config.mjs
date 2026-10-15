import js from '@eslint/js';
import globals from 'globals';
import tseslint from 'typescript-eslint';
export default [
  {
    ignores: [
      'node_modules/**',
      'package/**',
      'dist/**',
      'artifacts/**',
      '.go-defaults-build-*/**',
      '**/.tmp/**',
      '**/temp/**'
    ]
  },
  {
    files: ['**/*.{js,cjs,mjs}'],
    ...js.configs.recommended,
    languageOptions: { ecmaVersion: 'latest', globals: globals.node }
  },
  {
    files: ['**/*.{js,cjs,mjs}'],
    rules: { 'no-unused-vars': ['error', { argsIgnorePattern: '^_', caughtErrorsIgnorePattern: '^_' }] }
  },
  { files: ['**/*.{js,cjs}'], languageOptions: { sourceType: 'commonjs' } },
  ...tseslint.configs.recommended.map((config) => ({ ...config, files: ['**/*.{ts,cts,mts}'] })),
  { files: ['test/consumers/browser.test.cjs'], languageOptions: { globals: globals.browser } },
  // CommonJS declaration imports preserve exact runtime function identities.
  {
    files: ['**/*.{ts,cts,mts}'],
    rules: { '@typescript-eslint/no-require-imports': ['error', { allowAsImport: true }] }
  },
  // These fixtures read fields solely to exercise expected compiler diagnostics.
  { files: ['test/**/*.{cts,mts}'], rules: { '@typescript-eslint/no-unused-expressions': 'off' } },
  // keyof Object deliberately models inherited prototype members rather than the object primitive.
  {
    files: ['types/_merge.d.cts', 'test/types/prototype-fallback.cts'],
    rules: { '@typescript-eslint/no-wrapper-object-types': 'off' }
  },
  // Function is used only to reject every callable/constructor input, not as a callable API signature.
  {
    files: ['types/_merge.d.cts', 'types/defaultsFor.d.cts'],
    rules: { '@typescript-eslint/no-unsafe-function-type': 'off' }
  },
  // Negative fixtures intentionally use unsound inputs and declarations model arbitrary callbacks.
  {
    files: ['test/**/*.{ts,cts,mts}', 'types/**/*.{ts,cts,mts}'],
    rules: {
      '@typescript-eslint/no-explicit-any': 'off',
      '@typescript-eslint/no-unused-vars': 'off',
      '@typescript-eslint/ban-ts-comment': 'off',
      '@typescript-eslint/no-empty-object-type': 'off'
    }
  }
];
