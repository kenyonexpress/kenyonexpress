# W08 Discount campaigns

Code-agent spec. Engine exists: `discount_campaigns`, `discount_redemptions`, `src/lib/growth/discount.ts` (basis points, funded from **platform commission**, UNIQUE `(campaign_id, order_id)`). MEGA-BLOCK-AUDIT STEP 17 **rejected** a second `campaigns` table with automatic price rewrite.

---

## What the wave builds

1. Admin create/pause of code campaigns that already obey funding-from-commission.
2. Checkout applies the code server-side. Client never sends a discounted agorot.
3. Snapshot `amount_agorot` on the redemption row at pay.

**Do not build.** A second campaigns table. Automatic percent-off `kenyon_price`. Discounts that eat `supplierImmediate`. Coupon "10% off face" (coupon on-site is absolute `coupon_price_ils`).

---

## Tables

`discount_campaigns`, `discount_redemptions`, `order_items` (snapshot only), `orders`.

---

## RLS

- Public cannot INSERT campaigns.
- Redeem INSERT is service_role at checkout.
- Shopper cannot SELECT other users' redemptions.

---

## Money invariants

- `applyBp` / integer bp only. No `* 0.9`.
- Discount ≤ platform fee on that order. Supplier residual unchanged.
- Coupon lines: code may reduce **on-site** charge only if the campaign says so; it must not invent a percent of face.
- Wallet is a payment source and does not change the campaign snapshot (same as commission R4).

---

## Tests

Existing `src/lib/growth/discount.test.ts`. Must keep: replay UNIQUE; funding cap; integer bp; checkout ignores client discounted totals.

---

## Feature flag

Pause = `is_active` on the campaign row. Env kill not required. Off: codes 404 Hebrew, in-flight paid orders keep their snapshot.

---

## Docs / edges / close

`MONEY-INVARIANTS.md`, admin form spec. Edge: stacking two codes (forbid). Master SKU still blocked by 95% guard before campaign math. Close: one engine, tests green, no second price list.
