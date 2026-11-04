# S10: vouchers on a paid coupon order

Queue item S10, 04.11.2026. Task: on a paid coupon order, generate a voucher
with a QR and an 8-digit code, validity 30/60/90 days per product with 90 as the
default, `expires_at`, and a status machine of issued / redeemed / expired /
cancelled / transferred. Tests.

## What already existed (measured before writing anything)

| Requirement | State on 04.11, before S10 |
|---|---|
| Voucher issued on a paid coupon line | **Already wired.** `finalizeOrder` (`src/server/payments/finalize.ts`) calls `issueVoucher` once per purchased unit, replay-capped by a count of existing rows per `order_item_id`. |
| QR | **Already there.** `signVoucherQrPayload` (HMAC, `VOUCHER_QR_SECRET`) signs `{code, supplier, user, expiry, key}` into `vouchers.qr_payload`. |
| `expires_at` | **Already there.** `computeVoucherExpiry`: issue time + product validity, capped by `offer_valid_until`. |
| 8-digit code | **Half there, invisible to the repo.** Production has `vouchers.partner_pin` (CHECK `^[0-9]{8}$`), a unique index per supplier among issued vouchers, and a trigger `fn_vouchers_partner_pin` filling it on insert: 809 of 848 rows carry one. **None of the three appeared in any file here.** `code` itself is the 10-symbol Crockford code. |
| Validity 30/60/90, default 90 | **Opposite rule.** `products.coupon_expiry_days` was nullable with CHECK `> 0`, and finalize **refused** to issue for a NULL (CONTRADICTIONS C7). Measured: 90 x 23, 60 x 15, **NULL x 88**. A paid coupon on any of those 88 produced no voucher. |
| Status `transferred` | **Missing.** `voucher_status` was `issued, redeemed, expired, cancelled, refunded`. A gift claim rewrote `user_id` in place. |

## Decisions made alone

1. **The 8-digit code is `partner_pin`, not a new column and not a new `code`
   format.** The column, its CHECK and the per-supplier unique index were
   already live and filled on 809 rows. A second 8-digit column would give two
   sources for one number. Shortening `code` to 8 digits would make every
   scanner, the offline queue and 848 existing rows a migration. The issuer now
   generates the pin itself (`generateVoucherPin`, uniform via rejection
   sampling, leading zeros kept). The trigger stays as the fallback for any
   other writer.
2. **`transferred` means the row was retired by a gift claim, and the
   recipient gets a new row.** Under the in-place model the code and QR never
   changed, and both had already been mailed to the BUYER in `voucher_issued`.
   That let the buyer redeem the mailed QR after the recipient claimed it.
   `withholdGiftedCode` hid it on screen only. Now
   `transfer_voucher_on_claim` (SECURITY DEFINER, service_role only) locks the
   buyer's row and, in one transaction:
   - inserts a new `issued` row: new code, a QR signed to the recipient, a new
     pin, and the same order line, money snapshot and `expires_at`
   - moves the old row to `transferred`, so each row points at the other.

   The code and QR come in from the application because the HMAC secret must
   not be in SQL. `transferred` is terminal, like every non-issued state.
3. **C7 retired by the owner's rule.** NULL validity is 90. The default lives
   in the column (`DEFAULT 90`) and in `resolveCouponValidityDays`, and the
   product page reads the same column. A value outside 30/60/90 is refused,
   never rounded.
4. **`coupon_expiry_days` stays nullable.** 254 first set NOT NULL. But
   `buildProductMoneyRow` writes NULL for every non-coupon product, so every
   physical-product save would have failed. It was dropped minutes later, and
   the file carries the final `DROP NOT NULL`.
5. **A scan of a retired copy answers `cancelled`.** That's
   `validateVoucherRedemption` plus the `/redeem/[token]` page. It isn't a new
   public outcome: the DB `voucher_scan_outcome` enum and both supplier routes
   stay unchanged, and the till does not learn a gift happened. The real
   arbiter is unchanged too: `redeem_voucher` only matches `status = 'issued'`.

## Files

| File | Change |
|---|---|
| `migrations/pending/254_voucher_validity_pin_transfer.sql` | New, **applied**. Validity rule, partner_pin written down, `transferred`, guard, RPC. |
| `src/lib/vouchers/validity.ts` | New. `COUPON_VALIDITY_DAYS`, `DEFAULT_COUPON_VALIDITY_DAYS = 90`, `resolveCouponValidityDays`. |
| `src/server/domain/vouchers/code.ts` | `generateVoucherPin`, `isValidVoucherPin`, `formatVoucherPin`. |
| `src/server/domain/vouchers/issue.ts` | Writes `partner_pin`, redraws it with the code on 23505. |
| `src/server/domain/vouchers/transfer.ts` | New. `transferVoucherOnClaim`, error mapping. |
| `src/server/domain/vouchers/state-machine.ts` | `transferred` state, `TRANSFER` event (refused past expiry). |
| `src/server/domain/vouchers/redemption.ts` | `transferred` resolves to `cancelled`. |
| `src/server/payments/finalize.ts` | NULL validity resolves to 90 instead of refusing. |
| `src/server/actions/gifts.ts` | `claimGift` re-issues through the RPC; a recipient reopening the link lands on the new row. |
| `src/lib/commerce/product-money.ts`, `src/lib/admin/product-form-schema.ts` | 30/60/90 only; empty means 90. |
| `src/server/domain/orders/status-transitions.json` + test | `issued -> transferred`, diffed against 254's guard body. |
| `src/lib/vouchers/coupon-view.ts`, `src/lib/admin/voucher-view.ts`, `src/server/queries/vouchers.ts`, `src/types/database.ts`, `src/app/redeem/[token]/page.tsx` | The new status and columns. Labels: `הועבר במתנה`. |
| `docs/VOUCHER-LIFECYCLE.md` | Diagram arrow and enum list. |

