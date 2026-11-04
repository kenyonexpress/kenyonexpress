# S13: cancellation and refund

Queue item S13, 04.11.2026. Task: a cancellation flow per the returns policy,
the fee computed in agorot, a `refunds` table row, the payment adapter's refund
call in sandbox, and an admin override for a full refund at any time. Tests.

## What already existed (read before writing anything)

| Piece | Where | State before S13 |
|---|---|---|
| s.14C decision (14 days, unredeemed, 2 business days, fee) | `src/server/domain/orders/cancellation-14g.ts` (S11) | Read by the order page and the customer request form. **Not read by the refund that moves the money.** |
| Fee min(5%, ₪100) in integer agorot | `computeCancellationFee` in `src/server/domain/orders/refund.ts`, through `applyBp` from `src/lib/money.ts` | Correct. |
| Customer request | `src/server/actions/refund-requests.ts` | Records a request; `changed_mind` is gated by s.14C. Never moves money, by design. |
| Admin refund | `src/server/actions/payments/refund.ts` (`refundOrder`) | Calls `provider.refundByTransactionId`, writes `payments(kind=refund)`, the `refunds` row, the credit note and the ledger. **Applied the fee with no window check, so a refund on day 40 still went through as a statutory one with a fee. Had no override. Left the customer's request `pending`.** |
| `refunds` row | `src/server/payments/refund-record.ts` | Written, but `decided_by` was always null. |
| Sandbox adapter | `MockCardcomProvider`, selected by `getPaymentProvider` when `CARDCOM_USE_MOCK=true` or `NODE_ENV=test` | Tested only behind a spy. |

## What S13 changed

1. **The money path now applies the statute.** A voluntary cancellation (the default `refundOrder` call) runs `decideCancellation14g` on `orders.paid_at` and the vouchers' `status` and `redeemed_at`. Outside the terms it returns `POLICY_REFUSED`, with the statute's Hebrew message and a pointer to the override. The adapter is never called. Inside the terms the fee is min(5%, ₪100), rounded half up in integer agorot.
2. **A defect claim** (`isDefectClaim`) is not a cancellation. It has no window and no fee, as before. Ground: `defect`.
3. **Admin override** (`override: true`). It is a full refund at any time with no fee (`planOrderRefund({ waiveFee: true })`). It is recorded in `refunds.ground = 'goodwill'` and in `audit_log.metadata.override = true`. It runs behind `requireAdminSession` like every other refund. In the admin order screen it is a checkbox: "עקיפת מנהל".
4. **`refunds.decided_by`** now carries the admin who pressed the button.
5. **The flow closes.** After the card is credited, any `pending` row in `refund_requests` for the order becomes `approved`, with `decided_at`, `decided_by`, `decision_note` and `refund_payment_id`. This is best effort, because 202 may not be applied (a test pins that a missing table still writes the `refunds` row).
6. **Whole shekels in the admin result message.** It was `toFixed(2)` on a shekel float. `RefundOutcome` now also returns `refundedAgorot` and `feeAgorot`, and the screen formats them with `shekelsRounded`.

### The flow, end to end

Customer, `/account/orders/<id>`: the page shows the s.14C decision and the fee. Filing a `changed_mind` request is refused outside the terms. Admin, `/admin/orders/<id>`: "יזום החזר" checks the same decision and moves the money through the adapter. It writes `payments(kind=refund)`, `refunds`, the credit note, the ledger and audit, then closes the request. The customer is notified through `refund_completed` (push and in-app; email is off by S12 policy).

## Decisions made alone

1. **The customer does not trigger money directly.** The request-then-operator split from 202 stays. A customer path that moves money is a path where the customer picks when money moves. The statute is satisfied by the operator executing inside 14 days, and `refunds.refund_due_by` (131) tracks that.
2. **The override does not reach a redeemed or expired voucher.** That value was consumed at the counter or lapsed. The settlement machine has no REFUND from there, and pulling card money back would refund consumed value. It stays `MANUAL_RESOLUTION` (wallet goodwill or a supplier claim). "Any time" means any date, not any state.
3. **Defect beats override for the ground.** Both take no fee. `defect` is the stronger legal record.
4. **Booked-service time is still null.** No column stores it (docs/S11-order.md), so the 2-business-day rule cannot fire on this path yet. The decision function already takes it.
5. **Sandbox means the mock adapter.** No environment this repo reaches holds Cardcom credentials. `.env.local` has terminal `12345` with `CARDCOM_USE_MOCK=true`, and `.env.local.bak` has `000000`. Cardcom's shared test terminal 1000 needs an `ApiPassword` for `RefundDeal.aspx` that is not public. The live field names are still `TODO(cardcom)` #41. `refund.sandbox.test.ts` therefore runs the real `@/lib/payments` module, which resolves the sandbox provider, and asserts that the adapter's refund id lands in `payments` and the figures land in `refunds`. A live terminal call is blocked on production keys, which is the existing #41 blocker, not a new one.

