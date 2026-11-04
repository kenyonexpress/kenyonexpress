# S23: wallet ledger in agorot, cashback per product, affiliate payout to wallet

Queue item S23, 04.11.2026. Scope: the wallet ledger in integer agorot, a
cashback percent on each product that defaults to 0, and the hook that pays an
affiliate commission into the wallet. Tests.

## What already existed

I measured production (`ixvwfbuvfxxsjiywhbbb`) before writing anything.

- **The ledger.** `wallet_entries` has 1352 rows. `amount_ils` is numeric and
  is the value `fn_wallet_transfer` writes. `amount_ils_agorot` is
  `bigint GENERATED ALWAYS AS round(amount_ils * 100)`. No row has a
  fractional agorah, and in no row do the two values disagree. Reasons:
  `order_cashback` 947, `cashback_bonus` 405. The one gap was the read view:
  `v_wallet_ledger` exposed only `amount_ils` and `signed_amount_ils`, and the
  account page parsed those shekel strings back into agorot.
- **Cashback per product.** `products.cashback_percent` is
  `numeric NOT NULL DEFAULT 0`. Checkout snapshots it per line into
  `order_items.cashback_amount_agorot` (`lib/commerce/commission.ts`,
  `percentageOf(customerPaysNow, bps)`). Finalize credits the sum from
  `platform:cashback_reserve` with the key `order:<id>:cashback`.
- **The affiliate to wallet hook.** `payAffiliateConversion`
  (`src/server/affiliates/pay.ts`) has a single path for the finalize caller
  and the admin queue. It reads integer agorot from the row, converts to
  shekels only at `fn_wallet_transfer`, uses the idempotency key
  `affiliate:<conversion id>`, and moves the money before it flips the
  status. **It had no test file.**

## Defect found and fixed: cashback paid on products where it was switched off

`products.cashback_enabled` (048, `NOT NULL DEFAULT false`) is the cashback
switch. Neither checkout nor the cart ever read it. Production:

```
status  cashback_enabled  cashback_percent  count
active  false             0.00              87
active  false             5.00               3   <- paid 5% anyway
draft   false             0.00              23
draft   true              5.00              13
```

Every purchase of those three active products credited 5% to the buyer's
wallet, even though their switch said off.

**Fix.** A new `src/lib/cashback/product.ts`, `effectiveCashbackPercent`:

- switch explicitly `false` gives 0, whatever the rate says;
- a missing, empty, non-numeric or negative rate gives 0 (the default);
- the rate is capped at 100.

When the switch is *absent* (not selected), the rate decides. That covers
fixtures, and a database without 048, where treating absent as off would
silently zero out every product's cashback.

Callers:

- `server/actions/payments/checkout.ts` now selects `cashback_enabled` and
  feeds both line branches (coupon and physical) through the helper. This is
  the path that writes the money.
- `lib/cart/load-products.ts` probes `cashback_enabled` through
  `readOptionalColumns`, so a 42703 costs the perk and not the cart.
  `lib/cart/pricing.ts` uses the helper, so the cart shows what checkout
  pays. I checked anon's column privilege on production first:
  `has_column_privilege('anon','public.products','cashback_enabled','SELECT')`
  returned `true`.
- `server/actions/admin/products.ts` now writes
  `cashback_enabled = cashbackEnabledFor(cashback_percent)` on every save. The
  admin form shows only the rate, so a rate the admin types is a rate that
  pays. The form itself (`src/components/admin/ProductForm.tsx`) is not
  touched.

**No data was changed.** The three rows keep `false / 5.00` and now pay 0,
which is what their switch says. An admin who re-saves one of them with 5%
turns it on.

## Migration 260: applied

`migrations/pending/260_wallet_ledger_view_agorot.sql` appends
`amount_agorot` and `signed_amount_agorot` (bigint, read from the generated
column) to `v_wallet_ledger`. It restates `security_invoker = true` and
revokes the anon SELECT and the authenticated INSERT/UPDATE/DELETE/TRUNCATE/
REFERENCES/TRIGGER grants (Supabase defaults that RLS had already made
inert). No table is altered.

First rehearsed in `BEGIN ... ROLLBACK` (the COMMIT was swapped for a
verification SELECT plus ROLLBACK):

```
[{"rehearsal":{"cols":["id:uuid","user_id:uuid","direction:text","signed_amount_ils:numeric","amount_ils:numeric","reason:text","order_id:uuid","created_at:timestamp with time zone","amount_agorot:bigint","signed_amount_agorot:bigint"],"grants":["authenticated:SELECT"],"mismatch":0,"opts":["security_invoker=true"],"rows":1352}}]
```

After the rollback the view still had eight columns:

```
[{"c":["id","user_id","direction","signed_amount_ils","amount_ils","reason","order_id","created_at"],"n":1352}]
```

