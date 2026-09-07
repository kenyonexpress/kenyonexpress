# W31 Partial redemption

Code-agent spec. A voucher is atomic: issued or redeemed. There is **no** partial consume of one code. "Partial" means **some units of a multi-qty line** redeemed.

---

## What it builds

1. UI: 2 of 3 redeemed. Order item not fulfilled until last unit.
2. Till cannot take "half a meal" on one QR.
3. Refund planner already refunds remaining `issued` vouchers only.

---

## Tables

`vouchers.status`, `order_items` fulfilment.

---

## RLS

Unchanged.

---

## Money invariants

Forbidden: store a remaining_agorot on a coupon voucher and let the till decrement with float. If a future product needs value-off vouchers, that is a new type + CHECK, not a silent column.

---

## Tests before close

Atomic redeem. Mark line redeemed only when zero issued remain. Partial refund of remaining issued units.

---

## Feature flag

None. Do not add `FF_PARTIAL_QR`.

---

## Docs updated

`VOUCHER-STATE-MACHINE.md`. Explicitly forbid remaining-balance coupons.

---

## Edge cases

Offline batch: mixed success/already_redeemed in one drain is OK. Do not abort the rest (`offline-scan`).

---

## Hebrew UX strings

| Key | Copy |
|---|---|
| Partial line | מומשו 2 מתוך 3 |
| Atomic refuse | אי אפשר לממש חלק מהקופון |

---

## Open questions

| Q | Best answer |
|---|---|
| Value-off coupon? | **Not in v1.** Absolute meal deal, one scan, done. |
