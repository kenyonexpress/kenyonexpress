# W25 Payouts

Code-agent spec. Coupon model owes suppliers **0**. Physical residual is accounting. `admin/payouts.ts` hits missing `payout_statements` (types-ahead). Do not apply a payout schema to fix a 500.

---

## What it builds

1. Hide or stub payout UI with honest Hebrew.
2. Settlement view from **snapshots** (`supplier_immediate_agorot`).
3. CSV of snapshots. No escrow language.

---

## Tables

`order_items`, `settlement_events`. Not `payout_statements`. `escrow_holds` fossil: do not display.

---

## RLS

Supplier SELECT own paid orders. No money UPDATE.

---

## Money invariants

Coupon 100% platform of on-site. Physical fee then residual by subtraction. No global rate. `default_split_percent` not used at settlement.

---

## Tests before close

`no-escrow-in-supplier-due.test.ts`, `settlement-balance.test.ts`. Page does not query missing relations (`isMissingRelation`).

---

## Feature flag

None. Stub is the off state.

---

## Docs updated

`ROLE-VENDOR.md`, `LEDGER.md`, `SUPPLIER-FAQ.md`, `MIGRATION-PLAYBOOK.md`.

---

## Edge cases

Physical clawback on refund via `supplierDebits` (payout adjustment, not a live table).

---

## Hebrew UX strings

| Key | Copy |
|---|---|
| Stub | אין תשלומים מהפלטפורמה על קופונים. היתרה נגבית במעמד המימוש. |
| Physical due | יתרת ספק (חשבונאות, לא העברה אוטומטית) |

---

## Open questions

| Q | Best answer |
|---|---|
| Build payout_statements? | **Only after a product decision that reverses coupon 100/0.** Not to silence 42P01. |
