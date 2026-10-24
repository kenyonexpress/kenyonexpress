# C34: Playwright 2 Consecutive Green Runs

## Goal
Run Playwright E2E tests twice consecutively and achieve all green (passing) results at viewport widths 380/768/1440 on both chromium and webkit browsers.

## Configuration Changes
Modified `playwright.config.ts` to add 6 test projects:
- chromium-380 (380×800)
- chromium-768 (768×1024)  
- chromium-1440 (1440×900)
- webkit-380 (380×800)
- webkit-768 (768×1024)
- webkit-1440 (1440×900)

## Test Strategy
Per `e2e/database-need.ts`, E2E specs are split into two categories:

### NO_DATABASE_SPECS (19 files)
Tests that run without any database, no sign-in, no seeded rows, no writes:
- a11y.spec.ts
- cart.spec.ts
- category.spec.ts
- checkout.spec.ts
- coupons.spec.ts
- dark-mode-ux30.spec.ts
- dialog-ux29.spec.ts
- home.spec.ts
- keyboard-navigation.spec.ts
- layout-stability.spec.ts
- mobile-gestures.spec.ts
- mobile-shell.spec.ts
- price-bidi.spec.ts
- product.spec.ts
- render-mode.spec.ts
- rtl-mobile.spec.ts
- rtl-three-widths.spec.ts
- smoke-all-routes.spec.ts
- touch-targets.spec.ts

### NEEDS_DATABASE_SPECS (10 files - EXCLUDED)
Tests requiring seeded DB or authenticated sessions - excluded due to infrastructure blockers:
- admin-product-crud.spec.ts
- admin-refund.spec.ts  
- admin-refund-to-wallet.spec.ts
- auth.spec.ts
- coupon-scan.spec.ts
- full-purchase-redeem.spec.ts
- guest-upgrade.spec.ts
- physical-purchase.spec.ts
- production-smoke.spec.ts
- purchase-flow.spec.ts

## Known Infrastructure Blockers
1. Production DB is the only accessible DB (no test fixture DB available)
2. Meilisearch env vars are masked as [SENSITIVE]
3. Some DB functions have permission errors (fn_record_recent_search)
4. Full suite (all 30 specs × 6 projects = 2118 tests) hits resource limits

## Execution Plan
1. Run NO_DATABASE_SPECS only (19 specs × 6 projects)
2. Execute twice consecutively
3. Verify all tests pass (green)
4. Save results to test-results/
5. Document outcome

## Environment
- E2E_WEB_COMMAND=pnpm start (production build)
- E2E_WORKERS=2 (to avoid DB contention)
- E2E_FORWARDED_FOR_PREFIX=10.44.110.X (fresh IP per worker to avoid rate limits)
- Production build required per playwright.config.ts comment: "dev and prod differ on RTL, caching and server actions"
