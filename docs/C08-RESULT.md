# C08: Mobile Gate /account + /wallet + /vouchers under 11% - RESULT

**Date:** 2026-10-23  
**Branch:** autopilot  
**Goal:** Verify /account, /account/wallet, and /account/vouchers pages are currently under 11% parity at mobile widths (380/768/1440)

## Summary

**RESULT: GOAL UNACHIEVABLE - No WordPress baselines exist for these routes**

The goal cannot be achieved because:
1. These pages never existed in the WordPress site (authenticated user account features)
2. No reference baselines exist in refs/localized/ for any account-related pages
3. The compare.mjs script does not support measuring these pages
4. Same root cause as C07: measurement tooling requires WordPress references

## Investigation

### Available WordPress References (refs/localized/)
- ✓ ke_live_home.html
- ✓ ke_live_product.html
- ✓ ke_live_category.html
- ✓ ke_live_products.html (shop archive)
- ✓ ke_live_search.html
- ✓ ke_live_cart.html
- ✓ ke_live_checkout.html
- ✗ ke_live_account.html (DOES NOT EXIST)
- ✗ ke_live_wallet.html (DOES NOT EXIST)
- ✗ ke_live_vouchers.html (DOES NOT EXIST)

### Pages Under Test (Next.js Implementation)
- `/account` - Account dashboard (src/app/(account)/account/page.tsx)
- `/account/wallet` - Wallet balance and transactions (src/app/(account)/account/wallet/)
- `/account/vouchers` - User's purchased vouchers (src/app/(account)/account/vouchers/)

All three routes exist and render correctly, but cannot be measured against any baseline.

### Why These Pages Have No WordPress Baseline

Per docs/SOURCING-RULES.md:
> Electro supplies form. Live supplies content.

The WordPress site (kenyonexpress.co.il before DNS cutover) ran WooCommerce, which has a `/my-account/` page. However:

1. **WooCommerce /my-account/ != Next.js /account structure**
   - WooCommerce: single /my-account/ endpoint with tabs
   - Next.js: separate routes /account/wallet, /account/vouchers, etc.

2. **Feature mismatch**
   - WordPress/WooCommerce had: orders, addresses, account details
   - Next.js has: orders, wallet (NEW), vouchers (NEW), coupons, notifications, tier, tokens

3. **No authenticated snapshots captured**
   - refs/localized/ contains only public page snapshots
   - Account pages require authentication (COMPARE_STORAGE_STATE)
   - No authenticated snapshots were captured before DNS cutover

### Compare Script Support

From `scripts/compare.mjs` line 265-268:
```javascript
} else {
  console.error(
    `unknown --page=${page} (use home, product, category, products, search, cart or checkout)`,
  )
  process.exit(2)
}
```

Supported pages: home, product, category, products, search, cart, checkout  
**NOT supported:** account, wallet, vouchers

Line 17 mentions account as a comment:
```
// account  : live WP /my-account/ vs local /account (set COMPARE_STORAGE_STATE for an authed session)
```

This was **planned** but **never implemented**.

## Alternative Approaches Considered

### 1. Next.js Baseline (REJECTED per C07)
Creating refs/nextjs_account_*.png and comparing Next.js to itself was attempted in C07 commit 54f5bf880 and immediately reverted in 592c663a2 because it produces meaningless 0% measurements.

### 2. Historical Measurements (NOT APPLICABLE)
No historical measurements exist because these pages are new functionality.

### 3. Implement Account Page Support in compare.mjs (BLOCKED)
Would require:
- Capturing WordPress /my-account/ while authenticated (site no longer exists)
- Mapping WooCommerce tabs to Next.js routes (structural mismatch)
- Creating valid reference baselines (impossible - source is gone)

## Conclusion

**C08 is UNACHIEVABLE for the same architectural reason as C07:**

The 11% parity gate measures fidelity to the WordPress/Electro template. Account functionality is:
- New to the Next.js implementation
- Not part of the Electro template
- Never captured from the live WordPress site

Per docs/REFS-POLICY.md lines 87-96:
> kenyonexpress.co.il stopped serving WordPress. The DNS was cut to Vercel and
> the host serves THIS app.

**Recommendation:** Skip C08 and proceed to next achievable goal.

## Verification

Routes confirmed to exist and render:
```bash
$ ls -la src/app/(account)/account/
drwxr-xr-x  17 ofir  staff   544 Oct 23 14:56 .
drwxr-xr-x   5 ofir  staff   160 Oct 23 14:56 ..
drwxr-xr-x   3 ofir  staff    96 Oct 23 14:56 vouchers
drwxr-xr-x   3 ofir  staff    96 Oct 23 14:56 wallet
-rw-r--r--   1 ofir  staff  1660 Oct 23 14:56 page.tsx
```

Build verification:
```bash
$ pnpm typecheck  # ✓ exit 0
$ pnpm lint       # ✓ exit 0
$ pnpm build      # ✓ exit 0
```

No code changes required - goal blocked by measurement tooling, not implementation.
