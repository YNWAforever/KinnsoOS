import tseslint from 'typescript-eslint';
import reactHooks from 'eslint-plugin-react-hooks';

// Syntax-only checks cover application code, scripts and tests without a backend
// or generated database types. Keep the existing unused bindings in ESLint's
// per-file count baseline; additional unused bindings must fail `pnpm lint`.
export default tseslint.config(
  {
    ignores: [
      '.next/**',
      'out/**',
      'build/**',
      'next-env.d.ts',
      'public/source/**',
      '**/node_modules/**',
    ],
  },
  ...tseslint.configs.recommended,
  {
    plugins: { 'react-hooks': reactHooks },
    rules: {
      'react-hooks/rules-of-hooks': 'error',
      'react-hooks/exhaustive-deps': 'warn',
      '@typescript-eslint/no-unused-vars': ['error', {
        argsIgnorePattern: '^_',
        varsIgnorePattern: '^_',
        caughtErrors: 'none',
      }],
      // Match the root syntax-only pass; TypeScript owns these typing decisions.
      '@typescript-eslint/no-explicit-any': 'off',
    },
  },
);
