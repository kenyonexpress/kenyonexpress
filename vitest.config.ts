import { resolve } from 'node:path'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vitest/config'

/**
 * Coverage policy (docs/ARCHITECTURE-TESTING-CICD.md §1.5 and §6.5):
 * money-path modules carry a hard per-file floor, and the headless code
 * (`src/lib`, `src/server`) carries a global 80% line floor on top of it.
 * The closed invariant list is still what actually protects the money path;
 * the global floor is a ratchet so that new server code arrives with tests
 * rather than a promise of them.
 */
const MONEY_MODULE_FLOOR = {
  lines: 95,
  branches: 95,
  functions: 95,
  statements: 95,
}

/**
 * Global floor over the coverage `include` below. Lines only: branch and
 * function percentages on Supabase-backed actions are dominated by error
 * arms that a fake client can reach but a reader learns nothing from, and a
 * floor that invites tests written to move a number is worse than none.
 *
 * Measured on 2026-09-17 before the floor existed: 69.44% lines over the same
 * scope. The tests that lifted it are the `*-actions.test.ts` files next to
 * the server actions and the lib tests added in the same change.
 */
const HEADLESS_CODE_FLOOR = {
  lines: 80,
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
      'scripts/media-ingest/**/*.test.mjs',
      'scripts/seed/**/*.test.ts',
      'scripts/dr/**/*.test.mjs',
      'scripts/axiom/**/*.test.mjs',
      'scripts/uptimerobot/**/*.test.mjs',
      'scripts/deploy/**/*.test.mjs',
    ],
    exclude: ['node_modules', '.next', 'e2e'],
    coverage: {
      provider: 'v8',
      reporter: ['text-summary', 'json-summary', 'lcov'],
      reportsDirectory: './coverage',
      // The headless code: everything under src/lib and src/server. Pages,
      // layouts and components are deliberately NOT here; they are exercised
      // by Playwright, Lighthouse CI and Percy against a real build, and a
      // jsdom render count of them would be a number without a meaning.
      //
      // Until 2026-09-17 this list was the six money files only, so the
      // canonical money module could be (and once was) absent from it without
      // anyone noticing. Instrumenting the whole scope keeps that from
      // recurring: the money files are inside it and keep their own floors.
      include: ['src/lib/**/*.ts', 'src/server/**/*.ts'],
      exclude: ['**/*.test.ts', '**/*.test.tsx', '**/*.d.ts'],
      thresholds: {
        ...HEADLESS_CODE_FLOOR,
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
