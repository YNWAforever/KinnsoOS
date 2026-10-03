import js from '@eslint/js'
import tseslint from 'typescript-eslint'

/**
 * Repo-wide lint pass.
 *
 * `turbo run lint` resolves to exactly one real task (web#lint), so before this config the
 * two service-role-wielding workers, the e2e harness, the root scripts and all four
 * packages were never linted at all. This config covers everything turbo does not, and the
 * root `lint` script runs both.
 *
 * The rule set is deliberately small and syntax-only (no type-aware program, which would
 * need a tsconfig covering root scripts that no workspace owns). It is scoped to real
 * defects — unused bindings, unreachable or duplicated code, shadowed built-ins — not
 * style. A lint that has to be argued with on every PR gets disabled, and a disabled lint
 * catches nothing.
 */
export default tseslint.config(
  {
    ignores: [
      // apps/web brings its own flat config (eslint-config-next) and its own lint script,
      // which `turbo run lint` still runs. Linting it twice, under two rule sets, would
      // report conflicting results for the same file.
      'apps/web/**',
      'apps/journeys/**',
      '.local-private/**',
      '.superpowers/**',
      'tooling-tests/**',
      '**/node_modules/**',
      '**/.next/**',
      '**/.turbo/**',
      '**/dist/**',
      '**/out/**',
      '**/playwright-report/**',
      '**/test-results/**',
      // Generated from the live schema by `supabase gen types`; not hand-edited.
      'packages/db/types.ts',
      // Pre-cutover reference material and exported automation definitions, kept verbatim.
      'legacy/**',
      'n8n/**',
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    languageOptions: {
      parserOptions: { ecmaVersion: 'latest', sourceType: 'module' },
    },
    rules: {
      // Warn, matching how apps/web's own config already reports this: an unused binding
      // is worth surfacing but is never a reason to block a merge, and the pass has to
      // stay green on the code that exists today or it will simply be turned off.
      '@typescript-eslint/no-unused-vars': ['warn', {
        argsIgnorePattern: '^_',
        varsIgnorePattern: '^_',
        caughtErrors: 'none',
      }],
      // `any` is a typing decision the tsconfig owns; flagging it here only produces noise
      // in the fixture and adapter code that deliberately models untyped upstream payloads.
      '@typescript-eslint/no-explicit-any': 'off',
      'no-console': 'off',
      eqeqeq: ['error', 'always', { null: 'ignore' }],
      'no-var': 'error',
      'prefer-const': 'error',
    },
  },
  {
    // typescript-eslint switches `no-undef` off for .ts (the compiler owns that check),
    // but plain CommonJS tooling files still need the Node globals declared or every
    // `module`/`process` reference reads as undefined.
    files: ['**/*.cjs'],
    languageOptions: {
      sourceType: 'commonjs',
      globals: {
        __dirname: 'readonly',
        __filename: 'readonly',
        console: 'readonly',
        module: 'writable',
        process: 'readonly',
        require: 'readonly',
      },
    },
  },
)
