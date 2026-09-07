# W30 Multi voucher

Code-agent spec. Finalize already issues **one voucher per purchased unit**, keyed on `order_item_id`, capped at quantity. Qty 3 → 3 codes.

---

## What it builds

1. Account UI lists every code, not one per order.
2. Scan one unit at a time. Batch redeem exists for the till (`redeem-batch`) with per-code outcomes.
3. Partial order fulfilment: line follows last unit (`mark-order-item-redeemed`).

---

## Tables

`vouchers`, `order_items.quantity`, `voucher_redemptions`.

---

## RLS

Customer SELECT own. Supplier sees redemptions after scan, not the unissued pool of other shops.

---

## Money invariants

Do not split `coupon_price_ils` across codes with float. Each unit is `couponPriceUnit` agorot. Cashback snapshot is per line then credited once per order at finalize.

---

## Tests before close

`issue.test.ts` cap on `order_item_id`. Batch per-code. Line not fulfilled while a unit is issued.

---

## Feature flag

None.

---

## Docs updated

`VOUCHER-STATE-MACHINE.md`, `REDEMPTION` flow.

---

## Edge cases

Refund: any unit left `issued` vs any unit redeemed. Card refund illegal if any unit left issued? Planner: refunds only issued vouchers; redeemed blocks **card** refund of consumed value.

---

## Hebrew UX strings

| Key | Copy |
|---|---|
| N codes | יש לך N קופונים בהזמנה זו |
| One left | נותר קופון אחד למימוש |

---

## Open questions

| Q | Best answer |
|---|---|
| One QR for the whole qty? | **No.** One code per unit. Already the issuer rule. |

---

## Second pass (qty)

- Qty 3 → three `issued` rows, cap on `order_item_id` (`issue.test.ts`).
- Scan one unit at a time. Refund of one issued unit is partial, never CancelOnly.
- Mixed coupon+physical: two product types, still one order. Cashback on `customerPaysNow` of the order, at finalize.

