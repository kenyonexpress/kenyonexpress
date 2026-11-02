# C141 — Money invariants (2026-11-02)

Rule: no `parseFloat` / `.toFixed` / `Number(` on a money path outside
`src/lib/money.ts`. platform_percent snapshotted per order line at purchase and
frozen once paid.

## What changed

- `src/lib/money.ts` gained the boundary helpers. They are now the only code in
  `src/` that converts money between agorot and the outside world:
  `agorotFromDb`, `agorotFromDbOrNull`, `agorotFromIlsNumber`,
  `agorotFromIlsColumn(Or)`, `ilsFromIlsColumn`, `agorotToDecimalString`,
  `agorotFromShekelInput`, `bpFromPercentColumn`, `percentFromColumn`,
  `bpToPercentString`, plus the non-money `ratioToPercentString`,
  `fixedDecimal` and `numberFromInput`. Shekel parsing rounds on the decimal
  digits, so no binary fraction is formed (1.005 → 101 agorot; the old
  `toFixed(2)` gave 100).
- About 70 call sites across components, pages, API routes, server actions and
  lib now use these helpers (the old gate counted 341 raw hits, 163 of them on
  money-keyword lines).
- New permanent gate: `src/lib/money-invariants.test.ts`. It walks `src/` and
  fails on any forbidden call on a non-comment line that names a money concept,
  or on any line in a file whose path does. It also has unit tests for the
  helpers.
- `src/__tests__/money-no-float.test.ts`: two named allowlist entries for the
  non-money display helpers in money.ts.

## platform_percent snapshot: real defect found and fixed

- `migrations/applied/291_platform_percent_snapshot.sql` never reached
  production. Commit b188ef775 bulk-moved 162–300 to applied/ without running it.
  Live `order_items` has `platform_percent` (329/329 rows populated), has no
  `platform_percent_snapshot`, and had no snapshot lock. 291 cannot run as
  written either: its trigger references `platform_bp`/`commission_bp`/...,
  which do not exist on live order_items.
- As a result, finalize selected `order_items.platform_percent_snapshot`, which
  is a 42703 against production. The subscriptions cron read
  `subscriptions.platform_percent_snapshot` and subscription-create wrote it
  (live column: `platform_percent`). The admin voucher and order pages read
  undefined.
- Code fix: reads alias `platform_percent_snapshot:platform_percent` (finalize,
  subscriptions cron). subscription-create writes `platform_percent`. The admin
  pages read `platform_percent`.
- DB fix: `migrations/pending/323_order_items_percent_snapshot_lock.sql` (+
  `preflight_323.sql`, README row) adds a BEFORE UPDATE trigger that freezes
  `platform_percent`, `supplier_split_percent` and
  `commission_percent_snapshot` once `orders.paid_at` is set. Applied with
  `supabase db query --linked -f`.

## Gate 1: grep outside src/lib/money.ts (non-test, non-comment, money lines)

```
$ grep -rnE "parseFloat|toFixed|Number\(" src --include="*.ts" --include="*.tsx" | grep -v "\.test\." | grep -v "^src/lib/money.ts" | grep -iE "price|agorot|ils|amount|total|money|percent|commission|fee|payout|cashback|discount|refund|vat|balance|cost|subtotal|shekel|₪" | grep -E "(^|[^A-Za-z0-9_$.])Number\(|parseFloat\(|\.toFixed\(" | grep -vE ":[0-9]+:[[:space:]]*(//|\*|/\*)" | wc -l
       0
```
(Before: `docs/C125-money.md` recorded 346 raw hits. At the start of C141 the
same raw grep showed 341 non-test hits, 163 of them on money-keyword lines.)

## Gate 2: vitest money gates + platform_percent snapshot test

