import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import globals from 'globals';

const nondeterministic = [
  { selector: "CallExpression[callee.object.name='Math'][callee.property.name='random']", message: 'Determinism: use src/core/hash, not Math.random.' },
  { selector: "MemberExpression[object.name='Date'][property.name='now']", message: 'Determinism: no Date.now in core/gen/rules/sim.' },
  { selector: "NewExpression[callee.name='Date']", message: 'Determinism: no Date in core/gen/rules/sim.' },
  { selector: "MemberExpression[object.name='performance'][property.name='now']", message: 'Determinism: no performance.now in core/gen/rules/sim.' },
];

export default tseslint.config(
  { ignores: ['dist', 'dist-artifact', 'dev-dist', 'node_modules', 'playwright-report', 'test-results', '.claude'] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    languageOptions: { globals: { ...globals.browser, ...globals.node, ...globals.worker } },
    rules: {
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
    },
  },
  {
    files: ['src/core/**/*.ts', 'src/gen/**/*.ts', 'src/rules/**/*.ts', 'src/sim/**/*.ts'],
    rules: { 'no-restricted-syntax': ['error', ...nondeterministic] },
  },
);
