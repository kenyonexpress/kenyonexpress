# S11: order page

Queue item S11, 04.11.2026. Task: `/account/orders/[id]` shows the voucher QR,
code, business details, a map link, expiry, a cancel button under s.14C, a
transfer button and an invoice download link or placeholder. Existing frozen
components only.

## What already existed (read before writing anything)

The page file already existed at `src/app/(account)/account/orders/[id]/page.tsx`.
It sits under `/account/**`, which the 04.11 freeze amendment lists as open,
and it is not on the frozen list. No new page file was needed.

| Requirement | Before S11 | After S11 |
|---|---|---|
| Voucher QR | Already there: `<img>` from `qrDataUrl` plus `QrFullscreen`. | Unchanged. |
| Code | The 10-symbol `code` only. The 8-digit `partner_pin` from S10 was never selected. | `getOrderDetail` selects `partner_pin`. The page prints it as `1234 5678` under the code. The pin is withheld with the code for a gift that is on its way to someone else. |
| Business details | Name, city and phone. | Street address added. The city is printed only when the address does not already contain it. |
| Map link | Already there: Waze via `wazeSearchLink`, shown only when a street address exists. | Unchanged. |
| Expiry | Already there: `בתוקף עד` plus `ValidityCountdown`. | Unchanged. |
| Cancel button per s.14C | **Did not follow s.14C.** `RefundRequestForm` used `decideRefundRequest`, which has a 365-day window and never looks at redemption. | New `decideCancellation14g`. A summary row shows the deadline and the fee, or the reason cancellation is refused. A `ביטול העסקה` button jumps to the form. `requestRefund` enforces the same rule on the server for `changed_mind`. |
| Transfer button | Already there: `VoucherSendButtons`, or the gift "manage" link. | Unchanged. |
| Invoice link / placeholder | The link showed when an invoice existed. Otherwise the page showed nothing. | When there is no invoice, a placeholder row uses the existing `invoice.pending` and `invoice.notIssued` strings. |

No new component was created. Every UI element is either an existing
component or markup that uses the existing `account-*` classes.

## The s.14C rule (`src/server/domain/orders/cancellation-14g.ts`)

The function is pure. The caller supplies `now`.

- The order must be `paid`.
- The deadline is `paid_at + 14 days`. Cancellation is allowed up to and
  including that instant. If `paid_at` is unknown, the window is treated as
  open, the same rule `decideRefundRequest` uses.
- If any voucher on the order is `redeemed`, or has `redeemed_at` set,
  cancellation is refused. Vouchers that are transferred, expired or cancelled
  do not block it.
- If a booked service is fewer than 2 business days away, cancellation is
  refused. Business days are Sunday to Thursday on the Israeli calendar, and
  days are counted strictly between today and the service day.
- The fee is `computeCancellationFee`, which is `min(5%, ₪100)` in integer
  agorot through `applyBp`. No floats are used.

## Decisions made alone

1. **Only `changed_mind` is gated by s.14C. Defect claims stay open.** The
   form serves both purposes. A coupon that did not work, a parcel that never
   arrived or a double charge is not a voluntary cancellation, and the 14 days
   do not apply to it. Gating every reason would take away the defect path
   after day 14. The frozen form cannot hide one reason, so the server refuses
   `changed_mind` with the statutory message instead.
2. **There is no booked-service time in the schema.** `order_items` has no
   booking, check-in or service column (checked against `src/types/database.ts`).
   The rule is implemented and tested with an explicit `bookedServiceAt`, and
   both callers pass `null` until a booking time exists. When it does, the fix
   is one argument in two places.
3. **Holidays are not modelled.** A holiday counts as a business day. This
   only matters when a holiday falls inside the two days. In that case the
   customer could be refused a cancellation they are entitled to, and an
   operator can still approve it.
4. **A failed voucher read refuses.** It is never read as "nothing redeemed".
5. **One redeemed voucher blocks self-service cancellation of the whole
   order.** Partial cancellation of the unredeemed units goes through support,
   and the message says so.

## Files

| File | Change |
|---|---|
| `src/server/domain/orders/cancellation-14g.ts` | New. `decideCancellation14g` and `businessDaysBetween`. |
| `src/server/domain/orders/cancellation-14g.test.ts` | New. 17 tests. |
| `src/server/actions/refund-requests.ts` | `changed_mind` checked against s.14C, plus `readOrderVoucherStates`. |
| `src/server/actions/refund-requests.test.ts` | 5 new tests: allowed, redeemed, past 14 days, failed read, defect claim past 14 days. |
| `src/server/queries/orders.ts` | `partner_pin` selected. `OrderVoucher.pin` added. |
| `src/app/(account)/account/orders/[id]/page.tsx` | s.14C row and CTA, invoice placeholder, pin, supplier address, `#order-cancel` anchor. |
| `messages/he.json`, `messages/en.json` | `cancellation.statutory*` and `orderVoucher.pinLabel`. |

## Proof

### Freeze gate

```
$ git diff --stat design-locked-2026-10-19 -- src/components src/app/globals.css src/app/layout.tsx src/app/page.tsx tailwind.config.ts
 .../turnstile/SupplierApplyChallenge.tsx           | 49 +++++++++++++++
 src/components/turnstile/TurnstileRefresh.tsx      | 71 ++++++++++++++++++++++
 2 files changed, 120 insertions(+)

$ git ls-tree -r --name-only design-locked-2026-10-19 -- src/components/turnstile | wc -l
       0
```

Both listed files are new since the tag and came from earlier items. S11
touched nothing under `src/components`.

### Type-check

```
$ pnpm type-check
$ tsc --noEmit
tsc exit 0
```

### Lint

```
$ pnpm exec biome check src messages scripts docs migrations    -> exit 0
$ node scripts/tokens-gate.mjs && ... && node scripts/docs-path-audit.mjs   -> exit 0
i18n gate: clean (603 Hebrew literals in scope, ceiling 603)
```

A bare `pnpm lint` (`biome check .`) reports 101 errors, all in the untracked
`.lighthouseci/*.json` artefacts left by another session. They are not in the
repo and S11 did not create them.

### Tests

```
$ node node_modules/vitest/vitest.mjs run src/server/domain/orders/cancellation-14g.test.ts
 Test Files  1 passed (1)
      Tests  17 passed (17)

$ node node_modules/vitest/vitest.mjs run src/server/actions/refund-requests.test.ts
 Test Files  1 passed (1)
      Tests  27 passed (27)

$ pnpm test
 Test Files  654 passed (654)
      Tests  7861 passed | 12 skipped (7873)
```
