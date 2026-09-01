---
name: cardcom-payments
description: Use whenever working on payment flow, checkout, tokenization, or anything in src/server/actions/payments/.
---

> <!-- v1-final-banner:2026-09-01 -->
> ⚠️ **This document names tables that do not exist in production.**
>
> | Named here | In production |
> |---|---|
> | `supplier_payouts` | nothing; never built |
>
> The design below may still be sound; the schema it assumes was not built, or
> was built under another name. Verify against `docs/DATA-MODEL.md` before
> writing a query, and see `docs/SCHEMA-REALITY-CHECK.md` for the full mapping.

## Platform model

KenyonExpress is a PLATFORM, not a supplier. It connects customers to suppliers and takes a commission. The platform never holds inventory.

## Money is integer agorot

Every amount is an integer number of agorot (1 ILS = 100 agorot) and every
calculation goes through `src/lib/money.ts`. No float ever touches a money
value. Rates are integer basis points (10% = 1000 bp), rounding is integer
half-up. VAT is `VAT_RATE_BP = 1800` (18%), one definition for the whole app.

Production carries 78 `*_agorot` columns. 26 of them are
`GENERATED ALWAYS AS (round(<numeric> * 100))::bigint STORED`: read the
generated twin, never recompute it in JS.

Full picture: `docs/ARCHITECTURE-OVERVIEW.md` section 3.

## Payment split by product type

Commission is `products.platform_percent`: a MANDATORY per-product value the
admin sets. There is no default rate anywhere (docs/CONTRADICTIONS.md C1/C2).
It is snapshotted into `order_items` at purchase.

### Physical product
- Customer pays 100% of the price on checkout.
- Platform keeps `platform_percent` of that amount; the rest goes to the supplier.
- The supplier residual is computed as `face - fee`, NOT by applying the mirror
  percent a second time. Applying it twice is how the two halves come to
  disagree by an agora.
- It settles in the same run as the charge (`supplierImmediate`). **There is no
  payout batch, no T+3, and no minimum accrued balance.** Those describe a
  `supplier_payouts` ledger that does not exist in this database and never did.
  Verified against production 2026-09-01: the `payout_status` and
  `payout_line_type` enums are live with no tables behind them.

### Coupon product
- Customer pays `products.coupon_price_ils`: an ABSOLUTE shekel amount the admin
  sets per product. It is never a percentage, it has no default, and a product
  without it cannot be sold, only described
  (`src/lib/commerce/coupon-offer.ts`). Anything that says "10% now, 90% in
  store" is describing a model that was abandoned on 2026-07-24.
- The remainder is paid directly at the business on coupon scan, in cash. That
  money never passes through the platform's clearing account.
- **The platform keeps the ENTIRE upfront, permanently.** Commission is not a
  slice of it: `platformFee === customerPaysNow`, `supplierDue === 0`, and the
  line snapshots `platformPercentBps = 10000` because that is the split that
  actually happened.
- **There is NO held entry and no ledger custody row.** The upfront is platform
  revenue the moment the charge succeeds. `finalize.ts` writes no custody row.
  There is no escrow of any kind, internal or external, and no J5 authorization.
  `escrow_holds` survives in production with 2 legacy rows and no writer;
  `escrow_held` and `escrow_released` are dead `settlement_status` values that
  the TypeScript `SettlementState` deliberately refuses to admit.
- Voucher status transitions: `issued` -> `redeemed` on QR scan at the business.
  **There is no `active` state.** The live `voucher_status` enum is
  `issued, redeemed, expired, cancelled, refunded`, and every non-`issued` state
  is terminal. Guards on REDEEM: own supplier only (`WRONG_SUPPLIER`), before
  expiry only (`PAST_EXPIRY`).
- Both product types run the same two moves:
  `pending -> paid -> split_executed`. A coupon line simply splits 100/0. There
  is no state between `paid` and settled, because nothing is deferred.
- Expiry is `products.coupon_expiry_days` per product (30 / 60 / 90 or any
  integer). On expiry without redemption the upfront is credited to the
  customer's digital wallet (`credit_expired_vouchers()`).

## First purchase incentive

- First purchase: customer receives a 10% discount on the total.
- Card is tokenized (Cardcom token) during first purchase for one-click future checkout.
- Token stored in `payment_tokens` table, never the raw card number.

## Wallet cashback

- Every 5th purchase triggers 5% cashback added to the customer's wallet.
- Wallet credit is internal site credit only.
- It NEVER cashes out -- no bank transfer, no refund to card.
- Applied as a discount on the next order at checkout, not automatically.

## Authentication flow

- Sign-in: Google OAuth on first visit.
- Subsequent sign-in: OTP (email or phone), not password.
- Guest cart: allowed. User can browse and add to cart without logging in.
- Login required: only when the customer clicks "Pay" at checkout.
- On login, merge guest cart into user cart.

## Cardcom integration rules

- All Cardcom calls go through server actions in `src/server/actions/payments/`.
- Never call Cardcom from client components.
- Use `adminClient` (service role) for order status updates -- never the user's client.
- **There is no callback signature to validate. Cardcom does not sign its
  callbacks** -- no HMAC, no signature header. Do not add a signature check and
  do not treat its absence as a bug. Authenticity rests on two things, and never
  on the POST body:
  1. An unguessable shared secret carried in the callback URL (`?s=`), set when
     the Low Profile page is created and compared with `secretEquals`
     (constant time, in `src/lib/security/constant-time.ts`). Two secrets are
     accepted at once so a rotation has a window.
  2. Mandatory server-to-server re-verification via `GetLpResult`. The re-fetched
     result is the ONLY trusted source of amount, status and token, and the
     amount must equal the stored payment row or the order does not close.
- Journal every webhook event to `payment_webhook_events` BEFORE acting on it,
  deduped on `(provider, external_event_id)`. `processed_at` stays null until
  the order actually closes -- that null is what puts a charged-but-unfinalized
  event into the dead-letter queue `src/server/payments/webhook-dlq.ts` replays.
  `audit_log` is for the amount-mismatch alarm, not for the event journal.
- A persist failure that is NOT a unique violation must answer 5xx, so Cardcom
  retries. Answering 200 there loses the charge silently.

## Verified against production

Every claim in this file was checked against Supabase project
`ixvwfbuvfxxsjiywhbbb` on 2026-09-01. The three that used to be wrong, and are
the ones most likely to be re-introduced from an older document:

1. A payout batch for physical settlement. There is no payout table.
2. An internal `held` ledger entry for the coupon upfront. There is no custody
   row of any kind.
3. A coupon status called `active`. The enum starts at `issued`.