Applied with the queue's command (`supabase db query --linked -f
migrations/pending/260_wallet_ledger_view_agorot.sql`, which returned
`"rows": []`). Verified:

```
{"cols":[...,"amount_agorot:bigint","signed_amount_agorot:bigint"],"grants":["authenticated:SELECT"],"mismatch":0,"opts":["security_invoker=true"],"rows":1352}
```

The view has a consumer. `getWalletLedger` (`server/queries/account.ts`)
selects the agorot pair first and falls back to the shekel pair only on 42703.
Both shapes go through `ledgerRowToEntry` in the new
`src/lib/wallet/ledger.ts`. An integral agorot value wins. A fractional
"agorot" value is not trusted, and the decimal is parsed exactly instead.
`ledgerNetAgorot` is an integer sum.

## Found, not fixed: the affiliate programme has no tables in production

The hook is correct and now tested. But in production it has nothing to pay
into:

```
affiliates               does not exist   (42P01; no relation by that name in any schema)
affiliate_conversions    does not exist   (pending 244 never applied)
affiliate_campaigns      exists, 283 shape (active, not is_active; none of 244's columns), 1 row
affiliate_attributions   exists, 0 rows; its FK to affiliates is gone
profiles.affiliate_code  exists, 0 non-null
schema_migrations        referrals_affiliates_schema (010) and affiliate_campaigns_283 recorded
```

So `affiliates` was dropped outside the migration history after 283 was
applied (the CASCADE also took `affiliate_links`, `affiliate_clicks` and
`affiliate_payouts`). `recordAffiliateConversionForOrder` fails safe: it logs
`affiliates.affiliate_read_failed` and returns, so finalize never throws and
no order is harmed. But no affiliate commission can be paid today.

**Decision taken alone:** I did not rebuild the programme inside S23. To
rebuild it I would have to re-create a table someone dropped deliberately, for
reasons nobody recorded. It needs the `affiliate_status` enum and an owner
UPDATE policy. Pending 244 cannot apply as written either: its
`CREATE TABLE IF NOT EXISTS affiliate_campaigns` would skip over the live
283-shape table, and its constraints would then fail on columns that table
lacks. That is a programme decision with its own migration, not a hook. The
hook is ready for it: the moment `affiliates` and `affiliate_conversions`
exist, the finalize path pays through the code tested below.

## Tests

New:

- `src/lib/cashback/product.test.ts`: default 0, switch off pays 0, switch on
  pays the rate, an unselected switch leaves the decision to the rate, junk
  and negatives give 0, cap at 100, the save-side switch, and through
  `calculateCommission`: a disabled 5% line snapshots 0, an enabled one
  snapshots 1500 agorot on 3 × ₪100.
- `src/lib/wallet/ledger.test.ts`: the agorot pair, debit signs, the exact
  decimal fallback (`'8.20'` gives 820), stringified bigint, a fractional
  agorot value refused, direction-derived sign, unknown direction is a debit,
  and an integer net (0.10 + 0.20 − 0.05 gives 25).
- `src/server/affiliates/pay.test.ts`, the first test of the hook: the exact
  `fn_wallet_transfer` arguments (`p_amount_ils: 12.34` from 1234 agorot, key
  `affiliate:conv-1`), money moves before the status flips, integer counter
  sum, approver recorded, `already_paid` transfers nothing, a lost race leaves
  the counters alone, rejected, a failed transfer leaves the row unpaid, no
  reserve, missing row, and a zero commission writes no ledger entry.

Updated: `src/__tests__/pending-migrations-inventory.test.ts` lists 260.

## Gates

```
$ node_modules/.bin/vitest run
 Test Files  680 passed | 1 skipped (681)
      Tests  8101 passed | 13 skipped (8114)
exit 0

$ node_modules/.bin/tsc --noEmit -p .
tsc exit 0

$ pnpm lint
Checked 2193 files in 641ms. No fixes applied.
lint exit 0

$ pnpm build
✓ Compiled successfully in 6.2s
build exit 0
```

(The build log's `sentry ... Invalid token (401)` and `supabase.rls_denied
reviews` lines were already there before this item.)

### Freeze gate

`git diff --stat design-locked-2026-10-19 -- src/components src/app/globals.css src/app/layout.tsx src/app/page.tsx tailwind.config.ts`:

```
 src/components/gifts/GiftPurchaseForm.tsx          | 117 +++++++++++++++++++++
 .../notifications/ExpiryEmailSwitch.test.tsx       |  34 ++++++
 src/components/notifications/ExpiryEmailSwitch.tsx |  52 +++++++++
 .../notifications/PushTopicsSwitch.test.tsx        |  74 +++++++++++++
 src/components/notifications/PushTopicsSwitch.tsx  |  90 ++++++++++++++++
 .../supplier-apply/SupplierCardCheck.tsx           |  53 ++++++++++
 .../turnstile/SupplierApplyChallenge.tsx           |  49 +++++++++
 src/components/turnstile/TurnstileRefresh.tsx      |  71 +++++++++++++
 8 files changed, 540 insertions(+)
```

`git diff --name-status` over the same paths shows only `A` rows: every
file is new since the tag, from earlier items, and S23 touches none of them.
S23 changes no UI file.
