import tseslint from '@electron-toolkit/eslint-config-ts';
import eslintConfigPrettier from '@electron-toolkit/eslint-config-prettier';
import eslintPluginReact from 'eslint-plugin-react';
import eslintPluginReactHooks from 'eslint-plugin-react-hooks';
import eslintPluginReactRefresh from 'eslint-plugin-react-refresh';

export default tseslint.config(
  { ignores: ['**/node_modules', '**/dist', '**/out'] },
  tseslint.configs.recommended,
  eslintPluginReact.configs.flat.recommended,
  eslintPluginReact.configs.flat['jsx-runtime'],
  {
    settings: {
      react: {
        // Pinned explicitly instead of 'detect': eslint-plugin-react's version
        // auto-detection calls the removed context.getFilename() API and crashes
        // under ESLint 10. Keep in sync with the installed react version.
        version: '19.2',
      },
    },
  },
  {
    files: ['**/*.{ts,tsx}'],
    plugins: {
      'react-hooks': eslintPluginReactHooks,
      'react-refresh': eslintPluginReactRefresh,
    },
    rules: {
      ...eslintPluginReactHooks.configs.recommended.rules,
      ...eslintPluginReactRefresh.configs.vite.rules,
      // ── react plugin rule tuning (must live here — this block registers the
      // react-hooks / react-refresh plugins). The ESLint 10 + react-hooks 7
      // upgrade added a batch of new opinionated rules the existing codebase
      // predates; demote them to warnings so they surface without blocking the
      // build. rules-of-hooks / exhaustive-deps stay at their defaults.
      'react-refresh/only-export-components': 'warn', // dev-only fast-refresh hint
      'react-hooks/refs': 'warn',
      'react-hooks/set-state-in-effect': 'warn',
      'react-hooks/immutability': 'warn',
      'react-hooks/purity': 'warn',
      'react-hooks/preserve-manual-memoization': 'warn',
      'react-hooks/static-components': 'warn',
    },
  },
  eslintConfigPrettier,
  // ── Core / TypeScript rule tuning (applies repo-wide) ────────────────────────
  // Disable purely-stylistic rules the codebase never adopted, and relax a few
  // opinionated ones. Genuine correctness rules (no-unused-vars, rules-of-hooks,
  // prettier, …) stay as errors.
  {
    files: ['**/*.{ts,tsx,js,jsx,mjs,cjs}'],
    rules: {
      // Pure style — the codebase relies on inferred return types everywhere.
      '@typescript-eslint/explicit-function-return-type': 'off',
      '@typescript-eslint/explicit-module-boundary-types': 'off',
      // Intentional best-effort empty catch blocks (offline fallbacks, etc.).
      'no-empty': ['error', { allowEmptyCatch: true }],
      // Opinionated; informative but shouldn't fail the build on legacy code.
      '@typescript-eslint/no-explicit-any': 'warn',
    },
  },
  // ── CommonJS build scripts ──────────────────────────────────────────────────
  // Packaging and release tooling that Node loads as CommonJS: electron-builder
  // resolves its hooks with require(), and these scripts run outside any bundler.
  // require() is the only import form available to them.
  {
    files: ['**/*.cjs', 'scripts/**/*.js', 'ws-server/scripts/**/*.js'],
    rules: {
      '@typescript-eslint/no-require-imports': 'off',
    },
  },
);
