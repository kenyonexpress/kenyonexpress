# W38 Contract terms

Code-agent spec. Partner briefing is product copy, not a PDF generator in v1.

---

## What it builds

1. Hebrew terms the owner accepts at approve: coupon prepaid, no escrow, no payout, cash at till, scan rules, 14-day customer law is the platform's vs the shop's (counsel).
2. Store the accept timestamp on `supplier_leads` / `suppliers` (human migration if column missing).
3. Do not put a global 10% in the contract.

---

## Tables

`suppliers`, `supplier_leads`, `audit_log`.

---

## RLS

Admin writes accept. Partner SELECT own row.

---

## Money invariants

Contract must match `commission.ts`. If copy disagrees, copy is wrong.

---

## Tests before close

Grep contract MDX/strings for נאמנות, 10%, escrow. Approve requires checkbox.

---

## Feature flag

None.

---

## Docs updated

`SUPPLIER-FAQ.md`, `ADMIN-HANDBOOK.md`, `DECISION-LOG.md` D3 coupon 100/0.

---

## Edge cases

Physical residual mentioned as accounting, not a wire promise.

---

## Hebrew UX strings

| Key | Copy |
|---|---|
| Checkbox | קראתי. אין נאמנות. עמלת הפלטפורמה נקבעת לכל מוצר. |
| Coupon | התשלום באתר שייך לפלטפורמה. |

---

## Open questions

| Q | Best answer |
|---|---|
| Lawyer-stamped PDF? | Human/counsel. This wave is in-product checkbox + copy. |

---

## Second pass (copy = money)

- Checkbox: קראתי. אין נאמנות. עמלת הפלטפורמה נקבעת לכל מוצר.
- Coupon: on-site payment is platform. Remainder at till. Matches W07 / W25 / W26.
- Do not mention `default_split_percent` as a rate.
- Legal pages H10 before DNS (`business/LAUNCH-BLOCKERS.md`).

