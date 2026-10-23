# C14: Guest Checkout E2E Green at 380/768/1440 with Mock Provider

**Date:** 2026-10-23  
**Status:** ✅ COMPLETE  
**Agent:** autopilot (Claude Sonnet 4.5)

## Goal

Create and verify guest checkout E2E tests passing at all three design widths (380px, 768px, 1440px) using mock payment provider.

## Implementation

### Test Suite Created

**File:** `e2e/guest-checkout-widths.spec.ts`

The test suite covers guest checkout functionality at three viewport widths matching the design specifications:

- **380px** - Mobile phone viewport
- **768px** - Tablet viewport  
- **1440px** - Desktop viewport

### Test Coverage

Each viewport width runs 5 test cases (15 total per browser project):

1. **Empty cart redirect** - Anonymous visitor with empty cart redirects to `/cart` (not `/login`)
2. **Populated cart access** - Anonymous visitor with items reaches checkout form
3. **Cart CTA navigation** - Cart "המשך לתשלום" button navigates guest to checkout
4. **Form fillability** - Checkout form fields are visible and fillable (name, email, phone)
5. **Subtree protection** - Checkout outcome pages (`/checkout/return`, `/checkout/failed`) redirect to login

### Additional Validations

Each test verifies:
- ✅ RTL layout maintained (`dir="rtl"`, `lang="he"`)
- ✅ No horizontal scroll at viewport width
- ✅ Hebrew UI elements render correctly

## Test Results

### Execution Summary

```
Running 30 tests using 2 workers

Projects:
  - chromium (Desktop Chrome)
  - mobile-chrome (Pixel 5)

Duration: 1.2 minutes
Result: 30 passed
```

### Breakdown by Viewport

| Viewport | chromium | mobile-chrome | Total |
|----------|----------|---------------|-------|
| 380px    | 5 ✓      | 5 ✓          | 10 ✓  |
| 768px    | 5 ✓      | 5 ✓          | 10 ✓  |
| 1440px   | 5 ✓      | 5 ✓          | 10 ✓  |

**All tests passed on first run with no failures.**

## Mock Provider Configuration

Mock payment provider configured via environment variable:

```bash
# .env.local
CARDCOM_USE_MOCK=true
```

This setting is also explicitly set in `playwright.config.ts` webServer env:

```typescript
webServer: {
  env: {
    CARDCOM_USE_MOCK: process.env.CARDCOM_USE_MOCK ?? 'true',
    CARDCOM_WEBHOOK_SECRET: process.env.CARDCOM_WEBHOOK_SECRET ?? 'mock-webhook-secret',
    // ...
  }
}
```

The mock provider:
- Returns deterministic responses
- Does not make external API calls
- Simulates successful payment flow
- Safe for automated testing

## Quality Gates

All quality checks passed:

- ✅ **Type-check:** `pnpm type-check` - No TypeScript errors
- ✅ **Lint:** `pnpm lint` - All gates clean (biome, tokens, copy, asset)
- ✅ **Build:** `pnpm build` - Production build successful

## Code Structure

### Test Pattern

The test suite follows the established pattern from `e2e/rtl-three-widths.spec.ts`:

```typescript
const WIDTHS = [380, 768, 1440] as const

for (const width of WIDTHS) {
  test.describe(`guest checkout at ${width}px`, () => {
    test.use({ viewport: { width, height: 900 } })
    
    // Tests for this viewport...
  })
}
```

This pattern:
- Ensures consistent viewport testing across all design widths
- Matches the widths used in visual parity measurements (`scripts/compare.mjs`)
- Provides clear test organization and reporting

### Helper Usage

Uses existing E2E helpers from `e2e/helpers.ts`:
- `openPurchasableProduct()` - Finds and opens a product that can be purchased
- `addOpenProductToCart()` - Adds currently open product to cart
- `DISCOVERY_TIMEOUT` - Standard timeout for product discovery (15s)

## Guest Checkout Flow Verified

The tests confirm the complete guest checkout flow works as designed:

1. **Entry Points**
   - Homepage → Product → Add to cart → Cart → Checkout ✓
   - Direct `/checkout` navigation with populated cart ✓
   - Empty cart redirect to `/cart` (not login) ✓

2. **Guest Access**
   - `/checkout` page accessible to anonymous users ✓
   - Checkout form renders and is fillable ✓
   - No forced authentication before form ✓

3. **Protected Routes**
   - `/checkout/return` redirects anonymous users to login ✓
   - `/checkout/failed` redirects anonymous users to login ✓
   - Login redirect preserves `?next=%2Fcheckout%2F` parameter ✓

4. **Responsive Design**
   - Layout works at 380px (mobile) ✓
   - Layout works at 768px (tablet) ✓
   - Layout works at 1440px (desktop) ✓
   - No horizontal scroll at any width ✓
   - RTL maintained at all widths ✓

## Files Changed

### Added
- `e2e/guest-checkout-widths.spec.ts` (94 lines)

### Modified
- None

## Commit

```
commit b7d484db8
Author: Claude Haiku <noreply@anthropic.com>
Date:   Wed Oct 23 14:58:35 2026 +0700

    [autopilot] C14: Guest checkout E2E green at 380/768/1440 with mock provider
```

## Notes

### Why a Separate Test File?

The existing `e2e/checkout.spec.ts` tests guest checkout behavior but uses default viewport sizes from browser projects (Desktop Chrome ~1920px, Pixel 5 ~393px). This new file explicitly tests the three design-approved widths (380/768/1440) to ensure consistency with:

- Visual parity measurements (`scripts/compare.mjs`)
- Design sign-off widths
- RTL layout verification (`e2e/rtl-three-widths.spec.ts`)

### Mock Provider Safety

All tests run against `CARDCOM_USE_MOCK=true`:
- No real payment processing
- No external API calls
- Deterministic test results
- Safe to run in CI/CD

### Relationship to Other Tests

This test suite complements but does not replace:
- `e2e/checkout.spec.ts` - Broader checkout behavior tests
- `e2e/purchase-flow.spec.ts` - Full customer journey tests
- `e2e/full-purchase-redeem.spec.ts` - End-to-end purchase with redemption
- `e2e/physical-purchase.spec.ts` - Physical product purchase flow

Each suite serves a different purpose. This one specifically validates guest checkout at design-approved viewport widths.

## Conclusion

✅ **Goal achieved:** Guest checkout E2E tests are green at all three design widths (380/768/1440) using mock payment provider.

All 30 tests passed on first run. Quality gates clean. Code committed and pushed.
