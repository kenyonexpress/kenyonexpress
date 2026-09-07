# W37 Supplier analytics

Code-agent spec. Partner sees own redemptions and paid lines. Admin analytics is separate (`/admin/analytics`). Server events may still be 0 until 169.

---

## What it builds

1. Counts of scans / issued remaining for **this** `supplier_id`.
2. No GMV that joins live `platform_percent`.
3. No other shops. No customer PII beyond what fulfilment needs (architecture: minimize).

---

## Tables

`voucher_redemptions`, `order_items` snapshots, `vouchers`. Not `payment_webhook_events`.

---

## RLS

`is_supplier_member`. Issued inventory dump forbidden (existing supplier-redemptions tests).

---

## Money invariants

Integer agorot. Coupon GMV for the shop is **cash at till** (face − prepaid), which the platform does not collect. Do not show that as "platform payable".

---

## Tests before close

`supplier-redemptions.test.ts`, `supplier-tenant-scope.test.ts`. Cross-shop 42501.

---

## Feature flag

None.

---

## Docs updated

`SUPPLIER-FAQ.md`, `ROLE-VENDOR.md`.

---

## Edge cases

Admin "0 sales" vs shop's local scan count can disagree until 169. Teach operators both numbers.

---

## Hebrew UX strings

| Key | Copy |
|---|---|
| Scans | מימושים |
| Issued | ממתין למימוש |
| Cash at till | לגבייה במעמד המימוש |

---

## Open questions

| Q | Best answer |
|---|---|
| Real-time dashboard? | Cron/admin reports 170 if applied. Do not add a parallel table. |

---

## Second pass (not GMV vanity)

- Partner "due" on coupons is 0. Cash at till is not a platform journal.
- Physical residual is snapshot, not live `platform_percent`.
- 170 reports must not join live products. Duplicate 170 is indexes, full filename.
- Analytics 169 zeros do not mean zero sales. Read `orders`.

