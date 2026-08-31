import { resolve } from 'node:path'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vitest/config'

/**
 * Coverage policy (docs/ARCHITECTURE-TESTING-CICD.md §1.5):
 * money-path modules carry a hard per-file floor; everything else is reported
 * for information only. A global percentage is deliberately NOT a merge gate —
 * the closed invariant list is what actually protects the money path.
 */
const MONEY_MODULE_FLOOR = {
  lines: 95,
  branches: 95,
  functions: 95,
  statements: 95,
}

export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    setupFiles: ['./vitest.setup.ts'],
    globals: true,
    // The default 5s is a wall two files hit under the full suite and neither
    // hits alone: `vouchers/code.test.ts` (2000 rounds of crypto codes, 1.6s
    // solo) and `a11y/brand-contrast.test.ts` (scans all of src/, 0.8s solo).
    // Both are CPU-bound and 190 files compete for the same cores, so the red
    // moved between them run to run — a gate that fails on machine load says
    // nothing about the code. 30s still fails a genuinely hung test; it just
    // stops reporting "slow" as "broken".
    testTimeout: 30_000,
    // The wp-import pipeline is plain .mjs run by node, not by Next, so it
    // needs its own pattern. Without it the pipeline's tests exist but never
    // run, which is worse than having none. The seed data module is the same
    // shape and the same trap.
    include: [
      'src/**/*.test.ts',
      'src/**/*.test.tsx',
      'scripts/wp-import/**/*.test.mjs',
      'scripts/seed/**/*.test.ts',
    ],
    exclude: ['node_modules', '.next', 'e2e'],
    coverage: {
      provider: 'v8',
      reporter: ['text-summary', 'json-summary', 'lcov'],
      reportsDirectory: './coverage',
      // Only the money path is instrumented for floors. Including all of src
      // would let report noise drown the signal.
      include: [
        // The canonical money module CLAUDE.md makes mandatory for every money
        // calculation. It was absent from this list until 2026-08-20, so it
        // carried no floor and did not even appear in the report, while the
        // primitives it re-exports from ./commerce/money were floored at 95%.
        'src/lib/money.ts',
        'src/lib/commerce/**/*.ts',
        'src/lib/checkout/split.ts',
        'src/server/domain/orders/**/*.ts',
      ],
      exclude: ['**/*.test.ts', '**/*.test.tsx'],
      thresholds: {
        'src/lib/money.ts': MONEY_MODULE_FLOOR,
        'src/lib/commerce/money.ts': MONEY_MODULE_FLOOR,
        'src/lib/commerce/commission.ts': MONEY_MODULE_FLOOR,
        'src/lib/checkout/split.ts': MONEY_MODULE_FLOOR,
        'src/server/domain/orders/settlement.ts': MONEY_MODULE_FLOOR,
        'src/server/domain/orders/state-machine.ts': MONEY_MODULE_FLOOR,
      },
    },
  },
  resolve: {
    alias: {
      '@': resolve(__dirname, './src'),
      // See the stub for why. Short version: the real `server-only` resolves
      // only under the `react-server` condition, so every module carrying the
      // marker was untestable - not by policy, by resolution failure.
      'server-only': resolve(__dirname, './test/server-only-stub.ts'),
    },
  },
})
