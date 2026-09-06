# Edge cases

Failure and race scenarios with the **expected** behaviour. Integer agorot. Snapshotted `platform_percent` on `order_items` is never rewritten to "fix" a later catalogue change. No escrow.

Status: binding for this worktree. Docs only.

Companions:

```
docs/DATA-CONTRACTS.md
docs/ROLE-JOURNEYS.md
docs/VOUCHER-LIFECYCLE.md
docs/ARCHITECTURE-CART-CHECKOUT.md
docs/ARCHITECTURE-PAYMENT-RECONCILIATION.md
docs/COPY-HE.md
```

Customer copy lives in COPY-HE. This file owns control flow.

---

## 1. Payment succeeds at Cardcom, webhook is lost

**What happened.** Low Profile / iframe captured money. `orders.status` still `pending`. No vouchers. Customer may sit on `/checkout/return` spinning.

**Expected.**

1. `/checkout/return` (and Indicator) polls `GetLpResult` / server finalize. Do **not** tell the customer they were not charged.
2. Cron / reconcile (`/api/cron/reconcile` when wired) finds Cardcom succeeded + order pending and **replays finalize** (idempotent). Same voucher set as a later webhook would have minted.
3. Ops: `reconciliation_gap` / Axiom if still pending after the job. Admin runbook: replay, do not capture a second charge.
4. Cart: may still hold lines until finalize clears it. Failed-page copy (`העגלה שלך נשמרה`) is for **failed** charges, not this case.

**Forbidden.** Minting a second order. Refunding "because we did not see a webhook". Showing English Cardcom errors.

---

## 2. Duplicate webhook

**What happened.** Cardcom delivers the same success five times.

**Expected.**

1. `payment_webhook_events` unique / idempotency on provider event + payment id. Second delivery returns **200** (so Cardcom stops) without a second `paid` transition.
2. Voucher issue is keyed on `order_item_id` + quantity cap. Five webhooks → one set of codes (`UNIQUE(code)` backstop).
3. `notification_outbox` for `voucher_issued` / `order_paid` is deduped on the event; the customer gets one mail.

**Forbidden.** 500 on the duplicate (that retriggers). A second QR email. Double `commission_agorot`.

---

## 3. Voucher scanned twice

**What happened.** Same `{code}` presented again (screenshot, two cashiers, retry).

**Expected.**

1. `redeem_voucher()` `UPDATE … WHERE status = 'issued'`. Second attempt: `already_redeemed`.
2. Copy: `השובר כבר מומש`. Do not collect remainder again.
3. Idempotency_key: an in-flight double tap returns the **first** result, not a new redeem.
4. `voucher_redemptions` records the second outcome. Customer screen already non-presentable (no QR).

**Forbidden.** Un-redeem. A success toast on the second scan. Leaking another supplier's history.

---

## 4. Voucher scanned after expiry

**What happened.** `expires_at` is in the past. Column may still be `issued` until `expire_vouchers` cron.

**Expected.**

1. Scan path answers from the **clock**, not only the column. Outcome `expired`. Copy: `תוקף השובר פג`.
2. Customer `/coupon/{id}` hides QR when the clock is past (same rule).
3. Cron later sets `expired`. Both states are terminal. No reactivation.

**Forbidden.** Honoring a valid HMAC after `e` / `expires_at`. Showing offer-end `offer_valid_until` as if it extended the voucher.

---

## 5. Product deleted while in cart

**What happened.** Admin soft-deletes or archives a SKU. Guest still has the line.

**Expected.**

1. Cart re-price marks the line unavailable (Hebrew `unavailableMessage`). Checkout CTA `aria-disabled` + `preventDefault`.
2. `beginCheckout` refuses the line. Copy not "empty cart" unless every line is gone.
3. Paid `order_items.product_id` may later SET NULL. Snapshot money **stays**. Historical orders still list the frozen name/price.

**Forbidden.** `DELETE` cascade that drops `order_items`. Silently dropping the line and charging the rest without notice. Clearing the **whole** cart because one SKU died (a past bug: failed catalogue read must not empty carts).

---

## 6. Price changed while in cart

**What happened.** Uploader edits `kenyon_price` / coupon price after add-to-cart.

**Expected.**

1. Cart is not a contract. Server re-prices on cart view and at `beginCheckout`.
2. If the new price differs, show the **current** `{price}` or mark unavailable if the product is no longer sellable (coupon price removed).
3. After pay, `order_items` unit/total and agorot columns are the charged snapshot. Later catalogue edits do not rewrite them.
4. `platform_percent` change is the same idea: cart/checkout uses **live** percent to snapshot **now**; old orders keep the old snapshot (DATA-CONTRACTS §1).

**Forbidden.** Charging the stale cart number without a refresh. Rewriting paid lines to the new sticker.

---

## 7. Stock hits zero at checkout

**What happened.** Two customers; last unit reserved/sold between ATC and pay.

**Expected.**

1. Atomic reservation RPC (not app-level SELECT FOR UPDATE). Loser: stock 0, ATC/checkout refuse. Copy: `אזל מהמלאי` / line unavailable.
2. Winner: reservation tied to the order; released on failed/expired pending payment.
3. Coupon caps (`max_per_order` / quota) fail the same way, not with a partial issue of vouchers.

**Forbidden.** Overselling then emailing "we will sort it". A succeeded Cardcom charge **without** stock: treat as §1-class incident (refund or manual), not a silent extra voucher.

---

## 8. Partial refund