No UI component was touched. The `/redeem/[token]` page is not on the frozen
list, and its change is a one-line status mapping with no layout effect.

## Proof

### Migration 254: rehearsal, apply, and behaviour on production

Rehearsal, the whole file inside `BEGIN ... ROLLBACK`:

```
$ supabase db query --linked -f /tmp/s10rehearse.sql     # BEGIN; <254>; probe; ROLLBACK;
{ "anon_exec": false, "auth_exec": false,
  "labels": "cancelled,expired,issued,redeemed,refunded,transferred",
  "nulls": 0 }
```

Apply:

```
$ supabase db query --linked -f migrations/pending/254_voucher_validity_pin_transfer.sql
Initialising login role...
{ "rows": [], ... }
```

NOT NULL amendment, applied the same way, then the column state:

```
$ supabase db query --linked -f /tmp/s10fix.sql   # ALTER ... DROP NOT NULL; probe
{ "chk": "CHECK ((coupon_expiry_days = ANY (ARRAY[30, 60, 90])))",
  "column_default": "90", "is_nullable": "YES" }
```

The RPC end to end on production, rolled back. The test cloned a cancelled
voucher as `issued` with a claim token, then called
`transfer_voucher_on_claim`:

```
S10TEST000  status=transferred  has_pin=true  has_succ=true   has_pred=false  claimed=true
S10TEST001  status=issued       has_pin=true  has_succ=false  has_pred=true   claimed=true
```

Refusals, same rollback. The test transferred, called the RPC a second time,
then tried to UPDATE the retired row back to `issued`:

```
{ "old_status": "transferred", "second_rows": 0, "trigger_pin_ok": true }
```

The second claim inserted nothing, the guard kept the row `transferred`, and
the live trigger filled a valid pin when the caller passed NULL.

### Tests

New: `src/server/domain/vouchers/s10-vouchers.test.ts` (8-digit pin format and
uniformity; validity values, default and refusal; `expires_at` per validity
and capped by the offer; issued row carries code, signed QR, pin, status,
expiry and conserved integer agorot; pin redrawn on 23505; the five statuses;
`TRANSFER` legal from issued only, terminal, refused past expiry; retired copy
scans as `cancelled`; transfer RPC arguments, retry, error mapping, grants).
Changed to the new rules: `gifts-transfer.test.ts` (claim by RPC, recipient
and buyer reopening the link), `finalize-reads-fail-loudly.test.ts`,
`product-money.test.ts`, `product-form-schema.test.ts`,
`import-rows.test.ts`, `voucher-view.test.ts`, `state-machine.test.ts`,
`status-transitions.test.ts`, `pending-migrations-inventory.test.ts`,
`discarded-read-inventory.test.ts`.

```
$ pnpm exec vitest run src/server/domain/vouchers/s10-vouchers.test.ts
Test Files  1 passed (1)
      Tests  21 passed (21)

$ pnpm test
 Test Files  653 passed (653)
      Tests  7839 passed | 12 skipped (7851)
test exit 0
```

### type-check and lint

```
$ pnpm type-check
tsc exit 0

$ pnpm exec biome check src docs migrations scripts
Checked 2051 files in 576ms. No fixes applied.

tokens-gate=0 copy-gate=0 asset-gate=0 raw-html-gate=0 postgrest-or-gate=0
cache-invalidation-gate=0 rtl-logical-gate=0 i18n-gate=0 locale-format-gate=0
input-dir-gate=0 docs-index-gate=0 docs-path-audit=0
```

A bare `pnpm lint` exits 1, as in S08 and S09: every diagnostic comes from the
untracked `.lighthouseci/` and `android/` directories, not committed and not
touched here.

### Design-freeze gate

```
$ git diff --stat design-locked-2026-10-19 -- src/components src/app/globals.css src/app/layout.tsx src/app/page.tsx tailwind.config.ts
 .../turnstile/SupplierApplyChallenge.tsx           | 49 +++++++++++++++
 src/components/turnstile/TurnstileRefresh.tsx      | 71 ++++++++++++++++++++++
 2 files changed, 120 insertions(+)
new since tag: src/components/turnstile/SupplierApplyChallenge.tsx
new since tag: src/components/turnstile/TurnstileRefresh.tsx
```

Both listed files are S05's and new since the tag. Nothing on the frozen list
was touched by S10.

## Not done, on purpose

- **The account and admin screens don't show `partner_pin` yet.** Those are
  frozen `src/components/**` files or V-queue routes. The value is on every
  row, `formatVoucherPin` is ready, and `queries/vouchers.ts` can select it
  when the coupon page is opened for visual work.
- **The 39 legacy rows with no pin are not backfilled.** All of them are
  terminal (production has 0 issued vouchers today), so no counter will ever
  ask for one.