```
$ npx vitest run src/lib/money-invariants.test.ts src/__tests__/money-no-float.test.ts src/lib/money.test.ts src/lib/commerce/platform-percent-snapshot.test.ts src/server/payments/subscription-create.test.ts --reporter=verbose
 ✓ src/lib/commerce/platform-percent-snapshot.test.ts > the percent snapshot copies, it does not reference > keeps the purchase-time percent after the product is repriced
 ✓ src/lib/commerce/platform-percent-snapshot.test.ts > the percent snapshot copies, it does not reference > is unaffected when the whole source object is mutated in place
 ✓ src/lib/commerce/platform-percent-snapshot.test.ts > the percent snapshot copies, it does not reference > two lines bought at different rates keep their own rates
 ✓ src/lib/commerce/platform-percent-snapshot.test.ts > the settlement path reads the percent from the order line > selects platform_percent from order_items
 ✓ src/lib/commerce/platform-percent-snapshot.test.ts > the settlement path reads the percent from the order line > refuses to settle a coupon line that carries no snapshot
 ✓ src/lib/commerce/platform-percent-snapshot.test.ts > the settlement path reads the percent from the order line > never re-derives an order line rate by joining products
 ✓ src/__tests__/money-no-float.test.ts > zero floats on the money path > scans a real tree, not an empty glob
 ✓ src/__tests__/money-no-float.test.ts > zero floats on the money path > forbids parseFloat outside the named boundary sites
 ✓ src/__tests__/money-no-float.test.ts > zero floats on the money path > forbids Math.round of an ILS multiply outside the named boundary sites
 ✓ src/__tests__/money-no-float.test.ts > zero floats on the money path > forbids bare toFixed (outside the ilsToAgorot idiom) outside the named boundary sites
 ✓ src/__tests__/money-no-float.test.ts > zero floats on the money path > forbids decimal-literal multiply outside the named boundary sites
 ✓ src/lib/money-invariants.test.ts > C141 money invariants > no parseFloat / toFixed / Number( on a money path outside src/lib/money.ts
 ✓ src/lib/money-invariants.test.ts > money.ts boundary helpers > reads integer agorot columns exactly
 ✓ src/lib/money-invariants.test.ts > money.ts boundary helpers > converts legacy shekel columns without a float round-trip
 ✓ src/lib/money-invariants.test.ts > money.ts boundary helpers > round-trips agorot to a decimal string
 ✓ src/lib/money-invariants.test.ts > money.ts boundary helpers > parses admin shekel input
 ✓ src/lib/money-invariants.test.ts > money.ts boundary helpers > reads percent columns as basis points
 Test Files  5 passed (5)
      Tests  50 passed (50)
```

```
$ npx vitest run src/lib/commerce/platform-percent-snapshot.test.ts --reporter=verbose
 ✓ src/lib/commerce/platform-percent-snapshot.test.ts > the percent snapshot copies, it does not reference > keeps the purchase-time percent after the product is repriced
 ✓ src/lib/commerce/platform-percent-snapshot.test.ts > the percent snapshot copies, it does not reference > is unaffected when the whole source object is mutated in place
 ✓ src/lib/commerce/platform-percent-snapshot.test.ts > the percent snapshot copies, it does not reference > two lines bought at different rates keep their own rates
 ✓ src/lib/commerce/platform-percent-snapshot.test.ts > the settlement path reads the percent from the order line > selects platform_percent from order_items
 ✓ src/lib/commerce/platform-percent-snapshot.test.ts > the settlement path reads the percent from the order line > refuses to settle a coupon line that carries no snapshot
 ✓ src/lib/commerce/platform-percent-snapshot.test.ts > the settlement path reads the percent from the order line > never re-derives an order line rate by joining products
 Test Files  1 passed (1)
      Tests  6 passed (6)
```

## Gate 3: live DB trigger check (savepoint, rolled back, no data changed)

```
$ supabase db query --linked -f /tmp/c141_trigger_check.sql
"k": "paid_item",	      "v": "11129c4f-1705-403d-a7bd-25ca76e91a25"
"k": "unpaid_item",	      "v": "be4eeb84-5761-41d7-b947-fa7b9ce8ecf6"
"k": "paid_update",	      "v": "BLOCKED: order item 11129c4f-1705-403d-a7bd-25ca76e91a25 belongs to a paid order; percent snapshots are frozen"
"k": "unpaid_update",	      "v": "allowed (rolled back)"
"k": "paid_status_update",	      "v": "allowed (rolled back)"
"k": "paid_percent_unchanged",	      "v": "true"
```

## Gate 4: typecheck + full suite

```
$ npx tsc --noEmit -p . ; echo exit=$?
exit=0

$ npx vitest run
⎯⎯⎯⎯⎯⎯ Failed Tests 11 ⎯⎯⎯⎯⎯⎯⎯
 Test Files  4 failed | 860 passed | 3 skipped (867)
      Tests  11 failed | 9568 passed | 39 skipped (9618)
   1  FAIL  src/__tests__/migration-location-gate.test.ts
   2  FAIL  src/__tests__/migration-manifest-matches-disk.test.ts
   1  FAIL  src/__tests__/migration-references-point-where-the-file-is.test.ts
   7  FAIL  src/__tests__/pending-migrations-inventory.test.ts
```
The 11 remaining failures are older migration-inventory drift (322, 243, 130
number reuse, unregenerated manifest). With the 323 files removed and the README
reverted to HEAD, the same 4 files still show 11 failures, so C141 adds none.
`src/server/payments/platform-percent-immutability.test.ts` is updated to the
live column and stays skipped without a service-role key (M13 deferred). Gate 3
covers it against production.

RESULT: DONE