**What happened.** Admin refunds part of `paid_on_site` in agorot (`partialAmountIls` in the action, converted through money.ts).

**Expected.**

1. Partial refund is **not** a cancellation. No 14-day cancellation fee on that path (`refund.ts`: partial cannot be a cancel).
2. Money: refunded agorot ≤ remaining refundable. Cardcom credit. `refunds` row. `refund_completed` email with `{price}`, **no** bank arrival date. Fee line omitted when fee is 0.
3. Coupon: if still `issued`, remaining value policy is explicit (void leftover vs keep). A **redeemed** coupon cannot be un-scanned; partial refund of prepaid is goodwill / defect ground, not "half a QR".
4. Physical: restock only if the unit actually returns; snapshot percent unchanged.

**Forbidden.** `Math.round` on ILS floats. Applying the change to `products.platform_percent`. Cancelling the whole order because a partial was requested.

---

## 9. Supplier deactivated with live vouchers

**What happened.** Supplier soft-deleted / memberships disabled. Customers still hold `issued` vouchers.

**Expected.**

1. Public `/s/{id}` → 404. New catalogue hidden.
2. **Issued vouchers remain redeemable** at the till if a scanner membership (or admin-assisted scan) still exists, **or** support refunds prepaid if the business is truly gone.
3. Do not expire every voucher as a side effect of `suppliers.deleted_at`. Expiry is `expires_at` / cron only.
4. Scanner with `is_active = false` gets `אין הרשאת ספק`. Admin can still operate `redeem_voucher` / refund.

**Forbidden.** Mass-expire as deactivation. Keeping the supplier page live with "no products" if the supplier is not allowed to sell (404 vs empty is DATA-CONTRACTS: inactive → notFound).

---

## 10. User deletes account with unredeemed vouchers

**What happened.** Customer runs delete-account (typed confirm).

**Expected.**

1. Profile anonymised (email/name/phone). `auth` user gone or disabled.
2. **Financial rows retained**: orders, payments, invoices, `order_items` snapshots, vouchers (law + disputes).
3. Unredeemed vouchers: still `issued` until expiry. Access to `/coupon/{id}` requires a session, so the holder **loses the app screen**. Support must be able to retrieve `{code}` from the retained row for a till or refund.
4. Wallet: no cash-out. Remainder stays internal or is forfeited per legal copy; do not transfer to another user.
5. Copy: privacy page, not "everything vanished".

**Forbidden.** `ON DELETE CASCADE` that wipes `vouchers` or `orders`. Emailing the QR to a now-deleted inbox without a policy. Showing another customer's codes in admin without audit.

---

## 11. Clock skew on expiry

**What happened.** Phone clock, cashier tablet, and Postgres `now()` disagree. Cron lag leaves `status = issued` after `expires_at`.

**Expected.**

1. **Server clock** (`now()` in `redeem_voucher` and in `couponStatusView` with an injected now in tests) is authoritative.
2. Presentable QR uses the same comparison. A phone showing "still valid" while the server says expired: till sees `תוקף השובר פג`.
3. HMAC field `e` (unix expiry) must not override a later DB `expires_at` tightening; the DB min(rolling, offer) wins.
4. Cron `expire_vouchers` is cleanup, not the only guard.

**Forbidden.** Trusting `Date.now()` in the browser to hide/show QR as the only check. Accepting a scan because the cashier's device is a day behind.

---

## 12. Network drop mid QR scan

**What happened.** Camera decoded the payload; `POST /api/supplier/vouchers/redeem` never got a 200. Or 200 never reached the tablet.

**Expected.**

1. If the UPDATE committed: voucher is `redeemed`. Retry with same idempotency_key returns success (or already_redeemed) **without a second collect**. Cashier copy must allow "already מומש" as the happy retry.
2. If the UPDATE did not commit: voucher still `issued`. Retry succeeds once. Customer still shows QR.
3. Customer app does not flip to redeemed on a client timeout. It refreshes from the server.
4. Offline: no local "mark used" cache that can desync. Manual code entry is the fallback (`לא ניתן לגשת למצלמה`).

**Forbidden.** A client-only redeemed flag. A second cash collection because the first response was lost.

---

## 13. Related cases (same invariants)

| Case | Expected |
|---|---|
| Webhook 200 on a **failed** verify (historical bug) | Must not ack; Cardcom must retry. Never finalize on a bad signature |
| Catalogue read fails | Do not empty the cart; fail loudly |
| OTP login duplicates a cart line | Merge by product+variant, do not hide the row forever |
| Mixed coupon+physical, stock fail on physical only | Refuse the checkout or drop with explicit unavailable lines; do not charge coupon prepaid while hiding the physical miss |
| Wallet clamp > payable | Throw / refuse; `walletApplied > customerPaysNow` is illegal |
| Partial webhook (paid but mail drain down) | Money and vouchers first; email retries via outbox. Customer can open `/account/coupons` |
| QR HMAC valid, wrong supplier | `not_found` / `wrong_supplier` to that cashier, not a stack trace |
| `platform_percent` NULL at checkout | Line unsellable. No 0% gift |
| Admin "fix" percent on an old order | **Denied.** New product value is future-only |
| Escrow language in a template | Denied. `escrow_held_agorot` stays 0 |
| Compare.mjs / pixel gate vs copy change | Copy wins for consumer protection (coupon split table). Do not delete the split to chase pixels |

---

## 14. Revision

| Date | Change |
|---|---|
| 2026-09-07 | Twelve named failure modes plus related invariants |