## Files

| File | Change |
|---|---|
| `src/server/actions/payments/refund.ts` | s.14C gate, `override`, `POLICY_REFUSED`, `decided_by`, request close, agorot in the outcome. |
| `src/server/domain/orders/refund.ts` | `waiveFee` in `PlanRefundInput`. |
| `src/server/payments/refund-record.ts` | `groundFor({ override })` returns `goodwill`. |
| `src/app/(admin)/admin/orders/[id]/OrderAdminActions.tsx` | Override checkbox, whole-shekel result, s.14C note. Admin, not on the frozen list. |
| `src/server/actions/payments/refund.test.ts` | 8 new cases (window, override, defect, redeemed, fee cap and rounding, request close, missing 202). |
| `src/server/actions/payments/refund.sandbox.test.ts` | New. The real provider factory in sandbox. |
| `src/server/domain/orders/refund.test.ts`, `src/server/payments/refund-record.test.ts` | `waiveFee`, `goodwill`. |
| `docs/INDEX.md`, `README.md` | Index row, document count 294 to 295. |

No migration: `refunds` (131) and `refund_requests` (202) already have every column used.

## Proof

### Targeted

```
$ pnpm vitest run src/server/actions/payments/refund.test.ts src/server/domain/orders src/server/payments/refund-record.test.ts src/server/actions/refund-requests.test.ts
 Test Files  14 passed (14)
      Tests  434 passed (434)

$ pnpm vitest run src/server/actions/payments/refund.sandbox.test.ts
 Test Files  1 passed (1)
      Tests  3 passed (3)
```

The fee figures asserted, all integer agorot: ₪100 gives a 500 fee and 9,500 back. ₪250 gives 1,250 and 23,750. ₪3,000 hits the cap: 10,000 and 290,000. ₪817.50 gives 4,087.5, rounded half up to 4,088, and 77,662 back. The override gives 0 and the full charge.

### Full suite

```
$ pnpm test
 Test Files  655 passed | 1 skipped (656)
      Tests  7878 passed | 13 skipped (7891)
exit 0
```

### Type-check and lint

```
$ pnpm type-check
$ tsc --noEmit
tsc exit 0
```

`pnpm lint` exits 1 on `biome check .`, and only on files in `.lighthouseci/`: 102 diagnostics on untracked Lighthouse JSON reports left by another session. They are not in git and were not deleted (file deletion rule). The same biome check over every tracked file, and every other gate in the lint chain:

```
$ git ls-files | grep -v '^android/' | xargs biome check --files-ignore-unknown=true --no-errors-on-unmatched
Checked 2140 files in 3s. No fixes applied.
exit 0
tokens-gate exit 0
copy-gate exit 0
asset-gate exit 0
raw-html-gate exit 0
postgrest-or-gate exit 0
cache-invalidation-gate exit 0
rtl-logical-gate exit 0
i18n-gate exit 0
locale-format-gate exit 0
input-dir-gate exit 0
```

### Design freeze gate

```
$ git diff --stat design-locked-2026-10-19 -- src/components src/app/globals.css src/app/layout.tsx src/app/page.tsx tailwind.config.ts
 .../turnstile/SupplierApplyChallenge.tsx           | 49 +++++++++++++++
 src/components/turnstile/TurnstileRefresh.tsx      | 71 ++++++++++++++++++++++
 2 files changed, 120 insertions(+)
```

Both files are new since the tag (`git cat-file -e design-locked-2026-10-19:<file>` fails for each), and S13 changes neither one: `git diff --stat HEAD` on the same paths is empty.
