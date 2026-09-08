# REFUND-POLICY-IMPLEMENTATION

The brief "100 percent refund, no questions asked, up to 3 requests per
customer" is **not** what the code or the database enforce. What is live is
Israeli distance-selling law plus a coupon rule: a card refund is legal only
while every voucher is still `issued`.

Authoritative: `src/server/domain/orders/refund.ts`, CHECK constraints on
`refunds`, enum `refund_ground` / `refund_destination` / `refund_state`.
Admin action: `src/server/actions/payments/refund.ts`.

---

## 1. What is actually granted

| Rule | Source |
|---|---|
| Distance sale, 14 calendar days | `refund_ground = distance_sale_14d` |
| Cancellation fee: the lower of 5% of the charge or ₪100 | `computeCancellationFee`, `applyBp` 500 bp, cap 10,000 agorot. Mirrored as `refunds_fee_within_statutory_cap` |
| Defect / non-conformity / duplicate: **zero fee** | `isDefectClaim`, CHECK `refunds_no_fee_when_our_fault` |
| Same Israel calendar day as the charge: CancelOnly (no credit, no clearing fee) | `isSameClearingDay`, Asia/Jerusalem |
| After transmission: real credit through Cardcom | provider refund |
| Coupon: card refund blocked if any voucher is `redeemed` or `expired` | `planOrderRefund` |
| Physical `split_executed`: claw back supplier share on the next settlement | `supplierDebits` |

There is no counter of "requests per customer" and no automatic fourth-request
flag. Abuse, if wanted, is an admin reading `/admin/orders` and `audit_log`,
not a trigger.

Goodwill after consumption is a **wallet** credit, a different money movement,
and never `planOrderRefund`.

---

## 2. Refund paths

`refund_destination`: `original_method` | `wallet`.

### Wallet (immediate)

State machine over the live enum, not the brief's names:

| Brief name | Live `refund_state` |
|---|---|
| pending | `requested` (14-day clock starts) |
| authorized | `approved` |
| wallet_credited | `executing` (`fn_wallet_transfer` moved money) |
| completed | `completed` |

Also recordable: `rejected`, `failed`. Pure planner:
`src/server/payments/refund-wallet.ts`. The wallet is internal credit. It is
not a bank transfer.

### Original payment method (card)

Up to the issuer's posting time, commonly several business days, not a
platform SLA of "14 business days" as a guarantee. The mail says the issuer
decides when it shows.

Admin `refundOrder`:

1. `requireAdminSession` (money is admin-tier).
2. `describeRefundBlockers` on screen **before** the click.
3. `planOrderRefund` (pure).
4. Journal, Cardcom credit or CancelOnly, `recordRefund`, settlement events,
   voucher `issued -> refunded`, enqueue `refund_completed`.

Idempotent: a second call on an already `refunded` order no-ops.

Partial: `partialAmountAgorot` set means **no** cancellation fee. Half a deal
cannot be CancelOnly.

---

## 3. Coupon refund rules

Card refund only if **every** voucher of the order is still `issued`.

| Voucher status | Card refund |
|---|---|
| `issued` | allowed (then those vouchers go `refunded`) |
| `redeemed` | blocked. Value was consumed at the business |
| `expired` | blocked. Value is breakage; the expire job may already have credited the wallet separately |
| `cancelled` / `refunded` | not a second card refund |

Hebrew blocker: `N שוברים כבר מומשו בבית העסק. הערך נצרך ולא ניתן להחזיר אותו לכרטיס.`

---

## 4. Physical refund rules

Lines must be in a settlement state that `canTransition(..., 'REFUND')`.
`split_executed` is refundable: the supplier residual already released is
listed in `supplierDebits` and netted on the next payout adjustment, not
collected from the supplier in cash.

Return shipping and "condition of goods" are **operations copy**, not a
database column. The planner does not inspect photos of a parcel. An admin
chooses defect (`isDefectClaim`) vs distance sale. Defect zeros the fee.

There is no automated RMA workflow in the repo.

---

## 5. Abuse detection (4th request)

**Not implemented.** Do not document a flag that nobody writes.

If this is added later, it belongs as a count of completed `refunds` per
`profiles.id` in a window, shown on the admin order page, not as a silent
deny that surprises a customer who is still inside the statutory 14 days.
Statutory rights outrank a homemade cap of three.

---

## 6. Admin refund UI requirements

- Guard: admin session. `content_uploader` and `support` do not refund.
- Show blockers next to the button, in Hebrew, highlighting voucher ids.
- Amount in agorot internally; display via `shekels`.
- Toggle: defect (zero fee) vs distance sale (statutory fee).
- Optional partial amount (no fee).
- Confirm CancelOnly vs credit when it is still the same clearing day.
- After success: order status, refund row, mail queued. 403 is a sentence,
  not a login HTML file.
- Audit: `writeAuditLog` on the action.

---

## 7. Ledger entries per refund type

| Type | Rows |
|---|---|
| Card credit | `refunds` (ground, destination `original_method`, granted_agorot, fee), `payments` kind `refund`, `payment_events`, `settlement_events`, order/item status `refunded` |
| CancelOnly | refund row with no provider credit; deal never transmitted |
| Wallet goodwill | `refunds.destination = wallet`, `wallet_entries` via `fn_wallet_transfer`, state `requested -> approved -> executing -> completed` |
| Supplier clawback | `supplierDebits` into settlement, not a customer-visible wallet line |
| Voucher | `vouchers.status` `issued -> refunded` only |

Conservation CHECKs stay true. `refunds_completed_has_money` requires
`granted_agorot` and `completed_at` on `completed`.

---

## 8. Israeli Consumer Protection Law alignment

Distance selling: customer may cancel within 14 days. Fee is the **lower** of
5% or ₪100, encoded twice (application + CHECK) so a future intern cannot
charge ₪101. Our fault (defect, duplicate, service not provided): fee must be
0, also a CHECK.

VAT is in the original charge; a credit reverses the same tax document path
(`enqueueRefundCreditNote`). This document does not replace counsel. The
numbers in `computeCancellationFee` change when the statute changes, with a
comment dated that day.

The 100%-and-three-requests policy would **narrow** a statutory right if it
denied a fourth lawful cancellation. Do not ship that as a silent gate.
