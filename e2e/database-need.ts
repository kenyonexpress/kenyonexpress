/**
 * WHICH SPECS NEED A DATABASE, AND WHICH ONLY LOOK LIKE THEY DO.
 *
 * The `e2e` job in CI has never run a single test. Its first step would be
 * `pnpm seed:test`, which WRITES fixture users and catalogue rows, and the only
 * database reachable from CI is production - so the job is guarded on
 * `secrets.CI_SUPABASE_URL`, the secret is unset, and it warns "E2E skipped",
 * skips, and reports SUCCESS. That guard is correct and must stay.
 *
 * What was wrong is the conclusion drawn from it: that no browser test can run.
 * Measured 2026-09-08 against a production build whose Supabase reads all fail
 * with `Invalid API key` - the exact condition CI's public demo key produces -
 * 191 specs passed. They render pages, check RTL and layout at three widths,
 * run axe, and read a catalogue that degrades to empty. None of them writes.
 *
 * So the specs are split. The ones below run with no database at all, on every
 * push, today, with nothing asked of anyone. The rest keep waiting for the
 * secret, and keep skipping honestly.
 *
 * NEITHER LIST MAY QUIETLY OMIT A FILE. A new spec that appears in neither is a
 * spec nothing runs, which is the failure this whole split exists to end -
 * `e2e-classification.test.ts` fails until it is named in one of them.
 */

/** Runs without a database. No sign-in, no seeded row, no write. */
export const NO_DATABASE_SPECS = [
  'a11y.spec.ts',
  'cart.spec.ts',
  'category.spec.ts',
  'checkout.spec.ts',
  'coupons.spec.ts',
  'home.spec.ts',
  'layout-stability.spec.ts',
  'price-bidi.spec.ts',
  'product.spec.ts',
  'region-menu.spec.ts',
  'render-mode.spec.ts',
  'rtl-mobile.spec.ts',
  'rtl-three-widths.spec.ts',
  'smoke-all-routes.spec.ts',
  'touch-targets.spec.ts',
] as const

/**
 * Needs a seeded database, a signed-in user, or both.
 *
 * Each says which, because "needs a database" is the sentence that kept the
 * other fifteen from running.
 */
export const NEEDS_DATABASE_SPECS = {
  'admin-product-crud.spec.ts': 'signs in as an admin and writes catalogue rows',
  'admin-refund.spec.ts': 'refunds a seeded order',
  'admin-refund-to-wallet.spec.ts': 'refunds a seeded order to a seeded wallet',
  'auth.spec.ts': 'signs in as the fixture customer',
  'coupon-scan.spec.ts': 'redeems a seeded voucher as a supplier',
  'full-purchase-redeem.spec.ts': 'buys, then redeems what it bought',
  'physical-purchase.spec.ts': 'places an order against the mock terminal',
  'production-smoke.spec.ts': 'runs against a deployed origin, not localhost',
  'purchase-flow.spec.ts': 'places an order against the mock terminal',
} as const
