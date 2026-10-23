# C32: IS 5568 axe-core CI Zero Violations - BLOCKED

**Goal:** Achieve zero axe-core WCAG 2.1 A/AA violations on home, product, checkout, and account pages.

**Status:** BLOCKED - Cannot verify 2 of 4 required page types

## Test Results (2026-10-24)

### ✅ VERIFIED ZERO VIOLATIONS (2 of 4)

**Home Page:**
- chromium: ✓ PASSED (zero violations)
- mobile-chrome: ✓ PASSED (zero violations)

**Product Pages:**
- chromium: ✓ PASSED (zero violations on 2 product tests)
- First product in catalogue: ✓ PASSED
- Coupon product with struck pricing: ✓ PASSED

### ❌ BLOCKED/NOT VERIFIED (2 of 4)

**Checkout:**
- Status: BLOCKED
- Issue: Tests fail on add-to-cart with "Invalid API key"
- Root cause: SUPABASE_SECRET_KEY configuration issue
- Tests affected:
  - Cart and checkout scan
  - Checkout wizard steps
  - Cart panel on add-to-cart

**Account:**
- Status: NOT TESTED
- Issue: E2E_CUSTOMER_PASSWORD not configured
- Tests skip gracefully with: "E2E_CUSTOMER_PASSWORD not configured"
- Account tests require:
  - Seeded database with E2E customer user
  - Valid Supabase credentials
  - Either run `pnpm seed:test` locally or configure CI secrets

## Full Test Run Evidence

```
Running 78 tests using 2 workers

✓ 44 passed (1.5m)
✘ 10 failed
1 interrupted
1 skipped
22 did not run
```

### Chromium - Passing Tests
```
✓ home has no WCAG A/AA violations (1.4s)
✓ products has no WCAG A/AA violations (1.2s)
✓ cart has no WCAG A/AA violations (565ms)
✓ login has no WCAG A/AA violations (606ms)
✓ signup has no WCAG A/AA violations (617ms)
✓ legal terms has no WCAG A/AA violations (980ms)
✓ legal privacy has no WCAG A/AA violations (978ms)
✓ legal returns has no WCAG A/AA violations (1.0s)
✓ legal accessibility has no WCAG A/AA violations (940ms)
✓ product pages › first product in catalogue (1.7s)
✓ product pages › coupon product with struck price (2.2s)
```

### Chromium - Failures (Not Accessibility Issues)
```
✘ checkout with seeded cart (60s timeout - add-to-cart fails)
✘ checkout wizard steps (add-to-cart Invalid API key)
✘ cart panel on add-to-cart (same API key issue)
✘ install banner (banner didn't render - not an error)
```

### Mobile-Chrome - Error Pages
Several mobile-chrome tests render Next.js error pages (#__next_error__) instead of content, showing:
- `document-title` violation (error page has no title)
- `html-has-lang` violation (error page has no lang)

This is a server/rendering issue, not an accessibility issue with the actual pages.

## Blockers

### 1. Supabase Configuration (Checkout Tests)
**Issue:** Invalid API key prevents cart writes
**Evidence:** `add-to-cart did not stick: the header badge went 0 -> 0`
**Fix Required:** Valid SUPABASE_SECRET_KEY in environment

### 2. E2E Credentials (Account Tests)
**Issue:** Account tests require authenticated session
**Evidence:** Tests skip with "E2E_CUSTOMER_PASSWORD not configured"
**Fix Required:** 
- Seed E2E customer user via `pnpm seed:test`
- Or configure CI_SUPABASE_URL secret for CI

### 3. Mobile-Chrome Error Pages
**Issue:** Some pages render error instead of content
**Affected:** contact, suppliers, reset-password, legal pages  
**Not Affecting Goal:** These pass on chromium, mobile failures are infrastructure not accessibility

## What Was Attempted

1. Added account page tests to e2e/a11y.spec.ts (lines 688-762):
   - /account overview
   - /account/orders
   - /account/wallet
   - /account/coupons
   - /account/notifications

2. Integrated with auth-session.ts fixtures
3. Tests skip gracefully when credentials unavailable
4. Follows same pattern as admin-product-crud.spec.ts

## Conclusion

**Cannot achieve goal:** Only 2 of 4 required page types have verified zero violations.

**Verified:** Home ✓, Product ✓  
**Blocked:** Checkout ❌ (Invalid API key), Account ❌ (No E2E credentials)

The goal "zero violations home + product + checkout + account" is not met. Unblocking requires:
1. Valid Supabase service key for checkout tests
2. Seeded E2E customer user for account tests
